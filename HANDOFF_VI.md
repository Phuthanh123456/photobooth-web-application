# Bàn giao CAP Photobooth cho laptop khác

Phương án đã chọn: **ứng dụng Windows chạy tại máy cắm Nikon + trang tải ảnh Render Static Site + Supabase Storage**. Điện thoại phát hotspot 4G/5G cho laptop và iPad. Khách dùng bất kỳ mạng Internet nào để tải ảnh. Chụp, Live View, countdown và ghép frame đều chạy tại laptop; cloud chỉ nhận JPG hoàn chỉnh đã kiểm chứng.

## Người phát triển chuẩn bị một lần

1. Chạy `npm run event:package`. Gói ZIP nằm trong `.local/releases`. Gói có Node, thư viện chạy, giao diện đã build, frame và native bridge của dự án. Không có SDK Nikon, ảnh khách, báo cáo xác minh hoặc mật khẩu của máy phát triển.
2. Tạo Supabase Free project của đội tổ chức; lưu thông tin quản trị tại đội. Chạy `cloud/storage.sql` trong SQL Editor. Bucket `cap-photos` chứa **chỉ JPG đã ghép frame**. Tên file là token ngẫu nhiên, không dùng tên khách. Bất kỳ ai có link đều đọc được ảnh đó; không có trang liệt kê công khai.
3. Trong Authentication, tắt public signup. Tạo và xác nhận một tài khoản uploader riêng cho từng người tổ chức. Chính sách SQL chỉ cho tài khoản đó ghi/đọc quản lý/xóa file trong thư mục UID của mình. Không đưa service_role/secret key vào laptop bàn giao. Khi hết hợp tác, vô hiệu hóa tài khoản uploader; giữ quyền quản trị cloud tại đội.
4. Deploy **chỉ `cloud/guest`** lên Render Static Site: build command `echo Guest site is ready`, publish directory `cloud/guest`. `render.yaml` đã có sẵn cấu hình và header. Có thể upload nguyên thư mục này lên Cloudflare Pages nếu không dùng Git. Không deploy operator hoặc backend Nikon lên Internet. Không cần Node web service, DB Render hay thẻ thanh toán cho static site miễn phí trong giới hạn nhà cung cấp.
5. Chưa có tài khoản/phiên đăng nhập Render hoặc Supabase trong workspace, nên phần mềm không thể tự tạo tài nguyên cloud thật. Không có URL cloud được triển khai giả. Sau khi tạo, người phụ trách chạy **Configure Cloud.cmd** trên máy nhận, nhập project URL, publishable/anon key, tài khoản uploader và origin trang Render. Mật khẩu nhập kín, chỉ lưu tại `.local/cloud-config.json` với quyền Windows của người hiện tại. Trình cấu hình thử tải lên một JPG kiểm tra, đọc lại SHA-256 rồi xóa; không chụp camera.

