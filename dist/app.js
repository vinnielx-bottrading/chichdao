import {api,config,hero,upload,removeMedia,signIn,signInPassword,signOut,supabase,configured,sendFeedback} from './api.js';
import {applyTheme} from './themes.js';
import {occupations,bodyTypes,lifestyles,trainingStyles,photoValidationError} from './model.js';
import {preparePhoto,fmtSize} from './album.js';
import {regionOptions} from './regions.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=s=>{try{const u=new URL(s,location.href);return ['https:','http:'].includes(u.protocol)?esc(u.href):'';}catch{return '';}};
const paths={discover:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5z"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',messages:'<path d="M21 11.5a8 8 0 0 1-12 7L3 21l2-6a8 8 0 1 1 16-3.5Z"/>',profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/>',settings:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/>',pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',sliders:'<path d="M4 6h16M4 12h16M4 18h16"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>'};
const icon=n=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[n]||paths.discover}</svg>`;
const intents=['Mối quan hệ nghiêm túc','Hẹn hò thoải mái','Trò chuyện rồi tìm hiểu'],training=trainingStyles;
const defaults=()=>({city:'',occupation:'all',intent:'all',bodyType:'all',training:'all',lifestyle:'all',minAge:18,maxAge:80,query:'',radius:0});
let samples=[],filters=defaults(),filterOpen=false,route='discover',me=null,session=null,items=[],contacts=[],blocked=[],chatId='',heroData=null,toastTimer,searchTimer,requestId=0,renderId=0,authRunning=false,lastAuthToken='',busy=false,gallery=[],galleryIndex=0;
const cache=new Map();
let pendingRoute='',installPrompt=null,chatFile=null,chatMessages=[],booting=false,uploads=[],teasers=null,bannerHidden=false;
let chatEph=0;
// Live chat: open conversations poll every 4 s; the inbox (unread badges + new-message notices) every 10 s.
const msgSig=l=>(l||[]).map(m=>`${m.id}:${m.viewedAt||''}:${m.media?.length||0}:${m.expired?1:0}`).join('|');
let inbox={unread:0,threads:[]},inboxSeen={},inboxFirst=true,chatSig='';
function options(arr,current,all){return (all?`<option value="all">${esc(all)}</option>`:'')+arr.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(v)}</option>`).join('');}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),5500);}
function modal(title,body){$('#modal-content').innerHTML=`<div class="modal-inner"><div class="modal-header"><h2>${esc(title)}</h2><button class="close-button" data-action="close" aria-label="Đóng">×</button></div><div class="info-content">${body}</div></div>`;if(!$('#modal').open)$('#modal').showModal();}
function empty(title,body){return `<div class="empty">${icon('discover')}<h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;}
function photo(p){return p.photos?.find(x=>x.kind==='image')?.src||'';}
function thumbOf(p){const m=p.photos?.find(x=>x.kind==='image');return m?.thumb||m?.src||'';}
const IMG_FALLBACK=`onerror="this.onerror=null;this.classList.add('img-failed');this.removeAttribute('src')"`;
function avatar(p,cls=''){return photo(p)?`<img class="${cls}" src="${safeURL(cls==='large'?photo(p):thumbOf(p))}" alt="${esc(p.name)}" referrerpolicy="no-referrer">`:`<span class="avatar-letter ${cls}">${esc(p?.name?.[0]||'B')}</span>`;}
function nav(){updateInstall();document.querySelectorAll('.session-only').forEach(el=>el.hidden=!session);const mini=$('.user-mini b');if(mini)mini.textContent=me?.name||'Hồ sơ của bạn';const links=[['discover','discover','Khám phá'],['liked','heart','Kết nối'],['messages','messages','Tin nhắn'],['profile','profile','Hồ sơ của tôi'],['settings','settings','Riêng tư']];if(me?.admin)links.push(['admin','settings','Quản trị']);const html=links.map(([id,i,t])=>`<button class="nav-button ${route===id?'active':''}" data-nav="${id}" ${route===id?'aria-current="page"':''}>${icon(i)}<span class="nav-label">${t}</span>${id==='messages'&&inbox.unread?`<span class="nav-badge" aria-label="${inbox.unread} tin chưa đọc">${inbox.unread>99?'99+':inbox.unread}</span>`:''}</button>`).join('');$('#nav').innerHTML=html;$('#mobile-nav').innerHTML=html;document.querySelectorAll('.user-mini .avatar-letter,.top-profile .avatar-letter').forEach(el=>el.innerHTML=photo(me||{})?`<img src="${safeURL(thumbOf(me))}" alt="Ảnh đại diện của bạn">`:esc(me?.name?.[0]||'B'));}
function go(next){if(next==='admin'){location.href='admin.html';return;}if(!session){showAuth();return;}if(location.hash===`#${next}`){route=next;render();}else location.hash=next;window.scrollTo({top:0,behavior:'instant'});}
function card(p){cache.set(p.id,p);return `<article class="profile-card"><div class="card-image" data-open="${p.id}" role="button" tabindex="0" aria-label="Xem hồ sơ ${esc(p.name)}"><img src="${safeURL(thumbOf(p))}" alt="${esc(p.name)}" loading="lazy" decoding="async" ${IMG_FALLBACK}><span class="photo-count">▧ ${p.photos?.length||0}</span><button class="like-button ${me?.likes?.includes(p.id)?'liked':''}" data-like="${p.id}" aria-label="Thích ${esc(p.name)}" aria-pressed="${!!me?.likes?.includes(p.id)}">${icon('heart')}</button><div class="card-title"><h3>${esc(p.name)}<span>, ${p.age}</span></h3><p>${icon('pin')}${esc(p.distance||p.city)}</p></div></div><div class="card-body"><div class="job">${esc(p.occupation||'Một người cùng gu')}<span>·</span><span class="training-label">${esc(p.bodyType)}</span></div><div class="tags">${[p.training,p.lifestyle].filter(Boolean).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="card-footer"><span>${esc(p.intent)}</span><div class="card-actions"><button class="act-fire" data-tease="${p.id}" aria-label="Thả thính ${esc(p.name)}" title="Thả thính">🔥</button><button class="act-chat" data-dock="${p.id}" aria-label="Nhắn tin với ${esc(p.name)}" title="Nhắn tin">${icon('messages')}</button></div></div></div></article>`;}
// Illustration profiles: always labelled, no like/fire/chat, open an info sheet instead of a real profile.
const sampleMap=new Map();
function sampleCard(p){sampleMap.set(p.id,p);const img=thumbOf(p);return `<article class="profile-card sample-card"><div class="card-image" data-sample="${p.id}" role="button" tabindex="0" aria-label="Hồ sơ minh họa ${esc(p.name)}">${img?`<img src="${safeURL(img)}" alt="Ảnh minh họa" loading="lazy" decoding="async" ${IMG_FALLBACK}>`:`<div class="sample-ph">${esc(p.name?.[0]||'C')}</div>`}<span class="sample-label">MINH HỌA</span><div class="card-title"><h3>${esc(p.name)}<span>, ${p.age}</span></h3><p>${icon('pin')}${esc(p.city)}</p></div></div><div class="card-body"><div class="job">${esc(p.occupation||'Một người cùng gu')}<span>·</span><span class="training-label">${esc(p.bodyType)}</span></div><div class="tags">${[p.training,p.lifestyle].filter(Boolean).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="card-footer"><span>${esc(p.intent)}</span><span class="sample-note">Hồ sơ minh họa · không nhắn tin được</span></div></div></article>`;}
function sampleDetails(id){const p=sampleMap.get(id);if(!p)return;const m=p.photos?.[0];modal(`${p.name}, ${p.age}`,`<div class="sample-notice"><b>Hồ sơ minh họa</b> do CHI.CH DAO. tạo để bạn hình dung một hồ sơ trông như thế nào. Đây không phải người dùng thật nên không nhắn tin, thả thính hay thích được.</div>${m?`<img class="sample-photo" src="${safeURL(m.src)}" alt="Ảnh minh họa">`:''}<div class="self-preview-top"><div><p>${esc(p.city)}</p><p>${esc(p.occupation)}</p></div></div><div class="tags">${[p.bodyType,p.lifestyle,p.training,p.intent].filter(Boolean).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>${p.bio?`<p class="bio">${esc(p.bio)}</p>`:''}<div class="action-row"><button class="button primary" data-nav="profile">Tạo hồ sơ thật của bạn ↗</button></div>`);}
function discovery(){return `<section class="hero"><img class="hero-photo" ${heroData?.src?`src="${safeURL(heroData.src)}"`:'hidden'} alt="${esc(heroData?.alt||'Sức hút từ cuộc sống đời thường')}"><div class="hero-copy"><span class="eyebrow">SỨC HÚT KHÔNG CHỈ Ở PHÒNG GYM</span><h1>Cùng gu hình thể.<br><em>Hợp gu hẹn hò.</em></h1><p>Từ phòng tập đến những nhịp sống đời thường.<br>Tìm người bạn thấy thu hút, theo cách của riêng mình.</p><button class="button primary" data-action="explore">Tìm người cùng tần số ${icon('arrow')}</button></div><div class="hero-label">RẮN RỎI. CHÂN THÀNH. CÙNG GU.</div></section><section id="discover-section"><div class="heading-row"><div><h2>Gu của bạn, nhiều hơn một kiểu.</h2><p>Nghề nghiệp và vóc dáng là hai lựa chọn riêng biệt.</p></div><div class="search">${icon('search')}<input id="query" type="search" placeholder="Tên, nghề, sở thích…" value="${esc(filters.query)}" aria-label="Tìm hồ sơ theo tên nghề nghiệp hoặc sở thích"></div></div><div class="nearby-panel"><div><b>Người cùng gu ở gần</b><p>Chia sẻ vị trí khi bạn muốn. Chỉ hiển thị khoảng cách gần đúng.</p></div><button class="button secondary" data-action="nearby">${me?.nearbyEnabled?'Cập nhật vị trí':'Bật tìm ở gần'}</button><select id="radius-filter" aria-label="Khoảng cách"><option value="0">Mọi khoảng cách</option>${[5,10,25,50,100].map(n=>`<option value="${n}" ${filters.radius===n?'selected':''}>Trong ${n} km</option>`).join('')}</select></div><div class="filters"><div class="filter-select filter-input">${icon('pin')}<input id="city-filter" list="region-list" value="${esc(filters.city)}" placeholder="Khu vực (Hà Nội, Bangkok…)" aria-label="Lọc khu vực, gõ tên tỉnh, thành phố hoặc quốc gia" autocomplete="off"></div><div class="filter-select"><select id="occupation-filter" data-filter="occupation" aria-label="Lọc nghề nghiệp">${options(occupations,filters.occupation,'Tất cả nghề nghiệp')}</select></div><div class="filter-select"><select id="intent-filter" aria-label="Lọc mục đích kết nối">${options(intents,filters.intent,'Mong muốn kết nối')}</select></div><button class="filter-button" data-action="toggle-filters" aria-expanded="${filterOpen}" aria-controls="advanced-filters">${icon('sliders')}Lọc thêm</button><button class="filter-reset" data-action="reset-filters">Đặt lại</button></div><div class="filter-detail advanced-filters" id="advanced-filters" ${filterOpen?'':'hidden'}><div class="range-heading"><span>Độ tuổi mong muốn</span><strong id="age-value">${filters.minAge}–${filters.maxAge} tuổi</strong></div><div class="age-fields"><label for="min-age-filter">Từ<input id="min-age-filter" type="range" min="18" max="80" value="${filters.minAge}"></label><label for="age-filter">Đến<input id="age-filter" type="range" min="18" max="80" value="${filters.maxAge}"></label></div><div class="advanced-selects"><div class="field"><label for="training-filter">Cách vận động</label><select id="training-filter" data-filter="training">${options(training,filters.training,'Không giới hạn')}</select></div><div class="field"><label for="lifestyle-filter">Lối sống</label><select id="lifestyle-filter" data-filter="lifestyle">${options(lifestyles,filters.lifestyle,'Không giới hạn')}</select></div></div></div><div class="filter-label">VÓC DÁNG BẠN THÍCH <span>Thông tin do người dùng tự mô tả</span></div><div class="interest-tabs" aria-label="Vóc dáng">${['all',...bodyTypes].map(t=>`<button class="chip ${filters.bodyType===t?'active':''}" data-body="${t}" aria-pressed="${filters.bodyType===t}">${t==='all'?'Tất cả vóc dáng':t}</button>`).join('')}</div><div id="active-filters" class="active-filters"></div><div class="discovery-summary"><span id="results-count" class="results-label" role="status" aria-live="polite"></span><span>Không cần tập gym để có sức hút riêng.</span></div><div id="profile-results" class="profile-grid"></div><button class="button secondary" data-action="more" id="load-more" hidden style="margin-top:24px">Xem thêm</button></section><div class="tip-banner">${icon('settings')}<div><h3>Sức hút bắt đầu từ sự tôn trọng.</h3><p>Hỏi trước khi chia sẻ ảnh riêng tư. Tôn trọng ranh giới và lựa chọn của nhau.</p></div><button class="text-button" data-action="safety">Tìm hiểu thêm ↗</button></div>`;}
async function results(append=false){
 const rid=++requestId;if(!$('#profile-results'))return;
 if(!session){$('#profile-results').innerHTML=empty('Một kết nối mới bắt đầu từ đây.','Đăng nhập để gặp những người cùng gu.');$('#results-count').textContent='Khám phá cộng đồng';return;}
 if(!append)$('#profile-results').innerHTML=empty('Đang tìm người cùng gu…','');
 try{const [found,sm]=await Promise.all([api('discover',{...filters,offset:append?items.length:0}),append?Promise.resolve(samples):api('samples',{...filters,offset:0}).catch(()=>[])]);if(rid!==requestId||!$('#profile-results'))return;items=append?[...items,...found]:found;samples=Array.isArray(sm)?sm:[];
 $('#profile-results').innerHTML=items.length||samples.length?items.map(card).join('')+samples.map(sampleCard).join(''):empty('Chưa tìm thấy người phù hợp.','Thử mở rộng khoảng cách hoặc bỏ bớt điều kiện lọc.');$('#results-count').textContent=`${items.length} hồ sơ`+(samples.length?` · ${samples.length} hồ sơ minh họa`:'');$('#load-more').hidden=found.length<48||items.length>=528;$('#load-more').textContent=`Xem thêm hồ sơ (đang hiện ${items.length})`;
 const active=Object.entries(filters).filter(([k,v])=>['city','occupation','intent','training','lifestyle','bodyType'].includes(k)&&v&&v!=='all');$('#active-filters').innerHTML=active.map(([k,v])=>`<button class="active-filter" data-clear-filter="${k}">${esc(v)} ×</button>`).join('');
 }catch(e){if(rid!==requestId||!$('#profile-results'))return;$('#profile-results').innerHTML=empty('Chưa tải được hồ sơ.',e.message);$('#results-count').textContent='';}
}
function field(label,name,value,type='text',extra=''){return `<div class="field"><label for="my-${name}">${label}</label><input id="my-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;}
function selectField(label,name,arr,value,optional=false){return `<div class="field"><label for="my-${name}">${label}</label><select id="my-${name}" name="${name}">${optional?'<option value="">Chưa chia sẻ</option>':`<option value="" disabled ${value?'':'selected'}>Chọn một mục</option>`}${options(arr,value)}</select></div>`;}
function profilePage(){if(!me)return empty('Đang mở hồ sơ…','');return `<div class="section-head"><h1>Hồ sơ của tôi</h1><p>Một chút về hình thể. Nhiều hơn về con người bạn.</p></div><section class="profile-editor"><div class="profile-intro">${avatar(me,'large')}<div><h2>${esc(me.name||'Tên của bạn')}</h2><p>${me.complete?'Hồ sơ đã hoàn thiện':'Thêm thông tin để mọi người biết bạn'}</p></div></div><form id="profile-form"><div class="form-grid">${field('Tên hiển thị','name',me.name,'text','required minlength="2" maxlength="40"')}${field('Tuổi · từ 18 trở lên','age',me.age||'','number','required min="18" max="80" step="1"')}<div class="field"><label for="my-city">Khu vực · tỉnh/thành, thành phố hoặc quốc gia</label><input id="my-city" name="city" list="region-list" value="${esc(me.city)}" maxlength="80" required placeholder="VD: Hà Nội · Bangkok, Thái Lan · Sydney, Úc" autocomplete="off"></div>${selectField('Mong muốn kết nối','intent',intents,me.intent)}${selectField('Nghề nghiệp (tùy chọn)','occupation',occupations,me.occupation,true)}${selectField('Vóc dáng tự mô tả (tùy chọn)','bodyType',bodyTypes,me.bodyType,true)}${selectField('Lối sống (tùy chọn)','lifestyle',lifestyles,me.lifestyle,true)}${selectField('Cách vận động (tùy chọn)','training',training,me.training,true)}<div class="field full"><label for="my-bio">Một chút về bạn</label><textarea id="my-bio" name="bio" required minlength="20" maxlength="400" placeholder="Những điều bạn thích, một buổi hẹn lý tưởng…">${esc(me.bio)}</textarea><p class="fine-print">20–400 ký tự. Hãy giữ địa chỉ nhà và số điện thoại cho riêng mình.</p></div></div><div class="form-actions"><button class="button primary">Lưu hồ sơ ↗</button></div></form></section><section class="album-manager">${albumManager()}</section>`;}
function mediaElement(m,controls=false){return m.kind==='video'?`<video src="${safeURL(m.src)}" ${controls?'controls':''} preload="metadata" playsinline aria-label="${esc(m.caption||'Video của thành viên')}"></video>`:`<img src="${safeURL(controls?m.src:(m.thumb||m.src))}" alt="${esc(m.caption||'Ảnh của thành viên')}" loading="lazy" decoding="async">`;}
function albumManager(){const list=me.photos||[],count=list.filter(x=>x.kind==='image').length,videos=list.length-count;return `<div class="heading-row"><div><span class="eyebrow">MỘT GÓC ĐỜI THƯỜNG</span><h2>Ảnh & video của tôi</h2><p>${count}/10 ảnh · ${videos}/2 video</p></div><button class="button secondary" data-action="preview-self">Xem hồ sơ ↗</button></div><div class="own-photo-grid">${list.map(m=>`<article class="own-photo"><button class="own-photo-view" data-gallery-owner="self" data-media="${m.id}">${mediaElement(m)}${m.src===photo(me)?'<span class="cover-badge">Ảnh đại diện</span>':''}</button><form data-caption-form="${m.id}"><label for="caption-${m.id}">Chú thích</label><input id="caption-${m.id}" name="caption" maxlength="120" value="${esc(m.caption)}"><button class="text-button">Lưu chú thích</button></form><div class="photo-actions">${m.kind==='image'?`<button data-cover="${m.id}">Đặt đại diện</button>`:''}<button data-delete="${m.id}">Xóa</button></div></article>`).join('')}${uploads.map(uploadTile).join('')}<button class="upload-tile" data-action="upload" ${busy?'disabled':''}><span>＋</span><b>${busy?'Đang tải lên…':'Thêm ảnh hoặc video'}</b><small>${busy?'Vui lòng giữ trang mở':'10 ảnh · 2 video'}</small></button></div><input id="media-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm" multiple hidden><p class="fine-print" style="margin-top:18px">Ảnh gốc tối đa 30 MB, app tự nén còn vài trăm KB mà vẫn nét. Video tối đa 20 MB (gợi ý: quay 720p để tải nhanh). Chỉ đăng nội dung của bạn hoặc nội dung bạn có quyền sử dụng. Ảnh đại diện phải là ảnh của bạn.</p>`;}
function uploadTile(u){return `<article class="own-photo uploading" id="up-${u.key}"><div class="up-thumb">${u.preview?(u.video?`<video src="${u.preview}" muted playsinline></video>`:`<img src="${u.preview}" alt="">`):''}<div class="up-overlay"><b class="up-label">${esc(u.label)}</b><div class="up-bar"><i style="width:${Math.round(u.pct*100)}%"></i></div><small class="up-pct">${u.state==='error'?esc(u.error):u.state==='done'?'Xong ✓':Math.round(u.pct*100)+'%'}</small></div></div><p class="up-name">${esc(u.name)}</p></article>`;}
function paintUpload(u){const el=document.getElementById('up-'+u.key);if(!el)return;el.classList.toggle('failed',u.state==='error');el.classList.toggle('done',u.state==='done');el.querySelector('.up-label').textContent=u.label;el.querySelector('.up-bar i').style.width=Math.round(u.pct*100)+'%';el.querySelector('.up-pct').textContent=u.state==='error'?u.error:u.state==='done'?'Xong ✓':Math.round(u.pct*100)+'%';}
function settings(){return `<div class="section-head"><h1>Riêng tư theo cách của bạn.</h1><p>Bạn chọn chia sẻ bao nhiêu và kết nối với ai.</p></div><div class="settings-grid"><section class="settings-panel"><h2>Tin nhắn</h2><div class="setting-row"><div><label for="popup-setting">Tự bật khung chat khi có tin mới (máy tính)</label><p>Mỗi người nhắn đến mở một khung chat ở góc phải, kể cả khi bạn đang xem trang khác. Trên điện thoại, tin mới hiện số đỏ ở mục Tin nhắn.</p></div><input id="popup-setting" type="checkbox" class="switch" ${prefs.popup?'checked':''}></div><div class="setting-row"><div><label for="sound-setting">Âm báo tin nhắn</label><p>Một tiếng "ting" nhỏ khi có tin mới.</p></div><input id="sound-setting" type="checkbox" class="switch" ${prefs.sound?'checked':''}></div><div class="setting-row"><div><b>Thông báo trên máy</b><p>${!('Notification' in window)?'Trình duyệt này không hỗ trợ thông báo.':Notification.permission==='granted'?'Đang bật — bạn nhận thông báo khi đang mở cửa sổ/ứng dụng khác.':Notification.permission==='denied'?'Đang chặn. Mở cài đặt trang của trình duyệt để cho phép.':'Hiện thông báo của hệ điều hành khi bạn đang làm việc khác.'}</p></div>${('Notification' in window)&&Notification.permission==='default'?'<button class="button secondary" data-action="notify-on">Bật</button>':''}</div></section><section class="settings-panel"><h2>Hiển thị hồ sơ</h2><div class="setting-row"><div><label for="visible-setting">Cho phép người khác tìm thấy bạn</label><p>Ẩn hồ sơ cũng tạm ẩn ảnh và quyền bắt đầu trò chuyện.</p></div><input id="visible-setting" type="checkbox" class="switch" ${me?.visible?'checked':''}></div></section><section class="settings-panel"><h2>Vị trí của bạn</h2><p>${me?.nearbyEnabled?'Đang bật tìm người ở gần.':'Chưa chia sẻ vị trí.'} Vị trí tự hết hạn sau 24 giờ; không hiển thị tọa độ hoặc ghim chính xác.</p><button class="button secondary" data-action="location-off" style="margin-top:16px">Tắt và xóa vị trí</button></section><section class="settings-panel"><h2>Hồ sơ đã chặn</h2>${blocked.length?blocked.map(p=>`<div class="blocked-row"><span>${esc(p.name)}</span><button class="text-button" data-unblock="${p.id}">Bỏ chặn</button></div>`).join(''):'<p>Bạn chưa chặn ai.</p>'}</section><section class="settings-panel"><h2>Tài khoản</h2><p>Đăng xuất khi dùng chung thiết bị để bảo vệ tài khoản.</p><button class="button secondary" data-action="logout" style="margin-top:16px">Đăng xuất</button></section></div>`;}
async function render(){const rid=++renderId;++requestId;nav();if(route!=='discover'&&!session){if(!booting)showAuth();pendingRoute=route;route='discover';}$('#page').innerHTML=route==='discover'?discovery():route==='profile'?profilePage():route==='settings'?settings():empty('Đang tải…','');
 try{
 if(route==='discover')await results();
 if(route==='liked'){const data=await api('liked');if(rid!==renderId)return;$('#page').innerHTML=`<div class="section-head"><h1>Kết nối của bạn</h1><p>Những người khiến bạn muốn tìm hiểu thêm.</p></div><div class="profile-grid">${data.length?data.map(card).join(''):empty('Chưa có lượt thích.','Ghé Khám phá và lưu người bạn muốn làm quen.')}</div>`;}
 if(route==='settings'){blocked=await api('blocked');if(rid===renderId)$('#page').innerHTML=settings();}
 if(route==='messages'){contacts=await api('contacts');if(rid!==renderId)return;contacts.forEach(p=>cache.set(p.id,p));if(!contacts.some(p=>p.id===chatId))chatId=contacts[0]?.id||'';$('#page').innerHTML=`<div class="section-head"><h1>Một câu chuyện mới.</h1><p>Bắt đầu bằng một câu hỏi chân thành.</p></div>${contacts.length?`<div class="message-layout ${isMobile()?'list-only':''}"><aside class="conversation-list"><h2>KẾT NỐI CỦA BẠN</h2><div id="conv-items">${convItems()}</div></aside>${isMobile()?'':'<section class="chat" id="chat-panel"></section>'}</div>`:empty('Chưa có cuộc trò chuyện.','Gửi một lời chào từ hồ sơ bạn muốn tìm hiểu.')}`;await loadChat();pollInbox();}
 }catch(e){if(rid===renderId)toast(e.message);}
}
const shortTime=d=>{if(!d)return '';const t=new Date(d),n=new Date();return t.toDateString()===n.toDateString()?t.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):t.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'});};
function convItems(){const mob=isMobile();return contacts.map(p=>{const th=inbox.threads.find(t=>t.id===p.id),n=th?.count||0,active=!mob&&p.id===chatId,prev=th?.preview||p.preview;return `<button class="conversation ${active?'active':''} ${n&&!active?'unread':''}" data-chat="${p.id}">${avatar(p)}<span class="conv-text"><b>${esc(p.name)}</b><small>${prev?`${p.lastMine&&!th?'Bạn: ':''}${esc(prev)}`:esc(p.city)}</small></span><span class="conv-meta"><small>${shortTime(th?.lastAt||p.lastAt)}</small>${n&&!active?`<i class="conv-badge">${n}</i>`:''}</span></button>`;}).join('');}
async function loadChat(quiet=false){const id=chatId;if(!id||!$('#chat-panel'))return;const p=cache.get(id),messages=await api('messages',{id});if(chatId!==id||!$('#chat-panel'))return;chatMessages=messages;
 // Quiet refresh: only repaint the message list (keeps what the user is typing), and only when something changed.
 if(quiet&&$('#chat-panel').dataset.chat===id&&$('#chat-log')){const sig=msgSig(messages);if(sig===chatSig)return;chatSig=sig;if(inbox.unread)setTimeout(pollInbox,0);const log=$('#chat-log'),atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<80;log.innerHTML=messages.map(m=>bubble(m,m.sender_id===me.id,'data-chat-media')).join('');if(atBottom)log.scrollTop=log.scrollHeight;return;}
 chatSig=msgSig(messages);$('#chat-panel').dataset.chat=id;
 $('#chat-panel').innerHTML=`<div class="chat-head">${avatar(p)}<div><b>${esc(p.name)}</b><small>${esc(p.city)}</small></div><button class="button fire-button small" data-tease="${id}" title="Thả thính">🔥</button><button class="text-button" data-open="${id}">Hồ sơ ↗</button></div><div class="chat-log" id="chat-log" role="log">${messages.map(m=>bubble(m,m.sender_id===me.id,'data-chat-media')).join('')}</div>
 <form class="chat-compose" id="message-form"><label class="attach-button" for="chat-file" title="Gửi ảnh hoặc video" aria-label="Đính kèm ảnh hoặc video"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6"/></svg></label><input id="chat-file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm" hidden><input name="text" maxlength="1000" placeholder="Một lời chào, một kết nối mới…" aria-label="Tin nhắn"><button class="button primary">Gửi ↗</button></form><div id="chat-attach" class="chat-attach" hidden></div><button class="text-button" data-action="refresh-chat">Làm mới cuộc trò chuyện</button>`;
 paintAttach();$('#chat-log').scrollTop=$('#chat-log').scrollHeight;}
function ephSelect(id,val){return `<label class="eph-select">⏱ Tự hủy <select id="${id}">${EPH.map(([s,l])=>`<option value="${s}" ${Number(val)===s?'selected':''}>${l}</option>`).join('')}</select></label>`;}
function paintAttach(){const box=$('#chat-attach');if(!box)return;box.hidden=!chatFile;if(chatFile)box.innerHTML=`<span>${chatFile.type.startsWith('video/')?'🎬':'🖼'} ${esc(chatFile.name)} · ${(chatFile.size/1048576).toFixed(1)} MB</span>${ephSelect('chat-eph',chatEph)}<button type="button" class="text-button" data-action="clear-attach">Bỏ</button>${chatEph?'<small class="eph-note">Người nhận vẫn có thể chụp màn hình.</small>':''}`;}
async function details(id){const p=id==='self'?me:await api('profile',{id});cache.set(p.id,p);const list=p.photos||[];modal(`${p.name}, ${p.age||''}`,`<div class="self-preview-top">${avatar(p)}<div><p>${esc(p.city)}</p><p>${esc(p.occupation)}</p></div></div><div class="tags">${[p.bodyType,p.lifestyle,p.training,p.intent].filter(Boolean).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><p class="bio">${esc(p.bio)}</p><h3>Ảnh & video của ${esc(p.name)}</h3><div class="album-thumbnails">${list.map(m=>`<button data-gallery-owner="${id}" data-media="${m.id}">${mediaElement(m)}<span>${esc(m.caption||'Một góc đời thường')}</span></button>`).join('')}</div>${id!=='self'?`<div class="action-row"><button class="button primary" data-dock="${p.id}">Nhắn tin ↗</button><button class="button fire-button" data-tease="${p.id}">🔥 Thả thính</button><button class="button secondary" data-like="${p.id}">${me.likes.includes(p.id)?'Bỏ thích':'Thích'}</button></div><div class="detail-controls"><button data-report="${p.id}">Báo cáo</button><button data-block="${p.id}">Chặn hồ sơ</button></div>`:''}`);}
function showGallery(owner,id){gallery=(owner==='self'?me:cache.get(owner))?.photos||[];galleryIndex=Math.max(0,gallery.findIndex(m=>m.id===id));paintGallery();if(gallery.length&&!$('#lightbox').open)$('#lightbox').showModal();}
function paintGallery(){if(!gallery.length)return;galleryIndex=(galleryIndex+gallery.length)%gallery.length;const m=gallery[galleryIndex];$('#lightbox-content').innerHTML=`<div class="lightbox-top"><b>${galleryIndex+1} / ${gallery.length}</b><button class="close-button" data-action="close-gallery" aria-label="Đóng">×</button></div><div class="lightbox-stage"><button class="photo-arrow previous" data-step="-1" aria-label="Ảnh trước">‹</button>${mediaElement(m,true)}<button class="photo-arrow next" data-step="1" aria-label="Ảnh tiếp">›</button></div><p class="lightbox-caption">${m.ephExp?`⏱ Tự hủy sau <b data-exp="${esc(m.ephExp)}">…</b>`:esc(m.caption)}</p>`;}
function authStep(){} // kept for older call sites; the sign-in page has a single step now
// ---------- Signed-out page: login on the left, admin-managed photos on the right ----------
let slideTimer=0,slideIndex=0;
// Last known sign-in photos, so the admin's images show instantly on the next visit (no placeholder flash).
try{const c=JSON.parse(localStorage.getItem('chich.hero')||'null');if(c&&typeof c==='object')heroData=c;}catch{}
function slideSources(){const d=heroData||{};const ids=Array.isArray(d.slides)?d.slides:[];const base=config.apiUrl;const list=ids.length&&base?ids.map(id=>`${base}/hero/${encodeURIComponent(id)}`):[];return d.loginMode==='single'?list.slice(0,1):list;}
function paintSlides(){const box=$('#auth-slides');if(!box)return;const list=slideSources();clearInterval(slideTimer);slideIndex=0;
 box.innerHTML=list.map((src,i)=>`<img src="${safeURL(src)}" alt="" class="${i===0?'active':''}" ${i?'loading="lazy"':''} onerror="this.remove()">`).join('');
 $('#auth-dots').innerHTML=list.length>1?list.map((_,i)=>`<button type="button" class="${i===0?'on':''}" data-slide="${i}" aria-label="Ảnh ${i+1}"></button>`).join(''):'';
 if(list.length>1)slideTimer=setInterval(()=>showSlide(slideIndex+1),Math.max(3,Number(heroData?.loginInterval)||6)*1000);}
function showSlide(i){const imgs=[...document.querySelectorAll('#auth-slides img')];if(!imgs.length)return;slideIndex=(i+imgs.length)%imgs.length;imgs.forEach((im,k)=>im.classList.toggle('active',k===slideIndex));document.querySelectorAll('#auth-dots button').forEach((d,k)=>d.classList.toggle('on',k===slideIndex));}
function hideAuth(){clearInterval(slideTimer);$('#auth-screen').hidden=true;document.body.classList.remove('signed-out');}
function showAuth(){endBoot();const scr=$('#auth-screen');if(scr.hidden){scr.hidden=false;document.body.classList.add('signed-out');closeDock();if($('#modal').open)$('#modal').close();paintSlides();window.scrollTo(0,0);}if(!configured)$('#login-status').textContent='Đăng nhập sẽ mở khi dịch vụ sẵn sàng.';}
function endBoot(){booting=false;document.body.classList.remove('booting');}
// Gentle, non-blocking reminder: a banner above the page instead of a popup.
function reminder(){const b=$('#profile-banner');if(!b)return;if(!session||!me||me.complete||bannerHidden){b.hidden=true;return;}const list=[[me.name?.trim().length>=2,'Tên'],[me.age>=18,'Tuổi'],[me.city,'Khu vực'],[me.intent,'Mong muốn'],[me.bio?.trim().length>=20,'Giới thiệu'],[photo(me),'1 ảnh']];const doneN=list.filter(x=>x[0]).length;
 b.innerHTML=`<div class="pb-text"><b>Hồ sơ hoàn thiện ${doneN}/${list.length}</b><span>Còn thiếu: ${list.filter(x=>!x[0]).map(x=>x[1]).join(', ')}. Hoàn thiện để xuất hiện trong Khám phá và nhắn tin.</span></div><div class="pb-bar"><i style="width:${Math.round(doneN/list.length*100)}%"></i></div><div class="pb-actions">${route==='profile'?'':'<button class="button primary" data-action="complete-profile">Hoàn thiện ngay</button>'}<button class="pb-close" data-action="remind-later" aria-label="Ẩn nhắc nhở">×</button></div>`;b.hidden=false;}
async function refreshMe(){me=await api('me');nav();reminder();}
async function authenticated(event,newSession){
 if(!newSession){session=null;me=null;cache.clear();items=[];samples=[];contacts=[];inbox={unread:0,threads:[]};inboxSeen={};inboxFirst=true;document.title=baseTitle();clearInterval(titleFlash);titleFlash=0;closeDock();$('#modal').close();$('#lightbox').close();route='discover';reminder();render();showAuth();lastAuthToken='';return;}
 session=newSession;if(authRunning)return;if(lastAuthToken===newSession.access_token)return;
 authRunning=true;try{me=await api(event==='TOKEN_REFRESHED'?'me':'session',{event});nav();let accepted=false;try{accepted=sessionStorage.getItem('chich.adult.pending')==='yes';}catch{}if(accepted){await api('accept_adult');sessionStorage.removeItem('chich.adult.pending');await refreshMe();}if(standalone())await recordInstalled();endBoot();hideAuth();if(pendingRoute){route=pendingRoute;pendingRoute='';}await render();reminder();lastAuthToken=newSession.access_token;pollInbox();}catch(e){
  // Do not retry automatically for the same session (prevents the login popup from looping); offer retry / switch account instead.
  lastAuthToken=newSession.access_token;me=null;
  const msg=/Unknown action|Unauthenticated|Không thể xử lý yêu cầu/.test(e.message)?'Máy chủ chưa sẵn sàng (database chưa cập nhật). Vui lòng thử lại sau.':e.message;
  endBoot();showAuth();
  $('#login-status').innerHTML=`${esc(msg)}<br><button type="button" class="text-button" id="auth-retry">Thử lại</button> · <button type="button" class="text-button" id="auth-switch">Đăng xuất / đổi tài khoản Google</button>`;
  $('#auth-retry').onclick=()=>{lastAuthToken='';$('#login-status').textContent='Đang thử lại…';authenticated('RETRY',session);};
  $('#auth-switch').onclick=async()=>{try{await signOut();}catch{}$('#login-status').textContent='Đã đăng xuất. Bấm "Tiếp tục với Google" để chọn tài khoản khác.';};
 }finally{authRunning=false;}
}
async function nearby(){if(!navigator.geolocation)throw new Error('Trình duyệt không hỗ trợ vị trí.');modal('Tìm người ở gần',`<p>Cho phép truy cập vị trí để tìm những người cùng gu quanh bạn. Vị trí được làm tròn trước khi lưu; người khác chỉ thấy khoảng cách gần đúng. Thông tin tự hết hạn sau 24 giờ.</p><p>Bạn có thể tắt và xóa vị trí trong mục Riêng tư bất cứ lúc nào.</p><button class="button primary" data-action="allow-location">Cho phép và tìm quanh đây</button>`);}
async function locate(){const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,()=>reject(new Error('Chưa lấy được vị trí. Hãy kiểm tra quyền vị trí của trình duyệt.')),{enableHighAccuracy:false,timeout:15000,maximumAge:300000}));await api('location',{lat:position.coords.latitude,lon:position.coords.longitude});await refreshMe();filters.radius=25;$('#modal').close();go('discover');toast('Đã bật tìm người trong khoảng 25 km.');}
async function addMedia(files){if(!files.length||busy)return;const images=files.filter(f=>f.type.startsWith('image/')),videos=files.filter(f=>f.type.startsWith('video/'));if(images.length+(me.photos||[]).filter(x=>x.kind==='image').length>10||videos.length+(me.photos||[]).filter(x=>x.kind==='video').length>2)throw new Error('Mỗi hồ sơ tối đa 10 ảnh và 2 video.');for(const f of videos)if(!['video/mp4','video/webm'].includes(f.type)||f.size>20*1024*1024)throw new Error('Video phải là MP4/WebM, tối đa 20 MB.');
 busy=true;uploads=files.map((f,i)=>({key:Date.now()+'-'+i,file:f,name:f.name,video:f.type.startsWith('video/'),preview:URL.createObjectURL(f),pct:0,state:'wait',label:'Đang chờ…'}));
 if(route==='profile')render();let done=0,failed=0;
 for(const u of uploads){try{
   let blob=u.file,thumb=null;
   if(!u.video){u.label='Đang nén ảnh…';paintUpload(u);const pr=await preparePhoto(u.file);blob=pr.blob;thumb=pr.thumb;u.name=`${fmtSize(u.file.size)} → ${fmtSize(blob.size)}`;const nm=document.querySelector(`#up-${u.key} .up-name`);if(nm)nm.textContent=u.name;}
   u.label='Đang tải lên…';u.state='up';paintUpload(u);
   await upload(blob,'profile',pct=>{u.pct=pct;paintUpload(u);},thumb);
   u.pct=1;u.state='done';u.label='Đã lưu';paintUpload(u);done++;
  }catch(e){u.state='error';u.error=e.message;u.label='Lỗi';paintUpload(u);failed++;}}
 toast(failed?`Đã tải ${done}/${uploads.length} file. ${failed} file lỗi.`:`Đã tải lên ${done} ảnh/video.`);
 setTimeout(()=>{uploads.forEach(u=>URL.revokeObjectURL(u.preview));uploads=[];},failed?6000:900);
 busy=false;await refreshMe();setTimeout(()=>{if(route==='profile')render();},failed?6000:900);}
