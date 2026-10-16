import {api,adminAuth,signIn,signInPassword,signOut,supabase,configured,upload,hero} from './api.js';
import {preparePhoto} from './album.js';

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=s=>{try{const u=new URL(s,location.href);return ['https:','http:','blob:'].includes(u.protocol)?esc(u.href):'';}catch{return '';}};
const num=n=>Number(n||0).toLocaleString('vi-VN');
const dt=s=>s?new Date(s).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const ago=s=>{if(!s)return '—';const m=Math.round((Date.now()-new Date(s))/60000);if(m<1)return 'vừa xong';if(m<60)return `${m} phút trước`;const h=Math.round(m/60);if(h<48)return `${h} giờ trước`;return `${Math.round(h/24)} ngày trước`;};
const bytes=b=>b>1048576?`${(b/1048576).toFixed(1)} MB`:`${Math.round((b||0)/1024)} KB`;
const place=(o)=>[o.city||o.lastCity||o.last_city,o.country||o.lastCountry||o.last_country].filter(Boolean).join(', ')||'—';
const EVENTS={SIGNED_IN:'Đăng nhập',INITIAL_SESSION:'Mở ứng dụng',session:'Mở ứng dụng',USER_UPDATED:'Cập nhật tài khoản',logout:'Đăng xuất',accept_adult:'Xác nhận 18+',profile_save:'Lưu hồ sơ',visibility:'Đổi hiển thị',location:'Bật vị trí',location_off:'Tắt vị trí',like:'Thích',unlike:'Bỏ thích',block:'Chặn',unblock:'Bỏ chặn',report:'Báo cáo',send:'Gửi tin nhắn',finish_media:'Tải ảnh/video',app_installed:'Cài ứng dụng',delete_media:'Xóa ảnh/video'};
const AUDIT={view_user:'Xem hồ sơ',view_chat:'Đọc hội thoại',suspend:'Khóa/mở khóa',delete_media:'Xóa media',resolve_report:'Xử lý báo cáo',create_user:'Tạo người dùng',update_auth:'Đổi email/mật khẩu'};
const ev=e=>EVENTS[e]||e;
const TABS=[['overview','Tổng quan'],['users','Người dùng'],['chats','Tin nhắn'],['media','Ảnh & video'],['activity','Hoạt động'],['reports','Báo cáo'],['audit','Nhật ký admin'],['settings','Cài đặt']];

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
 }catch(e){gate('Không mở được trang quản trị.');$('#gate-status').textContent=e.message;}
 finally{authBusy=false;}
}
$('#g-google').onclick=async()=>{$('#gate-status').textContent='';try{await signIn();}catch(e){$('#gate-status').textContent=e.message;}};
$('#g-email').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;$('#gate-status').textContent='';try{await signInPassword(f.email.value,f.password.value);}catch(err){$('#gate-status').textContent=err.message;}finally{b.disabled=false;}};
$('#logout').onclick=async()=>{try{await api('logout');}catch{}await signOut();};

