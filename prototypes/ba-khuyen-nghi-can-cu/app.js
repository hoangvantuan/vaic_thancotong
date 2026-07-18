const VARIANTS = {
  A: "Dòng căn cứ",
  B: "Bảng quyết định",
  C: "Ba lối chọn",
};

const SCENARIO = {
  eyebrow: "Kết quả tư vấn có điều kiện",
  title: "Ba lựa chọn, ba đường đi tới một phòng ngủ yên hơn",
  summary:
    "Các gợi ý dưới đây chỉ dùng nhu cầu đã xác nhận và dữ kiện sản phẩm có nguồn. Phần chưa biết được giữ nguyên để bạn không phải quyết định dựa trên phỏng đoán.",
  confirmed: [
    "Phòng ngủ 20 m²",
    "Dùng chủ yếu ban đêm",
    "Ưu tiên độ êm, sau đó điện năng",
    "Ngân sách máy tối đa 14 triệu đồng",
  ],
  unknown: [
    "Tải nhiệt và vị trí lắp",
    "Giá cùng tồn kho hiện hành",
    "Chi phí vật tư và lắp đặt",
  ],
};

/** @type {Recommendation[]} */
const PRODUCTS = [
  {
    id: "samsung",
    role: "Ưu tiên độ êm",
    verdict: "Khớp nhất với ưu tiên ngủ yên hiện tại",
    name: "Máy lạnh Samsung Wind-Free Inverter 1.5 HP AR70H13D1BWNSV",
    shortName: "Samsung Wind-Free 1.5 HP",
    imageUrl:
      "https://cdnv2.tgdd.vn/mwg-static/dmx/Products/Images/2002/362711/samsung-wind-free-inverter-15-hp-ar70h13d1bwnsv-thumb-639136481629796177-600x600.jpg",
    productUrl:
      "https://www.dienmayxanh.com/may-lanh/samsung-wind-free-inverter-15-hp-ar70h13d1bwnsv",
    observedPrice: 13490000,
    capturedAt: "17 tháng 7 năm 2026",
    facts: [
      { label: "Phạm vi công bố", value: "15 đến 20 m²" },
      { label: "Độ ồn dàn lạnh", value: "19 đến 38 dB" },
      { label: "Điện năng công bố", value: "1,07 kWh" },
      { label: "Nhãn năng lượng", value: "5 sao, hiệu suất 5,36" },
    ],
    parts: {
      need:
        "Bạn đã xác nhận độ êm là ưu tiên cao nhất cho phòng ngủ dùng ban đêm.",
      fact:
        "Dàn lạnh được công bố ở 19 đến 38 dB. Phạm vi làm lạnh công bố là 15 đến 20 m² và điện năng là 1,07 kWh.",
      outcome:
        "Trong ba sản phẩm đang so, mức ồn thấp nhất được công bố của Samsung là thấp nhất. Dữ kiện này hỗ trợ ưu tiên xem xét khi mục tiêu là giảm tiếng máy vào ban đêm.",
      condition:
        "Mức ồn được đo trong phòng thí nghiệm và phụ thuộc chế độ chạy. Tiếng ồn thực tế còn chịu ảnh hưởng của lắp đặt, tải nhiệt và âm nền của phòng.",
      tradeoff:
        "Giá ghi nhận cao hơn Comfee 5,8 triệu đồng. Thời hạn bảo hành cục lạnh và cục nóng được công bố là 2 năm, ngắn hơn Toshiba 1 năm.",
      uncertainty:
        "Chưa xác minh giá hiện hành, tồn kho, phí lắp đặt, vị trí dàn nóng và tải nhiệt thực tế của phòng.",
      sourceNext:
        "Kiểm tra lại giá, tồn kho và khảo sát lắp đặt trước khi chốt. Không dùng mức 19 dB như cam kết cho mọi chế độ hoặc mọi căn phòng.",
    },
  },
  {
    id: "toshiba",
    role: "Cân bằng",
    verdict: "Gần lựa chọn đầu về độ êm và điện năng",
    name: "Máy lạnh Toshiba Inverter 1.5 HP RAS-H13F2KCVSG-V",
    shortName: "Toshiba Inverter 1.5 HP",
    imageUrl:
      "https://cdnv2.tgdd.vn/mwg-static/dmx/Products/Images/2002/364811/toshiba-inverter-15-hp-ras-h13f2kcvsg-v-thumb-639109167064830718-600x600.jpg",
    productUrl:
      "https://www.dienmayxanh.com/may-lanh/toshiba-inverter-15-hp-ras-h13f2kcvsg-v",
    observedPrice: 13090000,
    capturedAt: "17 tháng 7 năm 2026",
    facts: [
      { label: "Phạm vi công bố", value: "15 đến 20 m²" },
      { label: "Độ ồn dàn lạnh", value: "20 đến 45 dB" },
      { label: "Điện năng công bố", value: "1,07 kWh" },
      { label: "Nhãn năng lượng", value: "5 sao, hiệu suất 5,44" },
    ],
    parts: {
      need:
        "Bạn cần một máy cho phòng ngủ 20 m², ưu tiên êm và muốn kiểm soát điện năng.",
      fact:
        "Dàn lạnh được công bố ở 20 đến 45 dB. Điện năng công bố là 1,07 kWh, hiệu suất năng lượng 5,44 và phạm vi là 15 đến 20 m².",
      outcome:
        "Mức thấp nhất công bố chỉ cao hơn Samsung 1 dB, còn điện năng công bố bằng nhau. Chưa có căn cứ để nói khác biệt 1 dB này chắc chắn được cảm nhận trong phòng thật.",
      condition:
        "So sánh chỉ có ý nghĩa khi các mức được đo theo điều kiện tương thích. Phòng 20 m² nằm ở biên trên của phạm vi công bố nên tải nhiệt cần được kiểm tra.",
      tradeoff:
        "Giá ghi nhận thấp hơn Samsung 400 nghìn đồng nhưng cao hơn Comfee 5,4 triệu đồng. Mức ồn cao nhất công bố là 45 dB.",
      uncertainty:
        "Chưa xác minh chế độ nào tạo mức 20 dB trong hoàn cảnh sử dụng thật, cùng giá, tồn kho, phí lắp và tải nhiệt.",
      sourceNext:
        "Đối chiếu điều kiện đo độ ồn và khảo sát phòng trước khi chọn đây là phương án cân bằng cuối cùng.",
    },
  },
  {
    id: "comfee",
    role: "Giảm giá mua",
    verdict: "Giữ lại nhiều ngân sách nhất, đổi lại độ êm yếu hơn",
    name: "Máy lạnh Comfee Inverter 1.5 HP CFS-13VDM",
    shortName: "Comfee Inverter 1.5 HP",
    imageUrl:
      "https://cdn.tgdd.vn/2026/05/timerseo/363375.jpg",
    productUrl:
      "https://www.dienmayxanh.com/may-lanh/comfee-inverter-15-hp-cfs-13vdm",
    observedPrice: 7690000,
    capturedAt: "17 tháng 7 năm 2026",
    facts: [
      { label: "Phạm vi công bố", value: "15 đến 20 m²" },
      { label: "Độ ồn dàn lạnh", value: "29 đến 35,5 dB" },
      { label: "Điện năng công bố", value: "1,25 kWh" },
      { label: "Nhãn năng lượng", value: "5 sao, hiệu suất 5,20" },
    ],
    parts: {
      need:
        "Ngân sách mua máy tối đa là 14 triệu đồng, nhưng độ êm vẫn là ưu tiên cao nhất.",
      fact:
        "Giá ghi nhận là 7,69 triệu đồng. Dàn lạnh được công bố ở 29 đến 35,5 dB, điện năng 1,25 kWh và phạm vi 15 đến 20 m².",
      outcome:
        "Lựa chọn này giữ lại 5,4 đến 5,8 triệu đồng so với hai máy còn lại. Mức ồn thấp nhất công bố cao hơn Samsung 10 dB và Toshiba 9 dB nên khớp yếu hơn với ưu tiên độ êm.",
      condition:
        "Không được chuyển chênh lệch dB thành cảm nhận thực tế nếu chưa biết điều kiện đo và âm nền. Khoản tiền giữ lại cũng chưa gồm chênh lệch chi phí vận hành.",
      tradeoff:
        "Giá mua thấp hơn rõ rệt, đổi lại điện năng công bố cao hơn hai máy còn lại 0,18 kWh và mức ồn thấp nhất công bố cao hơn.",
      uncertainty:
        "Chưa có biểu giá điện, số giờ dùng, giá hiện hành, tồn kho, chi phí lắp đặt và tải nhiệt để tính tổng chi phí hoặc khẳng định đủ công suất.",
      sourceNext:
        "Chỉ chọn hướng này sau khi xác nhận bạn chấp nhận đánh đổi một phần ưu tiên độ êm để giảm giá mua.",
    },
  },
];

