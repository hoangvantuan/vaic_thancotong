// Báo cáo xếp hạng — kết quả bước XẾP HẠNG (#24 mục 5).
//
// CONTEXT.md, "Báo cáo xếp hạng": giải trình thứ tự của RIÊNG các sản phẩm đã đủ
// điều kiện, gồm đóng góp từng tiêu chí, điểm đánh đổi, cách phá hoà và phân tích
// độ nhạy. "Điểm phù hợp duy nhất" là thứ bị cấm.

import type { Brand } from "./brand";
import type { SourcedClaim } from "./provenance";

/** Đóng góp của một tiêu chí vào thứ hạng của một sản phẩm. */
export interface CriterionContribution {
  /** Mã tiêu chí có phiên bản, vd "noise_level@v1". */
  criterionId: string;
  /** Nhãn tiếng Việt để hiện trên màn hình dấu vết. */
  label: string;
  /** Đóng góp đã chuẩn hoá về [-1, 1]. Dương là lợi, âm là bất lợi. */
  contribution: number;
  evidence: readonly SourcedClaim[];
}

/** Một dòng xếp hạng. Chỉ sản phẩm đã `eligible` mới xuất hiện ở đây. */
export interface RankedRow {
  productId: string;
  /** Hạng bắt đầu từ 1. Hai sản phẩm hoà nhau có thể cùng hạng. */
  rank: number;
  contributions: readonly CriterionContribution[];
  tradeoffs: readonly SourcedClaim[];
  /** Luật đã dùng để phá hoà, nếu có hoà. */
  tieBreakRule: string | null;
}

/**
 * Độ nhạy: đổi một dữ kiện thì thứ hạng có đảo không.
 * Thiếu phần này thì báo cáo chưa đạt hợp đồng (CONTEXT.md cấm "thứ hạng không có
 * phân tích độ nhạy").
 */
export interface SensitivityNote {
  /** Dữ kiện được thử đổi, vd "ngân sách +10%". */
  perturbation: string;
  /** Thứ hạng có đổi không khi áp dụng thay đổi đó. */
  rankingChanges: boolean;
  explanation: string;
}

export interface RankingReportData {
  rows: readonly RankedRow[];
  sensitivity: readonly SensitivityNote[];
  /** Mã bản phát hành luật xếp hạng, để tái hiện. */
  rankerVersion: string;
  rankedAt: string;
}

/**
 * Kiểu mang nhãn: chỉ `rankProducts()` tạo được, và nó đòi `EligibilityReport`
 * làm đầu vào. Đây là mắt xích thứ hai của chuỗi screen → rank → verify → save.
 */
export type RankingReport = Brand<RankingReportData, "RankingReport">;
