// Test trên DATA THẬT (data/may_lanh.json…), port từ search/test_search.py.
//
// Khoá lại các hành vi mà đề bài chấm điểm: không bịa, hỏi ngược khi thiếu,
// top đa dạng, ngân sách là hard filter, và TÁI LẬP: cùng input → cùng output (#26).

import { beforeAll, describe, expect, it } from "vitest";
import type { NormalizedProduct } from "@/lib/types";
import { getCatalog } from "@/lib/data/catalog";
import { getCategory, type CategoryConfig } from "@/lib/data/category-config";
import { isReady, missingRequired, recommendedToAsk, signals } from "./clarify";
import { extract, extractMoney } from "./extract";
import { fold, parseAreaRange, parseEnergyLabel, parseNoise } from "./normalize";
import { search } from "./search";
import { tagToConcepts } from "./concepts";

let mayLanh: NormalizedProduct[];
let cfg: CategoryConfig;

beforeAll(async () => {
  mayLanh = await getCatalog("may_lanh");
  cfg = getCategory("may_lanh")!;
});

describe("normalize (parser 3-trạng-thái)", () => {
  it("parse phạm vi diện tích, cắt phần m³", () => {
    const v = parseAreaRange("Từ 15 - 20m² (từ 40 đến 60m³)");
    expect(v.state).toBe("ok");
    expect(v.lo).toBe(15);
    expect(v.hi).toBe(20);
  });
  it("'Dưới 15m²' → 0..15; 'Trên 160m²' → 160..999", () => {
    expect(parseAreaRange("Dưới 15m² (dưới 45m³)")).toMatchObject({ lo: 0, hi: 15 });
    expect(parseAreaRange("Trên 160m²")).toMatchObject({ lo: 160, hi: 999 });
  });
  it("sentinel 'Hãng không công bố' → undisclosed, không bịa số", () => {
    const v = parseAreaRange("Hãng không công bố");
    expect(v.state).toBe("undisclosed");
    expect(v.lo).toBeNull();
  });
  it("độ ồn: chỉ lấy dàn lạnh, bỏ dàn nóng", () => {
    const v = parseNoise("Dàn lạnh: 45/34/29 dB - Dàn nóng: 51 dB");
    expect(v.lo).toBe(29);
    expect(v.hi).toBe(45);
  });
  it("nhãn năng lượng: giữ cả sao lẫn COP", () => {
    const v = parseEnergyLabel("5 sao (Hiệu suất năng lượng 6.23)");
    expect(v.num).toBe(5);
    expect(v.hi).toBe(6.23);
  });
  it("fold bỏ dấu: 'Máy Lạnh' → 'may lanh'", () => {
    expect(fold("Máy Lạnh")).toBe("may lanh");
    expect(fold("Điều hoà")).toBe("dieu hoa");
  });
  it("tag marketing → concept: 'Chế độ ngủ ngon Best Sleep' là sleep", () => {
    expect(tagToConcepts("Chế độ ngủ ngon Best Sleep")).toContain("sleep");
    // "Khoá trẻ em" là khoá an toàn, KHÔNG phải tiện nghi cho trẻ nhỏ.
    expect(tagToConcepts("Khóa trẻ em")).not.toContain("kids_elderly");
  });
});

