// MA TRẬN HOÀN THÀNH CỦA PHIẾU #26 — một lượt tư vấn trọn vẹn qua DEMO_TURN_RULES.
//
// Phủ đúng các mục "Hoàn thành khi": 0/1/2/3/3+ sản phẩm hợp lệ; dữ liệu thiếu,
// mâu thuẫn, vi phạm bắt buộc; ranh giới ask/recommend/decline; ngang hạng và thứ
// tự ổn định; sản phẩm bị loại có lý do; khuyến nghị có nguồn; đổi cách diễn đạt
// không đổi danh sách; cùng đầu vào + phiên tái tạo bản ghi giống hệt.

import { describe, expect, it } from "vitest";
import { runTurn } from "../pipeline/run-turn";
import { DEMO_TURN_RULES } from "./index";
import { createTestServices, type CoreServices } from "../composition";
import { newTurnId } from "../contracts/ids";
import { absent, conflicting, observed, ok } from "../contracts/status";
import { validateProvenance } from "../contracts/provenance";
import type { SavedDecisionRecord } from "../contracts/decision";
import type { ExtractedNeeds, IntentRead, ModelService } from "../ports/model-service";
import type { SourcedProduct } from "../ports/product-source";
import { FixtureProductSource, makeProduct } from "../testing/rule-fixtures";

const RECEIVED_AT = "2026-07-18T02:00:00.000Z";

/** Máy hợp lệ chuẩn: 15–20m², trong ngân sách 15tr, có số đo độ ồn. */
function validProduct(id: string, price = 10_000_000, noise = 25): SourcedProduct {
  return makeProduct(id, {
    areaMinM2: observed(15),
    areaMaxM2: observed(20),
    priceVnd: observed(price),
    noiseDb: observed(noise),
  });
}

async function runRound(
  products: readonly SourcedProduct[],
  userText: string,
  opts: { services?: CoreServices; category?: string } = {}
) {
  const services =
    opts.services ?? createTestServices({ products: new FixtureProductSource(products) });
  const created = await services.store.createSession();
  if (!created.ok) throw new Error("không tạo được phiên");
  const { session, secret } = created.data;

  const result = await runTurn(
    {
      sessionId: session.sessionId,
      turnId: newTurnId(),
      userText,
      category: opts.category,
      receivedAt: RECEIVED_AT,
    },
    secret,
    services,
    DEMO_TURN_RULES
  );
  if (!result.ok) throw new Error(`runTurn lỗi: ${result.error.message}`);
  return { record: result.data, services, secret, sessionId: session.sessionId };
}

const FULL_TEXT = "máy lạnh cho phòng ngủ 18m2, ngân sách 15 triệu, ít ồn";

describe("ranh giới ba kết cục", () => {
  it("chưa rõ ngành → hỏi ĐÚNG MỘT câu về ngành; chưa lọc sản phẩm nào", async () => {
    const { record } = await runRound([validProduct("ml-a")], "chào em, tư vấn giúp anh");
    expect(record.result.kind).toBe("ask_one_question");
    expect(record.eligibility).toBeNull();
    expect(record.ranking).toBeNull();
  });

  it("có ngành, thiếu diện tích → hỏi diện tích", async () => {
    const { record } = await runRound([validProduct("ml-a")], "máy lạnh tầm 15 triệu");
    expect(record.result.kind).toBe("ask_one_question");
    if (record.result.kind !== "ask_one_question") return;
    expect(record.result.targetGap).toContain("diện tích");
  });

  it("đủ thông tin nhưng 0 sản phẩm qua lọc → từ chối có phạm vi, không đệm lựa chọn yếu", async () => {
    const products = [
      validProduct("ml-over", 25_000_000), // vượt ngân sách
      makeProduct("ml-weak", {
        areaMinM2: observed(8),
        areaMaxM2: observed(12), // 12 + 5 < 18 → quá yếu
        priceVnd: observed(9_000_000),
      }),
    ];
    const { record } = await runRound(products, FULL_TEXT);
    expect(record.result.kind).toBe("decline");
    if (record.result.kind !== "decline") return;
    expect(record.result.reason).toBe("no_eligible_product");
    expect(record.result.whatWouldHelp).not.toBe("");
  });

  it("đủ thông tin, có sản phẩm qua lọc → khuyến nghị", async () => {
    const { record } = await runRound([validProduct("ml-a")], FULL_TEXT);
    expect(record.result.kind).toBe("recommend");
  });
});