/* ---------------- Routing ---------------- */
function route(){const h=location.hash.slice(1);tab=TABS.some(([k])=>k===h)?h:'overview';renderTabs();render();}
window.addEventListener('hashchange',()=>{if(me?.admin)route();});
function renderTabs(){$('#tabs').innerHTML=TABS.map(([k,t])=>`<a class="tab ${k===tab?'active':''}" href="#${k}" ${k===tab?'aria-current="page"':''}>${t}${k==='reports'&&stats?.totals?.openReports?`<span class="badge">${stats.totals.openReports}</span>`:''}</a>`).join('');}
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
 <div class="kpis">${k('Tài khoản đăng ký',t.users,`${num(t.complete)} hồ sơ hoàn thiện`)}${k('Hoạt động 24 giờ',t.active24h,`${num(t.active7d)} trong 7 ngày`)}${k('Tin nhắn',t.messages,`${num(t.messages24h)} trong 24 giờ`)}${k('Cuộc trò chuyện',t.conversations)}${k('Ảnh',t.images)}${k('Video',t.videos)}${k('Lượt thích',t.likes)}${k('Báo cáo mở',t.openReports)}${k('Đang bật tìm gần',t.nearby)}${k('Đang hiển thị',t.visible)}${k('Bị khóa',t.suspended)}${k('Lượt chặn',t.blocks)}${k('Đã cài app',t.installed)}${k('Ảnh/video trong chat',t.chatMedia)}</div>
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
 const thumb=m.src?(m.kind==='video'?`<video src="${safeURL(m.src)}" preload="metadata" muted playsinline></video>`:`<img src="${safeURL(m.src)}" alt="${esc(m.caption||'Ảnh người dùng')}" loading="lazy">`):`<span class="noimg">${m.status&&m.status!=='ready'?esc(m.status):'Chưa có kho ảnh'}</span>`;
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
 list.forEach(m=>registerMedia(m.media));el.innerHTML=list.map(m=>`<div class="bubble ${m.sender_id===a?'':'right'}">${(m.media||[]).map(x=>x.src?`<button class="chat-thumb" data-view="${x.id}">${x.kind==='video'?`<video src="${safeURL(x.src)}" preload="metadata" muted playsinline></video>`:`<img src="${safeURL(x.src)}" alt="Ảnh trong tin nhắn" loading="lazy">`}</button>`:'<span class="faint">[Ảnh/video đã xóa]</span>').join('')}${esc(m.body)}<small>${esc(names[m.sender_id]||(m.sender_id===a?'A':'B'))} · ${dt(m.created_at)}</small></div>`).join('')||empty('Không có tin nhắn.');el.scrollTop=el.scrollHeight;
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
async function settingsView(){
 let h=null;try{h=await hero();}catch{}
 $('#view').innerHTML=`<div class="head"><div><span class="eyebrow">CÀI ĐẶT</span><h1>Ảnh trang chủ</h1><p>Cần cấu hình Backblaze B2 trên Worker trước khi tải ảnh.</p></div></div>
 <section class="card" style="max-width:640px"><img src="${safeURL(h?.src||'assets/long-1.jpg')}" alt="Ảnh hero hiện tại" id="hero-prev" style="border-radius:10px;margin-bottom:14px;max-height:280px;width:100%;object-fit:cover">
 <form id="hero-form" class="stack"><label for="hero-img">Ảnh mới (JPG/PNG/WebP)</label><input id="hero-img" name="image" type="file" accept="image/jpeg,image/png,image/webp" required><label for="hero-alt">Mô tả ảnh</label><input id="hero-alt" name="alt" maxlength="160" value="${esc(h?.alt||'Sức hút từ cuộc sống đời thường')}"><button class="btn primary">Thay ảnh hero</button></form></section>`;
 $('#hero-img').onchange=e=>{const f=e.target.files?.[0];if(f)$('#hero-prev').src=URL.createObjectURL(f);};
 $('#hero-form').onsubmit=e=>{e.preventDefault();const f=e.target;busy(f,async()=>{const p=await preparePhoto(f.image.files[0]);const id=await upload(p.blob,'hero');await api('admin_hero',{id,alt:f.alt.value});toast('Đã thay ảnh hero.');});};
}

/* ---------------- Global clicks ---------------- */
document.addEventListener('click',async e=>{
 const el=e.target.closest('[data-user],[data-close],[data-thread],[data-view],[data-del],[data-resolve],[data-resolve-suspend]');if(!el)return;
 try{
  if(el.dataset.close!==undefined){closeDrawer();return;}
  if(el.dataset.user){await userDetail(el.dataset.user);return;}
  if(el.dataset.thread){const [a,b]=el.dataset.thread.split('|');el.parentElement.querySelectorAll('.convo').forEach(c=>c.classList.toggle('active',c===el));let names={};try{names=JSON.parse(el.dataset.names||'{}');}catch{}await thread(a,b,$('#drawer').open?$('#d-thread'):$('#c-thread'),names);return;}
  if(el.dataset.view){const m=mediaIndex.get(el.dataset.view)||findMedia(el.dataset.view);if(!m)return;$('#viewer-body').innerHTML=`<div class="viewer-inner"><div style="display:flex;justify-content:space-between;align-items:center"><b>${esc(m.owner_name||m.caption||'')}</b><button class="x" onclick="this.closest('dialog').close()" aria-label="Đóng">×</button></div>${m.kind==='video'?`<video src="${safeURL(m.src)}" controls autoplay playsinline></video>`:`<img src="${safeURL(m.src)}" alt="${esc(m.caption||'')}">`}${m.caption?`<p class="muted">${esc(m.caption)}</p>`:''}</div>`;$('#viewer').showModal();return;}
  if(el.dataset.del){if(!confirmInline(el,'Bấm lần nữa để xóa'))return;await api('admin_delete_media',{id:el.dataset.del});toast('Đã xóa file.');el.closest('.tile')?.remove();return;}
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