document.addEventListener('click',async event=>{
 const el=event.target.closest('button,[data-open],[data-sample]');if(!el)return;
 try{
 if(el.dataset.nav){$('#modal').close();go(el.dataset.nav);return;}
 if(el.dataset.open){await details(el.dataset.open);return;}
 if(el.dataset.sample){sampleDetails(el.dataset.sample);return;}
 if(el.dataset.galleryOwner){showGallery(el.dataset.galleryOwner,el.dataset.media);return;}
 if(el.dataset.step){galleryIndex+=Number(el.dataset.step);paintGallery();return;}
 if(el.dataset.body){filters.bodyType=el.dataset.body;render();return;}
 if(el.dataset.clearFilter){filters[el.dataset.clearFilter]=defaults()[el.dataset.clearFilter];render();return;}
 if(el.dataset.like){const id=el.dataset.like;await api('like',{id,liked:!me.likes.includes(id)});await refreshMe();await render();toast('Đã cập nhật lượt thích.');if($('#modal').open)await details(id);return;}
 if(el.dataset.intro){modal('Một lời chào, một kết nối mới',`<form id="intro-form" data-id="${el.dataset.intro}"><label for="intro-text">Bạn muốn mở lời thế nào?</label><textarea id="intro-text" name="text" required maxlength="1000" placeholder="Chào bạn, mình thấy chúng ta cùng thích…"></textarea><button class="button primary" style="margin-top:18px">Gửi lời mở đầu ↗</button></form>`);return;}
 if(el.dataset.report){modal('Báo cáo hồ sơ',`<form id="report-form" data-id="${el.dataset.report}"><div class="field"><label for="report-reason">Lý do</label><select name="reason" id="report-reason">${options(['Giả mạo danh tính','Quấy rối hoặc ép buộc','Nghi ngờ chưa đủ 18 tuổi','Spam hoặc chào bán','Lý do khác'],'')}</select></div><div class="field"><label for="report-note">Mô tả thêm</label><textarea name="note" id="report-note" maxlength="500"></textarea></div><button class="button primary" style="margin-top:18px">Gửi báo cáo</button></form>`);return;}
 if(el.dataset.block){modal('Chặn hồ sơ này?',`<p>Hai bạn sẽ không thể tìm thấy nhau hoặc gửi tin nhắn cho nhau.</p><button class="button danger" data-confirm-block="${el.dataset.block}">Chặn hồ sơ</button>`);return;}
 if(el.dataset.confirmBlock){await api('block',{id:el.dataset.confirmBlock});$('#modal').close();cache.delete(el.dataset.confirmBlock);await refreshMe();await render();toast('Đã chặn hồ sơ.');return;}
 if(el.dataset.unblock){await api('unblock',{id:el.dataset.unblock});await render();return;}
 if(el.dataset.chat){chatId=el.dataset.chat;if(isMobile()){await openDock(chatId);$('#conv-items')&&($('#conv-items').innerHTML=convItems());return;}await render();return;}
 if(el.dataset.cover){await api('edit_media',{id:el.dataset.cover,cover:true});await refreshMe();await render();return;}
 if(el.dataset.delete){modal('Xóa ảnh/video?',`<p>File này sẽ được gỡ khỏi hồ sơ và kho lưu trữ.</p><button class="button danger" data-confirm-delete="${el.dataset.delete}">Xóa file</button>`);return;}
 if(el.dataset.confirmDelete){await removeMedia(el.dataset.confirmDelete);$('#modal').close();await refreshMe();await render();return;}
 if(el.dataset.resolve){await api('admin_resolve',{id:el.dataset.resolve,suspend:false});await render();return;}
 if(el.dataset.suspendReport){modal('Tạm khóa tài khoản?',`<p>Tài khoản bị báo cáo sẽ không thể sử dụng dịch vụ. Bạn có thể khôi phục trong cơ sở dữ liệu quản trị.</p><button class="button danger" data-confirm-suspend="${el.dataset.suspendReport}">Tạm khóa tài khoản</button>`);return;}
 if(el.dataset.confirmSuspend){await api('admin_resolve',{id:el.dataset.confirmSuspend,suspend:true});$('#modal').close();await render();return;}
 if(el.dataset.slide){clearInterval(slideTimer);showSlide(Number(el.dataset.slide));return;}
 if(el.dataset.eph){el.disabled=true;try{const w=winOf(el);await openEphemeral(el.dataset.eph,w?w.messages:chatMessages);if(w)await loadWin(w.id);else await loadChat();}finally{el.disabled=false;}return;}
 if(el.dataset.tease){await openDock(el.dataset.tease,{tease:true});return;}
 if(el.dataset.dock){await openDock(el.dataset.dock);return;}
 if(el.dataset.teaser){await sendTease(el.dataset.teaser,el);return;}
 if(el.dataset.winFocus){focusWin(el.dataset.winFocus);return;}
 if(el.dataset.dockMedia){const msg=(winOf(el)?.messages||[]).find(x=>x.id===el.dataset.dockMedia),m=msg?.media?.[0];if(m){gallery=[{...m,ephExp:msg.ephemeral?msg.expiresAt:undefined}];galleryIndex=0;paintGallery();if(!$('#lightbox').open)$('#lightbox').showModal();}return;}
 if(el.dataset.chatMedia){const msg=chatMessages.find(x=>x.id===el.dataset.chatMedia),m=msg?.media?.[0];if(m){gallery=[{...m,ephExp:msg.ephemeral?msg.expiresAt:undefined}];galleryIndex=0;paintGallery();if(!$('#lightbox').open)$('#lightbox').showModal();}return;}
 const action=el.dataset.action;
 if(action==='clear-attach'){chatFile=null;paintAttach();return;}
 if(action==='dock-close'){const w=winOf(el);if(w)closeWin(w.id);return;}
 if(action==='win-min'){event.stopPropagation();const w=winOf(el);if(w)toggleMin(w.id);return;}
 if(action==='win-toggle'){const w=winOf(el);if(w&&w.min&&!isMobile())toggleMin(w.id);return;}
 if(action==='notify-on'){await enableNotifications();return;}
 if(action==='notify-later'){notifyAsk.dismissed=true;el.closest('.notify-ask')?.remove();return;}
 if(action==='dock-tray'){const w=winOf(el);if(!w)return;w.tray=!w.tray;const n=winNode(w.id);n.querySelector('.dock-tray').hidden=!w.tray;el.classList.toggle('on',w.tray);if(w.tray)await paintTray(n);return;}
 if(action==='dock-clear-attach'){const w=winOf(el);if(w){w.file=null;paintDockAttach(w);}return;}
 if(action==='feedback'){openFeedback();return;}
 if(action==='feedback-close'){closeFeedback();return;}
 if(action==='close')$('#modal').close();
 if(action==='close-gallery'){$('#lightbox').close();$('#lightbox-content').innerHTML='';}
 if(action==='complete-profile'){go('profile');}
 if(action==='remind-later'){bannerHidden=true;reminder();}
 if(action==='preview-self')await details('self');
 if(action==='upload')$('#media-input').click();
 if(action==='explore'){if(!session)showAuth();else{$('#discover-section').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});$('#query').focus({preventScroll:true});}}
 if(action==='toggle-filters'){filterOpen=!filterOpen;$('#advanced-filters').hidden=!filterOpen;el.setAttribute('aria-expanded',filterOpen);}
 if(action==='reset-filters'){filters=defaults();render();}
 if(action==='more')await results(true);
 if(action==='nearby')await nearby();
 if(action==='allow-location'){el.disabled=true;try{await locate();}finally{el.disabled=false;}}
 if(action==='location-off'){await api('location_off');filters.radius=0;await refreshMe();await render();toast('Đã tắt và xóa vị trí.');}
 if(action==='refresh-chat')await loadChat();
 if(action==='install')await installApp();
 if(action==='ios-installed'){$('#modal').close();await recordInstalled();toast('Cảm ơn bạn! Mở CHI.CH DAO. từ biểu tượng trên màn hình chính nhé.');}
 if(action==='logout'){try{await api('logout');}catch{}await signOut();}
 if(action==='about')modal('CHI.CH DAO.',`<p>Cùng gu hình thể. Hợp gu hẹn hò.</p><p>Không gian hẹn hò nam–nam 18+ dành cho những người yêu sức hút khỏe khoắn — từ phòng tập đến những nhịp sống đời thường.</p><p>Nghề nghiệp và vóc dáng do mỗi người tự mô tả. Điều quan trọng là sự chân thành, tôn trọng và đồng thuận.</p>`);
 if(action==='privacy-info')modal('Quyền riêng tư',`<p>Hồ sơ, kết nối và tin nhắn được lưu để phục vụ việc làm quen. Ảnh và video trong hồ sơ có thể được xem bởi thành viên đăng nhập khi bạn bật hiển thị hồ sơ.</p><p>Đăng nhập Google chỉ dùng để xác thực tài khoản. Tên và ảnh Google không được tự động đưa vào hồ sơ hẹn hò.</p><p>Vị trí chỉ được lấy khi bạn cho phép, được làm tròn trước khi lưu và hết hạn sau 24 giờ. Người khác chỉ thấy nhóm khoảng cách, không thấy tọa độ hay ghim chính xác. Bạn có thể tắt và xóa vị trí trong mục Riêng tư.</p><p>Bạn có thể sửa hồ sơ, xóa từng ảnh/video, ẩn hồ sơ và chặn người khác. Tránh đưa số điện thoại, địa chỉ nhà hoặc lịch sinh hoạt chính xác vào hồ sơ.</p><p>Để bảo vệ cộng đồng và xử lý báo cáo, quản trị viên có thể truy cập hồ sơ, ảnh/video, tin nhắn và nhật ký hoạt động của tài khoản (thời điểm đăng nhập/đăng xuất, thiết bị, quốc gia/thành phố ước tính theo địa chỉ mạng). Mọi lượt truy cập của quản trị viên đều được ghi lại.</p><p>Phiên đăng nhập được lưu trên trình duyệt. Hãy đăng xuất khi dùng thiết bị chung.</p>`);
 if(action==='safety')modal('Sức hút bắt đầu từ sự tôn trọng',`<h3>18+ và đồng thuận</h3><p>Chỉ dành cho người từ 18 tuổi. Không quấy rối, ép buộc, miệt thị ngoại hình hoặc đăng ảnh người khác khi chưa được phép.</p><h3>Hồ sơ chân thật</h3><p>Sử dụng ảnh của bạn. Không giả mạo danh tính, spam hoặc dùng hẹn hò để ép mua dịch vụ.</p><h3>Chủ động bảo vệ mình</h3><p>Hỏi trước khi chia sẻ nội dung riêng tư. Ưu tiên địa điểm công cộng khi gặp lần đầu; không chuyển tiền chỉ vì lời hứa hẹn.</p><h3>Báo cáo và chặn</h3><p>Bạn có thể gửi báo cáo ở trang hồ sơ hoặc chặn người khiến bạn không thoải mái.</p>`);
 }catch(e){toast(e.message);}
});
document.addEventListener('input',e=>{
 if(e.target.id==='city-filter'){filters.city=e.target.value.trim().slice(0,80);clearTimeout(searchTimer);searchTimer=setTimeout(()=>results(),500);}
 if(e.target.id==='query'){filters.query=e.target.value.slice(0,100);clearTimeout(searchTimer);searchTimer=setTimeout(()=>results(),600);}
 if(['age-filter','min-age-filter'].includes(e.target.id)){if(e.target.id==='min-age-filter'){filters.minAge=Number(e.target.value);filters.maxAge=Math.max(filters.maxAge,filters.minAge);$('#age-filter').value=filters.maxAge;}else{filters.maxAge=Number(e.target.value);filters.minAge=Math.min(filters.minAge,filters.maxAge);$('#min-age-filter').value=filters.minAge;}$('#age-value').textContent=`${filters.minAge}–${filters.maxAge} tuổi`;clearTimeout(searchTimer);searchTimer=setTimeout(()=>results(),500);}
 if(e.target.id==='hero-image'){const file=e.target.files?.[0];if(file){const preview=$('.admin-hero-preview');if(preview.dataset.blob)URL.revokeObjectURL(preview.dataset.blob);preview.dataset.blob=URL.createObjectURL(file);preview.src=preview.dataset.blob;}}
});
document.addEventListener('change',async e=>{try{
  if(e.target.id==='intent-filter'){filters.intent=e.target.value;await results();}
 if(e.target.dataset.filter){filters[e.target.dataset.filter]=e.target.value;await results();}
 if(e.target.id==='radius-filter'){filters.radius=Number(e.target.value);if(filters.radius&&!me?.nearbyEnabled){await nearby();return;}await results();}
 if(e.target.id==='popup-setting'||e.target.id==='sound-setting'){try{localStorage.setItem(e.target.id==='popup-setting'?'chich.chat.popup':'chich.chat.sound',e.target.checked?'on':'off');}catch{}toast(e.target.checked?'Đã bật.':'Đã tắt.');if(e.target.id==='sound-setting'&&e.target.checked)ping();return;}
 if(e.target.id==='visible-setting'){try{await api('visibility',{visible:e.target.checked});await refreshMe();toast('Đã cập nhật quyền hiển thị.');}catch(error){e.target.checked=!!me?.visible;throw error;}}
 if(e.target.id==='chat-file'){const f=e.target.files?.[0];e.target.value='';if(f){if(f.type.startsWith('video/')){if(!['video/mp4','video/webm'].includes(f.type)||f.size>20*1024*1024)throw new Error('Video phải là MP4/WebM, tối đa 20 MB.');}else{const err=photoValidationError(f);if(err)throw new Error(err);}chatFile=f;paintAttach();}}
 if(e.target.classList.contains('dock-eph')){const w=winOf(e.target);if(w){w.eph=Number(e.target.value)||0;paintDockAttach(w);}return;}
 if(e.target.id==='chat-eph'){chatEph=Number(e.target.value)||0;paintAttach();return;}
 if(e.target.classList.contains('dock-file')){const f=e.target.files?.[0];e.target.value='';const w=winOf(e.target);if(f&&w){validateChatFile(f);w.file=f;paintDockAttach(w);}}
 if(e.target.id==='media-input'){const files=[...e.target.files];e.target.value='';await addMedia(files);}
 }catch(error){toast(error.message);}});
