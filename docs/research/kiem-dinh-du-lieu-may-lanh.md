# Kiểm định dữ liệu máy lạnh cho tư vấn có căn cứ

## Kết luận quyết định

**Chưa được dùng bộ dữ liệu hiện tại để xếp hạng sản phẩm hoặc khẳng định một sản phẩm là lựa chọn tốt nhất.** Dữ liệu đủ để thử nghiệm một số bộ lọc có điều kiện, nhưng chưa đủ để tư vấn có căn cứ xuyên suốt từ hiểu nhu cầu đến dẫn nguồn.

- Có thể dùng ngay, có kiểm soát: nhận diện bằng `sku`, lọc theo thương hiệu, loại máy, bộ biến tần và phạm vi diện tích.
- Chỉ được dùng sau chuẩn hóa: độ ồn, nhãn năng lượng, công nghệ, bảo hành, kích thước, giá và khuyến mãi.
- Phải cách ly khỏi luồng quyết định: `Số lượng`, `Khối lượng máy`, `Công suất đầu ra` hiện tại và ba trường `phụ kiện chính 2`.
- Phải bổ sung trước khi xếp hạng: tên hoặc mã thương mại, công suất làm lạnh chuẩn, giá còn hiệu lực, tồn kho, đường dẫn nguồn, thời điểm quan sát và bằng chứng cho từng thuộc tính.

Lý do chi phối là **thiếu dấu vết bằng chứng ở cấp thuộc tính**. Khi không biết một giá trị đến từ đâu, được quan sát khi nào và đã được biến đổi bằng quy tắc nào, hệ thống không thể phân biệt dữ liệu thật, dữ liệu cũ, dữ liệu thiếu và dữ liệu bị gán nhầm trường.

## Phạm vi và nguồn

### Nguồn trong kho

- Nguồn dữ liệu chuẩn: [`docs/spec_cate_gia/json/may-lanh.json`](../spec_cate_gia/json/may-lanh.json).
- Chỉ mục dữ liệu: [`docs/spec_cate_gia/index.json`](../spec_cate_gia/index.json). Chỉ mục ghi nguồn chuyển đổi là `docs/raw/Spec_cate_gia.xlsx` và khai báo **1.039** dòng, **45** cột.
- Bối cảnh nghiệp vụ: [`docs/dien-may-xanh.md`](../dien-may-xanh.md). Tài liệu yêu cầu tư vấn máy lạnh theo ngân sách, diện tích, phòng nắng, độ ồn, giá, khuyến mãi, tồn kho và phải nêu rõ khi thiếu dữ liệu.

Không dùng nguồn ngoài kho để kết luận về chất lượng dữ liệu.

### Phiên bản đã kiểm định

| Thuộc tính | Giá trị |
|---|---:|
| Mã cam kết gốc | `24a41de0ed52a20035728ac4041ec1b422245bdf` |
| Mã đối tượng Git của tệp | `f5bd6d188535745e0f917fd87abb0f5eef7dd896` |
| Mã băm SHA-256 | `cc6a410e2df74aa6fba5222323f0519f97e83b473beb64df08c37b83f10e2eec` |
| Kích thước tệp | **2.977.567 byte** |

### Cách tính

- Độ phủ thô: số ô khác `null` và khác chuỗi rỗng chia cho **1.039**.
- Độ phủ ngữ nghĩa: tiếp tục loại các trạng thái `Không`, `Không có`, `Đang cập nhật`, `Hãng không công bố` khi trạng thái đó không tạo ra giá trị định lượng hoặc phân loại dùng được.
- Trùng tuyệt đối: hai đối tượng có toàn bộ **45** trường giống nhau.
- Va chạm khóa: cùng giá trị khóa nhưng thuộc nhiều bản ghi.
- Giá trị bất thường: mâu thuẫn với tên trường, thiếu đơn vị, là giá trị giữ chỗ, hoặc lệch lớn khỏi phân bố cùng trường. Giá trị bất thường được đánh dấu để xác minh, không tự động coi là sai nếu chưa có nguồn gốc để đối chiếu.

