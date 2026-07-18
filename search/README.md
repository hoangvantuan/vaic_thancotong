# Tìm kiếm sản phẩm từ keyword nhu cầu khách hàng

Nhận câu nói tự nhiên của khách → trích nhu cầu có cấu trúc → xếp hạng sản phẩm
từ catalog thật (`docs/dataset/catalog/catalog.jsonl`) → trả top 3 kèm **lý do giải thích được**
và **nhược điểm thật**.

Thuần Python stdlib, không phụ thuộc thư viện ngoài, không gọi API.

## Chạy

```bash
cd search
python3 demo.py                       # chạy bộ câu hỏi mẫu
python3 demo.py "may lanh 18m2 duoi 20 trieu it on"
python3 test_search.py                # 49 test trên data thật
```

## Kết quả thật

Câu trong đề bài — *"máy lạnh dưới 20 triệu cho phòng ngủ 18m², tiết kiệm điện, ít ồn"*:

```
[1] Máy lạnh Daikin Inverter phòng 15-20m² 181064  —  14.590.000đ
  fit      vừa đúng phòng 18m² (hãng khuyên dùng cho 15-20m²)
  budget   giá 14.590.000đ, rẻ hơn mức anh/chị định chi 5.410.000đ
  energy   5 sao, tiết kiệm điện rất tốt (chỉ số 6.19)
  quiet    chạy êm, ngủ không bị làm phiền (19dB), lúc chạy mạnh lên tới 39dB
  ⚠        độ ồn chênh nhiều theo mức gió (19-39dB), chỉ êm khi phòng đã đủ lạnh
[2] Máy lạnh Panasonic Inverter phòng 15-20m² 181128  —  16.790.000đ
[3] Máy lạnh Aqua Inverter phòng 15-20m² 181108      —   5.890.000đ
```

Ba hãng khác nhau, trải giá 5,9-16,8 triệu — có thật sự để đánh đổi. **Cả máy đứng
số 1 cũng bị nêu nhược điểm**: bot không khen suông sản phẩm nào.

Nạp 8.746 sản phẩm: **~400ms**. Mỗi truy vấn: **p50 7,2ms / p95 10,8ms** — KPI đề bài là <5s, tức nhanh hơn **694 lần**. 49/49 test pass.

## Ba quyết định thiết kế, đều xuất phát từ khảo sát data thật

**1. Không dùng vector search cho phần lõi.** Các facet tư vấn đều là
low-cardinality: `Phạm vi sử dụng` chỉ **17 giá trị distinct**, `Số người sử dụng`
đúng **5 giá trị**. Regex phủ hết, chạy 10ms, và giải thích được từng bước — đề
bài chấm "kiến trúc AI có thể giải thích được". Vector search chỉ cần cho
`Tiện ích` (189 tag), và ở đó rule vẫn thắng vì các hãng đặt tên marketing tuỳ
hứng (`Sleep Mode` / `Best Sleep` / `Good Sleep` / `Sleep Curve` / `Dream Mode`
đều là một thứ) — `concepts.py` gom chúng lại có kiểm soát.

**2. Không dùng BTU để xếp hạng máy lạnh.** Chỉ ~16/1039 sản phẩm có BTU thật
(`Công suất đầu ra` fill 182 dòng, trong đó 166 dòng ghi `"Không"`). Đây là cái
bẫy lớn nhất của data — cách làm theo bản năng sẽ hỏng. Thay vào đó dùng
`Phạm vi sử dụng` (fill 945/1039), vốn **đã là** kết quả quy đổi BTU→diện tích do
chính hãng công bố: chính xác hơn, phủ rộng hơn, và ánh xạ thẳng vào câu khách hỏi
("phòng 18m²") mà không cần suy luận kỹ thuật.

**3. Ngân sách là hard filter, nhưng chỉ áp lên sản phẩm có giá.** Toàn catalog
chỉ **2.222/8.746 sản phẩm có giá** (25,4%). Loại hết đồ thiếu giá thì mất 75%
catalog; trộn chúng vào top 3 thì không trả lời được "bao nhiêu tiền". Giải pháp
là **chia hai rổ**:

- `Results.top` — có giá, trong ngân sách → dùng để tư vấn.
- `Results.no_price` — khớp nhu cầu nhưng thiếu giá → báo riêng: *"còn N mẫu nữa
  hợp nhu cầu nhưng chưa có giá, em kiểm tra giúp anh/chị nhé"*.

Không bịa giá, cũng không giấu sản phẩm.

