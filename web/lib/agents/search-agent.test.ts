// Kiểm chứng VÒNG LẶP agent AI tìm kiếm mà không cần LLM thật: mock model phát
// đúng kịch bản tool-call (phân tích nhu cầu → tìm sản phẩm → diễn đạt), khẳng định:
//   1. Tool chạy tất định và state giữ Need/Results đúng.
//   2. Sản phẩm đề xuất do TOOL chọn — LLM không tiêm được dữ liệu (input rỗng).
//   3. Thẻ sản phẩm được đẩy qua onProducts ngay khi tool tìm xong.

import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { createSearchAgent, type SearchAgentState } from "./search-agent";

const usage = {
  inputTokens: { total: 1, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
  raw: undefined,
};

/** Kịch bản: bước 1 gọi phan_tich_nhu_cau, bước 2 gọi tim_san_pham, bước 3 trả lời. */
function scriptedModel() {
  return new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          { type: "tool-call" as const, toolCallId: "c1", toolName: "phan_tich_nhu_cau", input: "{}" },
        ],
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage,
        warnings: [],
      },
      {
        content: [
          { type: "tool-call" as const, toolCallId: "c2", toolName: "tim_san_pham", input: "{}" },
        ],
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage,
        warnings: [],
      },
      {
        content: [{ type: "text" as const, text: "Dạ em gợi ý các mẫu trên ạ." }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage,
        warnings: [],
      },
    ],
  });
}

describe("search-agent (vòng lặp tool với mock LLM)", () => {
  it("chạy trọn vòng: trích nhu cầu → tìm sản phẩm → thẻ UI được đẩy ra", async () => {
    const state: SearchAgentState = {
      userText: "máy lạnh dưới 20 triệu cho phòng ngủ 18m², tiết kiệm điện, ít ồn",
      need: null,
      results: null,
      products: [],
    };
    const pushed: unknown[] = [];
    state.onProducts = (p) => pushed.push(p);

    const agent = createSearchAgent(scriptedModel(), state);
    const result = await agent.generate({
      messages: [{ role: "user", content: "máy lạnh dưới 20 triệu cho phòng ngủ 18m², tiết kiệm điện, ít ồn" }],
    });

    // Need do tool trích — tất định từ userText, không phải từ LLM.
    expect(state.need?.category).toBe("may_lanh");
    expect(state.need?.budgetMax).toBe(20_000_000);
    expect(state.need?.areaM2).toBe(18);

    // Kết quả search nằm trong state, top 1-3 sản phẩm có giá trong ngân sách.
    expect(state.results).not.toBeNull();
    expect(state.results!.top.length).toBeGreaterThan(0);
    expect(state.results!.top.length).toBeLessThanOrEqual(3);
    for (const s of state.results!.top) {
      expect(s.product.price.display!).toBeLessThanOrEqual(20_000_000);
    }

    // Thẻ UI được đẩy đúng một lần, khớp với top.
    expect(pushed).toHaveLength(1);
    expect(state.products.map((p) => p.id)).toEqual(
      state.results!.top.map((s) => s.product.id)
    );

    // LLM chốt câu trả lời sau khi có dữ liệu tool.
    expect(result.text).toContain("gợi ý");
  });

  it("khách chưa nói gì đủ rõ → tool báo chưa sẵn sàng, không tìm sản phẩm", async () => {
    const state: SearchAgentState = {
      userText: "chào em",
      need: null,
      results: null,
      products: [],
    };
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            { type: "tool-call" as const, toolCallId: "c1", toolName: "phan_tich_nhu_cau", input: "{}" },
          ],
          finishReason: { unified: "tool-calls" as const, raw: undefined },
          usage,
          warnings: [],
        },
        {
          content: [{ type: "text" as const, text: "Anh/chị đang quan tâm nhóm sản phẩm nào ạ?" }],
          finishReason: { unified: "stop" as const, raw: undefined },
          usage,
          warnings: [],
        },
      ],
    });
    const agent = createSearchAgent(model, state);
    await agent.generate({ messages: [{ role: "user", content: "chào em" }] });

    expect(state.need).not.toBeNull();
    expect(state.results).toBeNull(); // không được search khi thiếu tín hiệu
    expect(state.products).toEqual([]);
  });
});
