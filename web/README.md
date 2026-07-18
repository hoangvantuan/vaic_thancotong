# Trợ lý tư vấn sản phẩm — Điện Máy Xanh (demo)

Nhân viên tư vấn AI **đa ngành hàng**: hiểu nhu cầu khách bằng tiếng Việt tự nhiên, **hỏi ngược**
khi thiếu thông tin, rồi đề xuất **top 3 sản phẩm thật kèm lý do và so sánh hơn kém**.

Đang phục vụ 6 ngành (**1.620 sản phẩm thật** từ `docs/dataset/`):

| Ngành | Sản phẩm | Tiêu chí hoàn cảnh dùng để khớp |
|---|---:|---|
| ❄️ Máy lạnh | 228 | Diện tích phòng (m²) |
| 🧊 Tủ lạnh | 251 | Số người dùng |
| 🫧 Máy giặt | 198 | Số người dùng |
| 📺 Tivi | 307 | Kích cỡ màn hình (inch) |
| 📱 Điện thoại | 168 | — (theo ngân sách) |
| 💻 Laptop | 468 | — (theo ngân sách) |

> **On-premise:** dữ liệu sản phẩm nằm trong bản build, LLM trỏ về máy chủ nội bộ —
> **không có dữ liệu khách hàng nào rời khỏi hệ thống của bạn.**

---

## 1. Chạy nhanh (dev)

```bash
cd web
npm install
npm run dev            # http://localhost:3000
```

Thử: *"tủ lạnh cho nhà 4 người tầm 15 triệu"* · *"tivi 55 inch dưới 12 triệu"* · *"laptop dưới 20 triệu"*

**Không có LLM vẫn chạy được.** Chưa cắm mô hình thì app vào *chế độ cơ bản*: vẫn nhận diện
ngành, vẫn trích nhu cầu (regex), vẫn lọc và gợi ý sản phẩm thật — chỉ khác là câu trả lời
được dựng sẵn thay vì do LLM viết. Header hiện rõ trạng thái này.

## 2. Tự host (không Docker)

```bash
cd web && npm ci && npm run build && npm start
node .next/standalone/server.js     # hoặc chạy bản standalone
```

## 3. Docker (ghim version)

```bash
cd web
docker build -t tuvan-dmx:1.0.0 .
docker run --rm -p 3000:3000 \
  -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  tuvan-dmx:1.0.0
```

| Thành phần | Cách ghim |
|---|---|
| Node | `ARG NODE_VERSION=22.14.0` trong `Dockerfile` |
| Thư viện npm | `package-lock.json` + `npm ci` |
| Dữ liệu sản phẩm | `data/*.json` đóng gói vào bản build |

> ⚠️ Trong container **đừng dùng `localhost`** cho `LLM_BASE_URL` — đó là chính container.
> Dùng `host.docker.internal` hoặc IP LAN của máy chạy Ollama.

## 4. Đổi LLM (chỉ qua ENV, xem `.env.example`)

```bash
LLM_BASE_URL=http://localhost:11434/v1   # Ollama nội bộ (mặc định)
LLM_API_KEY=ollama
LLM_MODEL=qwen2.5:7b
# hoặc bất kỳ endpoint chuẩn OpenAI: https://api.openai.com/v1 + sk-...
```

Kiểm tra: `curl localhost:3000/api/health`

---

## Kiến trúc

