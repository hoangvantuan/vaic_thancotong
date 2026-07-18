// SINH BA BẢN GHI MẪU cho báo cáo hoàn thành phiếu #26 (ask / recommend / decline).
//
// Chạy trên bộ kết nối giả của #24 (MockProductSource) + bộ luật thật DEMO_TURN_RULES,
// ghi ra docs/samples/*.json. Mã phiên/lượt do máy chủ sinh ngẫu nhiên nên được
// chuẩn hoá về giá trị cố định — phần còn lại tất định 100% (timestamp lấy từ
// receivedAt), nên file mẫu KHÔNG đổi giữa các lần chạy: git diff sạch là bằng
// chứng tái lập.

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runTurn } from "../pipeline/run-turn";
import { DEMO_TURN_RULES } from "../rules";
import { createTestServices } from "../composition";
import { newTurnId } from "../contracts/ids";
import type { SavedDecisionRecord } from "../contracts/decision";
import type { TurnResult } from "../contracts/turn";

const RECEIVED_AT = "2026-07-18T02:00:00.000Z";
const SAMPLES_DIR = fileURLToPath(new URL("../../../docs/samples/", import.meta.url));

const FIXED_SESSION = "ses_00000000000000000000000000000000";
const FIXED_TURN = "turn_00000000000000000000000000000000";

/** Thay mã ngẫu nhiên bằng mã cố định để file mẫu ổn định giữa các lần sinh. */
function stabilize(record: SavedDecisionRecord): unknown {
  const json = JSON.stringify(record, null, 2)
    .replaceAll(record.sessionId, FIXED_SESSION)
    .replaceAll(record.turnId, FIXED_TURN);
  return JSON.parse(json);
}

async function generate(userText: string): Promise<SavedDecisionRecord> {
  const services = createTestServices();
  const created = await services.store.createSession();
  if (!created.ok) throw new Error("không tạo được phiên");
  const { session, secret } = created.data;

  const result = await runTurn(
    {
      sessionId: session.sessionId,
      turnId: newTurnId(),
      userText,
      receivedAt: RECEIVED_AT,
    },
    secret,
    services,
    DEMO_TURN_RULES
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

const SAMPLES: ReadonlyArray<{ file: string; userText: string; kind: TurnResult["kind"] }> = [
  {
    file: "ban-ghi-hoi-mot-cau.json",
    userText: "chào em, tư vấn giúp anh với",
    kind: "ask_one_question",
  },
  {
    file: "ban-ghi-khuyen-nghi.json",
    userText: "máy lạnh cho phòng 12m2, ngân sách 10 triệu, ít ồn",
    kind: "recommend",
  },
  {
    file: "ban-ghi-tu-choi.json",
    userText: "máy lạnh cho phòng 30m2, khoảng 10 triệu",
    kind: "decline",
  },
];

describe("ba bản ghi mẫu cho báo cáo hoàn thành (#26)", () => {
  it("sinh đủ ask / recommend / decline trên bộ kết nối giả và ghi vào docs/samples", async () => {
    mkdirSync(SAMPLES_DIR, { recursive: true });

    for (const sample of SAMPLES) {
      const record = await generate(sample.userText);
      expect(record.result.kind).toBe(sample.kind);
      writeFileSync(
        `${SAMPLES_DIR}${sample.file}`,
        `${JSON.stringify(stabilize(record), null, 2)}\n`,
        "utf8"
      );
    }
  });

  it("bản ghi mẫu tái lập: sinh lại lần nữa ra nội dung giống hệt (sau chuẩn hoá mã)", async () => {
    const again = await generate(SAMPLES[1].userText);
    const first = await generate(SAMPLES[1].userText);
    expect(stabilize(again)).toEqual(stabilize(first));
  });
});
