// BƯỚC 2 — XẾP HẠNG MỀM.
//
// Chỉ chạy trên sản phẩm ĐÃ qua cổng lọc. Tham số đầu là `EligibilityReport` —
// kiểu chỉ `screenProducts()` tạo được — nên gọi xếp hạng trước khi lọc sẽ không
// biên dịch được.

import { eligibleIds, type EligibilityReport } from "../contracts/eligibility";
import type {
  CriterionContribution,
  RankedRow,
  RankingReport,
  RankingReportData,
  SensitivityNote,
} from "../contracts/ranking";
import type { SourcedProduct } from "../ports/product-source";
import type { ExtractedNeeds } from "../ports/model-service";

/** Một tiêu chí mềm. Trả về đóng góp trong [-1, 1], KHÔNG phải điểm tuyệt đối. */
export interface SoftCriterion {
  id: string;
  label: string;
  score(product: SourcedProduct, needs: ExtractedNeeds): CriterionContribution;
}

/** Cách phá hoà khi hai sản phẩm cùng tổng đóng góp. */
export interface TieBreaker {
  id: string;
  compare(a: SourcedProduct, b: SourcedProduct): number;
}

function totalContribution(contributions: readonly CriterionContribution[]): number {
  return contributions.reduce((sum, c) => sum + c.contribution, 0);
}

/**
 * Xếp hạng các sản phẩm đủ điều kiện.
 *
 * Bộ xếp hạng KHÔNG được thêm hay hồi sinh sản phẩm đã bị loại — nó chỉ đổi thứ
 * tự của tập đã khoá ở bước lọc. Ràng buộc đó được giữ bằng cách lấy danh sách
 * id thẳng từ `eligibleIds(report)`.
 */
export function rankProducts(
  report: EligibilityReport,
  products: readonly SourcedProduct[],
  needs: ExtractedNeeds,
  criteria: readonly SoftCriterion[],
  tieBreaker: TieBreaker | null,
  rankerVersion: string,
  /** Dấu thời gian ghi vào báo cáo. Truyền `receivedAt` của lượt để tái lập được. */
  rankedAt: string = new Date().toISOString()
): RankingReport {
  const allowed = new Set(eligibleIds(report));
  const byId = new Map(products.map((p) => [p.id, p]));

  const candidates = [...allowed]
    .map((id) => byId.get(id))
    .filter((p): p is SourcedProduct => p !== undefined);

  const scored = candidates.map((product) => ({
    product,
    contributions: criteria.map((c) => c.score(product, needs)),
  }));

  scored.sort((a, b) => {
    const diff = totalContribution(b.contributions) - totalContribution(a.contributions);
    if (diff !== 0) return diff;
    return tieBreaker ? tieBreaker.compare(a.product, b.product) : 0;
  });

  const rows: RankedRow[] = scored.map((entry, index) => {
    const previous = index > 0 ? scored[index - 1] : null;
    const tied =
      previous !== null &&
      totalContribution(previous.contributions) === totalContribution(entry.contributions);

    return {
      productId: entry.product.id,
      rank: index + 1,
      contributions: entry.contributions,
      tradeoffs: [],
      tieBreakRule: tied && tieBreaker ? tieBreaker.id : null,
    };
  });

  const data: RankingReportData = {
    rows,
    sensitivity: buildSensitivity(scored),
    rankerVersion,
    rankedAt,
  };

  return data as RankingReport;
}

/**
 * Phân tích độ nhạy tối thiểu: khoảng cách giữa hạng 1 và hạng 2 có mong manh không.
 * Phiếu #26 mở rộng thành thử nhiễu từng dữ kiện.
 */
function buildSensitivity(
  scored: readonly { contributions: readonly CriterionContribution[] }[]
): readonly SensitivityNote[] {
  if (scored.length < 2) {
    return [
      {
        perturbation: "không có ứng viên thứ hai",
        rankingChanges: false,
        explanation: "Chỉ có một sản phẩm đủ điều kiện nên không có thứ hạng để đảo.",
      },
    ];
  }

  const gap =
    totalContribution(scored[0].contributions) - totalContribution(scored[1].contributions);
  const fragile = gap < 0.05;

  return [
    {
      perturbation: "đổi nhẹ trọng số giữa hạng 1 và hạng 2",
      rankingChanges: fragile,
      explanation: fragile
        ? `Khoảng cách chỉ ${gap.toFixed(3)} — thứ hạng có thể đảo khi đổi một dữ kiện nhỏ.`
        : `Khoảng cách ${gap.toFixed(3)} đủ rộng để thứ hạng ổn định.`,
    },
  ];
}
