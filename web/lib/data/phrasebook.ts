import type { Highlight } from "@/lib/types";
import { energyStars, minIndoorNoiseDb } from "./parsers";
import type { CategoryConfig, HighlightConfig } from "./category-config";

/**
 * PHRASEBOOK — lớp "chuyển ngữ": số liệu kỹ thuật → trải nghiệm đời thường của khách.
 *
 * Vì sao cần lớp này: catalog nói "Dàn lạnh: 36/26/21 dB", khách phổ thông không biết
 * 21 dB là êm hay ồn. Đề bài chấm riêng tiêu chí "nói chuyện bình dân" (10%) và
 * "không bịa" (10%) — hai thứ kéo ngược nhau nếu để LLM tự ví von.
 *
 * Nguyên tắc:
 *   1. MỌI cách diễn giải ý nghĩa số liệu phải được khai báo trước trong categories.json.
 *      LLM không được tự nghĩ ví von mới ("êm nhất phân khúc" = nói quá = hallucination).
 *   2. Câu đời thường luôn đi KÈM số gốc, không thay thế nó. Khách không rành đọc phần
 *      chữ, khách rành liếc số trong ngoặc — không phải đoán khách thuộc nhóm nào.
 *      Số gốc kiêm luôn vai trò trích dẫn nguồn (đề bài yêu cầu "log nguồn dữ liệu").
 *   3. Thông số chưa khai báo `plain` → nêu nguyên số, không diễn giải. Im lặng an toàn
 *      hơn đoán bừa.
 *
 * Cùng file khai báo này còn phục vụ chiều ngược lại (câu khách → field kỹ thuật) qua
 * `keywords` của ngành, nên hai đầu pipeline dùng chung một nguồn sự thật.
 */

/** Đọc con số so ngưỡng từ chuỗi thô. Tên hàm chính là `reader` khai báo trong config. */
export type PlainReader = (raw: string) => number | null;

const PLAIN_READERS: Record<string, PlainReader> = {
  stars: energyStars,
  minDb: minIndoorNoiseDb,
};

export interface PlainFact {
  label: string;
  /** Nguyên văn từ catalog — nguồn trích dẫn, không bao giờ bị mất. */
  raw: string;
  /** Bản rút gọn hiển thị (vd "21 dB", "5★"). */
  short: string;
  /** Cách nói đời thường đã duyệt. null = chưa khai báo → cấm diễn giải. */
  plain: string | null;
  /** Mức này không phải điểm mạnh — trả lời nếu khách hỏi, không tự nêu. */
  weak: boolean;
}

/** Tra câu đời thường cho một thông số. Trả null khi chưa khai báo hoặc không đọc được số. */
export function plainOf(
  hl: Highlight,
  cfg: HighlightConfig | undefined
): { say: string; weak: boolean } | null {
  const spec = cfg?.plain;
  const raw = hl.title?.trim();
  if (!spec || !raw) return null;

  if (spec.match) {
    const hay = raw.toLowerCase();
    for (const rule of spec.match) {
      if (hay.includes(rule.contains.toLowerCase())) {
        return { say: rule.say, weak: rule.weak === true };
      }
    }
    return null;
  }

  if (spec.scale) {
    if (!spec.reader) {
      throw new Error(`Phrasebook "${cfg!.label}" dùng scale nhưng thiếu "reader"`);
    }
    const read = PLAIN_READERS[spec.reader];
    if (!read) {
      throw new Error(`Chưa có reader "${spec.reader}" (khai báo ở categories.json)`);
    }
    const value = read(raw);
    if (value == null) return null; // Dữ liệu kiểu "Không có" → im lặng, không suy diễn.
    for (const step of spec.scale) {
      if (value <= step.max) return { say: step.say, weak: step.weak === true };
    }
  }
  return null;
}

/** Dựng danh sách sự thật đã chuyển ngữ cho một sản phẩm. */
export function plainFacts(
  highlights: Highlight[],
  cfg: CategoryConfig
): PlainFact[] {
  const byLabel = new Map(cfg.highlights.map((h) => [h.label, h]));
  return highlights.map((h) => {
    const p = plainOf(h, byLabel.get(h.label));
    return {
      label: h.label,
      raw: h.title,
      short: h.text,
      plain: p?.say ?? null,
      weak: p?.weak ?? false,
    };
  });
}

/** Những ý ĐƯỢC PHÉP chủ động nêu khi tư vấn (đã loại điểm yếu). */
export function sellingFacts(
  highlights: Highlight[],
  cfg: CategoryConfig
): PlainFact[] {
  return plainFacts(highlights, cfg).filter((f) => f.plain && !f.weak);
}