const app = document.querySelector("#app");
const label = document.querySelector("#variant-label");
const previousButton = document.querySelector("#previous-variant");
const nextButton = document.querySelector("#next-variant");

function money(value) {
  return new Intl.NumberFormat("vi-VN").format(value) + " đồng";
}

function requiredPart(name, content, className = "") {
  return (
    '<section class="required-part ' +
    className +
    '" data-required-part="' +
    name +
    '">' +
    content +
    "</section>"
  );
}

function statusLabel(state) {
  const labels = {
    verified: "Đã xác minh trong nguồn",
    conditional: "Có điều kiện",
    unknown: "Chưa xác minh",
  };
  return (
    '<span class="status-label" data-state="' +
    state +
    '">' +
    labels[state] +
    "</span>"
  );
}

function renderBriefing() {
  return (
    '<section class="briefing" aria-labelledby="page-title">' +
    '<div class="briefing-copy">' +
    '<p class="eyebrow">' +
    SCENARIO.eyebrow +
    "</p>" +
    '<h1 id="page-title">' +
    SCENARIO.title +
    "</h1>" +
    "<p>" +
    SCENARIO.summary +
    "</p>" +
    '<ul class="confirmed-list" aria-label="Nhu cầu đã xác nhận">' +
    SCENARIO.confirmed.map((item) => "<li>" + item + "</li>").join("") +
    "</ul>" +
    "</div>" +
    '<aside class="unknown-panel" id="verification-gate">' +
    statusLabel("unknown") +
    "<h2>Cần xác minh trước khi chọn</h2>" +
    "<ul>" +
    SCENARIO.unknown.map((item) => "<li>" + item + "</li>").join("") +
    "</ul>" +
    '<a class="text-action" href="#decision-start">Xem ba hướng có điều kiện ↓</a>' +
    "</aside>" +
    "</section>"
  );
}

