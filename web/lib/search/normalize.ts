/**
 * Chuẩn hoá giá trị thô từ specs thành facet có kiểu — port từ dmx_search/normalize.py.
 *
 * Mọi parser trả về Value 3-trạng-thái mà guardrail cần (có giá trị / hãng không
 * công bố / thiếu hẳn). Không bao giờ đoán số.
 */

export type ValueState = "ok" | "undisclosed" | "n/a" | "missing" | "unparsed";

/** Một facet đã chuẩn hoá. `raw` luôn giữ để trace nguồn khi trả lời khách. */
export interface FacetValue {
  state: ValueState;
  raw: unknown;
  num: number | null;
  lo: number | null;
  hi: number | null;
  tags: string[];
}

export function value(
  state: ValueState,
  raw: unknown = null,
  extra: Partial<Pick<FacetValue, "num" | "lo" | "hi" | "tags">> = {}
): FacetValue {
  return { state, raw, num: null, lo: null, hi: null, tags: [], ...extra };
}

export const MISSING: FacetValue = value("missing");

export function ok(v: FacetValue | undefined | null): v is FacetValue {
  return v?.state === "ok";
}

/** Câu trả lời bình dân khi không có số — dùng thay vì bịa. */
export function explainMissing(v: FacetValue): string {
  switch (v.state) {
    case "undisclosed":
      return "hãng chưa công bố thông số này";
    case "n/a":
      return "sản phẩm này không có";
    case "missing":
      return "chưa có dữ liệu";
    case "unparsed":
      return "dữ liệu ghi không rõ ràng";
    default:
      return "chưa có dữ liệu";
  }
}

/** Bỏ dấu tiếng Việt + lower. "Máy Lạnh" → "may lanh". Cho khớp query không dấu. */
export function fold(s: unknown): string {
  return String(s)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

// Các sentinel gặp thật trong data, so khớp sau khi fold dấu + lower.
const UNDISCLOSED = new Set(["hang khong cong bo", "dang cap nhat", "chua co thong tin"]);
const NOT_APPLICABLE = new Set(["khong", "khong co"]);

function sentinel(raw: unknown): FacetValue | null {
  if (raw == null || (typeof raw === "string" && !raw.trim())) {
    return value("missing", raw);
  }
  const f = fold(raw);
  if (UNDISCLOSED.has(f)) return value("undisclosed", raw);
  if (NOT_APPLICABLE.has(f)) return value("n/a", raw);
  return null;
}

function nums(text: string): number[] {
  return [...text.replace(/,/g, ".").matchAll(/(\d+(?:\.\d+)?)/g)].map((m) =>
    Number(m[1])
  );
}

/**
 * "Từ 15 - 20m² (từ 40 đến 60m³)" → lo=15 hi=20. "Dưới 15m²" → lo=0 hi=15.
 * Bắt buộc cắt phần (m³) trước, nếu không sẽ nuốt nhầm 40-60.
 */
export function parseAreaRange(raw: unknown): FacetValue {
  const s = sentinel(raw);
  if (s) return s;
  const txt = String(raw).split("(")[0];
  if (!/m\s*[²2]/.test(txt)) return value("unparsed", raw);
  const ns = nums(txt);
  if (!ns.length) return value("unparsed", raw);
  const f = fold(txt);
  if (f.includes("duoi")) return value("ok", raw, { lo: 0, hi: ns[0] });
  if (f.includes("tren")) return value("ok", raw, { lo: ns[0], hi: 999 });
  if (ns.length >= 2)
    return value("ok", raw, { lo: Math.min(ns[0], ns[1]), hi: Math.max(ns[0], ns[1]) });
  return value("ok", raw, { lo: ns[0], hi: ns[0] });
}

/**
 * "3 - 4 người" → lo=3 hi=4. "Trên 5 người" → lo=5 hi=99.
 * Tủ lạnh nhét cả dung tích vào cùng ô ("635 lít - Trên 5 người") — chỉ xét
 * phần trước chữ "người" nên phải cắt số lít: lấy phần chuỗi quanh "nguoi".
 */
export function parsePeopleRange(raw: unknown): FacetValue {
  const s = sentinel(raw);
  if (s) return s;
  const f = fold(raw);
  // Cắt phần "X lít - " nếu có, để số lít không lọt vào khoảng người.
  const cut = f.replace(/^.*?lit\s*-?\s*/, "");
  const ns = nums(cut);
  if (!ns.length) return value("unparsed", raw);
  if (cut.includes("tren")) return value("ok", raw, { lo: ns[0], hi: 99 });
  if (cut.includes("duoi")) return value("ok", raw, { lo: 0, hi: ns[0] });
  if (ns.length >= 2)
    return value("ok", raw, { lo: Math.min(ns[0], ns[1]), hi: Math.max(ns[0], ns[1]) });
  return value("ok", raw, { lo: ns[0], hi: ns[0] });
}

/**
 * "5 sao (Hiệu suất năng lượng 6.23)" → num=5 (sao), hi=6.23 (COP).
 * COP là chỉ số so sánh tiết kiệm điện mịn hơn số sao, giữ cả hai.
 */
export function parseEnergyLabel(raw: unknown): FacetValue {
  const s = sentinel(raw);
  if (s) return s;
  const txt = String(raw);
  const stars = fold(txt).match(/(\d)\s*sao/);
  const cop = txt.replace(/,/g, ".").match(/(\d+(?:\.\d+)?)\s*\)?\s*$/);
  if (!stars && !cop) return value("unparsed", raw);
  return value("ok", raw, {
    num: stars ? Number(stars[1]) : null,
    hi: cop ? Number(cop[1]) : null,
  });
}

/**
 * "Dàn lạnh: 45/34/29 dB - Dàn nóng: 51 dB" → num=lo=29, hi=45.
 * Dàn lạnh mới là cái đặt trong phòng — dàn nóng để ngoài trời, không tính.
 */
export function parseNoise(raw: unknown): FacetValue {
  const s = sentinel(raw);
  if (s) return s;
  const txt = String(raw);
  const f = fold(txt);
  const idx = f.indexOf("dan nong");
  const indoorTxt = idx >= 0 ? txt.slice(0, idx) : txt;
  // dB hợp lệ 15-70; loại số rác lọt vào (vd "2024" trong ghi chú).
  const ns = nums(indoorTxt).filter((n) => n >= 15 && n <= 70);
  if (!ns.length) return value("unparsed", raw);
  const lo = Math.min(...ns);
  const hi = Math.max(...ns);
  return value("ok", raw, { num: lo, lo, hi });
}

/**
 * "Hẹn giờ bật, tắt máy | Sleep Mode | ..." → mảng tag.
 * Tách theo "|" — KHÔNG tách theo "," vì bản thân tag có dấu phẩy.
 */
export function parseTags(raw: unknown): FacetValue {
  const s = sentinel(raw);
  if (s) return value(s.state, raw, { tags: [] });
  const parts = String(raw)
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  return value("ok", raw, { tags: parts });
}
