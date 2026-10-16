# Cài API lên Cloudflare Workers

File cần dùng: **`cloudflare/worker.js`** (đã đóng gói sẵn, 1 file, không cần cài thêm gì).

## Cách 1 — Qua Dashboard (không cần terminal)

1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Create Worker** → đặt tên `chich-dao-api` → **Deploy**.
2. Bấm **Edit code**, xóa code mẫu, dán toàn bộ nội dung `cloudflare/worker.js` → **Deploy**.
3. **Settings → Variables and Secrets** → thêm các biến ở bảng dưới.
4. **Settings → Triggers → Cron Triggers** → thêm `*/30 * * * *` (dọn dữ liệu hết hạn mỗi 30 phút).
5. Mở `https://chich-dao-api.<tài-khoản>.workers.dev/health` → phải thấy `{"ready":true,"storage":"none"}`.
6. Chép URL Worker (không có `/` cuối) vào `apiUrl` trong `dist/config.js`, commit để Vercel deploy lại.

## Cách 2 — Bằng Wrangler

```sh
npm ci && npm run build
npx wrangler login
npx wrangler deploy --config cloudflare/wrangler.toml
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config cloudflare/wrangler.toml
npx wrangler secret put MEDIA_SIGNING_SECRET --config cloudflare/wrangler.toml
```
Sửa `ALLOWED_ORIGINS` trong `cloudflare/wrangler.toml` trước khi deploy.

## Biến môi trường

### Bắt buộc ngay (API chạy được, chưa có ảnh/video)

| Tên | Loại | Giá trị |
|---|---|---|
| `SUPABASE_URL` | Text | `https://oignkueulvvdfhgcvguv.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Text | `sb_publishable_fPydS416joWqg53YBGFFsQ_CtbiMCEh` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Supabase → Project Settings → API Keys: dùng **Secret key** (`sb_secret_...`) hoặc **Legacy `service_role`** (`eyJ...`) đều được. Không đưa vào frontend, không gửi qua chat. |
| `MEDIA_SIGNING_SECRET` | **Secret** | Chuỗi ngẫu nhiên ≥ 32 ký tự, giữ cố định. Tạo bằng `openssl rand -hex 32`. |
| `ALLOWED_ORIGINS` | Text | Domain frontend, cách nhau dấu phẩy, không `/` cuối. VD: `https://chichdao.vercel.app,https://chichdao.vn` |

### Kho ảnh/video (cài sau — chọn 1)

**A. Cloudflare R2 (đơn giản nhất):** R2 → Create bucket `chich-dao-media` (private, không bật Public access). Worker → Settings → **Bindings → Add → R2 bucket**, Variable name = **`MEDIA_BUCKET`**, chọn bucket. Không cần key.

**B. Backblaze B2:**

| Tên | Loại | Giá trị |
|---|---|---|
| `B2_ENDPOINT` | Text | `https://s3.<region>.backblazeb2.com` |
| `B2_REGION` | Text | VD `us-west-004` |
| `B2_BUCKET` | Text | Tên bucket private |
| `B2_KEY_ID` | Secret | Application Key ID (giới hạn đúng bucket) |
| `B2_APPLICATION_KEY` | Secret | Application Key |

Khi chưa cấu hình kho: đăng nhập, hồ sơ, khám phá, tin nhắn, trang admin vẫn chạy; tải ảnh/video báo "Kho ảnh/video chưa được cấu hình". Lưu ý: hồ sơ cần ít nhất 1 ảnh mới được tính là hoàn thiện và hiện trong Khám phá.

Sau khi thêm kho, `/health` hiện `"storage":"r2"` hoặc `"b2"`.

## Supabase cần bật

1. Chạy `supabase/schema.sql` (một lần) trong SQL Editor.
2. Authentication → Providers: bật **Google** (Client ID/Secret từ Google Cloud) và **Email** (để đăng nhập bằng mật khẩu do admin cấp).
3. Authentication → URL Configuration: Site URL = domain Vercel; Redirect URLs thêm `https://<domain>/` và `https://<domain>/admin.html`.
4. Không bật Anonymous sign-ins.
