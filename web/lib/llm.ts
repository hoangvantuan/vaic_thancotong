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

/** Tạo model OpenAI-compatible từ ENV. */
export function getModel(): LanguageModel {
  const provider = createOpenAICompatible({
    name: "local-llm",
    baseURL: LLM_CONFIG.baseURL,
    apiKey: LLM_CONFIG.apiKey,
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
