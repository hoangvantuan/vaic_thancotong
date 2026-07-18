# dmx_search — Tài liệu developer

Module truy xuất sản phẩm điện máy từ câu yêu cầu tự nhiên của khách. Nhận một chuỗi
tiếng Việt, trả về top sản phẩm kèm lý do và nhược điểm, đọc từ catalog tĩnh.

Thuần Python stdlib (`re`, `json`, `unicodedata`, `dataclasses`, `enum`). Không phụ thuộc
ngoài, không gọi mạng, không GPU.

- [1. Bắt đầu nhanh](#1-bắt-đầu-nhanh)
- [2. Kiến trúc & luồng dữ liệu](#2-kiến-trúc--luồng-dữ-liệu)
- [3. Kiểu dữ liệu cốt lõi](#3-kiểu-dữ-liệu-cốt-lõi)
- [4. API công khai](#4-api-công-khai)
- [5. Chi tiết từng tầng](#5-chi-tiết-từng-tầng)
- [6. Công thức tính điểm](#6-công-thức-tính-điểm)
- [7. Tác vụ bảo trì thường gặp](#7-tác-vụ-bảo-trì-thường-gặp)
- [8. Bẫy đã biết](#8-bẫy-đã-biết)
- [9. Test](#9-test)
- [10. Tích hợp vào tầng khác](#10-tích-hợp-vào-tầng-khác)

---

## 1. Bắt đầu nhanh

```bash
cd search
python3 demo.py                                        # bộ câu hỏi mẫu
python3 demo.py "may lanh 18m2 duoi 20 trieu it on"    # câu tuỳ ý
python3 test_search.py                                 # 49 test trên data thật
```

Dùng trong code:

```python
from dmx_search.catalog import load_catalog, dedupe, known_brands, CATEGORY_HINTS
from dmx_search.extract import extract
from dmx_search.search import search

products = dedupe(load_catalog("../docs/dataset/catalog"))   # nạp 1 lần, giữ trong RAM (~13.7k SP)
brands   = known_brands(products)

need = extract("máy lạnh dưới 20 triệu cho phòng ngủ 18m², ít ồn", CATEGORY_HINTS, brands)
res  = search(products, need, k=3)

for s in res.top:
    print(s.product.display_name, s.product.price().num, s.total)
    print(s.breakdown())        # bảng điểm từng tiêu chí
    print(s.caveats)            # nhược điểm thật
```

`load_catalog` đọc từ đĩa mỗi lần gọi (~400ms). Trong server, gọi **một lần lúc khởi động**
và giữ `products`/`brands` ở scope toàn cục. `search()` không mutate `products`.

---

## 2. Kiến trúc & luồng dữ liệu

Sáu module, đồ thị phụ thuộc một chiều (không vòng):

```
normalize.py   ──►  concepts.py  ──►  extract.py  ──►  clarify.py   (tầng agent)
     │                   │                │
     └───────────────────┴────────────────┴──►  catalog.py  ──►  search.py
```

| Module | Trách nhiệm | Phụ thuộc |
|---|---|---|
| `normalize.py` | `Value` + `State` + các `parse_*()` biến giá trị thô thành facet có kiểu | — |
| `concepts.py` | Ánh xạ tag catalog ↔ concept; lexicon từ khách → concept | `normalize` |
| `extract.py` | Câu tự nhiên → `Need` (regex, ~1ms). CHỈ trích, không phán xét đủ/thiếu | `concepts`, `normalize` |
| `clarify.py` | Tầng **agent hỏi ngược**: soi `Need` thiếu slot quyết định nào → để hỏi khách. `search` KHÔNG dùng | `extract` |
| `catalog.py` | `catalog.jsonl` (một file) → `list[Product]` thống nhất | `normalize`, `concepts` |
| `search.py` | `Need` **đã rõ** + `Product[]` → `Results` (hard filter → score → MMR → ba rổ). Không lo slot thiếu | `catalog`, `concepts`, `extract`, `normalize` |

**Ranh giới quan trọng:** `extract` trích, `clarify` (tầng agent) quyết Need đã đủ chưa & hỏi ngược,
`search` chỉ tìm sản phẩm cho Need đã rõ. `search` không import `clarify` và ngược lại — nếu Need
chưa đủ, agent phải hỏi xong rồi mới gọi `search`, đó không phải việc của `search`.

### Kỹ thuật dùng ở mỗi bước — trả lời gọn "search bằng gì"

Không có một công cụ duy nhất; mỗi bước dùng đúng kỹ thuật cho việc của nó:

| Bước | Việc | Kỹ thuật |
|---|---|---|
| Đọc câu khách — số/đơn vị | `"18m2"`, `"20 củ"`, `"9tr5"` → số | **regex** (`extract.py`) |
| Đọc câu khách — từ khoá | `"ít ồn"` → `quiet`, `"LG"` → brand | **lexicon** — bảng tra từ (`concepts.py`: `QUERY_LEXICON`, `ROOM_LEXICON`) |
| Làm sạch catalog | `"Từ 15 - 20m²"` → `lo=15, hi=20` | **regex** (`normalize.py`: `parse_*`) |
| **Tìm & xếp hạng sản phẩm** | khớp nhu cầu → top sản phẩm | **so sánh số học + chấm điểm có trọng số** (`search.py`) — **không** BM25, **không** vector search, **không** regex |

Điểm mấu chốt: regex và lexicon chỉ dùng để **đọc-hiểu câu** và **làm sạch dữ liệu**. Đến khi
*tìm sản phẩm* thì cả hai phía đã là facet số/nhãn có cấu trúc, nên "search" thực chất là
**lọc bằng vị từ số học** (`lo ≤ 18 ≤ hi`, `giá ≤ ngân sách`) rồi **cộng điểm** — quét tuyến
tính 8.746 sản phẩm hết ~7ms. Xem chi tiết ở [§5.3](#53-extractpy--trích-nhu-cầu) (đọc câu) và
[§6](#6-công-thức-tính-điểm) (tìm & chấm điểm).

**Luồng một truy vấn** (`search()`):

```
Need + products
   │
   ├─ _hard_filter()   loại theo category / brand / máy quá yếu so với phòng
   │
   ├─ _weights(need)   chọn trọng số theo ngữ cảnh (phòng ngủ, tiết kiệm điện, giá rẻ)
   │
   ├─ score(p, need)   với mỗi SP còn lại → Scored{reasons[], total, caveats[]}
   │                   đồng thời phân vào 3 rổ theo tình trạng giá:
   │                     • có giá + trong ngân sách  → priced_in_budget
   │                     • có giá + vượt ngân sách   → priced_over  (chỉ đếm)
   │                     • không giá                 → unpriced
   │
   ├─ _diversify(priced_in_budget, k)   MMR → top k đa dạng hãng/dải giá
   │
   └─ Results{ top, no_price, total_matched, filtered_out_by_budget }
```

---

## 3. Kiểu dữ liệu cốt lõi

### `Value` + `State` — `normalize.py`

Kết quả parse một ô dữ liệu. Điểm mấu chốt: **phân biệt 5 lý do vắng mặt**, không gộp thành
`None`, vì mỗi lý do cho khách một câu trả lời khác nhau.

```python
class State(str, Enum):
    OK             = "ok"           # parse được
    UNDISCLOSED    = "undisclosed"  # "Hãng không công bố", "Đang cập nhật"
    NOT_APPLICABLE = "n/a"          # "Không", "Không có" — SP thật sự không có tính năng
    MISSING        = "missing"      # ô trống
    UNPARSED       = "unparsed"     # có text nhưng parser không hiểu → giữ raw, KHÔNG đoán

@dataclass(frozen=True)
class Value:
    state: State
    raw:   Any = None            # giá trị gốc, luôn giữ để trace nguồn
    num:   float | None = None   # cho facet đơn trị (giá, độ ồn, COP)
    lo:    float | None = None   # cho facet dạng khoảng (diện tích, số người)
    hi:    float | None = None
    tags:  tuple[str, ...] = ()  # cho facet multi-value (Tiện ích)

    @property
    def ok(self) -> bool: ...              # state is OK
    def explain_missing(self) -> str: ...  # câu bình dân khi không OK
```

**Luôn kiểm `v.ok` trước khi đọc `v.num`/`v.lo`/`v.hi`.** Khi không OK, các trường số là `None`.

### `Product` — `catalog.py`

```python
@dataclass
class Product:
    product_id:   str                 # id ổn định trong catalog.jsonl (khoá dedupe)
    model_code:   str                 # thường null trong nguồn mới
    sku:          str                 # thường null trong nguồn mới
    category:     str                 # nhãn hiển thị: "Máy lạnh"
    slug:         str                 # khoá máy: "may-lanh"
    brand:        str
    display_name: str                 # cột `name` thật trong catalog.jsonl
    facets:       dict[str, Value]    # {"area": Value, "noise_db": Value, ...}
    concepts:     frozenset[str]      # {"quiet", "inverter", ...}
    inverter:     bool
    raw:          dict                # bản ghi JSON gốc, đầy đủ (specs nằm ở raw["specs"])

    def price(self) -> Value:      # ưu tiên price_sale, lùi về price_list
    def has_price(self) -> bool:
```

`facets` chứa `price_list`/`price_sale` (dựng từ object `price`) cùng các key khai báo trong
`FACET_SPECS[slug]` (§5). Muốn trường khác thì đọc từ `raw["specs"]`.

### `Need` — `extract.py`

```python
@dataclass
class Need:
    category:  str | None = None     # slug, vd "may-lanh"
    budget_max: float | None = None  # VND
    budget_min: float | None = None
    area_m2:   float | None = None
    people:    float | None = None
    room:      str | None = None     # "bedroom" | "living" | "office"
    brands:    list[str] = []
    concepts:  list[str] = []        # ["quiet", "sleep", ...]
    wants_energy_saving: bool = False
    wants_cheap:         bool = False
    raw_text:  str = ""
    # KHÔNG có method phán xét đủ/thiếu ở đây — việc đó thuộc clarify.py (tầng agent).
```

`None`/rỗng nghĩa là **khách chưa nói**, không phải "không quan tâm". Biến điều đó thành danh sách
câu cần hỏi ngược là việc của `clarify` (§5.3b) — `missing_required`/`recommended_to_ask` — không phải của `Need`.

### `Reason` / `Scored` / `Results` — `search.py`

```python
@dataclass
class Reason:
    criterion:    str    # "fit" | "budget" | "energy" | "quiet" | "concept" | "brand"
    score:        float  # 0..1
    weight:       float
    text:         str    # câu giải thích bình dân, đã chứa số thật
    source_field: str | None   # cột catalog gốc → log nguồn
    source_value: str | None
    @property
    def contribution(self) -> float:   # score * weight

@dataclass
class Scored:
    product: Product
    reasons: list[Reason]
    total:   float                # Σ contribution
    caveats: list[str]            # nhược điểm thật (kể cả "thiếu dữ liệu")
    def breakdown(self) -> str:   # bảng text từng tiêu chí, để debug

@dataclass
class Results:
    top:      list[Scored]        # có giá + trong ngân sách, đã đa dạng hoá → tư vấn
    no_price: list[Scored]        # khớp nhu cầu nhưng thiếu giá → báo riêng (tối đa 5)
    total_matched:          int   # số SP qua hard filter
    filtered_out_by_budget: int   # số SP có giá nhưng vượt ngân sách
```

---

## 4. API công khai

Đây là những hàm developer gọi trực tiếp. Còn lại (`_hard_filter`, `_score_*`, `_diversify`,
`_weights`, `_caveats`, `_vnd`) là nội bộ — tiền tố `_`.

| Hàm | Chữ ký | Vai trò |
|---|---|---|
| `load_catalog` | `(root, slugs=None) -> list[Product]` | Nạp catalog. `slugs` để nạp một phần khi test. |
| `dedupe` | `(products) -> list[Product]` | Loại bản ghi trùng hoàn toàn. **Luôn bọc `load_catalog` bằng cái này.** |
| `known_brands` | `(products) -> set[str]` | Tập brand, truyền vào `extract`. |
| `extract` | `(text, category_hints, known_brands) -> Need` | Câu → `Need`. |
| `search` | `(products, need, k=3) -> Results` | Xếp hạng. |
| `CATEGORY_HINTS` | `dict[str, list[str]]` | Hằng: từ khoá nhận diện ngành hàng. Truyền vào `extract`. |

Ba tham số của `extract` đều bắt buộc vì `category_hints` và `known_brands` lấy từ catalog thật,
không hard-code trong `extract.py`.

---

## 5. Chi tiết từng tầng

### 5.1 `normalize.py` — parser

Mỗi `parse_*(raw) -> Value` xử lý một *dạng dữ liệu*, không phải một ngành hàng. Vì thế dùng
lại được giữa các ngành.

| Parser | Nhận | Trả |
|---|---|---|
| `parse_price` | `"17630000"`, `17630000` | `num` = VND (100k–500tr, ngoài dải → `UNPARSED`) |
| `parse_area_range` | `"Từ 15 - 20m² (từ 40 đến 60m³)"` | `lo`, `hi` (đã cắt phần `(m³)`) |
| `parse_people_range` | `"3 - 4 người"`, `"Trên 5 người"` | `lo`, `hi` |
| `parse_energy_label` | `"5 sao (Hiệu suất năng lượng 6.23)"` | `num` = sao, `hi` = COP |
| `parse_noise` | `"Dàn lạnh: 45/34/29 dB - Dàn nóng: 51 dB"` | `num`/`lo` = min dàn lạnh, `hi` = max |
| `parse_volume_liters` | `"180 lít"` | `num` = lít |
| `parse_tags` | `"a \| b \| c"` | `tags` = tuple đã strip |

Mọi parser gọi `_sentinel(raw)` đầu tiên để bắt `MISSING`/`UNDISCLOSED`/`NOT_APPLICABLE` trước
khi thử parse. Danh sách sentinel:

```python
_UNDISCLOSED    = {"hang khong cong bo", "dang cap nhat", "chua co thong tin"}
_NOT_APPLICABLE = {"khong", "khong co"}
```

So khớp sau khi `fold()` (bỏ dấu + lower). Thêm biến thể mới thì sửa hai set này.

`fold(s)` là hàm nền tảng: `"Máy Lạnh"` → `"may lanh"`. Dùng ở mọi nơi cần khớp không dấu.

### 5.2 `concepts.py` — ánh xạ ngữ nghĩa

Ba cấu trúc:

- `CONCEPTS: dict[str, Concept]` — 9 concept, mỗi cái có `tag_any` (khớp nếu chứa) và `tag_not`
  (loại trừ). Dùng lúc index.
- `QUERY_LEXICON: dict[str, list[str]]` — từ khách gõ → concept hoặc intent (`_energy`,
  `_cheap`, `_premium`). Dùng lúc truy vấn.
- `ROOM_LEXICON` — từ khoá suy ra loại phòng.

```python
@dataclass(frozen=True)
class Concept:
    key:     str
    label:   str                    # tên bình dân để giải thích
    tag_any: tuple[str, ...] = ()   # đã fold
    tag_not: tuple[str, ...] = ()

def tag_to_concepts(tag: str) -> list[str]   # 1 tag catalog → các concept nó thoả
def is_inverter(raw_energy_tech) -> bool     # "Dual Inverter" → True, "Không có" → False
```

`tag_not` chặn false-positive quan trọng, vd `"Khóa trẻ em"` (an toàn) không được gán concept
`kids_elderly` (tiện nghi gió).

### 5.3 `extract.py` — trích nhu cầu

Quy trình trong `extract(text, category_hints, known_brands)`:

1. `fold(text)` → chuỗi không dấu.
2. `extract_money()` → `(budget_min, budget_max)`. Thứ tự regex: range → under → "9tr5" split →
   bare → VND thuần. **Thứ tự quan trọng**, xem [§8](#8-bẫy-đã-biết).
3. Regex diện tích (`_RE_AREA`, chặn 3–500), số người (`_RE_PEOPLE`/`_RE_FAMILY`, chặn 1–20).
4. Duyệt `category_hints` → `category` (lấy match đầu tiên).
5. Duyệt `known_brands` → `brands` (khớp trọn từ `\b...\b`).
6. Duyệt `ROOM_LEXICON` → `room` (khớp trọn từ).
7. Duyệt `QUERY_LEXICON` → `concepts` + cờ `wants_energy_saving`/`wants_cheap`.

Đơn vị tiền quy về VND ngay trong `extract_money` (`× 1_000_000` cho "triệu/tr/củ/chai").

`extract` **không** tự quyết Need đủ/thiếu — nó chỉ trích. Việc kiểm tra thiếu để hỏi ngược
ở §5.3b.

### 5.3b `clarify.py` — tầng agent hỏi ngược

**Luật: có ÍT NHẤT 1 tín hiệu là search — KHÔNG bắt buộc phải có category.**

`signals(need)` liệt kê các **tín hiệu tìm kiếm** khách đã cung cấp, trong 4 loại:

| Tín hiệu | Điều kiện | search bám vào |
| --- | --- | --- |
| `category` | `need.category` có | lọc đúng ngành |
| `budget` | có `budget_max`/`budget_min` | lọc/chấm theo giá |
| `brand` | `need.brands` không rỗng | lọc đúng hãng |
| `fit` | có `area_m2` hoặc `people` | chấm độ hợp |

- `is_ready(need)` = **có ≥1 tín hiệu**. Đây là điều kiện DUY NHẤT để search chạy.
- `missing_required(need)` = rỗng khi ready; ngược lại trả `["tiêu chí tìm kiếm"]` (Need rỗng hoàn
  toàn — câu chào, "bạn tìm đi"... → agent hỏi "cần mua gì / tầm giá / hãng nào").
- `recommended_to_ask(need)` = slot NÊN hỏi thêm cho sát (category nếu chưa biết ngành; diện
  tích/số người; ngân sách) — **không** chặn search.

Vì sao không bắt buộc category: khách nói "dưới 15tr hãng Samsung" (budget+brand, chưa nói ngành)
vẫn tìm được — search chấm theo giá/hãng, và **tự loại SP không sinh được lý do** (§5.5) nên rác
được lọc tự nhiên. Chỉ khi Need rỗng hoàn toàn mới phải hỏi.

Đây là **hợp đồng giữa agent và search**: agent hỏi tới khi `is_ready(need)` = True rồi gọi
`search(products, need)`; `recommended_to_ask` chỉ để gợi ý hỏi thêm. `search` KHÔNG import
`clarify` — nó tin Need đưa vào đã có tín hiệu. Xem [demo.py](demo.py) để thấy luồng này.

### 5.4 `catalog.py` — nạp & hợp nhất

Nguồn data: **một file** `docs/dataset/catalog/catalog.jsonl` (mỗi dòng một sản phẩm). Mỗi bản
ghi: `{product_id, name, brand, category:{id,name}, price:{original,sale,currency}, specs:{...}}`.

`FACET_SPECS[slug]` khai báo cột **spec** nào (trong `raw["specs"]`) ánh xạ vào facet chuẩn nào,
kèm parser. Giá KHÔNG nằm ở đây — nó là object số riêng, xử lý trong `_price_facets()`:

```python
FACET_SPECS = {
    "may-lanh": {
        "Phạm vi sử dụng":  ("area",       parse_area_range),
        "Độ ồn":            ("noise_db",   parse_noise),
        "Nhãn năng lượng":  ("energy",     parse_energy_label),
        "Tiện ích":         ("features",   parse_tags),
    },
    "tu-lanh": { ... },
    "may-giat": { ... },
}
_DEFAULT_SPEC = { Tiện ích }   # ngành chưa khai báo riêng dùng cái này
```

`load_catalog` duyệt từng dòng JSONL:

1. **Bỏ bản ghi `name=null`** — đó là sản phẩm chỉ có trong bảng spec kỹ thuật, không bán.
2. Suy `slug` từ `category.name` qua `category_to_slug` = `_SLUG_OVERRIDES` (vài ngành cần slug
   cứng vì `FACET_SPECS`/`_FIT_CRITICAL` tham chiếu) rồi `_auto_slug` (tự sinh cho mọi ngành khác).
   Từ khoá nhận diện category (`build_category_hints`) cũng **tự sinh từ chính data** — thêm ngành
   mới vào catalog là tự nhận diện được, không phải khai báo tay.
3. `_price_facets(raw["price"])` → `price_list`/`price_sale` (giá đã là số, không parse chuỗi).
4. Chọn `spec = FACET_SPECS.get(slug, _DEFAULT_SPEC)`; chạy parser trên `raw["specs"]` → `facets`.
5. Gom `concepts` từ `facets["features"].tags` qua `tag_to_concepts`, cộng `"inverter"` nếu có.
6. `display_name` lấy thẳng cột `name` thật (nguồn mới đã có tên sản phẩm).

### 5.5 `search.py` — xếp hạng

Xem luồng ở [§2](#2-kiến-trúc--luồng-dữ-liệu). Bốn điểm cần nhớ khi sửa:

- **Hard filter** (`_hard_filter`) loại cứng: sai category (nếu khách nêu), sai brand, hoặc máy
  quá yếu (`area > a.hi + 5`). Khách KHÔNG nêu category → không lọc ngành, chấm toàn catalog.
- **Loại SP 0 lý do**: trong `search()`, SP nào `score()` không sinh được `Reason` nào bị **loại
  khỏi mọi rổ** — không tư vấn suông. Nhờ vậy câu chỉ có ngân sách/hãng vẫn tự lọc rác.
- **Reason "category" tối thiểu**: khi khách nêu ngành, mọi SP đúng ngành được cộng 1 `Reason`
  "đúng loại ... anh/chị hỏi" (weight 0.3). Để câu chỉ-category (kể cả ngành chưa có `FACET_SPECS`,
  vd laptop) vẫn ra kết quả thay vì rỗng — category chính là một lý do.
- **Ba rổ theo giá** phân trong vòng lặp `search()`, không phải trong `score()`. `no_price` chỉ
  giữ SP `total > 0`, tối đa 5, tránh nhiễu.

---

## 6. Công thức tính điểm

```
total(p) = Σ_c  score_c(p, need) × weight_c        c ∈ {fit, budget, energy, quiet, concept, brand}
```

Mỗi `score_c ∈ [0, 1]` do một hàm `_score_*` sinh, kèm một `Reason` (giải thích + nguồn). Hàm
trả `None` nếu tiêu chí không áp dụng (vd thiếu dữ liệu) → tiêu chí đó không vào tổng.

### Trọng số

```python
BASE_WEIGHTS = {"fit": 3.0, "budget": 2.0, "energy": 1.5, "quiet": 1.0, "concept": 1.0, "brand": 0.5}
```

`_weights(need)` ghi đè theo ngữ cảnh:

| Điều kiện | Ghi đè |
|---|---|
| `room == "bedroom"` hoặc concept có `quiet`/`sleep` | `quiet` → 2.5 |
| `wants_energy_saving` | `energy` → 2.5 |
| `wants_cheap` | `budget` → 3.0 |

`fit` cố định 3.0 (nặng nhất) — sai kích cỡ thì ưu điểm khác vô nghĩa.

### Cách chấm từng tiêu chí

| Tiêu chí | Điểm 1.0 khi | Giảm dần theo |
|---|---|---|
| `fit` (diện tích) | `lo ≤ area ≤ hi` | dư: `1 − (lo−area)/10`; thiếu: `1 − (area−hi)/5` (phạt dốc gấp đôi) |
| `fit` (số người) | `lo ≤ people ≤ hi` | rộng: `/4`; chật: `/2` |
| `budget` | rẻ hơn trần nhiều | `0.6 + tiết_kiệm/trần` (cap 1.0); vượt trần → 0.0 |
| `energy` | COP ≥ 6.0 | `(cop − 3.5)/2.5`; không có COP nhưng Inverter → 0.6 |
| `quiet` | mức ồn hiệu dụng ≤ 25dB | `(45 − eff)/20`, với `eff = 0.6·min + 0.4·max` |
| `concept` | thoả mọi concept khách hỏi | `|khớp| / |yêu cầu|` |
| `brand` | đúng hãng khách hỏi | 0 hoặc 1 |

`quiet` dùng `eff` (nghiêng về mức ồn khi chạy mạnh) chứ không chỉ `min`, để không khen máy có
dải ồn rộng — xem [§8](#8-bẫy-đã-biết).

### Caveat (nhược điểm bắt buộc)

`_caveats()` sinh nhược điểm để chống "sản phẩm nào cũng tốt". Ngưỡng:

- `fit < 0.9`, `quiet < 0.6`, `energy < 0.6`, `budget ≤ 0.0` → thêm chính câu `Reason.text`.
- Dải ồn `hi − lo ≥ 8dB` → thêm cảnh báo "chỉ êm khi phòng đã đủ lạnh".
- `noise_db`/`energy` ở trạng thái `UNDISCLOSED`/`MISSING` → nói rõ thiếu dữ liệu.
- Không có giá → thêm caveat giá.

### MMR (`_diversify`)

Chọn top-k tối đa hoá `total × (1 − penalty)` so với các SP **đã chọn**:

```
penalty = 0.20 × (số lần brand đã xuất hiện) + 0.12 × (dải giá 5tr đã xuất hiện)
```

Hạng 1 luôn là điểm cao nhất (không phạt). Phạt theo tỉ lệ nên độc lập với thang điểm.

---

## 7. Tác vụ bảo trì thường gặp

### Thêm một ngành hàng vào scoring

Ngành chưa có trong `FACET_SPECS` vẫn chạy nhưng chỉ có facet chung (giá + tiện ích).
Giá đã tự có sẵn cho mọi ngành (object `price`). Để có facet fit riêng:

1. Thêm entry vào `FACET_SPECS` (`catalog.py`) — chỉ khai báo cột **spec**, KHÔNG khai báo giá:

```python
FACET_SPECS["may-rua-chen"] = {
    "Số lượng":        ("meals",      parse_people_range),   # "3 - 4 bữa ăn Việt (...)"
    "Độ ồn":           ("noise_db",   parse_noise),
    "Tiện ích":        ("features",   parse_tags),
}
```

2. Đảm bảo `category.name` của ngành có trong `CATEGORY_SLUGS` (nếu không, slug tự suy từ
   tên đã fold-gạch-nối — vẫn chạy nhưng nên map tường minh cho khớp `FACET_SPECS`).

3. **Kiểm parser trên dữ liệu thật trước khi tin** (bắt buộc, xem [§8](#8-bẫy-đã-biết)):

```python
import json
from collections import Counter
from dmx_search.normalize import fold, parse_people_range
cnt = Counter()
with open("../docs/dataset/catalog/catalog.jsonl", encoding="utf-8") as fh:
    for line in fh:
        r = json.loads(line)
        if fold((r.get("category") or {}).get("name")) != "may rua chen":
            continue
        v = (r.get("specs") or {}).get("Số lượng")
        if v: cnt[str(v)] += 1
for v, _ in cnt.most_common():
    print(parse_people_range(v).state.value, "|", v)   # soi UNPARSED và ca biên
```

4. Nếu ngành cần facet fit theo trường mới, thêm nhánh trong `_score_fit` và mở rộng
   `recommended_to_ask` (`clarify.py`) cho slug đó (fit chỉ là khuyến nghị, không chặn). Nếu fit
   là tiêu chí quyết định, thêm slug vào `_FIT_CRITICAL` (`search.py`) để SP thiếu dữ liệu fit
   rơi vào rổ `unverified_fit`.
5. Thêm `CATEGORY_HINTS[slug]` để `extract` nhận diện được câu hỏi.
5. Viết test trong `test_search.py`.

### Thêm/sửa concept tiện ích

Trong `concepts.py`, thêm entry `CONCEPTS`. Sau đó thêm từ khoá khách gõ vào `QUERY_LEXICON`
cùng key. Chú ý `tag_not` để chặn false-positive. Chạy test concept trong `test_search.py`.

### Chỉnh trọng số / ngưỡng

- Trọng số cơ sở: `BASE_WEIGHTS` trong `search.py`.
- Ghi đè theo ngữ cảnh: `_weights()`.
- Ngưỡng caveat: `_caveats()`.
- Hệ số phạt MMR: `_diversify()` (`0.20`, `0.12`).

Đây đều là hằng số đọc được, sửa trực tiếp. Sau khi sửa **chạy `test_search.py`** — nhiều test
khoá hành vi cụ thể (vd top 3 phải đa dạng hãng).

### Thêm sentinel mới

Nếu gặp giá trị "rỗng ngầm" mới (vd `"N/A"`, `"Liên hệ"`), thêm vào `_UNDISCLOSED` hoặc
`_NOT_APPLICABLE` trong `normalize.py` (dạng đã fold, không dấu).

---

## 8. Bẫy đã biết

Những chỗ đã cắn và đã có test khoá lại. Đọc trước khi sửa vùng liên quan.

**Khớp chuỗi con sau khi bỏ dấu.** `"nguoi"` chứa `"ngu"`. Mọi so khớp lexicon sau `fold()`
**phải neo biên từ** `\b...\b`. Từng có bug: "gia dinh 4 nguoi" bị gán `room=bedroom`.

**Số trong ngoặc.** `"Từ 15 - 20m² (từ 40 đến 60m³)"` có 4 số. Parser khoảng **phải cắt `(...)`
trước** (`str(raw).split("(")[0]`). Bẫy này lặp lại ở bất kỳ trường nào có chú thích trong ngoặc
— gồm cả trường máy rửa chén khi mở rộng.

**Thứ tự regex tiền.** `"9tr5"` phải bắt bằng `_RE_MONEY_SPLIT` **trước** `_RE_MONEY_BARE`, nếu
không "9tr" khớp trước và mất chữ số lẻ (thành 9 triệu thay vì 9,5).

**Độ ồn: đừng chỉ lấy min.** `"Dàn lạnh: 36 - 45 dB"` — lấy min=36 rồi khen "chạy êm" là giấu
mức 45dB khi chạy mạnh. `parse_noise` giữ cả `lo` và `hi`; `_score_quiet` dùng `eff = 0.6·lo +
0.4·hi`; `_caveats` cảnh báo khi `hi − lo ≥ 8`.

**Đơn vị vô nghĩa.** `Điện năng tiêu thụ` của máy lạnh là `"1"/"0"/"2"` — **không dùng** để
scoring. Tiết kiệm điện chấm qua `energy` (COP) + cờ `inverter`.

**Lệch cột.** Có record máy lạnh chứa `"Số lượng": "Khoảng 7000 trang A4"` (giá trị máy in). Vì
`"Số lượng"` không nằm trong `FACET_SPECS["may-lanh"]` nên nó không vào scoring. Range check
trong parser (vd giá 100k–500tr, dB 15–70) chặn số rác lọt qua khi có.

**`model_code` trùng.** Cùng model_code xuất hiện nhiều dòng với giá/spec khác nhau — là **biến
thể thật**, không gộp. `dedupe` chỉ loại bản ghi trùng theo `(model_code, sku, giá, dải diện
tích)`.

**Luôn `dedupe(load_catalog(...))`.** `load_catalog` không tự dedupe.

---

## 9. Test

```bash
python3 test_search.py     # 49 test, exit 1 nếu có fail
```

Chạy trên **data thật** (`../docs/dataset/catalog`), không mock. Bốn nhóm:

1. **normalize** — parser trên giá trị thật lấy từ catalog (kể cả sentinel, số nhúng câu).
2. **concepts** — gom biến thể marketing (`Sleep Mode`/`Best Sleep`/... → `sleep`); `tag_not`.
3. **extract** — tiếng Việt văn nói (`9tr5`, `20 củ`, `18m2`, không dấu); bẫy chuỗi con.
4. **search** — bất biến hành vi: top có giá thật, top 3 đa dạng hãng, ngân sách bất khả thi →
   top rỗng, mọi lý do có `source_field`, không SP nào bị khen suông.

Khi sửa hành vi, cập nhật test tương ứng. Test là spec khả thi của các bất biến, đừng nới lỏng
để cho pass.

---

## 10. Tích hợp vào tầng khác

### Với tầng hỏi ngược (agent)

`clarify` chia hai mức: `missing_required` (chỉ `category`, **chặn** search) và
`recommended_to_ask` (diện tích/số người/ngân sách, chỉ **gợi ý**). Ranh giới: agent phải có
`category` rồi mới gọi `search`; các slot khuyến nghị thiếu vẫn search được.

```python
from dmx_search.clarify import missing_required, recommended_to_ask, is_ready

need = extract(user_text, CATEGORY_HINTS, brands)
if not is_ready(need):                       # thiếu category -> BẮT BUỘC hỏi
    ask_next(missing_required(need)[0])      # CHƯA gọi search
else:
    res = search(products, need, k=3)        # đủ điều kiện -> tư vấn ngay
    for slot in recommended_to_ask(need):    # gợi ý hỏi thêm cho sát (không chặn)
        suggest_ask(slot)                    # vd "budget_max", "area_m2"
```

Qua nhiều lượt, merge `Need` cũ với `Need` mới (giữ giá trị đã có, điền giá trị mới).

### Với tầng sinh lời tư vấn (LLM)

`search()` đã sinh sẵn mọi số và câu giải thích trong `Reason.text` + `caveats`. **LLM chỉ diễn
đạt lại, không được cấp/tính số** — đây là cơ chế chống bịa. Truyền cho LLM:

```python
{
  "products": [
    {
      "name": s.product.display_name,
      "price": s.product.price().num if s.product.has_price() else None,
      "reasons": [r.text for r in s.reasons],
      "caveats": s.caveats,
      "sources": [(r.source_field, r.source_value) for r in s.reasons if r.source_field],
    }
    for s in res.top
  ],
  "no_price_count": len(res.no_price),
  "over_budget_count": res.filtered_out_by_budget,
}
```

`sources` phục vụ log nguồn dữ liệu (yêu cầu pilot). `over_budget_count`/`no_price_count` giúp
bot nói được "còn N mẫu vượt ngân sách" / "N mẫu chưa có giá".

### Khi lên pilot với API giá/tồn kho thật

Thay `parse_price` đọc JSON tĩnh bằng lời gọi API, giữ nguyên hợp đồng `Value`: API rỗng →
`MISSING`, API lỗi → `UNDISCLOSED`. Phần còn lại của pipeline không đổi; rổ `no_price` tự co lại
khi tỉ lệ có giá tăng.

---

## Tham chiếu nhanh

| Cần | File | Ký hiệu |
|---|---|---|
| Thêm ngành hàng | `catalog.py` | `FACET_SPECS` |
| Thêm concept | `concepts.py` | `CONCEPTS`, `QUERY_LEXICON` |
| Sửa từ khoá nhận diện ngành | `catalog.py` | `CATEGORY_HINTS` |
| Chỉnh trọng số | `search.py` | `BASE_WEIGHTS`, `_weights` |
| Chỉnh ngưỡng caveat | `search.py` | `_caveats` |
| Chỉnh MMR | `search.py` | `_diversify` |
| Thêm sentinel | `normalize.py` | `_UNDISCLOSED`, `_NOT_APPLICABLE` |
| Thêm parser mới | `normalize.py` | `parse_*` |
