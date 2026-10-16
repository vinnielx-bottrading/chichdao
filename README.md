# CHI.CH DAO. — v0.5

Ứng dụng hẹn hò nam–nam 18+, cài được như app (PWA). Frontend trên **Vercel**; API là **Cloudflare Worker**; **Supabase** làm database (và đăng nhập Google/email); **Backblaze B2** (bucket private) lưu ảnh/video. Hướng dẫn triển khai: `cloudflare/HUONG-DAN.md`.

## Đưa package này lên GitHub

Giải nén rồi đưa **toàn bộ nội dung bên trong thư mục này** vào thư mục gốc của repository. Giữ nguyên các thư mục `dist/`, `worker/`, `supabase/`, `src/`, `scripts/`, `tests/` và `docs/`, cùng các file `package.json`, `package-lock.json`, `.gitignore`.

**File giao diện chính nằm tại `dist/index.html`.** Ảnh, font, CSS và JavaScript đều được đóng gói trong `dist/`. Không chỉ tải riêng file HTML lên.

Nếu dùng Git trên máy, mở terminal tại thư mục đã giải nén, thay URL repository của bạn:

```sh
git init
git add .
git commit -m "Initial CHI.CH DAO. source"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Các lệnh trên dành cho repository GitHub mới, trống. Nếu đã có repository, chép nội dung vào bản clone hiện tại và commit bình thường; không dùng force push.

Upload lên GitHub chỉ lưu mã nguồn. Để chạy ứng dụng, triển khai frontend với thư mục phục vụ `dist`, áp dụng SQL vào Supabase và triển khai `worker/` lên Cloudflare theo `docs/DEPLOYMENT.md`. Chỉ khai báo secret trên dashboard dịch vụ; không commit file chứa secret.

Package không gồm lịch sử Git, `node_modules`, dữ liệu người dùng, secret hay cấu hình Site riêng. `dist/api.js` đã được build sẵn. File `dist/config.js` để trống, cần điền cấu hình công khai của dự án của bạn.

## Trạng thái bàn giao

- Đã viết frontend, schema thực thi, API Worker, trang quản trị hero, album 10 ảnh, video, hồ sơ, thích/chặn/báo cáo và tin nhắn.
- Popup mở đầu có 2 bước trượt ngang: xác nhận 18+ → đăng nhập Google. Google xác thực trên trang của Google rồi quay lại ứng dụng; không nhúng trang mật khẩu Google vào dialog.
- Nhắc hoàn thiện hồ sơ sau khi đăng nhập/mở lại ứng dụng nếu chưa đủ thông tin. Không nhắc lại chỉ vì token tự gia hạn.
- Đã loại bỏ hồ sơ hư cấu, chat soạn sẵn và các nhãn thử nghiệm khỏi giao diện. Không chuyển dữ liệu prototype thành tài khoản thật.
- **Chưa kết nối môi trường dịch vụ thật:** chưa có dự án Supabase đích được chọn, cấu hình OAuth Google, Worker/B2 và bí mật của các dịch vụ. `dist/config.js` để trống có chủ đích. Khi thiếu cấu hình, đăng nhập dừng với thông báo dịch vụ chưa sẵn sàng; không giả lập đăng nhập thành công.
- Site frontend hiện hữu được cập nhật với quyền truy cập hiện tại. Cần kết nối và kiểm thử dịch vụ thật trước khi mở cho thành viên.

## Cấu trúc

| Đường dẫn | Nội dung |
| --- | --- |
| `dist/index.html`, `dist/app.js`, `dist/styles.css` | Giao diện và luồng người dùng |
| `dist/admin.html`, `dist/admin.js`, `dist/admin.css` | Trang quản trị: thống kê biểu đồ, người dùng, ảnh/video, tin nhắn, hoạt động, báo cáo, nhật ký admin, tạo/đổi email/mật khẩu |
| `dist/config.js` | URL Supabase, publishable key, URL Worker; chỉ dữ liệu công khai |
| `src/api.js` | Supabase SDK/Google PKCE và client API |
| `dist/api.js` | Bundle SDK chạy trên trình duyệt, sinh từ `npm run build` |
| `worker/index.js` | Cloudflare API, kiểm tra phiên, ký request B2, ảnh/video |
| `cloudflare/worker.js`, `cloudflare/wrangler.toml` | Worker đóng gói 1 file + cấu hình; xem `cloudflare/HUONG-DAN.md` |
| `worker/.dev.vars.example` | Mẫu cấu hình; không chứa thông tin tài khoản thật |
| `supabase/schema.sql` | Schema PostgreSQL thực thi, không phải bản SQLite cũ |
| `tests/backend.test.js` | Kiểm tra schema trên PostgreSQL WASM/PGlite và Worker |
| `docs/DEPLOYMENT.md` | Các bước triển khai và nghiệm thu |

## Khởi chạy và kiểm tra

Yêu cầu Node 22 trở lên. Phiên bản thư viện cố định trong `package.json`; commit kèm `package-lock.json`.

```sh
npm ci
npm run check
npm test
npm run build
```

Frontend không còn là một file HTML tự chứa. Phải phục vụ **toàn bộ thư mục `dist/`** qua HTTPS để OAuth và vị trí hoạt động. Không mở bằng `file://`.