document.addEventListener('submit',async e=>{
 if(e.target.classList.contains('dock-form')){e.preventDefault();const f=e.target,w=winOf(f);if(!w)return;const b=f.querySelector('.dock-send'),text=f.text.value.trim(),file=w.file,id=w.id;if(!text&&!file){toast('Nhập tin nhắn hoặc chọn ảnh/video.');return;}if(b.disabled)return;b.disabled=true;
  try{await sendChat(id,text,file,(label,p)=>paintDockAttach(w,`<span>${label} ${Math.round(p*100)}%</span><span class="mini-bar"><i style="width:${Math.round(p*100)}%"></i></span>`),w.eph);f.text.value='';w.file=null;w.eph=0;paintDockAttach(w);await loadWin(id);}catch(err){toast(err.message);paintDockAttach(w);}finally{b.disabled=false;f.text.focus();}return;}
 if(!['profile-form','message-form','intro-form','report-form','hero-form'].includes(e.target.id)&&!e.target.dataset.captionForm)return;
 e.preventDefault();const form=e.target,data=Object.fromEntries(new FormData(form));const button=form.querySelector('button[type="submit"],button');if(button?.disabled)return;if(button)button.disabled=true;
 try{
 if(form.id==='profile-form'){data.age=Number(data.age);data.city=(data.city||'').trim();if(!data.city||!data.intent)throw new Error('Nhập khu vực và chọn mong muốn kết nối.');await api('profile_save',data);await refreshMe();await render();toast(me.complete?'Đã lưu hồ sơ. Bạn đã sẵn sàng kết nối.':'Đã lưu. Hãy thêm ít nhất một ảnh để hoàn thiện hồ sơ.');}
 if(form.id==='intro-form'||form.id==='message-form'){const id=form.id==='intro-form'?form.dataset.id:chatId,text=(data.text||'').trim(),file=form.id==='message-form'?chatFile:null;
  if(!text&&!file)throw new Error('Nhập tin nhắn hoặc chọn ảnh/video.');
  await sendChat(id,text,file,(label,p)=>{if(button)button.textContent=`${Math.round(p*100)}%`;const box=$('#chat-attach');if(box)box.innerHTML=`<span>${label} ${Math.round(p*100)}%</span><span class="mini-bar"><i style="width:${Math.round(p*100)}%"></i></span>`;},form.id==='message-form'?chatEph:0);if(file){chatFile=null;chatEph=0;}
  if(form.id==='intro-form'){$('#modal').close();chatId=id;go('messages');toast('Đã gửi lời mở đầu.');}else await loadChat();}
 if(form.id==='report-form'){await api('report',{id:form.dataset.id,...data});$('#modal').close();toast('Đã gửi báo cáo để quản trị viên xem xét.');}
 if(form.dataset.captionForm){await api('edit_media',{id:form.dataset.captionForm,caption:data.caption});await refreshMe();toast('Đã lưu chú thích.');}
 if(form.id==='hero-form'){const prepared=await preparePhoto(data.image);const id=await upload(prepared.blob,'hero');await api('admin_hero',{id,alt:data.alt});heroData=await hero();await render();toast('Đã thay ảnh hero trên trang chủ.');}
 }catch(error){toast(error.message);}finally{if(button){button.disabled=false;if(form.id==='message-form'&&button.isConnected)button.textContent='Gửi ↗';}}
});
function confirmAdult(){if(!$('#age-check').checked){$('#login-status').textContent='Vui lòng xác nhận bạn từ 18 tuổi trước khi đăng nhập.';$('.auth-check').classList.add('shake');setTimeout(()=>$('.auth-check').classList.remove('shake'),500);$('#age-check').focus();return false;}try{sessionStorage.setItem('chich.adult.pending','yes');}catch{}return true;}
$('#age-check').addEventListener('change',e=>{if(e.target.checked)$('#login-status').textContent='';});
$('#underage').addEventListener('click',()=>{$('#age-check').checked=false;$('#age-note').textContent='Trang chỉ dành cho người từ 18 tuổi. Vui lòng đóng trang nếu bạn chưa đủ tuổi.';});
$('#email-login').addEventListener('submit',async e=>{e.preventDefault();if(!confirmAdult())return;const f=e.target,b=f.querySelector('button');b.disabled=true;$('#login-status').textContent='';try{await signInPassword(f.email.value,f.password.value);}catch(err){$('#login-status').textContent=err.message;}finally{b.disabled=false;}});
$('#google-login').addEventListener('click',async()=>{if(!confirmAdult())return;const b=$('#google-login');b.disabled=true;try{await signIn();}catch(e){$('#login-status').textContent=e.message;b.disabled=false;}});
$('#lightbox').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){galleryIndex+=e.key==='ArrowRight'?1:-1;paintGallery();}});
$('#lightbox').addEventListener('close',()=>$('#lightbox-content').innerHTML='');
document.addEventListener('keydown',e=>{if(e.target.matches('[data-open]')&&['Enter',' '].includes(e.key)){e.preventDefault();details(e.target.dataset.open).catch(e=>toast(e.message));}else if(e.target.matches('[data-sample]')&&['Enter',' '].includes(e.key)){e.preventDefault();sampleDetails(e.target.dataset.sample);}});
window.addEventListener('hashchange',()=>{if(location.hash==='#admin'){location.href='admin.html';return;}route=['discover','liked','messages','profile','settings','admin'].includes(location.hash.slice(1))?location.hash.slice(1):'discover';render();});
window.addEventListener('online',()=>{if(session)render();});
// ---------- Floating chat dock: 💬 nhắn tin, 🔥 thả thính (câu do admin soạn) ----------
const ACCEPT_MEDIA='image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm';
const fmtTime=d=>new Date(d).toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'});
async function ensureProfile(id){let p=cache.get(id);if(!p){p=await api('profile',{id});cache.set(id,p);}return p;}
async function loadTeasers(){if(!teasers)teasers=await api('teasers');return teasers;}
const EPH=[[0,'Không'],[60,'1 phút'],[300,'5 phút'],[600,'10 phút'],[3600,'1 giờ']];
const ephLabel=s=>(EPH.find(x=>x[0]===Number(s))||[0,`${Math.round(s/60)} phút`])[1];
function mediaTag(a,attr,id,eph){return `<button class="chat-media ${eph?'eph-media':''}" ${attr}="${id}" aria-label="Xem ${a.kind==='video'?'video':'ảnh'}">${a.kind==='video'?`<video src="${safeURL(a.src)}" preload="metadata" playsinline muted ${eph?'controlslist="nodownload"':''}></video><span class="play-badge">▶</span>`:`<img src="${safeURL(eph?a.src:(a.thumb||a.src))}" alt="Ảnh trong tin nhắn" loading="lazy" decoding="async" draggable="false">`}</button>`;}
function bubble(m,mine,mediaAttr){const a=m.media?.[0],eph=Number(m.ephemeral)||0;let media='';
 if(eph){
  if(m.expired)media=`<span class="eph-chip gone">⏱ Ảnh/video tự hủy · đã hủy</span>`;
  else if(mine)media=`<span class="eph-chip">⏱ Ảnh/video tự hủy ${ephLabel(eph)} · ${m.viewedAt?'đã xem':'chưa xem'}</span>`;
  else if(a?.src)media=`${mediaTag(a,mediaAttr,m.id,true)}<span class="eph-chip live">⏱ Tự hủy sau <b data-exp="${esc(m.expiresAt)}">…</b></span>`;
  else media=`<button class="eph-open" data-eph="${m.id}"><span aria-hidden="true">👁</span><span><b>Bấm để xem ${'ảnh/video'}</b><small>Tự hủy sau ${ephLabel(eph)} kể từ lúc mở</small></span></button>`;
 }else if(a?.src)media=mediaTag(a,mediaAttr,m.id,false);else if(a)media='<span class="fine-print">Ảnh/video không còn khả dụng</span>';else if(m.kind!=='tease'&&!m.body)media='<span class="fine-print">Ảnh/video không còn khả dụng</span>';
 return `<div class="bubble ${mine?'me':''} ${m.kind==='tease'?'tease':''} ${eph?'eph':''}" data-msg="${m.id}">${media}${m.body?`<span class="bubble-text">${m.kind==='tease'?'<i class="tease-flame" aria-hidden="true">🔥</i>':''}${esc(m.body)}</span>`:''}<small>${fmtTime(m.created_at)}</small></div>`;}
