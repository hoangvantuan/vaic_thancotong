import { describe, expect, it } from "vitest";
import { normalizeToolCallDeltas } from "./llm";

/**
 * Tái hiện đúng các delta tool-call sai chuẩn mà endpoint FPT đã trả về
 * (log thật: index=1 khi chưa có index=0, id=null), chứng minh normalizer
 * biến chúng về dạng @ai-sdk đọc được: index liên tục từ 0, id không trống.
 */
describe("normalizeToolCallDeltas", () => {
  it("nén index nhảy cóc (bắt đầu từ 1) về liên tục từ 0", () => {
    const state = new Map<number, number>();
    const chunk = {
      choices: [
        { delta: { tool_calls: [{ index: 1, id: null, function: { name: "phan_tich_nhu_cau" } }] } },
      ],
    };
    normalizeToolCallDeltas(chunk, state);
    const call = chunk.choices[0].delta.tool_calls[0];
    expect(call.index).toBe(0);
    expect(call.id).toBe("toolcall_0");
  });

  it("chunk arguments tiếp theo (cùng index gốc, không id) giữ đúng slot, không bị vá id", () => {
    const state = new Map<number, number>();
    const opening = {
      choices: [{ delta: { tool_calls: [{ index: 1, id: null, function: { name: "t" } }] } }],
    };
    const argsChunk = {
      choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: "{}" } }] } }],
    };
    normalizeToolCallDeltas(opening, state);
    normalizeToolCallDeltas(argsChunk, state);
    const c = argsChunk.choices[0].delta.tool_calls[0] as { index?: number; id?: string };
    expect(c.index).toBe(0); // cùng slot với chunk mở đầu
    expect(c.id).toBeUndefined(); // KHÔNG vá id cho chunk arguments
  });

  it("hai tool-call index thưa (1 và 3) → slot 0 và 1", () => {
    const state = new Map<number, number>();
    const chunk = {
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 1, id: "a", function: { name: "x" } },
              { index: 3, id: null, function: { name: "y" } },
            ],
          },
        },
      ],
    };
    normalizeToolCallDeltas(chunk, state);
    const calls = chunk.choices[0].delta.tool_calls;
    expect(calls[0].index).toBe(0);
    expect(calls[1].index).toBe(1);
    expect(calls[1].id).toBe("toolcall_1");
  });

  it("chunk không có tool_calls (text thường) → không đổi", () => {
    const state = new Map<number, number>();
    const chunk = { choices: [{ delta: { content: "xin chào" } }] };
    normalizeToolCallDeltas(chunk, state);
    expect(chunk.choices[0].delta.content).toBe("xin chào");
  });
});
