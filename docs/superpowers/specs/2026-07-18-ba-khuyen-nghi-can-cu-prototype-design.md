# Thiết kế mẫu ba khuyến nghị có căn cứ

**Ngày:** 18 tháng 7 năm 2026

**Trạng thái:** Đã được người chịu trách nhiệm ủy quyền tự chốt phương án tốt nhất

**Phiếu quyết định:** [Tạo mẫu ba khuyến nghị từ chuỗi nhân quả sản phẩm](https://github.com/hoangvantuan/vaic_thancotong/issues/13)

## 1. Câu hỏi cần trả lời

Ba khuyến nghị phải trình bày thế nào để khách hàng phổ thông nhìn thấy mối nối từ nhu cầu đã xác nhận tới đặc điểm sản phẩm, kết quả sử dụng, điều kiện áp dụng, điểm đánh đổi, phần chưa chắc chắn, nguồn bằng chứng và bước tiếp theo?

Mẫu chỉ kiểm tra **hình thức trình bày**. Nó không triển khai bộ lọc, bộ xếp hạng, tích hợp giá hay tồn kho thật.

## 2. Đối tượng và công việc chính

- Đối tượng: khách hàng phổ thông Việt Nam đang xem kết quả tư vấn máy lạnh.
- Thiết bị ưu tiên: màn hình điện thoại rộng khoảng **390 px**.
- Công việc chính: hiểu nhanh lựa chọn nào phù hợp nhất với hoàn cảnh hiện tại và biết điều gì cần xác minh trước khi mua.
- Tiêu chí thành công: khách không phải tin vào một điểm tổng hợp hoặc lời quảng cáo; từng lý do quan trọng đều nhìn thấy nguồn và giới hạn.

## 3. Kịch bản kiểm thử

Các dữ kiện sau là **dữ kiện giả lập đã được khách xác nhận**, dùng để kiểm tra giao diện:

- Phòng ngủ rộng **20 m²**.
- Dùng chủ yếu vào ban đêm.
- Ưu tiên cao nhất là vận hành êm, sau đó là điện năng.
- Ngân sách mua máy tối đa **14 triệu đồng**, chưa gồm lắp đặt.
- Tải nhiệt thực tế, vị trí lắp, giá hiện hành, chi phí lắp và tồn kho vẫn cần xác minh.

Ba sản phẩm dùng dữ liệu thật trong kho tại thời điểm thu thập **17 tháng 7 năm 2026**:

| Vai trò trong mẫu | Sản phẩm | Giá ghi nhận | Độ ồn dàn lạnh công bố | Điện năng công bố |
|---|---|---:|---|---:|
| Ưu tiên độ êm | Samsung Wind-Free Inverter 1.5 HP AR70H13D1BWNSV | 13.490.000 đồng | 19 đến 38 dB | 1,07 kWh |
| Cân bằng | Toshiba Inverter 1.5 HP RAS-H13F2KCVSG-V | 13.090.000 đồng | 20 đến 45 dB | 1,07 kWh |
| Tiết kiệm giá mua | Comfee Inverter 1.5 HP CFS-13VDM | 7.690.000 đồng | 29 đến 35,5 dB | 1,25 kWh |

Giá, khuyến mãi và tồn kho không được trình bày như dữ kiện hiện hành nếu chưa làm mới từ nguồn thương mại.

## 4. Hợp đồng trình bày sự thật

Mỗi khuyến nghị phải có đủ bảy phần:

1. Nhu cầu hoặc ràng buộc khách đã xác nhận.
2. Dữ kiện sản phẩm hỗ trợ nhận định.
3. Kết quả sử dụng được diễn giải trong đúng hoàn cảnh.
4. Điều kiện khiến diễn giải còn hiệu lực.
5. Điểm đánh đổi nổi bật.
6. Phần chưa xác minh có thể làm đổi quyết định.
7. Nguồn và bước tiếp theo.

Giao diện dùng ba trạng thái dễ hiểu:

- **Đã xác minh trong nguồn:** có giá trị và vị trí nguồn cụ thể.
- **Có điều kiện:** cách diễn giải chỉ đúng trong hoàn cảnh được nêu.
- **Chưa xác minh:** không dùng để khẳng định sản phẩm phù hợp chắc chắn.

Không hiển thị phần trăm tin cậy giả. Không biến dữ liệu thiếu thành điểm yếu. Không dùng đánh giá sao hoặc số lượng bán để chứng minh độ phù hợp.

## 5. Ba biến thể

### 5.1. Biến thể A, Dòng căn cứ

Mỗi sản phẩm là một hồ sơ dọc. Một sợi căn cứ nối lần lượt nhu cầu, dữ kiện sản phẩm, kết quả sử dụng, điều kiện và ảnh hưởng quyết định.

```text
Tóm tắt nhu cầu đã xác nhận
           │
Sản phẩm phù hợp nhất
           │
     Sợi căn cứ
 Nhu cầu → Dữ kiện → Kết quả
           │
 Điều kiện + Đánh đổi + Chưa chắc
           │
     Nguồn + Bước tiếp theo
```

Ưu điểm:

- Phù hợp nhất với màn hình điện thoại.
- Làm mối nối từ nhu cầu tới lý do trở thành cấu trúc chính.
- Cho phép mở dần chi tiết nguồn mà không làm quá tải lần đọc đầu.

Đánh đổi:

- Trang dài hơn.
- So chéo ba sản phẩm chậm hơn bảng.

### 5.2. Biến thể B, Bảng quyết định

Mỗi tiêu chí là một hàng. Ba sản phẩm được so trực tiếp trong từng hàng về độ êm, điện năng, giá, điều kiện và dữ liệu thiếu.

```text
                 Samsung   Toshiba   Comfee
Đủ điều kiện       Có        Có        Có
Độ êm              ●●●       ●●○       ●○○
Điện năng          ●●●       ●●●       ●●○
Giá mua            ●○○       ●○○       ●●●
Chưa xác minh       3         3         3
```

Ưu điểm:

- So sánh nhanh.
- Dễ nhận ra nguyên nhân đổi thứ hạng.

Đánh đổi:

- Dễ chật trên điện thoại.
- Nguy cơ biến quan hệ có điều kiện thành bảng điểm đơn giản hóa.

### 5.3. Biến thể C, Ba lối chọn

Ba sản phẩm được trình bày như ba lối đánh đổi rõ ràng: ưu tiên độ êm, cân bằng, hoặc giảm giá mua. Mỗi lối có một kết luận, lý do phản bác và bước xác minh.

```text
Bạn muốn ưu tiên điều gì ngay lúc này?

[Êm hơn]       [Cân bằng]       [Giá mua thấp]
 Samsung        Toshiba            Comfee
     \              |              /
       Điều kiện chung cần xác minh
```

Ưu điểm:

- Dễ hành động.
- Trình bày đánh đổi bằng ngôn ngữ khách hàng nhận ra.

Đánh đổi:

- Có thể khiến vai trò của sản phẩm trông cố định.
- Ít phù hợp nếu thứ hạng dễ đảo khi có dữ kiện mới.

## 6. Phương án dẫn đầu

Chọn **Biến thể A, Dòng căn cứ** làm ứng viên dẫn đầu.

Lý do:

- Câu hỏi của phiếu nhấn mạnh mối nối từ nhu cầu tới bằng chứng, không chỉ so thông số.
- Cấu trúc dọc giữ được thứ bậc trên điện thoại.
- Cách mở dần cho phép khách đọc kết luận trước rồi kiểm tra nguồn khi muốn.
- Trạng thái chưa xác minh có chỗ đứng ngang hàng với lợi ích và đánh đổi.

Biến thể B và C vẫn được tạo đầy đủ để phản chứng lựa chọn này.

## 7. Hệ thống thị giác

### 7.1. Bảng màu

| Tên vai trò | Mã màu | Cách dùng |
|---|---|---|
| Mực rừng sâu | `#17352F` | Chữ chính, thanh chuyển biến thể |
| Nền sương | `#F2F7F5` | Nền trang |
| Xanh căn cứ | `#087C68` | Dữ kiện đã xác minh |
| Lam nguồn | `#2859A6` | Liên kết và nguồn |
| Hổ phách điều kiện | `#B96521` | Điều kiện và cảnh báo |
| Xám chưa biết | `#66736F` | Dữ kiện chưa xác minh |

### 7.2. Chữ

- Chữ giao diện: `Be Vietnam Pro`, dự phòng bằng bộ chữ không chân của hệ thống.
- Chữ dữ liệu: `IBM Plex Mono`, dự phòng bằng bộ chữ đơn cách của hệ thống.
- Số giá, mức ồn và điện năng có độ tương phản cao nhưng không lớn hơn kết luận phù hợp.

### 7.3. Dấu ấn riêng

**Sợi căn cứ** là dấu ấn chính. Các nút trên sợi có hình dạng khác nhau theo trạng thái, không chỉ khác màu:

- Hình tròn đặc: dữ kiện đã xác minh.
- Hình thoi: diễn giải có điều kiện.
- Vòng rỗng: dữ kiện chưa xác minh.

Nền dùng lưới kỹ thuật rất nhẹ để gợi liên tưởng tới hồ sơ kiểm định. Không dùng lưới thẻ chung chung hoặc hiệu ứng chuyển sắc trang trí.

## 8. Cấu trúc mẫu

Mẫu là trang tĩnh, chỉ đọc và không có phụ thuộc cài đặt:

```text
prototypes/ba-khuyen-nghi-can-cu/
├── index.html
├── styles.css
├── app.js
└── README.md
```

- Một trang duy nhất tại `/prototypes/ba-khuyen-nghi-can-cu/`.
- Tham số `?variant=A`, `?variant=B` và `?variant=C` chọn biến thể.
- Thanh nổi cuối màn hình cho phép chuyển biến thể bằng nút hoặc phím mũi tên.
- Thanh chuyển biến thể chỉ phục vụ mẫu, không phải thành phần sản phẩm.
- Dữ liệu được nhúng cố định trong `app.js`; không gọi giao diện lập trình ứng dụng (API) và không ghi dữ liệu.

## 9. Tương tác

- Mặc định mở biến thể A.
- Người dùng mở hoặc thu gọn chuỗi nguồn của từng sản phẩm.
- Nút “Xem nguồn” mở trang sản phẩm thật trong thẻ mới.
- Nút hành động chính là “Xác minh giá, tồn kho và lắp đặt”, không phải “Mua ngay”.
- Phím mũi tên trái và phải chuyển biến thể, trừ khi tiêu điểm đang ở trường nhập liệu hoặc vùng có thể sửa.
- Chuyển động chỉ dùng cho một lần xuất hiện của sợi căn cứ; tắt khi hệ điều hành yêu cầu giảm chuyển động.

## 10. Kiểm chứng

Mẫu chỉ được coi là sẵn sàng để chốt khi:

1. Cả ba biến thể hiển thị đủ bảy phần bắt buộc cho mỗi sản phẩm.
2. Không có nhận định về độ phù hợp mà không kèm điều kiện hoặc nguồn.
3. Trạng thái chưa xác minh nhìn thấy được ngay, không bị giấu cuối trang.
4. Giao diện dùng được ở chiều rộng **390 px** và **1440 px**.
5. Mọi điều khiển dùng được bằng bàn phím và có tiêu điểm nhìn thấy rõ.
6. Tham số `variant` ổn định khi tải lại trang.
7. Các đường dẫn nguồn mở đúng sản phẩm.
8. Biến thể dẫn đầu giúp đọc kết luận, đánh đổi và việc cần làm tiếp mà không cần mở toàn bộ chi tiết.

## 11. Kiểu thất bại và biện pháp chặn

| Kiểu thất bại | Hệ quả | Biện pháp chặn |
|---|---|---|
| Giao diện biến thành ba thẻ quảng cáo | Che mất căn cứ và đánh đổi | Dùng sợi căn cứ làm cấu trúc chính |
| Dùng nhãn “tốt nhất” như kết luận tuyệt đối | Khách hiểu sai khi dữ kiện đổi | Gắn kết luận với hoàn cảnh và thời điểm |
| Hiển thị quá nhiều trạng thái nội bộ | Khách bị quá tải | Dịch thành ba trạng thái dễ hiểu và mở dần nguồn |
| So sánh bằng một điểm tổng | Vi phạm lọc cứng và che độ nhạy | Hiển thị đóng góp theo tiêu chí, không cộng thành điểm duy nhất |
| Giá hoặc tồn kho cũ trông như hiện hành | Có thể dẫn tới quyết định sai | Gắn thời điểm và yêu cầu xác minh trước hành động |

## 12. Phạm vi không làm

- Không xây bộ xếp hạng thật.
- Không kiểm chứng hiệu năng máy lạnh ngoài dữ liệu nguồn hiện có.
- Không tích hợp giá, khuyến mãi, tồn kho hoặc đặt hàng.
- Không đưa mã mẫu vào nhánh phát triển chính.
- Không dùng mẫu làm đặc tả triển khai sản phẩm cuối cùng.