Mọi số liệu dưới đây được tính trên toàn bộ [`may-lanh.json`](../spec_cate_gia/json/may-lanh.json), không lấy mẫu.

## Kết quả kiểm định

### 1. Cấu trúc và kiểu dữ liệu

| Kiểm tra | Kết quả | Đánh giá |
|---|---:|---|
| Số dòng khai báo và thực tế | **1.039 = 1.039** | Khớp |
| Số trường khai báo và thực tế | **45** | Khớp |
| Bản ghi có đúng cùng tập khóa | **1.039/1.039** | Tốt |
| Ô có dữ liệu thô | **34.724/46.755**, tương đương **74,27%** | Trung bình |
| Trường chỉ dùng chuỗi hoặc `null` | **43/45** | Cần ép kiểu theo thuộc tính |
| Trường số nguyên hoặc `null` | **2/45**, gồm hai trường giá | Đúng kiểu thô nhưng thiếu ngữ cảnh giá |
| Bản ghi chỉ có sáu trường định danh, mọi thuộc tính khác rỗng | **3** | Phải gắn trạng thái không đủ dữ liệu |

Cấu trúc tệp ổn định, nhưng kiểu chuỗi đang gộp giá trị, đơn vị và trạng thái thiếu vào cùng một ô. Ví dụ, `Nhãn năng lượng` gộp số sao và hiệu suất; `Độ ồn` gộp dàn lạnh, dàn nóng và nhiều mức vận hành; các trường kích thước trộn số có đơn vị với số không có đơn vị.

### 2. Định danh và trùng lặp

| Kiểm tra | Kết quả | Hệ quả |
|---|---:|---|
| `sku` | **1.039/1.039** duy nhất | Có thể dùng làm khóa bản ghi hiện tại |
| `model_code` | **568** giá trị, **265** nhóm lặp, **736** dòng nằm trong nhóm lặp, nhóm lớn nhất **5** dòng | Không được dùng làm khóa duy nhất |
| `productidweb` | **1.037** giá trị | Có một va chạm giữ chỗ |
| `productidweb = 9999` | **3** dòng | Không phải định danh nguồn đáng tin cậy |
| Trùng tuyệt đối toàn bộ bản ghi | **0** nhóm | Không có bản sao y nguyên |
| Trùng dấu vân tay kỹ thuật khi bỏ định danh, giá và quà | **21** nhóm, **61** dòng, **40** dòng dư | Cần xác minh biến thể, không được tự động gộp |

Ba dòng có `productidweb = 9999` cùng `model_code = 181027`, khác `sku`, và đồng thời không có thông số, giá hoặc phạm vi sử dụng. Đây là bằng chứng trực tiếp rằng `productidweb` và `model_code` không đủ để thay thế `sku`.

Không thể kết luận **471** dòng dư theo `model_code` là bản ghi trùng. Chúng có thể là biến thể hoặc gói hàng khác nhau. Dữ liệu lại không có tên sản phẩm hoặc mã model thương mại để giải thích sự khác nhau, nên phải giữ riêng và yêu cầu bổ sung định danh hiển thị.

### 3. Độ phủ các thuộc tính chi phối tư vấn

