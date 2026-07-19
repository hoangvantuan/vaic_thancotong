import { describe, expect, it } from "vitest";
import { createToolCallFixState, normalizeToolCallDeltas } from "./llm";

/**
 * Tái hiện đúng các delta tool-call sai chuẩn mà endpoint FPT (gpt-oss-120b) trả về
 * theo log thật, chứng minh normalizer biến chúng về dạng @ai-sdk đọc được: chunk mở
 * đầu có index liên tục từ 0 và id không trống; chunk "arguments" nối đúng vào tool-call
 * mở đầu gần nhất bất kể index gốc (gpt-oss gửi index rác ở chunk arguments).
 */
describe("normalizeToolCallDeltas", () => {
  it("nén index nhảy cóc (bắt đầu từ 1) về liên tục từ 0", () => {
    const state = createToolCallFixState();
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

  // BUG THẬT (log FPT): mở đầu ở index 0, nhưng chunk arguments ở EVENT KHÁC mang index 1.
  // @ai-sdk tưởng index 1 là tool-call mới vô danh → loại; tool-call thật chốt args rỗng
  // → agent dừng ngay sau bước 1: "stream DONE mà bot không trả lời".
  it("chunk arguments ở event khác (index KHÔNG khớp) vẫn nối vào tool-call mở đầu", () => {
    const state = createToolCallFixState();
    const opening = {
      choices: [{ delta: { tool_calls: [{ index: 0, id: "x", function: { name: "t", arguments: "" } }] } }],
    };
    const argsChunk = {
      choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: "{}" } }] } }],
    };
    normalizeToolCallDeltas(opening, state);
    normalizeToolCallDeltas(argsChunk, state);
    const c = argsChunk.choices[0].delta.tool_calls[0] as { index?: number; id?: string };
    expect(c.index).toBe(0); // ép về slot của tool-call mở đầu, KHÔNG cấp slot mới
    expect(c.id).toBeUndefined(); // KHÔNG vá id cho chunk arguments
  });

  it("hai tool-call song song, mỗi cái có chunk arguments riêng ở index rác", () => {
    const state = createToolCallFixState();
    const evs = [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "a", function: { name: "toolA", arguments: "" } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '{"x":1}' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 5, id: "b", function: { name: "toolB", arguments: "" } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 6, function: { arguments: '{"y":2}' } }] } }] },
    ];
    for (const e of evs) normalizeToolCallDeltas(e, state);
    expect(evs[0].choices[0].delta.tool_calls[0].index).toBe(0); // toolA
    expect(evs[1].choices[0].delta.tool_calls[0].index).toBe(0); // args của toolA
    expect(evs[2].choices[0].delta.tool_calls[0].index).toBe(1); // toolB (index gốc 5 → slot 1)
    expect(evs[3].choices[0].delta.tool_calls[0].index).toBe(1); // args của toolB (index gốc 6 → slot 1)
  });

  it("chunk không có tool_calls (text thường) → không đổi", () => {
    const state = createToolCallFixState();
    const chunk = { choices: [{ delta: { content: "xin chào" } }] };
    normalizeToolCallDeltas(chunk, state);
    expect(chunk.choices[0].delta.content).toBe("xin chào");
  });
});
