import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type ToolSet,
  type UIMessageStreamWriter,
} from "ai";
import type { ChatMessage } from "@/lib/chat-types";
import { getModel, probeLLM } from "@/lib/llm";
import { orchestrate } from "@/lib/agents/orchestrator";
import { LlmModelService } from "@/lib/core/adapters/llm-model-service";
import { isDeferral, looksLikePolicy } from "@/lib/core/pipeline/run-turn";
import { extract } from "@/lib/search/extract";

// Self-host FIRST: chạy trên Node runtime, không dùng edge/Vercel-only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Gộp toàn bộ text khách đã nói (cả lịch sử) để trích nhu cầu xuyên suốt hội thoại. */
function getUserText(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) =>
      (m.parts ?? [])
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join(" ")
    )
    .join("\n")
    .trim();
}

/** Ghi một khối text tĩnh vào UI stream (luồng không có LLM). */
function writeStaticText(writer: UIMessageStreamWriter<ChatMessage>, text: string) {
  const id = crypto.randomUUID();
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

export async function POST(req: Request) {
  let messages: ChatMessage[] = [];
  let hintCategory: string | undefined;
  try {
    const body = (await req.json()) as {
      messages?: ChatMessage[];
      category?: string;
    };
    messages = body.messages ?? [];
    hintCategory = body.category;
  } catch {
    return new Response("Body không hợp lệ", { status: 400 });
  }

  const userText = getUserText(messages);

  // Cổng năng lực mô hình — dùng cho câu hỏi CHÍNH SÁCH và cho việc bắt sóng ý định.
  const modelService = new LlmModelService();

  // CHÍNH SÁCH (bảo hành/đổi trả/giao lắp/trả góp) — trả lời TỪ TÀI LIỆU kèm nguồn,
  // độc lập với việc đã biết ngành hay chưa; không lảng sang hỏi mua. Không tra được
  // tài liệu → rơi xuống luồng tư vấn bình thường bên dưới.
  if (looksLikePolicy(userText)) {
    const answered = await modelService.answerPolicy(userText);
    if (answered.ok && answered.data.trim()) {
      const stream = createUIMessageStream<ChatMessage>({
        execute: async ({ writer }) => writeStaticText(writer, answered.data.trim()),
      });
      return createUIMessageStreamResponse({ stream });
    }
  }

  // Có LLM không? Không có → app vẫn chạy bằng luồng deterministic (vẫn ra sản phẩm thật).
  const llmReady = await probeLLM();
  const model = llmReady ? getModel() : null;

  // LUỒNG TẤT ĐỊNH cho MỌI lượt (kể cả khi có LLM). Trước đây có LLM thì đi qua
  // ToolLoopAgent để LLM tự gọi tool — nhưng gpt-oss-120b qua FPT stream tool-call
  // hỏng (finish_reason=tool_calls kèm tool_calls RỖNG, stop_reason 200012) khi có
  // nhiều tool, khiến vòng lặp dừng ngay bước 1: "stream DONE mà bot không trả lời".
  // Việc quyết định (phân tích nhu cầu, tìm sản phẩm) vốn TẤT ĐỊNH — không cần LLM cầm
  // lái. Ta tự chạy bằng code (extract + search trong orchestrate) rồi CHỈ dùng LLM để
  // DIỄN ĐẠT kết quả qua streamText (không function-calling) → hết phụ thuộc tool-call.
  //
  // KHÁCH ỦY THÁC ("không biết", "tùy em"): trước khi mời bấm chip, thử đoán ngành qua
  // readIntent (generateText thuần, không tool) để không bắt khách chọn thủ công.
  if (model && !extract(userText, { hintCategory }).category && isDeferral(userText)) {
    const intent = await modelService.readIntent(userText);
    const guess = intent.ok ? intent.data.suggestedCategory : null;
    if (guess) hintCategory = guess;
  }

  const plan = await orchestrate(userText, { model, hintCategory });

  // BẮT SÓNG Ý ĐỊNH khi chưa rõ ngành: đáp đúng hoàn cảnh khách kể rồi mới mời chọn,
  // thay câu chào cứng. readIntent dùng generateText thuần (không tool) nên an toàn với
  // gpt-oss. Không đọc được ý định → giữ câu chào tất định của plan (không bao giờ kẹt).
  if (model && plan.mode === "pick_category") {
    const intent = await modelService.readIntent(userText);
    const opener =
      intent.ok && intent.data.reply.trim() ? intent.data.reply.trim() : plan.text;
    const stream = createUIMessageStream<ChatMessage>({
      execute: async ({ writer }) => {
        writeStaticText(writer, opener);
        writer.write({ type: "data-categories", data: plan.categories });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  const stream = createUIMessageStream<ChatMessage>({
    onError: (err) => {
      console.error("[chat] stream error:", err);
      return "Dạ hệ thống đang bận, anh/chị thử lại giúp em sau ít phút nhé ạ.";
    },
    execute: async ({ writer }) => {
      // Mời khách chọn ngành hàng — kèm chip để bấm nhanh.
      if (plan.mode === "pick_category") {
        writeStaticText(writer, plan.text);
        writer.write({ type: "data-categories", data: plan.categories });
        return;
      }

      // Các nhánh không cần LLM → trả lời tĩnh, tự nhiên.
      if (plan.mode === "clarify" || plan.mode === "no_results" || plan.mode === "empty_catalog") {
        writeStaticText(writer, plan.text);
        return;
      }

      // Nhánh recommend: đẩy thẻ sản phẩm trước (luôn có), rồi diễn đạt.
      writer.write({ type: "data-products", data: plan.products });

      if (model) {
        // Có LLM → stream câu trả lời tiếng Việt, bám guardrail trong systemPrompt.
        const result = streamText({
          model,
          system: plan.systemPrompt,
          messages: await convertToModelMessages(messages),
          temperature: 0.4,
        });
        writer.merge(
          toUIMessageStream<ToolSet, ChatMessage>({ stream: result.fullStream })
        );
      } else {
        // Không có LLM → câu trả lời deterministic (vẫn hữu ích, kèm thẻ sản phẩm).
        writeStaticText(writer, plan.fallbackText);
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