| Nhu cầu hoặc thuộc tính | Có dữ liệu thô | Có dữ liệu dùng được theo nghĩa bảo thủ | Nhận xét |
|---|---:|---:|---|
| Thương hiệu | **1.039**, **100%** | **1.039**, **100%** | `brand_id` ánh xạ nhất quán một với một sang `brand` |
| Loại máy | **942**, **90,7%** | **941**, **90,6%** | Dùng được sau chuẩn hóa danh mục |
| Bộ biến tần | **1.028**, **98,9%** | **1.028**, **98,9%** | Dùng tốt cho lọc |
| Phạm vi diện tích | **945**, **91,0%** | **942**, **90,7%** | Tách diện tích và thể tích; **939** dòng có cả hai |
| Giá bất kỳ | **269**, **25,9%** | Tối đa **269**, **25,9%** | Không có thời điểm, tiền tệ và hiệu lực nên chưa phải giá hiện hành có căn cứ |
| Giá khuyến mãi | **190**, **18,3%** | **153**, **14,7%** thực sự thấp hơn giá gốc | **37** cặp bằng giá gốc, không có cặp cao hơn |
| Công suất làm lạnh | **182**, **17,5%** | **16**, **1,5%** có BTU | **166** dòng ghi `Không` |
| Độ ồn | **716**, **68,9%** | **696**, **67,0%** có số | Chỉ **314** dòng ghi rõ cả dàn lạnh và dàn nóng |
| Nhãn năng lượng | **886**, **85,3%** | **791**, **76,1%** có số sao và hiệu suất | Có thể tách cấu trúc bằng quy tắc |
| Điện năng tiêu thụ | **923**, **88,8%** | Chưa đủ tin cậy | **327** dòng bằng `0`; chỉ **27** dòng ghi rõ đơn vị |
| Bảo hành bộ phận | **942**, **90,7%** | **939**, **90,4%** | Chuẩn hóa về tháng |
| Bảo hành máy nén | **895**, **86,1%** | **892**, **85,9%** | Cần tách thời hạn và điều kiện kích hoạt |
| Năm dòng sản phẩm | **1.017**, **97,9%** | **1.012**, **97,4%** | Từ **2013** đến **2026**; **469** dòng trước năm 2020 |

Độ phủ cao không đồng nghĩa với khả năng xếp hạng. Ví dụ, `Điện năng tiêu thụ` có độ phủ thô **88,8%**, nhưng **876/903** giá trị ngữ nghĩa chỉ là số không kèm đơn vị và **327** trong số đó bằng `0`. Hệ thống không thể so sánh chi phí điện một cách có căn cứ từ trường này.

### 4. Sai ngữ nghĩa và giá trị bất thường

#### Trộn trường liên ngành hàng

- `Số lượng` có **926** giá trị và cả **926** đều là `Khoảng 7000 trang A4`. Nội dung này không thuộc máy lạnh và phải bị cách ly ngay.
- `Chuẩn chống nước, bụi` có **768** giá trị ngữ nghĩa. Không có giá trị nào theo mẫu cấp bảo vệ `IP` kèm hai chữ số; **749** giá trị nhắc đến lọc, bụi, kháng khuẩn, ion, nấm mốc, plasma hoặc Nanoe. Trường này thực chất chủ yếu mô tả lọc không khí, cần đổi tên và ánh xạ lại.
- `Công suất đầu ra` có **182** ô thô nhưng chỉ **16** ô có giá trị BTU; **166** ô là `Không`. Không được dùng trường này để ghép công suất với diện tích cho tới khi bổ sung.
- `Khối lượng máy` chỉ có **2/1.039** ô. Trong khi đó các trường khối lượng phụ kiện có độ phủ hơn **85%**, cho thấy nhãn thực thể chưa rõ ràng.

#### Đơn vị và hình dạng dữ liệu

- Các trường kích thước dùng tên chung `phụ kiện chính` và `phụ kiện phụ`, không cho biết chắc chắn đó là dàn lạnh hay dàn nóng.
- Các trường kích thước trộn `84` với `84 cm`; các trường khối lượng trộn `24` với `24 kg`.
- `Dài phụ kiện phụ` có trung vị **78** nhưng cực đại **714**, lớn **9,15 lần** trung vị.
- `Độ dày phụ kiện phụ` có trung vị **28** nhưng cực đại **245**, lớn **8,75 lần** trung vị.
- `Cao phụ kiện chính` có trung vị **29** nhưng cực đại **185**, lớn **6,38 lần** trung vị.

