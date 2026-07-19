import type { NormalizedProduct, Needs, RecommendedProduct } from "@/lib/types";
import { fitMatches, fitToText, type CategoryConfig } from "@/lib/data/category-config";
import { energyStars, minIndoorNoiseDb } from "@/lib/data/parsers";
import { sellingFacts } from "@/lib/data/phrasebook";

/**
 * SUB-AGENT: TÌM KIẾM SẢN PHẨM (đa ngành, thuần hàm — KHÔNG gọi LLM).
 *
 * Lọc catalog thật theo nhu cầu, dùng tiêu chí `fit` do config của ngành khai báo:
 *   - Hợp hoàn cảnh: sp có `fit` khớp giá trị khách nêu; sp thiếu `fit` vẫn giữ (hạng thấp hơn);
 *     sp có `fit` mà KHÔNG khớp → loại.
 *   - Ngân sách: sp có giá phải ≤ ngân sách; sp thiếu giá vẫn đề xuất (đánh dấu "đang cập nhật").
 *   - Sort: khớp hoàn cảnh → biết hoàn cảnh → có giá → giá tăng dần.
 * Trả top 3 (đúng yêu cầu đề bài) để phần giải thích trade-off còn gọn.
 */

/** Ngưỡng được PHÉP khẳng định — dưới ngưỡng thì chỉ nêu số liệu trung tính. */
const QUIET_MAX_DB = 30;
const ENERGY_MIN_STARS = 4;

interface Scored {
  p: NormalizedProduct;
  fitMatch: boolean;
  fitKnown: boolean;
  /** Với match "near": lệch bao nhiêu so với con số khách nêu (0 = đúng y). */
  fitDistance: number;
}

function buildReason(
  p: NormalizedProduct,
  needs: Needs,
  cfg: CategoryConfig
): string {
  const parts: string[] = [];
  const pr = needs.priorities ?? [];

  const fitText = cfg.fit ? fitToText(p.fit, cfg.fit.unit) : null;
  if (fitText) parts.push(needs.fitValue != null ? `hợp ${fitText}` : `dùng cho ${fitText}`);

  // Nói LỢI ÍCH bằng câu đời thường ĐÃ DUYỆT (phrasebook), KHÔNG đọc lại bảng thông
  // số: khách cần "chạy êm, đêm ngủ không bị ù tai", không cần "độ ồn 33 dB". Thông
  // số chưa có cách nói đã duyệt thì BỎ QUA — thẻ sản phẩm đã hiện số bên trên rồi.
  for (const f of sellingFacts(p.highlights, cfg)) {
    if (parts.length >= 3) break;
    if (f.plain) parts.push(f.plain);
  }

  // Ưu tiên khách TỰ NÊU thì nhắc lại bằng lời thường (chỉ khi số liệu thật sự đạt
  // ngưỡng — không nói quá), và chỉ khi phần trên chưa nói tới ý đó.
  if (pr.includes("quiet") && !parts.some((t) => /êm|ồn/i.test(t))) {
    const noise = p.highlights.find((h) => /ồn/i.test(h.label));
    const db = minIndoorNoiseDb(noise?.title);
    if (db != null && db <= QUIET_MAX_DB) parts.push("chạy êm đúng ý anh/chị");
  }
  if (pr.includes("energy") && !parts.some((t) => /điện/i.test(t))) {
    const label = p.highlights.find((h) => /năng lượng/i.test(h.label));
    const stars = energyStars(label?.title);
    if (stars != null && stars >= ENERGY_MIN_STARS) parts.push("dùng thường xuyên cũng đỡ tốn điện");
  }

  if (parts.length === 0) return "Phù hợp nhu cầu cơ bản của anh/chị.";
  const s = parts.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

function toRecommended(
  p: NormalizedProduct,
  needs: Needs,
  cfg: CategoryConfig
): RecommendedProduct {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    categoryLabel: p.categoryLabel,
    priceDisplay: p.price.display,
    priceOriginal: p.price.original,
    hasPrice: p.price.hasPrice,
    discountPercent: p.price.discountPercent,
    priceUpdating: !p.price.hasPrice,
    rating: p.rating,
    quantitySold: p.quantitySold,
    fitText: cfg.fit ? fitToText(p.fit, cfg.fit.unit) : null,
    highlights: p.highlights,
    imageUrl: p.imageUrl,
    url: p.url,
    promotion: p.promotion,
    reason: buildReason(p, needs, cfg),
  };
}

