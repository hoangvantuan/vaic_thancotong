// Báo cáo điều kiện hợp lệ — kết quả bước LỌC (#24 mục 5).
//
// CONTEXT.md, "Quy trình lọc cứng và xếp hạng mềm": loại trước các sản phẩm vi phạm
// an toàn, tương thích, quy định hoặc ràng buộc không bù trừ, RỒI mới so sánh. Tổng
// điểm không được bù vi phạm bắt buộc — nên ở đây không có điểm số nào cả.

import type { Brand } from "./brand";
import type { SourcedClaim } from "./provenance";

/** Kết luận cho đúng một sản phẩm sau khi chạy hết luật lọc. */
export type EligibilityVerdict =
  /** Qua toàn bộ ràng buộc cứng. Chỉ sản phẩm này mới được sang xếp hạng. */
  | "eligible"
  /** Vi phạm ít nhất một ràng buộc cứng. Không thể cứu bằng điểm cao ở tiêu chí khác. */
  | "excluded"
  /**
   * Thiếu dữ liệu để khẳng định qua hay không.
   * Với an toàn / pháp lý / tương thích kỹ thuật thì ĐÓNG AN TOÀN — coi như loại.
   */
  | "unverified";

/** Vì sao một sản phẩm bị loại hoặc chưa xác minh được. */
export interface EligibilityFinding {
  /** Mã luật đã chạy, có phiên bản, vd "budget_ceiling@v1". */
  ruleId: string;
  verdict: EligibilityVerdict;
  /** Diễn giải cho người đọc dấu vết. */
  explanation: string;
  /** Dữ kiện đã dẫn tới kết luận. Rỗng nghĩa là luật chạy mà không cần nguồn nào. */
  evidence: readonly SourcedClaim[];
}

/** Một dòng trong báo cáo — một sản phẩm, một kết luận, kèm toàn bộ lý do. */
export interface EligibilityRow {
  productId: string;
  verdict: EligibilityVerdict;
  findings: readonly EligibilityFinding[];
}

/**
 * Báo cáo điều kiện hợp lệ cho TOÀN BỘ tập đã xét.
 *
 * Giữ cả sản phẩm bị loại kèm lý do — theo CONTEXT.md, "danh sách sản phẩm đã lọc
 * không có lý do" là thứ bị cấm. Màn hình dấu vết đọc thẳng từ đây.
 *
 * Kiểu mang nhãn `EligibilityReport`: chỉ `screenProducts()` tạo được giá trị này,
 * và `rankProducts()` đòi đúng kiểu này làm tham số — nên không thể xếp hạng khi
 * chưa lọc, sai thứ tự là lỗi biên dịch.
 */
export interface EligibilityReportData {
  rows: readonly EligibilityRow[];
  /** Mã bản phát hành luật đã dùng, để tái hiện đúng kết quả này về sau. */
  rulesetVersion: string;
  screenedAt: string;
}

export type EligibilityReport = Brand<EligibilityReportData, "EligibilityReport">;

/** Chỉ những sản phẩm qua cổng mới được đi tiếp. `unverified` KHÔNG được đi tiếp. */
export function eligibleIds(report: EligibilityReport): readonly string[] {
  return report.rows.filter((r) => r.verdict === "eligible").map((r) => r.productId);
}

export function excludedRows(report: EligibilityReport): readonly EligibilityRow[] {
  return report.rows.filter((r) => r.verdict !== "eligible");
}
