// Ảnh chụp quyết định và bản ghi phiên (#24 mục 5).
//
// CONTEXT.md, "Ảnh chụp quyết định": bản ghi BẤT BIẾN của đúng một lượt, khoá bản
// phát hành, phiên bản phiên, bằng chứng, kết quả mô hình, kế hoạch quyết định,
// kiểm tra công bố và phản hồi đã trả. Ảnh chụp không gọi lại nguồn để viết lại
// quá khứ — nên mọi trường ở đây là `readonly`.

import type { Brand } from "./brand";
import type { SessionId, TurnId } from "./ids";
import type { EligibilityReport } from "./eligibility";
import type { RankingReport } from "./ranking";
import type { TurnInput } from "./turn";
import type { VerifiedTurnResult } from "../pipeline/publication";

/** Kết quả thô từ mô hình, giữ lại để tái hiện và đối chiếu khi gỡ rối. */
export interface ModelTrace {
  /** Năng lực đã gọi, KHÔNG phải tên nhà cung cấp (CONTEXT.md — "Cổng năng lực mô hình"). */
  capability: string;
  /** Mã mô hình thực tế đã phục vụ, để biết bản nào sinh ra kết quả này. */
  modelId: string;
  promptHash: string;
  /** Nguyên văn mô hình trả về. Luôn là ỨNG VIÊN chưa được tin cậy. */
  rawOutput: string;
  latencyMs: number;
}

/** Kết quả cổng công bố an toàn — chạy TRƯỚC khi lưu và trước khi hiển thị. */
export interface PublicationCheck {
  passed: boolean;
  /** Từng nhận định đã đối chiếu, kèm kết luận. */
  checkedClaims: readonly { claim: string; verified: boolean; note: string }[];
  /** Cổng chỉ cho sửa lại MỘT lần; lần hai phải chuyển sang từ chối có phạm vi. */
  repairAttempted: boolean;
}

/**
 * Ảnh chụp một lượt. Bất biến sau khi tạo.
 *
 * `eligibility` và `ranking` có thể null khi lượt đó không đi tới bước ấy — ví dụ
 * lượt chỉ hỏi lại một câu thì chưa lọc sản phẩm nào.
 */
/**
 * Mã phiên bản các bộ luật đã áp dụng cho lượt — ghi vào MỌI bản ghi, kể cả lượt
 * chỉ hỏi lại (khi đó eligibility/ranking null nhưng luật chọn câu hỏi vẫn có
 * phiên bản). Thiếu phần này thì không tái hiện được "cùng phiên bản ⇒ cùng
 * quyết định" cho các lượt ask (#26).
 */
export interface AppliedRuleVersions {
  readonly ruleset: string;
  readonly ranker: string;
  /** Null khi bộ luật không có tầng đủ-thông-tin (vd EMPTY_RULES của khung #24). */
  readonly sufficiency: string | null;
}

export interface DecisionRecordData {
  readonly turnId: TurnId;
  readonly sessionId: SessionId;
  readonly input: TurnInput;
  readonly appliedRuleVersions: AppliedRuleVersions;
  readonly eligibility: EligibilityReport | null;
  readonly ranking: RankingReport | null;
  readonly modelTraces: readonly ModelTrace[];
  readonly publicationCheck: PublicationCheck;
  /**
   * Đúng thứ đã trả cho khách. Kiểu `VerifiedTurnResult` chỉ do cổng công bố tạo
   * ra, nên KHÔNG THỂ lưu một kết quả chưa kiểm tra — ràng buộc ở mức biên dịch.
   */
  readonly result: VerifiedTurnResult;
  /** Bản phát hành tư vấn đang phục vụ, khoá toàn bộ cấu hình đã dùng. */
  readonly releaseVersion: string;
  readonly createdAt: string;
}

/**
 * Kiểu mang nhãn: chỉ `SessionStore.saveDecision()` trả về được.
 * Tầng giao diện đòi đúng kiểu này, nên KHÔNG THỂ hiển thị khi chưa lưu.
 */
export type SavedDecisionRecord = Brand<DecisionRecordData, "SavedDecisionRecord">;

/** Bản ghi một phiên tư vấn. */
export interface SessionRecord {
  readonly sessionId: SessionId;
  /** Băm của mã bí mật phiên — KHÔNG lưu bản rõ (#24 mục 9). */
  readonly secretHash: string;
  readonly createdAt: string;
  /** Thời điểm ghi nhận hoạt động gần nhất, để theo dõi mức tích tụ dữ liệu. */
  lastActiveAt: string;
}
