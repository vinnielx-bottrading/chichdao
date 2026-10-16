import {api,adminAuth,signIn,signInPassword,signOut,supabase,configured,upload,hero,config,fetchImageURL} from './api.js';
import {preparePhoto} from './album.js';
import {THEMES,themeById} from './themes.js';
import {occupations,bodyTypes,lifestyles,trainingStyles} from './model.js';

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=s=>{try{const u=new URL(s,location.href);return ['https:','http:','blob:'].includes(u.protocol)?esc(u.href):'';}catch{return '';}};
const num=n=>Number(n||0).toLocaleString('vi-VN');
const dt=s=>s?new Date(s).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const ago=s=>{if(!s)return '—';const m=Math.round((Date.now()-new Date(s))/60000);if(m<1)return 'vừa xong';if(m<60)return `${m} phút trước`;const h=Math.round(m/60);if(h<48)return `${h} giờ trước`;return `${Math.round(h/24)} ngày trước`;};
const bytes=b=>b>1048576?`${(b/1048576).toFixed(1)} MB`:`${Math.round((b||0)/1024)} KB`;
const place=(o)=>[o.city||o.lastCity||o.last_city,o.country||o.lastCountry||o.last_country].filter(Boolean).join(', ')||'—';
const EVENTS={SIGNED_IN:'Đăng nhập',INITIAL_SESSION:'Mở ứng dụng',session:'Mở ứng dụng',USER_UPDATED:'Cập nhật tài khoản',logout:'Đăng xuất',accept_adult:'Xác nhận 18+',profile_save:'Lưu hồ sơ',visibility:'Đổi hiển thị',location:'Bật vị trí',location_off:'Tắt vị trí',like:'Thích',unlike:'Bỏ thích',block:'Chặn',unblock:'Bỏ chặn',report:'Báo cáo',send:'Gửi tin nhắn',finish_media:'Tải ảnh/video',tease:'Thả thính 🔥',app_installed:'Cài ứng dụng',delete_media:'Xóa ảnh/video'};
const AUDIT={samples_toggle:'Bật/tắt hồ sơ minh họa',sample_save:'Lưu hồ sơ minh họa',samples_bulk:'Tạo nhanh hồ sơ minh họa',sample_delete:'Xóa hồ sơ minh họa',samples_clear:'Xóa tất cả hồ sơ minh họa',view_user:'Xem hồ sơ',view_chat:'Đọc hội thoại',suspend:'Khóa/mở khóa',delete_media:'Xóa media',resolve_report:'Xử lý báo cáo',create_user:'Tạo người dùng',teaser_save:'Lưu câu thả thính',login_settings:'Cài đặt trang đăng nhập',chat_retention:'Hạn lưu ảnh chat',theme:'Đổi giao diện',feedback_delete:'Xóa góp ý',teaser_delete:'Xóa câu thả thính',update_auth:'Đổi email/mật khẩu'};
const ev=e=>EVENTS[e]||e;
const TABS=[['overview','Tổng quan'],['users','Người dùng'],['chats','Tin nhắn'],['media','Ảnh & video'],['activity','Hoạt động'],['reports','Báo cáo'],['teasers','Thả thính 🔥'],['samples','Hồ sơ minh họa'],['feedback','Góp ý'],['audit','Nhật ký admin'],['settings','Cài đặt']];

let me=null,tab='overview',charts=[],stats=null,authBusy=false,lastToken='';
const state={users:{q:'',filter:'all',rows:[],done:false},media:{kind:'all',purpose:'all',rows:[],done:false},activity:{event:'all',rows:[],done:false},chats:{rows:[],a:'',b:'',done:false}};

function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('on'),4500);}
function gate(text,showLogin=true){$('#shell').hidden=true;$('#gate').hidden=false;$('#gate-text').textContent=text;$('#gate-actions').hidden=!showLogin;}
function empty(t){return `<div class="empty">${esc(t)}</div>`;}

/* ---------------- Auth ---------------- */
async function onAuth(event,session){
 if(!session){me=null;lastToken='';gate('Chỉ tài khoản quản trị viên được truy cập.');return;}
 if(authBusy||lastToken===session.access_token)return;authBusy=true;
 try{
  me=await api(event==='TOKEN_REFRESHED'?'me':'session',{event});lastToken=session.access_token;
  if(!me.admin){gate(`Tài khoản ${session.user.email||''} không có quyền quản trị.`,false);$('#gate-status').innerHTML='<button class="btn" id="gate-out">Đăng xuất</button>';$('#gate-out').onclick=()=>signOut();return;}
  if(event==='TOKEN_REFRESHED'&&!$('#shell').hidden)return;
  $('#gate').hidden=true;$('#shell').hidden=false;$('#who').textContent=session.user.email||'';$('#gate-status').textContent='';
  route();
 }catch(e){lastToken=session.access_token;gate('Không mở được trang quản trị.',false);$('#gate-status').innerHTML=`${esc(/Unknown action|Unauthenticated/.test(e.message)?'Máy chủ chưa sẵn sàng (database chưa cập nhật).':e.message)}<br><button class="btn" id="gate-out" style="margin-top:10px">Đăng xuất / đổi tài khoản</button>`;$('#gate-out').onclick=()=>signOut();}
 finally{authBusy=false;}
}
$('#g-google').onclick=async()=>{$('#gate-status').textContent='';try{await signIn();}catch(e){$('#gate-status').textContent=e.message;}};
$('#g-email').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;$('#gate-status').textContent='';try{await signInPassword(f.email.value,f.password.value);}catch(err){$('#gate-status').textContent=err.message;}finally{b.disabled=false;}};
$('#logout').onclick=async()=>{try{await api('logout');}catch{}await signOut();};

/* ---------------- Routing ---------------- */
function route(){const h=location.hash.slice(1);tab=TABS.some(([k])=>k===h)?h:'overview';renderTabs();render();}
window.addEventListener('hashchange',()=>{if(me?.admin)route();});
function renderTabs(){$('#tabs').innerHTML=TABS.map(([k,t])=>`<a class="tab ${k===tab?'active':''}" href="#${k}" ${k===tab?'aria-current="page"':''}>${t}${k==='reports'&&stats?.totals?.openReports?`<span class="badge">${stats.totals.openReports}</span>`:''}${k==='feedback'&&stats?.totals?.feedbackOpen?`<span class="badge">${stats.totals.feedbackOpen}</span>`:''}</a>`).join('');}
function destroyCharts(){charts.forEach(c=>c.destroy());charts=[];}
async function render(){
 destroyCharts();const v=$('#view');v.innerHTML=empty('Đang tải…');
 try{
  if(tab==='overview')await overview();
  if(tab==='users')await users(true);
  if(tab==='chats')await chats(true);
  if(tab==='media')await media(true);
  if(tab==='activity')await activity(true);
  if(tab==='reports')await reports();
  if(tab==='audit')await audit();
  if(tab==='teasers')await teasersView();
  if(tab==='feedback')await feedbackView();
  if(tab==='samples')await samplesView();
  if(tab==='settings')settingsView();
 }catch(e){v.innerHTML=empty(e.message);}
}

/* ---------------- Charts (single series, brand orange) ---------------- */
const ORANGE='#ff791f',GRID='rgba(165,177,193,.12)',INK='#a5b1c1';
if(window.Chart){Chart.defaults.color=INK;Chart.defaults.font.family='Dao, Arial, sans-serif';Chart.defaults.font.size=11;Chart.defaults.borderColor=GRID;Chart.defaults.plugins.legend.display=false;
 Object.assign(Chart.defaults.plugins.tooltip,{backgroundColor:'#0b1421',borderColor:'#354356',borderWidth:1,titleColor:'#f5f3ea',bodyColor:'#f5f3ea',padding:10,displayColors:false});}
function chartCard(id,title,sub,rows,{span=false,tall=false}={}){
 return `<section class="card ${span?'span2':''}"><h2>${esc(title)}</h2><p class="sub">${esc(sub)}</p><div class="chart-box ${tall?'tall':''}"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div>
 <details class="table-view"><summary>Xem dạng bảng</summary><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Nhóm</th><th>Số lượng</th></tr></thead><tbody>${(rows||[]).map(r=>`<tr><td>${esc(r.label)}</td><td>${num(r.value)}</td></tr>`).join('')||'<tr><td colspan="2">Chưa có dữ liệu</td></tr>'}</tbody></table></div></details></section>`;
}
function drawBar(id,rows,{horizontal=false,line=false,label='Số lượng'}={}){
 const el=document.getElementById(id);if(!el||!window.Chart)return;
 const data=rows||[];
 charts.push(new Chart(el,{type:line?'line':'bar',data:{labels:data.map(r=>r.label),datasets:[{label,data:data.map(r=>r.value),backgroundColor:line?'rgba(255,121,31,.12)':ORANGE,borderColor:ORANGE,borderWidth:line?2:0,borderRadius:4,borderSkipped:'start',maxBarThickness:26,pointRadius:line?0:undefined,pointHoverRadius:5,pointHitRadius:12,tension:.25,fill:line}]},
  options:{responsive:true,maintainAspectRatio:false,indexAxis:horizontal?'y':'x',interaction:{mode:line?'index':'nearest',intersect:!line},
   scales:{x:{grid:{display:horizontal,color:GRID},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:horizontal?6:10,precision:0},beginAtZero:true},y:{grid:{display:!horizontal,color:GRID},beginAtZero:true,ticks:{precision:0,autoSkip:false}}}}}));
}

