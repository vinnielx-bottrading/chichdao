# Cloudflare Worker + Backblaze B2 + Supabase

## Vai trò từng dịch vụ

| Dịch vụ | Vai trò | Ai truy cập |
|---|---|---|
| **Vercel** | Giao diện web (`dist/`) | Trình duyệt người dùng |
| **Cloudflare Worker** | API trung gian: kiểm tra phiên đăng nhập, đọc/ghi database, tải/đọc/xóa ảnh-video | Trình duyệt gọi Worker |
| **Supabase** | **Database** (PostgreSQL). Đồng thời giữ tài khoản đăng nhập Google/email (Supabase Auth) | Chỉ Worker được đọc/ghi dữ liệu; trình duyệt chỉ dùng để đăng nhập |
| **Backblaze B2** | **Lưu ảnh/video** (bucket private) | Chỉ Worker, bằng S3 API có chữ ký |

```
Trình duyệt ──► Worker ──► Supabase (database)
                    └────► Backblaze B2 (ảnh/video)
Trình duyệt ──► Supabase Auth (chỉ để đăng nhập Google/email)
```

## Cấu trúc lưu trữ trên Backblaze B2

```
chich-dao-media/                      (bucket private)
├── users/<user-id>/images/<media-id>.jpg     ảnh hồ sơ (tối đa 10, ≤ 8 MB, đã nén lại 1600 px, bỏ EXIF)
├── users/<user-id>/videos/<media-id>.mp4     video hồ sơ (tối đa 2, ≤ 20 MB, mp4/webm)
└── site/hero/<media-id>.jpg                  ảnh trang chủ do admin chọn
```
- Tên file do database cấp (`cd_media.object_key`), người dùng không đặt được đường dẫn.
- Trình duyệt **không bao giờ** gọi B2 trực tiếp. Ảnh được xem qua `https://<worker>/media/<id>?…&sig=…`: link ký HMAC, gắn với người xem, hết hạn 10 phút; Worker kiểm tra quyền xem (chặn, ẩn, khóa) ở mỗi lần tải.
- File được mã hóa SSE-B2 (Worker gửi `x-amz-server-side-encryption: AES256`).

## Bước 1 — Backblaze B2

1. backblaze.com → **B2 Cloud Storage → Buckets → Create a Bucket**
   - Bucket Unique Name: `chich-dao-media` (hoặc tên khác, nhớ sửa `B2_BUCKET`)
   - Files in Bucket are: **Private**
   - Default Encryption: **Enable**
   - Object Lock: Disable
2. Ghi lại **Endpoint** của bucket, ví dụ `s3.us-west-004.backblazeb2.com` → `B2_REGION` = `us-west-004`.
3. **Lifecycle Settings** của bucket: chọn **Keep only the last version of the file** (để file đã xóa không còn bản ẩn).
4. **Application Keys → Add a New Application Key**
   - Name: `chich-dao-worker`
   - Allow access to Bucket: **chỉ** `chich-dao-media`
   - Type of Access: **Read and Write**
   - Ghi lại `keyID` → `B2_KEY_ID` và `applicationKey` → `B2_APPLICATION_KEY` (chỉ hiện 1 lần).
   - Không dùng Master Application Key.
5. Không cần cấu hình CORS trên B2 (trình duyệt không gọi B2).

## Bước 2 — Supabase

1. SQL Editor → chạy toàn bộ `supabase/schema.sql` **một lần**.
2. Project Settings → API Keys → lấy **Secret key** (`sb_secret_...`) hoặc legacy **service_role** → dùng cho `SUPABASE_SERVICE_ROLE_KEY`.
3. Authentication → Providers: bật **Google** (Client ID/Secret từ Google Cloud) và **Email**.
4. Authentication → URL Configuration: Site URL = domain Vercel; Redirect URLs thêm `https://<domain>/` và `https://<domain>/admin.html`.
5. Không bật Anonymous sign-ins.

## Bước 3 — Cloudflare Worker

**Qua Dashboard:** Workers & Pages → Create → Create Worker → tên `chich-dao-api` → Deploy → **Edit code** → xóa code mẫu, dán toàn bộ `cloudflare/worker.js` → Deploy.
Sau đó **Settings → Variables and Secrets** thêm biến bên dưới, và **Settings → Triggers → Cron** thêm `*/30 * * * *`.

**Hoặc bằng Wrangler:**
```sh
npm ci && npm run build
npx wrangler login
npx wrangler deploy --config cloudflare/wrangler.toml
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config cloudflare/wrangler.toml
npx wrangler secret put B2_KEY_ID --config cloudflare/wrangler.toml
npx wrangler secret put B2_APPLICATION_KEY --config cloudflare/wrangler.toml
npx wrangler secret put MEDIA_SIGNING_SECRET --config cloudflare/wrangler.toml
```

## Biến trên Cloudflare Worker (8 biến)

| Nhóm | Tên | Loại | Giá trị |
|---|---|---|---|
| Supabase (database) | `SUPABASE_URL` | Text | `https://oignkueulvvdfhgcvguv.supabase.co` |
| Supabase (database) | `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Secret key `sb_secret_...` hoặc service_role `eyJ...` |
| Backblaze B2 | `B2_BUCKET` | Text | `chich-dao-media` |
| Backblaze B2 | `B2_REGION` | Text | VD `us-west-004` (phần giữa của Endpoint) |
| Backblaze B2 | `B2_KEY_ID` | **Secret** | keyID của Application Key |
| Backblaze B2 | `B2_APPLICATION_KEY` | **Secret** | applicationKey |
| Ứng dụng | `ALLOWED_ORIGINS` | Text | Domain frontend, phân cách dấu phẩy, không `/` cuối. VD `https://chichdao.vercel.app` |
| Ứng dụng | `MEDIA_SIGNING_SECRET` | **Secret** | Chuỗi ngẫu nhiên ≥ 32 ký tự, giữ cố định |

`B2_ENDPOINT` là tùy chọn — chỉ cần khi endpoint khác dạng `https://s3.<B2_REGION>.backblazeb2.com`.

Kiểm tra: mở `https://chich-dao-api.<tài-khoản>.workers.dev/health`
- `{"ready":true,"storage":"b2"}` → đủ cấu hình.
- `"storage":"none"` → thiếu 1 trong 4 biến B2 (API vẫn chạy, tải ảnh báo chưa cấu hình).
- `"ready":false` → thiếu biến Supabase hoặc biến ứng dụng.

## Biến trên frontend (`dist/config.js`) — công khai, không phải secret

| Tên | Giá trị | Dùng để |
|---|---|---|
| `supabaseUrl` | `https://oignkueulvvdfhgcvguv.supabase.co` | Đăng nhập Google/email (Supabase Auth) |
| `supabaseKey` | `sb_publishable_fPydS416joWqg53YBGFFsQ_CtbiMCEh` | Khóa công khai cho đăng nhập; không đọc được database (mọi bảng đã khóa với trình duyệt) |
| `apiUrl` | `https://chich-dao-api.<tài-khoản>.workers.dev` | Gọi Worker; không `/` cuối |

Sửa `config.js` xong commit lên GitHub để Vercel deploy lại.
