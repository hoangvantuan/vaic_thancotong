// BỘ LUẬT THẬT CỦA PHIẾU #26 — thay EMPTY_RULES của khung #24.
//
// Mọi mã phiên bản ở đây phải khớp bảng quy tắc docs/quy-tac-quyet-dinh.md;
// đổi luật là đổi bảng trước, tăng phiên bản, rồi mới sửa mã.

import type { TurnRules } from "../pipeline/run-turn";
import {
  DEMO_HARD_RULES,
  DEMO_SOFT_CRITERIA,
  PRODUCT_CODE_TIE_BREAKER,
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
};

export { DEMO_HARD_RULES, DEMO_SOFT_CRITERIA, PRODUCT_CODE_TIE_BREAKER } from "./catalog-rules";
export { buildRecommendation } from "./recommendation";
export { demoSufficiency } from "./sufficiency";
