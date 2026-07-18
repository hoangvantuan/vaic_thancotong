# Bộ khung và quy ước kết nối

Tài liệu bàn giao của phiếu **[Bước 1] Tạo bộ khung dự án và quy ước kết nối** (#24).
Người làm các phiếu #25–#30 đọc tệp này là đủ để bắt đầu, không cần tự đặt thêm quy ước.

Từ vựng dùng trong mã bám theo [`CONTEXT.md`](../../CONTEXT.md) ở gốc kho.

## Lệnh chuẩn

| Lệnh | Việc |
|---|---|
| `npm install` | Cài phụ thuộc |
| `npm run dev` | Chạy ứng dụng ở chế độ phát triển |
| `npm run build` | Dựng bản phát hành |
| `npm start` | Chạy bản đã dựng |
| `npm test` | Chạy kiểm thử |
| `npm run test:watch` | Kiểm thử ở chế độ theo dõi |
| `npm run typecheck` | Kiểm tra kiểu |
| `npm run lint` | Kiểm tra định dạng mã |
| **`npm run check`** | **Chạy cả ba: typecheck → lint → test** |

> `npm test` **không** kiểm tra kiểu. Vitest biên dịch từng tệp riêng lẻ nên lỗi kiểu
> trong chính tệp kiểm thử vẫn chạy qua được. Trước khi báo hoàn thành hãy chạy
> `npm run check`, không phải `npm test`.

Khởi động lần đầu:

```bash
cp .env.example .env.local   # rồi điền DEMO_ACCESS_CODE và DEMO_ADMIN_SECRET
npm install
npm run check
npm run dev
```

## Sáu phần và trách nhiệm

Toàn bộ nằm trong **một ứng dụng Next.js**, không có dịch vụ mạng phụ.

| Phần | Vị trí | Chịu trách nhiệm | KHÔNG được làm |
|---|---|---|---|
| Hợp đồng | `lib/core/contracts/` | Định nghĩa mọi định dạng dùng chung | Chứa logic nghiệp vụ |
| Dữ liệu | `lib/core/ports/product-source.ts` + `adapters/` | Đọc sản phẩm, giữ nguyên trạng thái nguồn | Lọc, xếp hạng, diễn giải |
| Xử lý tư vấn | `lib/core/pipeline/` | Lọc, xếp hạng, cổng công bố | Gọi thẳng nhà cung cấp mô hình |
| Mô hình | `lib/core/ports/model-service.ts` + `adapters/` | Trích xuất, diễn đạt | Quyết định sự thật, lọc, công bố |
| Lưu trữ | `lib/core/ports/session-store.ts` + `adapters/` | Phiên, ảnh chụp quyết định, quyền sở hữu | Sửa nội dung đã lưu |
| Giao diện | `app/` | Hiển thị thứ ĐÃ lưu | Hiển thị kết quả chưa qua cổng |
| Đánh giá | `lib/core/testing/` | Dữ liệu mẫu, bộ ca kiểm thử | Sửa hợp đồng cho vừa ca kiểm thử |

Điểm lắp ráp duy nhất: [`lib/core/composition.ts`](../lib/core/composition.ts).

## Ba điểm kết nối thay thế được

| Cổng | Giao diện | Bản giả hiện có | Ai thay bằng bản thật |
|---|---|---|---|
| Nguồn dữ liệu sản phẩm | `ProductSource` | `MockProductSource` | #25 |
| Dịch vụ mô hình | `ModelService` | `MockModelService` | #27 |
| Nơi lưu phiên & quyết định | `SessionStore` | `MemorySessionStore` | #29 |

Bản giả trả kết quả **cố định**, không đọc đĩa, không gọi mạng — nên sáu nhóm ở Bước 2
chạy và kiểm thử được ngay khi các phiếu khác chưa xong.

Tập sản phẩm giả cố ý gồm cả **dữ liệu thiếu** (`mock-ml-002` không công bố giá) và
**dữ liệu mâu thuẫn** (`mock-ml-003` ghi 18000 BTU ở tiêu đề, 17000 ở bảng thông số),
để không nhóm nào lỡ giả định dữ liệu luôn sạch.

## Thứ tự bắt buộc — cưỡng chế bằng kiểu

```
screenProducts → rankProducts → verifyForPublication → saveDecision → hiển thị
```

Mỗi bước trả về một kiểu **mang nhãn** mà chỉ hàm đó tạo được, và bước sau khai báo
tham số đúng kiểu ấy:

| Bước | Chỉ được tạo bởi | Bước sau đòi nó |
|---|---|---|
| `EligibilityReport` | `screenProducts()` | `rankProducts()` |
| `VerifiedTurnResult` | `verifyForPublication()` | `DecisionRecordData.result` |
| `SavedDecisionRecord` | `SessionStore.saveDecision()` | tầng hiển thị |

Gọi sai thứ tự là **lỗi biên dịch**, không phải quy ước phải nhớ. Đã xác minh bằng
`npm run typecheck`: dựng thẳng một `EligibilityReport` bằng tay rồi đưa vào
`rankProducts()` bị chặn với `Property '[brandKey]' is missing`.

Giới hạn đã biết: ép kiểu tường minh (`as unknown as EligibilityReport`) vẫn lách được.
Nhãn kiểu chặn nhầm lẫn, không chặn cố ý.

## Ba loại kết quả một lượt

Đúng ba, không có loại thứ tư — `TurnResult` trong
[`contracts/turn.ts`](../lib/core/contracts/turn.ts):

| Loại | Ràng buộc |
|---|---|
| `ask_one_question` | Trường `question` là chuỗi đơn, **không phải mảng** — không thể hỏi hai câu |
| `recommend` | `OneToThree<T>` là union ba tuple; mảng bốn phần tử không biên dịch được |
| `decline` | Bắt buộc có `whatWouldHelp` — từ chối không phải ngõ cụt |

## Trạng thái dữ liệu

`SourcedValue<T>` trong [`contracts/status.ts`](../lib/core/contracts/status.ts) có
đúng ba tình trạng: `observed`, `absent` (kèm một trong sáu lý do), `conflicting`
(giữ **cả hai** phía, không lấy trung bình, không chọn một).

Không dùng `undefined` mang nghĩa "không biết" — mọi giá trị vắng mặt đều mang theo lý do.

`unverified` ở luật **chạm an toàn** thì đóng an toàn (coi như loại); ở tiêu chí **mềm**
thì giữ nguyên trạng thái, không tự thành điểm yếu.

## Nguồn chứng minh

Sáu trường bắt buộc, thiếu một là hợp đồng vỡ — `validateProvenance()` chặn:

`sourceUrl` · `recordLocation` · `rawValue` (nguyên văn) · `observedAt` (ISO 8601) ·
`normalizedValue` · `transformRule` (bắt buộc có phiên bản dạng `tên@v1`)

## Mã phiên, mã lượt, quyền sở hữu

Máy chủ sinh cả ba; client không được đặt.

**Bất biến theo mã lượt**: gửi lại cùng `turnId` trả nguyên bản ghi cũ và `created: false`
— kể cả khi nội dung gửi lần sau khác. Không có bản ghi thứ hai.

**Ba bí mật khác nhau**:

| Bí mật | Chứng minh | Nguồn |
|---|---|---|
| `DEMO_ACCESS_CODE` | "được phép vào" | biến môi trường, dùng chung |
| `SessionSecret` | "sở hữu đúng phiên này" | máy chủ sinh, lưu dạng băm |
| `DEMO_ADMIN_SECRET` | "được xoá toàn bộ" | biến môi trường, riêng |

Đọc hoặc xoá phiên đòi **cả** mã truy cập chung **lẫn** mã bí mật phiên. Biết mã phiên
là chưa đủ — nên mã phiên được phép công khai. Không có hàm liệt kê phiên người khác.

Phiên không tồn tại và sai mã bí mật trả **cùng một lỗi** `forbidden`, để không dò
được phiên nào có thật.

Chưa cấu hình bí mật thì cổng **từ chối tất cả**, không mở cửa.

## Tuyến API

Mọi tuyến đòi header `x-demo-access-code`. Tuyến chạm phiên đòi thêm `x-session-secret`.

| Tuyến | Việc |
|---|---|
| `POST /api/session` | Tạo phiên. Trả `sessionId` + `sessionSecret` (lần **duy nhất** mã bí mật ở dạng rõ) |
| `DELETE /api/session?sessionId=…` | Khách xoá phiên của chính mình |
| `POST /api/turn` | Chạy một lượt. Gửi lại `turnId` cũ → trả đúng kết quả cũ |

Không có tuyến liệt kê phiên — theo #24 mục 9.

`/api/turn` hiện dùng `EMPTY_RULES`; phiếu #26 thay bằng bộ luật máy lạnh thật.

Tuyến `/api/chat` cũ vẫn chạy qua `lib/agents/orchestrator.ts` và **chưa** đi qua khung
lõi. Chuyển giao diện sang `/api/turn` là việc của #28.

## Còn chưa chốt

- Bản lưu xuống đĩa (#29) cần quyết định định dạng và nơi đặt tệp.
- `MemorySessionStore.getDecision()` quét tuần tự các phiên. Đủ cho bản trình diễn;
  bản lưu đĩa nên đánh chỉ mục theo `turnId`.
- `buildSensitivity()` mới so khoảng cách hạng 1 với hạng 2. #26 mở rộng thành thử
  nhiễu từng dữ kiện.
- Cổng công bố mới kiểm nguồn chứng minh. #27 bổ sung đối chiếu từng con số với giá trị gốc.
