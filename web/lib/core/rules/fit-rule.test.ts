// Luật "phù hợp nhu cầu" phải TỔNG QUÁT theo ngành — khoá yêu cầu SP+/Ngành+.
//
// Cùng MỘT luật phục vụ máy lạnh (m², "phòng") lẫn tủ lạnh (người, "nhà"): đơn vị,
// danh từ và biên nới đều đọc từ `config/categories.json`, không hardcode trong mã.

import { describe, expect, it } from "vitest";
import { absent, observed } from "../contracts/status";
import type { SourcedValue } from "../contracts/status";
import type { Provenance } from "../contracts/provenance";
import type { SourcedProduct } from "../ports/product-source";
import type { ExtractedNeeds } from "../ports/model-service";
import { phuHopNhuCau, vuaNhuCau } from "./catalog-rules";

function make(
  category: string,
  attrs: Record<string, SourcedValue<string | number>>
): SourcedProduct {
  const provenance: Record<string, Provenance> = {};
  for (const [field, value] of Object.entries(attrs)) {
    provenance[field] = {
      sourceUrl: "https://www.dienmayxanh.com/fixture",
      recordLocation: `${category}.json#/0/${field}`,
      rawValue: value.status === "observed" ? String(value.value) : "",
      observedAt: "2026-07-18T00:00:00.000Z",
      normalizedValue: value,
      transformRule: "fixture@v1",
    };
  }
  return {
    id: `${category}-1`,
    category,
    displayName: `${category} fixture`,
    sourceUrl: "https://www.dienmayxanh.com/fixture",
    attributes: attrs,
    provenance,
    observedAt: "2026-07-18T00:00:00.000Z",
  };
}

function needs(category: string, fitValue: number | null): ExtractedNeeds {
  return { category, fitValue, budgetVnd: null, priorities: [], quotedSpans: [] };
}

describe("phu_hop_nhu_cau@v1 — một luật, nhiều ngành", () => {
  it("máy lạnh: nói theo m² và danh từ 'phòng'", () => {
    const p = make("may_lanh", { fitMin: observed(15), fitMax: observed(20) });
    const f = phuHopNhuCau.evaluate(p, needs("may_lanh", 18));
    expect(f.verdict).toBe("eligible");
    expect(f.explanation).toContain("phòng");
    expect(f.explanation).toContain("m²");
  });

  it("tủ lạnh: CÙNG luật nhưng nói theo người và danh từ 'nhà'", () => {
    const p = make("tu_lanh", { fitMin: observed(4), fitMax: observed(5) });
    const f = phuHopNhuCau.evaluate(p, needs("tu_lanh", 4));
    expect(f.verdict).toBe("eligible");
    expect(f.explanation).toContain("nhà");
    expect(f.explanation).toContain("người");
    // Không được lẫn đơn vị của ngành khác.
    expect(f.explanation).not.toContain("m²");
  });

  it("tủ lạnh 'Trên 5 người' (không có cận trên) vẫn PHỤC VỤ được nhà 8 người", () => {
    // Đây là nhóm tủ to nhất — coi cận trên vắng mặt là "thiếu dữ liệu" sẽ loại sạch
    // đúng những mẫu hợp nhà đông người nhất.
    const p = make("tu_lanh", {
      fitMin: observed(5),
      fitMax: absent<number>("not_applicable"),
    });
    const f = phuHopNhuCau.evaluate(p, needs("tu_lanh", 8));
    expect(f.verdict).toBe("eligible");
  });

  it("thiếu hẳn dữ liệu tiêu chí → unverified (đóng an toàn), KHÔNG đoán", () => {
    const p = make("tu_lanh", { fitMin: absent<number>("missing"), fitMax: absent<number>("missing") });
    const f = phuHopNhuCau.evaluate(p, needs("tu_lanh", 4));
    expect(f.verdict).toBe("unverified");
  });

  it("tủ lạnh quá nhỏ so với nhà đông người → excluded (biên nới lấy từ config)", () => {
    const p = make("tu_lanh", { fitMin: observed(1), fitMax: observed(2) });
    const f = phuHopNhuCau.evaluate(p, needs("tu_lanh", 8));
    expect(f.verdict).toBe("excluded");
    expect(f.explanation).toContain("8");
  });

  it("khách chưa nêu tiêu chí → luật không ràng buộc", () => {
    const p = make("tu_lanh", { fitMin: observed(4), fitMax: observed(5) });
    const f = phuHopNhuCau.evaluate(p, needs("tu_lanh", null));
    expect(f.verdict).toBe("eligible");
  });
});

describe("vua_nhu_cau@v1 — chấm điểm mềm theo ngành", () => {
  it("vừa khít → đóng góp dương, câu chữ theo đúng ngành", () => {
    const p = make("tu_lanh", { fitMin: observed(4), fitMax: observed(5) });
    const s = vuaNhuCau.score(p, needs("tu_lanh", 4));
    expect(s.contribution).toBeGreaterThan(0);
    expect(s.evidence[0].claim).toContain("người");
  });

  it("dư công suất nhiều → đóng góp ÂM để thành điểm đánh đổi, không im lặng", () => {
    const p = make("tu_lanh", { fitMin: observed(9), fitMax: observed(12) });
    const s = vuaNhuCau.score(p, needs("tu_lanh", 2));
    expect(s.contribution).toBeLessThan(0);
  });

  it("thiếu dữ liệu → 0 điểm, KHÔNG phạt", () => {
    const p = make("tu_lanh", { fitMin: absent<number>("missing"), fitMax: absent<number>("missing") });
    const s = vuaNhuCau.score(p, needs("tu_lanh", 4));
    expect(s.contribution).toBe(0);
  });
});
