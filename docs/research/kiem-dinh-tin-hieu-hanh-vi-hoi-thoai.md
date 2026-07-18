# Kiểm định tín hiệu hành vi trong dữ liệu hội thoại và giao dịch hiện có

Ngày kiểm định: **18/07/2026**

Phạm vi: hai tệp hội thoại hiện có và các tài liệu nghiệp vụ liên quan trong `docs/raw`.

Trạng thái: **hoàn tất**. Các số liệu dưới đây đã được đối chiếu bằng phép đọc cấu trúc, không sao chép nội dung hội thoại hoặc dữ liệu cá nhân thô.

## Kết luận điều hành

Dữ liệu hiện có phù hợp để xây một tập đánh giá nhỏ về **trích xuất dữ kiện được khách hàng nói trực tiếp** và **chọn câu hỏi làm rõ**, nhưng chưa đủ điều kiện để học hoặc kiểm chứng nhãn tâm lý, cách ra quyết định ổn định hay hiệu quả sau tư vấn.

## Câu hỏi và ranh giới kiểm định

Tài liệu trả lời các câu hỏi sau:

- Hai nguồn chứa bao nhiêu hội thoại và tin nhắn, với cấu trúc, vai trò và độ dài nào?
- Có thể quan sát trực tiếp, chỉ suy luận yếu, hay hoàn toàn thiếu dữ liệu cho từng lớp trong khung hành vi?
- Mẫu có thiên lệch và rủi ro quyền riêng tư nào?
- Nên tạo lược đồ nhãn và tập đánh giá có quản trị ra sao?

Tài liệu **không** gán nhãn tâm lý cho cá nhân, không xác nhận quan hệ nhân quả và không coi tên tệp là bằng chứng đã mua hàng.

## Nguồn và phương pháp

### Nguồn sơ cấp trong kho

- [`35sample_chat_history (1).json`](../raw/35sample_chat_history%20%281%29.json)
- [`chat_history_buy_product.json`](../raw/chat_history_buy_product.json)
- [Thiết kế khung tư vấn sản phẩm thích nghi](../superpowers/specs/2026-07-18-khung-tu-van-san-pham-thich-nghi-design.md)
- [Chính sách xử lý dữ liệu cá nhân](../raw/chinh_sach_xu_ly_du_lieu_ca_nhan.md)
- [Chính sách nâng cao chất lượng phục vụ khách hàng trực tuyến](../raw/chat_luong_phuc_vu.md)

Các chính sách giao hàng, bảo hành, đổi trả, khui hộp, điều khoản sử dụng và nội quy cửa hàng được rà soát để nhận diện bối cảnh nghiệp vụ. Chúng là nguồn cho ràng buộc nghiệp vụ, không phải bằng chứng về hành vi của khách hàng trong mẫu.

### Phương pháp

1. Đọc cấu trúc và đếm bản ghi bằng chương trình cục bộ, không gửi dữ liệu ra ngoài.
2. Tách số liệu theo tệp, hội thoại, vai trò và trường dữ liệu.
3. Chỉ coi phát biểu do vai trò `user` cung cấp là ứng viên tín hiệu trực tiếp về khách hàng.
4. Coi hành vi theo chuỗi, siêu dữ liệu và nội dung do trợ lý hoặc công cụ tạo là tín hiệu suy luận yếu cho tới khi có nhãn chuyên gia hoặc xác nhận độc lập.
5. Không suy từ thiếu dữ liệu thành phủ định.

## Kiểm kê cấu trúc và chất lượng

### Quy mô và vai trò

| Nguồn | Hội thoại | Tin nhắn | `user` | `assistant` | `tool` | `system` |
|---|---:|---:|---:|---:|---:|---:|
| `35sample_chat_history (1).json` | **35** | **1.090** | **493** | **597** | **0** | **0** |
| `chat_history_buy_product.json`, sau khôi phục chỉ đọc trong bộ nhớ | **11** | **455** | **157** | **228** | **60** | **10** |
| Cộng cơ học, trước khử trùng lặp | **46** | **1.545** | **650** | **825** | **60** | **10** |

