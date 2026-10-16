import { AwsClient } from 'aws4fetch';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
// Client-callable actions are decided by the database (it rejects unknown ones and checks every permission).
// The Worker only blocks actions that must never come from a browser: media/upload lifecycle, cleanup jobs,
// public hero reads and audit writes. New features in the DB therefore need no Worker redeploy.
const WORKER_ONLY=new Set(['hero','hero_file','cleanup_list','cleanup_expired','cleanup_done','reserve_media','claim_media','finish_media','delete_media','media_file','admin_audit_add']);
export function clientAction(a){return typeof a==='string'&&/^[a-z_]{2,40}$/.test(a)&&!WORKER_ONLY.has(a);}
const enc=new TextEncoder();
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export function allowedOrigin(origin,env){return (env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).includes(origin);}
// Variables by service:
//  Supabase (database; also verifies login sessions): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//  Backblaze B2 (photo/video storage):                B2_BUCKET, B2_REGION, B2_KEY_ID, B2_APPLICATION_KEY [, B2_ENDPOINT]
//  App:                                               ALLOWED_ORIGINS, MEDIA_SIGNING_SECRET
// The core API runs before B2 is configured; uploads/media return 503 until it is.
export const SUPABASE_VARS=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],APP_VARS=['ALLOWED_ORIGINS','MEDIA_SIGNING_SECRET'],B2_VARS=['B2_BUCKET','B2_REGION','B2_KEY_ID','B2_APPLICATION_KEY'];
export function validConfig(env){return [...SUPABASE_VARS,...APP_VARS].every(k=>env[k]);}
export function storageMode(env){return B2_VARS.every(k=>env[k])?'b2':'';}
// B2_REGION may be "ca-east-006" or the full endpoint "s3.ca-east-006.backblazeb2.com" / "https://s3.ca-east-006.backblazeb2.com".
export function b2Region(env){const v=String(env.B2_REGION||'').trim().replace(/^https?:\/\//,'').replace(/\/+$/,'');const m=v.match(/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i);return (m?m[1]:v).toLowerCase();}
export function b2Endpoint(env){return (env.B2_ENDPOINT||`https://s3.${b2Region(env)}.backblazeb2.com`).replace(/\/+$/,'');}
export async function boundedBody(request,max){
 const declared=Number(request.headers.get('content-length'));
 if(declared>max)throw new HttpError(413,'File vượt giới hạn dung lượng.');
 if(!request.body) return new Uint8Array();
 const reader=request.body.getReader(),chunks=[];let length=0;
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw new HttpError(413,'File vượt giới hạn dung lượng.');}chunks.push(value);}
 const body=new Uint8Array(length);let at=0;for(const c of chunks){body.set(c,at);at+=c.length;}return body;
}
export function sniffMime(b){
 if(b.length<12)return '';
 if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if([137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x))return 'image/png';
 const str=(a,z)=>String.fromCharCode(...b.slice(a,z));
 if(str(0,4)==='RIFF'&&str(8,12)==='WEBP')return 'image/webp';
 if(str(4,8)==='ftyp'&&['isom','iso2','mp41','mp42','avc1','M4V '].includes(str(8,12)))return 'video/mp4';
 if(b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3&&new TextDecoder().decode(b.slice(0,128)).includes('webm'))return 'video/webm';
 return '';
}
export function deviceLabel(ua=''){
 const os=/iPhone|iPad/.test(ua)?'iOS':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Mac OS X/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'Khác';
 const br=/Edg\//.test(ua)?'Edge':/OPR\/|Opera/.test(ua)?'Opera':/CocCoc|coc_coc/i.test(ua)?'Cốc Cốc':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Khác';
 return `${os} · ${br}`;
}
// IP-level location estimate from Cloudflare (country/region/city). Never GPS.
function geo(req){const cf=req.cf||{};return {country:String(cf.country||'').slice(0,8),region:String(cf.region||'').slice(0,80),city:String(cf.city||'').slice(0,80),device:deviceLabel(req.headers.get('user-agent')||'')};}
async function jsonBody(req){try{return JSON.parse(new TextDecoder().decode(await boundedBody(req,16384)));}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Dữ liệu không hợp lệ.');}}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
// Accepts either the legacy service_role JWT or a new sb_secret_ key (secret keys go in `apikey` only).
function serviceHeaders(env){const k=env.SUPABASE_SERVICE_ROLE_KEY;return k.startsWith('sb_secret_')?{apikey:k,'content-type':'application/json'}:{apikey:k,Authorization:`Bearer ${k}`,'content-type':'application/json'};}
async function rpc(env,actor,action,data={}){
 const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/cd_api`,{method:'POST',headers:serviceHeaders(env),body:JSON.stringify({p_actor:actor,p_action:action,p_data:data})});
 const body=await response.json();
 if(!response.ok){const safe=body.code==='P0001'?body.message:'Không thể xử lý yêu cầu. Vui lòng kiểm tra thông tin và thử lại.';throw new HttpError(body.message==='Forbidden'?403:/quá nhanh/.test(body.message||'')?429:400,safe);}
 return body;
}
async function actor(req,env){
 const token=req.headers.get('authorization');if(!token?.startsWith('Bearer '))throw new HttpError(401,'Vui lòng đăng nhập.');
 // Session check against Supabase Auth; the project key only identifies the project here.
 const r=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:token}});
 if(!r.ok)throw new HttpError(401,'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
 const user=await r.json();if(!UUID.test(user.id)||user.is_anonymous)throw new HttpError(401,'Vui lòng đăng nhập.');return user;
}
async function hmac(secret,message){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);return {key,bytes:enc.encode(message)};}
export async function signMedia(secret,id,viewer,expires){const {key,bytes}=await hmac(secret,`${id}:${viewer}:${expires}`);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function verifyMedia(secret,id,viewer,expires,sig){
 if(!UUID.test(id)||!UUID.test(viewer)||!/^\d+$/.test(String(expires))||Number(expires)<Date.now()/1000||Number(expires)>Date.now()/1000+610||!/^[0-9a-f]{64}$/.test(sig||''))return false;
 const {key,bytes}=await hmac(secret,`${id}:${viewer}:${expires}`);return crypto.subtle.verify('HMAC',key,Uint8Array.from(sig.match(/../g),h=>parseInt(h,16)),bytes);
}
// Adds a short-lived signed `src` to every media item under `photos` or `media` keys, at any depth.
export async function hydrate(data,viewer,origin,env){
 if(Array.isArray(data))return Promise.all(data.map(x=>hydrate(x,viewer,origin,env)));
 if(!data||typeof data!=='object')return data;
 const expires=Math.floor(Date.now()/1000)+600,out={};
 for(const [k,v] of Object.entries(data)){
  if((k==='photos'||k==='media')&&Array.isArray(v))out[k]=await Promise.all(v.map(async m=>m&&UUID.test(m.id||'')&&(!m.status||m.status==='ready')?{...m,src:`${origin}/media/${m.id}?viewer=${viewer}&expires=${expires}&sig=${await signMedia(env.MEDIA_SIGNING_SECRET,m.id,viewer,expires)}`}:m));
  else out[k]=v&&typeof v==='object'?await hydrate(v,viewer,origin,env):v;
 }
 return out;
}
// ---------- Storage: Backblaze B2 private bucket via the S3-compatible API ----------
// Object layout: users/<uid>/images/<id>.jpg · users/<uid>/videos/<id>.mp4 · site/hero/<id>.jpg
function b2URL(env,key){const base=new URL(b2Endpoint(env));if(base.protocol!=='https:'||!base.hostname.endsWith('.backblazeb2.com'))throw new HttpError(503,'Kho ảnh chưa sẵn sàng.');return `${base.origin}/${encodeURIComponent(env.B2_BUCKET)}/${key.split('/').map(encodeURIComponent).join('/')}`;}
async function b2(env,key,method,body,headers={}){
 const client=new AwsClient({accessKeyId:env.B2_KEY_ID,secretAccessKey:env.B2_APPLICATION_KEY,region:b2Region(env),service:'s3'});
 return client.fetch(b2URL(env,key),{method,headers,body});
}
function requireStorage(env){const mode=storageMode(env);if(!mode)throw new HttpError(503,'Kho ảnh/video chưa được cấu hình. Vui lòng thử lại sau.');return mode;}
async function putObject(env,key,bytes,mime){
 requireStorage(env);
 const r=await b2(env,key,'PUT',bytes,{'content-type':mime,'x-amz-server-side-encryption':'AES256'});if(!r.ok)throw new HttpError(502,'Chưa tải được file. Vui lòng thử lại.');
}
async function deleteObject(env,m){
 if(!storageMode(env))return; // no storage yet: row stays 'deleting'; cron retries later
 const r=await b2(env,m.object_key,'DELETE');if(!r.ok&&r.status!==404)throw new HttpError(502,'Đang chờ xóa file khỏi kho ảnh. Hệ thống sẽ thử lại.');
 await rpc(env,null,'cleanup_done',{id:m.id});
}
async function readFile(req,env,media){
 const range=req.headers.get('range');if(range&&!/^bytes=\d*-\d*$/.test(range))throw new HttpError(416,'Range không hợp lệ.');
 const headers=new Headers({'content-type':media.mime,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-disposition':'inline','accept-ranges':'bytes'});
 requireStorage(env);
 const upstream=await b2(env,media.object_key,'GET',undefined,range?{range}:{});
 if(!upstream.ok)throw new HttpError(upstream.status===416?416:404,'Không tìm thấy ảnh/video.');
 for(const key of ['content-length','content-range'])if(upstream.headers.has(key))headers.set(key,upstream.headers.get(key));
 return new Response(upstream.body,{status:upstream.status,headers});
}
// ---------- Admin: Supabase Auth Admin API (create user, change email/password) ----------
async function authAdmin(req,env,user){
 const me=await rpc(env,user.id,'me',{});if(!me.admin)throw new HttpError(403,'Chỉ quản trị viên được thực hiện.');
 const body=await jsonBody(req),op=body.op;
 const email=typeof body.email==='string'?body.email.trim().toLowerCase():'',password=typeof body.password==='string'?body.password:'';
 if(email&&!EMAIL.test(email))throw new HttpError(400,'Email không hợp lệ.');
 if(password&&(password.length<8||password.length>72))throw new HttpError(400,'Mật khẩu cần 8–72 ký tự.');
 let url,method,payload;
 if(op==='create'){
  if(!email||!password)throw new HttpError(400,'Nhập email và mật khẩu.');
  url=`${env.SUPABASE_URL}/auth/v1/admin/users`;method='POST';payload={email,password,email_confirm:true};
 }else if(op==='update'){
  if(!UUID.test(body.id||''))throw new HttpError(400,'Người dùng không hợp lệ.');
  if(!email&&!password)throw new HttpError(400,'Nhập email mới hoặc mật khẩu mới.');
  if(email&&body.id===user.id)throw new HttpError(400,'Không đổi email của tài khoản quản trị tại đây; quyền admin gắn với email này.');
  url=`${env.SUPABASE_URL}/auth/v1/admin/users/${body.id}`;method='PUT';payload={...(email?{email,email_confirm:true}:{}),...(password?{password}:{})};
 }else throw new HttpError(400,'Thao tác không hợp lệ.');
 const r=await fetch(url,{method,headers:serviceHeaders(env),body:JSON.stringify(payload)});
 const result=await r.json().catch(()=>({}));
 if(!r.ok){const msg=String(result.msg||result.message||result.error_description||'');throw new HttpError(400,/already|exists|registered/i.test(msg)?'Email này đã được sử dụng.':/password/i.test(msg)?'Mật khẩu chưa đạt yêu cầu bảo mật của Supabase.':'Không cập nhật được tài khoản.');}
 const target=result.id||body.id;
 await rpc(env,user.id,'admin_audit_add',{action:op==='create'?'create_user':'update_auth',target,detail:{email:email||null,passwordChanged:!!password}});
 return json({id:target,email:result.email||email});
}
async function handle(req,env){
 const url=new URL(req.url),path=url.pathname;
 if(req.method==='GET'&&path==='/health')return json({ready:validConfig(env),storage:storageMode(env)||'none'});
 if(!validConfig(env))throw new HttpError(503,'Dịch vụ đang được chuẩn bị. Vui lòng quay lại sau.');
 if(req.method==='GET'&&path==='/hero'){
  const hero=await rpc(env,null,'hero');return json({...hero,src:hero.mediaId&&storageMode(env)?`${url.origin}/hero/${hero.mediaId}`:null});
 }
 if(req.method==='GET'&&path.startsWith('/hero/')){const id=path.slice(6);if(!UUID.test(id))throw new HttpError(404,'Không tìm thấy ảnh.');return readFile(req,env,await rpc(env,null,'hero_file',{id}));}
 if(req.method==='GET'&&path.startsWith('/media/')){
  const id=path.slice(7),viewer=url.searchParams.get('viewer'),expires=url.searchParams.get('expires'),sig=url.searchParams.get('sig');
  if(!await verifyMedia(env.MEDIA_SIGNING_SECRET,id,viewer,expires,sig))throw new HttpError(403,'Liên kết ảnh hết hạn. Hãy tải lại hồ sơ.');
  return readFile(req,env,await rpc(env,viewer,'media_file',{id}));
 }
 const user=await actor(req,env);
 if(req.method==='POST'&&path==='/api'){
  const {action,data={}}=await jsonBody(req);
  if(!clientAction(action))throw new HttpError(400,'Thao tác không hợp lệ.');
  const payload={...(data&&typeof data==='object'&&!Array.isArray(data)?data:{})};delete payload._geo;payload._geo=geo(req);
  if(action==='admin_delete_media'){const m=await rpc(env,user.id,'admin_delete_media',payload);await deleteObject(env,m).catch(()=>{});return json({deleted:true});}
  const result=await rpc(env,user.id,action,payload);return json(await hydrate(result,user.id,url.origin,env));
 }
 if(req.method==='POST'&&path==='/admin/auth')return authAdmin(req,env,user);
 if(req.method==='POST'&&path==='/uploads'){
  requireStorage(env);
  const data=await jsonBody(req);const m=await rpc(env,user.id,'reserve_media',data);return json({id:m.id,uploadUrl:`${url.origin}/uploads/${m.id}`});
 }
 if(req.method==='PUT'&&path.startsWith('/uploads/')){
  const id=path.slice(9);if(!UUID.test(id))throw new HttpError(400,'File không hợp lệ.');
  requireStorage(env);
  const m=await rpc(env,user.id,'claim_media',{id});
  try{
   const bytes=await boundedBody(req,m.bytes);
   if(bytes.byteLength!==m.bytes||sniffMime(bytes)!==m.mime)throw new HttpError(415,'Nội dung file không khớp định dạng đã chọn.');
   await putObject(env,m.object_key,bytes,m.mime);
   await rpc(env,user.id,'finish_media',{id,_geo:geo(req)});return json({id});
  }catch(error){await rpc(env,user.id,'delete_media',{id}).catch(()=>{});await deleteObject(env,m).catch(()=>{});throw error;}
 }
 if(req.method==='DELETE'&&path.startsWith('/media/')){
  const id=path.slice(7);if(!UUID.test(id))throw new HttpError(400,'File không hợp lệ.');
  const m=await rpc(env,user.id,'delete_media',{id,_geo:geo(req)});await deleteObject(env,m);return json({deleted:true});
 }
 throw new HttpError(404,'Không tìm thấy trang.');
}
export default {
 async fetch(req,env){
  const origin=req.headers.get('origin'),allowed=origin&&allowedOrigin(origin,env);
  if(origin&&!allowed)return json({error:'Origin không được phép.'},403);
  let response;
  if(req.method==='OPTIONS')response=new Response(null,{status:204});
  else try{response=await handle(req,env);}catch(e){response=json({error:e instanceof HttpError?e.message:'Dịch vụ tạm thời gián đoạn. Vui lòng thử lại.'},e.status||500);}
  const headers=new Headers(response.headers);
  if(allowed){headers.set('access-control-allow-origin',origin);headers.set('vary','Origin');headers.set('access-control-allow-methods','GET, POST, PUT, DELETE, OPTIONS');headers.set('access-control-allow-headers','Authorization, Content-Type, Range');headers.set('access-control-expose-headers','Content-Range, Accept-Ranges');headers.set('access-control-max-age','600');}
  headers.set('x-content-type-options','nosniff');headers.set('referrer-policy','no-referrer');
  return new Response(response.body,{status:response.status,headers});
 },
 async scheduled(_event,env,ctx){ctx.waitUntil((async()=>{if(!validConfig(env))return;await rpc(env,null,'cleanup_expired');if(!storageMode(env))return;for(const m of await rpc(env,null,'cleanup_list'))await deleteObject(env,m).catch(()=>{});})());}
};