describe("gợi ý gần nhất khi diện tích vượt mọi mẫu (goi_y_gan_nhat@v1)", () => {
  const bigRoomCatalog = [
    makeProduct("ml-s", {
      areaMinM2: observed(10),
      areaMaxM2: observed(15),
      priceVnd: observed(8_000_000),
    }),
    makeProduct("ml-m", {
      areaMinM2: observed(15),
      areaMaxM2: observed(20),
      priceVnd: observed(10_000_000),
    }),
    makeProduct("ml-l", {
      areaMinM2: observed(20),
      areaMaxM2: observed(30),
      priceVnd: observed(14_000_000),
    }),
    makeProduct("ml-xl", {
      areaMinM2: observed(25),
      areaMaxM2: observed(45),
      priceVnd: observed(20_000_000),
    }),
  ];

  it("1000m² → recommend 3 mẫu công suất lớn nhất, caveat nói rõ giới hạn, có tradeoff", async () => {
    const { record } = await runRound(bigRoomCatalog, "máy lạnh cho xưởng 1000m2");
    expect(record.result.kind).toBe("recommend");
    if (record.result.kind !== "recommend") return;

    // Gần 1000m² nhất = areaMaxM2 lớn nhất, giảm dần.
    expect(record.result.recommendations.map((r) => r.productId)).toEqual([
      "ml-xl",
      "ml-l",
      "ml-m",
    ]);
    expect(record.result.caveats.some((c) => c.includes("1000m²") && c.includes("45m²"))).toBe(
      true
    );
    for (const rec of record.result.recommendations) {
      expect(rec.reasons.length).toBeGreaterThan(0);
      expect(rec.tradeoffs.some((t) => t.claim.includes("1000m²"))).toBe(true);
      for (const claim of [...rec.reasons, ...rec.tradeoffs]) {
        expect(validateProvenance(claim.provenance)).toEqual([]);
      }
    }

    // Báo cáo lọc vẫn là ảnh chụp GỐC: mọi sản phẩm bị loại kèm lý do.
    expect(record.eligibility!.rows.every((r) => r.verdict !== "eligible")).toBe(true);
  });

  it("kẹt vì NGÂN SÁCH (không phải diện tích) → vẫn từ chối, không gợi ý lạc đề", async () => {
    const { record } = await runRound(
      [validProduct("ml-over", 25_000_000)],
      "máy lạnh phòng 18m2 ngân sách 15 triệu"
    );
    expect(record.result.kind).toBe("decline");
  });

  it("khách nêu ngân sách → mẫu gợi ý ưu tiên nằm trong ngân sách", async () => {
    const { record } = await runRound(bigRoomCatalog, "máy lạnh cho xưởng 1000m2, ngân sách 15 triệu");
    expect(record.result.kind).toBe("recommend");
    if (record.result.kind !== "recommend") return;
    // ml-xl (20tr) vượt ngân sách nên nhường chỗ: còn ml-l, ml-m, ml-s.
    expect(record.result.recommendations.map((r) => r.productId)).toEqual([
      "ml-l",
      "ml-m",
      "ml-s",
    ]);
  });
});