// Countdown for opened self-destructing media; hides it locally the moment time is up (the server already refuses it).
setInterval(()=>{
 document.querySelectorAll('[data-exp]').forEach(el=>{const left=Math.round((new Date(el.dataset.exp)-Date.now())/1000);if(isNaN(left))return;
  if(left>0){el.textContent=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;return;}
  if(el.closest('#lightbox')){el.textContent='0:00';return;}
  const b=el.closest('.bubble');b?.querySelector('.chat-media')?.remove();const chip=el.closest('.eph-chip');if(chip)chip.outerHTML='<span class="eph-chip gone">⏱ Ảnh/video tự hủy · đã hủy</span>';});
 if($('#lightbox').open&&gallery[0]?.ephExp&&new Date(gallery[0].ephExp)<=Date.now()){gallery=[];$('#lightbox').close();toast('Ảnh/video đã tự hủy.');}
},1000);
async function openEphemeral(id,list){const m=await api('open_ephemeral',{id});const k=list.findIndex(x=>x.id===id);if(k>=0)list[k]=m;const a=m.media?.[0];if(a){gallery=[{...a,ephExp:m.expiresAt,caption:`Tự hủy sau ${ephLabel(m.ephemeral)} kể từ lúc mở`}];galleryIndex=0;paintGallery();if(!$('#lightbox').open)$('#lightbox').showModal();}return m;}
// ---------- Chat windows (kiểu Messenger): nhiều cuộc trò chuyện cùng lúc ----------
// Desktop: tối đa 3 khung cạnh nhau ở góc phải dưới, khung thừa thu thành bong bóng avatar; mỗi khung thu nhỏ được.
// Mobile: 1 khung dạng bottom sheet + hàng avatar để chuyển nhanh; thu nhỏ thành bong bóng nổi có số tin chưa đọc.
const wins=new Map();let winOrder=[],sheetOpen=true;
const isMobile=()=>matchMedia('(max-width:900px)').matches;
const maxOpen=()=>isMobile()?1:Math.max(1,Math.min(3,Math.floor((innerWidth-110)/352)));
const prefs={get popup(){try{return localStorage.getItem('chich.chat.popup')!=='off';}catch{return true;}},get sound(){try{return localStorage.getItem('chich.chat.sound')!=='off';}catch{return true;}}};
function winOf(el){const w=el?.closest?.('.dock-win');return w?wins.get(w.dataset.win):null;}
function winNode(id){return [...document.querySelectorAll('.dock-win')].find(n=>n.dataset.win===id)||null;}
// Which windows are on screen right now (open, not minimised, within the visible slots).
function shownIds(){const list=winOrder.filter(id=>!wins.get(id).min||!isMobile());if(isMobile())return sheetOpen&&winOrder[0]?[winOrder[0]]:[];return winOrder.slice(0,maxOpen());}
function isReading(id){return (!document.hidden&&shownIds().includes(id)&&!wins.get(id)?.min)||(route==='messages'&&chatId===id&&!document.hidden);}
async function openDock(id,{tease=false,incoming=false}={}){
 if(!session){showAuth();return;}
 if(!incoming&&!me?.complete){toast('Hoàn thiện hồ sơ (kèm ít nhất 1 ảnh) để nhắn tin và thả thính.');go('profile');return;}
 if(!incoming&&$('#modal').open)$('#modal').close();
 await ensureProfile(id);
 let w=wins.get(id);
 if(!w){w={id,messages:[],file:null,tray:false,eph:0,min:false,unread:0,sig:''};wins.set(id,w);}
 if(incoming){
  // A new message: bring the conversation up without stealing what the user is doing.
  const focused=winOf(document.activeElement)?.id;
  if(isMobile()){
   // Phone: never swap the conversation the user is looking at; otherwise pop the sheet up.
   if(sheetOpen&&winOrder[0]&&winOrder[0]!==id){if(!winOrder.includes(id))winOrder.push(id);}
   else{winOrder=[id,...winOrder.filter(x=>x!==id)];sheetOpen=true;}
  }else if(!shownIds().includes(id)){
   winOrder=[id,...winOrder.filter(x=>x!==id)];
   // keep the window being typed in on screen
   if(focused&&focused!==id&&!winOrder.slice(0,maxOpen()).includes(focused))winOrder=[id,focused,...winOrder.filter(x=>x!==id&&x!==focused)];
  }
 }else{if(isMobile()){for(const k of [...wins.keys()])if(k!==id)wins.delete(k);winOrder=[id];}else winOrder=[id,...winOrder.filter(x=>x!==id)];w.min=false;sheetOpen=true;if(tease)w.tray=true;}
 paintDocks();
 const node=winNode(id);
 if(node&&!incoming){if(w.tray)paintTray(node);node.querySelector('input[name=text]')?.focus({preventScroll:true});}
 if(isReading(id))await loadWin(id);else w.unread=Math.max(w.unread,1),paintHeads();
}
function closeWin(id){wins.delete(id);winOrder=winOrder.filter(x=>x!==id);paintDocks();if(route==='messages'&&$('#conv-items'))api('contacts').then(c=>{contacts=c;c.forEach(p=>cache.set(p.id,p));if($('#conv-items'))$('#conv-items').innerHTML=convItems();}).catch(()=>{});}
function closeDock(){wins.clear();winOrder=[];paintDocks();}
function winHTML(w,open=false,first=true){const p=cache.get(w.id)||{name:'…'};const others=[];const mob=isMobile();
 return `<section class="chat-dock dock-win ${w.min?'min':''} ${open?'open':''}" data-win="${w.id}" aria-label="Trò chuyện với ${esc(p.name)}">
 <header class="dock-head" data-action="win-toggle">${mob?'<button class="dock-icon dock-back" data-action="dock-close" aria-label="Quay lại danh sách">‹</button>':''}${avatar(p)}<div class="dock-who"><b>${esc(p.name)}</b><small>${esc(p.distance||p.city||'')}</small></div><button class="dock-icon" data-open="${w.id}" title="Xem hồ sơ" aria-label="Xem hồ sơ">↗</button>${mob?'':'<button class="dock-icon" data-action="win-min" aria-label="Thu nhỏ" title="Thu nhỏ">–</button><button class="dock-icon" data-action="dock-close" aria-label="Đóng khung chat" title="Đóng">×</button>'}</header>
 ${others.length?`<div class="dock-switch" aria-label="Các cuộc trò chuyện khác">${others.map(x=>{const q=cache.get(x)||{},u=wins.get(x)?.unread;return `<button class="switch-head" data-win-focus="${x}" title="${esc(q.name||'')}">${avatar(q)}${u?`<i>${u}</i>`:''}</button>`;}).join('')}</div>`:''}
 ${first?notifyAsk():''}
 <div class="dock-log" role="log" aria-live="polite">${w.messages.length?w.messages.map(m=>bubble(m,m.sender_id===me.id,'data-dock-media')).join(''):'<p class="dock-empty">Đang tải…</p>'}</div>
 <div class="dock-tray" ${w.tray?'':'hidden'}><div class="tray-head"><b>🔥 Thả thính nhanh</b><small>Chạm một câu để gửi ngay</small></div><div class="tray-list"><span class="fine-print">Đang tải…</span></div></div>
 <div class="dock-attach" hidden></div>
 <form class="dock-compose dock-form"><button type="button" class="dock-fire ${w.tray?'on':''}" data-action="dock-tray" aria-label="Mở câu thả thính" title="Thả thính">🔥</button><label class="dock-icon" title="Gửi ảnh hoặc video" aria-label="Đính kèm ảnh hoặc video">📎<input class="dock-file" type="file" accept="${ACCEPT_MEDIA}" hidden></label><input name="text" maxlength="1000" placeholder="Nhắn cho ${esc(p.name)}…" autocomplete="off" aria-label="Tin nhắn"><button class="dock-send" aria-label="Gửi">➤</button></form></section>`;}