Đối chiếu chuỗi tin nhắn `user` cho thấy **11/11** hội thoại của tệp mua hàng ánh xạ một đối một tới **11 hội thoại đầu** của tệp 35 mẫu. Có **129/142** nội dung `user` duy nhất trong tệp mua hàng trùng chính xác sau chuẩn hóa khoảng trắng với tệp 35 mẫu. Rà soát các sai khác còn lại cho thấy chúng nằm ở số liên hệ hoặc chi tiết địa chỉ đã được che trong tệp 35 mẫu nhưng còn nguyên trong tệp mua hàng. Do đó:

- Cỡ mẫu hành vi độc lập tối đa hiện tại là **35 hội thoại**, không phải 46.
- Tệp mua hàng bổ sung dấu vết công cụ, thời gian và dữ liệu nhận dạng cho một tập con, không bổ sung **11** hành trình quyết định mới.
- Mọi phép chia tập phải nhóm hai bản sao cùng nguồn vào một đơn vị. Nếu tách ngẫu nhiên theo tệp hoặc tin nhắn, dữ liệu gần trùng có thể rơi vào cả tập huấn luyện và tập kiểm tra, làm tăng điểm giả tạo.

### Độ dài

| Nguồn | Tin nhắn mỗi hội thoại | Độ dài tin nhắn theo ký tự | Tin `user` theo ký tự |
|---|---|---|---|
| `35sample_chat_history (1).json` | nhỏ nhất **16**, trung vị **29**, lớn nhất **67** | trung vị **61**, phân vị 90 **387,3**, lớn nhất **1.182** | trung vị **26**, phân vị 90 **62**, lớn nhất **387** |
| `chat_history_buy_product.json` | nhỏ nhất **24**, trung vị **44**, lớn nhất **57** | trung vị **74**, phân vị 90 **561,2**, lớn nhất **18.669** | trung vị **24**, phân vị 90 **62**, lớn nhất **150** |

Độ dài cực đại **18.669 ký tự** thuộc vai trò công cụ. Vì vậy độ dài toàn tệp thứ hai phản ánh tải công cụ nhiều hơn độ sâu phát biểu của khách hàng.

### Khả năng đọc và trường dữ liệu

- `35sample_chat_history (1).json` là JSON hợp lệ. Mỗi hội thoại chỉ có `id` và `messages`; mỗi tin nhắn chỉ có `role` và `content`.
- Tệp này không có thời điểm, trạng thái mua, mã phiên thật, kênh, sản phẩm đã xem, đơn hàng, hủy, đổi trả, hài lòng hoặc kết quả sau sử dụng.
- `chat_history_buy_product.json` **không phải JSON hợp lệ**. Trình đọc chuẩn dừng từ đầu tệp vì thiếu khóa và dấu mở mảng cho danh sách tin nhắn; tệp còn có dấu phẩy thừa và dấu phân cách bị thiếu.
- Để kiểm kê, phép kiểm định chỉ trích các đối tượng tin nhắn trực tiếp từ cấu trúc ngoặc và bỏ dấu phẩy cuối **trong bộ nhớ**. Tệp nguồn không bị sửa.
- Trong **455** tin nhắn khôi phục, có **430** trường `create_date`, **151** trường `web_url`, **145** trường `knowledge_data` và **60** lượt công cụ. Có **60** nội dung rỗng ở vai trò trợ lý gắn với gọi công cụ.
- Cả **11** bản ghi cấp hội thoại đều có `label` rỗng và `is_stop = false`. Tên tệp có cụm “mua sản phẩm” không chứng minh giao dịch thành công.

## Kiểm kê quyền riêng tư

