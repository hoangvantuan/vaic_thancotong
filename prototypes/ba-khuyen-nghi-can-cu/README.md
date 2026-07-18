# Mẫu ba khuyến nghị có căn cứ

Mẫu dùng để trả lời câu hỏi trình bày của phiếu [Tạo mẫu ba khuyến nghị từ chuỗi nhân quả sản phẩm](https://github.com/hoangvantuan/vaic_thancotong/issues/13).

Đây không phải mã sản phẩm và không được nhập vào nhánh phát triển chính.

## Chạy

Từ gốc kho:

    ~/.venv/claude/bin/python -m http.server 4173

Mở:

- `http://127.0.0.1:4173/prototypes/ba-khuyen-nghi-can-cu/?variant=A`
- `http://127.0.0.1:4173/prototypes/ba-khuyen-nghi-can-cu/?variant=B`
- `http://127.0.0.1:4173/prototypes/ba-khuyen-nghi-can-cu/?variant=C`

Dùng phím mũi tên trái và phải hoặc thanh nổi cuối màn hình để chuyển biến thể.

## Ba biến thể

- **A, Dòng căn cứ:** ứng viên dẫn đầu, ưu tiên đọc trên điện thoại.
- **B, Bảng quyết định:** so sánh trực tiếp theo từng tiêu chí.
- **C, Ba lối chọn:** trình bày ba hướng đánh đổi khác nhau.

## Giới hạn

- Dữ liệu được cố định để kiểm tra hình thức trình bày.
- Giá là ảnh chụp ngày **17 tháng 7 năm 2026**, không phải giá hiện hành.
- Tồn kho, chi phí lắp đặt và tải nhiệt thực tế chưa được xác minh.
- Mẫu không lọc, xếp hạng, mua hàng hoặc ghi dữ liệu.
