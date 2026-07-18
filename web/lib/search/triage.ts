/**
 * PHÂN LOẠI THÔNG TIN một hội thoại tư vấn — lõi tất định cho triage-agent.
 *
 * Tách bạch bốn thứ mà mọi quyết định phía sau phải phân biệt:
 *   1. CHẮC CHẮN  — điều khách đã nói, trích lại được bằng regex/lexicon từ
 *                   nguyên văn, kèm trích dẫn đúng đoạn khớp.
 *   2. DỰ ĐOÁN    — cách đọc của mô hình (candidate) mà nguyên văn KHÔNG xác
 *                   nhận. Được trưng ra cho người đọc, KHÔNG được dùng để lọc.
 *   3. THIẾU      — slot quyết định chưa có ở cả hai nguồn.
 *   4. MÂU THUẪN  — khách nói HAI giá trị khác nhau cho cùng một slot
 *                   ("phòng 18m2... à nhầm, 25m2"). Không tự chọn một phía.
 *
 * Nếu chưa đủ để quyết định: chọn ĐÚNG MỘT câu hỏi có khả năng làm thay đổi
 * quyết định nhiều nhất, theo thứ tự tác động cố định:
 *   mâu thuẫn (đang không biết tin phía nào) > ngành (đổi cả không gian lựa chọn)
 *   > tiêu chí hoàn cảnh (đổi tập lọc cứng) > ngân sách (đổi tập lọc cứng).
 *
 * Thuần hàm, không LLM: cùng hội thoại + cùng candidate luôn ra cùng báo cáo.
 */

import { CATEGORIES, getCategory } from "@/lib/data/category-config";
import type { CategorySlug } from "@/lib/types";
import { formatVnd } from "@/lib/format";
import { categoryHints, extract, extractMoney } from "./extract";
import { fold } from "./normalize";

/** Một điều khách đã nói chắc chắn, kèm trích dẫn đoạn khớp (đã bỏ dấu). */
export interface FactItem {
  slot: string;
  value: string | number | readonly string[];
  quote: string;
}

/** Một dự đoán của hệ thống — nguyên văn khách không xác nhận. */
export interface PredictionItem {
  slot: string;
  value: string | number | readonly string[];
  note: string;
}

/** Khách nói nhiều giá trị khác nhau cho cùng một slot. */
export interface ConflictItem {
  slot: string;
  values: readonly (string | number)[];
  quotes: readonly string[];
}

export interface NextQuestion {
  question: string;
  targetGap: string;
  /** Vì sao đây là câu đáng hỏi nhất — căn cứ xếp hạng tác động. */
  whyImpactful: string;
}

export interface TriageReport {
  facts: FactItem[];
  predictions: PredictionItem[];
  missing: string[];
  conflicts: ConflictItem[];
  nextQuestion: NextQuestion | null;
}

/** Cách đọc của mô hình về hội thoại — luôn là ỨNG VIÊN, chưa được tin. */
export interface CandidateReading {
  category?: string | null;
  fitValue?: number | null;
  budgetVnd?: number | null;
  priorities?: readonly string[];
  /** Suy luận thêm của mô hình ("chắc là phòng ngủ vì..."), giữ nguyên làm dự đoán. */
  assumptions?: readonly string[];
}

interface Mention<T> {
  value: T;
  quote: string;
}

/**
 * fold() giữ nguyên độ dài chuỗi (NFC 1 ký tự → 1 ký tự sau bỏ dấu), nên chỉ số
 * khớp trên bản fold dùng cắt lại được NGUYÊN VĂN từ bản gốc đã NFC.
 */
function scan(original: string, folded: string, re: RegExp): Array<Mention<string>> {
  const out: Array<Mention<string>> = [];
  for (const m of folded.matchAll(re)) {
    out.push({ value: m[1] ?? m[0], quote: original.slice(m.index, m.index + m[0].length) });
  }
  return out;
}

