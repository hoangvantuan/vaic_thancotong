import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import type { Needs } from "@/lib/types";
import { detectCategory, getCategory } from "@/lib/data/category-config";

/**
 * SUB-AGENT: ĐÀO / TÌM NHU CẦU (đa ngành).
 *
 * Trích { category, fitValue, budgetVnd, priorities } từ lời khách + lịch sử chat.
 *   1) Heuristic regex — LUÔN chạy, không cần LLM (app vẫn dùng được khi chưa cắm mô hình).
 *   2) LLM (tuỳ chọn) — chỉ gọi khi còn slot thiếu, để vét thêm.
 * Số liệu ưu tiên heuristic để tránh LLM bịa số.
 */

const BRANDS = [
  "Daikin", "Panasonic", "LG", "Samsung", "Toshiba", "Mitsubishi", "Haier",
  "Casper", "Aqua", "Midea", "Gree", "Sharp", "Xiaomi", "TCL", "Funiki",
  "Nagakawa", "Electrolux", "Hitachi", "Sony", "Apple", "Asus", "Acer",
  "Dell", "HP", "Lenovo", "MSI", "Oppo", "Vivo", "Realme", "Nokia", "Hisense",
];

/**
 * Trích tiêu chí số theo ĐƠN VỊ của ngành (config quyết định đơn vị, không hardcode ngành).
 * Lưu ý: không dùng \b sau đơn vị vì "m²"/"inch" kết thúc bằng ký tự không phải word,
 * khiến \b không bao giờ khớp với "18m²".
 */
function parseFitValue(text: string, unit: string): number | undefined {
  let m: RegExpMatchArray | null = null;
  if (unit === "m²") {
    m = text.match(/(\d{1,3})\s*(?:m²|m2|m\^2|mét vuông|met vuong)(?!\d)/iu);
  } else if (unit === "người") {
    m =
      text.match(/(\d{1,2})\s*người/iu) ??
      text.match(/(?:gia đình|nhà|hộ)\s*(?:có\s*)?(\d{1,2})/iu);
  } else if (unit === "inch") {
    m = text.match(/(\d{2,3})\s*(?:inch|"|”|inc)(?!\d)/iu);
  }
  if (!m) return undefined;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/** "dưới 15 triệu" / "12,5tr" / "10-15 triệu" / "15.000.000" → VND. */
function parseBudget(text: string): number | undefined {
  const num = (s: string) => Number(s.replace(",", "."));

  const range = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:-|–|đến|tới)\s*(\d+(?:[.,]\d+)?)\s*(?:triệu|tr)\b/iu
  );
  if (range) return Math.round(num(range[2]) * 1_000_000);

  const single = text.match(/(\d+(?:[.,]\d+)?)\s*(?:triệu|tr)\b/iu);
  if (single) return Math.round(num(single[1]) * 1_000_000);

  const dotted = text.match(/(\d{1,3}(?:[.\s]\d{3}){2,})/u);
  if (dotted) {
    const v = Number(dotted[1].replace(/[.\s]/g, ""));
    if (v >= 1_000_000) return v;
  }
  return undefined;
}

function parsePriorities(text: string): string[] {
  const t = text.toLowerCase();
  const out = new Set<string>();
  if (/ít ồn|êm|yên tĩnh|không ồn|độ ồn thấp|im lặng/u.test(t)) out.add("quiet");
  if (/tiết kiệm điện|tiết kiệm|inverter|ít tốn điện|ít hao điện/u.test(t))
    out.add("energy");
  if (/giá rẻ|giá tốt|rẻ|bình dân|tiết kiệm chi phí/u.test(t)) out.add("cheap");
  for (const b of BRANDS) if (t.includes(b.toLowerCase())) out.add(`brand:${b}`);
  return [...out];
}

/** Tầng 1: heuristic thuần, không cần LLM. */
export function extractNeedsHeuristic(text: string, hintCategory?: string): Needs {
  const needs: Needs = {};

  const category = hintCategory ?? detectCategory(text);
  if (category) needs.category = category;

  const cfg = category ? getCategory(category) : undefined;
  if (cfg?.fit) {
    const v = parseFitValue(text, cfg.fit.unit);
    if (v != null) needs.fitValue = v;
  }

  const budget = parseBudget(text);
  if (budget != null) needs.budgetVnd = budget;

  const pr = parsePriorities(text);
  if (pr.length) needs.priorities = pr;

  return needs;
}

const NeedsSchema = z.object({
  fitValue: z
    .number()
    .nullable()
    .describe("Con số hoàn cảnh khách nêu (diện tích m², số người, hoặc inch); null nếu không có"),
  budgetVnd: z
    .number()
    .nullable()
    .describe("Ngân sách tối đa quy ra VND (15 triệu = 15000000); null nếu không có"),
  priorities: z
    .array(z.string())
    .describe('Ưu tiên: "quiet", "energy", "cheap", hoặc "brand:<Hãng>"'),
});

/** Trích nhu cầu. Không có model → chỉ heuristic. */
export async function extractNeeds(
  text: string,
  opts?: { model?: LanguageModel | null; hintCategory?: string }
): Promise<Needs> {
  const base = extractNeedsHeuristic(text, opts?.hintCategory);
  const model = opts?.model;
  const cfg = base.category ? getCategory(base.category) : undefined;

  const needFit = cfg?.fit != null && base.fitValue == null;
  const complete = !needFit && base.budgetVnd != null;
  if (!model || !base.category || complete) return base;

  try {
    const { object } = await generateObject({
      model,
      schema: NeedsSchema,
      prompt:
        `Bạn là trợ lý tư vấn ${cfg?.label ?? "sản phẩm"} của Điện Máy Xanh. ` +
        `Trích nhu cầu từ tin nhắn khách (chỉ lấy điều khách nói rõ, không suy diễn)` +
        (cfg?.fit ? `. Con số hoàn cảnh cần lấy có đơn vị "${cfg.fit.unit}"` : "") +
        `. Tin nhắn:\n\n${text}`,
    });
    const merged: Needs = {
      category: base.category,
      fitValue: base.fitValue ?? object.fitValue ?? undefined,
      budgetVnd: base.budgetVnd ?? object.budgetVnd ?? undefined,
      priorities: [
        ...new Set([...(base.priorities ?? []), ...(object.priorities ?? [])]),
      ],
    };
    if (merged.priorities?.length === 0) delete merged.priorities;
    return merged;
  } catch {
    return base;
  }
}