export function findProducts(
  needs: Needs,
  catalog: NormalizedProduct[],
  cfg: CategoryConfig,
  limit = 3
): RecommendedProduct[] {
  const scored: Scored[] = [];

  for (const p of catalog) {
    const hasFitCriteria = cfg.fit != null && needs.fitValue != null;
    const matched = hasFitCriteria
      ? fitMatches(p.fit, needs.fitValue!, cfg.fit!)
      : false;

    // Loại khi BIẾT tiêu chí của sp mà không khớp.
    if (hasFitCriteria && p.fit && !matched) continue;
    // Loại khi có giá mà vượt ngân sách.
    if (needs.budgetVnd != null && p.price.hasPrice && p.price.display! > needs.budgetVnd)
      continue;

    // Với ngành khớp kiểu "near" (vd tivi bao nhiêu inch), đo độ lệch để xếp
    // sản phẩm đúng cỡ khách hỏi lên trước sản phẩm chỉ nằm trong dung sai.
    const fitDistance =
      hasFitCriteria && cfg.fit!.match === "near" && p.fit
        ? Math.abs(p.fit.min - needs.fitValue!)
        : 0;

    scored.push({ p, fitMatch: matched, fitKnown: p.fit != null, fitDistance });
  }

  scored.sort((a, b) => {
    if (a.fitMatch !== b.fitMatch) return a.fitMatch ? -1 : 1;
    if (a.fitDistance !== b.fitDistance) return a.fitDistance - b.fitDistance;
    if (a.fitKnown !== b.fitKnown) return a.fitKnown ? -1 : 1;
    if (a.p.price.hasPrice !== b.p.price.hasPrice) return a.p.price.hasPrice ? -1 : 1;
    const pa = a.p.price.display ?? Number.POSITIVE_INFINITY;
    const pb = b.p.price.display ?? Number.POSITIVE_INFINITY;
    return pa - pb;
  });

  const pool = applyBudgetFloor(scored, needs.budgetVnd, limit);
  return diversifyByPrice(pool, limit).map((s) => toRecommended(s.p, needs, cfg));
}

/** Dưới ngưỡng này so với ngân sách thường đã là PHÂN KHÚC KHÁC, không phải "giá tốt". */
const BUDGET_FLOOR_RATIO = 0.25;

/**
 * Bỏ những sản phẩm rẻ hơn ngân sách quá xa.
 *
 * Lý do thực tế: khách nói "điện thoại dưới 8 triệu" mà đưa máy phổ thông 410k
 * (16MB, pin 1000mAh) thì đúng ngân sách nhưng sai phân khúc — đó không còn là
 * món khách định mua. Ngưỡng 25% đủ để loại nhóm lệch hẳn phân khúc mà vẫn giữ
 * các món "giá tốt" bình thường (máy giặt 3.9tr với ngân sách 12tr vẫn được giữ).
 *
 * Chỉ áp dụng khi vẫn còn đủ ứng viên — không bao giờ để khách trắng tay vì bộ lọc này.
 */
function applyBudgetFloor(
  ranked: Scored[],
  budget: number | undefined,
  limit: number
): Scored[] {
  if (budget == null) return ranked;
  const floor = budget * BUDGET_FLOOR_RATIO;
  const kept = ranked.filter(
    (s) => !s.p.price.hasPrice || (s.p.price.display ?? 0) >= floor
  );
  return kept.length >= limit ? kept : ranked;
}

/**
 * Chọn `limit` sản phẩm TRẢI ĐỀU tầm giá thay vì lấy N cái rẻ nhất.
 *
 * Lý do: lấy 3 cái đầu danh sách đã sắp theo giá thường ra 3 sản phẩm gần như y hệt
 * (cùng giá, cùng cấu hình) — khách không có gì để cân nhắc, và không thể giải thích
 * trade-off như đề bài yêu cầu. Giữ nguyên ứng viên hạng 1, các suất còn lại ưu tiên
 * sản phẩm lệch giá đáng kể (≥15%) để bộ ba có "rẻ hơn / nhỉnh hơn" rõ ràng.
 */
function diversifyByPrice(ranked: Scored[], limit: number): Scored[] {
  if (ranked.length <= limit) return ranked;

  const priceOf = (s: Scored) => s.p.price.display ?? Number.POSITIVE_INFINITY;
  const picked: Scored[] = [ranked[0]];

  const farEnough = (cand: Scored) =>
    picked.every((p) => {
      const a = priceOf(p);
      const b = priceOf(cand);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
      return Math.abs(a - b) / Math.max(a, b) >= 0.15;
    });

  for (const cand of ranked.slice(1)) {
    if (picked.length >= limit) break;
    if (farEnough(cand)) picked.push(cand);
  }
  // Chưa đủ (dải giá quá hẹp) → bù theo thứ hạng.
  for (const cand of ranked.slice(1)) {
    if (picked.length >= limit) break;
    if (!picked.includes(cand)) picked.push(cand);
  }
  return picked;
}
