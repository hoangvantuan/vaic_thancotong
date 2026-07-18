// Bản lưu trữ phiên trong bộ nhớ.
//
// Dùng cho kiểm thử và cho bản trình diễn một tiến trình. Phiếu #29 thay bằng bản
// lưu xuống đĩa mà KHÔNG đổi giao diện `SessionStore` — đó là mục đích của điểm
// kết nối.
//
// Chính sách lưu: giữ đến khi xoá thủ công (CONTEXT.md — "Lưu đến khi xóa thủ công").
// Không có hạn tự hết.

import type { SessionId, SessionSecret, TurnId } from "../contracts/ids";
import { newSessionId, newSessionSecret } from "../contracts/ids";
import type {
  DecisionRecordData,
  SavedDecisionRecord,
  SessionRecord,
} from "../contracts/decision";
import { coreError, err, ok, type Result } from "../contracts/status";
import type {
  CreatedSession,
  SaveOutcome,
  SessionStore,
} from "../ports/session-store";
import { adminSecretValid, hashSecret, sessionSecretMatches } from "../auth/secrets";

interface SessionEntry {
  record: SessionRecord;
  /** Khoá theo mã lượt — bảo đảm một mã lượt chỉ có một bản ghi. */
  decisions: Map<TurnId, SavedDecisionRecord>;
  /** Thứ tự lượt, vì Map giữ thứ tự chèn nhưng ta muốn nói rõ ý định. */
  turnOrder: TurnId[];
}

export class MemorySessionStore implements SessionStore {
  readonly name = "memory";

  private readonly sessions = new Map<SessionId, SessionEntry>();

  async createSession(): Promise<Result<CreatedSession>> {
    const sessionId = newSessionId();
    const secret = newSessionSecret();
    const now = new Date().toISOString();

    const record: SessionRecord = {
      sessionId,
      secretHash: hashSecret(secret),
      createdAt: now,
      lastActiveAt: now,
    };

    this.sessions.set(sessionId, { record, decisions: new Map(), turnOrder: [] });
    return ok({ session: record, secret });
  }

  /**
   * Tra phiên và kiểm quyền cùng lúc.
   *
   * Phiên không tồn tại và sai mã bí mật đều trả CÙNG một lỗi `forbidden`, để
   * người gọi không dò được mã phiên nào có thật.
   */
  private authorize(
    id: SessionId,
    secret: SessionSecret
  ): Result<SessionEntry> {
    const entry = this.sessions.get(id);
    if (!entry) {
      return err(coreError("forbidden", "Không đủ quyền với phiên này", "MemorySessionStore"));
    }
    if (!sessionSecretMatches(secret, entry.record.secretHash)) {
      return err(coreError("forbidden", "Không đủ quyền với phiên này", "MemorySessionStore"));
    }
    return ok(entry);
  }

  async getSession(id: SessionId, secret: SessionSecret): Promise<Result<SessionRecord>> {
    const auth = this.authorize(id, secret);
    return auth.ok ? ok(auth.data.record) : err(auth.error);
  }

  async saveDecision(
    data: DecisionRecordData,
    secret: SessionSecret
  ): Promise<Result<SaveOutcome>> {
    const auth = this.authorize(data.sessionId, secret);
    if (!auth.ok) return err(auth.error);
    const entry = auth.data;

    // Bất biến theo mã lượt (#24 mục 8): đã có thì trả nguyên bản cũ, không ghi đè,
    // không tạo bản ghi thứ hai — kể cả khi `data` lần này khác nội dung.
    const existing = entry.decisions.get(data.turnId);
    if (existing) {
      return ok({ record: existing, created: false });
    }

    const record = Object.freeze({ ...data }) as SavedDecisionRecord;
    entry.decisions.set(data.turnId, record);
    entry.turnOrder.push(data.turnId);
    entry.record.lastActiveAt = new Date().toISOString();

    return ok({ record, created: true });
  }

  async getDecision(
    turnId: TurnId,
    secret: SessionSecret
  ): Promise<Result<SavedDecisionRecord | null>> {
    // Không có hàm liệt kê toàn cục, nên phải quét các phiên mà mã bí mật này mở được.
    for (const entry of this.sessions.values()) {
      if (!sessionSecretMatches(secret, entry.record.secretHash)) continue;
      const found = entry.decisions.get(turnId);
      if (found) return ok(found);
    }
    return ok(null);
  }

  async listDecisions(
    id: SessionId,
    secret: SessionSecret
  ): Promise<Result<readonly SavedDecisionRecord[]>> {
    const auth = this.authorize(id, secret);
    if (!auth.ok) return err(auth.error);
    const entry = auth.data;
    const records = entry.turnOrder.map((t) => entry.decisions.get(t)!);
    return ok(records);
  }

  async deleteSession(id: SessionId, secret: SessionSecret): Promise<Result<void>> {
    const auth = this.authorize(id, secret);
    if (!auth.ok) return err(auth.error);
    this.sessions.delete(id);
    return ok(undefined);
  }

  async adminDeleteAll(adminSecret: string): Promise<Result<{ deletedSessions: number }>> {
    if (!adminSecretValid(adminSecret)) {
      return err(coreError("forbidden", "Mã quản trị không hợp lệ", "MemorySessionStore"));
    }
    const deletedSessions = this.sessions.size;
    this.sessions.clear();
    return ok({ deletedSessions });
  }
}
