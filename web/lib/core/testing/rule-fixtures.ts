// Sản phẩm mẫu cho kiểm thử bộ luật #26 — dùng chung để các tệp test không tự
// dựng bộ mẫu riêng rồi lệch hợp đồng (cùng lý do fixtures.ts tồn tại).

import type { Provenance } from "../contracts/provenance";
import { ok, type Result, type SourcedValue } from "../contracts/status";
import type {
  ProductQuery,
  ProductSource,
  SourcedProduct,
} from "../ports/product-source";
import type { ExtractedNeeds } from "../ports/model-service";

export const FIXTURE_OBSERVED_AT = "2026-07-18T02:00:00.000Z";

function prov(
  field: string,
  rawValue: string,
  normalized: SourcedValue<string | number>
): Provenance {
  return {
    sourceUrl: "https://www.dienmayxanh.com/may-lanh/fixture",
    recordLocation: `fixture.json#/specs/${field}`,
    rawValue,
    observedAt: FIXTURE_OBSERVED_AT,
    normalizedValue: normalized,
    transformRule: `parse_${field}@v1`,
  };
}

export type RuleAttrs = Partial<{
  areaMinM2: SourcedValue<string | number>;
  areaMaxM2: SourcedValue<string | number>;
  priceVnd: SourcedValue<string | number>;
  noiseDb: SourcedValue<string | number>;
}>;

/** Sản phẩm mẫu gọn: chỉ khai giá trị, provenance dựng theo — luôn đủ 6 trường. */
export function makeProduct(id: string, attrs: RuleAttrs): SourcedProduct {
  const attributes: Record<string, SourcedValue<string | number>> = {};
  const provenance: Record<string, Provenance> = {};
  for (const [field, value] of Object.entries(attrs)) {
    attributes[field] = value;
    const raw =
      value.status === "observed"
        ? String(value.value)
        : value.status === "conflicting"
          ? value.values.join(" / ")
          : "";
    provenance[field] = prov(field, raw, value);
  }
  return {
    id,
    category: "may_lanh",
    displayName: `Máy lạnh fixture ${id}`,
    sourceUrl: "https://www.dienmayxanh.com/may-lanh/fixture",
    attributes,
    provenance,
    observedAt: FIXTURE_OBSERVED_AT,
  };
}

/** Nhu cầu đã kiểm chứng, mặc định "máy lạnh 18m², 15 triệu". */
export function fixtureNeeds(partial: Partial<ExtractedNeeds> = {}): ExtractedNeeds {
  return {
    category: "may_lanh",
    fitValue: 18,
    budgetVnd: 15_000_000,
    priorities: [],
    quotedSpans: [],
    ...partial,
  };
}

/** Nguồn sản phẩm cố định cho kiểm thử — thoả cùng hợp đồng với bản thật của #25. */
export class FixtureProductSource implements ProductSource {
  readonly name = "fixture";

  constructor(private readonly products: readonly SourcedProduct[]) {}

  async list(query: ProductQuery): Promise<Result<readonly SourcedProduct[]>> {
    const matched = this.products.filter((p) => p.category === query.category);
    return ok(query.limit ? matched.slice(0, query.limit) : matched);
  }

  async getById(id: string): Promise<Result<SourcedProduct | null>> {
    return ok(this.products.find((p) => p.id === id) ?? null);
  }
}
