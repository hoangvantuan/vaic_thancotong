/**
 * Xếp hạng sản phẩm theo Need, có breakdown giải thích được — port từ dmx_search/search.py.
 *
 * Ba quyết định thiết kế giữ nguyên từ bản Python:
 *
 * 1. NGÂN SÁCH LÀ HARD FILTER, nhưng chỉ áp lên sản phẩm CÓ giá. Chia hai rổ:
 *    rổ chính = có giá & trong ngân sách (top 3); rổ phụ = thiếu giá nhưng khớp
 *    nhu cầu (báo riêng). Không bịa giá, cũng không giấu sản phẩm.
 *
 * 2. Khách đã nêu diện tích/số người mà hãng KHÔNG công bố phạm vi → không
 *    khẳng định hợp, tách rổ `unverifiedFit` — tránh bán máy 1 HP cho phòng 45m².
 *
 * 3. ĐIỂM LÀ TỔNG CÓ TRỌNG SỐ CỦA CÁC TIÊU CHÍ RỜI, mỗi tiêu chí giữ lý do dạng
 *    chữ. LLM chỉ diễn đạt lại reasons, không tự tính điểm → không bịa được.
 */

import type { NormalizedProduct } from "@/lib/types";
import type { CategoryConfig } from "@/lib/data/category-config";
import { formatVnd } from "@/lib/format";
import { CONCEPTS } from "./concepts";
import type { Need } from "./extract";
import { explainMissing, ok } from "./normalize";
import { buildView, type SearchProduct } from "./product-view";

export interface Reason {
  criterion: string;
  /** 0..1 */
  score: number;
  weight: number;
  /** Câu giải thích bình dân, KHÔNG thuật ngữ. */
  text: string;
  /** Cột catalog gốc → log nguồn. */
  sourceField: string | null;
  sourceValue: string | null;
}

const contribution = (r: Reason) => r.score * r.weight;

export interface Scored {
  product: NormalizedProduct;
  reasons: Reason[];
  total: number;
  /** Nhược điểm thật, chống "cái nào cũng tốt". */
  caveats: string[];
}

export interface Results {
  /** Có giá, trong ngân sách, ĐÃ xác nhận hợp hoàn cảnh → tư vấn được. */
  top: Scored[];
  /** Khớp nhu cầu nhưng thiếu giá → báo riêng. */
  noPrice: Scored[];
  /** Có giá nhưng hãng chưa công bố phạm vi → không khẳng định hợp. */
  unverifiedFit: Scored[];
  totalMatched: number;
  filteredOutByBudget: number;
}

const vnd = (v: number) => `${formatVnd(v)}`;

// Trọng số mặc định; điều chỉnh theo ngữ cảnh.
const BASE_WEIGHTS: Record<string, number> = {
  fit: 3.0, // đúng diện tích/số người — quan trọng nhất
  budget: 2.0,
  energy: 1.5,
  quiet: 1.0,
  concept: 1.0,
  brand: 0.5,
};

function weights(need: Need): Record<string, number> {
  const w = { ...BASE_WEIGHTS };
  if (need.room === "bedroom" || need.concepts.includes("quiet") || need.concepts.includes("sleep")) {
    w.quiet = 2.5; // phòng ngủ: độ ồn thành tiêu chí chính
  }
  if (need.wantsEnergySaving) w.energy = 2.5;
  if (need.wantsCheap) w.budget = 3.0;
  return w;
}

const mkReason = (
  criterion: string,
  score: number,
  text: string,
  sourceField: string | null = null,
  sourceValue: string | null = null
): Reason => ({ criterion, score, weight: 0, text, sourceField, sourceValue });

/** Giá trị hoàn cảnh khách nêu, theo đơn vị fit của ngành. */
function needFitValue(need: Need, cfg: CategoryConfig): number | null {
  switch (cfg.fit?.unit) {
    case "m²":
      return need.areaM2;
    case "người":
      return need.people;
    case "inch":
      return need.inches;
    default:
      return null;
  }
}