function renderVariantIntro(id, eyebrow, title, text) {
  return (
    '<header class="variant-intro" id="decision-start">' +
    '<p class="eyebrow">' +
    eyebrow +
    "</p>" +
    '<h2 id="' +
    id +
    '">' +
    title +
    "</h2>" +
    "<p>" +
    text +
    "</p>" +
    "</header>"
  );
}

function renderFacts(product) {
  return (
    '<dl class="fact-strip">' +
    product.facts
      .map(
        (fact) =>
          "<div><dt>" + fact.label + "</dt><dd>" + fact.value + "</dd></div>",
      )
      .join("") +
    "</dl>"
  );
}

function renderProductLead(product, index) {
  return (
    '<header class="product-lead">' +
    '<div class="product-visual">' +
    '<span class="dossier-index" aria-hidden="true">0' +
    (index + 1) +
    "</span>" +
    '<img src="' +
    product.imageUrl +
    '" alt="' +
    product.shortName +
    '" />' +
    "</div>" +
    '<div class="product-summary">' +
    '<p class="choice-role">' +
    product.role +
    "</p>" +
    "<h3>" +
    product.shortName +
    "</h3>" +
    '<p class="verdict">' +
    product.verdict +
    "</p>" +
    '<div class="price-line"><span>Giá ghi nhận</span><strong>' +
    money(product.observedPrice) +
    "</strong><small>" +
    product.capturedAt +
    "</small></div>" +
    "</div>" +
    "</header>"
  );
}