// Re-render windows while keeping each window's typed text, focus and scroll position.
function paintDocks(){const root=$('#chat-dock');if(!root)return;const shown=shownIds();
 const keep={};document.querySelectorAll('.dock-win').forEach(n=>{const i=n.querySelector('input[name=text]'),l=n.querySelector('.dock-log');keep[n.dataset.win]={text:i?.value||'',focus:document.activeElement===i,scroll:l?l.scrollHeight-l.scrollTop-l.clientHeight:0};});
 root.innerHTML=`<div class="dock-heads" aria-label="Cuộc trò chuyện đang mở"></div>${shown.map((id,i)=>winHTML(wins.get(id),!!keep[id],i===0)).join('')}`;
 shown.forEach(id=>{const n=winNode(id),k=keep[id],w=wins.get(id);if(!n)return;requestAnimationFrame(()=>n.classList.add('open'));const l=n.querySelector('.dock-log');l.scrollTop=k?l.scrollHeight-l.clientHeight-k.scroll:l.scrollHeight;if(k){n.querySelector('input[name=text]').value=k.text;if(k.focus)n.querySelector('input[name=text]').focus({preventScroll:true});}if(w.tray)paintTray(n);paintDockAttach(w);});
 root.classList.toggle('has-wins',shown.length>0);document.body.classList.toggle('sheet-open',isMobile()&&shown.length>0);paintHeads();}
