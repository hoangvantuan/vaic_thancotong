import type { UIMessage } from "ai";
import type { RecommendedProduct } from "./types";
import type { CategoryChoice } from "./agents/orchestrator";

/**
 * UIMessage tuỳ biến: ngoài text còn hai loại data part
 *   - "data-products"   → danh sách sản phẩm đề xuất (render thẻ)
 *   - "data-categories" → danh sách ngành hàng để khách chọn nhanh (render chip)
 */
export type ChatMessage = UIMessage<
  never,
  {
    products: RecommendedProduct[];
    categories: CategoryChoice[];
  }
>;