Ba cực trị trên có thể là thiếu dấu thập phân, đảo trường hoặc giá trị thật của một kiểu máy khác. Không có nguồn cấp thuộc tính để phân giải, vì vậy phải gắn cờ xác minh thay vì tự sửa.

#### Giá, khuyến mãi và tính thời điểm

- **770/1.039** dòng không có giá gốc.
- Mọi dòng có giá khuyến mãi đều có giá gốc. Trong **190** cặp, **153** thấp hơn và **37** bằng giá gốc.
- `khuyến mãi quà` có **817** dòng nhưng chỉ **17** chuỗi khác nhau. Một chuỗi chung xuất hiện **540** lần, tương đương **66,1%** số dòng có quà.
- Không có `valid_from`, `valid_until`, khu vực, kênh bán, tiền tệ hoặc thời điểm quan sát. Vì vậy không thể biết giá và quà còn hiệu lực.

### 5. Khoảng trống so với luồng tư vấn mục tiêu

Tài liệu nghiệp vụ trong kho yêu cầu hiểu ngân sách, diện tích, phòng nắng, độ ồn, khu vực lắp đặt, trả góp và khuyến mãi; sau đó lấy danh mục, giá, tồn kho và đánh giá để giải thích ba lựa chọn kèm nguồn. Đối chiếu với yêu cầu đó:

| Năng lực | Mức sẵn sàng | Bằng chứng và giới hạn |
|---|---|---|
| Hiểu nhu cầu | **Một phần** | Có thể nhận diện diện tích, ngân sách, biến tần, độ ồn từ hội thoại. Dữ liệu sản phẩm không có điều kiện phòng nắng, loại phòng, khu vực lắp đặt hoặc ưu tiên người dùng. |
| Lọc ứng viên | **Có điều kiện** | Lọc tốt theo `sku`, thương hiệu, loại máy, biến tần và phạm vi diện tích. Lọc theo giá chỉ phủ **25,9%**; lọc theo công suất chỉ có **16** dòng BTU. |
| Xếp hạng | **Chưa đạt** | Thiếu công suất chuẩn, giá còn hiệu lực, tồn kho; điện năng và độ ồn chưa chuẩn hóa; không có chính sách xử lý thiếu. |
| Giải thích | **Một phần** | Có mô tả thô về tiện ích, công nghệ, nhãn năng lượng và bảo hành. Một số nhãn bị gán sai nghĩa nên chỉ được trích như dữ kiện thô đã cảnh báo. |
| Dẫn nguồn | **Không đạt** | Không có đường dẫn nguồn, vị trí nguồn, thời điểm lấy, mã băm nội dung hay liên kết từ giá trị chuẩn hóa về giá trị thô. `productidweb` không thay thế được một trích dẫn. |

## Phân loại toàn bộ trường hiện có

### Dùng được ngay có kiểm soát

| Trường | Căn cứ | Cách dùng |
|---|---:|---|
| `sku` | **1.039/1.039** duy nhất | Khóa bản ghi hiện tại |
| `category_code` | **1.039/1.039**, cùng giá trị `36` | Xác nhận ngành hàng, không dùng để xếp hạng |
| `brand_id` | **1.039/1.039**, **27** giá trị | Khóa thương hiệu |
| `brand` | **1.039/1.039**, ánh xạ nhất quán với `brand_id` | Hiển thị và lọc thương hiệu; chuẩn hóa kiểu viết hoa khi trình bày |

### Cần chuẩn hóa trước khi lọc hoặc giải thích