/** Khớp diện tích (m²) / số người / kích cỡ (inch) — lời giải thích theo đơn vị. */
function scoreFit(sp: SearchProduct, need: Need, cfg: CategoryConfig): Reason | null {
  const v = needFitValue(need, cfg);
  if (v == null || !cfg.fit || !ok(sp.fit)) return null;
  const lo = sp.fit.lo ?? 0;
  const hi = sp.fit.hi ?? lo;
  const raw = String(sp.fit.raw ?? "");
  const field = cfg.fit.fields[0];

  if (cfg.fit.match === "near") {
    const tol = cfg.fit.tolerance ?? 5;
    const d = Math.abs(lo - v);
    const s = d <= tol ? 1.0 : Math.max(0, 1 - (d - tol) / 15);
    const txt =
      d === 0
        ? `đúng cỡ ${v}${cfg.fit.unit} anh/chị cần`
        : `cỡ ${lo}${cfg.fit.unit}, ${d <= tol ? "sát" : "lệch"} mức ${v}${cfg.fit.unit} anh/chị nêu`;
    return mkReason("fit", s, txt, field, raw);
  }

  if (cfg.fit.unit === "m²") {
    if (lo <= v && v <= hi) {
      return mkReason("fit", 1.0, `vừa đúng phòng ${v}m² (hãng khuyên dùng cho ${lo}-${hi}m²)`, field, raw);
    }
    if (v < lo) {
      const s = Math.max(0, 1 - (lo - v) / 10);
      return mkReason(
        "fit", s,
        `hơi dư công suất cho phòng ${v}m² (máy này cho ${lo}-${hi}m²), chạy vẫn mát nhưng tốn tiền hơn mức cần`,
        field, raw
      );
    }
    const s = Math.max(0, 1 - (v - hi) / 5); // thiếu công suất phạt nặng hơn dư
    return mkReason(
      "fit", s,
      `yếu so với phòng ${v}m² (máy này chỉ cho ${lo}-${hi}m²), phòng lâu mát và máy phải chạy hết sức`,
      field, raw
    );
  }

  // "người" (tủ lạnh / máy giặt)
  if (lo <= v && v <= hi) {
    return mkReason("fit", 1.0, `vừa cho nhà ${v} người (hãng khuyên ${raw})`, field, raw);
  }
  if (v < lo) {
    const s = Math.max(0, 1 - (lo - v) / 4);
    return mkReason("fit", s, `hơi rộng so với ${v} người (hãng khuyên ${raw})`, field, raw);
  }
  const s = Math.max(0, 1 - (v - hi) / 2);
  return mkReason("fit", s, `hơi chật cho ${v} người (hãng khuyên ${raw})`, field, raw);
}

function scoreBudget(sp: SearchProduct, need: Need): Reason | null {
  const price = sp.p.price.display;
  if (price == null || need.budgetMax == null) return null;
  if (price <= need.budgetMax) {
    // Càng sát trần thường càng nhiều tính năng → không phạt rẻ,
    // nhưng thưởng nhẹ cho việc tiết kiệm được tiền.
    const saved = need.budgetMax - price;
    const s = Math.min(1, 0.6 + saved / need.budgetMax);
    return mkReason(
      "budget", s,
      `giá ${vnd(price)}, rẻ hơn mức anh/chị định chi ${vnd(saved)}`,
      "giá khuyến mãi/giá gốc", vnd(price)
    );
  }
  return mkReason("budget", 0, `giá ${vnd(price)}, vượt ngân sách`, "giá", vnd(price));
}

function scoreEnergy(sp: SearchProduct): Reason | null {
  const e = sp.energy;
  if (ok(e) && e.hi) {
    const cop = e.hi; // COP — mịn hơn số sao
    const s = Math.max(0, Math.min(1, (cop - 3.5) / 2.5)); // 3.5 kém .. 6.0 rất tốt
    const star = e.num ? `${e.num} sao` : "chưa có nhãn";
    const lvl = cop >= 5.5 ? "rất tốt" : cop >= 4.8 ? "tốt" : "trung bình";
    return mkReason("energy", s, `${star}, tiết kiệm điện ${lvl} (chỉ số ${cop})`, "Nhãn năng lượng", String(e.raw));
  }
  if (sp.inverter) {
    return mkReason(
      "energy", 0.6,
      "có Inverter nên tiết kiệm điện hơn máy thường",
      "Công nghệ tiết kiệm điện", null
    );
  }
  return null;
}

