/**
 * Trích nhu cầu có cấu trúc từ câu nói tự nhiên của khách — port từ dmx_search/extract.py.
 *
 * Chạy thuần regex + lexicon, không gọi LLM: tất định để cùng câu nói luôn ra
 * cùng Need (yêu cầu tái lập của #26). Xử lý được: không dấu, viết tắt tiền tệ
 * ("20 củ", "20tr", "9tr5"), diện tích ("18m2"), số người, hãng, concept tiện ích.
 */

import { CATEGORIES } from "@/lib/data/category-config";
import type { CategorySlug } from "@/lib/types";
import { QUERY_LEXICON, ROOM_LEXICON } from "./concepts";
import { fold } from "./normalize";

/** Nhu cầu đã trích. null = khách chưa nói → đây là thứ cần hỏi ngược. */
export interface Need {
  category: CategorySlug | null;
  budgetMax: number | null;
  budgetMin: number | null;
  areaM2: number | null;
  people: number | null;
  /** Kích cỡ màn hình (inch) — tivi/laptop. */
  inches: number | null;
  room: string | null;
  brands: string[];
  /** quiet, sleep, wifi... */
  concepts: string[];
  wantsEnergySaving: boolean;
  wantsCheap: boolean;
  rawText: string;
}

// --- Tiền: "20 triệu", "20tr", "20 củ", "20 chai", "15,5 triệu", "9tr5" ---
const MONEY_UNIT = String.raw`(?:trieu|tr|cu|chai|m)\b`;
const RE_MONEY_RANGE = new RegExp(
  String.raw`(?:tu\s*)?(\d+(?:[.,]\d+)?)\s*(?:den|-|toi|~)\s*(\d+(?:[.,]\d+)?)\s*` + MONEY_UNIT
);
const RE_MONEY_UNDER = new RegExp(
  String.raw`(?:duoi|khoang|tam|toi da|max|<=?|khong qua|it hon)\s*(\d+(?:[.,]\d+)?)\s*` + MONEY_UNIT
);
// "9tr5" = 9.5 triệu (văn nói rất phổ biến)
const RE_MONEY_SPLIT = /(\d+)\s*tr\s*(\d)\b/;
const RE_MONEY_BARE = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*` + MONEY_UNIT);
const RE_MONEY_VND = /(\d[\d.,]{5,})\s*(?:vnd|d|dong)?\b/;

// Không dùng \b sau đơn vị: "²" không phải ký tự word trong JS nên \b không khớp.
// Nhận cả cách viết đầy đủ "mét vuông"/"met vuong" (đã fold) lẫn "m2", "m²", "m vuong".
const RE_AREA = /(\d+(?:[.,]\d+)?)\s*m(?:et)?\s*(?:2|²|vuong)(?![a-z0-9])/;
const RE_PEOPLE = /(\d+)\s*(?:nguoi|nhan khau|thanh vien)\b/;
const RE_FAMILY = /gia dinh\s*(\d+)/;
const RE_INCH = /(\d{2,3})\s*(?:inch|"|”|inc)(?!\d)/;

function num(s: string): number {
  return Number(s.replace(",", "."));
}

const toVnd = (v: number) => v * 1_000_000;

/** → [min, max] VND. null nếu khách chưa nói giá. Chạy trên text ĐÃ fold. */
export function extractMoney(f: string): [number | null, number | null] {
  let m = f.match(RE_MONEY_RANGE);
  if (m) return [toVnd(num(m[1])), toVnd(num(m[2]))];
  m = f.match(RE_MONEY_UNDER);
  if (m) return [null, toVnd(num(m[1]))];
  m = f.match(RE_MONEY_SPLIT); // "9tr5" → 9.5tr
  if (m) return [null, toVnd(Number(`${m[1]}.${m[2]}`))];
  m = f.match(RE_MONEY_BARE);
  if (m) return [null, toVnd(num(m[1]))];
  m = f.match(RE_MONEY_VND); // "15000000"
  if (m) {
    const v = Number(m[1].replace(/[.,]/g, ""));
    if (v >= 100_000) return [null, v];
  }
  return [null, null];
}

/** Hint nhận diện ngành: từ khoá trong config (đã fold), dò cụm DÀI trước. */
export function categoryHints(): Array<[string, CategorySlug]> {
  const out: Array<[string, CategorySlug]> = [];
  for (const c of CATEGORIES) {
    for (const kw of c.keywords) out.push([fold(kw), c.slug]);
    out.push([fold(c.label), c.slug]);
  }
  return out.sort((a, b) => b[0].length - a[0].length);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (f: string, w: string) =>
  new RegExp(String.raw`\b${escapeRe(w)}\b`).test(f);

/**
 * Khớp MỜ theo từ khi không hint nào khớp nguyên chuỗi: trùng ≥2 từ VÀ phủ
 * ≥75% số từ của hint. Dưới ngưỡng thì thà null để agent hỏi lại còn hơn đoán bừa.
 */
function fuzzyCategory(f: string, hints: Array<[string, CategorySlug]>): CategorySlug | null {
  const qtokens = new Set(f.split(/\s+/));
  let best: CategorySlug | null = null;
  let bestKey: [number, number] = [0, 0];
  for (const [w, cat] of hints) {
    const wt = w.replace(/,/g, " ").split(/\s+/).filter(Boolean);
    if (wt.length < 2) continue;
    const common = wt.filter((t) => qtokens.has(t)).length;
    if (common < 2) continue;
    const key: [number, number] = [common / wt.length, wt.length];
    if (key[0] >= 0.75 && (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1]))) {
      best = cat;
      bestKey = key;
    }
  }
  return best;
}

/** Câu khách → Need. `knownBrands` lấy từ catalog thật của ngành. */
export function extract(
  text: string,
  opts: { hintCategory?: CategorySlug; knownBrands?: string[] } = {}
): Need {
  const f = fold(text);
  const n: Need = {
    category: null,
    budgetMax: null,
    budgetMin: null,
    areaM2: null,
    people: null,
    inches: null,
    room: null,
    brands: [],
    concepts: [],
    wantsEnergySaving: false,
    wantsCheap: false,
    rawText: text,
  };

  [n.budgetMin, n.budgetMax] = extractMoney(f);

  let m = f.match(RE_AREA);
  if (m) {
    const a = num(m[1]);
    // Ngưỡng CHỈ chặn số rác, không phải chính sách ngành: "kho 1000m2" là câu nói
    // thật và phải được HIỂU — chuyện không có máy nào phù hợp do luật lọc quyết
    // (và luật gợi-ý-gần-nhất trả lời), không phải do vứt số ngay từ tầng trích.
    if (a >= 3 && a <= 2000) n.areaM2 = a;
  }

  m = f.match(RE_PEOPLE) ?? f.match(RE_FAMILY);
  if (m) {
    const p = Number(m[1]);
    if (p >= 1 && p <= 20) n.people = p;
  }

  m = f.match(RE_INCH);
  if (m) {
    const v = Number(m[1]);
    if (v >= 10 && v <= 120) n.inches = v;
  }

  // Ngành: hint của UI (khách bấm chip) thắng; sau đó dò cụm dài trước,
  // khớp trọn từ (\b) để "loa" không dính trong "phao".
  const hints = categoryHints();
  if (opts.hintCategory) {
    n.category = opts.hintCategory;
  } else {
    for (const [w, cat] of hints) {
      if (hasWord(f, w)) {
        n.category = cat;
        break;
      }
    }
    if (n.category == null) n.category = fuzzyCategory(f, hints);
  }

  for (const b of opts.knownBrands ?? []) {
    // Chặn khớp nhầm chuỗi con: "lg" không được khớp trong "lgi".
    if (hasWord(f, fold(b)) && !n.brands.includes(b)) n.brands.push(b);
  }

  for (const [room, words] of Object.entries(ROOM_LEXICON)) {
    // Bắt buộc khớp trọn từ: "ngu" KHÔNG được khớp trong "nguoi".
    if (words.some((w) => hasWord(f, w))) {
      n.room = room;
      break;
    }
  }

  for (const [key, words] of Object.entries(QUERY_LEXICON)) {
    if (!words.some((w) => hasWord(f, w))) continue;
    if (key === "_energy") n.wantsEnergySaving = true;
    else if (key === "_cheap") n.wantsCheap = true;
    else if (key === "_premium") continue;
    else n.concepts.push(key);
  }

  return n;
}
