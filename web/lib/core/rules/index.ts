// BỘ LUẬT THẬT CỦA PHIẾU #26 — thay EMPTY_RULES của khung #24.
//
// Mọi mã phiên bản ở đây phải khớp bảng quy tắc docs/quy-tac-quyet-dinh.md;
// đổi luật là đổi bảng trước, tăng phiên bản, rồi mới sửa mã.

import type { TurnRules, TurnRulesRegistry } from "../pipeline/run-turn";
import { GENERIC_TURN_RULES } from "./generic-rules";
import {
  DEMO_HARD_RULES,
  DEMO_SOFT_CRITERIA,
  PRODUCT_CODE_TIE_BREAKER,
  goiYGanNhat,
} from "./catalog-rules";
import { buildRecommendation } from "./recommendation";
import { demoSufficiency } from "./sufficiency";

export const DEMO_TURN_RULES: TurnRules = {
  hard: DEMO_HARD_RULES,
  soft: DEMO_SOFT_CRITERIA,
  tieBreaker: PRODUCT_CODE_TIE_BREAKER,
  rulesetVersion: "may-lanh@v1",
  rankerVersion: "ranker@v1",
  sufficiency: demoSufficiency,
  recommend: buildRecommendation,
  relax: goiYGanNhat,
};

/**
 * BỘ LUẬT THEO NGÀNH — máy lạnh giữ luật riêng (giàu độ ồn/tiết kiệm điện); mọi
 * ngành khác dùng `generic@v1` đọc fit/đơn vị từ registry. Thêm ngành = thêm dữ
 * liệu + khai báo trong config/categories.json, KHÔNG sửa logic lõi.
 */
export const TURN_RULES_REGISTRY: TurnRulesRegistry = {
  byCategory: { may_lanh: DEMO_TURN_RULES },
  default: GENERIC_TURN_RULES,
};

export { GENERIC_TURN_RULES } from "./generic-rules";
export {
  DEMO_HARD_RULES,
  DEMO_SOFT_CRITERIA,
  PRODUCT_CODE_TIE_BREAKER,
  goiYGanNhat,
} from "./catalog-rules";
export { buildRecommendation } from "./recommendation";
export { demoSufficiency } from "./sufficiency";
