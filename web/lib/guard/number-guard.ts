/**
 * CHỐT CHẶN CUỐI — mọi con số trong câu LLM viết ra phải truy về được ngữ liệu đã cấp.
 *
 * Vì sao cần: prompt đã cấm bịa, nhưng cấm bằng lời không kiểm chứng được. 74–87% sản phẩm
 * trong catalog thiếu giá, nên áp lực "điền cho câu văn mượt" là có thật — và giá bịa là
 * loại sai nguy hiểm nhất với một nhà bán lẻ. Đây là chỗ biến "chống bịa" từ lời hứa
 * thành thứ chạy được và demo được tại chỗ.
 *
 * Cách làm: so tập số trong câu trả lời với tập số trong ngữ liệu (system prompt — vốn đã
 * chứa toàn bộ thông tin sản phẩm và nhu cầu khách). Có số lạ → câu trả lời không đạt.
 */

export interface NumberGuardResult {
  ok: boolean;
  /** Các con số xuất hiện trong câu trả lời mà ngữ liệu không hề có. */
  offenders: string[];
}

/**
 * Số nhỏ dùng để đếm/xếp thứ tự trong văn nói ("3 lựa chọn", "cách 2") — không phải
 * khẳng định về sản phẩm nên không tính là bịa.
 */
const COUNTING_NUMBERS = new Set(["1", "2", "3", "4", "5"]);

/**
 * Đưa một token số về dạng so sánh được:
 *   "12.490.000₫" → "12490000"   (bỏ dấu phân cách nghìn)
 *   "2.5 HP"      → "2.5"        (giữ dấu thập phân)
 *   "5.20"        → "5.2"        (bỏ số 0 thừa)
 */
function canon(token: string): string | null {
  let s = token.replace(/[^\d.,]/g, "");
  // Dấu . hoặc , đứng ngay trước đúng 3 chữ số là phân cách nghìn → bỏ.
  s = s.replace(/[.,](?=\d{3}(?:\D|$))/g, "");
  s = s.replace(",", ".").replace(/\.$/, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : null;
}

function numbersIn(text: string): string[] {
  const tokens = text.match(/\d[\d.,]*/g) ?? [];
  return tokens.map(canon).filter((v): v is string => v != null);
}

/**
 * @param answer  câu trả lời LLM vừa sinh
 * @param source  ngữ liệu đã cấp cho LLM (system prompt)
 */
export function checkNumbers(answer: string, source: string): NumberGuardResult {
  const allowed = new Set(numbersIn(source));
  const offenders = [...new Set(numbersIn(answer))].filter(
    (n) => !allowed.has(n) && !COUNTING_NUMBERS.has(n)
  );
  return { ok: offenders.length === 0, offenders };
}