/* ---------------- Overview ---------------- */
async function overview(){
 stats=await api('admin_stats');renderTabs();const t=stats.totals;
 const AGE=['18–24','25–29','30–34','35–39','40–49','50+','Chưa có'];stats.age=[...(stats.age||[])].sort((x,y)=>AGE.indexOf(x.label)-AGE.indexOf(y.label));
 const k=(label,value,sub='')=>`<div class="kpi"><span>${label}</span><b>${num(value)}</b>${sub?`<small>${sub}</small>`:''}</div>`;
 $('#view').innerHTML=`<div class="head"><div><span class="eyebrow">TỔNG QUAN</span><h1>Bảng điều khiển</h1><p>Số liệu thời gian thực từ cơ sở dữ liệu · 30 ngày gần nhất theo giờ Việt Nam.</p></div><button class="btn" id="refresh">Làm mới</button></div>
 <div class="kpis">${k('Tài khoản đăng ký',t.users,`${num(t.complete)} hồ sơ hoàn thiện`)}${k('Hoạt động 24 giờ',t.active24h,`${num(t.active7d)} trong 7 ngày`)}${k('Tin nhắn',t.messages,`${num(t.messages24h)} trong 24 giờ`)}${k('Cuộc trò chuyện',t.conversations)}${k('Ảnh',t.images)}${k('Video',t.videos)}${k('Lượt thích',t.likes)}${k('Báo cáo mở',t.openReports)}${k('Đang bật tìm gần',t.nearby)}${k('Đang hiển thị',t.visible)}${k('Bị khóa',t.suspended)}${k('Lượt chặn',t.blocks)}${k('Đã cài app',t.installed)}${k('Ảnh/video trong chat',t.chatMedia)}${k('Lượt thả thính 🔥',t.teases)}${k('Góp ý chưa xử lý',t.feedbackOpen)}</div>
 <div class="grid">
  ${chartCard('c-signups','Đăng ký mới theo ngày','Hồ sơ được tạo, 30 ngày',stats.signups)}
  ${chartCard('c-active','Người dùng hoạt động theo ngày','Số tài khoản có hoạt động mỗi ngày',stats.active)}
  ${chartCard('c-msgs','Tin nhắn theo ngày','Tổng tin nhắn gửi đi',stats.messagesDaily)}
  ${chartCard('c-uploads','Ảnh/video tải lên theo ngày','Tất cả lượt tải lên hồ sơ',stats.uploadsDaily)}
  ${chartCard('c-hours','Khung giờ hoạt động','Số sự kiện theo giờ trong ngày, 30 ngày',stats.hours,{span:true})}
  ${chartCard('c-city','Khu vực tự khai','Theo hồ sơ người dùng',stats.city,{tall:true})}
  ${chartCard('c-geocity','Thành phố truy cập','Ước tính theo địa chỉ mạng (lần truy cập gần nhất)',stats.geoCity,{tall:true})}
  ${chartCard('c-country','Quốc gia truy cập','Ước tính theo địa chỉ mạng',stats.geoCountry)}
  ${chartCard('c-age','Độ tuổi','Tuổi tự khai',stats.age)}
  ${chartCard('c-intent','Mong muốn kết nối','',stats.intent)}
  ${chartCard('c-occ','Nghề nghiệp','',stats.occupation)}
  ${chartCard('c-body','Vóc dáng','',stats.bodyType)}
  ${chartCard('c-life','Lối sống','',stats.lifestyle)}
  ${chartCard('c-train','Cách vận động','',stats.training)}
  ${chartCard('c-device','Thiết bị','Hệ điều hành · trình duyệt gần nhất',stats.device)}
  ${chartCard('c-events','Loại hoạt động','30 ngày',(stats.events||[]).map(r=>({label:ev(r.label),value:r.value})),{span:true})}
 </div>`;
 $('#refresh').onclick=render;
 drawBar('c-signups',stats.signups,{line:true,label:'Đăng ký'});drawBar('c-active',stats.active,{line:true,label:'Hoạt động'});
 drawBar('c-msgs',stats.messagesDaily,{label:'Tin nhắn'});drawBar('c-uploads',stats.uploadsDaily,{label:'Tải lên'});drawBar('c-hours',stats.hours,{label:'Sự kiện'});
 for(const [id,key] of [['c-city','city'],['c-geocity','geoCity'],['c-country','geoCountry'],['c-intent','intent'],['c-occ','occupation'],['c-body','bodyType'],['c-life','lifestyle'],['c-train','training'],['c-device','device']])drawBar(id,stats[key],{horizontal:true,label:'Người dùng'});
 drawBar('c-age',stats.age,{label:'Người dùng'});
 drawBar('c-events',(stats.events||[]).map(r=>({label:ev(r.label),value:r.value})),{horizontal:true,label:'Lượt'});
}

/* ---------------- Users ---------------- */
async function users(reset){
 const s=state.users;
 if(reset){s.rows=[];s.done=false;
  $('#view').innerHTML=`<div class="head"><div><span class="eyebrow">NGƯỜI DÙNG</span><h1>Người đăng ký</h1><p>Tất cả tài khoản trong Supabase Auth, kể cả chưa tạo hồ sơ.</p></div>
  <div class="toolbar"><input id="u-q" type="search" placeholder="Email, tên, thành phố…" value="${esc(s.q)}" aria-label="Tìm người dùng"><select id="u-f" aria-label="Lọc"><option value="all">Tất cả</option><option value="complete">Hồ sơ hoàn thiện</option><option value="incomplete">Chưa hoàn thiện</option><option value="suspended">Bị khóa</option></select><button class="btn primary" id="u-new">+ Thêm người dùng</button></div></div>
  <div class="table-wrap"><table><thead><tr><th>Email</th><th>Tên</th><th>Tuổi</th><th>Khu vực</th><th>Trạng thái</th><th>Ảnh/Video</th><th>Tin gửi</th><th>Đăng ký</th><th>Đăng nhập gần nhất</th><th>Hoạt động gần nhất</th><th>Vị trí truy cập</th></tr></thead><tbody id="u-body"></tbody></table></div>
  <button class="btn more" id="u-more" hidden>Xem thêm</button>`;
  $('#u-f').value=s.filter;
  let t;$('#u-q').oninput=e=>{s.q=e.target.value;clearTimeout(t);t=setTimeout(()=>users(true),400);};
  $('#u-f').onchange=e=>{s.filter=e.target.value;users(true);};
  $('#u-more').onclick=()=>users(false);$('#u-new').onclick=createUserForm;
 }
 const rows=await api('admin_users',{query:s.q,filter:s.filter,offset:s.rows.length});s.rows.push(...rows);s.done=rows.length<50;
 $('#u-body').innerHTML=s.rows.map(u=>`<tr class="click" data-user="${u.id}"><td>${esc(u.email||'—')} ${u.provider?`<span class="tag">${esc(u.provider)}</span>`:''}</td><td>${esc(u.name||'—')}</td><td>${u.age||'—'}</td><td>${esc(u.city||'—')}</td>
  <td>${u.suspended?'<span class="tag bad">Bị khóa</span>':u.complete?'<span class="tag ok">Hoàn thiện</span>':'<span class="tag">Chưa đủ</span>'}${u.appInstalled?'<span class="tag">Đã cài app</span>':''}${u.reported?`<span class="tag hot">${u.reported} báo cáo</span>`:''}</td>
  <td>${u.images}/${u.videos}</td><td>${num(u.sent)}</td><td>${dt(u.createdAt)}</td><td>${dt(u.lastSignIn)}</td><td>${ago(u.lastSeen)}</td><td>${esc(place(u))}</td></tr>`).join('')||`<tr><td colspan="11">${empty('Không có người dùng phù hợp.')}</td></tr>`;
 $('#u-more').hidden=s.done;
}
function createUserForm(){
 openDrawer(`<div class="drawer-top"><div><span class="eyebrow">TẠO TÀI KHOẢN</span><h2>Thêm người dùng</h2><p class="muted small">Tạo tài khoản đăng nhập bằng email + mật khẩu (cần bật nhà cung cấp Email trong Supabase). Người dùng tự hoàn thiện hồ sơ sau khi đăng nhập.</p></div><button class="x" data-close aria-label="Đóng">×</button></div>
 <form id="new-user" class="stack" style="max-width:420px"><label for="nu-mail">Email</label><input id="nu-mail" name="email" type="email" required><label for="nu-pass">Mật khẩu (8–72 ký tự)</label><input id="nu-pass" name="password" type="text" minlength="8" maxlength="72" required autocomplete="new-password"><button class="btn primary">Tạo tài khoản</button></form>`);
 $('#new-user').onsubmit=async e=>{e.preventDefault();const f=e.target;await busy(f,async()=>{const r=await adminAuth({op:'create',email:f.email.value,password:f.password.value});toast(`Đã tạo ${r.email}`);closeDrawer();if(tab==='users')users(true);});};
}