describe("số lượng khuyến nghị: 0/1/2/3/3+ sản phẩm hợp lệ", () => {
  const counts: Array<[number, number]> = [
    [1, 1],
    [2, 2],
    [3, 3],
    [5, 3], // 3+ hợp lệ vẫn chỉ trả tối đa 3
  ];

  for (const [validCount, expected] of counts) {
    it(`${validCount} sản phẩm hợp lệ → ${expected} khuyến nghị`, async () => {
      const products = Array.from({ length: validCount }, (_, i) =>
        validProduct(`ml-${String.fromCharCode(97 + i)}`, 9_000_000 + i * 1_000_000, 24 + i)
      );
      const { record } = await runRound(products, FULL_TEXT);
      expect(record.result.kind).toBe("recommend");
      if (record.result.kind !== "recommend") return;
      expect(record.result.recommendations.length).toBe(expected);
    });
  }

  it("1 hợp lệ + 2 không hợp lệ → đúng 1 khuyến nghị (không đệm)", async () => {
    const products = [
      validProduct("ml-good"),
      validProduct("ml-over", 30_000_000),
      makeProduct("ml-noarea", { priceVnd: observed(9_000_000) }),
    ];
    const { record } = await runRound(products, FULL_TEXT);
    expect(record.result.kind).toBe("recommend");
    if (record.result.kind !== "recommend") return;
    expect(record.result.recommendations.length).toBe(1);
    expect(record.result.recommendations[0].productId).toBe("ml-good");
  });
});

describe("dữ liệu thiếu, mâu thuẫn, vi phạm bắt buộc", () => {
  it("thiếu giá → unverified, không vào khuyến nghị nhưng vẫn trong báo cáo kèm lý do", async () => {
    const noPrice = makeProduct("ml-noprice", {
      areaMinM2: observed(15),
      areaMaxM2: observed(20),
      priceVnd: absent("undisclosed"),
    });
    const { record } = await runRound([validProduct("ml-good"), noPrice], FULL_TEXT);
    expect(record.result.kind).toBe("recommend");
    if (record.result.kind !== "recommend") return;
    expect(record.result.recommendations.map((r) => r.productId)).not.toContain("ml-noprice");

    const row = record.eligibility!.rows.find((r) => r.productId === "ml-noprice")!;
    expect(row.verdict).toBe("unverified");
    expect(row.findings.some((f) => f.explanation.includes("giá"))).toBe(true);
  });

  it("dữ liệu quyết định MÂU THUẪN (an toàn) → đóng an toàn = loại, có lý do", async () => {
    const conflicted = makeProduct("ml-conf", {
      areaMinM2: observed(15),
      areaMaxM2: conflicting([20, 30]),
      priceVnd: observed(9_000_000),
    });
    const { record } = await runRound([validProduct("ml-good"), conflicted], FULL_TEXT);
    const row = record.eligibility!.rows.find((r) => r.productId === "ml-conf")!;
    expect(row.verdict).toBe("excluded");
  });

  it("vi phạm bắt buộc (vượt ngân sách) → loại kèm số cụ thể; MỌI dòng bị loại đều có lý do", async () => {
    const { record } = await runRound(
      [validProduct("ml-good"), validProduct("ml-over", 25_000_000)],
      FULL_TEXT
    );
    const excluded = record.eligibility!.rows.filter((r) => r.verdict !== "eligible");
    expect(excluded.length).toBeGreaterThan(0);
    for (const row of excluded) {
      expect(row.findings.length).toBeGreaterThan(0);
      expect(row.findings.every((f) => f.explanation.trim() !== "")).toBe(true);
    }
  });
});

