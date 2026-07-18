// BỘ KẾT NỐI GIẢ — nguồn dữ liệu sản phẩm.
//
// Kết quả CỐ ĐỊNH, không đọc đĩa, không gọi mạng. Nhờ vậy các phiếu #26–#30 chạy
// và kiểm thử được khi phiếu #25 (nạp dữ liệu thật) chưa xong.
//
// Tập mẫu cố ý gồm cả dữ liệu thiếu và dữ liệu mâu thuẫn, để nhóm nào cũng phải
// xử lý những trạng thái đó ngay từ đầu thay vì giả định dữ liệu luôn sạch.

import type { Provenance } from "../contracts/provenance";
import { absent, conflicting, observed, ok, type SourcedValue } from "../contracts/status";
import type { Result } from "../contracts/status";
import type {
  ProductQuery,
  ProductSource,
  SourcedProduct,
} from "../ports/product-source";

const OBSERVED_AT = "2026-07-18T02:00:00.000Z";

function prov(
  productIndex: number,
  field: string,
  rawValue: string,
  normalizedValue: SourcedValue<string | number>,
  transformRule: string
): Provenance {
  return {
    sourceUrl: `https://www.dienmayxanh.com/may-lanh/mock-${productIndex}`,
    recordLocation: `mock_may_lanh.json#/products/${productIndex}/specs/${field}`,
    rawValue,
    observedAt: OBSERVED_AT,
    normalizedValue,
    transformRule,
  };
}

/** Ba sản phẩm mẫu: một đầy đủ, một thiếu giá, một mâu thuẫn công suất. */
export const MOCK_PRODUCTS: readonly SourcedProduct[] = [
  {
    id: "mock-ml-001",
    category: "may_lanh",
    displayName: "Máy lạnh Mock Inverter 9000BTU",
    sourceUrl: "https://www.dienmayxanh.com/may-lanh/mock-0",
    attributes: {
      capacityBtu: observed(9000),
      priceVnd: observed(8_990_000),
      noiseDb: observed(19),
    },
    provenance: {
      capacityBtu: prov(0, "cong_suat", "9.000 BTU", observed(9000), "parse_btu@v1"),
      priceVnd: prov(0, "gia", "8.990.000₫", observed(8_990_000), "parse_vnd@v1"),
      noiseDb: prov(0, "do_on", "19 dB", observed(19), "parse_db@v1"),
    },
    observedAt: OBSERVED_AT,
  },
  {
    id: "mock-ml-002",
    category: "may_lanh",
    displayName: "Máy lạnh Mock Standard 12000BTU",
    sourceUrl: "https://www.dienmayxanh.com/may-lanh/mock-1",
    attributes: {
      capacityBtu: observed(12000),
      // Nguồn không công bố giá — KHÔNG được biến thành 0 hay null trần.
      priceVnd: absent("undisclosed"),
      noiseDb: absent("missing"),
    },
    provenance: {
      capacityBtu: prov(1, "cong_suat", "12.000 BTU", observed(12000), "parse_btu@v1"),
      priceVnd: prov(1, "gia", "Liên hệ", absent("undisclosed"), "parse_vnd@v1"),
      noiseDb: prov(1, "do_on", "", absent("missing"), "parse_db@v1"),
    },
    observedAt: OBSERVED_AT,
  },
  {
    id: "mock-ml-003",
    category: "may_lanh",
    displayName: "Máy lạnh Mock Dual 18000BTU",
    sourceUrl: "https://www.dienmayxanh.com/may-lanh/mock-2",
    attributes: {
      // Trang liệt kê 18000 ở tiêu đề nhưng 17000 trong bảng thông số — giữ CẢ HAI.
      capacityBtu: conflicting([18000, 17000]),
      priceVnd: observed(15_490_000),
      noiseDb: observed(24),
    },
    provenance: {
      capacityBtu: prov(
        2,
        "cong_suat",
        "18.000 BTU (tiêu đề) / 17.000 BTU (bảng thông số)",
        conflicting([18000, 17000]),
        "parse_btu@v1"
      ),
      priceVnd: prov(2, "gia", "15.490.000₫", observed(15_490_000), "parse_vnd@v1"),
      noiseDb: prov(2, "do_on", "24 dB", observed(24), "parse_db@v1"),
    },
    observedAt: OBSERVED_AT,
  },
];

export class MockProductSource implements ProductSource {
  readonly name = "mock";

  async list(query: ProductQuery): Promise<Result<readonly SourcedProduct[]>> {
    const matched = MOCK_PRODUCTS.filter((p) => p.category === query.category);
    return ok(query.limit ? matched.slice(0, query.limit) : matched);
  }

  async getById(id: string): Promise<Result<SourcedProduct | null>> {
    return ok(MOCK_PRODUCTS.find((p) => p.id === id) ?? null);
  }
}