function renderEvidenceNode(state, eyebrow, title, text) {
  return (
    '<div class="evidence-node" data-state="' +
    state +
    '">' +
    '<p class="node-eyebrow">' +
    eyebrow +
    "</p>" +
    "<h4>" +
    title +
    "</h4>" +
    "<p>" +
    text +
    "</p>" +
    "</div>"
  );
}

function renderSourceNext(product) {
  return (
    '<div class="source-next">' +
    '<div class="next-step"><p class="section-label">Bước tiếp theo</p><p>' +
    product.parts.sourceNext +
    "</p></div>" +
    '<a class="primary-action" href="#verification-gate">Xác minh giá, tồn kho và lắp đặt</a>' +
    '<details class="evidence-details"><summary>Nguồn dữ kiện và thời điểm</summary>' +
    '<div class="source-record"><p>Trang sản phẩm, dữ liệu ghi nhận ngày ' +
    product.capturedAt +
    '.</p><a class="source-link" href="' +
    product.productUrl +
    '" target="_blank" rel="noopener noreferrer">Xem nguồn sản phẩm ↗</a></div></details>' +
    "</div>"
  );
}

function renderEvidenceDossier(product, index) {
  const thread =
    requiredPart(
      "need",
      renderEvidenceNode(
        "verified",
        "Nhu cầu đã xác nhận",
        "Điều bạn đang cần",
        product.parts.need,
      ),
      "thread-part",
    ) +
    requiredPart(
      "fact",
      renderEvidenceNode(
        "verified",
        "Dữ kiện sản phẩm",
        "Điều nguồn đang công bố",
        product.parts.fact,
      ),
      "thread-part",
    ) +
    requiredPart(
      "outcome",
      renderEvidenceNode(
        "conditional",
        "Kết quả sử dụng",
        "Điều dữ kiện có thể hỗ trợ",
        product.parts.outcome,
      ),
      "thread-part",
    ) +
    requiredPart(
      "condition",
      renderEvidenceNode(
        "conditional",
        "Điều kiện áp dụng",
        "Khi nào cách hiểu này còn đúng",
        product.parts.condition,
      ),
      "thread-part",
    );

  return (
    '<article class="evidence-dossier" data-product="' +
    product.id +
    '">' +
    renderProductLead(product, index) +
    renderFacts(product) +
    '<div class="evidence-body">' +
    '<div class="evidence-thread">' +
    thread +
    "</div>" +
    '<div class="decision-notes">' +
    requiredPart(
      "tradeoff",
      '<div class="note-block tradeoff-block">' +
        statusLabel("conditional") +
        "<h4>Điểm đánh đổi</h4><p>" +
        product.parts.tradeoff +
        "</p></div>",
    ) +
    requiredPart(
      "uncertainty",
      '<div class="note-block unknown-block">' +
        statusLabel("unknown") +
        "<h4>Phần có thể làm đổi quyết định</h4><p>" +
        product.parts.uncertainty +
        "</p></div>",
    ) +
    "</div>" +
    requiredPart("source-next", renderSourceNext(product)) +
    "</div>" +
    "</article>"
  );
}

function renderVariantA() {
  return (
    '<div class="page-shell variant variant-a">' +
    renderBriefing() +
    '<section aria-labelledby="variant-a-title">' +
    renderVariantIntro(
      "variant-a-title",
      "Biến thể A · Ứng viên dẫn đầu",
      "Đọc theo dòng căn cứ",
      "Mỗi lựa chọn là một hồ sơ. Đi từ điều bạn đã xác nhận tới dữ kiện, kết quả có điều kiện, đánh đổi và phần cần kiểm tra.",
    ) +
    '<div class="evidence-stack">' +
    PRODUCTS.map(renderEvidenceDossier).join("") +
    "</div>" +
    "</section>" +
    "</div>"
  );
}