describe("ngang hạng và thứ tự ổn định", () => {
  it("hai máy giống hệt → hoà được ghi nhận, thứ tự theo mã sản phẩm, chạy lại y hệt", async () => {
    // Đưa "b" trước "a" để chứng minh thứ tự không phụ thuộc thứ tự đầu vào.
    const products = [validProduct("ml-b"), validProduct("ml-a")];
    const first = await runRound(products, FULL_TEXT);
    const second = await runRound(products, FULL_TEXT);

    expect(first.record.result.kind).toBe("recommend");
    if (first.record.result.kind !== "recommend" || second.record.result.kind !== "recommend")
      return;
    expect(first.record.result.recommendations.map((r) => r.productId)).toEqual(["ml-a", "ml-b"]);
    expect(second.record.result.recommendations.map((r) => r.productId)).toEqual(["ml-a", "ml-b"]);
    expect(first.record.ranking!.rows.some((r) => r.tieBreakRule === "ma_san_pham@v1")).toBe(true);
  });
});

describe("lý do, nguồn, và tính tự chứa của bản ghi", () => {
  it("mọi khuyến nghị có ≥1 lý do; mọi lý do/tradeoff có nguồn 6 trường hợp lệ", async () => {
    const products = [validProduct("ml-a", 9_000_000, 21), validProduct("ml-b", 14_000_000, 43)];
    const { record } = await runRound(products, FULL_TEXT);
    expect(record.result.kind).toBe("recommend");
    if (record.result.kind !== "recommend") return;

    for (const rec of record.result.recommendations) {
      expect(rec.reasons.length).toBeGreaterThan(0);
      for (const claim of [...rec.reasons, ...rec.tradeoffs]) {
        expect(validateProvenance(claim.provenance)).toEqual([]);
      }
    }
  });

  it("nguyên văn lời khách được giữ đúng từng ký tự trong bản ghi", async () => {
    const { record } = await runRound([validProduct("ml-a")], FULL_TEXT);
    expect(record.input.userText).toBe(FULL_TEXT);
  });

  it("bản ghi nào cũng ghi phiên bản luật đã áp dụng — kể cả lượt chỉ hỏi lại", async () => {
    const asked = await runRound([validProduct("ml-a")], "chào em");
    expect(asked.record.appliedRuleVersions).toEqual({
      ruleset: "may-lanh@v1",
      ranker: "ranker@v1",
      sufficiency: "sufficiency@v1",
      relax: "goi_y_gan_nhat@v1",
    });
  });

  it("bản ghi đọc được không cần tra cứu ngoài: lý do nêu thẳng số liệu và nhu cầu khách", async () => {
    const { record } = await runRound([validProduct("ml-a")], FULL_TEXT);
    if (record.result.kind !== "recommend") throw new Error("phải là recommend");
    const text = JSON.stringify(record.result.recommendations);
    expect(text).toContain("18m²"); // nhu cầu khách nằm ngay trong lý do
    expect(text).toMatch(/15[–\-—]20m²|15–20/); // thông số sản phẩm cũng vậy
  });

  it("thiếu ngân sách → vẫn tư vấn nhưng caveat nói rõ chưa lọc theo giá", async () => {
    const { record } = await runRound([validProduct("ml-a")], "máy lạnh phòng ngủ 18m2");
    expect(record.result.kind).toBe("recommend");
    if (record.result.kind !== "recommend") return;
    expect(record.result.caveats.some((c) => c.includes("ngân sách"))).toBe(true);
  });
});