Để xem frontend cục bộ sau khi điền cấu hình:

```sh
python -m http.server 8080 --directory dist
```

Thêm `http://localhost:8080` vào CORS Worker và redirect allowlist Supabase cho môi trường phát triển. Không dùng wildcard redirect trong production.

## Quy tắc sản phẩm

- Hồ sơ hoàn thiện: tên 2–40 ký tự, tuổi tự khai 18–80, khu vực, mong muốn kết nối, giới thiệu 20–400 ký tự, xác nhận 18+, ít nhất 1 ảnh đã tải xong.
- Nghề nghiệp, vóc dáng, lối sống, cách vận động là tùy chọn. Có nông dân/làm vườn và công nhân/thợ kỹ thuật.
- Chỉ hồ sơ hoàn thiện, đang hiển thị, không bị khóa và không chặn nhau xuất hiện trong Khám phá. Người chưa hoàn thiện được xem hồ sơ nhưng phải hoàn thiện trước khi gửi lời chào.
- Tối đa **10 ảnh**, mỗi ảnh tối đa **8 MB**; JPEG/PNG/WebP. Frontend mã hóa lại JPEG, tối đa 1600 px cạnh dài, không sao chép EXIF; tối thiểu 200 × 200 px. API kiểm tra chữ ký định dạng và dung lượng. API không có bộ giải mã ảnh đầy đủ hoặc quét nội dung tự động.
- Mặc định **2 video**, mỗi video tối đa **20 MB**, MP4/WebM. Không tự chuyển mã video; khả năng phát tùy codec trình duyệt. Có thể điều chỉnh hạn mức trong SQL và giao diện.
- Giới hạn số file được thực thi dưới transaction và advisory lock theo tài khoản. Slot đang tải cũng tính vào hạn mức. Slot lỗi được dọn, không cho tải đè slot đã hoàn thành.
- Album hỗ trợ xem lớn ảnh/video, chú thích, chọn ảnh đại diện, xóa. Đặt video làm avatar bị từ chối.
- Tin nhắn lưu trong DB, gửi kèm được 1 ảnh (≤ 8 MB) hoặc video (≤ 20 MB) mỗi tin; file tự lưu lên Backblaze B2 tại `users/<uid>/chat/`, chỉ người gửi/nhận và admin xem được. Hiện tải khi mở cuộc trò chuyện hoặc bấm Làm mới. Chưa có WebSocket, push notification hoặc xác nhận đã đọc.
- Tìm ở gần: chỉ lấy GPS sau thao tác cho phép, làm tròn tọa độ đến 0,01 độ; chọn 5/10/25/50/100 km. Chỉ trả nhóm khoảng cách, không trả tọa độ, không sắp xếp theo mét chính xác. Vị trí hết hiệu lực sau 24 giờ, cron xóa bản ghi hết hạn; người dùng tắt để xóa ngay.
- Tìm ở gần dùng Haversine trong PostgreSQL với bộ lọc vĩ độ trước khi tính. Sai số do làm tròn có thể ảnh hưởng hồ sơ sát ranh giới bán kính. Cần chuyển sang PostGIS/GiST khi lượng dữ liệu lớn.
- Tuổi, nghề nghiệp, vóc dáng là thông tin tự khai. Google login không chứng minh người dùng đủ 18 tuổi hoặc xác minh ngoại hình/nghề nghiệp.

