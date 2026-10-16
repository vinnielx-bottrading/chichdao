import {createClient} from '@supabase/supabase-js';
export const config=window.CHICH_CONFIG||{};
export const configured=!!(config.supabaseUrl&&config.supabaseKey&&config.apiUrl);
export const supabase=configured?createClient(config.supabaseUrl,config.supabaseKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}):null;
async function token(){if(!supabase)throw new Error('Đăng nhập sẽ mở khi dịch vụ sẵn sàng.');const {data,error}=await supabase.auth.getSession();if(error)throw error;if(!data.session)throw new Error('Vui lòng đăng nhập.');return data.session.access_token;}
async function result(response){const d=await response.json().catch(()=>({error:'Không kết nối được máy chủ API.'}));if(!response.ok)throw new Error(d.error||'Không thể xử lý yêu cầu.');return d;}
export async function api(action,data={}){return result(await fetch(`${config.apiUrl}/api`,{method:'POST',headers:{authorization:`Bearer ${await token()}`,'content-type':'application/json'},body:JSON.stringify({action,data})}));}
export async function hero(){if(!configured)return null;return result(await fetch(`${config.apiUrl}/hero`));}
export async function upload(file,purpose='profile'){
 const auth={authorization:`Bearer ${await token()}`};
 const slot=await result(await fetch(`${config.apiUrl}/uploads`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({kind:file.type.startsWith('video/')?'video':'image',mime:file.type,bytes:file.size,purpose})}));
 await result(await fetch(slot.uploadUrl,{method:'PUT',headers:{authorization:`Bearer ${await token()}`,'content-type':file.type},body:file}));return slot.id;
}
export async function removeMedia(id){return result(await fetch(`${config.apiUrl}/media/${encodeURIComponent(id)}`,{method:'DELETE',headers:{authorization:`Bearer ${await token()}`}}));}
export async function signIn(){if(!configured)throw new Error('Đăng nhập sẽ mở khi dịch vụ sẵn sàng.');const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname,queryParams:{prompt:'select_account'}}});if(error)throw error;}
export async function signOut(){if(supabase){const {error}=await supabase.auth.signOut();if(error)throw error;}}
export async function signInPassword(email,password){if(!configured)throw new Error('Đăng nhập sẽ mở khi dịch vụ sẵn sàng.');const {error}=await supabase.auth.signInWithPassword({email:String(email).trim(),password});if(error)throw new Error(/invalid/i.test(error.message)?'Email hoặc mật khẩu không đúng.':error.message);}
export async function adminAuth(payload){return result(await fetch(`${config.apiUrl}/admin/auth`,{method:'POST',headers:{authorization:`Bearer ${await token()}`,'content-type':'application/json'},body:JSON.stringify(payload)}));}
