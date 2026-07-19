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

/** Nén index gốc về slot liên tục và vá id trống cho MỘT delta tool-call. */
function repairOneToolCall(c: ToolCallDelta, state: Map<number, number>): void {
  const orig = typeof c.index === "number" ? c.index : state.size;
  let slot = state.get(orig);
  const isOpening = slot === undefined; // chunk đầu tiên thấy index gốc này
  if (slot === undefined) {
    slot = state.size;
    state.set(orig, slot);
  }
  c.index = slot;
  // CHỈ vá id ở chunk MỞ ĐẦU (chunk arguments không mang id — vá nhầm sẽ khiến
  // @ai-sdk tưởng là tool-call mới). Dấu hiệu: lần đầu thấy index, hoặc có function.name.
  const opening = isOpening || (c.function?.name ?? "") !== "";
  if (opening && (c.id == null || c.id === "")) c.id = `toolcall_${slot}`;
}

/**
 * GỘP các delta tool-call cùng slot NẰM TRONG CÙNG MỘT CHUNK về một delta duy nhất.
 *
 * gpt-oss-120b (FPT) phát cả tool-call trong MỘT event SSE, tách thành hai phần tử
 * cùng index: phần đầu mang {name, arguments:""}, phần sau mang {arguments:"{}"}.
 * @ai-sdk giả định name và arguments đến ở các event RIÊNG BIỆT: nó forward tool-call
 * NGAY khi thấy `name` (lúc đó arguments còn rỗng) rồi đánh dấu index đã forward, nên
 * phần "{}" đến sau bị bỏ lại — tool-call chốt với arguments RỖNG và execute lỗi/không
 * chạy, khiến vòng lặp agent dừng ngay sau bước 1 (stream DONE mà không có câu trả lời).
 *
 * Gộp lại trước khi @ai-sdk đọc: một tool-call trọn vẹn {name, arguments:"{}"} → forward
 * đúng một lần với arguments đầy đủ. Chỉ gộp trong phạm vi một chunk; các chunk arguments
 * ở những event sau (nếu provider có stream kiểu đó) vẫn nối bình thường nhờ index đã nén.
 */
function mergeSameSlotDeltas(calls: ToolCallDelta[]): ToolCallDelta[] {
  const bySlot = new Map<number, ToolCallDelta>();
  const order: number[] = [];
  for (const c of calls) {
    const slot = c.index as number;
    let m = bySlot.get(slot);
    if (!m) {
      m = { index: slot, function: { arguments: "" } };
      bySlot.set(slot, m);
      order.push(slot);
    }
    if (c.id != null && c.id !== "" && (m.id == null || m.id === "")) m.id = c.id;
    if (c.type != null && m.type == null) m.type = c.type;
    const name = c.function?.name;
    if (name != null && name !== "") m.function!.name = name;
    const args = c.function?.arguments;
    if (args != null && args !== "") m.function!.arguments += args;
  }
  return order.map((slot) => bySlot.get(slot)!);
}

export function normalizeToolCallDeltas(chunk: unknown, state: Map<number, number>): void {
  const choices = (chunk as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return;
  for (const choice of choices) {
    const delta = (choice as { delta?: { tool_calls?: unknown } })?.delta;
    const calls = delta?.tool_calls;
    if (!Array.isArray(calls)) continue;
    for (const call of calls) repairOneToolCall(call as ToolCallDelta, state);
    // Sau khi nén index: nếu cùng chunk có nhiều mảnh cùng slot, gộp thành một.
    if (calls.length > 1) {
      (delta as { tool_calls: ToolCallDelta[] }).tool_calls = mergeSameSlotDeltas(
        calls as ToolCallDelta[]
      );
    }
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
  // Ánh xạ index-gốc → slot liên tục, DÙNG CHUNG cho cả stream này (mỗi response một map).
  const slotMap = new Map<number, number>();

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
            normalizeToolCallDeltas(obj, slotMap);
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