| Trường | Độ phủ thô | Chuẩn hóa bắt buộc |
|---|---:|---|
| `model_code` | **100%** | Đổi nghĩa thành mã nhóm nội bộ; không dùng làm khóa duy nhất |
| `productidweb` | **100%** | Gắn không gian tên nguồn; coi `9999` là giữ chỗ không hợp lệ |
| `Công nghệ làm lạnh` | **94,7%** | Danh mục thuật ngữ; phân biệt có, không và thiếu |
| `Sản xuất tại` | **97,3%** | Tách quốc gia theo dàn; chuẩn hóa tên quốc gia và khoảng trắng |
| `Điện năng tiêu thụ` | **88,8%** | Tách làm lạnh, sưởi; số, đơn vị và thời lượng; cách ly số `0` |
| `Công nghệ tiết kiệm điện` | **72,5%** | Tách danh sách công nghệ; không suy ra mức tiết kiệm từ tên tiếp thị |
| `Tiện ích` | **85,1%** | Tách theo dấu `|`; ánh xạ vào danh mục tính năng |
| `Bảo hành bộ phận` | **90,7%** | Số tháng, phạm vi và điều kiện |
| `Loại máy` | **90,7%** | Danh mục một chiều, hai chiều, dàn lạnh đa kết nối, dàn nóng đa kết nối |
| `Nhãn năng lượng` | **85,3%** | Tách số sao và hiệu suất năng lượng |
| `Dài ống đồng` | **78,9%** | Tách tối thiểu, tối đa, đơn vị mét |
| `Cao lắp đặt` | **79,0%** | Tách giới hạn độ cao, đơn vị mét |
| `Chất liệu dàn tản nhiệt` | **92,6%** | Tách vật liệu ống, lá tản nhiệt và lớp phủ |
| `Độ ồn` | **68,9%** | Tách dàn lạnh, dàn nóng, tối thiểu, tối đa, đơn vị dB và chế độ đo |
| `Dòng điện vào` | **69,0%** | Danh mục điểm cấp điện; tách trạng thái không công bố |
| `Kích thước ống đồng` | **63,9%** | Tách đường kính ống lỏng và ống gas; bổ sung đơn vị |
| `Dài phụ kiện chính` | **85,2%** | Xác minh thực thể; số thập phân; đơn vị cm; kiểm tra cực trị |
| `Độ dày phụ kiện chính` | **85,7%** | Xác minh thực thể; số thập phân; đơn vị cm; kiểm tra cực trị |
| `Khối lượng phụ kiện chính` | **85,7%** | Xác minh thực thể; số thập phân; đơn vị kg; kiểm tra cực trị |
| `Cao phụ kiện phụ` | **84,4%** | Xác minh thực thể; số thập phân; đơn vị cm; kiểm tra cực trị |
| `Dài phụ kiện phụ` | **84,1%** | Xác minh thực thể; số thập phân; đơn vị cm; kiểm tra cực trị |
| `Độ dày phụ kiện phụ` | **84,1%** | Xác minh thực thể; số thập phân; đơn vị cm; kiểm tra cực trị |
| `Khối lượng phụ kiện phụ` | **85,3%** | Xác minh thực thể; số thập phân; đơn vị kg; kiểm tra cực trị |
| `Dòng điện hoạt động` | **37,4%** | Chuyển `1 pha`, `3 pha` thành số pha |
| `Chuẩn chống nước, bụi` | **81,4%** | Đổi tên thành công nghệ lọc không khí; tách danh sách bộ lọc; không coi là cấp IP |
| `Loại Inverter` | **98,9%** | Chuyển thành giá trị đúng hoặc sai; giữ trạng thái thiếu riêng |
| `Chế độ gió` | **83,7%** | Tách trục, tự động và chỉnh tay |
| `Dòng sản phẩm` | **97,9%** | Chuyển thành năm; không đồng nhất năm sản phẩm với tình trạng đang bán |
| `Phạm vi sử dụng` | **91,0%** | Tách diện tích tối thiểu, tối đa, thể tích tối thiểu, tối đa |
| `Loại Gas` | **97,6%** | Danh mục môi chất lạnh; giữ trạng thái thiếu riêng |
| `Bảo hành động cơ` | **86,1%** | Đổi tên thành bảo hành máy nén; tách số tháng và điều kiện kích hoạt |
| `Cao phụ kiện chính` | **85,9%** | Xác minh thực thể; số thập phân; đơn vị cm; kiểm tra cực trị |
| `giá gốc` | **25,9%** | Số tiền, tiền tệ, kênh, khu vực, thời điểm và khoảng hiệu lực |
| `giá khuyến mãi` | **18,3%** | Như giá gốc; chỉ coi là giảm khi đang hiệu lực và thấp hơn giá gốc |
| `khuyến mãi quà` | **78,6%** | Tách từng ưu đãi; điều kiện, giá trị, thời gian, khu vực và kênh |

