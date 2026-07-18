import registry from "@/config/categories.json";
import { PARSERS, type Parser } from "./parsers";
import type { CategorySlug, NumRange } from "@/lib/types";

/**
 * Nạp registry ngành hàng từ config/categories.json và gắn parser tương ứng.
 *
 * Đây là chỗ DUY NHẤT biết "ngành nào có field gì". Agents và UI chỉ làm việc với
 * kiểu chung (fit / highlights), nên thêm ngành mới = thêm entry JSON, không sửa logic.
 */

export type MatchMode = "covers" | "near";

export interface FitConfig {
  /** Tên slot trong Needs.fitValue — chỉ để log/nhắc, giá trị luôn nằm ở Needs.fitValue. */
  slot: string;
  unit: string;
  parser: string;
  match: MatchMode;
  tolerance?: number;
  /** Tên field THẬT trong specs, ưu tiên trái→phải. */
  fields: string[];
  /** Câu hỏi ngược khi khách chưa cung cấp. */
  question: string;
}

/**
 * `weak` = mức này KHÔNG phải điểm mạnh. Vẫn trả lời trung thực nếu khách hỏi thẳng,
 * nhưng không tự nêu ra như một ưu điểm — người bán thật không tự khai điểm yếu khi
 * khách chưa hỏi, và nhồi nó vào câu tư vấn chỉ làm loãng lý do nên mua.
 */

/** Một bậc thang số → câu đời thường. Áp dụng bậc ĐẦU TIÊN có `value <= max`. */
export interface PlainScaleStep {
  max: number;
  say: string;
  weak?: boolean;
}

/** Khớp chuỗi con (không phân biệt hoa thường) → câu đời thường. */
export interface PlainMatchRule {
  contains: string;
  say: string;
  weak?: boolean;
}

/**
 * PHRASEBOOK của một thông số: cách nói đời thường ĐÃ DUYỆT cho số liệu kỹ thuật.
 * Chỉ một trong hai dạng được dùng: `scale` (cần `reader` để đọc số) hoặc `match`.
 */
export interface PlainConfig {
  /** Tên hàm đọc số trong PLAIN_READERS (vd "minDb", "stars"). Bắt buộc khi dùng `scale`. */
  reader?: string;
  /** Ghi chú cho người bảo trì — vì sao câu được viết như vậy. */
  note?: string;
  scale?: PlainScaleStep[];
  match?: PlainMatchRule[];
}

export interface HighlightConfig {
  label: string;
  format: string;
  fields: string[];
  /** Không khai báo = giữ nguyên số liệu thô, KHÔNG ai được diễn giải ý nghĩa. */
  plain?: PlainConfig;
}

export interface CategoryConfig {
  slug: CategorySlug;
  label: string;
  emoji: string;
  sourceCategoryNames: string[];
  keywords: string[];
  banned: string[];
  fit: FitConfig | null;
  highlights: HighlightConfig[];
}

interface RawRegistry {
  version: number;
  categories: CategoryConfig[];
}

const REGISTRY = registry as unknown as RawRegistry;

export const CATEGORIES: CategoryConfig[] = REGISTRY.categories;

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function getCategory(slug: CategorySlug): CategoryConfig | undefined {
  return BY_SLUG.get(slug);
}

export function allSlugs(): CategorySlug[] {
  return CATEGORIES.map((c) => c.slug);
}

/** Lấy parser theo tên khai báo trong config. */
export function getParser(name: string): Parser {
  const p = PARSERS[name];
  if (!p) throw new Error(`Chưa có parser tên "${name}" (khai báo ở categories.json)`);
  return p;
}

/**
 * Ngành nào khớp câu khách? Chấm điểm theo từ khoá dài nhất khớp được
 * (ưu tiên cụm dài để "máy giặt" không bị "máy lạnh" cướp mất).
 */
export function detectCategory(text: string): CategorySlug | undefined {
  const t = text.toLowerCase();
  let best: { slug: CategorySlug; len: number } | undefined;
  for (const c of CATEGORIES) {
    for (const kw of c.keywords) {
      if (t.includes(kw.toLowerCase())) {
        if (!best || kw.length > best.len) best = { slug: c.slug, len: kw.length };
      }
    }
  }
  return best?.slug;
}

/** Khách có giá trị `value`, sản phẩm có khoảng `range` — có khớp không? */
export function fitMatches(
  range: NumRange | null,
  value: number,
  fit: FitConfig
): boolean {
  if (!range) return false;
  if (fit.match === "near") {
    const tol = fit.tolerance ?? 5;
    return Math.abs(range.min - value) <= tol;
  }
  // "covers": khoảng của sản phẩm bao trùm giá trị khách nêu.
  return value >= range.min && (range.max == null || value <= range.max);
}

/** {15,20} + "m²" → "15–20m²"; {7,null} → "trên 7 người"; {65,65} → "65 inch". */
export function fitToText(
  range: NumRange | null,
  unit: string
): string | null {
  if (!range) return null;
  const u = unit === "m²" ? "m²" : ` ${unit}`;
  if (range.max == null) return `trên ${range.min}${u}`;
  if (range.min === 0) return `dưới ${range.max}${u}`;
  if (range.min === range.max) return `${range.min}${u}`;
  return `${range.min}–${range.max}${u}`;
}
