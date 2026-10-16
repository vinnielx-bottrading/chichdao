// Public values only (safe in the browser). Secrets live in Cloudflare Worker settings.
window.CHICH_CONFIG = {
  supabaseUrl: "https://oignkueulvvdfhgcvguv.supabase.co",          // Supabase Auth: đăng nhập Google/email
  supabaseKey: "sb_publishable_fPydS416joWqg53YBGFFsQ_CtbiMCEh",     // khóa công khai; database đã khóa với trình duyệt
  apiUrl: "https://chichdao.vinnielx.workers.dev"                                                         // URL Cloudflare Worker, VD https://chich-dao-api.<tài-khoản>.workers.dev (không / cuối)
};
