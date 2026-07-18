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

  // Có LLM không? Không có → app vẫn chạy bằng luồng deterministic (vẫn ra sản phẩm thật).
  const llmReady = await probeLLM();
  const model = llmReady ? getModel() : null;

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
