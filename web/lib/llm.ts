import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * Cấu hình LLM qua ENV — KHÔNG hardcode. Mặc định trỏ Ollama nội bộ.
 * Đổi sang API khác (OpenAI, vLLM, LM Studio…) chỉ bằng cách đổi 3 biến này.
 */
export const LLM_CONFIG = {
  baseURL: process.env.LLM_BASE_URL ?? "http://localhost:11434/v1",
  apiKey: process.env.LLM_API_KEY ?? "ollama",
  model: process.env.LLM_MODEL ?? "qwen2.5:7b",
};

/**
 * Sửa các delta tool-call sai chuẩn OpenAI TRƯỚC khi @ai-sdk đọc.
 *
 * Endpoint FPT/vLLM đôi khi stream tool-call với "index" nhảy cóc (vd index=1 khi
 * chưa hề có index=0) hoặc thiếu "id" ở chunk mở đầu. @ai-sdk gán vào mảng theo
 * index nên mảng thành THƯA: flush() duyệt trúng phần tử undefined rồi nổ
 * "Cannot read properties of undefined (reading 'hasFinished')"; thiếu id thì nổ
 * "Expected 'id' to be a string".
 *
 * Cách vá GIỮ ĐÚNG NGỮ NGHĨA STREAM: index chỉ có ý nghĩa xuyên suốt cả stream, nên
 * ta nén dải index gốc quan sát được về liên tục 0,1,2… và ghi nhớ ánh xạ trong
 * `state` (một map dùng chung cho cả một request). Chunk mở đầu (có "id") thì cấp
 * slot mới; các chunk "arguments" tiếp theo tra đúng slot đã cấp cho index gốc đó,
 * KHÔNG bị ép nhầm về 0. id trống ở chunk mở đầu được vá theo slot.
 */
type ToolCallDelta = {
  index?: number;
  id?: string | null;
  type?: string | null;
  function?: { name?: string | null; arguments?: string | null };
};

/**
 * Trạng thái sửa tool-call, DÙNG CHUNG cho cả một response stream.
 * `slotOf`   : index-gốc quan sát được → slot liên tục 0,1,2… (đã cấp cho chunk MỞ ĐẦU).
 * `lastSlot` : slot của tool-call mở đầu gần nhất — nơi các chunk "arguments" nối vào.
 */
export type ToolCallFixState = {
  slotOf: Map<number, number>;
  lastSlot: number | null;
};

export function createToolCallFixState(): ToolCallFixState {
  return { slotOf: new Map(), lastSlot: null };
}

/** Một delta là "mở đầu" tool-call khi mang id hoặc function.name (không phải chunk args rời). */
function isOpeningDelta(c: ToolCallDelta): boolean {
  return (c.id != null && c.id !== "") || (c.function?.name ?? "") !== "";
}

/**
 * Vá MỘT delta tool-call về đúng chuẩn OpenAI streaming mà @ai-sdk mong đợi.
 *
 * gpt-oss-120b (FPT) stream tool-call SAI ở hai điểm, gây "stream DONE nhưng bot không
 * trả lời" vì @ai-sdk không ghép nổi tool-call → vòng lặp agent dừng ngay sau bước 1:
 *
 *  1) INDEX NHẢY CÓC & KHÔNG KHỚP GIỮA CÁC EVENT: chunk mở đầu mang name ở index 0,
 *     nhưng chunk "arguments" tiếp theo (ở event SSE khác) lại mang index 1. @ai-sdk gán
 *     theo index nên tưởng là tool-call MỚI, vô danh → loại; tool-call thật thì chốt với
 *     arguments rỗng.
 *  2) THIẾU id ở chunk mở đầu (đôi lúc).
 *
 * Cách vá GIỮ ĐÚNG NGỮ NGHĨA: chunk mở đầu (có id/name) được cấp slot liên tục và ghi nhớ
 * là "slot hiện hành". Chunk chỉ có "arguments" — bất kể index gốc là bao nhiêu — được ép
 * về slot mở đầu gần nhất, KHÔNG cấp slot mới. Nhờ vậy name + arguments về đúng một tool-call.
 */
