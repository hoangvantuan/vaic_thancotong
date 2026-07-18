// Kiểm thử khói cho accessor dữ liệu máy lạnh đã nạp (#25): dữ liệu bàn giao
// trong data/ingest/ phải tự nhất quán với báo cáo nạp — KHÔNG đối chiếu số viết
// cứng, chỉ đối chiếu chéo giữa hai sản phẩm của cùng một lần nạp.

import { describe, expect, it } from "vitest";
import report from "@/data/ingest/ingest-report.json";
import { validateProvenance } from "@/lib/core/contracts/provenance";
import {
  fieldProvenance,
  loadDisplayableAircons,
  loadIngestedAircons,
  observedPrice,
} from "./aircon-ingest";

describe("accessor dữ liệu máy lạnh đã nạp", () => {
  it("tổng bản ghi và số đủ điều kiện khớp báo cáo nạp", async () => {
    const all = await loadIngestedAircons();
    const displayable = await loadDisplayableAircons();
    expect(all.length).toBe(report.aircon.airconRecords);
    expect(displayable.length).toBe(report.aircon.airconDisplayEligible);
    // Nạp tệp đã ingest ~4.3MB: lần đầu (cache nguội) dễ vượt mốc 5s mặc định.
  }, 30_000);

  it("danh sách hiển thị không chứa bản ghi thiếu thông tin nhận biết", async () => {
    for (const r of await loadDisplayableAircons()) {
      expect(r.displayIneligibilityReasons).toEqual([]);
      const { product_id, sku, model_code, productcode, name } = r.identifiers;
      expect(product_id ?? sku ?? model_code ?? productcode ?? name).toBeTruthy();
    }
  }, 30_000);

  it("mọi trường của bản ghi hiển thị đều có nguồn chứng minh qua được cổng hợp đồng", async () => {
    const [first] = await loadDisplayableAircons();
    for (const field of Object.keys(first.fields) as (keyof typeof first.fields)[]) {
      expect(validateProvenance(fieldProvenance(first, field))).toEqual([]);
    }
  }, 30_000);

  it("giá là giá ĐÃ QUAN SÁT kèm thời điểm, khớp số liệu báo cáo", async () => {
    const displayable = await loadDisplayableAircons();
    const priced = displayable
      .map((r) => observedPrice(r))
      .filter((p): p is NonNullable<typeof p> => p !== null);
    expect(priced.length).toBe(report.aircon.airconWithObservedPrice);
    for (const p of priced.slice(0, 5)) {
      expect(p.vnd).toBeGreaterThan(0);
      expect(p.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  }, 30_000);
});
