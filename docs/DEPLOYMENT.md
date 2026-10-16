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

## 3–4. Backblaze B2 và Cloudflare Worker

Xem `cloudflare/HUONG-DAN.md`: cấu trúc lưu trữ trên B2, tạo bucket/Application Key, deploy Worker và bảng 8 biến (nhóm Supabase · Backblaze B2 · Ứng dụng).

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

## 6. Quyền quản trị

Quyền admin gắn với **một email duy nhất**: `vinnielx@gmail.com` (bảng `chich_private.settings`). Không cần chạy SQL cấp quyền: đăng nhập bằng email này (Google hoặc email + mật khẩu) là có quyền.

- Trang quản trị: `https://<domain>/admin.html` (thêm URL này vào Redirect URLs của Supabase).
- Đổi email admin sau này (chạy trong SQL Editor):
  ```sql
  update chich_private.settings set admin_email = lower('email-moi@gmail.com');
  ```
- Admin có thể: xem thống kê, toàn bộ người dùng, hồ sơ, ảnh/video, nội dung chat, nhật ký đăng nhập/đăng xuất/hoạt động; tạo tài khoản, đổi email, đặt mật khẩu, khóa/mở khóa, xóa media, xử lý báo cáo, thay ảnh hero.
- Mọi lần admin xem hồ sơ, đọc hội thoại và thay đổi tài khoản được ghi vào `chich_private.admin_audit` (tab Nhật ký admin).
- Vị trí trong nhật ký là quốc gia/vùng/thành phố ước tính theo địa chỉ mạng (Cloudflare), không phải GPS. Tọa độ GPS (làm tròn, hết hạn 24 giờ) chỉ dùng cho tính khoảng cách và không hiển thị trong trang admin.
- Đặt mật khẩu cho người dùng chỉ có tác dụng khi bật nhà cung cấp **Email** trong Supabase Authentication → Providers.

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
