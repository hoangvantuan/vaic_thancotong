// BƯỚC 1 — LỌC CỨNG.
//
// #24 không yêu cầu viết đầy đủ luật chọn sản phẩm ("Không làm trong phiếu này"),
// nên ở đây chỉ có BỘ MÁY chạy luật và hợp đồng của một luật. Phiếu #26 nạp luật
// máy lạnh thật vào cùng giao diện `HardRule`.

import type {
  EligibilityFinding,
  EligibilityReport,
  EligibilityReportData,
  EligibilityRow,
  EligibilityVerdict,
} from "../contracts/eligibility";
import type { SourcedProduct } from "../ports/product-source";
import type { ExtractedNeeds } from "../ports/model-service";

/**
 * Một ràng buộc CỨNG. Không có trọng số, không có điểm — chỉ đạt, loại, hoặc
 * chưa xác minh được. Điểm cao ở luật khác không cứu được một lần `excluded`.
 */
export interface HardRule {
  /** Mã có phiên bản, vd "budget_ceiling@v1". */
  id: string;
  /**
   * Luật này có chạm tới an toàn, pháp lý hay tương thích kỹ thuật không.
   *
   * `true` thì thiếu dữ liệu phải ĐÓNG AN TOÀN — `unverified` bị coi như loại.
   * `false` thì `unverified` được giữ nguyên để báo cáo, không tự thành điểm yếu.
   */
  safetyCritical: boolean;
  evaluate(product: SourcedProduct, needs: ExtractedNeeds): EligibilityFinding;
}

/** Kết luận cuối cho một sản phẩm từ tập kết luận của từng luật. */
function combineVerdicts(
  findings: readonly EligibilityFinding[],
  rules: readonly HardRule[]
): EligibilityVerdict {
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  // Một lần `excluded` là loại, không bù được.
  if (findings.some((f) => f.verdict === "excluded")) return "excluded";

  // Chưa xác minh ở luật an toàn → đóng an toàn, coi như loại.
  const unsafeUnverified = findings.some(
    (f) => f.verdict === "unverified" && ruleById.get(f.ruleId)?.safetyCritical === true
  );
  if (unsafeUnverified) return "excluded";

  // Chưa xác minh ở tiêu chí mềm → giữ nguyên trạng thái, KHÔNG tự thành điểm yếu.
  if (findings.some((f) => f.verdict === "unverified")) return "unverified";

  return "eligible";
}

/**
 * Chạy toàn bộ luật cứng trên tập sản phẩm.
 *
 * Đây là hàm DUY NHẤT tạo ra `EligibilityReport`. Vì `rankProducts()` đòi đúng
 * kiểu đó, không thể xếp hạng khi chưa lọc — sai thứ tự là lỗi biên dịch.
 */
export function screenProducts(
  products: readonly SourcedProduct[],
  needs: ExtractedNeeds,
  rules: readonly HardRule[],
  rulesetVersion: string
): EligibilityReport {
  const rows: EligibilityRow[] = products.map((product) => {
    const findings = rules.map((rule) => rule.evaluate(product, needs));
    return {
      productId: product.id,
      verdict: combineVerdicts(findings, rules),
      findings,
    };
  });

  const data: EligibilityReportData = {
    rows,
    rulesetVersion,
    screenedAt: new Date().toISOString(),
  };

  return data as EligibilityReport;
}