function paintHeads(){const box=$('#chat-dock .dock-heads');if(!box)return;const shown=shownIds();const hidden=winOrder.filter(id=>!shown.includes(id));
 box.innerHTML=hidden.slice(0,5).map(id=>{const p=cache.get(id)||{},u=wins.get(id)?.unread;return `<button class="chat-head" data-win-focus="${id}" title="${esc(p.name||'')}" aria-label="Mở trò chuyện với ${esc(p.name||'')}${u?`, ${u} tin chưa đọc`:''}">${avatar(p)}${u?`<i>${u>9?'9+':u}</i>`:''}</button>`;}).join('')+(hidden.length>5?`<span class="chat-head more">+${hidden.length-5}</span>`:'');
 document.querySelectorAll('.dock-win.min').forEach(n=>{const w=wins.get(n.dataset.win);const h=n.querySelector('.dock-head');h.querySelector('.win-badge')?.remove();if(w?.unread)h.querySelector('.dock-who').insertAdjacentHTML('afterend',`<i class="win-badge">${w.unread}</i>`);});}
function focusWin(id){const w=wins.get(id);if(!w)return;w.min=false;winOrder=[id,...winOrder.filter(x=>x!==id)];sheetOpen=true;paintDocks();winNode(id)?.querySelector('input[name=text]')?.focus({preventScroll:true});loadWin(id).catch(()=>{});}
function toggleMin(id){const w=wins.get(id);if(!w)return;if(isMobile()){sheetOpen=false;paintDocks();return;}w.min=!w.min;paintDocks();if(!w.min)loadWin(id).catch(()=>{});}
async function loadWin(id,quiet=false){const w=wins.get(id);if(!w)return;let msgs;
 try{msgs=await api('messages',{id});}catch(e){const l=winNode(id)?.querySelector('.dock-log');if(!quiet&&l)l.innerHTML=`<p class="dock-empty">${esc(e.message)}</p>`;return;}
 if(!wins.has(id))return;const sig=msgSig(msgs),changed=sig!==w.sig;w.messages=msgs;w.sig=sig;w.unread=0;
 const n=winNode(id),log=n?.querySelector('.dock-log');if(!log){paintHeads();return;}
 if(!changed&&quiet&&!log.querySelector('.dock-empty'))return;
 const atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<60;
 log.innerHTML=msgs.length?msgs.map(m=>bubble(m,m.sender_id===me.id,'data-dock-media')).join(''):`<p class="dock-empty">Chưa có tin nhắn. Bắt đầu bằng một câu chào, hoặc bấm 🔥 để thả thính.</p>`;
 if(!quiet||atBottom)log.scrollTop=log.scrollHeight;paintHeads();if(inbox.unread)setTimeout(pollInbox,0);}