describe("đổi cách diễn đạt không đổi danh sách sản phẩm", () => {
  it("mô hình khác (bịa số, diễn đạt khác) → cùng lời khách, cùng danh sách, cùng thứ hạng", async () => {
    // Mô hình "xấu": bịa ngân sách 5 triệu, bịa diện tích 40m², diễn đạt khác hẳn.
    const rogueModel: ModelService = {
      name: "rogue",
      async isReady() {
        return true;
      },
      async extractNeeds() {
        const needs: ExtractedNeeds = {
          category: "tu_lanh", // sai cả ngành
          fitValue: 40,
          budgetVnd: 5_000_000,
          priorities: ["cheap"],
          quotedSpans: ["hư cấu"],
        };
        return ok(needs);
      },
      async phraseQuestion() {
        return ok("một câu hỏi khác hẳn?");
      },
      async readIntent() {
        // Model "xấu" cũng cố bịa ở tầng bắt sóng — nhưng ngành đã biết (tu_lanh)
        // nên run-turn bỏ qua tầng này; kết quả vẫn phải bất biến.
        const it: IntentRead = {
          intent: "mua",
          suggestedCategory: "tu_lanh",
          reply: "câu bắt sóng bịa đặt",
        };
        return ok(it);
      },
      async answerPolicy() {
        return ok("");
      },
      async composeExplanation() {
        return ok("một cách diễn đạt hoàn toàn khác");
      },
    };

    const products = [validProduct("ml-a"), validProduct("ml-b", 14_000_000, 40)];
    const base = await runRound(products, FULL_TEXT);
    const rogue = await runRound(products, FULL_TEXT, {
      services: createTestServices({
        products: new FixtureProductSource(products),
        model: rogueModel,
      }),
    });

    if (base.record.result.kind !== "recommend" || rogue.record.result.kind !== "recommend")
      throw new Error("cả hai phải là recommend");
    // So TOÀN BỘ kết quả (cả caveats) chứ không riêng danh sách id: đầu ra mô hình
    // không được chạm vào bất kỳ byte nào của phần kết quả đã lưu.
    expect(rogue.record.result).toEqual(base.record.result);
    expect(rogue.record.ranking!.rows.map((r) => [r.productId, r.rank])).toEqual(
      base.record.ranking!.rows.map((r) => [r.productId, r.rank])
    );
  });
});