const MATRIX_ROWS = [
  {
    key: "need",
    label: "Nhu cầu",
    hint: "Điều khách đã xác nhận",
    state: "verified",
  },
  {
    key: "fact",
    label: "Dữ kiện",
    hint: "Điều nguồn đang công bố",
    state: "verified",
  },
  {
    key: "outcome",
    label: "Kết quả",
    hint: "Cách dữ kiện nối tới nhu cầu",
    state: "conditional",
  },
  {
    key: "condition",
    label: "Điều kiện",
    hint: "Ranh giới của cách hiểu",
    state: "conditional",
  },
  {
    key: "tradeoff",
    label: "Đánh đổi",
    hint: "Phần được và mất",
    state: "conditional",
  },
  {
    key: "uncertainty",
    label: "Chưa xác minh",
    hint: "Điều có thể làm đổi kết quả",
    state: "unknown",
  },
  {
    key: "source-next",
    label: "Nguồn và bước tiếp",
    hint: "Kiểm tra trước khi quyết định",
    state: "verified",
  },
];

function renderMatrixValue(product, row) {
  if (row.key === "source-next") {
    return (
      "<p>" +
      product.parts.sourceNext +
      "</p>" +
      '<a class="source-link" href="' +
      product.productUrl +
      '" target="_blank" rel="noopener noreferrer">Nguồn sản phẩm ↗</a>'
    );
  }

  return "<p>" + product.parts[row.key] + "</p>";
}

function renderDecisionMatrix() {
  return (
    '<section aria-labelledby="variant-b-title">' +
    renderVariantIntro(
      "variant-b-title",
      "Biến thể B · So sánh trực tiếp",
      "Bảng quyết định theo từng tiêu chí",
      "Mỗi hàng giữ một loại nhận định để bạn thấy thứ hạng có thể đổi ở đâu. Bảng có thể cuộn ngang trên điện thoại.",
    ) +
    '<div class="matrix-scroll" role="region" aria-label="Bảng so sánh ba khuyến nghị" tabindex="0">' +
    '<table class="decision-matrix"><thead><tr><th scope="col"><span class="matrix-corner">Tiêu chí ↓<br />Sản phẩm →</span></th>' +
    PRODUCTS.map(
      (product, index) =>
        '<th scope="col" data-product="' +
        product.id +
        '"><span class="matrix-rank">0' +
        (index + 1) +
        '</span><img src="' +
        product.imageUrl +
        '" alt="" /><strong>' +
        product.shortName +
        '</strong><span class="matrix-role">' +
        product.role +
        '</span><span class="matrix-price">' +
        money(product.observedPrice) +
        "</span></th>",
    ).join("") +
    "</tr></thead><tbody>" +
    MATRIX_ROWS.map(
      (row) =>
        '<tr><th scope="row"><strong>' +
        row.label +
        "</strong><small>" +
        row.hint +
        "</small></th>" +
        PRODUCTS.map(
          (product) =>
            '<td class="matrix-cell" data-state="' +
            row.state +
            '" data-required-part="' +
            row.key +
            '">' +
            statusLabel(row.state) +
            renderMatrixValue(product, row) +
            "</td>",
        ).join("") +
        "</tr>",
    ).join("") +
    "</tbody></table></div>" +
    '<p class="scroll-note">Vuốt ngang để xem đủ ba sản phẩm. Bảng không cộng các tiêu chí thành một điểm tổng.</p>' +
    "</section>"
  );
}

function renderVariantB() {
  return (
    '<div class="page-shell variant variant-b">' +
    renderBriefing() +
    renderDecisionMatrix() +
    "</div>"
  );
}

