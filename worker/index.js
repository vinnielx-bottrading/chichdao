import { AwsClient } from 'aws4fetch';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actions=new Set(['me','accept_adult','profile_save','visibility','location','location_off','discover','profile','edit_media','like','block','unblock','report','send','liked','blocked','contacts','messages','admin_hero','admin_reports','admin_resolve']);
const enc=new TextEncoder();
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export function allowedOrigin(origin,env){return (env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).includes(origin);}
export function validConfig(env){return ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','B2_ENDPOINT','B2_BUCKET','B2_REGION','B2_KEY_ID','B2_APPLICATION_KEY','MEDIA_SIGNING_SECRET','ALLOWED_ORIGINS'].every(k=>env[k]);}
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
async function jsonBody(req){try{return JSON.parse(new TextDecoder().decode(await boundedBody(req,16384)));}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Dữ liệu không hợp lệ.');}}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
async function rpc(env,actor,action,data={}){
 const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/cd_api`,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'content-type':'application/json'},body:JSON.stringify({p_actor:actor,p_action:action,p_data:data})});
 const body=await response.json();
 if(!response.ok){const safe=body.code==='P0001'?body.message:'Không thể xử lý yêu cầu. Vui lòng kiểm tra thông tin và thử lại.';throw new HttpError(body.message==='Forbidden'?403:400,safe);}
 return body;
}
async function actor(req,env){
 const token=req.headers.get('authorization');if(!token?.startsWith('Bearer '))throw new HttpError(401,'Vui lòng đăng nhập.');
 const r=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:token}});
 if(!r.ok)throw new HttpError(401,'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
 const user=await r.json();if(!UUID.test(user.id)||user.is_anonymous)throw new HttpError(401,'Vui lòng đăng nhập bằng Google.');return user.id;
}
async function hmac(secret,message){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);return {key,bytes:enc.encode(message)};}
export async function signMedia(secret,id,viewer,expires){const {key,bytes}=await hmac(secret,`${id}:${viewer}:${expires}`);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function verifyMedia(secret,id,viewer,expires,sig){
 if(!UUID.test(id)||!UUID.test(viewer)||!/^\d+$/.test(String(expires))||Number(expires)<Date.now()/1000||Number(expires)>Date.now()/1000+610||!/^[0-9a-f]{64}$/.test(sig||''))return false;
 const {key,bytes}=await hmac(secret,`${id}:${viewer}:${expires}`);return crypto.subtle.verify('HMAC',key,Uint8Array.from(sig.match(/../g),h=>parseInt(h,16)),bytes);
}
async function hydrate(data,viewer,origin,env){
 if(Array.isArray(data))return Promise.all(data.map(x=>hydrate(x,viewer,origin,env)));
 if(!data||typeof data!=='object')return data;
 if(data.photos){const expires=Math.floor(Date.now()/1000)+600;data.photos=await Promise.all(data.photos.map(async m=>({...m,src:`${origin}/media/${m.id}?viewer=${viewer}&expires=${expires}&sig=${await signMedia(env.MEDIA_SIGNING_SECRET,m.id,viewer,expires)}`})));}
 return data;
}
function b2URL(env,key){const base=new URL(env.B2_ENDPOINT);if(base.protocol!=='https:'||!base.hostname.endsWith('.backblazeb2.com'))throw new HttpError(503,'Kho ảnh chưa sẵn sàng.');return `${base.origin}/${encodeURIComponent(env.B2_BUCKET)}/${key.split('/').map(encodeURIComponent).join('/')}`;}
async function b2(env,key,method,body,headers={}){
 const client=new AwsClient({accessKeyId:env.B2_KEY_ID,secretAccessKey:env.B2_APPLICATION_KEY,region:env.B2_REGION,service:'s3'});
 return client.fetch(b2URL(env,key),{method,headers,body});
}
async function deleteObject(env,m){const r=await b2(env,m.object_key,'DELETE');if(!r.ok&&r.status!==404)throw new HttpError(502,'Đang chờ xóa file khỏi kho ảnh. Hệ thống sẽ thử lại.');await rpc(env,null,'cleanup_done',{id:m.id});}
async function readFile(req,env,media){
 const range=req.headers.get('range');if(range&&!/^bytes=\d*-\d*$/.test(range))throw new HttpError(416,'Range không hợp lệ.');
 const upstream=await b2(env,media.object_key,'GET',undefined,range?{range}:{});
 if(!upstream.ok)throw new HttpError(upstream.status===416?416:404,'Không tìm thấy ảnh/video.');
 const headers=new Headers({'content-type':media.mime,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-disposition':'inline','accept-ranges':'bytes'});
 for(const key of ['content-length','content-range'])if(upstream.headers.has(key))headers.set(key,upstream.headers.get(key));
 return new Response(upstream.body,{status:upstream.status,headers});
}
async function handle(req,env){
 const url=new URL(req.url),path=url.pathname;
 if(req.method==='GET'&&path==='/health')return json({ready:!!validConfig(env)});
 if(!validConfig(env))throw new HttpError(503,'Dịch vụ đang được chuẩn bị. Vui lòng quay lại sau.');
 if(req.method==='GET'&&path==='/hero'){
  const hero=await rpc(env,null,'hero');return json({...hero,src:hero.mediaId?`${url.origin}/hero/${hero.mediaId}`:null});
 }
 if(req.method==='GET'&&path.startsWith('/hero/')){const id=path.slice(6);if(!UUID.test(id))throw new HttpError(404,'Không tìm thấy ảnh.');return readFile(req,env,await rpc(env,null,'hero_file',{id}));}
 if(req.method==='GET'&&path.startsWith('/media/')){
  const id=path.slice(7),viewer=url.searchParams.get('viewer'),expires=url.searchParams.get('expires'),sig=url.searchParams.get('sig');
  if(!await verifyMedia(env.MEDIA_SIGNING_SECRET,id,viewer,expires,sig))throw new HttpError(403,'Liên kết ảnh hết hạn. Hãy tải lại hồ sơ.');
  return readFile(req,env,await rpc(env,viewer,'media_file',{id}));
 }
 const user=await actor(req,env);
 if(req.method==='POST'&&path==='/api'){
  const {action,data={}}=await jsonBody(req);if(!actions.has(action))throw new HttpError(400,'Thao tác không hợp lệ.');
  const result=await rpc(env,user,action,data);return json(await hydrate(result,user,url.origin,env));
 }
 if(req.method==='POST'&&path==='/uploads'){
  const data=await jsonBody(req);const m=await rpc(env,user,'reserve_media',data);return json({id:m.id,uploadUrl:`${url.origin}/uploads/${m.id}`});
 }
 if(req.method==='PUT'&&path.startsWith('/uploads/')){
  const id=path.slice(9);if(!UUID.test(id))throw new HttpError(400,'File không hợp lệ.');
  const m=await rpc(env,user,'claim_media',{id});
  try{
   const bytes=await boundedBody(req,m.bytes);
   if(bytes.byteLength!==m.bytes||sniffMime(bytes)!==m.mime)throw new HttpError(415,'Nội dung file không khớp định dạng đã chọn.');
   const stored=await b2(env,m.object_key,'PUT',bytes,{'content-type':m.mime,'x-amz-server-side-encryption':'AES256'});
   if(!stored.ok)throw new HttpError(502,'Chưa tải được file. Vui lòng thử lại.');
   await rpc(env,user,'finish_media',{id});return json({id});
  }catch(error){await rpc(env,user,'delete_media',{id}).catch(()=>{});await deleteObject(env,m).catch(()=>{});throw error;}
 }
 if(req.method==='DELETE'&&path.startsWith('/media/')){
  const id=path.slice(7);if(!UUID.test(id))throw new HttpError(400,'File không hợp lệ.');
  const m=await rpc(env,user,'delete_media',{id});await deleteObject(env,m);return json({deleted:true});
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
  if(allowed){headers.set('access-control-allow-origin',origin);headers.set('vary','Origin');headers.set('access-control-allow-methods','GET, POST, PUT, DELETE, OPTIONS');headers.set('access-control-allow-headers','Authorization, Content-Type, Range');headers.set('access-control-expose-headers','Content-Range, Accept-Ranges');}
  headers.set('x-content-type-options','nosniff');headers.set('referrer-policy','no-referrer');
  return new Response(response.body,{status:response.status,headers});
 },
 async scheduled(_event,env,ctx){ctx.waitUntil((async()=>{if(!validConfig(env))return;await rpc(env,null,'cleanup_expired');for(const m of await rpc(env,null,'cleanup_list'))await deleteObject(env,m).catch(()=>{});})());}
};
