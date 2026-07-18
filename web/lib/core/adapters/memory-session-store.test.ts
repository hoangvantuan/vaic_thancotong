// Kiểm thử ba điều #24 đòi bằng chứng ở phần "Hoàn thành khi":
//   1. Tạo và đọc được đủ ba loại kết quả lượt.
//   2. Chỉ người giữ đúng mã phiên + mã bí mật, hoặc mã quản trị, mới đọc/xoá được.
//   3. Gửi lại cùng một mã lượt không tạo bản ghi quyết định thứ hai.

import { beforeEach, describe, expect, it } from "vitest";
import { MemorySessionStore } from "./memory-session-store";
import { newSessionSecret, newTurnId } from "../contracts/ids";
import type { SessionSecret } from "../contracts/ids";
import {
  RESULT_ASK,
  RESULT_DECLINE,
  RESULT_RECOMMEND,
  sampleDecision,
} from "../testing/fixtures";

const ADMIN_SECRET = "admin-secret-dùng-riêng-cho-kiểm-thử";

describe("MemorySessionStore", () => {
  let store: MemorySessionStore;

  beforeEach(() => {
    store = new MemorySessionStore();
    process.env.DEMO_ADMIN_SECRET = ADMIN_SECRET;
  });

  /** Tạo phiên và ném lỗi ngay nếu hỏng, để phần thân kiểm thử đọc gọn. */
  async function createSession() {
    const created = await store.createSession();
    if (!created.ok) throw new Error("không tạo được phiên");
    return created.data;
  }

  describe("ba loại kết quả lượt", () => {
    it.each([
      ["hỏi thêm một câu", RESULT_ASK],
      ["khuyến nghị sản phẩm", RESULT_RECOMMEND],
      ["từ chối vì thiếu căn cứ", RESULT_DECLINE],
    ])("tạo và đọc lại được kết quả loại %s", async (_label, result) => {
      const { session, secret } = await createSession();
      const data = sampleDecision(session.sessionId, result);

      const saved = await store.saveDecision(data, secret);
      expect(saved.ok).toBe(true);
      if (!saved.ok) return;
      expect(saved.data.created).toBe(true);

      const read = await store.getDecision(data.turnId, secret);
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      expect(read.data?.result).toEqual(result);
    });

    it("giữ đủ cả ba loại trong cùng một phiên, đúng thứ tự", async () => {
      const { session, secret } = await createSession();
      for (const result of [RESULT_ASK, RESULT_RECOMMEND, RESULT_DECLINE]) {
        await store.saveDecision(sampleDecision(session.sessionId, result), secret);
      }

      const listed = await store.listDecisions(session.sessionId, secret);
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.data.map((r) => r.result.kind)).toEqual([
        "ask_one_question",
        "recommend",
        "decline",
      ]);
    });
  });

  describe("bất biến theo mã lượt (#24 mục 8)", () => {
    it("gửi lại cùng mã lượt không tạo bản ghi thứ hai", async () => {
      const { session, secret } = await createSession();
      const turnId = newTurnId();
      const data = sampleDecision(session.sessionId, RESULT_ASK, turnId);

      const first = await store.saveDecision(data, secret);
      const second = await store.saveDecision(data, secret);

      expect(first.ok && first.data.created).toBe(true);
      expect(second.ok && second.data.created).toBe(false);

      const listed = await store.listDecisions(session.sessionId, secret);
      expect(listed.ok && listed.data.length).toBe(1);
    });

    it("gửi lại cùng mã lượt với nội dung KHÁC vẫn trả bản ghi cũ", async () => {
      const { session, secret } = await createSession();
      const turnId = newTurnId();

      await store.saveDecision(
        sampleDecision(session.sessionId, RESULT_ASK, turnId),
        secret
      );
      // Cùng mã lượt nhưng kết quả khác — bản ghi đã lưu không được đổi.
      const replay = await store.saveDecision(
        sampleDecision(session.sessionId, RESULT_DECLINE, turnId),
        secret
      );

      expect(replay.ok).toBe(true);
      if (!replay.ok) return;
      expect(replay.data.created).toBe(false);
      expect(replay.data.record.result.kind).toBe("ask_one_question");
    });

    it("hai mã lượt khác nhau tạo hai bản ghi", async () => {
      const { session, secret } = await createSession();
      await store.saveDecision(sampleDecision(session.sessionId, RESULT_ASK), secret);
      await store.saveDecision(sampleDecision(session.sessionId, RESULT_ASK), secret);

      const listed = await store.listDecisions(session.sessionId, secret);
      expect(listed.ok && listed.data.length).toBe(2);
    });
  });

  describe("quyền sở hữu phiên (#24 mục 9)", () => {
    it("biết mã phiên nhưng không có mã bí mật thì không đọc được", async () => {
      const { session } = await createSession();
      const kẻLạ = newSessionSecret();

      const read = await store.getSession(session.sessionId, kẻLạ);
      expect(read.ok).toBe(false);
      if (read.ok) return;
      expect(read.error.kind).toBe("forbidden");
    });

    it("biết mã phiên nhưng không có mã bí mật thì không xoá được", async () => {
      const { session, secret } = await createSession();
      const kẻLạ = newSessionSecret();

      const deleted = await store.deleteSession(session.sessionId, kẻLạ);
      expect(deleted.ok).toBe(false);

      // Phiên vẫn còn nguyên với chủ thật.
      const stillThere = await store.getSession(session.sessionId, secret);
      expect(stillThere.ok).toBe(true);
    });

    it("mã bí mật của phiên khác không mở được phiên này", async () => {
      const a = await createSession();
      const b = await createSession();

      const cross = await store.getSession(a.session.sessionId, b.secret);
      expect(cross.ok).toBe(false);
    });

    it("phiên không tồn tại trả cùng lỗi với sai mã bí mật, không lộ phiên nào có thật", async () => {
      const { session, secret } = await createSession();
      const missing = await store.getSession(
        "ses_00000000000000000000000000000000" as never,
        secret
      );
      const wrongSecret = await store.getSession(session.sessionId, newSessionSecret());

      expect(missing.ok).toBe(false);
      expect(wrongSecret.ok).toBe(false);
      if (missing.ok || wrongSecret.ok) return;
      expect(missing.error).toEqual(wrongSecret.error);
    });

    it("chủ phiên đọc và xoá được phiên của mình", async () => {
      const { session, secret } = await createSession();

      expect((await store.getSession(session.sessionId, secret)).ok).toBe(true);
      expect((await store.deleteSession(session.sessionId, secret)).ok).toBe(true);
      expect((await store.getSession(session.sessionId, secret)).ok).toBe(false);
    });

    it("không đọc được lượt của phiên khác dù biết mã lượt", async () => {
      const a = await createSession();
      const b = await createSession();
      const data = sampleDecision(a.session.sessionId, RESULT_RECOMMEND);
      await store.saveDecision(data, a.secret);

      const stolen = await store.getDecision(data.turnId, b.secret);
      expect(stolen.ok).toBe(true);
      if (!stolen.ok) return;
      expect(stolen.data).toBeNull();
    });

    it("không lưu được lượt vào phiên của người khác", async () => {
      const a = await createSession();
      const b = await createSession();

      const saved = await store.saveDecision(
        sampleDecision(a.session.sessionId, RESULT_ASK),
        b.secret
      );
      expect(saved.ok).toBe(false);
    });
  });

  describe("quyền quản trị", () => {
    it("mã quản trị đúng xoá được toàn bộ phiên", async () => {
      const a = await createSession();
      await createSession();

      const wiped = await store.adminDeleteAll(ADMIN_SECRET);
      expect(wiped.ok).toBe(true);
      if (!wiped.ok) return;
      expect(wiped.data.deletedSessions).toBe(2);
      expect((await store.getSession(a.session.sessionId, a.secret)).ok).toBe(false);
    });

    it("mã quản trị sai không xoá được gì", async () => {
      const a = await createSession();

      const wiped = await store.adminDeleteAll("mã-sai");
      expect(wiped.ok).toBe(false);
      expect((await store.getSession(a.session.sessionId, a.secret)).ok).toBe(true);
    });

    it("mã bí mật phiên KHÔNG dùng thay được mã quản trị", async () => {
      const a = await createSession();

      const wiped = await store.adminDeleteAll(a.secret as SessionSecret);
      expect(wiped.ok).toBe(false);
      expect((await store.getSession(a.session.sessionId, a.secret)).ok).toBe(true);
    });

    it("chưa cấu hình mã quản trị thì từ chối, không mở cửa", async () => {
      delete process.env.DEMO_ADMIN_SECRET;
      await createSession();

      const wiped = await store.adminDeleteAll("");
      expect(wiped.ok).toBe(false);
    });
  });
});
