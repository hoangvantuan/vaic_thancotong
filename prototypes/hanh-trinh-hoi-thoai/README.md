# Mẫu thử hành trình hội thoại

> **MẪU THỬ, KHÔNG DÙNG TRONG SẢN PHẨM.** Mẫu này chỉ giúp kiểm tra một quyết định thiết kế và không đọc hoặc ghi dữ liệu thật.

## Câu hỏi cần trả lời

Một hành trình tư vấn có thể đi từ lời nói ban đầu tới quan sát, giả thuyết, câu hỏi kiểm chứng và kết quả có giới hạn mà vẫn tự nhiên, không gắn nhãn tâm lý và không hỏi thừa hay không?

Mẫu chỉ kiểm tra **điều phối hội thoại và trạng thái hồ sơ giả thuyết**. Hình thức trình bày ba sản phẩm thuộc một phiếu tạo mẫu khác.

## Cách chạy

Kho không có công cụ chạy chung, nên dùng trực tiếp môi trường Python đã quy định:

```bash
~/.venv/claude/bin/python prototypes/hanh-trinh-hoi-thoai/tui.py
```

Không cần cài thêm gói. Mọi trạng thái nằm trong bộ nhớ và biến mất khi thoát.

## Thiết kế

- `logic.py`: máy trạng thái thuần. Hàm `new_state` tạo phiên và `apply_action` nhận trạng thái cùng hành động để tạo trạng thái mới.
- `tui.py`: lớp tương tác mỏng. Lớp này chỉ đọc phím và hiển thị toàn bộ trạng thái liên quan sau mỗi hành động.
- Mỗi lượt chỉ có một câu hỏi.
- Hệ thống dừng sau tối đa ba câu trong mẫu hoặc sớm hơn khi không còn khoảng trống có giá trị cao.
- Lệnh `u` quay lại yêu cầu xem kết quả hoặc ghi thêm một sự kiện sửa, đánh dấu phản hồi gần nhất đã được thay thế rồi tính lại trạng thái. Phản hồi cũ vẫn còn trong lịch sử nhưng không còn ảnh hưởng quyết định.
- Lệnh `f` ghi nhận việc từ chối và không hỏi lại trường đó trong phiên.
- Lệnh `x` buộc xem kết quả để kiểm tra từ chối có phạm vi khi dữ kiện bắt buộc còn thiếu hoặc mâu thuẫn.

## Ba tình huống

| Tình huống | Điều cần kiểm tra |
|---|---|
| Phòng ngủ, ưu tiên độ êm | Ưu tiên nói trực tiếp được dùng để xếp hạng, ngữ cảnh trẻ nhỏ không tạo nhãn tâm lý |
| Hỏi về tiết kiệm nhưng thiếu hoàn cảnh | Một từ khóa chỉ tạo giả thuyết cần kiểm chứng; thiếu diện tích phải được hỏi trước |
| Diện tích không nhất quán | Mâu thuẫn được giữ lại và giải quyết trước câu hỏi ngân sách hoặc ưu tiên |

## Dấu hiệu mẫu trả lời đúng câu hỏi

1. Quan sát và giả thuyết xuất hiện ở hai phần khác nhau.
2. Giả thuyết chưa xác nhận chỉ có quyền chọn câu hỏi.
3. Câu hỏi có lý do và điểm ưu tiên nhìn thấy được.
4. Mâu thuẫn về diện tích không bị lấy trung bình.
5. Dữ kiện bị từ chối không được hỏi lại.
6. Khi khách hàng xem kết quả sớm, hệ thống chỉ từ chối phần chưa đủ căn cứ.
7. Kết quả nêu nhu cầu đã xác nhận, giả thuyết không được dùng và giới hạn dữ liệu thương mại.

## Giới hạn cố ý

- Không truy vấn danh mục sản phẩm.
- Không tạo ba khuyến nghị.
- Không lưu phiên.
- Không đo độ phù hợp của sản phẩm.
- Không cố mô phỏng ngôn ngữ tự nhiên tự do.

Các giới hạn này giữ mẫu tập trung vào đúng câu hỏi về hành trình và trạng thái hội thoại.