- Tệp `chat_history_buy_product.json` có khối `user_info` cho **11** hội thoại, trong đó **1** khối rỗng.
- **10** khối có mã tỉnh, huyện, xã hoặc phường và trường địa chỉ có giá trị; **2** có số điện thoại và tên khách hàng; **1** có tên người dùng và giới tính.
- Tệp 35 mẫu che một phần số liên hệ hoặc số nhà trong tập con trùng lặp, nhưng vẫn còn tên và vị trí chi tiết. Đây là **giả danh hóa**, không phải ẩn danh không thể đảo ngược, vì có thể nối lại với bản chưa che trong cùng kho.
- Chính sách trong kho liệt kê họ tên, số điện thoại và địa chỉ là dữ liệu cá nhân; vị trí xác định qua dịch vụ định vị là dữ liệu cá nhân nhạy cảm. Chính sách cũng phân biệt mục đích thực hiện giao dịch với mục đích ngoài thỏa thuận và trao quyền rút lại đồng ý, yêu cầu hạn chế hoặc xóa dữ liệu.
- Vì nghiên cứu mô hình là mục đích sử dụng thứ cấp, sự tồn tại của dữ liệu trong tệp **không tự chứng minh** quyền dùng để huấn luyện hoặc đánh giá.

## Độ phủ tín hiệu hành vi

### Cách hiểu các mức bằng chứng

| Mức | Điều kiện | Cách được phép dùng |
|---|---|---|
| **Trực tiếp** | Khách hàng nói rõ dữ kiện, ưu tiên, điều kiện hoặc hành động; hoặc hệ thống ghi một sự kiện có cấu trúc | Đánh giá trích xuất dữ kiện. Muốn đổi xếp hạng vẫn phải xét độ mới và phạm vi |
| **Suy luận yếu** | Chỉ thấy chuỗi câu hỏi, lần lặp, lựa chọn do trợ lý gợi ra hoặc nội dung do trợ lý và công cụ tạo | Chỉ tạo câu hỏi kiểm chứng, không dùng như nhãn tâm lý hay sự thật để xếp hạng |
| **Thiếu** | Nguồn không có trường hoặc dấu vết phù hợp | Ghi `no_evidence`, không ghi `false` |

Một lượt rà soát thủ công thận trọng được thực hiện trên **35** nhóm hội thoại hành vi, sau khi nhận diện bản sao giữa hai tệp. Các tử số dưới đây là **ứng viên bằng chứng trực tiếp theo định nghĩa vận hành**, chưa phải nhãn chuẩn vàng.