const RE_AREA_ALL = /(\d+(?:[.,]\d+)?)\s*m\s*(?:2|²|vuong)(?![a-z0-9])/g;
const RE_PEOPLE_ALL = /(\d+)\s*(?:nguoi|nhan khau|thanh vien)\b/g;
const RE_INCH_ALL = /(\d{2,3})\s*(?:inch|"|”|inc)(?!\d)/g;
// Một "lần nhắc tiền": dạng khoảng/trần/trần-mềm/số trần + đơn vị, hoặc "9tr5".
const RE_MONEY_ALL = new RegExp(
  String.raw`(?:(?:duoi|khoang|tam|toi da|max|khong qua|it hon|tu)\s*)?` +
    String.raw`\d+(?:[.,]\d+)?(?:\s*(?:den|-|toi|~)\s*\d+(?:[.,]\d+)?)?\s*(?:trieu|tr|cu|chai)\b` +
    String.raw`|\d+\s*tr\s*\d(?![\d])` +
    String.raw`|\d[\d.,]{5,}(?:\s*(?:vnd|d|dong))?\b`,
  "g"
);

const num = (s: string) => Number(s.replace(",", "."));
const uniq = <T>(xs: readonly T[]) => [...new Set(xs)];

/** Các lần khách nhắc một giá trị số, đã chuẩn hoá — để dò mâu thuẫn. */
function numericMentions(original: string, folded: string) {
  const areas = scan(original, folded, RE_AREA_ALL)
    .map((m) => ({ ...m, value: num(m.value) }))
    .filter((m) => m.value >= 3 && m.value <= 500);
  const people = scan(original, folded, RE_PEOPLE_ALL)
    .map((m) => ({ ...m, value: num(m.value) }))
    .filter((m) => m.value >= 1 && m.value <= 20);
  const inches = scan(original, folded, RE_INCH_ALL)
    .map((m) => ({ ...m, value: num(m.value) }))
    .filter((m) => m.value >= 10 && m.value <= 120);
  // Mỗi lần nhắc tiền quy về TRẦN ngân sách của lần nhắc đó (max của khoảng).
  const budgets: Array<Mention<number>> = [];
  for (const m of folded.matchAll(RE_MONEY_ALL)) {
    const [, max] = extractMoney(m[0]);
    if (max != null) {
      budgets.push({
        value: max,
        quote: original.slice(m.index, m.index + m[0].length),
      });
    }
  }
  return { areas, people, inches, budgets };
}

/** Mọi ngành được nhắc TRỌN TỪ trong hội thoại — >1 ngành là mâu thuẫn phải hỏi. */
function categoryMentions(original: string, folded: string): Array<Mention<CategorySlug>> {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const seen = new Map<CategorySlug, Mention<CategorySlug>>();
  for (const [word, slug] of categoryHints()) {
    if (seen.has(slug)) continue;
    const m = new RegExp(String.raw`\b${escape(word)}\b`).exec(folded);
    if (m) {
      seen.set(slug, { value: slug, quote: original.slice(m.index, m.index + m[0].length) });
    }
  }
  return [...seen.values()];
}

const QUESTIONS: Record<string, string> = {
  nganh_hang: "Anh/chị đang quan tâm nhóm sản phẩm nào ạ?",
  ngan_sach: "Anh/chị dự tính ngân sách khoảng bao nhiêu để em lọc đúng tầm giá ạ?",
};

function fitSlotOf(cfg: ReturnType<typeof getCategory>): string | null {
  switch (cfg?.fit?.unit) {
    case "m²":
      return "dien_tich_m2";
    case "người":
      return "so_nguoi";
    case "inch":
      return "kich_co_inch";
    default:
      return null;
  }
}

function conflictQuestion(c: ConflictItem): NextQuestion {
  const fmt = (v: string | number) =>
    c.slot === "ngan_sach" && typeof v === "number" ? formatVnd(v) : String(v);
  const values = c.values.map(fmt).join(" và ");
  let label = "hai con số";
  if (c.slot === "nganh_hang") label = "hai nhóm sản phẩm";
  else if (c.slot === "ngan_sach") label = "hai mức ngân sách";
  const question =
    c.slot === "nganh_hang"
      ? `Anh/chị vừa nhắc tới ${c.values
          .map((v) => getCategory(String(v))?.label.toLowerCase() ?? v)
          .join(" và ")} — mình đang cần tư vấn nhóm nào trước ạ?`
      : `Anh/chị vừa nhắc ${label} khác nhau (${values}) — mình chốt theo giá trị nào ạ?`;
  return {
    question,
    targetGap: `mâu thuẫn: ${c.slot}`,
    whyImpactful:
      "Hai giá trị dẫn tới hai tập sản phẩm khác nhau — chưa chốt thì mọi kết luận phía sau đều có thể sai.",
  };
}

/** Câu hỏi tác động lớn nhất theo thứ tự cố định; null = đủ để quyết định. */
function pickQuestion(
  conflicts: readonly ConflictItem[],
  missing: readonly string[],
  cfg: ReturnType<typeof getCategory>
): NextQuestion | null {
  // 1. Mâu thuẫn trước — theo đúng thứ tự tác động ngành > hoàn cảnh > ngân sách.
  const order = ["nganh_hang", "dien_tich_m2", "so_nguoi", "kich_co_inch", "ngan_sach"];
  const conflicted = [...conflicts].sort(
    (a, b) => order.indexOf(a.slot) - order.indexOf(b.slot)
  )[0];
  if (conflicted) return conflictQuestion(conflicted);

  // 2. Thiếu — ngành, rồi tiêu chí hoàn cảnh của ngành, rồi ngân sách.
  if (missing.includes("nganh_hang")) {
    return {
      question: QUESTIONS.nganh_hang,
      targetGap: "ngành hàng đang tư vấn",
      whyImpactful: "Chưa có ngành thì chưa có không gian lựa chọn nào để lọc hay xếp hạng.",
    };
  }
  const fitSlot = fitSlotOf(cfg);
  if (fitSlot && missing.includes(fitSlot) && cfg?.fit) {
    return {
      question: cfg.fit.question,
      targetGap: `tiêu chí hoàn cảnh: ${cfg.fit.slot} (${cfg.fit.unit})`,
      whyImpactful:
        "Tiêu chí hoàn cảnh là luật lọc cứng an toàn — thiếu nó thì không khẳng định được sản phẩm nào hợp.",
    };
  }
  if (missing.includes("ngan_sach")) {
    return {
      question: QUESTIONS.ngan_sach,
      targetGap: "ngân sách tối đa",
      whyImpactful: "Ngân sách là trần lọc cứng — có nó, danh sách ứng viên thay đổi trực tiếp.",
    };
  }
  return null;
}

function collectFactsAndConflicts(
  original: string,
  folded: string,
  hintCategory?: CategorySlug
): { facts: FactItem[]; conflicts: ConflictItem[] } {
  const det = extract(original, { hintCategory });
  const facts: FactItem[] = [];
  const conflicts: ConflictItem[] = [];
  const mentions = numericMentions(original, folded);
  const cats = categoryMentions(original, folded);

  // Ngành: khách bấm chip là chắc chắn; nhắc 2 ngành trong lời là mâu thuẫn.
  if (hintCategory) {
    facts.push({ slot: "nganh_hang", value: hintCategory, quote: "(khách chọn trên giao diện)" });
  } else if (cats.length === 1) {
    facts.push({ slot: "nganh_hang", value: cats[0].value, quote: cats[0].quote });
  } else if (cats.length > 1) {
    conflicts.push({
      slot: "nganh_hang",
      values: cats.map((c) => c.value),
      quotes: cats.map((c) => c.quote),
    });
  }

  // Các slot số: 1 giá trị duy nhất = chắc chắn; nhiều giá trị = mâu thuẫn.
  const numericSlots: Array<[string, Array<Mention<number>>]> = [
    ["dien_tich_m2", mentions.areas],
    ["so_nguoi", mentions.people],
    ["kich_co_inch", mentions.inches],
    ["ngan_sach", mentions.budgets],
  ];
  for (const [slot, list] of numericSlots) {
    const values = uniq(list.map((m) => m.value));
    if (values.length === 1) {
      facts.push({ slot, value: values[0], quote: list[0].quote });
    } else if (values.length > 1) {
      conflicts.push({ slot, values, quotes: list.map((m) => m.quote) });
    }
  }

  // Ưu tiên từ lexicon: trích được là chắc chắn (từ khoá nằm trong lời).
  const priorities = [
    ...det.concepts,
    ...(det.wantsEnergySaving ? ["energy"] : []),
    ...(det.wantsCheap ? ["cheap"] : []),
  ];
  if (priorities.length) {
    facts.push({ slot: "uu_tien", value: priorities, quote: "(từ khoá trong lời khách)" });
  }

  return { facts, conflicts };
}

/** Dự đoán = giá trị candidate mà nguyên văn không xác nhận. Không bao giờ thành fact. */
function collectPredictions(
  candidate: CandidateReading,
  facts: readonly FactItem[],
  conflicts: readonly ConflictItem[],
  resolvedCategory: CategorySlug | undefined,
  fitSlot: string | null
): PredictionItem[] {
  const predictions: PredictionItem[] = [];
  const fact = (slot: string) => facts.find((f) => f.slot === slot);
  const conflicted = (slot: string) => conflicts.some((c) => c.slot === slot);

  if (candidate.category && candidate.category !== resolvedCategory && !conflicted("nganh_hang")) {
    predictions.push({
      slot: "nganh_hang",
      value: candidate.category,
      note: "Mô hình đoán ngành; lời khách không nhắc tới — không dùng để lọc.",
    });
  }
  if (candidate.fitValue != null) {
    // Được xác nhận nếu BẤT KỲ slot hoàn cảnh chắc chắn nào mang đúng con số này.
    const corroborated = ["dien_tich_m2", "so_nguoi", "kich_co_inch"].some(
      (s) => fact(s)?.value === candidate.fitValue
    );
    if (!corroborated) {
      predictions.push({
        slot: fitSlot ?? "tieu_chi_hoan_canh",
        value: candidate.fitValue,
        note: "Mô hình đoán tiêu chí hoàn cảnh; nguyên văn không có số này.",
      });
    }
  }
  if (candidate.budgetVnd != null && fact("ngan_sach")?.value !== candidate.budgetVnd) {
    predictions.push({
      slot: "ngan_sach",
      value: candidate.budgetVnd,
      note: "Mô hình đoán ngân sách; nguyên văn không có số này.",
    });
  }
  for (const a of candidate.assumptions ?? []) {
    predictions.push({ slot: "suy_luan", value: a, note: "Suy luận thêm của mô hình." });
  }
  return predictions;
}

/**
 * Phân loại một hội thoại. `candidate` là cách đọc của mô hình (nếu có) — chỉ để
 * đối chiếu thành mục DỰ ĐOÁN, không bao giờ được thăng cấp thành CHẮC CHẮN.
 */
export function triage(
  userText: string,
  candidate: CandidateReading = {},
  opts: { hintCategory?: CategorySlug } = {}
): TriageReport {
  const original = userText.normalize("NFC");
  const folded = fold(original);

  const { facts, conflicts } = collectFactsAndConflicts(original, folded, opts.hintCategory);
  const fact = (slot: string) => facts.find((f) => f.slot === slot);
  const conflicted = (slot: string) => conflicts.some((c) => c.slot === slot);

  const resolvedCategory = (fact("nganh_hang")?.value as CategorySlug | undefined) ?? undefined;
  const cfg = resolvedCategory ? getCategory(resolvedCategory) : undefined;
  const fitSlot = fitSlotOf(cfg);

  const predictions = collectPredictions(candidate, facts, conflicts, resolvedCategory, fitSlot);

  // Thiếu: slot quyết định chưa chắc chắn và cũng chưa (đang) mâu thuẫn.
  const missing: string[] = [];
  if (!fact("nganh_hang") && !conflicted("nganh_hang")) missing.push("nganh_hang");
  if (fitSlot && !fact(fitSlot) && !conflicted(fitSlot)) missing.push(fitSlot);
  if (!fact("ngan_sach") && !conflicted("ngan_sach")) missing.push("ngan_sach");

  return {
    facts,
    predictions,
    missing,
    conflicts,
    nextQuestion: pickQuestion(conflicts, missing, cfg),
  };
}

/** Danh sách ngành cho câu hỏi chọn ngành (nhãn + slug). */
export function categoryChoicesForQuestion() {
  return CATEGORIES.map((c) => ({ slug: c.slug, label: c.label }));
}