```
config/categories.json        ⭐ REGISTRY NGÀNH HÀNG — nguồn sự thật duy nhất
app/
  page.tsx                    Giao diện chat kiểu Điện Máy Xanh + thẻ sản phẩm
  api/chat/route.ts           Điều phối: stream trả lời + đẩy data part sản phẩm/ngành
  api/health/route.ts         Trạng thái LLM + danh sách ngành
lib/
  llm.ts                      Model OpenAI-compatible từ ENV + thăm dò kết nối
  data/category-config.ts     Nạp registry, gắn parser, nhận diện ngành, so khớp
  data/parsers.ts             Bộ parser dùng chung (m² / người / inch / GB)
  data/catalog.ts             Nạp lazy từng ngành + chuẩn hoá + cache
  agents/needs-agent.ts       SUB: đào nhu cầu (regex luôn chạy + LLM vét thêm)
  agents/product-agent.ts     SUB: lọc + xếp hạng + chọn top 3 (thuần hàm, không LLM)
  agents/orchestrator.ts      MAIN: điều phối, prompt + câu trả lời dự phòng
scripts/extract-catalog.mjs   Trích docs/dataset → data/<slug>.json (đọc chung registry)
```

### Thêm một ngành hàng mới

1. Thêm entry vào `config/categories.json` (tên nhóm hàng thật, từ khoá, `fit`, `highlights`).
2. Thêm một dòng vào bảng `LOADERS` trong `lib/data/catalog.ts`.
3. `npm run data:extract && npm run build`.

Không phải sửa agent hay giao diện — không có chỗ nào `if (category === ...)`.

### Chống bịa (guardrail)

- Sản phẩm do **code** lọc (tất định); LLM chỉ diễn đạt, không tự chọn hàng.
- Chỉ khẳng định điều có trong `rawFields`; thiếu giá → badge *"Giá đang cập nhật"* +
  câu *"chưa cập nhật giá… ghé cửa hàng gần nhất"*.
- Chỉ nói **"tiết kiệm điện"** khi nhãn ≥ 4 sao, **"vận hành êm"** khi dàn lạnh ≤ 30 dB —
  không đạt ngưỡng thì nêu số liệu trung tính.
- Field rác bị **loại hoàn toàn** khỏi dữ liệu tới tay LLM (khai báo ở `banned`;
  vd `"Điện năng tiêu thụ"` của máy lạnh chỉ chứa 0/1/2).
- Script trích chỉ giữ field mà registry khai báo → field lạ không bao giờ tới được LLM.

### Cách chọn top 3

1. Lọc theo `fit` của ngành (bao trùm m²/người, hoặc gần đúng inch) + ngân sách.
2. Bỏ sản phẩm rẻ hơn 25% ngân sách — thường là **lệch phân khúc**
   (khách 8 triệu không định mua điện thoại phổ thông 410k).
3. Xếp hạng: khớp hoàn cảnh → sát con số khách nêu → có giá → giá tăng dần.
4. Chọn 3 mẫu **trải đều tầm giá** (lệch ≥15%) để còn so sánh trade-off được —
   thay vì 3 sản phẩm gần như y hệt nhau.

---

## TODO cho team

- [ ] **Mở rộng ngành**: còn 52 ngành khác có ≥30 sp có tên (đồng hồ, tai nghe, nồi cơm…).
- [ ] **Bổ sung sp thiếu tên**: 7.450/21.166 sp có `name=null` (chỉ có spec kỹ thuật).
- [ ] **Xếp hạng theo ưu tiên**: khách nói "ít ồn" chưa đẩy máy êm nhất lên đầu
      (hiện chỉ dùng để viết lý do, chưa vào điểm xếp hạng).
- [ ] **Slot theo mục đích**: laptop/điện thoại mới lọc theo ngân sách; cần thêm
      "dùng để làm gì" (gaming/văn phòng/đồ hoạ) map sang CPU/RAM/card.
- [ ] **RAG chính sách** từ `docs/dataset/knowledge/` (bảo hành, trả góp, giao lắp).
- [ ] **So sánh cạnh nhau** dạng bảng + luồng chốt đơn.
- [ ] **Test**: unit cho parsers (`roomAreaRange`, `peopleRange`, `inches`), e2e luồng hỏi ngược.
- [ ] Đánh giá chất lượng tư vấn trên `docs/dataset/conversations/`.
- [ ] Thay 5 token màu trong `app/globals.css` bằng bộ nhận diện chính thức của ĐMX.
