// Luật cứng + tiêu chí mềm + phá hoà (bảng quy tắc mục 3–5).
//
// Khoá các hành vi phiếu #26 chấm: loại là loại hẳn kèm lý do, thiếu dữ liệu an
// toàn thì đóng an toàn, thiếu ở tiêu chí mềm KHÔNG tự thành điểm phạt, ngang
// hạng được ghi nhận và thứ tự ổn định theo mã sản phẩm.

import { describe, expect, it } from "vitest";
import { absent, conflicting, observed } from "../contracts/status";
import { screenProducts } from "../pipeline/screening";
import { rankProducts } from "../pipeline/ranking";
import { eligibleIds } from "../contracts/eligibility";
import { fixtureNeeds as needs, makeProduct } from "../testing/rule-fixtures";
import {
  DEMO_HARD_RULES,
  DEMO_SOFT_CRITERIA,
  PRODUCT_CODE_TIE_BREAKER,
  phamViDienTich,
  tranNganSach,
} from "./catalog-rules";

const FIT_OK = makeProduct("ml-a", {
  areaMinM2: observed(15),
  areaMaxM2: observed(20),
  priceVnd: observed(10_000_000),
  noiseDb: observed(25),
});

describe("pham_vi_dien_tich@v1 (an toàn/tương thích)", () => {
  it("trong phạm vi → eligible, kèm bằng chứng có nguồn", () => {
    const f = phamViDienTich.evaluate(FIT_OK, needs());
    expect(f.verdict).toBe("eligible");
    expect(f.evidence.length).toBeGreaterThan(0);
    expect(f.evidence[0].provenance.recordLocation).toContain("areaM");
  });

  it("máy quá yếu so với phòng (max + 5 < S) → excluded, không phải trade-off", () => {
    const f = phamViDienTich.evaluate(FIT_OK, needs({ fitValue: 45 }));
    expect(f.verdict).toBe("excluded");
    expect(f.explanation).toContain("45");
  });

  it("khách nêu diện tích mà máy KHÔNG có dữ liệu phạm vi → unverified, đóng an toàn thành loại", () => {
    const noArea = makeProduct("ml-noarea", { priceVnd: observed(9_000_000) });
    const f = phamViDienTich.evaluate(noArea, needs());
    expect(f.verdict).toBe("unverified");

    // Qua bộ máy lọc của #24: luật an toàn + unverified = excluded.
    const report = screenProducts([noArea], needs(), DEMO_HARD_RULES, "may-lanh@v1");
    expect(report.rows[0].verdict).toBe("excluded");
  });

  it("dữ liệu phạm vi MÂU THUẪN → không đoán, unverified", () => {
    const conflicted = makeProduct("ml-conf", {
      areaMinM2: observed(15),
      areaMaxM2: conflicting([20, 30]),
      priceVnd: observed(9_000_000),
    });
    const f = phamViDienTich.evaluate(conflicted, needs());
    expect(f.verdict).toBe("unverified");
  });

  it("khách CHƯA nêu diện tích → luật không ràng buộc", () => {
    const noArea = makeProduct("ml-noarea", { priceVnd: observed(9_000_000) });
    const f = phamViDienTich.evaluate(noArea, needs({ fitValue: null }));
    expect(f.verdict).toBe("eligible");
  });
});

describe("tran_ngan_sach@v1 (không an toàn — thiếu giá không tự thành loại)", () => {
  it("giá vượt ngân sách → excluded kèm số cụ thể trong diễn giải", () => {
    const f = tranNganSach.evaluate(FIT_OK, needs({ budgetVnd: 9_000_000 }));
    expect(f.verdict).toBe("excluded");
    expect(f.explanation).toMatch(/10[.,]000[.,]000/);
  });

  it("thiếu giá → unverified; verdict tổng vẫn là unverified, KHÔNG phải excluded", () => {
    const noPrice = makeProduct("ml-noprice", {
      areaMinM2: observed(15),
      areaMaxM2: observed(20),
      priceVnd: absent("undisclosed"),
    });
    expect(tranNganSach.evaluate(noPrice, needs()).verdict).toBe("unverified");
    const report = screenProducts([noPrice], needs(), DEMO_HARD_RULES, "may-lanh@v1");
    expect(report.rows[0].verdict).toBe("unverified");
    expect(eligibleIds(report)).toEqual([]); // vẫn không được sang xếp hạng
  });

  it("giá mâu thuẫn → unverified, giữ cả hai phía trong bằng chứng", () => {
    const conflicted = makeProduct("ml-conf", {
      areaMinM2: observed(15),
      areaMaxM2: observed(20),
      priceVnd: conflicting([10_000_000, 12_000_000]),
    });
    const f = tranNganSach.evaluate(conflicted, needs());
    expect(f.verdict).toBe("unverified");
  });

  it("khách chưa nêu ngân sách → không ràng buộc", () => {
    const f = tranNganSach.evaluate(FIT_OK, needs({ budgetVnd: null }));
    expect(f.verdict).toBe("eligible");
  });
});