/* ---------------- User detail drawer ---------------- */
function openDrawer(html){$('#drawer-body').innerHTML=`<div class="drawer-inner">${html}</div>`;if(!$('#drawer').open)$('#drawer').showModal();}
function closeDrawer(){$('#drawer').close();}
async function busy(form,fn){const b=form.querySelector('button');if(b)b.disabled=true;try{await fn();}catch(e){toast(e.message);}finally{if(b)b.disabled=false;}}
async function userDetail(id,sub='profile'){
 openDrawer(empty('Đang tải hồ sơ…'));
 const d=await api('admin_user',{id});registerMedia(d.media);const a=d.auth||{},p=d.profile||{},acc=d.account||{};
 const head=`<div class="drawer-top"><div><span class="eyebrow">NGƯỜI DÙNG</span><h2>${esc(p.name||a.email||'Chưa đặt tên')}${p.age?`, ${p.age}`:''}</h2><p class="muted small">${esc(a.email||'')} · ${esc(id)}</p>
  <div style="margin-top:6px">${acc.suspended?'<span class="tag bad">Bị khóa</span>':'<span class="tag ok">Đang hoạt động</span>'}${p.complete?'<span class="tag ok">Hồ sơ hoàn thiện</span>':'<span class="tag">Hồ sơ chưa đủ</span>'}${p.visible===false?'<span class="tag">Đang ẩn</span>':''}${d.nearby?'<span class="tag hot">Bật tìm gần</span>':''}</div></div><button class="x" data-close aria-label="Đóng">×</button></div>`;
 const subs=[['profile','Hồ sơ'],['media',`Ảnh & video (${d.media.length})`],['activity',`Hoạt động (${d.activity.length})`],['chats',`Trò chuyện (${d.conversations.length})`],['reports',`Báo cáo (${d.reportsAgainst.length})`],['account','Tài khoản']];
 const body={
  profile:`<dl class="kv"><dt>Tên hiển thị</dt><dd>${esc(p.name||'—')}</dd><dt>Tuổi</dt><dd>${p.age||'—'}</dd><dt>Khu vực</dt><dd>${esc(p.city||'—')}</dd><dt>Mong muốn</dt><dd>${esc(p.intent||'—')}</dd><dt>Nghề nghiệp</dt><dd>${esc(p.occupation||'—')}</dd><dt>Vóc dáng</dt><dd>${esc(p.bodyType||'—')}</dd><dt>Lối sống</dt><dd>${esc(p.lifestyle||'—')}</dd><dt>Cách vận động</dt><dd>${esc(p.training||'—')}</dd><dt>Giới thiệu</dt><dd>${esc(p.bio||'—')}</dd>
   <dt>Xác nhận 18+</dt><dd>${dt(p.adultAcceptedAt)}</dd><dt>Tạo hồ sơ</dt><dd>${dt(p.createdAt)}</dd><dt>Sửa hồ sơ</dt><dd>${dt(p.updatedAt)}</dd><dt>Lượt thích</dt><dd>Đã thích ${num(d.likesGiven)} · được thích ${num(d.likesReceived)}</dd><dt>Chặn</dt><dd>Đã chặn ${num(d.blocksGiven)} · bị chặn bởi ${num(d.blockedBy)}</dd>
   <dt>Tìm ở gần</dt><dd>${d.nearby?`Đang bật · cập nhật ${dt(d.nearby.updatedAt)}`:'Không bật'}</dd><dt>Ứng dụng</dt><dd>${acc.app_installed_at?`Đã cài · ${dt(acc.app_installed_at)}`:'Chưa cài'}</dd><dt>Truy cập gần nhất</dt><dd>${ago(acc.last_seen_at)} · ${esc(place(acc))} · ${esc(acc.last_device||'—')}</dd></dl>`,
  media:d.media.length?`<div class="media-grid">${d.media.map(tile).join('')}</div>`:empty('Chưa tải ảnh/video.'),
  activity:activityTable(d.activity,false),
  chats:d.conversations.length?`<div class="chat-layout"><div class="convo-list">${d.conversations.map(c=>`<button class="convo" data-thread="${id}|${c.partner_id}" data-names="${esc(JSON.stringify({[id]:p.name||a.email,[c.partner_id]:c.partner_name||c.partner_email}))}"><b>${esc(c.partner_name||c.partner_email||c.partner_id)}</b><p>${num(c.n)} tin · ${dt(c.last_at)}</p></button>`).join('')}</div><div class="thread" id="d-thread">${empty('Chọn một cuộc trò chuyện.')}</div></div>`:empty('Chưa có cuộc trò chuyện.'),
  reports:(d.reportsAgainst.length?`<h3 style="margin-bottom:8px">Bị báo cáo</h3>${reportList(d.reportsAgainst)}`:empty('Chưa bị báo cáo.'))+(d.reportsBy.length?`<h3 style="margin:16px 0 8px">Đã báo cáo người khác</h3>${reportList(d.reportsBy)}`:''),
  account:`<dl class="kv"><dt>Email</dt><dd>${esc(a.email||'—')} ${a.confirmed?'<span class="tag ok">Đã xác nhận</span>':''}</dd><dt>Đăng nhập bằng</dt><dd>${esc(a.provider||'—')}</dd><dt>Tạo tài khoản</dt><dd>${dt(a.created_at)}</dd><dt>Đăng nhập gần nhất</dt><dd>${dt(a.last_sign_in_at)}</dd></dl>
   <div class="forms">
    <form class="card stack" id="f-email"><h2>Đổi email</h2><p class="sub">Email mới được xác nhận ngay. Người dùng đăng nhập Google vẫn đăng nhập bằng Google.</p><label for="fe">Email mới</label><input id="fe" name="email" type="email" required ${id===me.id?'disabled':''}><button class="btn" ${id===me.id?'disabled':''}>Lưu email</button></form>
    <form class="card stack" id="f-pass"><h2>Đặt mật khẩu</h2><p class="sub">Cho phép đăng nhập bằng email + mật khẩu. Hãy gửi mật khẩu cho người dùng qua kênh an toàn.</p><label for="fp">Mật khẩu mới (8–72 ký tự)</label><input id="fp" name="password" type="text" minlength="8" maxlength="72" required autocomplete="new-password"><button class="btn">Lưu mật khẩu</button></form>
    <div class="card stack"><h2>Khóa tài khoản</h2><p class="sub">Tài khoản bị khóa không dùng được ứng dụng và không xuất hiện trong Khám phá.</p>${id===me.id?'<p class="muted small">Không áp dụng cho quản trị viên.</p>':`<button class="btn ${acc.suspended?'':'danger'}" id="f-susp">${acc.suspended?'Mở khóa tài khoản':'Khóa tài khoản'}</button>`}</div>
   </div>`
 };
 const paint=k=>{$('#drawer-body').innerHTML=`<div class="drawer-inner">${head}<div class="subtabs">${subs.map(([s,t])=>`<button data-sub="${s}" class="${s===k?'active':''}">${t}</button>`).join('')}</div><div>${body[k]}</div></div>`;
  $('#drawer-body').querySelectorAll('[data-sub]').forEach(b=>b.onclick=()=>paint(b.dataset.sub));
  if(k==='account'){
   const fe=$('#f-email'),fp=$('#f-pass'),fs=$('#f-susp');
   fe&&(fe.onsubmit=e=>{e.preventDefault();busy(fe,async()=>{await adminAuth({op:'update',id,email:fe.email.value});toast('Đã đổi email.');userDetail(id,'account');});});
   fp&&(fp.onsubmit=e=>{e.preventDefault();busy(fp,async()=>{await adminAuth({op:'update',id,password:fp.password.value});fp.reset();toast('Đã đặt mật khẩu mới.');});});
   fs&&(fs.onclick=async()=>{fs.disabled=true;try{await api('admin_suspend',{id,suspended:!acc.suspended});toast(acc.suspended?'Đã mở khóa.':'Đã khóa tài khoản.');userDetail(id,'account');}catch(e){toast(e.message);fs.disabled=false;}});
  }};
 paint(sub);
}
function tile(m){
 const thumb=m.src?(m.kind==='video'?`<video src="${safeURL(m.src)}" preload="metadata" muted playsinline></video>`:`<img src="${safeURL(m.thumb||m.src)}" alt="${esc(m.caption||'Ảnh người dùng')}" loading="lazy">`):`<span class="noimg">${m.status&&m.status!=='ready'?esc(m.status):'Chưa có kho ảnh'}</span>`;
 return `<article class="tile"><button class="thumb" ${m.src?`data-view="${m.id}"`:''} aria-label="Xem lớn">${thumb}</button><div class="meta"><b>${esc(m.owner_name||m.caption||(m.kind==='video'?'Video':'Ảnh'))}</b>${m.owner_email?`<button class="link" style="text-align:left;padding:0" data-user="${m.user_id}">${esc(m.owner_email)}</button>`:''}<span class="faint">${m.purpose==='chat'?'<span class="tag hot">Chat</span>':''}${m.kind==='video'?'Video':'Ảnh'} · ${bytes(m.bytes)} · ${dt(m.created_at||m.createdAt)}</span>${m.caption&&m.owner_name?`<span class="muted">${esc(m.caption)}</span>`:''}${m.status==='ready'||!m.status?`<button class="link" style="text-align:left;padding:0;color:var(--bad)" data-del="${m.id}">Xóa</button>`:''}</div></article>`;
}
const mediaIndex=new Map();
function registerMedia(list){(list||[]).forEach(m=>mediaIndex.set(m.id,m));}
function activityTable(rows,withUser=true){
 return `<div class="table-wrap"><table><thead><tr><th>Thời gian</th>${withUser?'<th>Người dùng</th>':''}<th>Hoạt động</th><th>Vị trí (theo mạng)</th><th>Thiết bị</th></tr></thead><tbody>${rows.map(a=>`<tr ${withUser?`class="click" data-user="${a.user_id}"`:''}><td>${dt(a.created_at)}</td>${withUser?`<td>${esc(a.name||'—')}<br><span class="faint">${esc(a.email||'')}</span></td>`:''}<td>${esc(ev(a.event))}</td><td>${esc([a.city,a.region,a.country].filter(Boolean).join(', ')||'—')}</td><td>${esc(a.device||'—')}</td></tr>`).join('')||`<tr><td colspan="5">${empty('Chưa có hoạt động.')}</td></tr>`}</tbody></table></div>`;
}
function reportList(list){return `<div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Lý do</th><th>Mô tả</th><th>Trạng thái</th></tr></thead><tbody>${list.map(r=>`<tr><td>${dt(r.created_at)}</td><td>${esc(r.reason)}</td><td class="wrap">${esc(r.note||'—')}</td><td>${r.resolved?'<span class="tag">Đã đóng</span>':'<span class="tag hot">Đang mở</span>'}</td></tr>`).join('')}</tbody></table></div>`;}
async function thread(a,b,el,names={}){
 el.innerHTML=empty('Đang tải…');const list=await api('admin_messages',{a,b});
 list.forEach(m=>registerMedia(m.media));el.innerHTML=list.map(m=>`<div class="bubble ${m.sender_id===a?'':'right'}">${m.kind==='tease'?'<span class="tag hot">🔥 Thả thính</span><br>':''}${m.ephemeral?`<span class="tag hot">⏱ Tự hủy ${m.ephemeral>=3600?'1 giờ':Math.round(m.ephemeral/60)+' phút'} · ${m.expired?'đã hủy':m.viewedAt?'đã mở':'chưa mở'}</span><br>`:''}${(m.media||[]).map(x=>x.src?`<button class="chat-thumb" data-view="${x.id}">${x.kind==='video'?`<video src="${safeURL(x.src)}" preload="metadata" muted playsinline></video>`:`<img src="${safeURL(x.src)}" alt="Ảnh trong tin nhắn" loading="lazy">`}</button>`:'<span class="faint">[Ảnh/video đã xóa]</span>').join('')}${esc(m.body)}<small>${esc(names[m.sender_id]||(m.sender_id===a?'A':'B'))} · ${dt(m.created_at)}</small></div>`).join('')||empty('Không có tin nhắn.');el.scrollTop=el.scrollHeight;
}

