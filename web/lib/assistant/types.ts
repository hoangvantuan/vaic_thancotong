// Kiểu dùng cho tầng giao diện trợ lý. Tái dùng THẲNG hợp đồng lõi (#24) qua
// `import type` — kiểu bị xoá lúc biên dịch nên không kéo mã máy chủ vào client, mà
// vẫn bảo đảm giao diện đọc đúng hình dạng dữ liệu đã lưu, không tự đặt hình dạng riêng.

export type {
  TurnResult,
  Recommendation,
  DeclineReason,
} from "@/lib/core/contracts/turn";
export type { DecisionRecordData } from "@/lib/core/contracts/decision";
export type { SourcedClaim, Provenance } from "@/lib/core/contracts/provenance";
export type {
  EligibilityRow,
  EligibilityVerdict,
  EligibilityFinding,
} from "@/lib/core/contracts/eligibility";
export type { RankedRow, CriterionContribution } from "@/lib/core/contracts/ranking";
export type { SourcedValue } from "@/lib/core/contracts/status";

import type { TurnResult } from "@/lib/core/contracts/turn";

/** Một lượt khách nói. */
export interface UserItem {
  id: string;
  sender: "user";
  text: string;
}

/** Một lượt trợ lý trả — luôn gắn với mã lượt để mở lại được bản ghi quyết định. */
export interface AssistantItem {
  id: string;
  sender: "assistant";
  turnId: string;
  result: TurnResult;
}

export type ConversationItem = UserItem | AssistantItem;

/**
 * Lỗi đã phân loại cho giao diện: `retryable` là lỗi tạm (thử lại được), ngược lại
 * là lỗi không thể tiếp tục an toàn — phải quay về nhập mã hoặc đổi yêu cầu.
 */
export interface AssistantError {
  kind: string;
  message: string;
  retryable: boolean;
}
