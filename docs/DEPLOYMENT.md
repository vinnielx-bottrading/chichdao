# Triển khai backend CHI.CH DAO.

## 1. Chọn dự án Supabase

Chọn hoặc tạo một dự án Supabase riêng cho CHI.CH DAO. Chưa áp dụng schema vào database thật; cần chọn đúng dự án trước khi chạy SQL.

1. Tạo/chọn dự án đích và sao lưu nếu có dữ liệu.
2. Chạy **toàn bộ** `supabase/schema.sql` trong SQL Editor với quyền chủ database. Script tạo bảng tên `cd_*` trong public và schema `chich_private`, không sửa bảng dự án khác. Script dành cho lần cài đầu, không chạy lại sau khi đã cài thành công.
3. Nếu dùng Supabase CLI cho migration, chạy `supabase migration --help`, `supabase migration new chich_dao_initial`, rồi chép nội dung schema vào file được CLI tạo. Không tự đặt timestamp migration.
4. Giữ chỉ `public` trong các schema API cần expose; không thêm `chich_private`.
5. Lấy Project URL, publishable key và legacy service-role JWT key. Service-role key chỉ vào Worker secrets.
6. Không bật anonymous sign-in. Chỉ bật Google nếu sản phẩm chỉ dùng Google.
7. Chạy Security/Performance Advisors và kiểm tra grants theo mục nghiệm thu bên dưới.

## 2. Google OAuth

Trong Google Cloud / Google Auth Platform:

- Tạo OAuth client loại Web application.
- Authorized JavaScript origins: origin website cuối cùng.
- Authorized redirect URI: `https://PROJECT_REF.supabase.co/auth/v1/callback`, hoặc callback chính xác do Supabase Google provider hiển thị.
- Scope cơ bản: `openid`, email, profile. Không yêu cầu Drive/Gmail/Contacts.
- Đặt tên, logo, thông tin liên hệ, chính sách riêng tư, điều khoản và audience theo cấu hình production của bạn; hoàn tất yêu cầu xác minh mà Google áp dụng.
- Nhập Client ID và Client Secret vào **Supabase Authentication → Providers → Google**, không vào frontend.

Trong Supabase Authentication → URL Configuration:

- Site URL: URL website thật.
- Redirect allowlist: URL callback frontend chính xác, ví dụ `https://chich-dao.nguyenhoangvinh456.chatgpt.site/`.
- Client dùng PKCE, Supabase SDK xử lý `?code=...` khi quay lại.
- Popup trượt ở trong site; bước xác thực Google chuyển hướng tới Google rồi quay về, không dùng iframe đăng nhập.

## 3. Backblaze B2

1. Tạo bucket **private**, lấy endpoint S3, region và bucket name.
2. Tạo application key giới hạn đúng bucket, có quyền đọc/ghi/xóa file cần thiết. Không dùng master key.
3. Worker ký các request S3 bằng `aws4fetch`; frontend không nhận B2 credentials và không tải trực tiếp tới B2.
4. Bật mã hóa SSE-B2 (Worker gửi header AES256 khi PUT).
5. Đặt lifecycle cho phiên bản cũ/hidden file. S3 DELETE trên B2 có thể tạo delete marker; cần lifecycle để xóa phiên bản cũ vật lý theo thời hạn bạn công bố. Không mô tả xóa là tức thì ở mọi bản sao/backup.
6. Worker kiểm tra MIME magic bytes, dung lượng thực, sở hữu slot và trạng thái. Nếu cần kiểm duyệt tự động, bổ sung pipeline riêng trước khi cho media chuyển ready; hiện chưa tích hợp dịch vụ quét ảnh/video.

## 4. Cloudflare Worker

Cài Wrangler theo tài liệu Cloudflare hiện hành, kiểm tra `wrangler --help` và đăng nhập tài khoản đúng. Không ghi API token vào git.

Từ root dự án:

```sh
npm ci
npm run build
wrangler deploy --config worker/wrangler.toml
```

Điền các biến qua Cloudflare Dashboard → Worker → Settings → Variables and Secrets:

| Tên | Loại | Nội dung |
| --- | --- | --- |
| SUPABASE_URL | Variable | URL dự án đích |
| SUPABASE_PUBLISHABLE_KEY | Variable | Publishable key |
| SUPABASE_SERVICE_ROLE_KEY | Secret | Legacy service-role JWT key, server only |
| B2_ENDPOINT | Variable | `https://s3.REGION.backblazeb2.com` |
| B2_REGION | Variable | Region đúng bucket |
| B2_BUCKET | Variable | Tên bucket private |
| B2_KEY_ID | Secret | Application key ID giới hạn bucket |
| B2_APPLICATION_KEY | Secret | Application key |
| MEDIA_SIGNING_SECRET | Secret | Chuỗi ngẫu nhiên tối thiểu 32 byte; giữ ổn định giữa các deploy |
| ALLOWED_ORIGINS | Variable | Danh sách origin chính xác, phân cách dấu phẩy |

Không gửi secret trong chat hoặc đặt trong `dist/config.js`. Dùng dashboard/secret manager của tài khoản. `.dev.vars.example` chỉ để tham khảo; `.dev.vars` đã được gitignore.

