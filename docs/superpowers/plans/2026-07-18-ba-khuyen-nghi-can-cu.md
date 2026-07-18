# Kế hoạch tạo mẫu ba khuyến nghị có căn cứ

> **Dành cho tác nhân triển khai:** KỸ NĂNG CON BẮT BUỘC: dùng phát triển do tác nhân phụ điều phối (`subagent-driven-development`) hoặc thực thi kế hoạch (`executing-plans`) để làm lần lượt từng việc có ô kiểm.

**Mục tiêu:** Tạo một trang tĩnh dùng để bỏ, gồm ba biến thể giao diện giúp kiểm tra cách trình bày ba khuyến nghị máy lạnh có căn cứ.

**Kiến trúc:** Trang dùng HTML, CSS và JavaScript thuần, không có dịch vụ phía sau và không ghi dữ liệu. `app.js` giữ dữ liệu cố định, tạo ba cây giao diện từ cùng hợp đồng nội dung và đồng bộ biến thể qua tham số `variant` trên địa chỉ.

**Nền tảng kỹ thuật:** HTML5, CSS3, JavaScript mô-đun, máy chủ tĩnh của Python trong môi trường `~/.venv/claude`, công cụ tự động hóa trình duyệt `agent-browser`.

## Ràng buộc toàn cục

- Đây là mã mẫu dùng để bỏ, không được nhập vào nhánh phát triển chính.
- Thiết kế ưu tiên chiều rộng **390 px**, đồng thời phải dùng được ở **1440 px**.
- Chỉ dùng ba sản phẩm và dữ liệu đã ghi trong tài liệu thiết kế.
- Giá luôn mang nhãn “giá ghi nhận” cùng ngày **17 tháng 7 năm 2026**.
- Tồn kho, chi phí lắp đặt, tải nhiệt thực tế và giá hiện hành luôn ở trạng thái **chưa xác minh**.
- Không hiển thị điểm phù hợp tổng, phần trăm tin cậy giả, hoặc đánh giá sao làm bằng chứng phù hợp.
- Mỗi sản phẩm phải có đúng bảy phần: nhu cầu, dữ kiện, kết quả, điều kiện, đánh đổi, chưa xác minh, nguồn cùng bước tiếp theo.
- Không tạo bộ kiểm thử lâu dài vì quy tắc của mẫu yêu cầu bỏ qua phần hoàn thiện; dùng kiểm tra trực tiếp trên trình duyệt thay thế.
- Không có thao tác mua, đặt hàng, ghi dữ liệu hoặc gọi giao diện lập trình ứng dụng (API).

---

## Cấu trúc tệp

| Tệp | Trách nhiệm |
|---|---|
| `prototypes/ba-khuyen-nghi-can-cu/index.html` | Vỏ tài liệu, điểm gắn ứng dụng, thanh chuyển biến thể và tải tài nguyên |
| `prototypes/ba-khuyen-nghi-can-cu/app.js` | Dữ liệu kịch bản, ba hàm dựng biến thể, điều hướng địa chỉ và bàn phím |
| `prototypes/ba-khuyen-nghi-can-cu/styles.css` | Hệ thống thị giác, sợi căn cứ, bố cục ba biến thể và thích nghi kích thước |
| `prototypes/ba-khuyen-nghi-can-cu/README.md` | Mục đích, cách chạy, địa chỉ từng biến thể và giới hạn |

## Việc 1: Tạo vỏ trang và hợp đồng điều hướng

**Tệp:**

- Tạo: `prototypes/ba-khuyen-nghi-can-cu/index.html`
- Tạo: `prototypes/ba-khuyen-nghi-can-cu/app.js`

**Giao diện:**

- Nhận: tham số địa chỉ `variant=A|B|C`.
- Tạo: `setVariant(key)`, `render()`, `renderVariantA()`, `renderVariantB()`, `renderVariantC()`.
- Quy ước kiểm tra: phần tử sản phẩm có `data-product`; bảy phần bắt buộc có `data-required-part`.

- [ ] **Bước 1: Tạo vỏ HTML có ngữ nghĩa và thanh chuyển biến thể**

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Mẫu ba khuyến nghị máy lạnh có căn cứ" />
    <title>Ba khuyến nghị có căn cứ</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&amp;family=IBM+Plex+Mono:wght@500;600&amp;display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <a class="skip-link" href="#app">Bỏ qua phần đầu trang</a>
    <header class="site-header">
      <a class="wordmark" href="?variant=A" aria-label="Mở biến thể Dòng căn cứ">
        <span class="wordmark-mark" aria-hidden="true">✓</span>
        <span>Tư vấn có căn cứ</span>
      </a>
      <span class="prototype-label">Mẫu dùng để bỏ</span>
    </header>
    <main id="app" tabindex="-1"></main>
    <nav class="prototype-switcher" aria-label="Chuyển biến thể mẫu" data-prototype-only>
      <button id="previous-variant" type="button" aria-label="Biến thể trước">←</button>
      <output id="variant-label" aria-live="polite"></output>
      <button id="next-variant" type="button" aria-label="Biến thể kế tiếp">→</button>
    </nav>
    <noscript>Mẫu cần JavaScript để chuyển giữa ba biến thể.</noscript>
    <script type="module" src="./app.js"></script>
  </body>
