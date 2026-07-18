// ĐIỂM KẾT NỐI 2/3 — dịch vụ mô hình THẬT (#27).
//
// Nối tầng hiểu-câu (LLM + bộ trích xuất tất định của nhánh search) vào cổng năng lực
// `ModelService`, để đường phục vụ `/api/turn` hiểu được lời khách nói tự nhiên MÀ VẪN
// giữ nguyên grounding: lọc cứng → xếp hạng → cổng công bố → bản ghi quyết định.
//
// RANH GIỚI VAI TRÒ (CONTEXT.md — "Cổng năng lực mô hình"): mô hình CHỈ trích xuất và
// diễn đạt. Nó KHÔNG chọn sản phẩm, KHÔNG quyết định hợp lệ, KHÔNG biến dữ liệu chưa
// xác minh thành sự thật. Việc chọn do bộ luật #26 trên dữ liệu #25 quyết định.
//
// HAI TẦNG, đóng an toàn:
//   1. Tất định (`lib/search/extract`) — luôn chạy, hiểu "20 củ", "9tr5", "20 mét vuông"…
//   2. LLM — chỉ LẤP CHỖ TRỐNG tầng 1 còn thiếu. Lỗi/không có LLM → dùng tầng 1.
// Nhờ vậy "không có LLM → app vẫn chạy", đúng yêu cầu đề bài.

import { generateText } from "ai";
import { z } from "zod";
import { getModel, probeLLM } from "@/lib/llm";
import { extract, type Need } from "@/lib/search/extract";
import { ok, type Result } from "../contracts/status";
import type { ExtractedNeeds, ModelService } from "../ports/model-service";
import type { SourcedProduct } from "../ports/product-source";

const EXTRACT_SYSTEM = [
  "Bạn là bộ TRÍCH XUẤT nhu cầu mua hàng tiếng Việt.",
  "CHỈ trích xuất điều khách đã nói. TUYỆT ĐỐI không suy đoán, không gợi ý sản phẩm,",
  "không chọn hộ. Không biết thì trả null.",
  "Đơn vị tiền nói kiểu Việt: 'triệu', 'tr', 'củ', 'chai' = 1.000.000; '9tr5' = 9.500.000.",
  "budgetVndMax là TRẦN ngân sách (số VND đầy đủ).",
  "areaM2 là diện tích phòng theo m².",
  "priorities chỉ chọn trong: quiet (êm/ít ồn), energy (tiết kiệm điện), cheap (giá rẻ).",
].join(" ");

const CATEGORY_SLUGS: readonly string[] = [
  "may_lanh",
  "tu_lanh",
  "may_giat",
  "tivi",
  "dien_thoai",
  "laptop",
];
const ALLOWED_PRIORITIES = new Set(["quiet", "energy", "cheap"]);

/**
 * Lược đồ CỐ TÌNH lỏng: mô hình chạy tại chỗ hay trả thừa/thiếu trường. Ta nhận rộng
 * rồi tự lọc về vốn từ hợp lệ, thay vì vứt cả kết quả chỉ vì một nhãn lạ.
 */
const ExtractSchema = z.object({
  category: z.string().nullish(),
  areaM2: z.number().nullish(),
  budgetVndMax: z.number().nullish(),
  priorities: z.array(z.string()).nullish(),
});

/**
 * Bóc JSON từ câu trả lời tự do (nhiều endpoint OpenAI-compatible KHÔNG hỗ trợ
 * structured output, nên không dùng `generateObject`). Gỡ rào ```json rồi lấy khối
 * { … } đầu–cuối. Không parse được thì trả null để nơi gọi dùng tầng tất định.
 */
function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Need (tầng tất định) → ExtractedNeeds (hợp đồng cổng mô hình). */
function toExtracted(n: Need): ExtractedNeeds {
  const priorities: string[] = [...n.concepts];
  if (n.wantsEnergySaving) priorities.push("energy");
  if (n.wantsCheap) priorities.push("cheap");
  for (const b of n.brands) priorities.push(`brand:${b}`);

  const quotedSpans: string[] = [];
  if (n.areaM2 != null) quotedSpans.push(`${n.areaM2}m²`);
  if (n.budgetMax != null) quotedSpans.push(`${(n.budgetMax / 1_000_000).toLocaleString("vi-VN")} triệu`);
  if (n.people != null) quotedSpans.push(`${n.people} người`);
  if (n.room) quotedSpans.push(n.room);

  return {
    // Tiêu chí số theo ngành: máy lạnh = m², tủ lạnh/máy giặt = người, tivi/laptop = inch.
    category: n.category,
    fitValue: n.areaM2 ?? n.people ?? n.inches,
    budgetVnd: n.budgetMax,
    priorities: [...new Set(priorities)],
    quotedSpans,
  };
}

export class LlmModelService implements ModelService {
  readonly name = "llm@openai-compatible";

  private ready: boolean | null = null;