| Lớp cần quan sát | Bằng chứng trực tiếp trong mẫu | Suy luận yếu dễ mắc | Dữ liệu thiếu quyết định | Kết luận sử dụng |
|---|---|---|---|---|
| Hoàn cảnh | **35/35** có ít nhất một chi tiết như nơi nhận, thời gian, người nhận, mục đích dùng hoặc điều kiện sử dụng | Suy tuổi, thu nhập hoặc lối sống từ sản phẩm, ngôn ngữ, vị trí | Không có lịch sử phiên, thay đổi hoàn cảnh và độ mới cho 24/35 hội thoại | Dùng để kiểm thử trích xuất dữ kiện theo phiên sau khử định danh |
| Việc cần giải quyết | **35/35** nói rõ sản phẩm, tác vụ mua, giao, lắp, thanh toán hoặc hỗ trợ cần thực hiện | Đồng nhất sản phẩm được hỏi với kết quả sâu hơn khách hàng thật sự muốn | Ít câu hỏi làm rõ về kết quả sử dụng ngoài giao dịch | Dùng tốt cho ý định tác vụ, chưa đủ cho nhu cầu sâu |
| Động cơ | Chỉ khoảng **6/35** nói rõ vì sao một kết quả quan trọng, chẳng hạn giảm rủi ro, bảo đảm nhận đúng lúc hoặc dùng kịp thời | Biến tính khẩn cấp, ngân sách, nghề nghiệp hoặc lời đáp ngắn thành động cơ tâm lý | Không có câu hỏi “vì sao”, xác nhận động cơ hoặc bằng chứng qua nhiều phiên | Chỉ dùng các đoạn nói rõ lý do; phần còn lại phải hỏi kiểm chứng |
| Ràng buộc | **35/35** có ứng viên ràng buộc về sản phẩm, giá, nơi, thời gian, thanh toán, giao hoặc lắp | Coi mọi con số được nhắc tới là ràng buộc cứng | Không có trường chuẩn hóa cho mức bắt buộc, độ linh hoạt và thời hạn hiệu lực | Có thể đánh giá trích xuất, nhưng phải gắn `hard`, `soft` hoặc `unknown` |
| Rào cản và nỗi lo | Ít nhất **25/35** nêu trở ngại hoặc điều chưa chắc có thể chặn hành động, chủ yếu là tồn kho, giao hàng, thanh toán, giá, kiểm hàng, lỗi hoặc hủy đơn | Coi mọi câu hỏi là lo ngại thật; coi hỏi nhiều là do dự | Không có mức độ, xác nhận đã được giải quyết hoặc lý do bỏ cuộc | Phù hợp để tìm câu hỏi làm rõ, không phù hợp để gán mức lo âu |
| Tiêu chí đánh đổi | Khoảng **12/35** nêu ưu tiên tương đối, điều kiện chấp nhận hoặc đổi sản phẩm, kênh, quà hay thời gian để đạt tiêu chí khác | Suy trọng số từ thứ tự câu hỏi hoặc sản phẩm trợ lý đã hiển thị | Không có lựa chọn đối chứng, tập sản phẩm đã thấy và lựa chọn bị từ chối đầy đủ | Chỉ lưu quy tắc nói trực tiếp; không học trọng số ẩn từ mẫu này |
| Niềm tin | Khoảng **5/35** viện dẫn hoặc nghi ngờ nguồn như đánh giá, giá trực tuyến, tổng đài, chính sách hay xác nhận đơn | Suy tin thương hiệu từ việc chọn hãng; suy không tin từ yêu cầu kiểm hàng | Không có thang tin cậy, xác nhận nguồn nào thuyết phục và thay đổi sau bằng chứng | Độ phủ quá thấp để học; chỉ dùng làm ví dụ kiểm thử câu hỏi xác nhận |
| Cách quyết định | Khoảng **12/35** có thao tác nói rõ như so sánh, lọc theo nhiều tiêu chí, chọn bán chạy, đặt điều kiện từ chối hoặc đổi kênh | Gán một chiến lược ổn định từ một chuỗi do trợ lý dẫn dắt | Không có quan sát qua nhiều phiên, tập lựa chọn đầy đủ hoặc lời tự mô tả cách quyết định | Có thể nhãn hóa **hành động quyết định trong phiên**, không nhãn hóa “kiểu người quyết định” |
| Trạng thái quyết định | **35/35** có từ ngữ mua, đặt, chốt, xác nhận, đổi, hủy hoặc chuyển sang cửa hàng | Coi lời “đồng ý” với câu hỏi trợ lý là giao dịch hoàn tất | Không có trạng thái chuẩn theo từng lượt, không có lý do chuyển trạng thái và không có nhóm chỉ tìm hiểu | Đánh giá được phát hiện trạng thái tức thời, không đánh giá được toàn bộ phổ trạng thái |
| Kết quả sau tư vấn | Tập con trùng lặp có **12** phản hồi công cụ tạo đơn mang trạng thái `done`, phủ **11/35** nhóm hội thoại | Coi `done` là đã thanh toán, giao thành công, dùng tốt hoặc hài lòng | **0/35** có sự kiện liên kết về giao thành công, hủy cuối cùng, đổi trả, hài lòng hoặc kết quả sử dụng | Chỉ nhãn hóa “công cụ trả kết quả tạo đơn”; mọi kết quả xa hơn là thiếu |

### Trạng thái mua và kết quả

