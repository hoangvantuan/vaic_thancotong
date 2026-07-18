# `docs/dataset/` — Kho dữ liệu sạch (single source of truth)

> **Một mối duy nhất cho toàn bộ dữ liệu đã làm sạch.** Cả team làm việc ở đây, không cần mở lại raw.
> Muốn kiểm chứng gốc → `docs/raw/`. Muốn tạo lại → `python3 scripts/build_all.py`.

## Nguyên tắc

| Tầng | Vai trò | Sửa tay? |
|------|---------|----------|
| `docs/raw/` | Bằng chứng gốc từ BTC (products_detail.json, Spec_cate_gia.xlsx, chat, chính sách) | ❌ Không bao giờ |
| `scripts/*.py` | Pipeline tái lập | ✅ (rồi build lại) |
| `docs/dataset/` | **Kho dữ liệu sạch** — thứ team dùng | ❌ Sinh tự động từ raw (sửa script, đừng sửa tay) |

Dữ liệu lớn dạng **JSONL** (1 dòng = 1 bản ghi). `*.index.json` / `*.meta.json` nhỏ, đọc trực tiếp được.

## Cấu trúc

```
docs/dataset/
├── README.md                        ← file này (từ điển dữ liệu)
├── catalog/
│   ├── catalog.jsonl                ← 21.166 sản phẩm (HỢP NHẤT products_detail + spec sâu)
│   └── catalog.index.json           ← thống kê: nhóm hàng / brand / cờ chất lượng
├── conversations/
│   ├── conversations.jsonl          ← 46 hội thoại — dữ liệu thuần (đã ẩn danh)
│   └── conversations.meta.json      ← sidecar: nhóm chống-rò-rỉ + danh sách soát PII
└── knowledge/
    └── policies.index.json          ← index 7 chính sách (.md gốc ở docs/raw/)
```

### Ánh xạ nguồn gốc

| File sạch | Sinh từ |
|-----------|---------|
| `catalog/catalog.jsonl` | `raw/products_detail.json` + `raw/Spec_cate_gia.xlsx` |
| `conversations/conversations.jsonl` | `raw/35sample_chat_history.json` + `raw/chat_history_buy_product.json` |
| `knowledge/policies.index.json` | 7 file `raw/*.md` |

---

## 1. `catalog/catalog.jsonl` — sản phẩm (bộ hợp nhất DUY NHẤT)

**21.166 sản phẩm**, gộp cả hai nguồn:
- **13.754 sp** từ `products_detail.json` — có đủ **tên/giá/ảnh/rating** (khách-hàng-đối-mặt); 1.115 sp trong số này được làm giàu spec sâu (+17.834 trường).
- **7.412 sp** chỉ có trong `Spec_cate_gia.xlsx` — có **spec kỹ thuật sâu + sku + giá gốc**, nhưng **`name = null`** (không có tên/ảnh thương mại → dùng để tra cứu kỹ thuật, không tư vấn trực tiếp cho khách).

> 💡 **Cần sản phẩm bán được cho khách?** Lọc `name != null`. **Cần tra thông số kỹ thuật?** Dùng cả bộ.

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `product_id` | string\|null | ID web (products_detail; hoặc `productidweb` của spec) |
| `sku` | string\|null | Mã SKU (khóa tin cậy của bộ spec; null với sp chỉ từ crawl) |
| `model_code` | string\|null | Mã nhóm nội bộ (từ spec) |
| `productcode` | string\|null | Mã vạch (từ products_detail) |
| `name` | string\|null | **null = sp chỉ có spec kỹ thuật, chưa có thông tin thương mại** |
| `brand` | string\|null | Thương hiệu |
| `category` | object | `{id, name}` — `id=null` với sp chỉ-spec |
| `price` | object | `{original:int\|null, sale:int\|null, currency:"VND"}` — đã sang số nguyên |
| `rating` | float\|null | Điểm 0–5 (chỉ products_detail) |
| `quantity_sold` | int\|null | `"14,5k"` → `14500` |
| `colors` | string[] | Danh sách màu |
| `image_url`, `url` | string\|null | Ảnh, link (chỉ products_detail) |
| `warranty`, `accessories`, `promotion` | string\|null | Bảo hành, phụ kiện, khuyến mãi |
| `online_sale_only` | bool | Chỉ bán online |
| `crawled_at` | string\|null | Thời điểm crawl |
| `specs` | object | Thông số kỹ thuật (key tiếng Việt có dấu); nông (crawl) hoặc sâu (từ xlsx) |

