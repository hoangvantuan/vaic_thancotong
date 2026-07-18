// Kiểm thử thứ tự bắt buộc (#24, "Hoàn thành khi"):
//   lọc trước xếp hạng — kiểm tra câu trả lời trước khi lưu.
//
// Phần "sai thứ tự thì không biên dịch được" được kiểm bởi `npm run typecheck`,
// không phải bởi tệp này: gọi `rankProducts` trước `screenProducts` là lỗi KIỂU,
// nên không thể viết thành một ca kiểm thử chạy được.

import { describe, expect, it } from "vitest";
import { screenProducts, type HardRule } from "./screening";
import { rankProducts, type SoftCriterion } from "./ranking";
import { declineAfterFailedPublication, verifyForPublication } from "./publication";
import { eligibleIds, excludedRows } from "../contracts/eligibility";
import { MOCK_PRODUCTS } from "../adapters/mock-product-source";
import { numberOrNull } from "../contracts/status";
import type { ExtractedNeeds } from "../ports/model-service";
import { RESULT_ASK, RESULT_RECOMMEND, sampleClaim } from "../testing/fixtures";

const NEEDS: ExtractedNeeds = {
  category: "may_lanh",
  fitValue: 18,
  budgetVnd: 12_000_000,
  priorities: ["quiet"],
  quotedSpans: ["18m2", "12 triệu"],
};

/** Luật ngân sách: vượt trần là loại. Thiếu giá thì chưa xác minh được. */
const BUDGET_RULE: HardRule = {
  id: "budget_ceiling@v1",
  safetyCritical: false,
  evaluate(product, needs) {
    const price = numberOrNull(product.attributes.priceVnd);
    if (price === null) {
      return {
        ruleId: "budget_ceiling@v1",
        verdict: "unverified",
        explanation: "Nguồn chưa công bố giá nên chưa đối chiếu được với ngân sách",
        evidence: [],
      };
    }
    const withinBudget = needs.budgetVnd === null || price <= needs.budgetVnd;
    return {
      ruleId: "budget_ceiling@v1",
      verdict: withinBudget ? "eligible" : "excluded",
      explanation: withinBudget ? "Trong ngân sách" : "Vượt ngân sách",
      evidence: [],
    };
  },
};

/** Luật tương thích công suất — CÓ chạm an toàn kỹ thuật, nên đóng an toàn. */
const CAPACITY_RULE: HardRule = {
  id: "capacity_match@v1",
  safetyCritical: true,
  evaluate(product) {
    const capacity = numberOrNull(product.attributes.capacityBtu);
    if (capacity === null) {
      return {
        ruleId: "capacity_match@v1",
        verdict: "unverified",
        explanation: "Công suất mâu thuẫn hoặc thiếu — không xác minh được tương thích",
        evidence: [],
      };
    }
    return {
      ruleId: "capacity_match@v1",
      verdict: "eligible",
      explanation: `Công suất ${capacity} BTU đọc được từ nguồn`,
      evidence: [],
    };
  },
};

const PRICE_CRITERION: SoftCriterion = {
  id: "price_value@v1",
  label: "Giá tốt",
  score(product) {
    const price = numberOrNull(product.attributes.priceVnd) ?? 0;
    return {
      criterionId: "price_value@v1",
      label: "Giá tốt",
      contribution: price === 0 ? 0 : 1 - price / 20_000_000,
      evidence: [],
    };
  },
};