</html>
```

- [ ] **Bước 2: Khai báo hợp đồng dữ liệu cố định**

Mỗi phần tử của `PRODUCTS` phải có hình dạng sau và phải được điền bằng dữ liệu cụ thể trong tài liệu thiết kế:

```js
/**
 * @typedef {Object} Recommendation
 * @property {string} id
 * @property {string} role
 * @property {string} verdict
 * @property {string} name
 * @property {string} shortName
 * @property {string} imageUrl
 * @property {string} productUrl
 * @property {number} observedPrice
 * @property {string} capturedAt
 * @property {{label: string, value: string}[]} facts
 * @property {{need: string, fact: string, outcome: string, condition: string, tradeoff: string, uncertainty: string, sourceNext: string}} parts
 */

const VARIANTS = {
  A: "Dòng căn cứ",
  B: "Bảng quyết định",
  C: "Ba lối chọn",
};

const REQUIRED_PARTS = [
  "need",
  "fact",
  "outcome",
  "condition",
  "tradeoff",
  "uncertainty",
  "source-next",
];
```

- [ ] **Bước 3: Dựng ba biến thể từ cùng hợp đồng**

Mỗi hàm dựng phải trả về một chuỗi HTML hoàn chỉnh, không thay đổi dữ liệu nguồn:

```js
function requiredPart(name, content, className = "") {
  return `<section class="required-part ${className}" data-required-part="${name}">${content}</section>`;
}

function renderVariantA() {
  return `<div class="page-shell variant variant-a">${renderBriefing()}<section aria-labelledby="variant-a-title"><h2 id="variant-a-title">Ba dòng căn cứ</h2><div class="evidence-stack">${PRODUCTS.map(renderEvidenceDossier).join("")}</div></section></div>`;
}

function renderVariantB() {
  return `<div class="page-shell variant variant-b">${renderBriefing()}${renderDecisionMatrix()}</div>`;
}

function renderVariantC() {
  return `<div class="page-shell variant variant-c">${renderBriefing()}<section aria-labelledby="variant-c-title"><h2 id="variant-c-title">Ba lối chọn</h2><div class="route-grid">${PRODUCTS.map(renderChoiceRoute).join("")}</div></section></div>`;
}
```

- [ ] **Bước 4: Đồng bộ biến thể bằng địa chỉ, nút và bàn phím**

```js
function getVariantFromUrl() {
  const key = new URLSearchParams(window.location.search).get("variant")?.toUpperCase();
  return Object.hasOwn(VARIANTS, key) ? key : "A";
}

function setVariant(key) {
  const nextKey = Object.hasOwn(VARIANTS, key) ? key : "A";
  const url = new URL(window.location.href);
  url.searchParams.set("variant", nextKey);
  window.history.replaceState({}, "", url);
  render();
}

function cycleVariant(direction) {
  const keys = Object.keys(VARIANTS);
  const currentIndex = keys.indexOf(getVariantFromUrl());
  setVariant(keys[(currentIndex + direction + keys.length) % keys.length]);
}