  async isReady(): Promise<boolean> {
    if (this.ready === null) this.ready = await probeLLM();
    return this.ready;
  }

  /**
   * Trích nhu cầu. Tầng tất định chạy trước và ĐƯỢC ƯU TIÊN (số nó bắt được là số
   * khách thật sự gõ); LLM chỉ điền vào ô còn null và bổ sung ưu tiên.
   */
  async extractNeeds(userText: string): Promise<Result<ExtractedNeeds>> {
    const base = toExtracted(extract(userText));

    if (!(await this.isReady())) return ok(base);

    try {
      const { text } = await generateText({
        model: getModel(),
        system: EXTRACT_SYSTEM,
        prompt:
          `Câu khách: "${userText}"\n\n` +
          "Trả về DUY NHẤT một object JSON, không giải thích, không markdown:\n" +
          '{"category": slug hoặc null, "areaM2": số hoặc null, ' +
          '"budgetVndMax": số hoặc null, "priorities": ["quiet"|"energy"|"cheap"]}',
      });

      const parsed = ExtractSchema.safeParse(parseJsonLoose(text));
      if (!parsed.success) return ok(base);
      const o = parsed.data;

      const category =
        o.category && CATEGORY_SLUGS.includes(o.category) ? o.category : null;
      const llmPriorities = (o.priorities ?? []).filter((p) => ALLOWED_PRIORITIES.has(p));

      // Tầng tất định được ƯU TIÊN: số nó bắt được là số khách thật sự gõ.
      return ok({
        category: base.category ?? category,
        fitValue: base.fitValue ?? o.areaM2 ?? null,
        budgetVnd: base.budgetVnd ?? o.budgetVndMax ?? null,
        priorities: [...new Set([...base.priorities, ...llmPriorities])],
        quotedSpans: base.quotedSpans,
      });
    } catch {
      // Mô hình hỏng/không trả được → giữ kết quả tất định, không chặn lượt.
      return ok(base);
    }
  }

  /**
   * Diễn đạt MỘT câu hỏi làm rõ. Không có LLM/lỗi → trả RỖNG để pipeline dùng câu
   * tất định của luật (câu ấy đã đúng và đủ — vd đã liệt kê sẵn ngành hàng thật);
   * tự chế câu từ `gap` ở đây sẽ đè mất câu của luật vì nơi gọi chỉ rơi về khi rỗng.
   */
  async phraseQuestion(gap: string, context: string): Promise<Result<string>> {
    const fallback = "";
    if (!(await this.isReady())) return ok(fallback);
    try {
      const { text } = await generateText({
        model: getModel(),
        system: [
          "Bạn là tư vấn viên điện máy người Việt, thân thiện; xưng 'em', gọi khách 'anh/chị'.",
          "Hỏi ĐÚNG MỘT câu ngắn (dưới 30 từ) để lấy đúng thông tin còn thiếu được nêu.",
          "TUYỆT ĐỐI không hỏi lại thứ khách đã nói trong hội thoại.",
          "Nếu 'thông tin còn thiếu' có kèm danh sách lựa chọn cho phép, câu hỏi PHẢI nêu",
          "đầy đủ các lựa chọn ấy và CHỈ các lựa chọn ấy — tuyệt đối không bịa thêm",
          "nhóm hàng, ngành hàng hay lựa chọn nào ngoài danh sách.",
          "Khách hỏi bên mình có những gì thì trả lời bằng chính danh sách đó.",
          "Không nhắc tên sản phẩm cụ thể. Không chào hỏi dài.",
          "Chỉ trả về đúng câu hỏi, không thêm gì khác.",
        ].join(" "),
        prompt: `Thông tin còn thiếu: ${gap}\n\nHội thoại đã có (mỗi dòng một lượt khách nói):\n${context}`,
      });
      return ok(text.trim() || fallback);
    } catch {
      return ok(fallback);
    }
  }

  /**
   * Diễn đạt lời giải thích cho các sản phẩm ĐÃ được chọn.
   * Mô hình KHÔNG được thêm, bớt hay đổi thứ tự — cổng công bố vẫn đối chiếu lại.
   */
  async composeExplanation(
    products: readonly SourcedProduct[],
    needs: ExtractedNeeds
  ): Promise<Result<string>> {
    const names = products.map((p) => p.displayName).join(", ");
    const fallback = `Em gợi ý: ${names}.`;
    if (!(await this.isReady())) return ok(fallback);
    try {
      const { text } = await generateText({
        model: getModel(),
        system:
          "Bạn là tư vấn viên điện máy người Việt. Diễn đạt lại NGẮN GỌN danh sách đã cho. " +
          "TUYỆT ĐỐI không thêm, bớt, đổi thứ tự sản phẩm; không bịa thông số hay giá.",
        prompt: `Danh sách đã chốt: ${names}\nNhu cầu khách: ${JSON.stringify(needs)}`,
      });
      return ok(text.trim() || fallback);
    } catch {
      return ok(fallback);
    }
  }
}