describe("extract (tiếng Việt văn nói, tất định)", () => {
  it("câu đề bài: đủ ngành, diện tích, ngân sách, ưu tiên", () => {
    const n = extract("máy lạnh dưới 20 triệu cho phòng ngủ 18m², tiết kiệm điện, ít ồn");
    expect(n.category).toBe("may_lanh");
    expect(n.budgetMax).toBe(20_000_000);
    expect(n.areaM2).toBe(18);
    expect(n.room).toBe("bedroom");
    expect(n.wantsEnergySaving).toBe(true);
    expect(n.concepts).toContain("quiet");
  });
  it("không dấu + viết tắt tiền: 'may lanh 18m2 duoi 20tr it on'", () => {
    const n = extract("may lanh 18m2 duoi 20tr it on");
    expect(n.category).toBe("may_lanh");
    expect(n.budgetMax).toBe(20_000_000);
    expect(n.areaM2).toBe(18);
  });
  it("tiền văn nói: '20 củ', '9tr5', khoảng '10-15 triệu'", () => {
    expect(extractMoney(fold("tầm 20 củ"))[1]).toBe(20_000_000);
    expect(extractMoney(fold("9tr5"))[1]).toBe(9_500_000);
    expect(extractMoney(fold("từ 10 đến 15 triệu"))).toEqual([10_000_000, 15_000_000]);
  });
  it("'ngu' không được khớp trong 'nguoi' (khớp trọn từ)", () => {
    const n = extract("tủ lạnh cho nhà 4 người");
    expect(n.room).toBeNull();
    expect(n.people).toBe(4);
    expect(n.category).toBe("tu_lanh");
  });
  it("hãng chỉ nhận khi khớp trọn từ, từ danh sách hãng thật", () => {
    const brands = [...new Set(mayLanh.map((p) => p.brand))];
    const n = extract("máy lạnh LG cho phòng 20m2", { knownBrands: brands });
    expect(n.brands).toEqual(["LG"]);
    const n2 = extract("máy lạnh cho gia đình lgi", { knownBrands: brands });
    expect(n2.brands).toEqual([]);
  });
});

describe("clarify (hỏi ngược đúng chỗ)", () => {
  it("câu rỗng tín hiệu → phải hỏi tiêu chí tìm kiếm", () => {
    const n = extract("chào em, tư vấn giúp anh với");
    expect(isReady(n)).toBe(false);
    expect(missingRequired(n)).toEqual(["tiêu chí tìm kiếm"]);
  });
  it("có ngành nhưng thiếu diện tích + ngân sách → nên hỏi cả hai", () => {
    const n = extract("máy lạnh");
    expect(isReady(n)).toBe(true);
    const ask = recommendedToAsk(n);
    expect(ask).toContain("roomAreaM2");
    expect(ask).toContain("budget_max");
  });
  it("đủ ngành + diện tích + ngân sách → không cần hỏi gì", () => {
    const n = extract("máy lạnh 18m2 dưới 20 triệu");
    expect(recommendedToAsk(n)).toEqual([]);
    expect(signals(n)).toEqual(expect.arrayContaining(["category", "budget", "fit"]));
  });
});

