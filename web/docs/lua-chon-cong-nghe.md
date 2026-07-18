# Lựa chọn công nghệ và lý do

Bàn giao cho phiếu #24, việc số 1: *"Kiểm tra kho hiện tại và chọn công nghệ cho máy
chủ, giao diện và lưu trữ."*

## Hiện trạng lúc bắt đầu

Thư mục `web/` đã có sẵn một ứng dụng Next.js chạy được: 6 ngành hàng trong `data/`,
`lib/agents/` (orchestrator, needs-agent, product-agent), `lib/guard/number-guard.ts`,
`lib/data/` (catalog, parsers, phrasebook, category-config), Dockerfile và
docker-compose.

Thiếu so với yêu cầu #24: không có kiểm thử nào, không có tầng lưu trữ, `Plan` có 5
nhánh thay vì 3 loại kết quả, chưa cưỡng chế thứ tự, từ vựng chưa khớp `CONTEXT.md`.

## Quyết định

**Giữ ngăn xếp đang có, bổ sung tầng hợp đồng lõi.** Phiếu #24 yêu cầu *"Ưu tiên công
nghệ đã có trong kho nếu đáp ứng yêu cầu"*, và ngăn xếp hiện tại đáp ứng.

| Hạng mục | Chọn | Lý do |
|---|---|---|
| Máy chủ + giao diện | Next.js 16 (App Router, runtime `nodejs`) | Đã có sẵn và chạy được. Một ứng dụng phục vụ cả API lẫn giao diện, đúng ràng buộc "chỉ triển khai một ứng dụng, không tạo thêm dịch vụ mạng". |
| Ngôn ngữ | TypeScript strict | Đã bật `strict`. Cần thiết vì thứ tự bắt buộc được cưỡng chế bằng kiểu mang nhãn — không có kiểu thì không có cơ chế này. |
| Lưu trữ | `SessionStore` + bản trong bộ nhớ | Xem mục dưới. |
| Mô hình | OpenAI-compatible qua biến môi trường | Đã có. Đổi nhà cung cấp chỉ sửa `.env`, không sửa mã. |
| Kiểm thử | Vitest 4 | Mới thêm. Chạy thẳng TypeScript ESM, không cần bước biên dịch riêng. |
| Triển khai | Docker + docker-compose | Đã có, dựng lại được trong 48 giờ. |

## Lưu trữ: vì sao bắt đầu bằng bản trong bộ nhớ

Đã cân nhắc:

| Phương án | Bỏ vì |
|---|---|
| SQLite (`better-sqlite3`) | Phụ thuộc nhị phân biên dịch theo nền tảng, dễ hỏng bước dựng Docker trong 48 giờ. |
| Postgres | Vi phạm ràng buộc "không tạo thêm dịch vụ mạng". |
| Tệp JSON trên đĩa | Đúng hướng, nhưng cần quyết định định dạng, khoá ghi đồng thời và nơi đặt tệp — phiếu #29 sở hữu quyết định đó. |

Chọn **bản trong bộ nhớ sau giao diện `SessionStore`**. Bản trình diễn chạy một tiến
trình nên đủ dùng, và #29 thay bằng bản lưu đĩa mà không sửa dòng nào ở nơi gọi.

Đánh đổi đã biết: **khởi động lại là mất dữ liệu**. Chấp nhận được ở #24 vì phiếu này
không sở hữu việc lưu bền; #29 phải xử lý trước khi trình diễn thật.

## Ràng buộc tự đặt

- **Không hardcode bí mật.** Mọi bí mật đọc từ biến môi trường; chưa cấu hình thì cổng
  từ chối chứ không mở cửa.
- **Không dùng `undefined` thay cho "không biết".** Mọi giá trị vắng mặt mang theo lý do.
- **Mô hình không có quyền quyết định.** Gọi theo năng lực có kiểu, không có hàm
  `chat(messages)` chung.

## Việc bàn giao lại cho phiếu sau

Mã sẵn có trong `lib/agents/`, `lib/data/`, `lib/guard/` **chưa** được chuyển sang tầng
hợp đồng mới. #24 dựng khung và quy ước; việc chuyển từng phần thuộc #25 (dữ liệu),
#26 (lọc và xếp hạng), #27 (mô hình và cổng công bố).

Hai lối đi cùng tồn tại sau phiếu này: `app/api/chat/route.ts` vẫn chạy qua
`lib/agents/orchestrator.ts` cũ, còn `lib/core/` là khung mới chưa nối vào đường phục
vụ. Nối hai lối là việc của #26 và #31 — cần biết điều này để không tưởng khung mới
đã đang phục vụ khách.