- **24** lượt gọi `create_order_dmx` tạo ra **12** phản hồi cuối có `status = done` và mã đơn, trong đó một hội thoại tạo hai đơn.
- Cả **11** hội thoại có dấu vết công cụ đều có ít nhất một phản hồi `done`.
- Nguồn không cho biết đây là môi trường thật, thử nghiệm hay tái hiện. Một số nội dung có dấu hiệu kiểm thử. Vì vậy `done` chỉ là **sự kiện công cụ trong tệp**, không phải bằng chứng độc lập rằng khách đã mua hoặc nhận hàng.
- Có **3** trường `rating` gắn với bản ghi trợ lý, nhưng không có định nghĩa thang điểm, chủ thể chấm hoặc đối tượng được chấm. Không được dùng chúng như nhãn hài lòng.
- Một số khách hàng tự thuật vấn đề sau khi đặt đơn ngay trong hội thoại, nhưng thiếu khóa liên kết tới sự kiện giao, hủy hay hoàn tiền. Đây là tín hiệu định tính để thiết kế lược đồ, chưa phải nhãn kết quả.

## Thiên lệch và giới hạn khái quát

| Thiên lệch | Bằng chứng trong nguồn | Hệ quả |
|---|---|---|
| Chọn mẫu theo ý định mua cao | **35/35** hội thoại có lời mua, đặt hoặc hành động giao dịch; chính sách phục vụ trong kho nói ưu tiên khách có nhu cầu tư vấn hoặc mua thật | Không đo được người chỉ tìm hiểu, bỏ cuộc sớm hoặc không mua |
| Chọn theo thành công | Tất cả phản hồi tạo đơn cuối có trạng thái `done`; không có kết quả tạo đơn thất bại cuối cùng | Dễ học nhầm rằng mọi luồng hỏi thông tin sẽ dẫn tới đơn thành công |
| Trùng và gần trùng | 11 hội thoại xuất hiện ở cả hai tệp; trong tệp 35 mẫu còn một cặp có chuỗi `user` trùng hoàn toàn, chỉ còn **34** chuỗi hội thoại `user` duy nhất | Rò rỉ giữa tập học và tập kiểm tra nếu chia ngẫu nhiên |
| Trợ lý dẫn dắt | Tất cả 35 hội thoại bắt đầu và kết thúc bằng trợ lý; nhiều trả lời của khách rất ngắn | Lựa chọn có thể phản ánh phương án và thứ tự do trợ lý đưa ra |
| Nội dung khách hàng mỏng | Tin `user` có trung vị **26 ký tự**, phân vị 90 chỉ **62 ký tự** | Không đủ độ sâu để suy động cơ, niềm tin hoặc phong cách ổn định |
| Nội dung máy chiếm ưu thế | Trong tệp 35 mẫu, trợ lý chiếm **141.206/157.234 ký tự**, khoảng **89,8%** | Huấn luyện trực tiếp dễ học mẫu câu của trợ lý thay vì tín hiệu khách hàng |
| Thời gian hẹp và thiếu | Tệp mua hàng có dấu thời gian từ **16/07/2026 18:16 UTC** tới **17/07/2026 13:53 UTC**; tệp 35 mẫu không có thời gian | Không đánh giá mùa vụ, thay đổi chính sách hoặc độ mới của tín hiệu |
| Đo lường không đồng nhất | Chỉ tập con 11 hội thoại có công cụ, thời gian và thông tin người dùng; 24 hội thoại còn lại chỉ có vai trò và nội dung | Không được coi thiếu trường ở 24 hội thoại là không xảy ra sự kiện |
| Một doanh nghiệp, một ngôn ngữ | Toàn bộ mẫu là hội thoại tiếng Việt trong cùng bối cảnh bán lẻ | Không khái quát sang doanh nghiệp, kênh hoặc ngôn ngữ khác |
| Không có khung lấy mẫu | Nguồn không ghi tiêu chí chọn 35 mẫu, tổng thể nguồn, tỷ lệ lấy hay lý do loại | Không thể ước lượng độ phổ biến ngoài mẫu |