function scoreQuiet(sp: SearchProduct): Reason | null {
  const n = sp.noiseDb;
  if (ok(n) && n.lo != null && n.hi != null) {
    // Chấm theo mức êm nhất NHƯNG kéo về phía mức ồn nhất, vì máy chỉ chạy
    // êm khi phòng đã đủ lạnh. Chấm bằng min sẽ khen nhầm máy "36-45 dB".
    const quietDb = n.lo;
    const loudDb = n.hi;
    const eff = loudDb > quietDb ? quietDb * 0.6 + loudDb * 0.4 : quietDb;
    const s = Math.max(0, Math.min(1, (45 - eff) / 20)); // 45dB ồn .. 25dB rất êm
    let txt: string;
    if (eff <= 25) txt = `rất êm, gần như không nghe thấy khi ngủ (${quietDb}dB)`;
    else if (eff <= 32) txt = `chạy êm, ngủ không bị làm phiền (${quietDb}dB)`;
    else if (eff <= 40) txt = `tiếng ồn vừa phải (${quietDb}dB)`;
    else txt = `khá ồn, để phòng ngủ sẽ hơi khó chịu (${quietDb}dB)`;
    if (loudDb > quietDb) txt += `, lúc chạy mạnh lên tới ${loudDb}dB`;
    return mkReason("quiet", s, txt, "Độ ồn", String(n.raw));
  }
  if (sp.concepts.has("quiet")) {
    return mkReason("quiet", 0.5, "hãng ghi có chế độ chạy êm nhưng không công bố số đo", "Tiện ích", null);
  }
  return null;
}

function scoreConcepts(sp: SearchProduct, need: Need): Reason | null {
  if (!need.concepts.length) return null;
  const got = need.concepts.filter((c) => sp.concepts.has(c));
  if (!got.length) return null;
  const labels = got.map((c) => CONCEPTS[c]?.label).filter(Boolean);
  return mkReason("concept", got.length / need.concepts.length, "có " + labels.join(", "), "Tiện ích", null);
}

/**
 * Nhược điểm THẬT lấy từ data — ép bot không nói sản phẩm nào cũng tốt.
 * Ngưỡng ở mức "chưa xuất sắc" (< 0.6) chứ không phải "tệ": sản phẩm trung bình
 * mà không có caveat nào thì bot sẽ khen suông — đúng anti-pattern đề bài cấm.
 */
function caveatsOf(sp: SearchProduct, reasons: Reason[]): string[] {
  const out: string[] = [];
  for (const r of reasons) {
    if (r.criterion === "fit" && r.score < 0.9) out.push(r.text);
    if ((r.criterion === "quiet" || r.criterion === "energy") && r.score < 0.6) out.push(r.text);
    if (r.criterion === "budget" && r.score <= 0) out.push(r.text);
  }

  // Dải ồn rộng: min che giấu sự thật là máy rất ồn khi chạy hết công suất.
  const n = sp.noiseDb;
  if (ok(n) && n.lo != null && n.hi != null && n.hi - n.lo >= 8) {
    out.push(`độ ồn chênh nhiều theo mức gió (${n.lo}-${n.hi}dB), chỉ êm khi phòng đã đủ lạnh`);
  }

  // Thiếu dữ liệu cũng là caveat phải nói ra, không giấu.
  for (const [facet, label] of [
    [sp.noiseDb, "độ ồn"],
    [sp.energy, "mức tiêu thụ điện"],
  ] as const) {
    if (facet.state === "undisclosed" || facet.state === "missing") {
      out.push(`${label}: ${explainMissing(facet)}`);
    }
  }
  if (!sp.p.price.hasPrice) out.push("giá: chưa có dữ liệu");
  return out;
}

export function score(sp: SearchProduct, need: Need, cfg: CategoryConfig, w: Record<string, number>): Scored {
  const reasons: Reason[] = [];
  const fns = [
    () => scoreFit(sp, need, cfg),
    () => scoreBudget(sp, need),
    () => scoreEnergy(sp),
    () => scoreQuiet(sp),
    () => scoreConcepts(sp, need),
  ];
  for (const fn of fns) {
    const r = fn();
    if (r) {
      r.weight = w[r.criterion] ?? 1.0;
      reasons.push(r);
    }
  }

  if (need.brands.length && need.brands.includes(sp.p.brand)) {
    reasons.push({ ...mkReason("brand", 1.0, `đúng hãng ${sp.p.brand} anh/chị hỏi`, "brand", sp.p.brand), weight: w.brand });
  }

  // Lý do TỐI THIỂU khi khách nêu ngành: để SP đúng ngành luôn có ít nhất 1 lý do
  // (không rớt vì luật "0 lý do bị loại"). Trọng số nhỏ để không lấn tiêu chí thực.
  if (need.category != null && sp.p.category === need.category) {
    reasons.push({
      ...mkReason("category", 1.0, `đúng loại ${sp.p.categoryLabel.toLowerCase()} anh/chị hỏi`, "category", sp.p.category),
      weight: 0.3,
    });
  }

  const total = reasons.reduce((acc, r) => acc + contribution(r), 0);
  return { product: sp.p, reasons, total, caveats: caveatsOf(sp, reasons) };
}

