// Dựng khuyến nghị từ dòng xếp hạng — mục 6 của bảng quy tắc.
//
// Đóng góp DƯƠNG của tiêu chí → lý do; đóng góp ÂM → điểm đánh đổi phải nói ra.
// Mỗi nhận định mang provenance của chính trường dữ liệu đã sinh ra nó, nên bản
// ghi đọc được không cần tra cứu ngoài. Không có đóng góp dương nào = không có
// lý do có căn cứ → trả null để pipeline BỎ QUA sản phẩm (cấm khen suông).

import type { RankedRow } from "../contracts/ranking";
import type { Recommendation } from "../contracts/turn";
import type { SourcedProduct } from "../ports/product-source";
import type { RecommendationBuilder } from "../pipeline/run-turn";

export const buildRecommendation: RecommendationBuilder = (
  product: SourcedProduct,
  row: RankedRow
): Recommendation | null => {
  const reasons = row.contributions
    .filter((c) => c.contribution > 0)
    .flatMap((c) => c.evidence);
  const tradeoffs = row.contributions
    .filter((c) => c.contribution < 0)
    .flatMap((c) => c.evidence);

  if (reasons.length === 0) return null;

  return {
    productId: product.id,
    displayName: product.displayName,
    reasons,
    tradeoffs,
  };
};
