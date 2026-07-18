// BỘ LUẬT GENERIC ĐA NGÀNH — `generic@v1`.
//
// Dùng cho MỌI ngành ngoài máy lạnh (tủ lạnh/máy giặt/tivi/điện thoại/laptop).
// KHÔNG có luật riêng của ngành nào: ghép lại từ hai luật đã tổng quát hoá theo
// registry — `phu_hop_nhu_cau@v1` (đơn vị/danh từ/biên nới đọc từ
// config/categories.json) và `tran_ngan_sach@v1` (chỉ đọc giá).
//
// Ngành không khai `fit` (điện thoại/laptop) → luật phù-hợp tự bỏ qua, chỉ còn lọc
// theo ngân sách. Thêm ngành = thêm dữ liệu + khai báo registry, KHÔNG sửa mã.
//
// Máy lạnh vẫn giữ `may-lanh@v1` riêng vì có thêm độ ồn + gợi ý mẫu gần nhất.

import type { TurnRules } from "../pipeline/run-turn";
import {
  duNganSach,
  phuHopNhuCau,
  tranNganSach,
  vuaNhuCau,
  PRODUCT_CODE_TIE_BREAKER,
} from "./catalog-rules";
import { buildRecommendation } from "./recommendation";
import { demoSufficiency } from "./sufficiency";

export const GENERIC_HARD_RULES = [phuHopNhuCau, tranNganSach] as const;
export const GENERIC_SOFT_CRITERIA = [vuaNhuCau, duNganSach] as const;

export const GENERIC_TURN_RULES: TurnRules = {
  hard: GENERIC_HARD_RULES,
  soft: GENERIC_SOFT_CRITERIA,
  tieBreaker: PRODUCT_CODE_TIE_BREAKER,
  rulesetVersion: "generic@v1",
  rankerVersion: "generic-ranker@v1",
  sufficiency: demoSufficiency,
  recommend: buildRecommendation,
};