describe("tái lập bản ghi", () => {
  function stripIds(record: SavedDecisionRecord) {
    const plain = JSON.parse(JSON.stringify(record));
    delete plain.turnId;
    delete plain.input.turnId;
    return plain;
  }

  it("cùng phiên, cùng lời khách, cùng receivedAt → bản ghi giống hệt (trừ mã lượt)", async () => {
    const products = [validProduct("ml-a"), validProduct("ml-b", 12_000_000, 30)];
    const services = createTestServices({ products: new FixtureProductSource(products) });
    const created = await services.store.createSession();
    if (!created.ok) throw new Error("không tạo được phiên");
    const { session, secret } = created.data;

    const run = async () => {
      const result = await runTurn(
        {
          sessionId: session.sessionId,
          turnId: newTurnId(),
          userText: FULL_TEXT,
          receivedAt: RECEIVED_AT,
        },
        secret,
        services,
        DEMO_TURN_RULES
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    };

    const first = await run();
    const second = await run();
    expect(stripIds(second)).toEqual(stripIds(first));
    // Mọi dấu thời gian lấy từ receivedAt — không lấy giờ máy lúc chạy.
    expect(first.createdAt).toBe(RECEIVED_AT);
    expect(first.eligibility!.screenedAt).toBe(RECEIVED_AT);
    expect(first.ranking!.rankedAt).toBe(RECEIVED_AT);
  });
});

describe("tầng Hiểu ý & Bắt sóng (Intent + Empathy)", () => {
  /** Model đọc được ý định từ câu đời thường; ngành luôn null (câu không nêu ngành). */
  function empathyModel(over: Partial<IntentRead>, policyAnswer = ""): ModelService {
    return {
      name: "empathy-test",
      async isReady() {
        return true;
      },
      async extractNeeds() {
        const n: ExtractedNeeds = {
          category: null,
          fitValue: null,
          budgetVnd: null,
          priorities: [],
          quotedSpans: [],
        };
        return ok(n);
      },
      async readIntent() {
        const it: IntentRead = {
          intent: "mua",
          suggestedCategory: "may_lanh",
          reply: "Nóng thật ạ 😅 Mình tính lắp máy lạnh cho mát nhỉ?",
          ...over,
        };
        return ok(it);
      },
      async answerPolicy() {
        return ok(policyAnswer);
      },
      async phraseQuestion() {
        return ok("");
      },
      async composeExplanation() {
        return ok("x");
      },
    };
  }

  function runWith(model: ModelService, userText: string) {
    const products = [validProduct("ml-a")];
    return runRound(products, userText, {
      services: createTestServices({
        products: new FixtureProductSource(products),
        model,
      }),
    });
  }

  it("câu đời thường chưa rõ ngành + model bắt được ý định → mở lời đồng cảm, CHƯA lọc SP", async () => {
    const { record } = await runWith(empathyModel({}), "trời nóng quá, giúp tôi với");
    expect(record.result.kind).toBe("ask_one_question");
    if (record.result.kind !== "ask_one_question") return;
    expect(record.result.question).toContain("Nóng thật");
    expect(record.result.targetGap).toBe("intent:mua");
    // Tầng bắt sóng KHÔNG chạm lọc/xếp hạng — grounding giữ nguyên.
    expect(record.eligibility).toBeNull();
    expect(record.ranking).toBeNull();
  });

  it("intent ngoài mua (sự cố) → đồng cảm hỗ trợ, không ép mua", async () => {
    const model = empathyModel({
      intent: "su_co",
      suggestedCategory: null,
      reply: "Ui để em hỗ trợ ngay ạ, mình đang lỗi sản phẩm nào để em tra bảo hành?",
    });
    const { record } = await runWith(model, "đang dùng bình thường thì lại không chạy, bực thật");
    expect(record.result.kind).toBe("ask_one_question");
    if (record.result.kind !== "ask_one_question") return;
    expect(record.result.targetGap).toBe("intent:su_co");
    expect(record.result.question).toContain("hỗ trợ");
  });

  it("model không đoán được (reply rỗng) → rơi xuống luật tất định hỏi ngành như cũ", async () => {
    const model = empathyModel({ intent: "mua", suggestedCategory: null, reply: "" });
    const { record } = await runWith(model, "alo em ơi");
    expect(record.result.kind).toBe("ask_one_question");
    if (record.result.kind !== "ask_one_question") return;
    // Không phải tầng bắt sóng: targetGap do sufficiency đặt, không mang tiền tố intent:.
    expect(record.result.targetGap).not.toContain("intent:");
  });

  it("khách ỦY THÁC sau khi được hỏi → CHỐT ngành, tiến tới hỏi slot kế (KHÔNG lặp câu cũ)", async () => {
    // Tái hiện bug thật: lượt 1 hỏi máy lạnh/quạt; lượt 2 khách nói "không biết, tư vấn đi"
    // → trước đây lặp y câu cũ. Giờ phải chốt ngành đoán được và hỏi sang diện tích.
    const products = [validProduct("ml-a")];
    const services = createTestServices({
      products: new FixtureProductSource(products),
      model: empathyModel({}),
    });
    const created = await services.store.createSession();
    if (!created.ok) throw new Error("không tạo được phiên");
    const { session, secret } = created.data;

    const turn = (userText: string) =>
      runTurn(
        { sessionId: session.sessionId, turnId: newTurnId(), userText, receivedAt: RECEIVED_AT },
        secret,
        services,
        DEMO_TURN_RULES
      );

    const t1 = await turn("trời nóng quá, cứu tôi");
    if (!t1.ok) throw new Error(t1.error.message);
    expect(t1.data.result.kind).toBe("ask_one_question");
    const q1 = t1.data.result.kind === "ask_one_question" ? t1.data.result.question : "";
    expect(q1).toContain("Nóng thật");

    const t2 = await turn("tôi không biết nữa, tư vấn cho tôi đi");
    if (!t2.ok) throw new Error(t2.error.message);
    expect(t2.data.result.kind).toBe("ask_one_question");
    if (t2.data.result.kind !== "ask_one_question") return;
    // Đã TIẾN TRIỂN: không lặp câu cũ, chuyển sang hỏi diện tích của máy lạnh.
    expect(t2.data.result.question).not.toBe(q1);
    expect(t2.data.result.targetGap).not.toContain("intent:");
    expect(t2.data.result.targetGap.toLowerCase()).toContain("diện tích");
  });

  it("NHỚ ngành đã chốt qua các lượt → không hỏi lại ngành, tư vấn khi đủ thông tin", async () => {
    // Tái hiện bug ảnh lượt 3: sau khi đã chốt máy lạnh + trả lời diện tích, bot KHÔNG
    // được quay lại hỏi 'máy lạnh hay quạt' nữa — phải đi tiếp (tư vấn/hỏi slot kế).
    const products = [
      makeProduct("ml-small", {
        areaMinM2: observed(8),
        areaMaxM2: observed(15),
        priceVnd: observed(8_000_000),
        noiseDb: observed(25),
      }),
    ];
    const services = createTestServices({
      products: new FixtureProductSource(products),
      model: empathyModel({}),
    });
    const created = await services.store.createSession();
    if (!created.ok) throw new Error("không tạo được phiên");
    const { session, secret } = created.data;
    const turn = (userText: string) =>
      runTurn(
        { sessionId: session.sessionId, turnId: newTurnId(), userText, receivedAt: RECEIVED_AT },
        secret,
        services,
        DEMO_TURN_RULES
      );

    const t1 = await turn("trời nóng quá, cứu tôi"); // hỏi máy lạnh/quạt
    const t2 = await turn("tôi không biết nữa, tư vấn cho tôi đi"); // chốt máy lạnh, hỏi diện tích
    const t3 = await turn("phòng em 10m2"); // đủ ngành + diện tích
    for (const t of [t1, t2, t3]) if (!t.ok) throw new Error(t.error.message);
    if (!t3.ok) return;

    // Ngành máy lạnh được GHI NHỚ trong ảnh chụp (dialogue state).
    expect(t3.data.establishedCategory).toBe("may_lanh");
    // KHÔNG quay lại hỏi ngành (tầng bắt sóng không chạy lại nhờ nhớ ngành)…
    if (t3.data.result.kind === "ask_one_question") {
      expect(t3.data.result.targetGap).not.toContain("intent:");
    }
    // …và đủ ngành + diện tích thì TƯ VẤN luôn, không kẹt.
    expect(t3.data.result.kind).toBe("recommend");
  });

  it("câu hỏi CHÍNH SÁCH → trả lời CÓ NGUỒN từ tài liệu (không hỏi lại chung chung)", async () => {
    const grounded =
      "Dạ máy lạnh được bảo hành 24 tháng ạ.\n\n(Nguồn: chính sách ĐMX — Bảo hành đổi trả)";
    const model = empathyModel(
      { intent: "chinh_sach", suggestedCategory: null, reply: "để em kiểm tra chính sách nhé" },
      grounded
    );
    const { record } = await runWith(model, "máy lạnh bảo hành mấy năm vậy em?");
    expect(record.result.kind).toBe("ask_one_question");
    if (record.result.kind !== "ask_one_question") return;
    expect(record.result.question).toBe(grounded);
    expect(record.result.targetGap).toBe("policy:answer");
    // Trả lời chính sách không đi qua lọc/xếp hạng sản phẩm.
    expect(record.eligibility).toBeNull();
  });

  it("hỏi chính sách nhưng không tra được tài liệu → hỏi lại cho rõ (KHÔNG bịa)", async () => {
    const model = empathyModel(
      {
        intent: "chinh_sach",
        suggestedCategory: null,
        reply: "Dạ để em kiểm tra chính sách giúp mình, anh/chị hỏi về bảo hành hay giao lắp ạ?",
      },
      "" // answerPolicy rỗng: không match tài liệu
    );
    const { record } = await runWith(model, "chính sách của shop thế nào");
    expect(record.result.kind).toBe("ask_one_question");
    if (record.result.kind !== "ask_one_question") return;
    expect(record.result.targetGap).toBe("intent:chinh_sach");
  });
});
