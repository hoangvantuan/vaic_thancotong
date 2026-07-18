// Nguồn chứng minh bắt buộc (#24 mục 6).
//
// Ánh xạ "Quan hệ dẫn xuất" trong CONTEXT.md: mọi thuộc tính đã chuẩn hoá phải
// truy ngược được về giá trị gốc, kèm quy tắc đã biến đổi nó. Không có đường
// truy ngược thì không được công bố.

import type { SourcedValue } from "./status";

/** Sáu trường bắt buộc của một nguồn chứng minh. Thiếu một trường là hợp đồng vỡ. */
export interface Provenance {
  /** Đường dẫn nguồn — URL trang sản phẩm, hoặc `file://` cho dữ liệu nội bộ. */
  sourceUrl: string;
  /** Vị trí bản ghi trong nguồn, vd "may_lanh.json#/products/42/specs/cong_suat". */
  recordLocation: string;
  /** Giá trị gốc, giữ NGUYÊN VĂN. Không cắt, không sửa chính tả, không đổi đơn vị. */
  rawValue: string;
  /** Thời điểm ghi nhận từ nguồn, ISO 8601. Không phải thời điểm đọc lại. */
  observedAt: string;
  /** Giá trị sau chuẩn hoá. Vắng mặt nếu quy tắc không áp dụng được. */
  normalizedValue: SourcedValue<string | number>;
  /** Mã quy tắc chuyển đổi đã dùng, vd "parse_area_m2@v1". Có phiên bản để tái hiện. */
  transformRule: string;
}

/** Một nhận định nguyên tử kèm đường truy ngược của chính nó. */
export interface SourcedClaim {
  /** Đúng MỘT điều có thể kiểm tra độc lập (CONTEXT.md — "Nhận định nguyên tử"). */
  claim: string;
  provenance: Provenance;
}

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Kiểm tra một nguồn chứng minh có đủ sáu trường và đúng dạng không.
 * Trả về danh sách lỗi rỗng nghĩa là đạt.
 *
 * Đây là cổng dùng chung cho các phiếu #25–#30: dữ liệu không qua được hàm này
 * thì không được đi tiếp vào lọc, xếp hạng hay công bố.
 */
export function validateProvenance(p: Provenance): string[] {
  const problems: string[] = [];

  if (!p.sourceUrl.trim()) problems.push("thiếu sourceUrl");
  else if (!/^(https?|file):\/\//.test(p.sourceUrl))
    problems.push(`sourceUrl phải là http(s):// hoặc file:// — nhận "${p.sourceUrl}"`);

  if (!p.recordLocation.trim()) problems.push("thiếu recordLocation");

  // `rawValue` rỗng CHỈ hợp lệ khi giá trị chuẩn hoá được đánh dấu vắng mặt: nguồn
  // không có gì để trích thì chuỗi rỗng là trung thực, và bản ghi vẫn giữ được đã
  // tra ở đâu (`recordLocation`) và lúc nào (`observedAt`).
  //
  // Ngược lại, rỗng mà vẫn khai là đã quan sát được thì đường truy ngược bị đứt.
  if (!p.rawValue.trim() && p.normalizedValue.status !== "absent") {
    problems.push("thiếu rawValue trong khi giá trị chuẩn hoá không được đánh dấu vắng mặt");
  }

  if (!p.observedAt.trim()) problems.push("thiếu observedAt");
  else if (!ISO_8601.test(p.observedAt))
    problems.push(`observedAt phải là ISO 8601 — nhận "${p.observedAt}"`);

  if (!p.transformRule.trim()) problems.push("thiếu transformRule");
  else if (!/@v\d+$/.test(p.transformRule))
    problems.push(`transformRule phải có phiên bản dạng "tên@v1" — nhận "${p.transformRule}"`);

  return problems;
}

/** Ném lỗi nếu nguồn chứng minh không đạt. Dùng ở nơi sai sót phải chặn luồng. */
export function assertProvenance(p: Provenance, context: string): void {
  const problems = validateProvenance(p);
  if (problems.length > 0) {
    throw new Error(`Nguồn chứng minh không hợp lệ (${context}): ${problems.join("; ")}`);
  }
}
