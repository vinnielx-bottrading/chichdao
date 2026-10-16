import {createClient} from '@supabase/supabase-js';
export const config=window.CHICH_CONFIG||{};
export const configured=!!(config.supabaseUrl&&config.supabaseKey&&config.apiUrl);
// Auth/feedback only need Supabase; the Worker URL (apiUrl) is needed for everything else.
export const authReady=!!(config.supabaseUrl&&config.supabaseKey);
export const supabase=authReady?createClient(config.supabaseUrl,config.supabaseKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}):null;
async function token(){if(!supabase)throw new Error('Đăng nhập sẽ mở khi dịch vụ sẵn sàng.');const {data,error}=await supabase.auth.getSession();if(error)throw error;if(!data.session)throw new Error('Vui lòng đăng nhập.');return data.session.access_token;}
async function result(response){const d=await response.json().catch(()=>({error:'Không kết nối được máy chủ API.'}));if(!response.ok)throw new Error(d.error||'Không thể xử lý yêu cầu.');return d;}
export async function api(action,data={}){return result(await fetch(`${config.apiUrl}/api`,{method:'POST',headers:{authorization:`Bearer ${await token()}`,'content-type':'application/json'},body:JSON.stringify({action,data})}));}
export async function hero(){if(!configured)return null;return result(await fetch(`${config.apiUrl}/hero`));}
function putXHR(url,bearer,blob,onProgress){return new Promise((resolve,reject)=>{
 const x=new XMLHttpRequest();x.open('PUT',url);x.setRequestHeader('authorization',`Bearer ${bearer}`);x.setRequestHeader('content-type',blob.type);
 x.upload.onprogress=e=>{if(e.lengthComputable&&onProgress)onProgress(e.loaded/e.total);};
 x.onload=()=>{let d={};try{d=JSON.parse(x.responseText);}catch{}if(x.status>=200&&x.status<300)resolve(d);else reject(new Error(d.error||'Không tải được file. Vui lòng thử lại.'));};
 x.onerror=()=>reject(new Error('Mất kết nối khi tải file. Vui lòng thử lại.'));x.ontimeout=()=>reject(new Error('Tải file quá lâu. Vui lòng thử lại.'));x.timeout=180000;x.send(blob);});}
// Upload through the Worker (which pushes to Backblaze B2). onProgress(0..1) reports real progress.
// An optional small preview (thumb) is uploaded right after the main file; if it fails the full image is used instead.
export async function upload(file,purpose='profile',onProgress,thumb){
 const auth={authorization:`Bearer ${await token()}`};
 const meta={kind:file.type.startsWith('video/')?'video':'image',mime:file.type,bytes:file.size,purpose,...(thumb&&!file.type.startsWith('video/')?{thumbBytes:thumb.size,thumbMime:thumb.type}:{})};
 const slot=await result(await fetch(`${config.apiUrl}/uploads`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify(meta)}));
 const bearer=await token(),share=thumb?.95:1;
 await putXHR(slot.uploadUrl,bearer,file,p=>onProgress?.(Math.min(.99,p*share)));
 if(thumb&&meta.thumbBytes){try{await putXHR(`${slot.uploadUrl}/thumb`,bearer,thumb,p=>onProgress?.(Math.min(.99,share+p*(1-share))));}catch{}}
 onProgress?.(1);return slot.id;
}
export async function removeMedia(id){return result(await fetch(`${config.apiUrl}/media/${encodeURIComponent(id)}`,{method:'DELETE',headers:{authorization:`Bearer ${await token()}`}}));}
export async function signIn(){if(!configured)throw new Error('Đăng nhập sẽ mở khi dịch vụ sẵn sàng.');const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname,queryParams:{prompt:'select_account'}}});if(error)throw error;}
export async function signOut(){if(supabase){const {error}=await supabase.auth.signOut();if(error)throw error;}}
export async function signInPassword(email,password){if(!configured)throw new Error('Đăng nhập sẽ mở khi dịch vụ sẵn sàng.');const {error}=await supabase.auth.signInWithPassword({email:String(email).trim(),password});if(error)throw new Error(/invalid/i.test(error.message)?'Email hoặc mật khẩu không đúng.':error.message);}
export async function adminAuth(payload){return result(await fetch(`${config.apiUrl}/admin/auth`,{method:'POST',headers:{authorization:`Bearer ${await token()}`,'content-type':'application/json'},body:JSON.stringify(payload)}));}

// Feedback goes straight to Supabase (cd_feedback_submit is the only browser-callable RPC; rate-limited server side).
function clientId(){try{let id=localStorage.getItem('chich.client');if(!id){id=crypto.randomUUID();localStorage.setItem('chich.client',id);}return id;}catch{return '';}}
export async function sendFeedback(body){if(!supabase)throw new Error('Thiếu cấu hình Supabase trong config.js.');const {error}=await supabase.rpc('cd_feedback_submit',{p_body:String(body||'').trim(),p_client:clientId()});if(error)throw new Error(error.message||'Chưa gửi được góp ý.');}
// Admin: fetch an image from a public link through the Worker (avoids CORS), returned as a File for compression/upload.
export async function fetchImageURL(url){const r=await fetch(`${config.apiUrl}/admin/fetch-image`,{method:'POST',headers:{authorization:`Bearer ${await token()}`,'content-type':'application/json'},body:JSON.stringify({url})});
 if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'Không tải được ảnh từ link này.');}
 const blob=await r.blob();const ext=blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg';return new File([blob],`link-image.${ext}`,{type:blob.type});}
