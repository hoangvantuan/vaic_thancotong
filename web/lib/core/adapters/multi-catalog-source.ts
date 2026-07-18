// NGUỒN SẢN PHẨM ĐA NGÀNH — bộ ghép.
//
// Máy lạnh đi qua `AirconCatalogSource` (dữ liệu đã nạp kèm nguồn chứng minh của
// #25, giàu độ ồn/tiết kiệm điện — giữ NGUYÊN chất lượng demo hiện tại).
// Mọi ngành khác đi qua `ConfigCatalogSource` (đọc data/{slug}.json theo khai báo
// trong config/categories.json) — đúng lời hứa "SP+ / Ngành+" của đề bài.
//
// Nhờ vậy mở thêm ngành = thả dữ liệu + khai báo registry, KHÔNG sửa logic lõi.

import type { ProductQuery, ProductSource, SourcedProduct } from "@/lib/core/ports/product-source";
import type { Result } from "@/lib/core/contracts/status";
import { AirconCatalogSource } from "./aircon-catalog-source";
import { ConfigCatalogSource } from "./config-catalog-source";

export class MultiCatalogSource implements ProductSource {
  readonly name = "multi-catalog@v1";
  private readonly aircon = new AirconCatalogSource();
  private readonly generic = new ConfigCatalogSource();

  async list(query: ProductQuery): Promise<Result<readonly SourcedProduct[]>> {
    return query.category === "may_lanh" ? this.aircon.list(query) : this.generic.list(query);
  }

  async getById(id: string): Promise<Result<SourcedProduct | null>> {
    const fromAircon = await this.aircon.getById(id);
    if (fromAircon.ok && fromAircon.data) return fromAircon;
    return this.generic.getById(id);
  }
}
