// Luật đủ-thông-tin & chọn câu hỏi kế tiếp (bảng quy tắc mục 1–2, `sufficiency@v1`).
//
// Điểm chấm của phiếu #26: mô hình chỉ là ỨNG VIÊN — số liệu phải trích lại được
// từ nguyên văn lời khách mới được dùng; phỏng đoán bị loại và tính là khoảng trống.

import { describe, expect, it } from "vitest";
import type { ExtractedNeeds } from "../ports/model-service";
import { demoSufficiency } from "./sufficiency";

const NO_NEEDS: ExtractedNeeds = {
  category: null,
  fitValue: null,
  budgetVnd: null,
  priorities: [],
  quotedSpans: [],
};

describe("sufficiency@v1 — kiểm chứng nhu cầu", () => {
  it("số mô hình đưa mà nguyên văn không có là PHỎNG ĐOÁN — bị loại, thành caveat", () => {
    // Mô hình "bịa" ngân sách 99 triệu; lời khách không hề nhắc tiền.
    const candidate: ExtractedNeeds = {
      ...NO_NEEDS,
      category: "may_lanh",
      fitValue: 18,
      budgetVnd: 99_000_000,
      quotedSpans: ["99 triệu"],
    };
    const out = demoSufficiency.assess(candidate, {
      userText: "máy lạnh cho phòng 18m2",
    });
    expect(out.kind).toBe("proceed");
    if (out.kind !== "proceed") return;
    expect(out.needs.budgetVnd).toBeNull(); // phỏng đoán không được dùng
    expect(out.needs.fitValue).toBe(18); // dữ kiện thật giữ nguyên
    expect(out.caveats.length).toBeGreaterThan(0); // khoảng trống ngân sách nói ra
  });

  it("diện tích mô hình đưa mà lời khách không có → khoảng trống → hỏi lại", () => {
    const candidate: ExtractedNeeds = {
      ...NO_NEEDS,
      category: "may_lanh",
      fitValue: 25, // không có trong lời khách
    };
    const out = demoSufficiency.assess(candidate, { userText: "tư vấn máy lạnh giúp em" });
    expect(out.kind).toBe("ask");
    if (out.kind !== "ask") return;
    expect(out.question).toContain("m²");
  });
});

describe("sufficiency@v1 — chọn một câu hỏi theo thứ tự ưu tiên", () => {
  it("chưa rõ ngành → hỏi ngành (ưu tiên 1), dù cũng thiếu diện tích", () => {
    const out = demoSufficiency.assess(NO_NEEDS, { userText: "chào em, tư vấn giúp anh" });
    expect(out.kind).toBe("ask");
    if (out.kind !== "ask") return;
    expect(out.targetGap).toContain("ngành");
  });

  it("có ngành, thiếu diện tích → hỏi diện tích (ưu tiên 2)", () => {
    const out = demoSufficiency.assess(NO_NEEDS, { userText: "em cần mua máy lạnh" });
    expect(out.kind).toBe("ask");
    if (out.kind !== "ask") return;
    expect(out.targetGap).toContain("diện tích");
  });

  it("ngành khách chọn trên giao diện thắng mọi nguồn khác", () => {
    const out = demoSufficiency.assess(NO_NEEDS, {
      userText: "phòng 18m2 tầm 10 triệu",
      category: "may_lanh",
    });
    expect(out.kind).toBe("proceed");
    if (out.kind !== "proceed") return;
    expect(out.needs.category).toBe("may_lanh");
    expect(out.needs.fitValue).toBe(18);
    expect(out.needs.budgetVnd).toBe(10_000_000);
  });

  it("ngân sách KHÔNG chặn tư vấn: đủ ngành + diện tích là đi tiếp, kèm caveat", () => {
    const out = demoSufficiency.assess(NO_NEEDS, { userText: "máy lạnh phòng ngủ 18m2" });
    expect(out.kind).toBe("proceed");
    if (out.kind !== "proceed") return;
    expect(out.needs.budgetVnd).toBeNull();
    expect(out.caveats.some((c) => c.includes("ngân sách"))).toBe(true);
  });

  it("ngành không có tiêu chí hoàn cảnh (laptop) → không đòi diện tích", () => {
    const out = demoSufficiency.assess(NO_NEEDS, { userText: "laptop tầm 20 triệu" });
    expect(out.kind).toBe("proceed");
    if (out.kind !== "proceed") return;
    expect(out.needs.category).toBe("laptop");
  });
});

describe("sufficiency@v1 — tất định", () => {
  it("cùng đầu vào chạy hai lần ra cùng kết quả từng trường", () => {
    const input = { userText: "máy lạnh 18m2 dưới 12 triệu, ít ồn" };
    const a = demoSufficiency.assess(NO_NEEDS, input);
    const b = demoSufficiency.assess(NO_NEEDS, input);
    expect(a).toEqual(b);
  });

  it("ưu tiên 'ít ồn' được trích tất định từ lời khách", () => {
    const out = demoSufficiency.assess(NO_NEEDS, { userText: "máy lạnh 18m2 ít ồn" });
    expect(out.kind).toBe("proceed");
    if (out.kind !== "proceed") return;
    expect(out.needs.priorities).toContain("quiet");
  });
});
