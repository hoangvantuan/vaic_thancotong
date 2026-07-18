// Kiểm chứng vòng lặp triage-agent với mock LLM: LLM nộp cách đọc CÓ BỊA của nó
// vào tool, và thiết kế bảo đảm phần bịa chỉ nằm được ở ngăn DỰ ĐOÁN — nguyên văn
// lời khách mới quyết định cái gì CHẮC CHẮN, câu hỏi kế tiếp do lõi tất định chọn.

import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { createTriageAgent, type TriageAgentState } from "./triage-agent";

const usage = {
  inputTokens: { total: 1, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
  raw: undefined,
};

/** Kịch bản: LLM nộp dự đoán (bịa ngân sách 30 triệu + suy luận) rồi chốt câu trả lời. */
function scriptedModel(finalText: string, duDoan: unknown) {
  return new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          {
            type: "tool-call" as const,
            toolCallId: "c1",
            toolName: "phan_loai_thong_tin",
            input: JSON.stringify({ du_doan: duDoan }),
          },
        ],
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage,
        warnings: [],
      },
      {
        content: [{ type: "text" as const, text: finalText }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage,
        warnings: [],
      },
    ],
  });
}

describe("triage-agent (vòng lặp tool với mock LLM)", () => {
  it("LLM bịa ngân sách → chỉ nằm ở ngăn dự đoán; facts và câu hỏi do lõi quyết", async () => {
    const state: TriageAgentState = {
      userText: "máy lạnh cho phòng ngủ 18m2, ít ồn",
      report: null,
    };
    const agent = createTriageAgent(
      scriptedModel("Em đã nắm chắc: máy lạnh, 18m². Còn thiếu ngân sách ạ.", {
        nganh: "may_lanh",
        tieu_chi_hoan_canh: 18,
        ngan_sach_vnd: 30_000_000, // bịa — khách chưa hề nói tiền
        suy_luan: ["chắc khách ưu tiên êm vì là phòng ngủ"],
      }),
      state
    );

    const result = await agent.generate({
      messages: [{ role: "user", content: state.userText }],
    });

    const report = state.report!;
    expect(report).not.toBeNull();

    // Chắc chắn: đúng những gì nguyên văn có.
    expect(report.facts.find((f) => f.slot === "nganh_hang")?.value).toBe("may_lanh");
    expect(report.facts.find((f) => f.slot === "dien_tich_m2")?.value).toBe(18);

    // Bịa của LLM không thăng cấp được: ngân sách vẫn THIẾU, phần bịa nằm ở dự đoán.
    expect(report.facts.find((f) => f.slot === "ngan_sach")).toBeUndefined();
    expect(report.missing).toContain("ngan_sach");
    expect(report.predictions.some((p) => p.slot === "ngan_sach" && p.value === 30_000_000)).toBe(
      true
    );
    expect(report.predictions.some((p) => p.slot === "suy_luan")).toBe(true);

    // Câu hỏi kế tiếp do lõi chọn: ngân sách là khoảng trống duy nhất còn lại.
    expect(report.nextQuestion?.targetGap).toBe("ngân sách tối đa");
    expect(result.text).toContain("thiếu ngân sách");
  });

  it("khách nói hai diện tích → mâu thuẫn được giữ nguyên, câu hỏi chốt mâu thuẫn", async () => {
    const state: TriageAgentState = {
      userText: "máy lạnh phòng 18m2 tầm 15 triệu... à nhầm, phòng 25m2",
      report: null,
    };
    const agent = createTriageAgent(
      scriptedModel("Anh/chị chốt 18m² hay 25m² ạ?", {
        nganh: "may_lanh",
        tieu_chi_hoan_canh: 25, // LLM tự chọn một phía — không được phép
        ngan_sach_vnd: 15_000_000,
        suy_luan: [],
      }),
      state
    );
    await agent.generate({ messages: [{ role: "user", content: state.userText }] });

    const report = state.report!;
    // Lõi không cho chọn phía: cả 18 lẫn 25 nằm trong mâu thuẫn, không cái nào là fact.
    const conflict = report.conflicts.find((c) => c.slot === "dien_tich_m2");
    expect(conflict?.values).toEqual([18, 25]);
    expect(report.facts.find((f) => f.slot === "dien_tich_m2")).toBeUndefined();
    expect(report.nextQuestion?.targetGap).toBe("mâu thuẫn: dien_tich_m2");
  });
});