Các chính sách giao, lắp, bảo hành và đổi trả giải thích vì sao khách hỏi về thời gian, phí, kiểm hàng và rủi ro. Chúng không chứng minh động cơ cá nhân và không được dùng để bổ sung nhãn còn thiếu.

## Lược đồ nhãn đề xuất

### Tách quan sát khỏi giả thuyết

Mỗi nhãn phải thuộc một trong ba lớp:

1. `observation`: dữ kiện hoặc hành động quan sát được, có con trỏ tới lượt nói hay sự kiện.
2. `hypothesis`: giả thuyết có bằng chứng ủng hộ, phản bác, phương án khác và câu hỏi kiểm chứng.
3. `outcome`: sự kiện có cấu trúc, nguồn phát sinh và phạm vi ý nghĩa rõ ràng.

Không được đưa `hypothesis` vào trường `observation` hoặc biến nhãn suy luận của mô hình thành sự thật huấn luyện.

```json
{
  "annotation_id": "ann_...",
  "source_group_id": "grp_...",
  "conversation_id": "pseudonymous_id",
  "span": {
    "message_index": 12,
    "role": "user"
  },
  "dimension": "barrier",
  "evidence_kind": "user_explicit",
  "directness": "direct",
  "presence": "present",
  "normalized_fact": {
    "type": "delivery_deadline",
    "value": "coarsened_or_categorical"
  },
  "scope": "current_session",
  "temporality": "current",
  "decision_impact": "may_change_filter",
  "needs_confirmation": false,
  "privacy_class": "none",
  "permitted_uses": ["evaluation"],
  "annotator_id": "reviewer_...",
  "guideline_version": "behavior-label-v1",
  "adjudication_status": "pending"
}
```

### Giá trị bắt buộc

- `dimension`: `context`, `job`, `motivation`, `constraint`, `barrier`, `tradeoff`, `belief`, `decision_action`, `decision_state`, `outcome`.
- `evidence_kind`: `user_explicit`, `system_event`, `interaction_trace`, `assistant_only`, `unavailable`.
- `directness`: `direct`, `weak_inference`, `no_evidence`, `contradictory`.
- `presence`: `present`, `absent_from_record`, `ambiguous`, `not_applicable`. `absent_from_record` không có nghĩa là đặc điểm không tồn tại.
- `scope`: `turn`, `current_session`, `cross_session`. Mẫu hiện tại hầu như chỉ hỗ trợ hai mức đầu.
- `decision_state`: nhãn theo lượt như `exploring`, `narrowing`, `confirming`, `ready_to_act`, `acted`, `reconsidering`, `unknown`. Không gán một trạng thái cho toàn bộ con người.
- `outcome`: tách `order_tool_done`, `payment_confirmed`, `fulfilled`, `cancelled`, `returned`, `satisfied`, `unknown`. Nguồn hiện tại chỉ chứng minh được nhãn đầu ở 11 nhóm.

## Quy trình tạo tập đánh giá

