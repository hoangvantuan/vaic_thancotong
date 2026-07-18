// Kiểm thử đường phục vụ đầu-cuối: một lượt đi trọn chuỗi
// lọc → xếp hạng → cổng công bố → lưu → trả kết quả.

import { beforeEach, describe, expect, it } from "vitest";
import { runTurn, EMPTY_RULES, type TurnRules } from "./run-turn";
import { createTestServices, type CoreServices } from "../composition";
import { newTurnId } from "../contracts/ids";
import { numberOrNull } from "../contracts/status";
import type { HardRule } from "./screening";
import type { SoftCriterion } from "./ranking";
import type { TurnInput } from "../contracts/turn";

const BUDGET_RULE: HardRule = {
  id: "budget_ceiling@v1",
  safetyCritical: false,
  evaluate(product, needs) {
    const price = numberOrNull(product.attributes.priceVnd);
    if (price === null) {
      return {
        ruleId: "budget_ceiling@v1",
        verdict: "unverified",
        explanation: "Nguồn chưa công bố giá",
        evidence: [],
      };
    }
    const within = needs.budgetVnd === null || price <= needs.budgetVnd;
    return {
      ruleId: "budget_ceiling@v1",
      verdict: within ? "eligible" : "excluded",
      explanation: within ? "Trong ngân sách" : "Vượt ngân sách",
      evidence: [],
    };
  },
};

const CHEAPER_BETTER: SoftCriterion = {
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

const RULES: TurnRules = {
  hard: [BUDGET_RULE],
  soft: [CHEAPER_BETTER],
  tieBreaker: null,
  rulesetVersion: "test@v1",
  rankerVersion: "test@v1",
};

describe("runTurn", () => {
  let services: CoreServices;

  beforeEach(() => {
    services = createTestServices();
  });

  async function newSession() {
    const created = await services.store.createSession();
    if (!created.ok) throw new Error("không tạo được phiên");
    return created.data;
  }

  function input(sessionId: TurnInput["sessionId"], userText: string): TurnInput {
    return {
      sessionId,
      turnId: newTurnId(),
      userText,
      category: "may_lanh",
      receivedAt: new Date().toISOString(),
    };
  }

  it("chạy trọn một lượt và trả khuyến nghị đã lưu", async () => {
    const { session, secret } = await newSession();
    const turn = input(session.sessionId, "Phòng em 18m2, ngân sách 12 triệu, muốn máy lạnh");

    const result = await runTurn(turn, secret, services, RULES);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.result.kind).toBe("recommend");
    // Chỉ sản phẩm trong ngân sách mới lọt: mock-ml-003 giá 15.49tr phải bị loại.
    if (result.data.result.kind !== "recommend") return;
    const ids = result.data.result.recommendations.map((r) => r.productId);
    expect(ids).not.toContain("mock-ml-003");
  });

  it("ảnh chụp quyết định giữ CẢ báo cáo lọc lẫn báo cáo xếp hạng", async () => {
    const { session, secret } = await newSession();
    const turn = input(session.sessionId, "máy lạnh cho phòng 18m2, 12 triệu");

    const result = await runTurn(turn, secret, services, RULES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.eligibility).not.toBeNull();
    expect(result.data.ranking).not.toBeNull();
    // Báo cáo lọc phải giữ cả sản phẩm bị loại kèm lý do.
    expect(result.data.eligibility!.rows.length).toBe(3);
  });

  it("gửi lại cùng mã lượt trả đúng bản ghi cũ, không chạy lại luồng", async () => {
    const { session, secret } = await newSession();
    const turn = input(session.sessionId, "máy lạnh 18m2 12 triệu");

    const first = await runTurn(turn, secret, services, RULES);
    const second = await runTurn(turn, secret, services, RULES);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    // Cùng thời điểm tạo nghĩa là bản ghi cũ được trả lại, không dựng bản mới.
    expect(second.data.createdAt).toBe(first.data.createdAt);

    const all = await services.store.listDecisions(session.sessionId, secret);
    expect(all.ok && all.data.length).toBe(1);
  });

  it("từ chối có phạm vi khi không sản phẩm nào qua cổng", async () => {
    const { session, secret } = await newSession();
    const broke: TurnRules = {
      ...RULES,
      hard: [
        {
          id: "reject_all@v1",
          safetyCritical: true,
          evaluate: () => ({
            ruleId: "reject_all@v1",
            verdict: "excluded" as const,
            explanation: "Luật kiểm thử loại mọi sản phẩm",
            evidence: [],
          }),
        },
      ],
    };

    const result = await runTurn(input(session.sessionId, "máy lạnh"), secret, services, broke);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.result.kind).toBe("decline");
    if (result.data.result.kind !== "decline") return;
    expect(result.data.result.reason).toBe("no_eligible_product");
    // Từ chối vẫn phải nói khách cần bổ sung gì.
    expect(result.data.result.whatWouldHelp).not.toBe("");
  });

  it("không lưu được lượt bằng mã bí mật của phiên khác", async () => {
    const a = await newSession();
    const b = await newSession();

    const result = await runTurn(
      input(a.session.sessionId, "máy lạnh 18m2"),
      b.secret,
      services,
      RULES
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("forbidden");
  });

  it("bộ luật rỗng vẫn chạy được, mọi sản phẩm đều đủ điều kiện", async () => {
    const { session, secret } = await newSession();

    const result = await runTurn(
      input(session.sessionId, "máy lạnh"),
      secret,
      services,
      EMPTY_RULES
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.result.kind).toBe("recommend");
  });
});

describe("dựng lý do khuyến nghị", () => {
  it("KHÔNG lấy giá trị vắng mặt hay mâu thuẫn làm lý do nên chọn", async () => {
    const services = createTestServices();
    const created = await services.store.createSession();
    if (!created.ok) throw new Error("không tạo được phiên");
    const { session, secret } = created.data;

    const result = await runTurn(
      {
        sessionId: session.sessionId,
        turnId: newTurnId(),
        userText: "máy lạnh",
        category: "may_lanh",
        receivedAt: new Date().toISOString(),
      },
      secret,
      services,
      EMPTY_RULES
    );

    expect(result.ok).toBe(true);
    if (!result.ok || result.data.result.kind !== "recommend") return;

    for (const rec of result.data.result.recommendations) {
      for (const reason of rec.reasons) {
        // Mọi lý do phải dựa trên giá trị đã quan sát được.
        expect(reason.provenance.normalizedValue.status).toBe("observed");
        expect(reason.provenance.rawValue.trim()).not.toBe("");
      }
    }

    // mock-ml-002 thiếu giá và độ ồn → chỉ còn công suất làm lý do.
    const standard = result.data.result.recommendations.find(
      (r) => r.productId === "mock-ml-002"
    );
    expect(standard?.reasons.length).toBe(1);
  });
});