describe("lọc cứng", () => {
  it("loại sản phẩm vượt ngân sách", () => {
    const report = screenProducts(MOCK_PRODUCTS, NEEDS, [BUDGET_RULE], "test@v1");
    const dual = report.rows.find((r) => r.productId === "mock-ml-003");
    // 15.49 triệu > 12 triệu
    expect(dual?.verdict).toBe("excluded");
  });

  it("giữ nguyên trạng thái chưa xác minh ở tiêu chí MỀM, không tự thành điểm yếu", () => {
    const report = screenProducts(MOCK_PRODUCTS, NEEDS, [BUDGET_RULE], "test@v1");
    // mock-ml-002 không công bố giá; luật ngân sách không chạm an toàn.
    const noPrice = report.rows.find((r) => r.productId === "mock-ml-002");
    expect(noPrice?.verdict).toBe("unverified");
  });

  it("ĐÓNG AN TOÀN khi luật chạm an toàn mà dữ liệu mâu thuẫn", () => {
    const report = screenProducts(MOCK_PRODUCTS, NEEDS, [CAPACITY_RULE], "test@v1");
    // mock-ml-003 có công suất mâu thuẫn 18000/17000 → phải bị loại, không được đoán.
    const conflicted = report.rows.find((r) => r.productId === "mock-ml-003");
    expect(conflicted?.verdict).toBe("excluded");
  });

  it("giữ lại sản phẩm bị loại kèm lý do, không trả danh sách trần", () => {
    const report = screenProducts(MOCK_PRODUCTS, NEEDS, [BUDGET_RULE], "test@v1");
    const excluded = excludedRows(report);
    expect(excluded.length).toBeGreaterThan(0);
    for (const row of excluded) {
      expect(row.findings.length).toBeGreaterThan(0);
      expect(row.findings[0].explanation).not.toBe("");
    }
  });
});

describe("xếp hạng mềm", () => {
  it("chỉ xếp hạng sản phẩm ĐÃ đủ điều kiện", () => {
    const report = screenProducts(MOCK_PRODUCTS, NEEDS, [BUDGET_RULE], "test@v1");
    const ranking = rankProducts(
      report,
      MOCK_PRODUCTS,
      NEEDS,
      [PRICE_CRITERION],
      null,
      "test@v1"
    );

    const allowed = new Set(eligibleIds(report));
    expect(ranking.rows.length).toBe(allowed.size);
    for (const row of ranking.rows) {
      expect(allowed.has(row.productId)).toBe(true);
    }
  });

  it("KHÔNG hồi sinh sản phẩm đã bị loại", () => {
    const report = screenProducts(MOCK_PRODUCTS, NEEDS, [BUDGET_RULE], "test@v1");
    const ranking = rankProducts(
      report,
      MOCK_PRODUCTS,
      NEEDS,
      [PRICE_CRITERION],
      null,
      "test@v1"
    );
    const rankedIds = ranking.rows.map((r) => r.productId);
    expect(rankedIds).not.toContain("mock-ml-003");
  });

  it("luôn kèm phân tích độ nhạy", () => {
    const report = screenProducts(MOCK_PRODUCTS, NEEDS, [BUDGET_RULE], "test@v1");
    const ranking = rankProducts(
      report,
      MOCK_PRODUCTS,
      NEEDS,
      [PRICE_CRITERION],
      null,
      "test@v1"
    );
    expect(ranking.sensitivity.length).toBeGreaterThan(0);
  });
});

describe("cổng công bố an toàn", () => {
  it("cho qua kết quả có nguồn chứng minh đủ", () => {
    const outcome = verifyForPublication(RESULT_RECOMMEND);
    expect(outcome.check.passed).toBe(true);
    expect(outcome.verified).not.toBeNull();
  });

  it("cho qua loại kết quả không mang nhận định sản phẩm", () => {
    const outcome = verifyForPublication(RESULT_ASK);
    expect(outcome.check.passed).toBe(true);
  });

  it("CHẶN kết quả có nhận định thiếu nguồn chứng minh", () => {
    const badClaim = sampleClaim("Máy này êm nhất thị trường");
    const broken = {
      ...RESULT_RECOMMEND,
      recommendations: [
        {
          ...RESULT_RECOMMEND.recommendations[0],
          reasons: [
            {
              ...badClaim,
              provenance: { ...badClaim.provenance, sourceUrl: "", transformRule: "" },
            },
          ],
        },
      ],
    } as typeof RESULT_RECOMMEND;

    const outcome = verifyForPublication(broken);
    expect(outcome.check.passed).toBe(false);
    expect(outcome.verified).toBeNull();
    expect(outcome.check.checkedClaims[0].note).toContain("thiếu sourceUrl");
  });

  it("từ chối có phạm vi luôn qua được cổng, hệ thống không bị kẹt", () => {
    const outcome = declineAfterFailedPublication("Cho em xin diện tích phòng ạ");
    expect(outcome.check.passed).toBe(true);
    expect(outcome.check.repairAttempted).toBe(true);
    expect(outcome.verified).not.toBeNull();
  });
});