// Ngành mà tiêu chí "hợp hoàn cảnh" là quyết định: thiếu nó thì KHÔNG được xếp
// vào top khi khách đã nói rõ diện tích/số người. Không bịa độ phù hợp.
const FIT_CRITICAL = new Set(["may_lanh", "tu_lanh", "may_giat"]);

/** True nếu khách đã nêu ràng buộc quyết định mà sản phẩm KHÔNG có dữ liệu. */
function fitUnknown(sp: SearchProduct, need: Need, cfg: CategoryConfig): boolean {
  if (!FIT_CRITICAL.has(sp.p.category)) return false;
  return needFitValue(need, cfg) != null && !ok(sp.fit);
}

function hardFilter(sp: SearchProduct, need: Need, cfg: CategoryConfig): boolean {
  if (need.category && sp.p.category !== need.category) return false;
  if (need.brands.length && !need.brands.includes(sp.p.brand)) return false;
  // Loại thẳng máy quá yếu so với phòng: mua về không mát, không phải trade-off.
  if (need.areaM2 != null && cfg.fit?.unit === "m²" && ok(sp.fit) && sp.fit.hi != null) {
    if (need.areaM2 > sp.fit.hi + 5) return false;
  }
  return true;
}

/**
 * Top-k đa dạng kiểu MMR: không lấy 3 máy cùng hãng cùng tầm giá.
 * Mỗi vòng chọn ứng viên tối đa hoá (điểm − phạt trùng lặp so với những cái ĐÃ chọn).
 */
function diversify(cands: Scored[], k: number): Scored[] {
  const pool = [...cands].sort((a, b) => b.total - a.total);
  if (!pool.length) return [];
  const out: Scored[] = [pool[0]]; // hạng 1 luôn là điểm cao nhất
  const rest = pool.slice(1);

  while (out.length < k && rest.length) {
    const chosenBrands = out.map((s) => s.product.brand);
    const chosenBands = new Set(
      out
        .filter((s) => s.product.price.display != null)
        .map((s) => Math.floor(s.product.price.display! / 5_000_000))
    );
    let best: Scored | null = null;
    let bestAdj = -Infinity;
    for (const c of rest) {
      const price = c.product.price.display;
      const band = price != null ? Math.floor(price / 5_000_000) : -1;
      let penalty = 0;
      const sameBrand = chosenBrands.filter((b) => b === c.product.brand).length;
      if (sameBrand) penalty += 0.2 * sameBrand;
      if (chosenBands.has(band)) penalty += 0.12;
      const adj = c.total * (1 - penalty);
      if (adj > bestAdj) {
        best = c;
        bestAdj = adj;
      }
    }
    out.push(best!);
    rest.splice(rest.indexOf(best!), 1);
  }
  return out;
}

/**
 * Tìm và xếp hạng trong MỘT ngành. Catalog truyền vào là danh sách sản phẩm đã
 * chuẩn hoá của ngành đó (lib/data/catalog.ts). Thuần hàm, tất định:
 * cùng (catalog, need) luôn trả cùng Results.
 */
export function search(
  products: NormalizedProduct[],
  need: Need,
  cfg: CategoryConfig,
  k = 3
): Results {
  const view = buildView(products, cfg).filter((sp) => hardFilter(sp, need, cfg));
  const w = weights(need);

  const pricedInBudget: Scored[] = [];
  const unpriced: Scored[] = [];
  const unverified: Scored[] = [];
  let overBudget = 0;

  for (const sp of view) {
    const s = score(sp, need, cfg, w);
    // Không có lý do nào → không tư vấn suông → loại khỏi mọi rổ.
    if (!s.reasons.length) continue;
    if (!sp.p.price.hasPrice) {
      unpriced.push(s);
      continue;
    }
    if (need.budgetMax != null && sp.p.price.display! > need.budgetMax) {
      overBudget++;
      continue;
    }
    if (fitUnknown(sp, need, cfg)) unverified.push(s);
    else pricedInBudget.push(s);
  }

  const top = diversify(pricedInBudget, k);
  // Chỉ giữ rổ phụ nếu thật sự khớp nhu cầu (điểm dương), tránh nhiễu.
  const noPrice = unpriced.filter((s) => s.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);
  const unverifiedFit = unverified.sort((a, b) => b.total - a.total).slice(0, 5);

  return { top, noPrice, unverifiedFit, totalMatched: view.length, filteredOutByBudget: overBudget };
}
