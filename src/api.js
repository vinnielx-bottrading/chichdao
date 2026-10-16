import {createClient} from '@supabase/supabase-js';
export const config=window.CHICH_CONFIG||{};
export const configured=!!(config.supabaseUrl&&config.supabaseKey&&config.apiUrl);
export const supabase=configured?createClient(config.supabaseUrl,config.supabaseKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}):null;
async function token(){if(!supabase)throw new Error('Đăng nhập sẽ mở khi dịch vụ sẵn sàng.');const {data,error}=await supabase.auth.getSession();if(error)throw error;if(!data.session)throw new Error('Vui lòng đăng nhập.');return data.session.access_token;}
async function result(response){const d=await response.json().catch(()=>({error:'Không kết nối được máy chủ API.'}));if(!response.ok)throw new Error(d.error||'Không thể xử lý yêu cầu.');return d;}
export async function api(action,data={}){return result(await fetch(`${config.apiUrl}/api`,{method:'POST',headers:{authorization:`Bearer ${await token()}`,'content-type':'application/json'},body:JSON.stringify({action,data})}));}
export async function hero(){if(!configured)return null;return result(await fetch(`${config.apiUrl}/hero`));}
// Upload through the Worker (which pushes to Backblaze B2). onProgress(0..1) reports real upload progress.
export async function upload(file,purpose='profile',onProgress){
 const auth={authorization:`Bearer ${await token()}`};
 const slot=await result(await fetch(`${config.apiUrl}/uploads`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({kind:file.type.startsWith('video/')?'video':'image',mime:file.type,bytes:file.size,purpose})}));
 const bearer=await token();
 await new Promise((resolve,reject)=>{
  const x=new XMLHttpRequest();x.open('PUT',slot.uploadUrl);
  x.setRequestHeader('authorization',`Bearer ${bearer}`);x.setRequestHeader('content-type',file.type);
  x.upload.onprogress=e=>{if(e.lengthComputable&&onProgress)onProgress(Math.min(.99,e.loaded/e.total));};
  x.onload=()=>{let d={};try{d=JSON.parse(x.responseText);}catch{}if(x.status>=200&&x.status<300){onProgress?.(1);resolve(d);}else reject(new Error(d.error||'Không tải được file. Vui lòng thử lại.'));};
  x.onerror=()=>reject(new Error('Mất kết nối khi tải file. Vui lòng thử lại.'));
  x.ontimeout=()=>reject(new Error('Tải file quá lâu. Vui lòng thử lại.'));x.timeout=180000;
  x.send(file);
 });
 return slot.id;
}
export async function removeMedia(id){return result(await fetch(`${config.apiUrl}/media/${encodeURIComponent(id)}`,{method:'DELETE',headers:{authorization:`Bearer ${await token()}`}}));}
export async function signIn(){if(!configured)throw new Error('Đăng nhập sẽ mở khi dịch vụ sẵn sàng.');const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname,queryParams:{prompt:'select_account'}}});if(error)throw error;}
export async function signOut(){if(supabase){const {error}=await supabase.auth.signOut();if(error)throw error;}}
export async function signInPassword(email,password){if(!configured)throw new Error('Đăng nhập sẽ mở khi dịch vụ sẵn sàng.');const {error}=await supabase.auth.signInWithPassword({email:String(email).trim(),password});if(error)throw new Error(/invalid/i.test(error.message)?'Email hoặc mật khẩu không đúng.':error.message);}
export async function adminAuth(payload){return result(await fetch(`${config.apiUrl}/admin/auth`,{method:'POST',headers:{authorization:`Bearer ${await token()}`,'content-type':'application/json'},body:JSON.stringify(payload)}));}

// Feedback goes straight to Supabase (cd_feedback_submit is the only browser-callable RPC; rate-limited server side).
function clientId(){try{let id=localStorage.getItem('chich.client');if(!id){id=crypto.randomUUID();localStorage.setItem('chich.client',id);}return id;}catch{return '';}}
export async function sendFeedback(body){if(!configured)throw new Error('Dịch vụ chưa sẵn sàng.');const {error}=await supabase.rpc('cd_feedback_submit',{p_body:String(body||'').trim(),p_client:clientId()});if(error)throw new Error(error.message||'Chưa gửi được góp ý.');}