describe("search trên data thật (may_lanh)", () => {
  const NEED_TEXT = "máy lạnh dưới 20 triệu cho phòng ngủ 18m², tiết kiệm điện, ít ồn";

  it("trả tối đa 3, tất cả CÓ giá, TRONG ngân sách, hợp 18m²", () => {
    const need = extract(NEED_TEXT);
    const r = search(mayLanh, need, cfg);
    expect(r.top.length).toBeGreaterThan(0);
    expect(r.top.length).toBeLessThanOrEqual(3);
    for (const s of r.top) {
      expect(s.product.price.hasPrice).toBe(true);
      expect(s.product.price.display!).toBeLessThanOrEqual(20_000_000);
      expect(s.product.fit).not.toBeNull(); // đã xác nhận hợp phòng, không bịa
    }
  });

  it("mọi sản phẩm top đều có lý do và mọi lý do có câu chữ", () => {
    const need = extract(NEED_TEXT);
    const r = search(mayLanh, need, cfg);
    for (const s of r.top) {
      expect(s.reasons.length).toBeGreaterThan(0);
      for (const reason of s.reasons) expect(reason.text.length).toBeGreaterThan(0);
    }
  });

  it("TÁI LẬP (#26): cùng input chạy 2 lần → cùng danh sách, cùng thứ tự, cùng điểm", () => {
    const need = extract(NEED_TEXT);
    const a = search(mayLanh, need, cfg);
    const b = search(mayLanh, need, cfg);
    expect(a.top.map((s) => [s.product.id, s.total])).toEqual(
      b.top.map((s) => [s.product.id, s.total])
    );
    expect(a.filteredOutByBudget).toBe(b.filteredOutByBudget);
  });

  it("ngân sách là HARD FILTER: không sản phẩm nào vượt, số bị loại được đếm", () => {
    const need = extract("máy lạnh 18m2 dưới 7 triệu");
    const r = search(mayLanh, need, cfg);
    for (const s of r.top) expect(s.product.price.display!).toBeLessThanOrEqual(7_000_000);
    expect(r.filteredOutByBudget).toBeGreaterThan(0);
  });

  it("máy quá yếu so với phòng bị loại thẳng (không phải trade-off)", () => {
    const need = extract("máy lạnh 45m2 dưới 50 triệu");
    const r = search(mayLanh, need, cfg);
    for (const s of r.top) {
      // fit đã parse: hi + 5 >= 45, không bán máy phòng 15m² cho phòng 45m².
      expect(s.product.fit!.max == null || s.product.fit!.max + 5 >= 45).toBe(true);
    }
  });

  it("top 3 đa dạng: không bao giờ 3 máy cùng hãng", () => {
    const need = extract(NEED_TEXT);
    const r = search(mayLanh, need, cfg);
    if (r.top.length === 3) {
      const brands = new Set(r.top.map((s) => s.product.brand));
      expect(brands.size).toBeGreaterThan(1);
    }
  });

  it("ưu tiên 'ít ồn' phòng ngủ: top phải nói được về độ ồn (lý do hoặc nhược điểm)", () => {
    const need = extract(NEED_TEXT);
    const r = search(mayLanh, need, cfg);
    for (const s of r.top) {
      const mentionsNoise =
        s.reasons.some((x) => x.criterion === "quiet") ||
        s.caveats.some((c) => c.includes("ồn"));
      expect(mentionsNoise).toBe(true);
    }
  });

  it("không khen suông: sản phẩm có mặt chưa xuất sắc phải mang caveat", () => {
    const need = extract("máy lạnh 30m2 dưới 30 triệu");
    const r = search(mayLanh, need, cfg);
    for (const s of r.top) {
      const weak = s.reasons.some(
        (x) => (x.criterion === "quiet" || x.criterion === "energy") && x.score < 0.6
      );
      if (weak) expect(s.caveats.length).toBeGreaterThan(0);
    }
  });

  it("khách hỏi hãng cụ thể → chỉ trả hãng đó", () => {
    const brands = [...new Set(mayLanh.map((p) => p.brand))];
    const need = extract("máy lạnh Daikin 18m2 dưới 25 triệu", { knownBrands: brands });
    const r = search(mayLanh, need, cfg);
    expect(r.top.length).toBeGreaterThan(0);
    for (const s of r.top) expect(s.product.brand).toBe("Daikin");
  });

  it("ngành sai không lọt: need tu_lanh trên catalog may_lanh → 0 kết quả", () => {
    const need = extract("tủ lạnh cho 4 người dưới 15 triệu");
    const r = search(mayLanh, need, cfg);
    expect(r.top).toEqual([]);
    expect(r.totalMatched).toBe(0);
  });
});

describe("search đa ngành (tủ lạnh — fit theo số người)", () => {
  it("tủ lạnh nhà 4 người dưới 15 triệu: top hợp số người, trong ngân sách", async () => {
    const tuLanh = await getCatalog("tu_lanh");
    const tCfg = getCategory("tu_lanh")!;
    const need = extract("tủ lạnh cho nhà 4 người dưới 15 triệu");
    const r = search(tuLanh, need, tCfg);
    expect(r.top.length).toBeGreaterThan(0);
    for (const s of r.top) {
      expect(s.product.price.display!).toBeLessThanOrEqual(15_000_000);
      const fit = s.product.fit!;
      expect(fit.min <= 4 && (fit.max == null || 4 <= fit.max)).toBe(true);
    }
  });
});
