// Logic thuần cho lệnh nạp catalog (#25) — không đọc/ghi file, không gọi git.
//
// Mọi giá trị chuẩn hoá đi ra từ đây đều mang NGUỒN CHỨNG MINH sáu trường đúng
// hợp đồng `lib/core/contracts/provenance.ts` (cổng chung cho #25–#30):
//   sourceUrl · recordLocation · rawValue · observedAt · normalizedValue · transformRule
//
// Quy tắc chuyển đổi nào cũng có mã phiên bản `tên@vN` để tái hiện được. Không đoán:
// giá trị đọc không ra thì đánh dấu vắng mặt kèm lý do, giữ nguyên giá trị gốc.

/** Trạng thái một dòng trong lần nạp — mỗi dòng vào ĐÚNG MỘT trạng thái. */
export const STATUS = Object.freeze({
  SUCCESS: "success", // đã đọc thành công
  QUARANTINED: "quarantined", // tạm cách ly vì dữ liệu chưa dùng được
  ERROR: "error", // lỗi, kèm lý do và vị trí nguồn
});

// ---------------------------------------------------------------------------
// Đọc một dòng
// ---------------------------------------------------------------------------

/**
 * Phân loại một dòng jsonl thành đúng một trạng thái.
 * Một dòng hỏng không được ném lỗi ra ngoài — trả về trạng thái `error`.
 */
export function classifyLine(line, lineNo) {
  let record;
  try {
    record = JSON.parse(line);
  } catch (err) {
    return {
      status: STATUS.ERROR,
      lineNo,
      reason: `JSON hỏng: ${err.message}`,
      record: null,
    };
  }
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return {
      status: STATUS.ERROR,
      lineNo,
      reason: `không phải bản ghi dạng object (nhận ${Array.isArray(record) ? "array" : typeof record})`,
      record: null,
    };
  }
  // Cách ly: không có bất kỳ mã nhận biết nào → không truy ngược được về sản phẩm.
  if (!firstIdentifier(record)) {
    return {
      status: STATUS.QUARANTINED,
      lineNo,
      reason: "không có mã nhận biết nào (product_id/sku/model_code/productcode/name đều trống)",
      record,
    };
  }
  return { status: STATUS.SUCCESS, lineNo, reason: null, record };
}

const IDENTIFIER_FIELDS = ["product_id", "sku", "model_code", "productcode", "name"];

