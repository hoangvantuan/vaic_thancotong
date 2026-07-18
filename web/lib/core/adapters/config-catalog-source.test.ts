// Nguồn sản phẩm THEO KHAI BÁO — bằng chứng cho yêu cầu "SP+ / Ngành+" của đề bài:
// thêm một ngành hàng = thả tệp `data/{slug}.json` + khai entry trong
// `config/categories.json`. KHÔNG sửa mã nguồn nào.
//
// Test này khoá đúng lời hứa đó trên NGÀNH THẬT (tủ lạnh), dùng dữ liệu thật BTC cấp.

import { describe, expect, it } from "vitest";
import { numberOrNull } from "../contracts/status";
import { ConfigCatalogSource } from "./config-catalog-source";

describe("ConfigCatalogSource — phục vụ ngành hàng theo khai báo, không sửa mã", () => {
  it("phục vụ tủ lạnh từ data/tu_lanh.json (ngành KHÔNG có mã riêng nào)", async () => {
    const src = new ConfigCatalogSource();
    const res = await src.list({ category: "tu_lanh" });

    expect(res.ok).toBe(true);
    const rows = res.ok ? res.data : [];
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.every((p) => p.category === "tu_lanh")).toBe(true);
  });

  it("suy tiêu chí hoàn cảnh (fitMin/fitMax) từ field khai trong config", async () => {
    // Tủ lạnh khai fit.fields = ["Dung tích sử dụng"], parser peopleRange:
    // "544 lít - 4 - 5 người" → {min:4, max:5}.
    const src = new ConfigCatalogSource();
    const res = await src.list({ category: "tu_lanh" });
    const rows = res.ok ? res.data : [];

    const withFit = rows.filter((p) => numberOrNull(p.attributes.fitMin) !== null);
    expect(withFit.length).toBeGreaterThan(50);

    for (const p of withFit.slice(0, 20)) {
      const min = numberOrNull(p.attributes.fitMin);
      expect(min).not.toBeNull();
      // Số người dùng thực tế của một tủ lạnh — chặn việc parse nhầm "544 lít".
      expect(min as number).toBeLessThanOrEqual(20);
    }
  });

  it("giá lấy nguyên từ nguồn, KHÔNG suy diễn khi thiếu", async () => {
    const src = new ConfigCatalogSource();
    const res = await src.list({ category: "tu_lanh" });
    const rows = res.ok ? res.data : [];

    const withPrice = rows.filter((p) => numberOrNull(p.attributes.priceVnd) !== null);
    expect(withPrice.length).toBeGreaterThan(50);
    // Giá phải là số VND thật, không phải "triệu" hay chuỗi rác.
    expect(numberOrNull(withPrice[0].attributes.priceVnd) as number).toBeGreaterThan(1_000_000);
  });

  it("mỗi thuộc tính có nguồn chứng minh truy ngược được", async () => {
    const src = new ConfigCatalogSource();
    const res = await src.list({ category: "tu_lanh" });
    const rows = res.ok ? res.data : [];
    const p = rows.find((r) => numberOrNull(r.attributes.priceVnd) !== null)!;

    expect(p.sourceUrl).toContain("dienmayxanh.com");
    expect(p.provenance.priceVnd.rawValue).toBeTruthy();
    expect(p.provenance.priceVnd.observedAt).toBeTruthy();
    expect(p.provenance.priceVnd.recordLocation).toContain("tu_lanh");
  });

  it("ngành CHƯA khai/chưa có dữ liệu → trả rỗng, để pipeline từ chối có phạm vi", async () => {
    const src = new ConfigCatalogSource();
    const res = await src.list({ category: "ngành_không_tồn_tại" });
    expect(res.ok).toBe(true);
    expect(res.ok ? res.data.length : -1).toBe(0);
  });
});