### Cần cách ly khỏi luồng quyết định

Không xóa dữ liệu thô. Giữ nguyên để truy vết, nhưng không cho các trường sau tham gia lọc, chấm điểm hoặc giải thích cho tới khi được đối chiếu nguồn.

| Trường | Căn cứ cách ly | Điều kiện phục hồi |
|---|---|---|
| `Số lượng` | **926/926** giá trị là số trang A4 | Xác định lại thuộc tính đúng hoặc xóa khỏi lược đồ máy lạnh |
| `Khối lượng máy` | Chỉ **2/1.039** giá trị, thực thể không rõ | Ánh xạ rõ dàn lạnh hoặc dàn nóng và bổ sung nguồn |
| `Công suất đầu ra` | Chỉ **16/1.039** giá trị BTU dùng được | Bổ sung công suất làm lạnh chuẩn cho từng `sku` |
| `Cao phụ kiện chính 2` | Chỉ **3/1.039** giá trị, một giá trị là `Không` | Xác định thực thể và tăng độ phủ |
| `Dài phụ kiện chính 2` | Chỉ **2/1.039** giá trị | Xác định thực thể và tăng độ phủ |
| `Độ dày phụ kiện chính 2` | Chỉ **2/1.039** giá trị | Xác định thực thể và tăng độ phủ |

### Cần bổ sung

| Trường mới | Vì sao bắt buộc | Năng lực được mở khóa |
|---|---|---|
| Tên sản phẩm và mã model thương mại | Phân biệt biến thể và giải thích cho người dùng | Hiểu, lọc, giải thích |
| Công suất làm lạnh chuẩn bằng BTU mỗi giờ và kW | Ghép đúng diện tích, tải nhiệt và điều kiện phòng | Lọc, loại trừ, xếp hạng |
| Đường dẫn nguồn và vị trí trong nguồn | Chứng minh từng phát biểu | Giải thích, dẫn nguồn |
| Thời điểm quan sát, mã băm nguồn, phiên bản bộ phân tích | Biết dữ liệu còn mới và tái lập được phép biến đổi | Dẫn nguồn, kiểm toán |
| Tiền tệ, khu vực, kênh, thời gian hiệu lực của giá | Xác định giá áp dụng cho ai và lúc nào | Lọc ngân sách, xếp hạng |
| Tồn kho và khu vực lắp đặt | Không đề xuất hàng không mua được | Lọc, xếp hạng |
| Điều kiện phòng: nắng, cách nhiệt, số người, loại phòng | Điều chỉnh nhu cầu công suất và độ ồn | Hiểu nhu cầu, xếp hạng |
| Chi phí lắp đặt, chiều dài ống tính phí và điện áp | Tính tổng chi phí và khả năng lắp | Lọc, giải thích |
| Đánh giá và dữ liệu độ tin cậy | Không biến tên tiếp thị thành bằng chứng hiệu quả | Xếp hạng, giải thích |
| Trạng thái chất lượng cho từng giá trị | Phân biệt thiếu, không áp dụng, không công bố, chờ cập nhật và không hợp lệ | Mọi bước |