Thống kê chất lượng (`missing_price`, `missing_name`, `no_spec`…) và độ phủ để ở **`catalog.index.json`**, không nhét vào từng record.

## 2. `conversations/` — hội thoại (dữ liệu thuần) + sidecar

**`conversations.jsonl`** — 46 bản ghi (35 từ `35sample` + 11 từ `buy_product`, file gốc hỏng đã phục hồi). **Record chỉ chứa dữ liệu**, không có cờ của quá trình xử lý.

| Trường | Mô tả |
|--------|-------|
| `id`, `source` | `sample-N`/`buy-N`; `35sample`\|`buy_product` |
| `messages[]` | `{role, content, create_date?, knowledge_data?, web_url?, user_info?}` — nội dung đã ẩn danh |
| *(buy_product)* | thêm `project_uuid`, `conversation_uuid`, `user_info` (đã mask), `is_stop`, `label`, `lasted_update`, `wellcome_chat` |

**`conversations.meta.json`** — *sidecar: metadata quá trình, KHÔNG phải dữ liệu*:
- `dedup.groups` + `id_to_group`: 11 hội thoại `buy_product` trùng 11 đầu `35sample` → **34 nhóm độc lập**. **Chia train/test theo group** để tránh rò rỉ (khuyến nghị nghiên cứu team).
- `pii_review_needed`: id hội thoại có mask địa chỉ/tên *heuristic* → nên soát tay.

**Ẩn danh PII (best-effort):** SĐT/email/CCCD/mã đơn, `user_info` (cấp hội thoại + nested), tên/địa chỉ theo nhãn → mask; **strip `srsltid`** + query trong `web_url`. Bản gốc chưa mask vẫn ở `docs/raw/`. Đã kiểm **0 rò rỉ** SĐT/tên/`srsltid`/`user_info`.

## 3. `knowledge/policies.index.json`

Index 7 chính sách `.md` (bảo hành/đổi trả, giao hàng, khui hộp Apple, xử lý dữ liệu cá nhân, điều khoản, nội quy, chất lượng phục vụ). Bản `.md` gốc ở `docs/raw/`.

---

## Tái lập

```bash
python3 scripts/build_all.py            # tạo lại toàn bộ docs/dataset/ từ docs/raw/
# hoặc từng phần:
python3 scripts/build_catalog.py            # catalog hợp nhất (đọc products_detail.json + Spec_cate_gia.xlsx)
python3 scripts/clean_conversations.py      # conversations + sidecar
python3 scripts/build_knowledge.py          # policies index
```

## Giới hạn đã biết

- **7.412 sp chỉ-spec có `name=null`** — cần bổ sung tên/ảnh thương mại trước khi tư vấn cho khách.
- **Ghép spec sâu vào sp có tên chỉ đạt 1.115** (hai nguồn phần lớn tách rời; xlsx thiếu tên, products_detail thiếu `model_code` → không có trường chung để ghép mờ).
- **Chuẩn hóa spec ở mức nông**. Mô hình bằng chứng đầy đủ (`raw_value` + `value_status` + nguồn) và **cách ly trường gán-sai-nghĩa** (vd `Số lượng` chứa "trang A4") là bước của khâu xây tư vấn — chưa làm ở lớp này.
- **Ẩn danh PII là best-effort** — dùng `conversations.meta.json > pii_review_needed` để soát tay.