// Compatibility for older call sites (single dock).
const dock={get id(){return winOrder[0]||'';}};
function loadDock(quiet){return winOrder[0]?loadWin(winOrder[0],quiet):Promise.resolve();}
async function paintTray(node){const list=node?.querySelector('.tray-list');if(!list)return;try{const t=await loadTeasers();list.innerHTML=t.length?t.map(x=>`<button type="button" class="tray-item" data-teaser="${x.id}">${esc(x.body)}</button>`).join(''):'<span class="fine-print">Chưa có câu thả thính nào.</span>';}catch(e){list.innerHTML=`<span class="fine-print">${esc(e.message)}</span>`;}}
function flameBurst(from){const r=from.getBoundingClientRect();if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(let i=0;i<14;i++){const f=document.createElement('span');f.className='flame-particle';f.textContent=i%4?'🔥':'💥';f.style.left=(r.left+r.width/2)+'px';f.style.top=(r.top+r.height/2)+'px';f.style.setProperty('--dx',(Math.random()*220-110)+'px');f.style.setProperty('--dy',(-90-Math.random()*170)+'px');f.style.setProperty('--rot',(Math.random()*80-40)+'deg');f.style.animationDelay=(i*25)+'ms';document.body.appendChild(f);setTimeout(()=>f.remove(),1400);}}
async function sendTease(teaserId,btn){const w=winOf(btn);if(!w)return;btn.disabled=true;flameBurst(btn);btn.classList.add('sent');try{await api('send',{id:w.id,teaserId});await loadWin(w.id);winNode(w.id)?.querySelector('.bubble.me:last-child')?.classList.add('just-sent');toast('🔥 Đã thả thính!');}catch(e){toast(e.message);}finally{setTimeout(()=>{btn.disabled=false;btn.classList.remove('sent');},900);}}
function paintDockAttach(w,text){const box=winNode(w.id)?.querySelector('.dock-attach');if(!box)return;box.hidden=!w.file;if(w.file)box.innerHTML=text||`<span>${w.file.type.startsWith('video/')?'🎬':'🖼'} ${esc(w.file.name)} · ${(w.file.size/1048576).toFixed(1)} MB</span>${ephSelect('',w.eph).replace('<select id=""','<select class="dock-eph"')}<button type="button" class="text-button" data-action="dock-clear-attach">Bỏ</button>${w.eph?'<small class="eph-note">Người nhận vẫn có thể chụp màn hình.</small>':''}`;}
window.addEventListener('resize',()=>{clearTimeout(paintDocks.t);paintDocks.t=setTimeout(paintDocks,200);});
// Every visible, expanded window refreshes every 4 s while the page is on screen.
setInterval(()=>{if(!session||document.hidden)return;shownIds().forEach(id=>{if(!wins.get(id)?.min)loadWin(id,true).catch(()=>{});});},4000);
// ---------- Notices outside the page: system notification, tab title, sound ----------
function notifyAsk(){return ('Notification' in window)&&Notification.permission==='default'&&!notifyAsk.dismissed?`<div class="notify-ask"><span>🔔 Bật thông báo để biết tin nhắn mới cả khi đang làm việc khác.</span><button type="button" class="text-button" data-action="notify-on">Bật</button><button type="button" class="text-button" data-action="notify-later">Để sau</button></div>`:'';}
async function enableNotifications(){try{const r=await Notification.requestPermission();notifyAsk.dismissed=true;paintDocks();if(route==='settings')render();toast(r==='granted'?'Đã bật thông báo tin nhắn.':'Bạn có thể bật lại trong cài đặt trình duyệt.');}catch{}}
async function systemNotify(t){if(!('Notification' in window)||Notification.permission!=='granted')return;const p=cache.get(t.id)||{};const opts={body:t.preview||'Tin nhắn mới',tag:'chat-'+t.id,renotify:true,icon:'assets/icons/icon-192.png',badge:'assets/icons/icon-192.png',data:{chat:t.id}};
 try{const reg=await navigator.serviceWorker?.getRegistration();if(reg)await reg.showNotification(`💬 ${t.name||p.name||'Tin nhắn mới'}`,opts);else{const n=new Notification(`💬 ${t.name||'Tin nhắn mới'}`,opts);n.onclick=()=>{window.focus();focusWin(t.id);n.close();};}}catch{}}
