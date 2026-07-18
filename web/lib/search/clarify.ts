/**
 * Tầng hỏi ngược — port từ dmx_search/clarify.py, KHÔNG thuộc về search.
 *
 * Ranh giới trách nhiệm:
 *
 *     câu khách ──extract──► Need ──[AGENT làm rõ]──► Need đủ ──search──► Results
 *
 *   - extract : chỉ trích, không phán xét đủ/thiếu.
 *   - clarify : (module NÀY) soi Need → có đủ TÍN HIỆU để search chưa.
 *               Luật: có ÍT NHẤT 1 trong {ngành, ngân sách, hãng, fit} là đủ.
 *   - search  : nhận Need có tín hiệu, tự loại sản phẩm không sinh được lý do.
 *
 * `search.ts` không bao giờ import module này, và ngược lại.
 */

import { getCategory } from "@/lib/data/category-config";
import type { Need } from "./extract";

export type Signal = "category" | "budget" | "brand" | "fit";

/** Giá trị fit khách đã nêu, theo ĐƠN VỊ của ngành đang hỏi (m²/người/inch). */
export function fitValueOf(need: Need): number | null {
  const cfg = need.category ? getCategory(need.category) : undefined;
  switch (cfg?.fit?.unit) {
    case "m²":
      return need.areaM2;
    case "người":
      return need.people;
    case "inch":
      return need.inches;
    default:
      return need.areaM2 ?? need.people ?? need.inches;
  }
}

/** Các TÍN HIỆU tìm kiếm khách đã cung cấp. Rỗng = chưa nói gì để tìm. */
export function signals(need: Need): Signal[] {
  const out: Signal[] = [];
  if (need.category != null) out.push("category");
  if (need.budgetMax != null || need.budgetMin != null) out.push("budget");
  if (need.brands.length) out.push("brand");
  if (need.areaM2 != null || need.people != null || need.inches != null) out.push("fit");
  return out;
}

/** Đủ để giao cho search chưa: chỉ cần CÓ ÍT NHẤT 1 tín hiệu. */
export function isReady(need: Need): boolean {
  return signals(need).length > 0;
}

/** Điều kiện BẮT BUỘC còn thiếu — chỉ chặn khi Need RỖNG HOÀN TOÀN. */
export function missingRequired(need: Need): string[] {
  return isReady(need) ? [] : ["tiêu chí tìm kiếm"];
}

/**
 * Slot NÊN hỏi thêm để tư vấn sát hơn (khi đã có tín hiệu để search):
 * ngành → tiêu chí hoàn cảnh của ngành (config khai báo) → ngân sách.
 */
export function recommendedToAsk(need: Need): string[] {
  if (!isReady(need)) return [];
  const out: string[] = [];
  if (need.category == null) {
    out.push("category");
  } else {
    const cfg = getCategory(need.category);
    if (cfg?.fit && fitValueOf(need) == null) out.push(cfg.fit.slot);
  }
  if (need.budgetMax == null) out.push("budget_max");
  return out;
}