function renderRoutePart(name, eyebrow, title, text, state) {
  return requiredPart(
    name,
    '<div class="route-part" data-state="' +
      state +
      '"><p class="node-eyebrow">' +
      eyebrow +
      "</p><h4>" +
      title +
      "</h4><p>" +
      text +
      "</p></div>",
  );
}

function renderChoiceRoute(product, index) {
  return (
    '<article class="choice-route" data-product="' +
    product.id +
    '">' +
    '<header><span class="route-number">0' +
    (index + 1) +
    '</span><p class="choice-role">' +
    product.role +
    "</p><h3>" +
    product.shortName +
    '</h3><p class="verdict">' +
    product.verdict +
    '</p><img src="' +
    product.imageUrl +
    '" alt="' +
    product.shortName +
    '" /><div class="price-line"><span>Giá ghi nhận</span><strong>' +
    money(product.observedPrice) +
    "</strong><small>" +
    product.capturedAt +
    "</small></div></header>" +
    '<div class="route-flow">' +
    renderRoutePart(
      "need",
      "Bắt đầu từ",
      "Nhu cầu",
      product.parts.need,
      "verified",
    ) +
    renderRoutePart(
      "fact",
      "Đi qua",
      "Dữ kiện",
      product.parts.fact,
      "verified",
    ) +
    renderRoutePart(
      "outcome",
      "Dẫn tới",
      "Kết quả có thể nhận",
      product.parts.outcome,
      "conditional",
    ) +
    renderRoutePart(
      "condition",
      "Chỉ khi",
      "Điều kiện còn đúng",
      product.parts.condition,
      "conditional",
    ) +
    renderRoutePart(
      "tradeoff",
      "Đổi lại",
      "Điểm đánh đổi",
      product.parts.tradeoff,
      "conditional",
    ) +
    renderRoutePart(
      "uncertainty",
      "Dừng lại nếu",
      "Phần chưa xác minh",
      product.parts.uncertainty,
      "unknown",
    ) +
    requiredPart(
      "source-next",
      '<footer class="route-source"><p>' +
        product.parts.sourceNext +
        '</p><a class="source-link" href="' +
        product.productUrl +
        '" target="_blank" rel="noopener noreferrer">Kiểm tra nguồn ↗</a></footer>',
    ) +
    "</div>" +
    "</article>"
  );
}

function renderVariantC() {
  return (
    '<div class="page-shell variant variant-c">' +
    renderBriefing() +
    '<section aria-labelledby="variant-c-title">' +
    renderVariantIntro(
      "variant-c-title",
      "Biến thể C · Chọn theo đánh đổi",
      "Ba lối chọn, không phải ba nhãn cố định",
      "Mỗi lối cho thấy điều bạn đang ưu tiên, lý do phản bác và điểm phải xác minh. Vai trò có thể đổi khi hoàn cảnh đổi.",
    ) +
    '<div class="route-grid">' +
    PRODUCTS.map(renderChoiceRoute).join("") +
    "</div></section></div>"
  );
}

function getVariantFromUrl() {
  const key = new URLSearchParams(window.location.search)
    .get("variant")
    ?.toUpperCase();
  return Object.hasOwn(VARIANTS, key) ? key : "A";
}

function render() {
  const variant = getVariantFromUrl();
  const renderers = {
    A: renderVariantA,
    B: renderVariantB,
    C: renderVariantC,
  };

  document.body.dataset.variant = variant;
  document.title = VARIANTS[variant] + " · Ba khuyến nghị có căn cứ";
  app.innerHTML = renderers[variant]();
  label.value = variant + " · " + VARIANTS[variant];
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

previousButton.addEventListener("click", () => cycleVariant(-1));
nextButton.addEventListener("click", () => cycleVariant(1));

window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    target.matches("input, textarea, [contenteditable='true']")
  ) {
    return;
  }
  if (event.key === "ArrowLeft") cycleVariant(-1);
  if (event.key === "ArrowRight") cycleVariant(1);
});

window.addEventListener("popstate", render);
render();