1. **Cổng quyền sử dụng:** xác nhận bằng văn bản mục đích đánh giá hoặc huấn luyện, căn cứ xử lý, người được truy cập, thời hạn lưu và quy trình xóa trước khi sao chép dữ liệu.
2. **Lập nhóm nguồn:** gán cùng `source_group_id` cho bản thô, bản che và bản gần trùng. Với dữ liệu hiện tại chỉ dùng **34** chuỗi `user` duy nhất để thử hướng dẫn nhãn, không coi đây là bộ chuẩn đủ mạnh.
3. **Khử định danh:** loại tên, số liên hệ, địa chỉ chi tiết, mã vị trí nhỏ, mã đơn, tên người dùng và tham số địa chỉ mạng. Làm thô thời gian và địa lý nếu chúng không cần cho phép đo.
4. **Giữ con trỏ, không nhân bản:** nhãn chỉ giữ chỉ số lượt nói hoặc mã sự kiện trong kho truy cập hạn chế. Không chép lại câu chứa dữ liệu cá nhân vào tệp nhãn.
5. **Viết sổ tay nhãn:** định nghĩa từng lớp bằng ví dụ dương, phản ví dụ, trường hợp mâu thuẫn và quy tắc `no_evidence`. Tách ràng buộc khỏi rào cản, tiêu chí khỏi đánh đổi và hành động khỏi phong cách.
6. **Hai người gán độc lập:** mỗi hội thoại được hai người gán nhãn mà không thấy dự đoán của mô hình. Người thứ ba phân giải bất đồng; báo cáo đồng thuận theo từng lớp.
7. **Lấy mẫu bổ sung có chủ đích:** bổ sung người chỉ tìm hiểu, bỏ cuộc, tạo đơn thất bại, hủy, giao thành công, đổi trả và hài lòng. Cân bằng theo ngành hàng và trạng thái quyết định, không cân bằng bằng thuộc tính nhạy cảm chưa được phép dùng.
8. **Chia tập theo nhóm:** chia theo `source_group_id`, khách hàng giả danh hóa và cửa sổ thời gian. Mọi bản sao, phiên nối tiếp và đơn liên quan phải nằm cùng một phía.
9. **Khóa tập giữ lại:** lưu mã băm, phiên bản hướng dẫn, nguồn, thời điểm và quyền dùng. Không dùng tập giữ lại để sửa lời nhắc hoặc chọn mô hình.
10. **Đánh giá đúng tầng:** đo độ đúng đoạn và giá trị cho quan sát trực tiếp; đo hiệu chỉnh và tỷ lệ xác nhận cho giả thuyết; đo giảm không chắc chắn cho câu hỏi; đo riêng từng kết quả giao dịch.

## Tín hiệu cấm dùng để học

- **Tên, số điện thoại, địa chỉ, mã tỉnh, huyện, xã hoặc phường, tên người dùng, giới tính, mã đơn và liên kết có tham số nhận dạng.**
- Dữ liệu vị trí chi tiết, giới tính và mọi thuộc tính nhạy cảm hoặc thuộc tính đại diện không cần thiết cho tư vấn.
- Suy luận về tuổi, thu nhập, dân tộc, sức khỏe, tính cách, mức tín nhiệm hoặc khả năng chi trả từ cách viết, vị trí, sản phẩm hay phương thức thanh toán.
- Nội dung `system`, `tool`, `api_data`, `knowledge_data`, lời trợ lý và mẫu phản hồi như nhãn sự thật về khách hàng.
- Tên tệp, `label` rỗng, `is_stop = false`, câu xác nhận do trợ lý viết hoặc phản hồi `done` như bằng chứng giao hàng, hài lòng hay hiệu quả sử dụng.
- Bản ghi gần trùng, đầu ra do chính hệ thống tạo và dữ liệu chịu ảnh hưởng vị trí hiển thị nếu không có nhóm đối chứng.
- Nhãn tâm lý do một mô hình tự gán mà chưa được khách xác nhận hoặc chuyên gia phân giải theo sổ tay.

## Kiểm soát quyền riêng tư bắt buộc

- **Không đưa hai tệp thô vào dịch vụ bên ngoài**, kể cả để gán nhãn tự động, trước khi có phê duyệt mục đích và hợp đồng xử lý phù hợp.
- Dùng kho tách biệt, mã hóa, phân quyền tối thiểu và nhật ký truy cập. Tệp đánh giá chỉ chứa mã giả và giá trị đã làm thô.
- Khử định danh cả nội dung người dùng, tham số gọi công cụ, phản hồi công cụ, siêu dữ liệu và bản sao. Chỉ che vài chữ số là không đủ khi bản chưa che còn trong cùng kho.
- Không băm trực tiếp số điện thoại hoặc địa chỉ làm mã khách hàng. Không gian giá trị nhỏ cho phép dò ngược. Dùng mã ngẫu nhiên và giữ ánh xạ ở kho riêng nếu thật sự cần liên kết.
- Đặt thời hạn xóa theo mục đích. Hỗ trợ rút đồng ý, hạn chế xử lý và xóa trên mọi bản sao, tập nhãn và chỉ mục dẫn xuất.
- Chạy kiểm tra rò rỉ trước khi khóa tập: mẫu số liên hệ, thư điện tử, địa chỉ, mã đơn, tên riêng, tham số địa chỉ mạng và chuỗi dài hiếm.

