// ĐIỂM KẾT NỐI 1/3 — nguồn dữ liệu sản phẩm (#24 mục 7).
//
// CONTEXT.md, "Bộ kết nối môi trường": bộ kết nối thích nghi việc ĐỌC dữ liệu với
// hệ thống nguồn. Nó KHÔNG chứa ý nghĩa hành vi hoặc quan hệ giá trị sản phẩm —
// tức là không có luật lọc, không có luật xếp hạng ở đây.

import type { Provenance } from "../contracts/provenance";
import type { Result, SourcedValue } from "../contracts/status";
import type { CategorySlug } from "@/lib/types";

/** Một sản phẩm như nguồn cung cấp, chưa qua luật miền nào. */
export interface SourcedProduct {
  id: string;
  category: CategorySlug;
  /** Tên hiển thị — bắt buộc, vì khách phải nhận ra đúng lựa chọn đang nói tới. */
  displayName: string;
  /** Đường dẫn nguồn — bắt buộc theo #23 ("phải có định danh và đường dẫn nguồn"). */
  sourceUrl: string;
  /**
   * Thuộc tính đã chuẩn hoá. Mỗi giá trị mang trạng thái nguồn riêng, nên
   * "thiếu" và "mâu thuẫn" không bị nuốt thành rỗng.
   */
  attributes: Readonly<Record<string, SourcedValue<string | number>>>;
  /** Nguồn chứng minh cho từng thuộc tính, khoá trùng với `attributes`. */
  provenance: Readonly<Record<string, Provenance>>;
  observedAt: string;
}

/** Phạm vi tiếp nhận dữ liệu — đọc được cả sản phẩm chưa đủ chất lượng để tư vấn. */
export interface ProductQuery {
  category: CategorySlug;
  /** Giới hạn số bản ghi. Bỏ trống là lấy hết trong phạm vi tiếp nhận. */
  limit?: number;
}

/**
 * Cổng đọc dữ liệu sản phẩm.
 *
 * Phiếu #25 hiện thực bản đọc từ `docs/dataset`. Kiểm thử dùng bản giả trong
 * `adapters/mock`. Cả hai phải thoả đúng giao diện này.
 */
export interface ProductSource {
  /** Tên bản hiện thực, ghi vào ảnh chụp quyết định để biết dữ liệu từ đâu. */
  readonly name: string;
  list(query: ProductQuery): Promise<Result<readonly SourcedProduct[]>>;
  getById(id: string): Promise<Result<SourcedProduct | null>>;
}