Nguồn: [Render static sites](https://render.com/docs/static-sites), [Supabase storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Supabase Free limits](https://supabase.com/pricing). Free có quota: theo dõi dung lượng/băng thông trước sự kiện, sao lưu và xóa ảnh theo thời hạn đội đã thông báo; không có chức năng tự xóa ảnh khách trong bản này. Supabase Free có thể pause sau thời gian không hoạt động: kiểm tra và đánh thức project trước buổi chụp.

## Cài lần đầu tại laptop tổ chức

1. Windows 11 x64. Giải nén ZIP vào thư mục có quyền ghi, ví dụ `C:\CAP-Photobooth`; không chạy trong ZIP hoặc Program Files. Không cần cài Node/npm/VS/Python để chạy bản đóng gói.
2. Cài/giải nén **Nikon SDK đúng phiên bản đã kiểm tra S-SDKZ-210BF-ALLIN** theo giấy phép Nikon. SDK không được kèm ZIP. Máy cần runtime Windows/Nikon mà SDK yêu cầu; bộ runtime khác với môi trường lập trình. Không lấy DLL từ nguồn lạ.
3. Cắm Z30 qua USB, bật máy, đóng hoàn toàn NX Tether và các phần mềm camera khác.
4. Chạy **Setup Camera.cmd**, chọn thư mục SDK. Công cụ kiểm tra profile, sau đó yêu cầu gõ chính xác `CAPTURE ONE REAL PHOTO` để xác minh đúng **một ảnh**. Không tự bấm shutter nếu chưa xác nhận; nếu lỗi, dừng và xem báo cáo, không tự chụp lại. Camera/SDK/profile/bridge đổi thì phải xác minh lại. Báo cáo trên laptop lập trình không được tự đem sang mở khóa máy nhận.
5. Chạy **Configure Cloud.cmd** như trên. Không gửi file cấu hình mật khẩu qua Git hoặc gộp lại vào ZIP công khai.
6. Kết nối hotspot tin cậy, đặt kết nối Windows thành **Private**. Nhấp phải **Allow iPad Network.cmd → Run as administrator** một lần. Chỉ cổng giao diện 5180 trên mạng Private/LocalSubnet được mở. Không tắt Firewall, không mở cổng backend 3010 hay cổng quản lý camera.

## Mỗi buổi chụp

1. Điện thoại tổ chức bật hotspot và 4G/5G; laptop + iPad cùng vào hotspot đó. Giữ điện thoại có nguồn, không tắt hotspot khi khóa màn hình. Nếu hotspot chặn hai thiết bị truy cập nhau, dùng router du lịch: laptop/iPad vào router, router lấy Internet từ điện thoại. Cùng SSID không bảo đảm hotspot cho phép truy cập giữa thiết bị.
2. Cắm/bật Z30, đóng NX Tether, chạy **Start Photobooth.cmd**. Trình duyệt operator tự mở `http://localhost:5180/operator`. Không tự bắt đầu phiên hay chụp ảnh khi mở phần mềm.
3. Cửa sổ CAP in địa chỉ `/display` cho các IP hiện tại. Trên iPad mở đúng IP của kết nối hotspot (không chọn VPN/VM/Ethernet không cùng mạng), ví dụ `http://192.168.43.10:5180/display`. IP có thể đổi theo mạng; không dùng cố định địa chỉ laptop lập trình cũ. Có thể thêm trang vào Home Screen của iPad.
4. Operator bấm Start một lần: bốn ảnh, mỗi ảnh đủ 10 giây. Lưu/kiểm chứng ảnh xong mới đếm ảnh tiếp theo. iPad không có điều khiển chụp. Khi hoàn tất, frame lớn hiện ngay và Save As mở trên laptop.
5. JPG được xếp hàng tải lên Supabase; **QR chỉ hiện sau khi đã tải và đọc lại đúng SHA-256**. Mỗi lượt bốn ảnh có token/QR riêng. Khách quét bằng 4G/5G hoặc Wi-Fi, lưu ảnh từ trang khách. Ảnh cloud vẫn tải được sau khi laptop/tunnel tắt, miễn project/cloud còn hoạt động và ảnh chưa bị xóa.
6. Mất Internet: vẫn chụp và lưu tại máy; QR chờ, hàng đợi tải lên tự thử lại 15 giây/lần, tồn tại qua khởi động lại. Việc thử lại chỉ tải JPG, **không bao giờ gửi lại lệnh chụp**. Phiên chụp bị gián đoạn vẫn ERROR và cần operator xử lý.
7. Starting new session giữ link ảnh cũ. Retake có xác nhận sẽ xóa ảnh cloud của chính lượt đó trước khi xóa bản local; nếu mất mạng, reset báo lỗi và giữ bản local để xử lý. Bản khách đã tải hoặc cache bên ngoài không thể thu hồi.
8. Kết thúc, chạy **Stop Photobooth.cmd** hoặc Ctrl+C trong cửa sổ CAP. Công cụ chờ camera/lưu ảnh đang chạy, đóng SDK rồi dừng dịch vụ; không kill tất cả node hoặc camera một cách cưỡng bức. Đợi thông báo CAP stopped trước khi rút USB.

## Chế độ dự phòng và kiểm tra

- **Test Mock.cmd** mở riêng kho `storage/mock-event`, chỉ ảnh giả có nhãn. Không gửi shutter thật. Chỉ một bản CAP event chạy tại một thời điểm; dừng trước khi đổi mode.
- Nếu chưa cấu hình cloud, Start dùng Quick Tunnel tạm thời tới **dịch vụ chỉ chia sẻ ảnh**. Laptop/tunnel phải giữ online và URL đổi khi khởi động lại; đây không phải lưu trữ cloud bền vững. Không có tunnel trong mock trừ khi cấu hình rõ.
- `.local/event-config.json` có thể đặt `sharing: "offline"` để chạy offline không QR, hoặc đổi `frontendPort`, `backendPort`, `sharePort` (mặc định 5180/3010/3011). Sửa firewall theo cổng mới.
- Log: `.local/event-backend.log`; ảnh hoàn chỉnh: `storage/output`; hàng đợi cloud: `storage/cloud-jobs`. Không đưa các thư mục này lên Git. Gói ZIP không chứa mật khẩu; cấu hình riêng từng máy nhận.
- Không chạy đồng thời bản phát triển và bản bàn giao trên cùng Z30. Không mở NX Tether khi CAP đang giữ camera.
- Bản nguồn đã kiểm thử tự động; cần kiểm tra thực tế trên laptop người nhận, hotspot và iPad thật trước sự kiện. Kiểm tra quét QR bằng 4G khi Wi-Fi điện thoại khách đã tắt, rồi dừng laptop để xác nhận ảnh cloud còn tải được.