## Mô hình bằng chứng chuẩn hóa đề xuất

### Nguyên tắc

1. Giữ dữ liệu thô bất biến. Mọi giá trị chuẩn hóa phải trỏ lại dữ liệu thô.
2. Tách sản phẩm, chào giá và bằng chứng. Giá và khuyến mãi là quan sát có thời hạn, không phải thuộc tính vĩnh viễn của sản phẩm.
3. Không gộp `null`, `Không`, `Không có`, `Đang cập nhật` và `Hãng không công bố` thành một trạng thái.
4. Mọi giá trị đo phải có đại lượng, số và đơn vị.
5. Mọi giá trị suy ra phải ghi quy tắc và danh sách bằng chứng đầu vào.
6. Không có nguồn thì chỉ được nói “dữ liệu hiện có ghi nhận”, không được trình bày như sự thật đã kiểm chứng.

### Cấu trúc tối thiểu

```json
{
  "product": {
    "product_key": "sku:1751098000128",
    "sku": "1751098000128",
    "source_product_id": "335837",
    "model_group_id": "181142",
    "commercial_model": null,
    "brand_id": "331",
    "brand_name": "Gree",
    "category_code": "36"
  },
  "evidence": [
    {
      "evidence_id": "ev_...",
      "attribute_code": "room_area_recommended",
      "raw_value": "Dưới 15m² (từ 30 đến 45m³)",
      "normalized_value": {
        "area_min_m2": null,
        "area_max_m2": 15,
        "volume_min_m3": 30,
        "volume_max_m3": 45
      },
      "value_status": "observed",
      "source": {
        "source_url": null,
        "source_locator": null,
        "observed_at": null,
        "content_hash": null
      },
      "transform": {
        "rule_id": "room-range-v1",
        "parser_version": "1.0.0"
      },
      "quality": {
        "confidence": null,
        "validation_flags": []
      }
    }
  ],
  "offers": [
    {
      "list_price": 9990000,
      "sale_price": null,
      "currency": "VND",
      "channel": null,
      "region": null,
      "valid_from": null,
      "valid_until": null,
      "availability": "unknown",
      "evidence_refs": []
    }
  ],
  "derived_facts": [
    {
      "attribute_code": "effective_price",
      "value": null,
      "rule_id": "active-sale-else-list-v1",
      "evidence_refs": [],
      "status": "insufficient_evidence"
    }
  ]
}
```

Các mã tiếng Anh trong khối trên là tên trường kỹ thuật đề xuất, không phải nội dung hiển thị cho người dùng.

### Trạng thái giá trị bắt buộc

| Trạng thái | Nghĩa | Ví dụ xử lý |
|---|---|---|
| `observed` | Có giá trị đọc được từ nguồn | Cho phép chuẩn hóa |
| `missing` | Nguồn không có trường hoặc để rỗng | Không phạt như một đặc tính xấu |
| `not_applicable` | Thuộc tính không áp dụng | Không đưa vào mẫu số chấm điểm |
| `not_disclosed` | Nguồn nói rõ không công bố | Hiển thị đúng trạng thái |
| `pending` | Nguồn ghi đang cập nhật | Không dùng để lọc hoặc xếp hạng |
| `invalid` | Sai lược đồ, sai đơn vị hoặc gán nhầm trường | Cách ly và tạo cảnh báo |

### Cổng chất lượng cho tư vấn

- Lọc theo một ràng buộc chỉ khi thuộc tính đã chuẩn hóa và có `value_status = observed`.
- Xếp hạng chỉ khi mọi thuộc tính bắt buộc của nhu cầu có bằng chứng. Nếu thiếu, hệ thống phải hỏi thêm hoặc nêu rõ giới hạn.
- Giá hiệu lực chỉ được tạo khi có tiền tệ, thời điểm quan sát và quy tắc hiệu lực. Giá khuyến mãi phải đang hiệu lực và thấp hơn giá gốc.
- Mỗi lý do chọn hoặc loại sản phẩm phải chứa `evidence_refs`.
- Không tự điền công suất từ phạm vi diện tích hoặc ngược lại nếu chưa có quy tắc được phê duyệt và nguồn tham chiếu.
- Điểm xếp hạng phải lưu từng thành phần điểm, chính sách xử lý thiếu và bằng chứng đã dùng.

