# Bảng quy tắc quyết định — một lượt tư vấn

Tài liệu của phiếu **[Bước 2B] Xử lý một lượt tư vấn và chọn sản phẩm phù hợp** (#26).
Bảng này được viết **trước khi viết mã** (yêu cầu của phiếu) và là nguồn sự thật cho
`lib/core/rules/`. Mã chỉ được hiện thực đúng những gì bảng ghi; đổi luật là đổi bảng
trước, tăng phiên bản, rồi mới sửa mã.

**Phiên bản đang phục vụ:**

| Thành phần | Mã phiên bản |
|---|---|
| Bộ luật lọc cứng | `may-lanh@v1` |
| Bộ tiêu chí xếp hạng mềm | `ranker@v1` |
| Luật đủ-thông-tin & chọn câu hỏi | `sufficiency@v1` |
| Luật phá hoà | `ma_san_pham@v1` |
| Luật gợi ý gần nhất khi 0 sản phẩm qua lọc | `goi_y_gan_nhat@v1` |

Cùng (đầu vào, dữ liệu, các phiên bản trên) ⇒ cùng quyết định. Mọi ảnh chụp quyết định
ghi lại các mã phiên bản này (trường `appliedRuleVersions`) để tái hiện về sau — kể cả
lượt chỉ hỏi lại.

**Đóng băng phiên bản:** một mã phiên bản chỉ bị đóng băng kể từ khi có bản ghi quyết
định đầu tiên trích dẫn nó. Trước thời điểm đó (chưa ai trích dẫn), chỉnh bảng không
phải tăng phiên bản; sau thời điểm đó, quy trình bắt buộc là đổi bảng → tăng phiên
bản → sửa mã.

## 1. Tiêu chí đủ thông tin để chọn sản phẩm (sufficiency)

Một lượt chỉ đi tiếp vào lọc & xếp hạng khi nhu cầu **đã kiểm chứng** có đủ:

| Slot | Bắt buộc? | Thiếu thì |
|---|---|---|
| Ngành hàng (`category`) | **Bắt buộc** | Hỏi lại (câu hỏi ngành) |
| Tiêu chí hoàn cảnh (`fitValue` — m² với máy lạnh) | **Bắt buộc** | Hỏi lại (câu hỏi diện tích) |
| Ngân sách (`budgetVnd`) | Khuyến nghị | Vẫn tư vấn, kèm caveat "chưa lọc theo giá" |

**Kiểm chứng nhu cầu (tách dữ kiện thật / phỏng đoán / khoảng trống):** kết quả mô hình
chỉ là ỨNG VIÊN. Số liệu (`fitValue`, `budgetVnd`) chỉ được dùng khi trích lại được
bằng luật tất định từ **nguyên văn lời khách** (`userText`); giá trị mô hình đưa mà
nguyên văn không có là *phỏng đoán* — bị loại và tính là khoảng trống. Ngành lấy theo
thứ tự: khách chọn trên giao diện → trích tất định từ lời khách. Slot không có ở cả
hai nguồn là *khoảng trống*.

## 2. Chọn câu hỏi kế tiếp (một câu duy nhất)

Mỗi lượt hỏi tối đa **một** câu, nhắm khoảng trống có tác động lớn nhất theo thứ tự
ưu tiên cố định:

| Ưu tiên | Khoảng trống | Câu hỏi |
|---|---|---|
| 1 | Ngành hàng | "Dạ bên em hiện tư vấn các nhóm: «danh sách ngành từ registry». Anh/chị đang quan tâm nhóm nào ạ?" — câu hỏi ngành PHẢI liệt kê ngành thật từ `config/categories.json`, và `targetGap` mang theo danh sách để tầng diễn đạt không bịa ngành ngoài catalog |
| 2 | Diện tích phòng (máy lạnh) | "Phòng mình rộng khoảng bao nhiêu m² ạ, để em chọn đúng công suất?" |

Ngân sách không chặn tư vấn nên không có câu hỏi chặn; thiếu thì nêu caveat.

## 3. Điều kiện loại bắt buộc (lọc cứng — không bù trừ)

Chạy trên từng sản phẩm, theo hợp đồng `HardRule` của #24. Một lần `excluded` là loại;
điểm cao ở tiêu chí khác không cứu được.

| Mã luật | An toàn/tương thích? | Trường dữ liệu | Kết luận |
|---|---|---|---|
| `pham_vi_dien_tich@v1` | **Có** (`safetyCritical`) | `areaMinM2`, `areaMaxM2` | Khách nêu S m²: máy `areaMaxM2 + 5 < S` → `excluded` (quá yếu, không phải trade-off). Thiếu/mâu thuẫn dữ liệu phạm vi khi khách đã nêu S → `unverified`, và vì luật an toàn nên **đóng an toàn = loại**. Khách chưa nêu S → không ràng buộc. |
| `tran_ngan_sach@v1` | Không | `priceVnd` | Khách nêu ngân sách B: giá > B → `excluded`. Giá thiếu/mâu thuẫn → `unverified` (giữ để báo cáo, KHÔNG tự thành điểm loại). Khách chưa nêu B → không ràng buộc. |

Quy ước dữ liệu xấu: giá trị `absent`/`conflicting` không bao giờ được ép thành số;
luật đọc qua `numberOrNull` nên thiếu và mâu thuẫn đều ra "không đọc được" và đi theo
nhánh `unverified` — không đoán, không lấy trung bình.

## 4. Tiêu chí xếp hạng mềm (thứ tự ưu tiên)

Chỉ chạy trên tập đã qua lọc. Đóng góp chuẩn hoá [-1, 1], cộng dồn. Trọng số thể hiện
thứ tự ưu tiên và nằm ngay trong bảng:

| Ưu tiên | Mã tiêu chí | Trường | Trọng số | Cách chấm |
|---|---|---|---|---|
| 1 | `vua_dien_tich@v1` | `areaMinM2..areaMaxM2` | ×1.0 | Trong khoảng → 1. Dư công suất (S < min): 1 − (min − S)/10. Đuối nhẹ trong biên (max < S ≤ max + 5): 1 − (S − max)/5. Không có dữ liệu → 0 (không thưởng, không phạt). |
| 2 | `du_ngan_sach@v1` | `priceVnd` | ×0.7 | Trong ngân sách: 0.6 + tiền_dư/ngân_sách (chặn 1). Không có ngân sách/giá → 0. |
| 3 | `do_on_thap@v1` | `noiseDb` | ×0.5; ×0.75 khi khách ưu tiên "quiet" | (45 − dB)/20, chặn [-1, 1]. Không có số đo → 0. |

Khoảng trống ở tiêu chí mềm **không tự thành điểm phạt** (đóng góp 0), đúng quy tắc
bắt buộc của phiếu.

## 5. Sản phẩm ngang hạng và thứ tự ổn định

Hai sản phẩm cùng tổng đóng góp là **ngang hạng thật** — báo cáo xếp hạng ghi nhận
(`tieBreakRule`) thay vì giả vờ có hơn kém. Thứ tự trình bày khi ngang hạng lấy theo
**mã sản phẩm** (`ma_san_pham@v1`, so chuỗi), chỉ để ổn định đầu ra — không hàm ý
chất lượng.

## 6. Lý do, điểm đánh đổi, nguồn

- Mỗi khuyến nghị phải có ≥ 1 lý do; mỗi lý do là một nhận định nguyên tử **có nguồn
  chứng minh** (6 trường của #24). Đóng góp dương → lý do; đóng góp âm → điểm đánh đổi.
- Chỉ thuộc tính `observed` mới được làm lý do. Thiếu/mâu thuẫn không phải lý do chọn.
- Sản phẩm bị loại giữ nguyên trong báo cáo lọc kèm mã luật + diễn giải — cấm
  "danh sách bị loại không lý do".

## 7. Ranh giới ba kết cục

| Kết cục | Khi nào |
|---|---|
| `ask_one_question` | Thiếu slot bắt buộc (mục 1) sau kiểm chứng |
| `recommend` (1–3) | Đủ slot bắt buộc và ≥ 1 sản phẩm qua lọc, dựng được lý do có nguồn |
| `recommend` kèm caveat gợi-ý-gần-nhất | 0 sản phẩm qua lọc **vì diện tích khách nêu vượt phạm vi mọi mẫu** — xem mục 7b |
| `decline` | Đủ slot nhưng 0 sản phẩm qua lọc và luật 7b không áp dụng (`no_eligible_product`), ngành không có dữ liệu (`data_unavailable`), hoặc cổng công bố chặn sau một lần sửa (`insufficient_evidence`) |

Không đệm thêm lựa chọn yếu cho đủ 3: qua lọc bao nhiêu trả bấy nhiêu, tối đa 3.

## 7b. Gợi ý gần nhất khi diện tích vượt mọi mẫu (`goi_y_gan_nhat@v1`)

Khách nêu diện tích S mà **mọi** sản phẩm đọc được phạm vi đều có `areaMaxM2 + 5 < S`
(tức 0 sản phẩm qua lọc chỉ vì quá yếu, không phải vì ngân sách hay thiếu dữ liệu):
thay vì từ chối khô, trả `recommend` tối đa 3 mẫu **gần S nhất** kèm caveat nói rõ.

- Chọn mẫu: ưu tiên trong ngân sách (nếu khách đã nêu; cả nhóm vượt thì bỏ điều kiện
  này), sắp theo `areaMaxM2` giảm dần (gần S nhất), hoà thì giá tăng dần, rồi mã
  sản phẩm — tất định, chạy lại y hệt.
- Mỗi khuyến nghị vẫn phải có lý do CÓ NGUỒN (phạm vi, giá) và một điểm đánh đổi nói
  thẳng "chỉ đáp ứng tới Xm², thấp hơn nhiều so với Sm² khách nêu".
- Caveat mở đầu: bên em chưa có mẫu đáp ứng trọn Sm² (lớn nhất tới Xm²), mời khách
  cân nhắc các mẫu công suất lớn nhất / lắp nhiều máy.
- Luật này KHÔNG áp dụng khi kẹt vì ngân sách hay vì thiếu dữ liệu phạm vi — các
  trường hợp đó giữ nguyên `decline` với hướng dẫn nới tiêu chí.
- Bản ghi ghi thêm `appliedRuleVersions.relax = goi_y_gan_nhat@v1`; báo cáo lọc/xếp
  hạng vẫn là ảnh chụp GỐC (mọi sản phẩm bị loại + lý do), khuyến nghị gợi-ý-gần-nhất
  do luật này dựng và vẫn đi qua cổng công bố.

## 8. Bất biến tái lập

- `createdAt`, `screenedAt`, `rankedAt` lấy từ `receivedAt` của lượt — không lấy giờ
  máy lúc chạy, để cùng đầu vào (kể cả `receivedAt`) tạo bản ghi **giống hệt từng byte**.
- Gửi lại cùng `turnId` trả đúng bản ghi cũ, không chạy lại, không tạo bản thứ hai.
- Đổi cách **diễn đạt** câu trả lời không được đổi danh sách/thứ hạng sản phẩm: mọi
  quyết định chốt xong trước bước diễn đạt (ràng buộc bằng thứ tự pipeline của #24).