window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.matches("input, textarea, [contenteditable='true']")) return;
  if (event.key === "ArrowLeft") cycleVariant(-1);
  if (event.key === "ArrowRight") cycleVariant(1);
});
```

- [ ] **Bước 5: Chạy máy chủ và kiểm tra hợp đồng cấu trúc**

Chạy:

```bash
~/.venv/claude/bin/python -m http.server 4173
```

Trong cửa sổ lệnh khác:

```bash
agent-browser open 'http://127.0.0.1:4173/prototypes/ba-khuyen-nghi-can-cu/?variant=A'
agent-browser wait --load networkidle
agent-browser get count '[data-product]'
agent-browser get count '[data-required-part]'
agent-browser get url
```

Kết quả mong đợi:

```text
3
21
http://127.0.0.1:4173/prototypes/ba-khuyen-nghi-can-cu/?variant=A
```

- [ ] **Bước 6: Cam kết phần chức năng**

```bash
git add prototypes/ba-khuyen-nghi-can-cu/index.html prototypes/ba-khuyen-nghi-can-cu/app.js
git commit -m "feat: tạo ba cấu trúc khuyến nghị có căn cứ"
```

## Việc 2: Thực hiện hệ thống thị giác và thích nghi kích thước

**Tệp:**

- Tạo: `prototypes/ba-khuyen-nghi-can-cu/styles.css`

**Giao diện:**

- Nhận: lớp `variant-a`, `variant-b`, `variant-c` và thuộc tính `data-state` do `app.js` tạo.
- Tạo: hệ thống màu, chữ, sợi căn cứ, bảng quyết định, ba lối chọn, thanh chuyển và bố cục đáp ứng.

- [ ] **Bước 1: Tạo biến hệ thống thị giác và nền kỹ thuật**

```css
:root {
  --ink: #17352f;
  --paper: #f2f7f5;
  --surface: #ffffff;
  --verified: #087c68;
  --source: #2859a6;
  --conditional: #b96521;
  --unknown: #66736f;
  --line: #ccd9d4;
  --shadow: 0 22px 60px rgb(23 53 47 / 10%);
  --body: "Be Vietnam Pro", system-ui, sans-serif;
  --data: "IBM Plex Mono", ui-monospace, monospace;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  min-width: 320px;
  color: var(--ink);
  font-family: var(--body);
  background-color: var(--paper);
  background-image: linear-gradient(rgb(23 53 47 / 4%) 1px, transparent 1px), linear-gradient(90deg, rgb(23 53 47 / 4%) 1px, transparent 1px);
  background-size: 24px 24px;
}
```

- [ ] **Bước 2: Tạo sợi căn cứ bằng hình dạng phân biệt trạng thái**

```css
.evidence-thread { position: relative; display: grid; gap: 1rem; padding-left: 2.3rem; }
.evidence-thread::before { position: absolute; inset: 0.7rem auto 0.7rem 0.7rem; width: 2px; content: ""; background: var(--line); }
.evidence-node { position: relative; padding: 0.9rem 1rem; border: 1px solid var(--line); background: rgb(255 255 255 / 72%); }
.evidence-node::before { position: absolute; left: -2.05rem; top: 1.1rem; width: 0.85rem; height: 0.85rem; content: ""; background: var(--surface); border: 2px solid currentColor; }
.evidence-node[data-state="verified"] { color: var(--verified); }
.evidence-node[data-state="verified"]::before { border-radius: 50%; background: var(--verified); }
.evidence-node[data-state="conditional"] { color: var(--conditional); }
.evidence-node[data-state="conditional"]::before { transform: rotate(45deg); background: var(--surface); }
.evidence-node[data-state="unknown"] { color: var(--unknown); }
.evidence-node[data-state="unknown"]::before { border-radius: 50%; background: transparent; }
```

- [ ] **Bước 3: Hoàn thiện bố cục điện thoại, máy tính và trạng thái bàn phím**

Các quy tắc bắt buộc:

```css
.page-shell { width: min(100% - 2rem, 1180px); margin-inline: auto; padding: 2rem 0 8rem; }
.route-grid { display: grid; gap: 1rem; }
.matrix-scroll { overflow-x: auto; border: 1px solid var(--line); background: var(--surface); }
.decision-matrix { width: 100%; min-width: 900px; border-collapse: collapse; }
.prototype-switcher { position: fixed; left: 50%; bottom: 1rem; z-index: 20; display: grid; grid-template-columns: 2.75rem minmax(12rem, auto) 2.75rem; transform: translateX(-50%); color: white; background: var(--ink); box-shadow: var(--shadow); }
:focus-visible { outline: 3px solid #f2a65a; outline-offset: 3px; }

@media (min-width: 800px) {
  .route-grid { grid-template-columns: repeat(3, 1fr); }
  .product-lead { grid-template-columns: 13rem 1fr; }
  .briefing { grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 0.6fr); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
```

- [ ] **Bước 4: Kiểm tra hình ảnh tại hai kích thước**

```bash
agent-browser set viewport 390 844
agent-browser screenshot --full /tmp/ba-khuyen-nghi-A-mobile.png
agent-browser set viewport 1440 900
agent-browser screenshot --full /tmp/ba-khuyen-nghi-A-desktop.png
agent-browser errors
agent-browser console
```

Kết quả mong đợi: hai ảnh được tạo; `errors` không có lỗi trang; `console` không có lỗi JavaScript.

- [ ] **Bước 5: Cam kết hệ thống thị giác**

```bash
git add prototypes/ba-khuyen-nghi-can-cu/styles.css
git commit -m "style: trình bày khuyến nghị theo dòng căn cứ"
```

## Việc 3: Ghi cách chạy và kiểm tra xuyên suốt

**Tệp:**

- Tạo: `prototypes/ba-khuyen-nghi-can-cu/README.md`

- [ ] **Bước 1: Ghi rõ mẫu dùng để bỏ và một lệnh chạy**

```markdown
# Mẫu ba khuyến nghị có căn cứ

Mẫu dùng để trả lời câu hỏi trình bày của phiếu “Tạo mẫu ba khuyến nghị từ chuỗi nhân quả sản phẩm”. Đây không phải mã sản phẩm và không được nhập vào nhánh phát triển chính.

## Chạy

Từ gốc kho:

    ~/.venv/claude/bin/python -m http.server 4173

Mở:

- `http://127.0.0.1:4173/prototypes/ba-khuyen-nghi-can-cu/?variant=A`
- `http://127.0.0.1:4173/prototypes/ba-khuyen-nghi-can-cu/?variant=B`
- `http://127.0.0.1:4173/prototypes/ba-khuyen-nghi-can-cu/?variant=C`

Dùng phím mũi tên trái và phải hoặc thanh nổi cuối màn hình để chuyển biến thể.

## Giới hạn

- Dữ liệu được cố định để kiểm tra hình thức trình bày.
- Giá là ảnh chụp ngày 17 tháng 7 năm 2026, không phải giá hiện hành.
- Tồn kho, chi phí lắp đặt và tải nhiệt thực tế chưa được xác minh.
- Mẫu không lọc, xếp hạng, mua hàng hoặc ghi dữ liệu.
```

- [ ] **Bước 2: Kiểm tra ba biến thể, địa chỉ và bàn phím**

```bash
agent-browser open 'http://127.0.0.1:4173/prototypes/ba-khuyen-nghi-can-cu/?variant=A'
agent-browser find role button click --name 'Biến thể kế tiếp'
agent-browser get url
agent-browser press ArrowRight
agent-browser get url
agent-browser press ArrowLeft
agent-browser get url
```

Kết quả mong đợi lần lượt kết thúc bằng `variant=B`, `variant=C` và `variant=B`.

- [ ] **Bước 3: Kiểm tra đầy đủ bảy phần trên từng biến thể**

Chạy cho A, B và C:

```bash
agent-browser get count '[data-product]'
agent-browser get count '[data-required-part]'
```

Kết quả mong đợi ở mỗi biến thể là **3** sản phẩm và **21** phần bắt buộc.

- [ ] **Bước 4: Kiểm tra nguồn thật**

```bash
curl -I -L --max-time 20 'https://www.dienmayxanh.com/may-lanh/samsung-wind-free-inverter-15-hp-ar70h13d1bwnsv'
curl -I -L --max-time 20 'https://www.dienmayxanh.com/may-lanh/toshiba-inverter-15-hp-ras-h13f2kcvsg-v'
curl -I -L --max-time 20 'https://www.dienmayxanh.com/may-lanh/comfee-inverter-15-hp-cfs-13vdm'
```

Kết quả mong đợi: cả ba yêu cầu kết thúc bằng trạng thái HTTP thành công hoặc chuyển hướng tới trang sản phẩm hợp lệ.

- [ ] **Bước 5: Chạy kiểm tra Git và cam kết tài liệu**

```bash
git diff --check
git status --short
git add prototypes/ba-khuyen-nghi-can-cu/README.md
git commit -m "docs: hướng dẫn kiểm tra mẫu khuyến nghị"
```

- [ ] **Bước 6: Đóng tài nguyên tạm**

```bash
agent-browser close --all
```

Dừng tiến trình máy chủ tĩnh và xóa các ảnh trong `/tmp` sau khi đã đánh giá trực quan.

## Việc 4: Ghi nguồn kiểm chứng lên phiếu

**Không sửa mã.**

- [ ] **Bước 1: Đẩy nhánh mẫu lên kho từ xa**

```bash
git push -u origin prototype/ba-khuyen-nghi-can-cu
```

- [ ] **Bước 2: Ghi quyết định và nguồn kiểm chứng**

Nội dung bình luận phải nêu:

- Biến thể được chọn và lý do.
- Liên kết nhánh cùng mốc cam kết cuối.
- Cách chạy mẫu.
- Các giới hạn dữ liệu còn nguyên.
- Bằng chứng kiểm tra ở hai kích thước và ba biến thể.

- [ ] **Bước 3: Đóng phiếu và cập nhật mục Quyết định đến nay của bản đồ**

Dòng chỉ mục trên bản đồ chỉ ghi một ý tóm lược và liên kết tới phiếu đã đóng; không chép lại toàn bộ quyết định.
