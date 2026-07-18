// LLM-JUDGE — "quản lý đào tạo telesale khó tính" tự chấm hội thoại và RÚT BÀI HỌC.
//
// Đây là mắt xích "Phân tích → Đánh giá" trong vòng tự cải tiến: sau khi bot chạy
// một kịch bản, judge chấm điểm + chỉ lỗi + đề xuất bài học (proposed) để nạp vào
// kho. KHÔNG train weights — học bằng cách tích lũy bài học rồi áp dụng ở prompt.

import { generateText } from "ai";
import { getModel } from "@/lib/llm";
import type { LearningScope } from "../learning/learning-store";

export interface ProposedLesson {
  scope: LearningScope;
  trigger: string;
  mistake: string;
  lesson: string;
}

export interface JudgeVerdict {
  score: number; // 0–10, -1 nếu judge lỗi
  issues: string[];
  lessons: ProposedLesson[];
}

const VALID_SCOPES = new Set<LearningScope>(["intent", "phrase", "policy", "category"]);

const JUDGE_SYSTEM = [
  "Bạn là QUẢN LÝ ĐÀO TẠO telesale điện máy KHÓ TÍNH, chấm hội thoại tư vấn của nhân viên AI.",
  "Ngành ĐANG HỖ TRỢ tư vấn sản phẩm: máy lạnh, tủ lạnh, máy giặt, tivi, điện thoại, laptop — tư vấn các ngành này là ĐÚNG, không phải lỗi. Ngành NGOÀI danh sách (quạt, loa, máy lọc…) thì phải từ chối khéo.",
  "TIÊU CHÍ (telesale chuyên nghiệp): (1) hiểu đúng ý khách kể cả viết tắt/không dấu; (2) gọn, mỗi lượt tiến 1 bước, KHÔNG lặp câu/lời chào; (3) KHÔNG hỏi lại điều đã biết; (4) KHÔNG bịa thông số/giá/ngành ngoài dữ liệu; (5) đúng ngành khách muốn (không âm thầm đổi ngành); (6) câu hỏi chính sách phải được trả lời từ tài liệu, không lảng sang hỏi mua; (7) thân thiện nhưng không lố (emoji hạn chế).",
  "Trả về DUY NHẤT một object JSON, không markdown:",
  '{"score": số 0-10, "issues": ["lỗi cụ thể ở lượt nào"], "lessons": [{"scope": "intent"|"phrase"|"policy"|"category", "trigger": "khách nói kiểu gì", "mistake": "bot sai thế nào", "lesson": "rút ra nên xử thế nào"}]}',
  "issues: liệt kê thẳng thắn từng chỗ chưa ổn. lessons: CHỈ nêu bài học cho lỗi THẬT SỰ có (không bịa bài học nếu hội thoại đã ổn — để mảng rỗng).",
].join(" ");

function parseJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(cleaned.slice(s, e + 1));
  } catch {
    return null;
  }
}

export async function judgeConversation(
  name: string,
  transcript: { user: string; bot: string }[]
): Promise<JudgeVerdict> {
  const convo = transcript
    .map((t, i) => `Lượt ${i + 1}\nKHÁCH: ${t.user}\nBOT: ${t.bot}`)
    .join("\n\n");
  try {
    const { text } = await generateText({
      model: getModel(),
      system: JUDGE_SYSTEM,
      prompt: `Kịch bản: "${name}"\n\nHỘI THOẠI:\n${convo}\n\nChấm điểm và rút bài học theo đúng JSON quy định.`,
    });
    const o = parseJson(text) as {
      score?: unknown;
      issues?: unknown;
      lessons?: unknown;
    } | null;
    if (!o) return { score: -1, issues: ["judge: không parse được JSON"], lessons: [] };

    const score = typeof o.score === "number" ? o.score : -1;
    const issues = Array.isArray(o.issues) ? o.issues.filter((x) => typeof x === "string") : [];
    const lessons: ProposedLesson[] = Array.isArray(o.lessons)
      ? o.lessons
          .filter(
            (l: unknown): l is ProposedLesson =>
              !!l &&
              typeof l === "object" &&
              VALID_SCOPES.has((l as ProposedLesson).scope) &&
              typeof (l as ProposedLesson).lesson === "string"
          )
          .map((l) => ({
            scope: l.scope,
            trigger: String(l.trigger ?? ""),
            mistake: String(l.mistake ?? ""),
            lesson: String(l.lesson ?? ""),
          }))
      : [];
    return { score, issues, lessons };
  } catch (e) {
    return { score: -1, issues: [`judge lỗi: ${(e as Error).message}`], lessons: [] };
  }
}