function repairOneToolCall(c: ToolCallDelta, state: ToolCallFixState): void {
  if (isOpeningDelta(c)) {
    const orig = typeof c.index === "number" ? c.index : state.slotOf.size;
    let slot = state.slotOf.get(orig);
    if (slot === undefined) {
      slot = state.slotOf.size;
      state.slotOf.set(orig, slot);
    }
    c.index = slot;
    state.lastSlot = slot;
    if (c.id == null || c.id === "") c.id = `toolcall_${slot}`;
    return;
  }
  // Chunk chỉ có "arguments" (không id, không name) → nối vào tool-call mở đầu gần nhất.
  // gpt-oss gửi index rác ở đây; bỏ qua nó, dùng lastSlot. Nếu chưa từng thấy chunk mở
  // đầu nào (hiếm), cấp slot 0 để không mất dữ liệu.
  if (state.lastSlot === null) {
    state.lastSlot = state.slotOf.size;
    state.slotOf.set(typeof c.index === "number" ? c.index : 0, state.lastSlot);
  }
  c.index = state.lastSlot;
}

export function normalizeToolCallDeltas(chunk: unknown, state: ToolCallFixState): void {
  const choices = (chunk as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return;
  for (const choice of choices) {
    const calls = (choice as { delta?: { tool_calls?: unknown } })?.delta?.tool_calls;
    if (!Array.isArray(calls)) continue;
    for (const call of calls) repairOneToolCall(call as ToolCallDelta, state);
  }
}

/**
 * fetch bọc ngoài: chỉ can thiệp response SSE (text/event-stream) của completions,
 * sửa từng dòng "data: {…}" qua normalizeToolCallDeltas rồi chuyển tiếp nguyên vẹn.
 * Không phải SSE (JSON thường, lỗi…) → trả thẳng, không đụng tới.
 */
const repairFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  const ct = res.headers.get("content-type") ?? "";
  if (!res.body || !ct.includes("text/event-stream")) return res;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = "";
  // Trạng thái sửa tool-call, DÙNG CHUNG cho cả stream này (mỗi response một state).
  const fixState = createToolCallFixState();

  const repaired = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        if (buf) controller.enqueue(encoder.encode(buf));
        controller.close();
        return;
      }
      buf += decoder.decode(value, { stream: true });
      // SSE phân tách bằng "\n"; giữ lại đoạn cuối chưa trọn dòng cho vòng sau.
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trimStart();
        const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : "";
        if (payload && payload !== "[DONE]") {
          try {
            const obj = JSON.parse(payload);
            if (process.env.DEBUG_LLM) {
              const tc = (obj as { choices?: { delta?: { tool_calls?: unknown }; finish_reason?: unknown }[] })
                .choices?.[0];
              if (tc?.delta?.tool_calls || tc?.finish_reason) {
                console.error("[llm.raw]", JSON.stringify(tc));
              }
            }
            normalizeToolCallDeltas(obj, fixState);
            if (process.env.DEBUG_LLM) {
              const tc = (obj as { choices?: { delta?: { tool_calls?: unknown } }[] }).choices?.[0];
              if (tc?.delta?.tool_calls) console.error("[llm.fixed]", JSON.stringify(tc.delta.tool_calls));
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n`));
            continue;
          } catch {
            // Không parse được (chunk lạ) → chuyển tiếp nguyên trạng.
          }
        }
        controller.enqueue(encoder.encode(`${line}\n`));
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });

  return new Response(repaired, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
};

/** Tạo model OpenAI-compatible từ ENV. */
export function getModel(): LanguageModel {
  const provider = createOpenAICompatible({
    name: "local-llm",
    baseURL: LLM_CONFIG.baseURL,
    apiKey: LLM_CONFIG.apiKey,
    fetch: repairFetch,
  });
  return provider(LLM_CONFIG.model);
}

/**
 * Thăm dò xem LLM có sẵn sàng không (gọi endpoint /models của chuẩn OpenAI-compatible).
 * Dùng để quyết định luồng: có LLM → stream câu trả lời; không có → luồng deterministic
 * (app vẫn chạy, vẫn ra sản phẩm thật, chỉ khác phần diễn đạt). Đề bài: "không có LLM
 * → app vẫn chạy, có thông báo rõ thay vì crash".
 */
export async function probeLLM(timeoutMs = 1500): Promise<boolean> {
  const url = `${LLM_CONFIG.baseURL.replace(/\/$/, "")}/models`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${LLM_CONFIG.apiKey}` },
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