/** Mã nhận biết đầu tiên có mặt, theo thứ tự ưu tiên cố định. */
export function firstIdentifier(record) {
  for (const f of IDENTIFIER_FIELDS) {
    const v = record?.[f];
    if (typeof v === "string" && v.trim()) return { field: f, value: v.trim() };
    if (typeof v === "number") return { field: f, value: String(v) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Quy tắc ngành máy lạnh — theo QUY TẮC trên tên nhóm hàng, không danh sách sản phẩm
// ---------------------------------------------------------------------------

/** category_aircon@v1: NFC + trim + lowercase tên nhóm hàng rồi so với tên ngành. */
export const RULE_AIRCON = "category_aircon@v1";
const AIRCON_CATEGORY_NAMES = new Set(["máy lạnh", "điều hòa", "điều hoà"]);

export function isAircon(record) {
  const raw = record?.category?.name;
  if (typeof raw !== "string") return false;
  return AIRCON_CATEGORY_NAMES.has(raw.normalize("NFC").trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// SourcedValue — ba tình trạng, khớp lib/core/contracts/status.ts
// ---------------------------------------------------------------------------

const observed = (value) => ({ status: "observed", value });
const absent = (reason) => ({ status: "absent", reason });

// ---------------------------------------------------------------------------
// Thời điểm nguồn
// ---------------------------------------------------------------------------

/** parse_crawled_at@v1: "2026-07-17 12:54:19" (giờ VN) → ISO 8601 "+07:00". */
export const RULE_CRAWLED_AT = "parse_crawled_at@v1";
const CRAWLED_AT = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

export function parseCrawledAt(raw) {
  if (typeof raw !== "string") return null;
  const m = CRAWLED_AT.exec(raw.trim());
  return m ? `${m[1]}T${m[2]}+07:00` : null;
}

// ---------------------------------------------------------------------------
// Các quy tắc chuẩn hoá trường tư vấn máy lạnh
// ---------------------------------------------------------------------------

/** Chuỗi báo "nguồn không công bố / chưa có" — ánh xạ sang lý do vắng mặt. */
function absenceFromSourceText(raw) {
  const t = raw.normalize("NFC").trim().toLowerCase();
  if (t === "hãng không công bố") return absent("undisclosed");
  if (t === "đang cập nhật") return absent("pending_update");
  return null;
}

/**
 * Tiền kiểm chung cho mọi parser chuỗi: trường thiếu → absent(missing); nguồn
 * tự khai không công bố / đang cập nhật → lý do tương ứng. Trả null khi chuỗi
 * dùng được — parser cứ thế đọc tiếp.
 */
function textStatus(raw) {
  if (typeof raw !== "string" || !raw.trim()) return absent("missing");
  return absenceFromSourceText(raw);
}

/** identity@v1: giữ nguyên chuỗi, chỉ trim. */
export const RULE_IDENTITY = "identity@v1";
export function normalizeIdentity(raw) {
  if (typeof raw !== "string") return absent("missing");
  const t = raw.trim();
  return t ? observed(t) : absent("missing");
}

/**
 * price_observed@v1: giá ĐÃ QUAN SÁT tại thời điểm nguồn = sale nếu có, ngược lại
 * original. Đây không phải giá hiện tại. Cả hai trống → vắng mặt.
 */
export const RULE_PRICE = "price_observed@v1";
export function normalizeObservedPrice(price) {
  if (price === null || price === undefined) return absent("missing");
  if (typeof price !== "object") return absent("invalid");
  const pick = [price.sale, price.original].find(
    (v) => typeof v === "number" && Number.isFinite(v) && v > 0
  );
  return pick === undefined ? absent("missing") : observed(pick);
}

/**
 * parse_area_m2@v1: "Dưới 15m² (…)" → [0,15]; "Từ 15 - 20m² (…)" → [15,20];
 * "Dưới 50m2" → [0,50]. Chỉ đọc phần m²/m2 TRƯỚC ngoặc (phần m³ là thể tích).
 */
export const RULE_AREA = "parse_area_m2@v2";
export function parseAreaM2(raw) {
  const pre = textStatus(raw);
  if (pre) return { min: pre, max: pre };
  const head = raw.split("(")[0].replace(/m²|m2/gi, " ");
  const under = /dưới\s*([\d.,]+)/i.exec(head);
  if (under) {
    const max = parseVnNumber(under[1]);
    return max === null
      ? { min: absent("invalid"), max: absent("invalid") }
      : { min: observed(0), max: observed(max) };
  }
  const range = /([\d.,]+)\s*-\s*([\d.,]+)/.exec(head);
  if (range) {
    const lo = parseVnNumber(range[1]);
    const hi = parseVnNumber(range[2]);
    if (lo !== null && hi !== null) return { min: observed(lo), max: observed(hi) };
  }
  const single = /trên\s*([\d.,]+)/i.exec(head);
  if (single) {
    const min = parseVnNumber(single[1]);
    if (min !== null) return { min: observed(min), max: absent("not_applicable") };
  }
  return { min: absent("invalid"), max: absent("invalid") };
}

/**
 * Phân xử nguồn diện tích (một phần của parse_area_m2@v2): kho có HAI trường
 * cùng nghĩa — "Phạm vi sử dụng" và "Phạm vi làm lạnh hiệu quả" — và ~50 bản ghi
 * có cả hai. Quy tắc: chỉ một trường có mặt → dùng trường đó; cả hai cùng cho
 * một số → dùng số đó; cả hai cho số KHÁC nhau → giữ CẢ HAI dưới dạng
 * `conflicting` (status.ts), không chọn hộ và không lấy trung bình.
 */
const AREA_FIELDS = ["Phạm vi sử dụng", "Phạm vi làm lạnh hiệu quả"];

/** Gộp hai SourcedValue cùng nghĩa: quan sát thắng vắng mặt; khác giá trị → mâu thuẫn. */
function mergeSourced(a, b) {
  if (a.status === "observed" && b.status === "observed") {
    return a.value === b.value ? a : { status: "conflicting", values: [a.value, b.value] };
  }
  if (a.status === "observed") return a;
  if (b.status === "observed") return b;
  return a; // cả hai vắng mặt → giữ lý do của trường ưu tiên
}

export function parseAreaFromSpecs(specs) {
  const present = AREA_FIELDS.filter(
    (f) => typeof specs?.[f] === "string" && specs[f].trim()
  );
  if (present.length === 0) {
    return {
      min: absent("missing"),
      max: absent("missing"),
      rawValue: "",
      fieldPath: `specs/${AREA_FIELDS[0]}`,
    };
  }
  if (present.length === 1) {
    const f = present[0];
    const r = parseAreaM2(specs[f]);
    return { min: r.min, max: r.max, rawValue: specs[f], fieldPath: `specs/${f}` };
  }
  const [f1, f2] = present;
  const r1 = parseAreaM2(specs[f1]);
  const r2 = parseAreaM2(specs[f2]);
  return {
    min: mergeSourced(r1.min, r2.min),
    max: mergeSourced(r1.max, r2.max),
    // Giữ nguyên văn CẢ HAI giá trị gốc, ghi rõ trường nào nói gì.
    rawValue: JSON.stringify({ [f1]: specs[f1], [f2]: specs[f2] }),
    fieldPath: `specs/${f1} | specs/${f2}`,
  };
}

/**
 * parse_btu@v1 / parse_hp@v1: "1.5 HP - 12.000 BTU" → HP 1.5, BTU 12000.
 * Số cạnh BTU dùng dấu chấm ngăn nghìn; số cạnh HP dùng dấu chấm thập phân.
 */
export const RULE_BTU = "parse_btu@v1";
export const RULE_HP = "parse_hp@v1";
export function parseCoolingCapacity(raw) {
  const pre = textStatus(raw);
  if (pre) return { btu: pre, hp: pre };
  const btuMatch = /([\d.,]+)\s*BTU/i.exec(raw);
  const hpMatch = /([\d.,]+)\s*HP/i.exec(raw);
  const btu = btuMatch ? parseVnThousands(btuMatch[1]) : null;
  const hp = hpMatch ? Number.parseFloat(hpMatch[1].replace(",", ".")) : null;
  return {
    btu: btu === null ? absent(btuMatch ? "invalid" : "missing") : observed(btu),
    hp: hp === null || Number.isNaN(hp) ? absent(hpMatch ? "invalid" : "missing") : observed(hp),
  };
}

/**
 * parse_energy_stars@v1: "5 sao (…)" → 5. "Không có"/"Không" là dữ kiện quan sát
 * được — KHÔNG có nhãn — chuẩn hoá thành 0 sao, khác với "Hãng không công bố"
 * (undisclosed) và "Đang cập nhật" (pending_update).
 */
export const RULE_STARS = "parse_energy_stars@v1";
export function parseEnergyStars(raw) {
  const pre = textStatus(raw);
  if (pre) return pre;
  const t = raw.normalize("NFC").trim().toLowerCase();
  if (t === "không" || t === "không có") return observed(0);
  const m = /(\d+)\s*sao/i.exec(raw);
  return m ? observed(Number.parseInt(m[1], 10)) : absent("invalid");
}

/**
 * parse_noise_db@v1: mức ồn dàn lạnh THẤP NHẤT nhà sản xuất công bố.
 * "33/50 dB" → 33 · "Dàn lạnh: 21 - 39 dB - Dàn nóng: 50 dB" → 21.
 * Có nhắc "Dàn nóng" thì chỉ đọc phần trước đó.
 */
export const RULE_NOISE = "parse_noise_db@v1";
export function parseNoiseDb(raw) {
  const pre = textStatus(raw);
  if (pre) return pre;
  const cut = raw.split(/dàn nóng/i)[0];
  const nums = [...cut.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number.parseFloat(m[1]));
  const plausible = nums.filter((n) => n >= 10 && n <= 90);
  return plausible.length ? observed(Math.min(...plausible)) : absent("invalid");
}

/**
 * parse_inverter@v1: "Máy lạnh không Inverter" → "non_inverter";
 * "Máy lạnh Inverter" → "inverter". Xét chữ "không" TRƯỚC vì chuỗi phủ định
 * vẫn chứa chữ "inverter".
 */
export const RULE_INVERTER = "parse_inverter@v1";
export function parseInverter(raw) {
  const pre = textStatus(raw);
  if (pre) return pre;
  const t = raw.normalize("NFC").toLowerCase();
  if (!t.includes("inverter")) return absent("invalid");
  return t.includes("không") ? observed("non_inverter") : observed("inverter");
}

/** "12.000" → 12000 (chấm/phẩy là ngăn nghìn khi theo nhóm 3 chữ số). */
function parseVnThousands(s) {
  const cleaned = s.replace(/[.,]/g, "");
  const n = Number.parseInt(cleaned, 10);
  return Number.isNaN(n) ? null : n;
}

/** Số dạng VN có thể mang thập phân bằng phẩy: "15" → 15, "7,5" → 7.5. */
function parseVnNumber(s) {
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Điều kiện hiển thị
// ---------------------------------------------------------------------------

/**
 * display_eligibility@v1: chỉ được XEM XÉT HIỂN THỊ khi có đủ cả ba:
 *   (1) tên hoặc mã nhận biết · (2) đường dẫn nguồn (url) · (3) thời điểm ghi nhận.
 * Trả về danh sách lý do thiếu — rỗng nghĩa là đủ điều kiện.
 */
export const RULE_DISPLAY = "display_eligibility@v1";
export function displayIneligibilityReasons(record) {
  const reasons = [];
  if (!firstIdentifier(record)) reasons.push("thiếu tên hoặc mã nhận biết");
  if (typeof record?.url !== "string" || !record.url.trim()) reasons.push("thiếu đường dẫn nguồn (url)");
  if (!parseCrawledAt(record?.crawled_at)) reasons.push("thiếu thời điểm ghi nhận (crawled_at)");
  return reasons;
}

// ---------------------------------------------------------------------------
// Nguồn chứng minh
// ---------------------------------------------------------------------------

/**
 * Dựng một nguồn chứng minh sáu trường cho MỘT giá trị đã chuẩn hoá.
 *
 * `observedAt`: lấy crawled_at của bản ghi; bản ghi không có crawled_at thì dùng
 * thời điểm commit của tệp dữ liệu (`fallbackObservedAt`) — giá trị chắc chắn đã
 * tồn tại không muộn hơn lúc đó. Chính sách này ghi trong báo cáo nạp.
 */
export function buildProvenance({
  record,
  sourcePath,
  lineNo,
  fieldPath,
  rawValue,
  normalizedValue,
  transformRule,
  fallbackObservedAt,
}) {
  const url = typeof record?.url === "string" && record.url.trim() ? record.url.trim() : null;
  return {
    sourceUrl: url ?? `file://${sourcePath}`,
    recordLocation: `${sourcePath}#L${lineNo}/${fieldPath}`,
    rawValue,
    observedAt: parseCrawledAt(record?.crawled_at) ?? fallbackObservedAt,
    normalizedValue,
    transformRule,
  };
}

/** Giá trị gốc dạng chuỗi NGUYÊN VĂN — object thì giữ nguyên JSON. */
function rawString(v) {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : JSON.stringify(v);
}

/**
 * Chuẩn hoá MỘT bản ghi máy lạnh: mỗi trường tư vấn một nguồn chứng minh riêng.
 * Giá trị gốc luôn được giữ trong `rawValue`; không suy đoán trường thiếu.
 */
export function normalizeAirconRecord(record, { sourcePath, lineNo, fallbackObservedAt }) {
  const specs = record.specs ?? {};
  const ctx = { record, sourcePath, lineNo, fallbackObservedAt };
  const p = (fieldPath, rawValue, normalizedValue, transformRule) =>
    buildProvenance({ ...ctx, fieldPath, rawValue, normalizedValue, transformRule });

  const area = parseAreaFromSpecs(specs);
  const capacity = parseCoolingCapacity(specs["Công suất làm lạnh"]);
  const reasons = displayIneligibilityReasons(record);
  // Trường đã dùng để PHÂN LOẠI ngành cũng phải có nguồn chứng minh (#25 mục 7).
  const catRaw = record.category?.name;
  const categoryNormalized =
    typeof catRaw === "string" && catRaw.trim()
      ? observed(catRaw.normalize("NFC").trim().toLowerCase())
      : absent("missing");

  return {
    recordKey: `${sourcePath}#L${lineNo}`,
    sourceLine: lineNo,
    identifiers: {
      product_id: record.product_id ?? null,
      sku: record.sku ?? null,
      model_code: record.model_code ?? null,
      productcode: record.productcode ?? null,
      name: record.name ?? null,
    },
    displayEligible: reasons.length === 0,
    displayEligibilityRule: RULE_DISPLAY,
    displayIneligibilityReasons: reasons,
    duplicateGroup: null, // điền ở bước phát hiện trùng toàn cục
    fields: {
      name: p("name", rawString(record.name), normalizeIdentity(record.name), RULE_IDENTITY),
      brand: p("brand", rawString(record.brand), normalizeIdentity(record.brand), RULE_IDENTITY),
      sourceCategoryName: p("category/name", rawString(catRaw), categoryNormalized, RULE_AIRCON),
      priceObservedVnd: p("price", rawString(record.price), normalizeObservedPrice(record.price), RULE_PRICE),
      roomAreaMinM2: p(area.fieldPath, area.rawValue, area.min, RULE_AREA),
      roomAreaMaxM2: p(area.fieldPath, area.rawValue, area.max, RULE_AREA),
      coolingCapacityBtu: p("specs/Công suất làm lạnh", rawString(specs["Công suất làm lạnh"]), capacity.btu, RULE_BTU),
      coolingCapacityHp: p("specs/Công suất làm lạnh", rawString(specs["Công suất làm lạnh"]), capacity.hp, RULE_HP),
      energyLabelStars: p("specs/Nhãn năng lượng", rawString(specs["Nhãn năng lượng"]), parseEnergyStars(specs["Nhãn năng lượng"]), RULE_STARS),
      noiseIndoorMinDb: p("specs/Độ ồn", rawString(specs["Độ ồn"]), parseNoiseDb(specs["Độ ồn"]), RULE_NOISE),
      inverter: p("specs/Loại Inverter", rawString(specs["Loại Inverter"]), parseInverter(specs["Loại Inverter"]), RULE_INVERTER),
    },
  };
}

// ---------------------------------------------------------------------------
// Phát hiện bản ghi trùng — CHỈ phát hiện và báo, KHÔNG gộp (no_merge@v1)
// ---------------------------------------------------------------------------

export const RULE_DEDUPE = "no_merge@v1";

/**
 * Nhóm các dòng có cùng product_id. Không gộp hai bản ghi: chưa có quy tắc gộp
 * nào được ghi nhận, và các nhóm trùng quan sát được (vd product_id "9999" với
 * ba sku khác nhau) cho thấy cùng product_id chưa chắc là cùng sản phẩm.
 *
 * `rows`: mảng { lineNo, record } đã đọc thành công.
 */
export function detectDuplicates(rows) {
  const byProductId = new Map();
  for (const { lineNo, record } of rows) {
    const pid = record.product_id;
    if (typeof pid !== "string" && typeof pid !== "number") continue;
    const key = String(pid);
    if (!byProductId.has(key)) byProductId.set(key, []);
    byProductId.get(key).push(lineNo);
  }
  const groups = [];
  for (const [productId, lines] of byProductId) {
    if (lines.length > 1) groups.push({ key: `product_id:${productId}`, productId, lines });
  }
  groups.sort((a, b) => a.lines[0] - b.lines[0]);
  return {
    rule: RULE_DEDUPE,
    groupCount: groups.length,
    recordCount: groups.reduce((n, g) => n + g.lines.length, 0),
    groups,
  };
}

// ---------------------------------------------------------------------------
// Đối chiếu số liệu tham khảo — tự đếm, báo chênh lệch, không ép kết quả
// ---------------------------------------------------------------------------

/** Số liệu tham khảo tại thời điểm chốt #9 (chỉ để đối chiếu). */
export const REFERENCE_COUNTS = Object.freeze({
  totalProducts: 21166,
  airconRecords: 1116,
  airconDisplayEligible: 228,
  airconWithObservedPrice: 226,
});

export function compareWithReference(actual) {
  return Object.entries(REFERENCE_COUNTS).map(([metric, expected]) => ({
    metric,
    reference: expected,
    actual: actual[metric],
    delta: actual[metric] - expected,
  }));
}