/* ---------------- Chats ---------------- */
async function chats(reset){
 const s=state.chats;
 if(reset){s.rows=[];s.done=false;$('#view').innerHTML=`<div class="head"><div><span class="eyebrow">TIN NHẮN</span><h1>Nội dung trò chuyện</h1><p>Mỗi lần mở một hội thoại đều được ghi vào Nhật ký admin.</p></div></div>
  <div class="chat-layout"><div><div class="convo-list" id="c-list"></div><button class="btn more" id="c-more" hidden>Xem thêm</button></div><div class="thread" id="c-thread">${empty('Chọn một cuộc trò chuyện.')}</div></div>`;$('#c-more').onclick=()=>chats(false);}
 const rows=await api('admin_conversations',{offset:s.rows.length});s.rows.push(...rows);s.done=rows.length<50;
 $('#c-list').innerHTML=s.rows.map(c=>`<button class="convo" data-thread="${c.a}|${c.b}" data-names="${esc(JSON.stringify({[c.a]:c.a_name||c.a_email,[c.b]:c.b_name||c.b_email}))}"><b>${esc(c.a_name||c.a_email)} ↔ ${esc(c.b_name||c.b_email)}</b><p>${num(c.n)} tin · ${ago(c.last_at)} · ${esc(c.preview)}</p></button>`).join('')||empty('Chưa có cuộc trò chuyện.');
 $('#c-more').hidden=s.done;
}

/* ---------------- Media ---------------- */
async function media(reset){
 const s=state.media;
 if(reset){s.rows=[];s.done=false;$('#view').innerHTML=`<div class="head"><div><span class="eyebrow">THƯ VIỆN</span><h1>Ảnh & video người dùng</h1><p>Mới nhất trước. Liên kết xem có hiệu lực 10 phút.</p></div><div class="toolbar"><select id="m-p" aria-label="Nguồn"><option value="all">Hồ sơ + chat</option><option value="profile">Ảnh hồ sơ</option><option value="chat">Gửi trong chat</option></select><select id="m-k" aria-label="Loại"><option value="all">Tất cả</option><option value="image">Ảnh</option><option value="video">Video</option></select></div></div><div class="media-grid" id="m-grid"></div><button class="btn more" id="m-more" hidden>Xem thêm</button>`;
  $('#m-k').value=s.kind;$('#m-k').onchange=e=>{s.kind=e.target.value;media(true);};$('#m-p').value=s.purpose;$('#m-p').onchange=e=>{s.purpose=e.target.value;media(true);};$('#m-more').onclick=()=>media(false);}
 const r=await api('admin_media',{kind:s.kind,purpose:s.purpose,offset:s.rows.length});registerMedia(r.media);s.rows.push(...r.media);s.done=r.media.length<60;
 $('#m-grid').innerHTML=s.rows.map(tile).join('')||empty('Chưa có ảnh/video.');$('#m-more').hidden=s.done;
}

/* ---------------- Activity ---------------- */
async function activity(reset){
 const s=state.activity;
 if(reset){s.rows=[];s.done=false;$('#view').innerHTML=`<div class="head"><div><span class="eyebrow">HOẠT ĐỘNG</span><h1>Nhật ký hoạt động</h1><p>Đăng nhập, mở ứng dụng, đăng xuất và các thao tác. Vị trí là ước tính theo địa chỉ mạng, không phải GPS.</p></div><div class="toolbar"><select id="a-e" aria-label="Loại hoạt động"><option value="all">Tất cả hoạt động</option>${Object.entries(EVENTS).filter(([k])=>k!=='session').map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div></div><div id="a-table"></div><button class="btn more" id="a-more" hidden>Xem thêm</button>`;
  $('#a-e').value=s.event;$('#a-e').onchange=e=>{s.event=e.target.value;activity(true);};$('#a-more').onclick=()=>activity(false);}
 const rows=await api('admin_activity',{event:s.event,offset:s.rows.length});s.rows.push(...rows);s.done=rows.length<100;
 $('#a-table').innerHTML=activityTable(s.rows);$('#a-more').hidden=s.done;
}

