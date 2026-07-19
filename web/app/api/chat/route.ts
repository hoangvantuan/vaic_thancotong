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
import { looksLikePolicy } from "@/lib/core/pipeline/run-turn";
import {
  categoryChoices,
  createSearchAgent,
  type SearchAgentState,
} from "@/lib/agents/search-agent";
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

  // CÓ LLM → agent AI tìm kiếm: LLM tự quyết hỏi thêm hay tìm, qua tool tất định.
  // Chip chọn ngành vẫn là luồng tĩnh: chưa dò ra ngành thì mời khách bấm chip,
  // khỏi tốn một vòng LLM chỉ để hỏi "anh/chị cần gì".
  if (model) {
    const need = extract(userText, { hintCategory });
    if (!need.category) {
      const stream = createUIMessageStream<ChatMessage>({
        execute: async ({ writer }) => {
          // BẮT SÓNG Ý ĐỊNH: khách than "trời nóng quá", "nhà đông người"… thì đáp
          // đúng hoàn cảnh rồi mới mời chọn, thay vì câu chào vô cảm giống nhau mọi lượt.
          // Không đọc được ý định → giữ câu chào tất định (hội thoại không bao giờ kẹt).
          const intent = await modelService.readIntent(userText);
          const opener =
            intent.ok && intent.data.reply.trim()
              ? intent.data.reply.trim()
              : "Dạ em chào anh/chị 👋 Em là trợ lý tư vấn của Điện Máy Xanh. " +
                "Anh/chị đang quan tâm nhóm sản phẩm nào ạ?";
          writeStaticText(writer, opener);
          writer.write({ type: "data-categories", data: categoryChoices() });
        },
      });
      return createUIMessageStreamResponse({ stream });
    }

    const state: SearchAgentState = {
      userText,
      hintCategory,
      need: null,
      results: null,
      products: [],
    };
    const agent = createSearchAgent(model, state);

    const stream = createUIMessageStream<ChatMessage>({
      onError: (err) => {
        console.error("[chat] agent stream error:", err);
        return "Dạ hệ thống đang bận, anh/chị thử lại giúp em sau ít phút nhé ạ.";
      },
      execute: async ({ writer }) => {
        // Thẻ sản phẩm đẩy vào stream NGAY khi tool tìm xong — không đợi LLM nói hết.
        state.onProducts = (products) =>
          writer.write({ type: "data-products", data: products });
        const result = await agent.stream({
          messages: await convertToModelMessages(messages),
        });
        writer.merge(
          toUIMessageStream<ToolSet, ChatMessage>({ stream: result.fullStream })
        );
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  // KHÔNG có LLM → giữ nguyên luồng deterministic cũ (vẫn ra sản phẩm thật).
  const plan = await orchestrate(userText, { model, hintCategory });

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