## Chống bịa: cơ chế cụ thể

- `Value.state` phân biệt **5 trạng thái**, không gộp thành null:
  `OK` / `UNDISCLOSED` ("Hãng không công bố", "Đang cập nhật") / `NOT_APPLICABLE`
  ("Không", "Không có") / `MISSING` (ô trống) / `UNPARSED` (có text, parser không
  hiểu → giữ raw, **không đoán**). Mỗi trạng thái có câu trả lời bình dân riêng
  qua `Value.explain_missing()`.
- Mọi con số trong lời giải thích đến từ `Reason.text` do **code sinh**, không
  phải LLM. LLM (nếu ghép sau) chỉ diễn đạt lại `reasons` — không có đường để bịa số.
- `Reason.source_field` + `source_value` trỏ ngược về **cột catalog gốc** → log
  nguồn dữ liệu (điều kiện ký hợp đồng pilot trong đề bài).
- `Scored.caveats` ép nêu **nhược điểm thật** lấy từ data → chống "sản phẩm nào
  cũng tốt". Thiếu dữ liệu cũng là caveat phải nói ra.
- Ngân sách bất khả thi → **top rỗng**, không hạ chuẩn để lấp cho đủ 3.

## Kiến trúc

```
normalize.py   Value + State (5 trạng thái) + parser cho từng dạng bẩn
concepts.py    189 tag marketing -> 9 concept; từ khách nói -> concept
extract.py     câu tự nhiên -> Need (regex, ~1ms, không LLM)
catalog.py     14 JSON schema khác nhau -> Product thống nhất
search.py      hard filter -> score có breakdown -> MMR đa dạng -> Results
```

`Need.missing_critical()` trả về slot còn thiếu → **đây chính là đầu vào cho tầng
hỏi ngược**. Ví dụ `"mua may lanh"` → `['area_m2', 'budget_max']`.

## Xử lý data bẩn — đã test từng cái

| Vấn đề thật trong data | Cách xử lý |
|---|---|
| Không có cột tên sản phẩm | `_display_name()` dựng từ brand + Inverter + dung tích/diện tích + model_code |
| `"Từ 15 - 20m² (từ 40 đến 60m³)"` | Cắt phần `(m³)` trước, nếu không sẽ nuốt nhầm 40-60 |
| `"Dàn lạnh: 45/34/29 dB - Dàn nóng: 51 dB"` | Cắt đoạn dàn nóng (để ngoài trời, khách không nghe), giữ **cả dải** dàn lạnh 29-45dB |
| `"Dàn lạnh: 36 - 45 dB"` — chỉ khoe mức êm là khen suông | Chấm theo mức êm nhưng kéo về mức ồn nhất; dải chênh ≥8dB → caveat bắt buộc |
| `"5 sao (Hiệu suất năng lượng 6.23)"` | Tách cả sao lẫn COP; COP mịn hơn nên dùng để xếp hạng |
| `"Hãng không công bố"` (159 dòng tu-lanh) | → `UNDISCLOSED`, nói rõ với khách, không đoán |
| `Điện năng tiêu thụ` = `"1"`,`"0"`,`"2"` (may-lanh, vô nghĩa) | **Không dùng**; thay bằng COP + cờ Inverter |
| `"Số lượng": "Khoảng 7000 trang A4"` trong máy lạnh (lệch cột) | Cột không khai báo trong FacetSpec → không vào scoring; range check chặn số rác |
| `Tiện ích` pipe-separated | Tách theo `\|` (không tách `,` — `"Hẹn giờ bật, tắt máy"` là một tag) |
| model_code trùng (181142 × 5) | **Không gộp** — là biến thể thật (công suất/giá khác). Chỉ loại bản ghi trùng hoàn toàn |
| `"9tr5"`, `"20 củ"`, `"18m2"`, không dấu | `extract.py`, có test cho từng dạng |

## Giới hạn đã biết

- `FacetSpec` mới khai báo chi tiết cho `may-lanh`, `tu-lanh`, `may-giat`. Các
  category khác chạy được nhưng chỉ có facet chung (giá + tiện ích) — `tu-mat-tu-dong`
  và `may-rua-chen` hiện `facet fit = 0`. Thêm 1 category ≈ 5 dòng khai báo.
- Chưa có tồn kho: data không có cột này. Đề bài yêu cầu không bịa → không suy đoán.
- `khuyến mãi quà` chưa đưa vào scoring (free text dài, 845 dòng trùng nhau).
