// ĐIỂM KẾT NỐI 1/3 — nguồn dữ liệu sản phẩm THẬT cho ngành máy lạnh (#25).
//
// Bọc dữ liệu đã nạp của #25 (`aircon-ingest`, có nguồn chứng minh 6 trường mỗi giá
// trị) thành `SourcedProduct` đúng hợp đồng cổng #24, với ĐÚNG các khoá thuộc tính mà
// bộ luật #26 đọc: `areaMinM2`, `areaMaxM2`, `priceVnd`, `noiseDb` (+ `capacityBtu`).
//
// KHÔNG suy diễn: mỗi thuộc tính lấy thẳng `normalizedValue` + `Provenance` từ nguồn;
// thiếu/mâu thuẫn giữ nguyên trạng thái để pipeline xử lý, không tự lấp.

import { ok, valueOrNull, type Result, type SourcedValue } from "@/lib/core/contracts/status";
import type { Provenance } from "@/lib/core/contracts/provenance";
import type {
  ProductQuery,
  ProductSource,
  SourcedProduct,
} from "@/lib/core/ports/product-source";
import {
  loadDisplayableAircons,
  type AirconField,
  type IngestedAircon,
} from "@/lib/data/aircon-ingest";

/** Khoá thuộc tính pipeline đọc ← trường đã nạp của #25. */
const ATTR_MAP: readonly [attr: string, field: AirconField][] = [
  ["areaMinM2", "roomAreaMinM2"],
  ["areaMaxM2", "roomAreaMaxM2"],
  ["priceVnd", "priceObservedVnd"],
  ["noiseDb", "noiseIndoorMinDb"],
  ["capacityBtu", "coolingCapacityBtu"],
];

function toSourcedProduct(rec: IngestedAircon): SourcedProduct | null {
  const id =
    rec.identifiers.product_id ??
    rec.identifiers.sku ??
    rec.identifiers.model_code ??
    rec.identifiers.productcode;
  if (!id) return null;

  const nameVal = valueOrNull(rec.fields.name.normalizedValue);
  const displayName =
    typeof nameVal === "string" && nameVal.trim()
      ? nameVal.trim()
      : rec.identifiers.name ?? String(id);

  const attributes: Record<string, SourcedValue<string | number>> = {};
  const provenance: Record<string, Provenance> = {};
  for (const [attr, field] of ATTR_MAP) {
    const prov = rec.fields[field];
    if (!prov) continue;
    attributes[attr] = prov.normalizedValue;
    provenance[attr] = prov;
  }

  const anchor = rec.fields.priceObservedVnd ?? rec.fields.name;
  return {
    id: String(id),
    category: "may_lanh",
    displayName: String(displayName),
    sourceUrl: rec.fields.name?.sourceUrl ?? anchor?.sourceUrl ?? "file://catalog/may_lanh",
    attributes,
    provenance,
    observedAt: anchor?.observedAt ?? new Date().toISOString(),
  };
}

export class AirconCatalogSource implements ProductSource {
  readonly name = "aircon-catalog@25";
  private cache: SourcedProduct[] | null = null;

  private async all(): Promise<SourcedProduct[]> {
    if (!this.cache) {
      const recs = await loadDisplayableAircons();
      this.cache = recs
        .map(toSourcedProduct)
        .filter((p): p is SourcedProduct => p !== null);
    }
    return this.cache;
  }

  async list(query: ProductQuery): Promise<Result<readonly SourcedProduct[]>> {
    // Bản trình diễn chỉ phục vụ máy lạnh; ngành khác trả rỗng → pipeline từ chối có phạm vi.
    if (query.category !== "may_lanh") return ok([]);
    const all = await this.all();
    return ok(query.limit ? all.slice(0, query.limit) : all);
  }

  async getById(id: string): Promise<Result<SourcedProduct | null>> {
    const all = await this.all();
    return ok(all.find((p) => p.id === id) ?? null);
  }
}