## Quyết định sử dụng dữ liệu hiện tại

| Mục đích | Quyết định | Điều kiện |
|---|---|---|
| Kiểm thử trích xuất hoàn cảnh, tác vụ, ràng buộc | **Dùng có điều kiện** | Khử định danh, nhóm trùng, nhãn hai người và chỉ dùng dữ kiện trực tiếp |
| Kiểm thử chọn câu hỏi làm rõ | **Dùng có điều kiện** | Tạo tình huống từ khoảng trống thật, chuyên gia chấm giá trị thông tin |
| Học động cơ, niềm tin hoặc cách quyết định | **Không dùng để huấn luyện** | Cần dữ liệu được hỏi và xác nhận rõ, đa phiên và đa trạng thái |
| Học trọng số đánh đổi từ lựa chọn | **Không dùng** | Thiếu tập đã hiển thị, lựa chọn bị từ chối và kiểm soát giá, tồn kho, thứ tự hiển thị |
| Đánh giá kết quả tạo đơn | **Chỉ thăm dò** | Xác minh môi trường và ý nghĩa `done`; bổ sung thất bại |
| Đánh giá hiệu quả sau tư vấn | **Không đủ dữ liệu** | Cần liên kết giao, hủy, đổi trả, hài lòng và kết quả sử dụng theo quyền đã duyệt |

## Rủi ro và quyết định còn mở

### Rủi ro chính

- **Rò rỉ dữ liệu cá nhân:** bản che có thể nối lại với bản chưa che.
- **Rò rỉ tập đánh giá:** bản sao và cặp hội thoại trùng làm tăng điểm giả tạo.
- **Suy diễn quá mức:** lời ngắn và chuỗi do trợ lý dẫn dắt dễ bị biến thành nhãn tâm lý.
- **Thiên lệch thành công:** chỉ quan sát tạo đơn `done`, không có đối chứng thất bại và bỏ cuộc.
- **Đánh giá sai mục tiêu:** tạo đơn không đồng nghĩa nhận hàng, giữ hàng, hài lòng hay phù hợp.

### Quyết định cần chủ sở hữu chốt

1. Dữ liệu có được phép dùng cho **đánh giá**, **gán nhãn** và **huấn luyện** như ba mục đích tách biệt hay không?
2. `chat_history_buy_product.json` đến từ môi trường thật, thử nghiệm hay tái hiện; `status = done` chính xác có nghĩa gì?
3. Nguồn chuẩn nào sẽ thay tệp JSON hỏng, và ai chịu trách nhiệm xuất lại dữ liệu có lược đồ cùng kiểm tra hợp lệ?
4. Có thể liên kết hợp pháp các sự kiện giao, hủy, đổi trả và hài lòng ở mức giả danh hóa nào?
5. Ai là chuyên gia phân giải nhãn, và ngưỡng đồng thuận nào được yêu cầu trước khi khóa tập?

## Kết luận

**Lõi chi phối:** dữ liệu hiện tại quan sát tốt điều khách nói và thao tác đặt hàng trong một phiên, nhưng gần như không quan sát được lý do sâu và hệ quả sau phiên; vì vậy chỉ nên dùng nó để kiểm thử trích xuất cùng câu hỏi xác nhận, không dùng để học nhãn tâm lý hay tuyên bố hiệu quả tư vấn.