/* ---------------- Reports / audit / settings ---------------- */
async function reports(){
 const list=await api('admin_reports');
 $('#view').innerHTML=`<div class="head"><div><span class="eyebrow">CỘNG ĐỒNG</span><h1>Báo cáo cần xử lý</h1><p>${list.length} báo cáo đang mở.</p></div></div>
 <div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Người báo cáo</th><th>Bị báo cáo</th><th>Lý do</th><th>Mô tả</th><th></th></tr></thead><tbody>${list.map(r=>`<tr><td>${dt(r.created_at)}</td><td><button class="link" data-user="${r.reporter_id}">${esc(r.reporter_name||r.reporter_email)}</button></td><td><button class="link" data-user="${r.target_id}">${esc(r.target_name||r.target_email)}</button></td><td>${esc(r.reason)}</td><td class="wrap">${esc(r.note||'—')}</td><td><button class="btn" data-resolve="${r.id}">Đóng</button> <button class="btn danger" data-resolve-suspend="${r.id}">Đóng & khóa</button></td></tr>`).join('')||`<tr><td colspan="6">${empty('Không có báo cáo đang mở.')}</td></tr>`}</tbody></table></div>`;
}
async function audit(){
 const list=await api('admin_audit');
 $('#view').innerHTML=`<div class="head"><div><span class="eyebrow">MINH BẠCH</span><h1>Nhật ký quản trị</h1><p>Mọi lần xem hồ sơ, đọc tin nhắn và thay đổi của quản trị viên.</p></div></div>
 <div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>${list.map(a=>`<tr><td>${dt(a.created_at)}</td><td>${esc(AUDIT[a.action]||a.action)}</td><td>${a.target_id?`<button class="link" data-user="${a.target_id}">${esc(a.target_name||a.target_email||a.target_id)}</button>`:'—'}</td><td class="wrap faint">${esc(Object.entries(a.detail||{}).filter(([,v])=>v!==null&&v!==undefined).map(([k,v])=>`${k}: ${v}`).join(' · '))}</td></tr>`).join('')||`<tr><td colspan="4">${empty('Chưa có nhật ký.')}</td></tr>`}</tbody></table></div>`;
}
const fstate={filter:'open'};
async function feedbackView(){
 const list=await api('admin_feedback',{filter:fstate.filter});
 $('#view').innerHTML=`<div class="head"><div><span class="eyebrow">KHÁCH HÀNG</span><h1>Góp ý</h1><p>Gửi từ nút "Góp ý" ở trang đăng nhập và chân trang. Mỗi thiết bị 1 góp ý/24 giờ. Địa chỉ mạng chỉ lưu dạng mã hóa để chống spam.</p></div><div class="toolbar"><select id="fb-f" aria-label="Lọc"><option value="open">Chưa xử lý</option><option value="done">Đã xử lý</option><option value="all">Tất cả</option></select></div></div>
 <div class="table-wrap"><table><thead><tr><th style="width:150px">Thời gian</th><th>Nội dung</th><th style="width:200px">Người gửi</th><th style="width:190px"></th></tr></thead><tbody>${list.map(f=>`<tr><td>${dt(f.created_at)}</td><td class="wrap">${esc(f.body)}</td><td>${f.user_id?`<button class="link" data-user="${f.user_id}">${esc(f.name||f.email||'Thành viên')}</button>`:'<span class="faint">Khách chưa đăng nhập</span>'}<br><span class="faint small">${esc(deviceShort(f.device))}</span></td><td><button class="btn" data-fb-done="${f.id}" data-v="${!f.resolved}">${f.resolved?'Mở lại':'Đã xử lý'}</button> <button class="btn danger" data-fb-del="${f.id}">Xóa</button></td></tr>`).join('')||`<tr><td colspan="4">${empty('Chưa có góp ý.')}</td></tr>`}</tbody></table></div>`;
 $('#fb-f').value=fstate.filter;$('#fb-f').onchange=e=>{fstate.filter=e.target.value;feedbackView();};
}
function deviceShort(ua=''){const os=/iPhone|iPad/.test(ua)?'iOS':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Mac OS X/.test(ua)?'macOS':'';const br=/Edg\//.test(ua)?'Edge':/CocCoc|coc_coc/i.test(ua)?'Cốc Cốc':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'';return [os,br].filter(Boolean).join(' · ');}
async function teasersView(){
 const list=await api('admin_teasers');
 $('#view').innerHTML=`<div class="head"><div><span class="eyebrow">NỘI DUNG</span><h1>Câu thả thính 🔥</h1><p>Người dùng bấm 🔥 trên thẻ hồ sơ hoặc trong khung chat để gửi nhanh một câu dưới đây. Chỉ câu đang bật mới hiện cho người dùng; số thứ tự nhỏ hiện trước.</p></div></div>
 <form class="card stack" id="t-new" style="margin-bottom:16px"><h2>Thêm câu mới</h2><label for="t-body">Nội dung (tối đa 200 ký tự, có thể dùng emoji)</label><textarea id="t-body" name="body" maxlength="200" rows="2" required placeholder="VD: Nhìn anh là thấy nóng hơn cả Sài Gòn trưa nắng 🔥"></textarea><div class="toolbar"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="active" checked> Bật ngay</label><button class="btn primary">Thêm câu</button></div></form>
 <div class="table-wrap"><table><thead><tr><th style="width:70px">Thứ tự</th><th>Nội dung</th><th style="width:90px">Hiển thị</th><th style="width:170px"></th></tr></thead><tbody>${list.map(t=>`<tr><td><input type="number" value="${t.position}" data-t-pos="${t.id}" style="width:64px" aria-label="Thứ tự"></td><td class="wrap"><textarea data-t-body="${t.id}" maxlength="200" rows="2" style="width:100%" aria-label="Nội dung">${esc(t.body)}</textarea></td><td><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-t-active="${t.id}" ${t.active?'checked':''}> ${t.active?'Đang bật':'Tắt'}</label></td><td><button class="btn" data-t-save="${t.id}">Lưu</button> <button class="btn danger" data-t-del="${t.id}">Xóa</button></td></tr>`).join('')||`<tr><td colspan="4">${empty('Chưa có câu nào.')}</td></tr>`}</tbody></table></div>`;
 $('#t-new').onsubmit=e=>{e.preventDefault();const f=e.target;busy(f,async()=>{await api('admin_teaser_save',{body:f.body.value,active:f.active.checked});toast('Đã thêm câu thả thính.');teasersView();});};
}
/* ---------- Image picker: drag & drop, choose from computer, paste an image or an image link ---------- */
const IMG_ACCEPT='image/jpeg,image/png,image/webp,image/heic,image/heif';
function dropZone(id,{multiple=false,title='Kéo thả ảnh vào đây'}={}){return `<div class="dropzone" id="${id}" tabindex="0" aria-label="${esc(title)}"><input type="file" accept="${IMG_ACCEPT}" ${multiple?'multiple':''} hidden><div class="dz-main"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg><b>${esc(title)}</b><small>hoặc <button type="button" class="link dz-pick">chọn từ máy</button> · dán ảnh (Ctrl+V)</small></div><div class="dz-url"><input type="url" inputmode="url" placeholder="…hoặc dán link ảnh https://" aria-label="Link ảnh"><button type="button" class="btn dz-fetch">Lấy ảnh</button></div><small class="dz-status"></small></div>`;}
function bindDrop(id,onFiles){const z=document.getElementById(id);if(!z)return;const input=z.querySelector('input[type=file]'),url=z.querySelector('.dz-url input'),status=z.querySelector('.dz-status');
 const set=t=>{status.textContent=t||'';};let running=false;
 const run=async files=>{files=files.filter(f=>f&&/^image\//.test(f.type||'image/'));if(!files.length){set('Chỉ nhận ảnh JPG, PNG, WebP hoặc HEIC.');return;}if(running)return;running=true;z.classList.add('busy');try{await onFiles(files,set);}catch(e){set(e.message);toast(e.message);}finally{running=false;z.classList.remove('busy');}};
 const fromURL=async link=>{link=(link||'').trim();if(!/^https:\/\//i.test(link)){set('Dán link ảnh bắt đầu bằng https://');return;}set('Đang lấy ảnh từ link…');try{const f=await fetchImageURL(link);url.value='';await run([f]);}catch(e){set(e.message);}};
 z.querySelector('.dz-pick').onclick=e=>{e.stopPropagation();input.click();};
 z.querySelector('.dz-main').onclick=()=>input.click();
 input.onchange=()=>{const f=[...input.files];input.value='';run(f);};
 z.querySelector('.dz-fetch').onclick=()=>fromURL(url.value);
 url.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();fromURL(url.value);}};
 ['dragenter','dragover'].forEach(t=>z.addEventListener(t,e=>{e.preventDefault();z.classList.add('over');}));
 ['dragleave','drop'].forEach(t=>z.addEventListener(t,e=>{e.preventDefault();if(t==='dragleave'&&z.contains(e.relatedTarget))return;z.classList.remove('over');}));
 z.addEventListener('drop',e=>{const files=[...(e.dataTransfer?.files||[])];if(files.length){run(files);return;}const link=e.dataTransfer?.getData('text/uri-list')||e.dataTransfer?.getData('text/plain');if(link)fromURL(link.split('\n')[0]);});
 z.addEventListener('paste',e=>{if(e.target===url)return;const files=[...(e.clipboardData?.files||[])];if(files.length){e.preventDefault();run(files);return;}const t=e.clipboardData?.getData('text');if(t&&/^https:\/\//i.test(t.trim())){e.preventDefault();fromURL(t);}});}
async function settingsView(){
 let h=null,ls={mode:'slide',interval:6,slides:[]};try{h=await hero();}catch{}try{ls={...ls,...(await api('admin_slides'))};ls.slides=ls.slides||[];}catch(e){toast(e.message);}
 const src=id=>`${config.apiUrl}/hero/${encodeURIComponent(id)}`;
 const cur=themeById(h?.theme).id;
 $('#view').innerHTML=`<div class="head"><div><span class="eyebrow">CÀI ĐẶT</span><h1>Giao diện & hình ảnh</h1><p>Ảnh được lưu trên Backblaze B2 và công khai cho khách chưa đăng nhập. Chỉ dùng ảnh bạn có quyền sử dụng.</p></div></div>
 <section class="card" style="margin-bottom:18px"><h2>Giao diện màu</h2><p class="sub">Theo bộ nhận diện CHI.CH DAO. v1 (6 phối) + Navy · San hô. Áp dụng ngay cho mọi người dùng; đổi theo mùa tùy ý.</p>
  <div class="theme-grid">${THEMES.map(t=>`<button class="theme-card ${t.id===cur?'on':''}" data-theme-pick="${t.id}" aria-pressed="${t.id===cur}" style="--tb:${t.bg};--ta:${t.accent};--tt:${t.text}"><span class="theme-sw"><img src="${t.logo}" alt=""><i></i></span><b>${esc(t.name)}</b><small>${esc(t.note)}</small>${t.id===cur?'<em>Đang dùng</em>':''}</button>`).join('')}</div></section>
 <section class="card" style="margin-bottom:18px"><h2>Lưu trữ ảnh/video trong chat</h2><p class="sub">Tự xóa ảnh/video đã gửi trong chat sau một thời gian để B2 không đầy dần. Nội dung chữ của tin nhắn vẫn giữ. Ảnh/video "tự hủy" luôn bị xóa theo hẹn giờ riêng, không phụ thuộc cài đặt này.</p>
  <form id="ret-form" class="toolbar"><label>Giữ ảnh/video chat <select name="days">${[[0,'Vĩnh viễn'],[30,'30 ngày'],[90,'90 ngày'],[180,'180 ngày'],[365,'1 năm']].map(([v,l])=>`<option value="${v}" ${Number(ls.chatDays||0)===v?'selected':''}>${l}</option>`).join('')}</select></label><button class="btn primary">Lưu</button></form></section>
 <section class="card" style="margin-bottom:18px"><div class="card-head"><div><h2>Trang đăng nhập (nửa bên phải)</h2><p class="sub">Hiện khi khách chưa đăng nhập hoặc vừa đăng xuất. Tối đa 12 ảnh. Ảnh dọc hoặc vuông, chủ thể ở giữa sẽ đẹp nhất.</p></div></div>
  <form id="ls-form" class="toolbar" style="margin-bottom:14px"><label>Kiểu hiển thị <select name="mode"><option value="slide" ${ls.mode==='slide'?'selected':''}>Slide chuyển ảnh</option><option value="single" ${ls.mode==='single'?'selected':''}>Ảnh đơn (ảnh đầu tiên)</option></select></label><label>Mỗi ảnh (giây) <input name="interval" type="number" min="3" max="30" value="${ls.interval}" style="width:80px"></label><button class="btn primary">Lưu cài đặt</button></form>
  <div class="slide-grid">${ls.slides.map((x,i)=>`<article class="slide-item"><img src="${safeURL(src(x.id))}" alt="Ảnh ${i+1}" loading="lazy"><div class="slide-meta"><label>Thứ tự <input type="number" value="${x.position}" data-s-pos="${x.id}" style="width:64px"></label><button class="btn" data-s-save="${x.id}">Lưu</button><label class="btn">Thay<input type="file" accept="${IMG_ACCEPT}" data-s-replace="${x.id}" data-pos="${x.position}" hidden></label><button class="btn danger" data-del="${x.id}">Xóa</button></div>${i===0&&ls.mode==='single'?'<span class="tag hot slide-badge">Đang dùng</span>':''}</article>`).join('')}</div>
  <div style="margin-top:14px">${dropZone('slide-drop',{multiple:true,title:`Thêm ảnh trang đăng nhập · đang có ${ls.slides.length}/12`})}</div>
  <p class="sub" style="margin-top:8px">Kéo một ảnh thả lên ảnh cũ (hoặc bấm "Thay") để thay: ảnh cũ bị xóa luôn khỏi B2.</p>
 </section>
 <section class="card" style="max-width:640px"><h2>Ảnh hero trang Khám phá</h2><p class="sub">Ảnh lớn ở đầu trang Khám phá sau khi đăng nhập.</p>${h?.src?`<img src="${safeURL(h.src)}" alt="Ảnh hero hiện tại" id="hero-prev" style="border-radius:10px;margin-bottom:14px;max-height:280px;width:100%;object-fit:cover">`:'<img alt="" id="hero-prev" hidden style="border-radius:10px;margin-bottom:14px;max-height:280px;width:100%;object-fit:cover">'}
 <form id="hero-form" class="stack">${dropZone('hero-drop',{title:'Ảnh hero mới'})}<label for="hero-alt">Mô tả ảnh</label><input id="hero-alt" name="alt" maxlength="160" value="${esc(h?.alt||'Sức hút từ cuộc sống đời thường')}"><button class="btn primary">Thay ảnh hero</button></form></section>`;
 $('#ret-form').onsubmit=e=>{e.preventDefault();const f=e.target;busy(f,async()=>{await api('admin_chat_retention',{days:Number(f.days.value)});toast(Number(f.days.value)?`Ảnh/video chat cũ hơn ${f.days.options[f.days.selectedIndex].text} sẽ tự xóa.`:'Giữ ảnh/video chat vĩnh viễn.');});};
 $('#ls-form').onsubmit=e=>{e.preventDefault();const f=e.target;busy(f,async()=>{await api('admin_login_settings',{mode:f.mode.value,interval:Number(f.interval.value)});toast('Đã lưu cài đặt trang đăng nhập.');settingsView();});};
 bindDrop('slide-drop',async(files,set)=>{if(files.length+ls.slides.length>12){set(`Tối đa 12 ảnh (còn trống ${12-ls.slides.length}).`);return;}let n=0;
  for(const f of files){try{set(`Đang nén ảnh ${n+1}/${files.length}…`);const p=await preparePhoto(f);await upload(p.blob,'slide',x=>set(`Đang tải ${n+1}/${files.length} · ${Math.round(x*100)}%`));n++;}catch(err){toast(`${f.name}: ${err.message}`);}}
  toast(`Đã thêm ${n} ảnh.`);settingsView();});
 const replaceSlide=async(oldId,pos,file)=>{toast('Đang thay ảnh…');const p=await preparePhoto(file);
  if(ls.slides.length>=12)await api('admin_delete_media',{id:oldId});
  const id=await upload(p.blob,'slide');await api('admin_slide_order',{id,position:pos});
  if(ls.slides.length<12)await api('admin_delete_media',{id:oldId});
  toast('Đã thay ảnh, ảnh cũ đã xóa khỏi B2.');settingsView();};
 document.querySelectorAll('[data-s-replace]').forEach(inp=>inp.onchange=()=>{const f=inp.files?.[0];if(f)replaceSlide(inp.dataset.sReplace,Number(inp.dataset.pos)||0,f).catch(e=>toast(e.message));});
 document.querySelectorAll('.slide-item').forEach(card=>{const inp=card.querySelector('[data-s-replace]');if(!inp)return;
  card.addEventListener('dragover',e=>{e.preventDefault();card.classList.add('over');});card.addEventListener('dragleave',()=>card.classList.remove('over'));
  card.addEventListener('drop',e=>{e.preventDefault();card.classList.remove('over');const f=[...(e.dataTransfer?.files||[])].find(x=>x.type.startsWith('image/'));if(f)replaceSlide(inp.dataset.sReplace,Number(inp.dataset.pos)||0,f).catch(err=>toast(err.message));});});
 let heroFile=null;
 bindDrop('hero-drop',async(files,set)=>{heroFile=files[0];const prev=$('#hero-prev');prev.src=URL.createObjectURL(heroFile);prev.hidden=false;set(`Đã chọn ${heroFile.name}. Bấm "Thay ảnh hero" để lưu.`);});
 $('#hero-form').onsubmit=e=>{e.preventDefault();const f=e.target;if(!heroFile){toast('Chọn, kéo thả hoặc dán link ảnh hero trước.');return;}busy(f,async()=>{const p=await preparePhoto(heroFile);const id=await upload(p.blob,'hero');await api('admin_hero',{id,alt:f.alt.value});heroFile=null;toast('Đã thay ảnh hero, ảnh cũ đã xóa khỏi B2.');settingsView();});};
}

/* ---------------- Illustration profiles (Hồ sơ minh họa) ---------------- */
// Always shown to members with a "MINH HỌA" label; they cannot be messaged, liked or sent 🔥. Off by default.
const INTENTS=['Mối quan hệ nghiêm túc','Hẹn hò thoải mái','Trò chuyện rồi tìm hiểu'];
const S_NAMES=['Minh','Huy','Long','Tú','Khoa','Nam','Phong','Quân','Đạt','Hải','Tuấn','Bảo','Duy','Hoàng','Khang','Lâm','Nhân','Phúc','Sơn','Tài','Thắng','Thịnh','Trí','Trung','Việt','Vũ','An','Bình','Cường','Danh','Dũng','Hiếu','Hưng','Kiên','Lộc','Lực','Mạnh','Nghĩa','Nguyên','Quang','Tâm','Thái','Thành','Thiện','Toàn','Trọng','Tùng','Vinh','Vĩ','Xuân'];
const S_CITIES=['TP. Hồ Chí Minh','TP. Hồ Chí Minh','TP. Hồ Chí Minh','Hà Nội','Hà Nội','Hà Nội','Đà Nẵng','Đà Nẵng','Hải Phòng','Cần Thơ','Khánh Hòa','Lâm Đồng','Huế','Đồng Nai','Bắc Ninh','Quảng Ninh','An Giang','Bangkok, Thái Lan','Singapore'];
const S_BIOS=['Sáng chạy bộ, tối cà phê. Thích người nói chuyện thẳng thắn.','Dân văn phòng ban ngày, tối ra phòng gym xả stress. Tìm người cùng nhịp.','Mê leo núi và cắm trại cuối tuần. Ai đi cùng không?','Thích nấu ăn cho người mình quý. Món tủ là bò kho.','Ít nói lúc đầu, quen rồi nói không ngừng.','Đang tập powerlifting, tìm bạn tập chung và hơn thế nữa.','Yêu biển, yêu nắng, ghét trễ hẹn.','Làm vườn ở quê, lên phố cuối tuần. Giản dị nhưng chân thành.','Thợ kỹ thuật, tay chân lấm lem nhưng tim thì sạch sẽ 😄','Thích xem phim, đi ăn vặt và những buổi tối không vội.','Tập calisthenics ở công viên mỗi sáng. Ghé chào nhé.','Muốn tìm một người để cùng đi du lịch bụi.','Hay cười, thích nghe nhạc acoustic, ghét drama.','PT tự do, sẵn sàng chỉ bài tập miễn phí cho người dễ thương.','Mới chuyển tới thành phố, cần người dẫn đi ăn ngon.','Thích cà phê muối và những cuộc trò chuyện dài.','Đi bơi 3 buổi một tuần. Tìm người cùng giữ thói quen tốt.','Chân thành, rõ ràng, tôn trọng ranh giới của nhau.','Nghiện bóng đá cuối tuần, còn lại dành cho người thương.','Thích chụp ảnh đường phố. Biết đâu bạn là tấm ảnh đẹp nhất.','Không cần hoàn hảo, chỉ cần thật lòng.','Hay dậy sớm, thích nấu bữa sáng cho hai người.'];
const pick=a=>a[Math.floor(Math.random()*a.length)];
function sampleDraft(n){const names=[...S_NAMES].sort(()=>Math.random()-.5);return Array.from({length:n},(_,i)=>({name:names[i%names.length],age:21+Math.floor(Math.random()*20),city:pick(S_CITIES),occupation:pick(occupations.slice(0,5)),bodyType:pick(bodyTypes),lifestyle:pick(lifestyles),training:pick(trainingStyles),intent:pick(INTENTS),bio:pick(S_BIOS)}));}
let sampleList=[];
async function samplesView(){
 const d=await api('admin_samples');sampleList=d.items||[];const noPhoto=sampleList.filter(x=>!x.photos?.length).length;
 const opt=(list,v)=>`<option value="">—</option>`+list.map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('');
 $('#view').innerHTML=`<div class="head"><div><span class="eyebrow">KHÁM PHÁ</span><h1>Hồ sơ minh họa</h1><p>Giúp trang Khám phá không trống trong giai đoạn đầu. Thành viên luôn thấy nhãn <b>MINH HỌA</b> trên thẻ, và bấm vào chỉ mở thông tin giới thiệu; không nhắn tin, thả thính hay thích được. Hiện sau các hồ sơ thật, chỉ ở trang đầu, không hiện khi tìm "ở gần".</p></div></div>
 <section class="card" style="margin-bottom:16px"><div class="toolbar" style="justify-content:space-between;flex-wrap:wrap;gap:10px">
  <label class="switch-line"><input type="checkbox" id="sp-on" ${d.enabled?'checked':''}> <b>Hiển thị trong Khám phá</b> <span class="tag ${d.enabled?'ok':''}">${d.enabled?'Đang bật':'Đang tắt'}</span></label>
  <span class="muted">${sampleList.length}/200 hồ sơ · ${noPhoto} chưa có ảnh</span></div>
  <p class="sub" style="margin-top:10px">Ảnh: dùng ảnh AI hoặc ảnh có bản quyền. <b>Không dùng ảnh người thật khi chưa có sự đồng ý</b> — trên app nam–nam điều này có thể làm lộ danh tính của họ.</p>
  <div class="toolbar" style="flex-wrap:wrap;gap:8px;margin-top:12px">
   <button class="btn primary" id="sp-add">＋ Thêm hồ sơ</button>
   <form id="sp-gen" class="toolbar" style="gap:6px"><label>Tạo nhanh <input name="n" type="number" min="1" max="100" value="${Math.max(1,Math.min(100,50-sampleList.length))||10}" style="width:70px"> hồ sơ (chỉ chữ)</label><button class="btn">Tạo</button></form>
   <label class="btn" title="Chọn nhiều ảnh: gắn lần lượt cho các hồ sơ chưa có ảnh">🖼 Gắn ảnh hàng loạt<input id="sp-bulk" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden></label>
   <button class="btn danger" id="sp-clear" ${sampleList.length?'':'disabled'}>Xóa tất cả</button>
   <small class="muted" id="sp-progress"></small></div>
  <div style="margin-top:12px">${dropZone('sp-drop',{multiple:true,title:'Kéo thả nhiều ảnh: gắn lần lượt cho hồ sơ chưa có ảnh'})}</div></section>
 <div class="slide-grid">${sampleList.map(x=>{const m=x.photos?.[0];return `<article class="slide-item sample-item ${x.active?'':'off'}">${m?`<img src="${safeURL(m.thumb||m.src)}" alt="" loading="lazy">`:`<div class="sample-ph">${esc(x.name[0])}<small>Chưa có ảnh</small></div>`}<div class="slide-meta" style="display:block"><b>${esc(x.name)}, ${x.age}</b><div class="muted small">${esc(x.city)}${x.active?'':' · đang ẩn'}</div><div class="toolbar" style="gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn" data-sp-edit="${x.id}">Sửa</button><label class="btn">Ảnh<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" data-sp-photo="${x.id}" hidden></label><button class="btn danger" data-sp-del="${x.id}">Xóa</button></div></div></article>`;}).join('')||empty('Chưa có hồ sơ minh họa. Bấm "Tạo nhanh" để có sẵn nội dung, rồi gắn ảnh.')}</div>`;
 $('#sp-on').onchange=async e=>{try{await api('admin_samples_toggle',{enabled:e.target.checked});toast(e.target.checked?'Đã bật hồ sơ minh họa.':'Đã tắt hồ sơ minh họa.');samplesView();}catch(err){toast(err.message);}};
 $('#sp-add').onclick=()=>sampleForm(null,opt);
 $('#sp-gen').onsubmit=e=>{e.preventDefault();const f=e.target;busy(f,async()=>{const r=await api('admin_samples_bulk',{items:sampleDraft(Math.max(1,Math.min(100,Number(f.n.value)||1)))});toast(`Đã tạo ${r.count} hồ sơ. Sửa nội dung và gắn ảnh tùy ý.`);samplesView();});};
 $('#sp-clear').onclick=async e=>{if(!confirmInline(e.target,'Bấm lần nữa để xóa hết'))return;try{await api('admin_samples_clear');toast('Đã xóa tất cả hồ sơ minh họa và ảnh của chúng.');samplesView();}catch(err){toast(err.message);}};
 const bulk=async files=>{const targets=sampleList.filter(x=>!x.photos?.length);if(!files.length)return;if(!targets.length){toast('Mọi hồ sơ đều đã có ảnh.');return;}
  const pr=$('#sp-progress');let n=0;for(const [i,f] of files.slice(0,targets.length).entries()){try{pr.textContent=`Đang xử lý ảnh ${i+1}/${Math.min(files.length,targets.length)}…`;await samplePhoto(targets[i],f,x=>{pr.textContent=`Đang tải ${i+1}/${Math.min(files.length,targets.length)} · ${Math.round(x*100)}%`;});n++;}catch(err){toast(`${f.name}: ${err.message}`);}}
  toast(`Đã gắn ${n} ảnh${files.length>targets.length?` (bỏ qua ${files.length-targets.length} ảnh thừa)`:''}.`);samplesView();};
 $('#sp-bulk').onchange=e=>{const f=[...e.target.files];e.target.value='';bulk(f);};
 bindDrop('sp-drop',files=>bulk(files));
 document.querySelectorAll('[data-sp-photo]').forEach(inp=>inp.onchange=async e=>{const f=e.target.files?.[0];if(!f)return;const x=sampleList.find(s=>s.id===inp.dataset.spPhoto);try{$('#sp-progress').textContent=`Đang tải ảnh cho ${x.name}…`;await samplePhoto(x,f);toast('Đã đổi ảnh.');}catch(err){toast(err.message);}samplesView();});
 document.querySelectorAll('[data-sp-edit]').forEach(b=>b.onclick=()=>sampleForm(sampleList.find(s=>s.id===b.dataset.spEdit),opt));
 document.querySelectorAll('[data-sp-del]').forEach(b=>b.onclick=async()=>{if(!confirmInline(b,'Bấm lần nữa'))return;try{await api('admin_sample_delete',{id:b.dataset.spDel});toast('Đã xóa.');samplesView();}catch(err){toast(err.message);}});
}
function sampleFields(x){return {id:x.id,name:x.name,age:x.age,city:x.city,occupation:x.occupation,bodyType:x.bodyType,lifestyle:x.lifestyle,training:x.training,intent:x.intent,bio:x.bio,active:x.active,position:x.position};}
async function samplePhoto(x,file,onProgress){const p=await preparePhoto(file);const id=await upload(p.blob,'sample',onProgress,p.thumb);await api('admin_sample_save',{...sampleFields(x),mediaId:id});}
function sampleForm(x,opt){
 openDrawer(`<div class="drawer-top"><div><span class="eyebrow">HỒ SƠ MINH HỌA</span><h2>${x?'Sửa hồ sơ minh họa':'Thêm hồ sơ minh họa'}</h2></div><button class="x" data-close aria-label="Đóng">×</button></div>
 <form id="sp-form" class="stack sp-form"><label>Tên hiển thị<input name="name" required minlength="2" maxlength="40" value="${esc(x?.name||'')}"></label><label>Tuổi<input name="age" type="number" min="18" max="80" required value="${x?.age||25}"></label>
 <label>Khu vực<input name="city" maxlength="80" value="${esc(x?.city||'')}"></label>
 <label>Nghề nghiệp<select name="occupation">${opt(occupations,x?.occupation)}</select></label><label>Vóc dáng<select name="bodyType">${opt(bodyTypes,x?.bodyType)}</select></label>
 <label>Lối sống<select name="lifestyle">${opt(lifestyles,x?.lifestyle)}</select></label><label>Cách vận động<select name="training">${opt(trainingStyles,x?.training)}</select></label>
 <label>Mong muốn kết nối<select name="intent">${opt(INTENTS,x?.intent)}</select></label><label>Giới thiệu<textarea name="bio" maxlength="400" rows="3">${esc(x?.bio||'')}</textarea></label>
 <div><span class="muted small">Ảnh ${x?.photos?.length?'(để trống nếu giữ ảnh cũ; ảnh cũ sẽ bị xóa khỏi B2 khi thay)':''}</span><img id="sp-prev" alt="" hidden style="width:120px;aspect-ratio:3/4;object-fit:cover;border-radius:10px;margin:8px 0">${dropZone('sp-form-drop',{title:'Ảnh hồ sơ minh họa'})}</div>
 <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="active" ${x?.active===false?'':'checked'}> Hiển thị hồ sơ này</label><button class="btn primary">Lưu</button></form>`);
 let spFile=null;bindDrop('sp-form-drop',async(files,set)=>{spFile=files[0];const pv=$('#sp-prev');pv.src=URL.createObjectURL(spFile);pv.hidden=false;set(`Đã chọn ${spFile.name}.`);});
 $('#sp-form').onsubmit=e=>{e.preventDefault();const f=e.target;busy(f,async()=>{const data={...(x?{id:x.id,position:x.position}:{}),name:f.name.value,age:Number(f.age.value),city:f.city.value,occupation:f.occupation.value,bodyType:f.bodyType.value,lifestyle:f.lifestyle.value,training:f.training.value,intent:f.intent.value,bio:f.bio.value,active:f.active.checked};
  const file=spFile;if(file){const p=await preparePhoto(file);data.mediaId=await upload(p.blob,'sample',null,p.thumb);}
  await api('admin_sample_save',data);toast('Đã lưu.');closeDrawer();samplesView();});};
}

/* ---------------- Global clicks ---------------- */
document.addEventListener('click',async e=>{
 const el=e.target.closest('[data-user],[data-close],[data-thread],[data-view],[data-del],[data-resolve],[data-resolve-suspend],[data-t-save],[data-t-del],[data-s-save],[data-theme-pick],[data-fb-done],[data-fb-del]');if(!el)return;
 try{
  if(el.dataset.close!==undefined){closeDrawer();return;}
  if(el.dataset.themePick){el.disabled=true;await api('admin_theme',{theme:el.dataset.themePick});toast(`Đã đổi giao diện: ${themeById(el.dataset.themePick).name}`);settingsView();return;}
  if(el.dataset.fbDone){await api('admin_feedback_resolve',{id:el.dataset.fbDone,resolved:el.dataset.v==='true'});feedbackView();return;}
  if(el.dataset.fbDel){if(!confirmInline(el,'Bấm lần nữa để xóa'))return;await api('admin_feedback_delete',{id:el.dataset.fbDel});toast('Đã xóa góp ý.');feedbackView();return;}
  if(el.dataset.sSave){const id=el.dataset.sSave;await api('admin_slide_order',{id,position:Number(document.querySelector(`[data-s-pos="${id}"]`).value)||0});toast('Đã lưu thứ tự.');settingsView();return;}
  if(el.dataset.tSave){const id=el.dataset.tSave;el.disabled=true;try{await api('admin_teaser_save',{id,body:document.querySelector(`[data-t-body="${id}"]`).value,active:document.querySelector(`[data-t-active="${id}"]`).checked,position:Number(document.querySelector(`[data-t-pos="${id}"]`).value)||0});toast('Đã lưu.');teasersView();}finally{el.disabled=false;}return;}
  if(el.dataset.tDel){if(!confirmInline(el,'Bấm lần nữa để xóa'))return;await api('admin_teaser_delete',{id:el.dataset.tDel});toast('Đã xóa.');teasersView();return;}
  if(el.dataset.user){await userDetail(el.dataset.user);return;}
  if(el.dataset.thread){const [a,b]=el.dataset.thread.split('|');el.parentElement.querySelectorAll('.convo').forEach(c=>c.classList.toggle('active',c===el));let names={};try{names=JSON.parse(el.dataset.names||'{}');}catch{}await thread(a,b,$('#drawer').open?$('#d-thread'):$('#c-thread'),names);return;}
  if(el.dataset.view){const m=mediaIndex.get(el.dataset.view)||findMedia(el.dataset.view);if(!m)return;$('#viewer-body').innerHTML=`<div class="viewer-inner"><div style="display:flex;justify-content:space-between;align-items:center"><b>${esc(m.owner_name||m.caption||'')}</b><button class="x" onclick="this.closest('dialog').close()" aria-label="Đóng">×</button></div>${m.kind==='video'?`<video src="${safeURL(m.src)}" controls autoplay playsinline></video>`:`<img src="${safeURL(m.src)}" alt="${esc(m.caption||'')}">`}${m.caption?`<p class="muted">${esc(m.caption)}</p>`:''}</div>`;$('#viewer').showModal();return;}
  if(el.dataset.del){if(!confirmInline(el,'Bấm lần nữa để xóa'))return;await api('admin_delete_media',{id:el.dataset.del});toast('Đã xóa file.');el.closest('.tile')?.remove();if(tab==='settings')settingsView();return;}
  if(el.dataset.resolve){await api('admin_resolve',{id:el.dataset.resolve,suspend:false});toast('Đã đóng báo cáo.');render();return;}
  if(el.dataset.resolveSuspend){if(!confirmInline(el,'Bấm lần nữa để khóa'))return;await api('admin_resolve',{id:el.dataset.resolveSuspend,suspend:true});toast('Đã đóng báo cáo và khóa tài khoản.');render();return;}
 }catch(err){toast(err.message);}
});
function confirmInline(el,text){if(el.dataset.armed)return true;el.dataset.armed='1';const old=el.textContent;el.textContent=text;setTimeout(()=>{delete el.dataset.armed;el.textContent=old;},3500);return false;}
function findMedia(id){for(const m of document.querySelectorAll('[data-view]'))if(m.dataset.view===id){const img=m.querySelector('img,video');return {id,src:img?.src,kind:img?.tagName==='VIDEO'?'video':'image'};}return null;}
$('#drawer').addEventListener('click',e=>{if(e.target===$('#drawer'))closeDrawer();});
$('#viewer').addEventListener('click',e=>{if(e.target===$('#viewer'))$('#viewer').close();});
$('#viewer').addEventListener('close',()=>{$('#viewer-body').innerHTML='';});

/* ---------------- Boot ---------------- */
if(!configured){gate('Chưa cấu hình dịch vụ. Điền supabaseUrl, supabaseKey và apiUrl trong config.js.',false);}
else{gate('Đang kiểm tra phiên đăng nhập…',false);supabase.auth.onAuthStateChange((event,s)=>setTimeout(()=>onAuth(event,s),0));}