- `GET /health` trả `ready:true` khi đủ tên biến, **không phải** health check kết nối hoàn chỉnh.
- Cron mỗi 30 phút dọn slot quá 1 giờ, file đang xóa và vị trí hết hạn.
- Cấu hình Cloudflare rate limiting/WAF cho `/api`, `/uploads*` theo tài khoản/gói; DB còn có hạn mức thao tác theo user cho khám phá, vị trí, tin nhắn, báo cáo, upload.
- Không bật logging toàn bộ URL/query/body vì ảnh/video dùng signed URLs.
- Có thể gán domain riêng, ví dụ `api.<domain-cua-ban>`. CORS chỉ cho origin frontend.

## 5. Nối frontend

Sửa `dist/config.js` bằng 3 giá trị công khai:

```js
window.CHICH_CONFIG = {
  supabaseUrl: "https://PROJECT_REF.supabase.co",
  supabaseKey: "sb_publishable_...",
  apiUrl: "https://WORKER_OR_CUSTOM_DOMAIN"
};
```

Không đặt dấu `/` ở cuối `apiUrl`. Bundle không cần build lại khi chỉ đổi `config.js`. Nếu sửa `src/api.js` hoặc Worker, chạy `npm run build`. Phục vụ toàn bộ `dist/` qua HTTPS.

Nếu dùng custom hosting, nên thêm CSP theo đúng origin Supabase/Worker, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: geolocation=(self), camera=(), microphone=()`. Không thêm CSP cho phép rộng chỉ để bỏ lỗi; kiểm tra thực tế trước khi bật enforce.

## 6. Cấp quyền quản trị

Đăng nhập lần đầu bằng Google trên website, rồi tìm UUID chính xác trong Supabase Auth → Users. Thay UUID sau bằng tài khoản của chủ dự án và chạy trong SQL Editor:

```sql
update chich_private.accounts
set is_admin = true
where user_id = 'UUID_CUA_QUAN_TRI_VIEN';
```

Không dùng email chưa kiểm chứng hoặc `user_metadata` để tự cấp quyền. Đăng nhập lại/mở lại trang: menu **Quản trị** xuất hiện. Chọn ảnh hero, mô tả và lưu. Quản trị viên có thể đóng báo cáo hoặc tạm khóa tài khoản bị báo cáo.

Muốn khôi phục tài khoản, dùng SQL Editor với đúng UUID:

```sql
update chich_private.accounts set suspended = false where user_id = 'UUID_CAN_KHOI_PHUC';
```

## 7. Nghiệm thu trước khi mở cộng đồng

1. Google OAuth thành công/thất bại/hủy; callback đúng origin; không có token trong URL sau SDK xử lý.
2. Popup bước 18+ → Google trượt trong cùng dialog, bàn phím không focus bước ẩn. Trên iPhone/Android kiểm tra màn hình nhỏ và giảm chuyển động.
3. Tài khoản mới: nhắc hồ sơ. Đăng xuất rồi đăng nhập lại khi thiếu dữ liệu: nhắc lại. Hồ sơ đủ: không nhắc.
4. Hai tài khoản thật: sửa hồ sơ trên thiết bị A, đăng nhập thiết bị B thấy dữ liệu đã lưu; ảnh/video thật tải B2 và xem được.
5. Tải 10 ảnh; ảnh thứ 11 bị server từ chối. Hai tab cùng tải ở sát giới hạn vẫn không vượt 10. Video không chiếm slot ảnh; tối đa 2.
6. Thử định dạng giả, file quá lớn, expired upload, replay PUT, UUID người khác, gọi thao tác admin bằng tài khoản thường: bị từ chối.
7. Xóa file, xác nhận row bị xóa, B2 key bị gỡ/ẩn và lifecycle loại phiên bản cũ. Thử lỗi B2 để xác nhận cron có thể dọn lại.
8. Tài khoản A chặn B: B không xem profile, media hoặc nhắn cho A; link media đã cấp cũng bị chặn ở lần tải tiếp theo. Kiểm tra ẩn hồ sơ và suspend.
9. Tìm ở gần: từ chối GPS vẫn dùng được lọc khu vực. Cho phép GPS thấy nhóm khoảng cách; API không có lat/lon. Tắt vị trí xóa row ngay. Cập nhật quá nhanh bị hạn chế.
10. Hero đổi từ tài khoản admin và hiển thị trên thiết bị khác; tài khoản thường không thay được.
11. Gửi tin từ A, mở/làm mới ở B nhận đúng tin. Gửi báo cáo và thấy trong Quản trị.
12. Chạy Supabase advisors, kiểm tra `anon`/`authenticated` không gọi được `cd_api` và không đọc bảng. Không có secrets trong source frontend.
13. Điền thông tin pháp nhân/liên hệ, hoàn thiện quy trình xóa tài khoản/xử lý báo cáo, cấu hình backup/retention và giám sát lỗi trước khi mở dịch vụ.

## Tài liệu chính thức đã đối chiếu

- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/api/securing-your-api
- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- https://www.backblaze.com/docs/cloud-storage-deliver-private-backblaze-b2-content-through-cloudflare-cdn
- https://www.backblaze.com/docs/cloud-storage-s3-compatible-api
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/platform/limits/
