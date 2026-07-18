import { describe, expect, it } from "vitest";
import { validateProvenance, type Provenance } from "./provenance";
import { absent, observed } from "./status";

const VALID: Provenance = {
  sourceUrl: "https://www.dienmayxanh.com/may-lanh/x",
  recordLocation: "may_lanh.json#/products/0/specs/cong_suat",
  rawValue: "9.000 BTU",
  observedAt: "2026-07-18T02:00:00.000Z",
  normalizedValue: observed(9000),
  transformRule: "parse_btu@v1",
};

describe("validateProvenance", () => {
  it("cho qua nguồn chứng minh đủ sáu trường", () => {
    expect(validateProvenance(VALID)).toEqual([]);
  });

  it.each([
    ["sourceUrl", { sourceUrl: "" }],
    ["recordLocation", { recordLocation: "" }],
    ["observedAt", { observedAt: "" }],
    ["transformRule", { transformRule: "" }],
  ])("chặn khi thiếu %s", (field, patch) => {
    const problems = validateProvenance({ ...VALID, ...patch });
    expect(problems.join(" ")).toContain(field);
  });

  it("chặn sourceUrl không phải http(s):// hoặc file://", () => {
    const problems = validateProvenance({ ...VALID, sourceUrl: "dienmayxanh.com/x" });
    expect(problems.join(" ")).toContain("sourceUrl");
  });

  it("chặn observedAt không đúng ISO 8601", () => {
    const problems = validateProvenance({ ...VALID, observedAt: "18/07/2026" });
    expect(problems.join(" ")).toContain("ISO 8601");
  });

  it("chặn transformRule không có phiên bản", () => {
    const problems = validateProvenance({ ...VALID, transformRule: "parse_btu" });
    expect(problems.join(" ")).toContain("phiên bản");
  });

  describe("rawValue rỗng", () => {
    it("HỢP LỆ khi giá trị chuẩn hoá được đánh dấu vắng mặt", () => {
      const problems = validateProvenance({
        ...VALID,
        rawValue: "",
        normalizedValue: absent("missing"),
      });
      expect(problems).toEqual([]);
    });

    it("BỊ CHẶN khi vẫn khai là đã quan sát được — đường truy ngược đứt", () => {
      const problems = validateProvenance({
        ...VALID,
        rawValue: "",
        normalizedValue: observed(9000),
      });
      expect(problems.join(" ")).toContain("rawValue");
    });

    it("BỊ CHẶN khi giá trị chuẩn hoá là mâu thuẫn", () => {
      const problems = validateProvenance({
        ...VALID,
        rawValue: "   ",
        normalizedValue: { status: "conflicting", values: [9000, 12000] },
      });
      expect(problems.join(" ")).toContain("rawValue");
    });
  });
});