## Quyền và dữ liệu

Tất cả bảng bật RLS. `anon` và `authenticated` **không có quyền truy cập trực tiếp** các bảng ứng dụng hoặc RPC. Chỉ Worker được giữ service-role key. Worker xác thực token bằng Supabase `/auth/v1/user`, lấy ID từ kết quả xác thực, không nhận ID người thao tác từ client. RPC `cd_api` chỉ cho `service_role` và kiểm tra sở hữu/quyền theo từng thao tác. Các hàm đều `SECURITY INVOKER`, cố định `search_path`.

Quyền quản trị gắn với một email duy nhất trong `chich_private.settings` (mặc định `vinnielx@gmail.com`), so với email đã xác thực của Supabase Auth; không đọc quyền từ `user_metadata` hay tham số trình duyệt. Trang quản trị: `dist/admin.html`. Mọi truy cập dữ liệu riêng tư và thay đổi của admin được ghi vào `chich_private.admin_audit`. Vị trí và dữ liệu quản trị nằm trong schema riêng, không expose qua Data API.

B2 bucket phải private. Link media có chữ ký HMAC, gắn file + người xem, hết hạn sau 10 phút. Worker kiểm tra lại hiển thị, trạng thái tài khoản và chặn mỗi lần phục vụ file. Link còn hiệu lực có thể được chia sẻ cho người khác trong thời gian đó; đây không phải DRM. Khi ảnh hết hạn, mở lại hồ sơ để lấy link mới. Ảnh hero được chọn là tài nguyên công khai qua một route riêng.

Không có service key, B2 secret hoặc Google client secret trong frontend. Không bật log URL request media vì URL chứa chữ ký. Không lưu tọa độ, token, body tin nhắn trong log tùy biến.

Môi trường production cần chủ dự án cung cấp thông tin liên hệ/đơn vị vận hành cho chính sách riêng tư, quy trình yêu cầu xóa tài khoản và thời gian phản hồi báo cáo. Trang Quản trị đã có danh sách báo cáo và tạm khóa; chưa có xử lý nội dung tự động. Chưa triển khai xóa tài khoản tự phục vụ hoặc xuất toàn bộ dữ liệu cá nhân.

## Kiểm chứng và giới hạn

Đã kiểm tra SQL trên PGlite/PostgreSQL, quyền roles, giới hạn ảnh/video, quyền sở hữu, chặn hai chiều, dữ liệu tọa độ không đi ra API, signed URLs và giới hạn byte tải lên. Đã kiểm tra cú pháp và build bundle.

Chưa chạy browser QA và kiểm thử tích hợp Google/Supabase/Cloudflare/B2 thật. Không coi việc test cục bộ thành công là xác nhận dịch vụ production đã hoạt động. Xem danh sách nghiệm thu trong `docs/DEPLOYMENT.md`.

## Bản quyền hình ảnh và font

Ảnh hero mặc định là tài sản tạo cho dự án, dùng làm hình thương hiệu; không đại diện một thành viên. Không seed ảnh này vào hồ sơ người dùng. Quản trị viên có thể thay bằng ảnh có quyền sử dụng.

Font DejaVu được đóng gói cùng giấy phép ở `dist/assets/FONT-LICENSE.txt`.