let titleFlash=0;const baseTitle=()=>document.title.replace(/^(\(\d+\+?\) |💬 .*? · )/,'');
function flashTitle(name){clearInterval(titleFlash);let on=false;const base=baseTitle();titleFlash=setInterval(()=>{if(!document.hidden&&document.hasFocus()){clearInterval(titleFlash);document.title=(inbox.unread?`(${inbox.unread}) `:'')+base;return;}on=!on;document.title=on?`💬 ${name} nhắn tin · `+base:`(${inbox.unread||1}) `+base;},1200);}
let audioCtx=null;function ping(){if(!prefs.sound)return;try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.setValueAtTime(880,audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(1320,audioCtx.currentTime+.12);g.gain.setValueAtTime(.0001,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.18,audioCtx.currentTime+.02);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.35);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.36);}catch{}}
navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.openChat){window.focus();openDock(e.data.openChat).catch(()=>{});}});
function validateChatFile(f){if(f.type.startsWith('video/')){if(!['video/mp4','video/webm'].includes(f.type)||f.size>20*1024*1024)throw new Error('Video phải là MP4/WebM, tối đa 20 MB.');}else{const err=photoValidationError(f);if(err)throw new Error(err);}}
async function sendChat(id,text,file,onStatus,eph=0){let mediaId;if(file){onStatus?.('Đang nén…',0);let blob=file,thumb=null,label='Đang tải lên…';if(file.type.startsWith('image/')){const pr=await preparePhoto(file);blob=pr.blob;thumb=eph?null:pr.thumb;label=`Đang tải ${fmtSize(blob.size)}…`;}mediaId=await upload(blob,'chat',p=>onStatus?.(label,p),thumb);}await api('send',{id,text,...(mediaId?{mediaId}:{}),...(mediaId&&eph?{ephemeral:String(eph)}:{})});}
// ---------- Feedback (sign-in page + footer): small window, 1 per 24h ----------
const FB_KEY='chich.feedback.at';
function feedbackLocked(){try{return Date.now()-Number(localStorage.getItem(FB_KEY)||0)<864e5;}catch{return false;}}
function openFeedback(){const pop=$('#feedback-pop');$('#fb-thanks').hidden=true;$('#feedback-form').hidden=false;$('#fb-status').textContent='';
 const locked=feedbackLocked();$('#fb-body').disabled=locked;$('#feedback-form .button').disabled=locked;
 if(locked)$('#fb-status').textContent='Bạn đã góp ý trong 24 giờ qua. Cảm ơn bạn, hẹn bạn lần sau!';
 pop.hidden=false;requestAnimationFrame(()=>pop.classList.add('open'));if(!locked)$('#fb-body').focus();}
function closeFeedback(){const pop=$('#feedback-pop');pop.classList.remove('open');setTimeout(()=>{pop.hidden=true;},200);}
$('#fb-body').addEventListener('input',e=>{$('#fb-count').textContent=`${e.target.value.length}/1000`;});
$('#feedback-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('.button'),body=$('#fb-body').value.trim();
 if(body.length<5){$('#fb-status').textContent='Góp ý cần ít nhất 5 ký tự.';return;}
 b.disabled=true;$('#fb-status').textContent='Đang gửi…';
 try{await sendFeedback(body);try{localStorage.setItem(FB_KEY,String(Date.now()));}catch{}$('#fb-body').value='';$('#fb-count').textContent='0/1000';
  $('#feedback-form').hidden=true;$('#fb-thanks').hidden=false;setTimeout(closeFeedback,2600);}
 catch(err){$('#fb-status').textContent=err.message;if(/24 giờ/.test(err.message)){try{localStorage.setItem(FB_KEY,String(Date.now()));}catch{}}}
 finally{b.disabled=feedbackLocked();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#feedback-pop').hidden)closeFeedback();});
// ---------- Install app (PWA) ----------
function standalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
function isIOS(){return /iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
function inAppBrowser(){return /FBAN|FBAV|Instagram|Zalo|Line\/|TikTok/i.test(navigator.userAgent);}
function installedHere(){try{return localStorage.getItem('chich.installed')==='yes';}catch{return false;}}
// Hidden when: running as the installed app, installed on this device, or this account already installed it anywhere.
function updateInstall(){const show=!standalone()&&!installedHere()&&!me?.appInstalled&&(!!installPrompt||isIOS());document.querySelectorAll('.install-app').forEach(b=>b.hidden=!show);}
async function recordInstalled(){try{localStorage.setItem('chich.installed','yes');}catch{}if(session&&me&&!me.appInstalled){try{await api('app_installed');me.appInstalled=true;}catch{}}updateInstall();}
async function installApp(){
 if(installPrompt){const p=installPrompt;installPrompt=null;p.prompt();const {outcome}=await p.userChoice;if(outcome==='accepted')await recordInstalled();else updateInstall();return;}
 if(isIOS())modal('Cài CHI.CH DAO. lên màn hình chính',`${inAppBrowser()?'<p><b>Bạn đang mở trong ứng dụng khác (Zalo, Facebook…).</b> Hãy bấm ⋯ và chọn <b>Mở bằng Safari</b> trước.</p>':''}<ol class="ios-steps"><li>Trong <b>Safari</b>, bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên hướng lên) ở thanh dưới cùng.</li><li>Kéo xuống, chọn <b>Thêm vào MH chính</b> (Add to Home Screen).</li><li>Bấm <b>Thêm</b>. Biểu tượng CHI.CH DAO. sẽ xuất hiện trên màn hình chính.</li></ol><button class="button primary" data-action="ios-installed" style="margin-top:20px">Tôi đã cài xong</button>`);
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;updateInstall();});
window.addEventListener('appinstalled',()=>{installPrompt=null;recordInstalled();toast('Đã cài CHI.CH DAO. Mở từ biểu tượng trên màn hình của bạn.');});
if('serviceWorker' in navigator&&location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
route=['discover','liked','messages','profile','settings','admin'].includes(location.hash.slice(1))?location.hash.slice(1):'discover';
try{const q=new URLSearchParams(location.search).get('chat');if(q&&/^[0-9a-f-]{36}$/i.test(q)){chatId=q;history.replaceState(null,'',location.pathname+location.hash);}}catch{}
applyTheme(document.documentElement.dataset.theme);
$('#region-list').innerHTML=regionOptions();
// Returning from Google (?code=) or with a saved session: show a short loader instead of flashing the 18+ / login popup.
booting=!!supabase&&configured&&(/[?&]code=/.test(location.search)||(()=>{try{return Object.keys(localStorage).some(k=>/^sb-.+-auth-token$/.test(k));}catch{return false;}})());
if(booting){document.body.classList.add('booting');setTimeout(()=>{if(booting&&!session)showAuth();},10000);}
render();if(!booting)showAuth();hero().then(data=>{const changed=JSON.stringify(data)!==JSON.stringify(heroData);heroData=data;try{localStorage.setItem('chich.hero',JSON.stringify(data));}catch{}if(data?.theme)applyTheme(data.theme);if(changed&&!$('#auth-screen').hidden)paintSlides();const hp=$('.hero-photo');if(route==='discover'&&hp&&data?.src){hp.src=data.src;hp.alt=data.alt;hp.hidden=false;}}).catch(()=>{});
if(supabase&&configured){supabase.auth.onAuthStateChange((event,s)=>{setTimeout(()=>authenticated(event,s),0);});}

// ---------- Live updates (no WebSocket: polling only while the tab is visible) ----------
setInterval(()=>{if(session&&!document.hidden&&route==='messages'&&chatId&&$('#chat-panel'))loadChat(true).catch(()=>{});},4000);
async function pollInbox(){
 if(!session)return;let data;try{data=await api('inbox');}catch{return;}
 const before=inbox.unread;inbox={unread:Number(data.unread)||0,threads:data.threads||[]};
 const fresh=inbox.threads.filter(t=>inboxSeen[t.id]!==t.lastAt);const away=document.hidden||!document.hasFocus();
 if(inboxFirst){if(inbox.unread&&route!=='messages')notify(null,`Bạn có ${inbox.unread} tin nhắn chưa đọc`);}
 else for(const t of fresh){
  if(isReading(t.id)){if(wins.has(t.id))loadWin(t.id,true).catch(()=>{});else loadChat(true).catch(()=>{});if(away){systemNotify(t);flashTitle(t.name);}continue;}
  const w=wins.get(t.id);if(w)w.unread=t.count;
  if(!isMobile()&&prefs.popup&&!(route==='messages'&&!document.hidden)){await openDock(t.id,{incoming:true}).catch(()=>{});if(wins.get(t.id))wins.get(t.id).unread=t.count;}
  if(route!=='messages'&&!isReading(t.id)&&!(prefs.popup&&winOrder.includes(t.id)&&!away))notify(t.id,`${t.name||'Một người'}: ${t.preview||'Tin nhắn mới'}`);
  if(away){systemNotify(t);flashTitle(t.name||'Ai đó');}
  ping();
 }
 inbox.threads.forEach(t=>inboxSeen[t.id]=t.lastAt);inboxFirst=false;
 for(const [id,w] of wins){const t=inbox.threads.find(x=>x.id===id);if(!t&&!isReading(id))w.unread=0;}
 paintHeads();if(before!==inbox.unread)nav();
 if(!titleFlash||(!document.hidden&&document.hasFocus()))document.title=(inbox.unread?`(${inbox.unread}) `:'')+baseTitle();
 if(route==='messages'&&$('#conv-items')){if(fresh.length&&!inboxFirst){try{contacts=await api('contacts');contacts.forEach(p=>cache.set(p.id,p));}catch{}}$('#conv-items').innerHTML=convItems();}
}
function notify(id,text){
 const box=$('#msg-notice')||Object.assign(document.createElement('div'),{id:'msg-notice',className:'msg-notice'});if(!box.isConnected)document.body.appendChild(box);
 const el=document.createElement('div');el.className='msg-note';el.setAttribute('role','status');
 el.innerHTML=`<span>💬</span><p>${esc(text)}</p>${id?`<button class="button primary small" data-note-open="${id}">Trả lời</button>`:`<button class="button primary small" data-nav="messages">Xem</button>`}<button class="note-x" aria-label="Đóng">×</button>`;
 box.prepend(el);while(box.children.length>3)box.lastChild.remove();
 const close=()=>{el.classList.add('out');setTimeout(()=>el.remove(),300);};el.querySelector('.note-x').onclick=close;
 el.querySelector('[data-note-open]')?.addEventListener('click',e=>{e.stopPropagation();close();openDock(id).then(()=>pollInbox()).catch(err=>toast(err.message));});
 el.querySelector('[data-nav]')?.addEventListener('click',close);
 setTimeout(close,9000);
}
// 10 s while on screen; also keeps running in a background tab (browsers may slow it to about once a minute).
setInterval(pollInbox,10000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){pollInbox();shownIds().forEach(id=>{if(!wins.get(id)?.min)loadWin(id,true).catch(()=>{});});}});
window.addEventListener('focus',()=>{clearInterval(titleFlash);titleFlash=0;document.title=(inbox.unread?`(${inbox.unread}) `:'')+baseTitle();});

// Phones: keep the chat sheet exactly above the on-screen keyboard (iOS does not shrink 100dvh for it).
if(window.visualViewport){const vv=window.visualViewport,fit=()=>{document.documentElement.style.setProperty('--vvh',vv.height+'px');document.documentElement.style.setProperty('--vvtop',vv.offsetTop+'px');};vv.addEventListener('resize',fit);vv.addEventListener('scroll',fit);fit();}
