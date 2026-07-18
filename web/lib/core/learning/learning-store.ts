// KHO BÀI HỌC — "nhân viên trải nghiệm rồi ghi nhớ để lần sau không mắc lại".
//
// Vòng tự cải tiến (KHÔNG train weights):
//   hội thoại thật → LLM-judge chấm → rút BÀI HỌC → ghi kho → nạp vào prompt lượt sau.
//
// Runtime CHỈ ĐỌC bài học `accepted` và nạp vào prompt (áp dụng ngay). Việc GHI bài
// học `proposed` do vòng eval/judge offline làm (Node có quyền ghi tệp), rồi người
// duyệt proposed → accepted.

export type LearningScope = "intent" | "phrase" | "policy" | "category";
export type LearningStatus = "proposed" | "accepted";

export interface Lesson {
  id: string;
  scope: LearningScope;
  /** Khách nói kiểu gì thì bài học này áp dụng. */
  trigger: string;
  /** Bot từng sai thế nào (để không lặp lại). */
  mistake: string;
  /** Rút ra: nên xử lý thế nào. */
  lesson: string;
  status: LearningStatus;
  createdAt: string;
}

interface LearningFile {
  note?: string;
  lessons: Lesson[];
}

let cache: Lesson[] | null = null;

async function loadAll(): Promise<Lesson[]> {
  if (cache) return cache;
  try {
    const mod = await import("@/data/learnings.json");
    const data = (mod.default ?? mod) as LearningFile;
    cache = Array.isArray(data.lessons) ? data.lessons : [];
  } catch {
    cache = [];
  }
  return cache;
}

/**
 * Bài học ĐÃ DUYỆT cho một phạm vi, gói thành đoạn hint để chèn vào system prompt.
 * Rỗng nếu chưa có bài học nào — prompt giữ nguyên.
 */
export async function lessonsHint(scope: LearningScope): Promise<string> {
  const lessons = (await loadAll()).filter((l) => l.status === "accepted" && l.scope === scope);
  if (lessons.length === 0) return "";
  const bullets = lessons.map((l) => `- ${l.lesson}`).join("\n");
  return `\nBÀI HỌC ĐÃ TÍCH LŨY (áp dụng nghiêm túc, đây là kinh nghiệm rút từ hội thoại trước):\n${bullets}`;
}

/** Xóa cache — dùng sau khi ghi thêm bài học trong cùng tiến trình (eval/judge). */
export function resetLearningCache(): void {
  cache = null;
}
