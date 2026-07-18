// ĐIỂM KẾT NỐI 3/3 — nơi lưu phiên và bản ghi quyết định (#24 mục 7).
//
// Hai ràng buộc khó nằm ở đây:
//
//   1. BẤT BIẾN THEO MÃ LƯỢT (#24 mục 8): gửi lại cùng một mã lượt phải trả đúng
//      bản ghi cũ và KHÔNG tạo bản ghi thứ hai.
//   2. QUYỀN SỞ HỮU PHIÊN (#24 mục 9): mọi thao tác đọc/xoá phải có CẢ mã truy cập
//      chung lẫn mã bí mật của đúng phiên đó. Không có hàm liệt kê phiên người khác.

import type { SessionId, SessionSecret, TurnId } from "../contracts/ids";
import type {
  DecisionRecordData,
  SavedDecisionRecord,
  SessionRecord,
} from "../contracts/decision";
import type { Result } from "../contracts/status";

/** Phiên mới tạo. Đây là lần DUY NHẤT mã bí mật xuất hiện ở dạng rõ. */
export interface CreatedSession {
  session: SessionRecord;
  /** Trình duyệt phải giữ lấy. Máy chủ chỉ lưu bản băm. */
  secret: SessionSecret;
}

/** Kết quả lưu một lượt, cho biết đây là bản mới hay bản đã có từ trước. */
export interface SaveOutcome {
  record: SavedDecisionRecord;
  /**
   * `false` nghĩa là mã lượt này đã được lưu trước đó và bản ghi cũ được trả lại
   * nguyên vẹn — bằng chứng cho tính bất biến ở #24 mục 8.
   */
  created: boolean;
}

export interface SessionStore {
  /** Tên bản hiện thực, ghi vào ảnh chụp quyết định. */
  readonly name: string;

  /** Máy chủ sinh cả mã phiên lẫn mã bí mật. Client không được đặt. */
  createSession(): Promise<Result<CreatedSession>>;

  /**
   * Đọc phiên. Sai mã bí mật trả lỗi `forbidden` — KHÔNG phải `not_found`, và cũng
   * không phân biệt được hai trường hợp từ phía người gọi.
   */
  getSession(id: SessionId, secret: SessionSecret): Promise<Result<SessionRecord>>;

  /**
   * Lưu ảnh chụp quyết định. Bất biến theo `turnId`.
   *
   * Đây là hàm DUY NHẤT tạo ra `SavedDecisionRecord`, nên tầng giao diện không thể
   * hiển thị một kết quả chưa được lưu.
   */
  saveDecision(
    data: DecisionRecordData,
    secret: SessionSecret
  ): Promise<Result<SaveOutcome>>;

  /** Đọc lại một lượt đã lưu, dùng cho màn hình dấu vết và cho kiểm tra bất biến. */
  getDecision(
    turnId: TurnId,
    secret: SessionSecret
  ): Promise<Result<SavedDecisionRecord | null>>;

  /** Toàn bộ lượt của một phiên, theo thứ tự thời gian. */
  listDecisions(
    id: SessionId,
    secret: SessionSecret
  ): Promise<Result<readonly SavedDecisionRecord[]>>;

  /** Khách tự xoá phiên của mình. Cần đúng mã bí mật. */
  deleteSession(id: SessionId, secret: SessionSecret): Promise<Result<void>>;

  /**
   * Quyền quản trị: xoá mọi phiên trong môi trường trình diễn.
   * Mã quản trị là bí mật RIÊNG, không dùng chung với mã phiên (#24 mục 9).
   */
  adminDeleteAll(adminSecret: string): Promise<Result<{ deletedSessions: number }>>;
}