## Lộ trình xử lý theo ưu tiên

1. **Mức 0, ngăn tư vấn sai:** dùng `sku` làm khóa; cách ly sáu trường lỗi; vô hiệu hóa xếp hạng theo giá, công suất và điện năng; trả lời rõ khi thiếu.
2. **Mức 0, tạo dấu vết nguồn:** bổ sung nguồn, vị trí nguồn, thời điểm quan sát, mã băm và trạng thái giá trị cho từng thuộc tính.
3. **Mức 1, chuẩn hóa thuộc tính:** tách diện tích, độ ồn, nhãn năng lượng, bảo hành, kích thước, công nghệ và trạng thái thiếu.
4. **Mức 1, bổ sung dữ liệu chi phối:** tên thương mại, công suất chuẩn, giá có hiệu lực, tồn kho và khu vực.
5. **Mức 2, xây xếp hạng:** chỉ chấm điểm sau khi có cổng chất lượng, chính sách thiếu và bằng chứng cho từng lý do.
6. **Mức 2, kiểm thử:** tạo ca kiểm thử cho phòng nắng, phòng ngủ, giới hạn ngân sách, thiếu giá, thiếu tồn kho và xung đột dữ liệu.

## Rủi ro còn mở

- Chưa xác minh được `phụ kiện chính` và `phụ kiện phụ` tương ứng với dàn lạnh hay dàn nóng.
- Chưa xác minh ý nghĩa nghiệp vụ của `model_code`; số liệu chỉ chứng minh nó không duy nhất.
- Không thể xác nhận giá, khuyến mãi, năm sản phẩm hoặc tồn kho còn hiện hành vì thiếu thời điểm và trạng thái bán.
- Không thể sửa các cực trị kích thước vì không có đường dẫn nguồn cấp thuộc tính.
- Không thể dẫn nguồn ra ngoài chính tệp dữ liệu hiện tại.
- **16** giá trị BTU chưa đủ để kiểm tra nhất quán giữa công suất và phạm vi diện tích trên toàn bộ danh mục.

## Lệnh tái kiểm chứng

Chạy tại gốc kho:

```sh
jq '{declared_rows:.row_count, actual_rows:(.records|length), fields:(.columns|length)}' docs/spec_cate_gia/json/may-lanh.json

jq '[.records[].sku] | {rows:length, unique_sku:(unique|length)}' docs/spec_cate_gia/json/may-lanh.json

jq '[.records[].model_code] | {rows:length, unique_model_code:(unique|length)}' docs/spec_cate_gia/json/may-lanh.json

jq '{original_price:([.records[] | select(."giá gốc" != null)]|length), sale_price:([.records[] | select(."giá khuyến mãi" != null)]|length), capacity_btu:([.records[] | select((."Công suất đầu ra" // "") | contains("BTU"))]|length)}' docs/spec_cate_gia/json/may-lanh.json

jq '[.records[] | select(."Số lượng" == "Khoảng 7000 trang A4")] | length' docs/spec_cate_gia/json/may-lanh.json

shasum -a 256 docs/spec_cate_gia/json/may-lanh.json
```

## Tóm tắt

Giữ bộ dữ liệu làm đầu vào thô, nhưng **chưa bật xếp hạng hoặc dẫn nguồn sản phẩm**. Việc cần làm trước là bổ sung dấu vết bằng chứng, công suất, giá có hiệu lực và tồn kho; đồng thời cách ly các trường bị gán sai nghĩa.