describe("tiêu chí mềm (ranker@v1)", () => {
  it("thiếu dữ liệu ở tiêu chí mềm → đóng góp 0, KHÔNG phạt", () => {
    const noNoise = makeProduct("ml-nonoise", {
      areaMinM2: observed(15),
      areaMaxM2: observed(20),
      priceVnd: observed(10_000_000),
    });
    const noise = DEMO_SOFT_CRITERIA.find((c) => c.id === "do_on_thap@v1")!;
    expect(noise.score(noNoise, needs()).contribution).toBe(0);
  });

  it("khách ưu tiên 'quiet' → độ ồn nặng ký hơn (×0.75 thay vì ×0.5)", () => {
    const noise = DEMO_SOFT_CRITERIA.find((c) => c.id === "do_on_thap@v1")!;
    const base = noise.score(FIT_OK, needs()).contribution;
    const boosted = noise.score(FIT_OK, needs({ priorities: ["quiet"] })).contribution;
    expect(boosted).toBeCloseTo(base * 1.5, 10);
  });

  it("máy QUÁ dư công suất → đóng góp ÂM (thang [-1,1]), để thành điểm đánh đổi", () => {
    // Phòng 5m² nhưng máy cho 20–25m²: 1 − (20 − 5)/10 = −0.5.
    const oversized = makeProduct("ml-big", {
      areaMinM2: observed(20),
      areaMaxM2: observed(25),
      priceVnd: observed(10_000_000),
    });
    const fit = DEMO_SOFT_CRITERIA.find((c) => c.id === "vua_dien_tich@v1")!;
    const c = fit.score(oversized, needs({ fitValue: 5 }));
    expect(c.contribution).toBeLessThan(0);
    expect(c.contribution).toBeGreaterThanOrEqual(-1);
    expect(c.evidence.length).toBeGreaterThan(0); // điểm trừ cũng phải có nguồn
  });

  it("mỗi đóng góp khác 0 phải mang bằng chứng có nguồn", () => {
    for (const c of DEMO_SOFT_CRITERIA) {
      const contribution = c.score(FIT_OK, needs());
      if (contribution.contribution !== 0) {
        expect(contribution.evidence.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("ngang hạng & thứ tự ổn định (ma_san_pham@v1)", () => {
  it("hai sản phẩm giống hệt → ghi nhận hoà, thứ tự theo mã sản phẩm, tái lập được", () => {
    const twinB = makeProduct("ml-b", {
      areaMinM2: observed(15),
      areaMaxM2: observed(20),
      priceVnd: observed(10_000_000),
      noiseDb: observed(25),
    });
    // Đưa vào theo thứ tự "b trước a" để chứng minh thứ tự KHÔNG phụ thuộc đầu vào.
    const products = [twinB, FIT_OK];
    const n = needs();
    const report = screenProducts(products, n, DEMO_HARD_RULES, "may-lanh@v1");
    const run = () =>
      rankProducts(report, products, n, DEMO_SOFT_CRITERIA, PRODUCT_CODE_TIE_BREAKER, "ranker@v1");

    const first = run();
    expect(first.rows.map((r) => r.productId)).toEqual(["ml-a", "ml-b"]);
    expect(first.rows[1].tieBreakRule).toBe("ma_san_pham@v1"); // hoà được thừa nhận

    const second = run();
    expect(second.rows.map((r) => [r.productId, r.rank])).toEqual(
      first.rows.map((r) => [r.productId, r.rank])
    );
  });
});
