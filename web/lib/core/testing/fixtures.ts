// Dữ liệu mẫu dùng chung cho kiểm thử.
//
// Các phiếu #25–#30 dùng lại bộ này để không nhóm nào tự dựng một bộ mẫu riêng
// rồi lệch hợp đồng.

import type { SessionId, TurnId } from "../contracts/ids";
import { newTurnId } from "../contracts/ids";
import type { DecisionRecordData } from "../contracts/decision";
import type { Provenance, SourcedClaim } from "../contracts/provenance";
import type { TurnInput, TurnResult } from "../contracts/turn";
import { observed } from "../contracts/status";
import { verifyForPublication } from "../pipeline/publication";

export const SAMPLE_PROVENANCE: Provenance = {
  sourceUrl: "https://www.dienmayxanh.com/may-lanh/sample-9000btu",
  recordLocation: "may_lanh.json#/products/0/specs/cong_suat",
  rawValue: "9.000 BTU",
  observedAt: "2026-07-18T02:00:00.000Z",
  normalizedValue: observed(9000),
  transformRule: "parse_btu@v1",
};

export function sampleClaim(claim: string): SourcedClaim {
  return { claim, provenance: SAMPLE_PROVENANCE };
}

export function sampleInput(sessionId: SessionId, turnId: TurnId): TurnInput {
  return {
    sessionId,
    turnId,
    userText: "Phòng em 18m2, ngân sách 12 triệu",
    category: "may_lanh",
    receivedAt: "2026-07-18T02:00:00.000Z",
  };
}

/** Ba loại kết quả — dùng để chứng minh cả ba đều tạo và đọc lại được. */
export const RESULT_ASK: TurnResult = {
  kind: "ask_one_question",
  question: "Phòng mình có bị nắng chiều chiếu vào không ạ?",
  targetGap: "tải nhiệt do hướng nắng",
};

/** Kiểu hẹp để kiểm thử truy cập được `.recommendations` mà không phải thu hẹp union. */
export type RecommendResult = Extract<TurnResult, { kind: "recommend" }>;

export const RESULT_RECOMMEND: RecommendResult = {
  kind: "recommend",
  recommendations: [
    {
      productId: "ml-001",
      displayName: "Máy lạnh Sample Inverter 9000BTU",
      reasons: [sampleClaim("Công suất 9000 BTU phù hợp phòng 18m2")],
      tradeoffs: [sampleClaim("Không có chế độ lọc bụi mịn")],
    },
  ],
  caveats: ["Giá ghi nhận lúc 02:00 ngày 18/07, cần xác minh lại tại cửa hàng"],
};

export const RESULT_DECLINE: TurnResult = {
  kind: "decline",
  reason: "insufficient_evidence",
  whatWouldHelp: "Cho em biết diện tích phòng để lọc đúng dải công suất ạ",
};

/**
 * Dựng một bản ghi quyết định mẫu.
 *
 * Kết quả BẮT BUỘC đi qua cổng công bố trước — không có đường tắt nào cho kiểm thử,
 * vì nếu có thì ràng buộc "kiểm tra trước khi lưu" sẽ hở ngay tại đây.
 */
export function sampleDecision(
  sessionId: SessionId,
  result: TurnResult,
  turnId: TurnId = newTurnId()
): DecisionRecordData {
  const outcome = verifyForPublication(result);
  if (!outcome.verified) {
    throw new Error(
      `Dữ liệu mẫu không qua được cổng công bố: ${outcome.check.checkedClaims
        .filter((c) => !c.verified)
        .map((c) => c.note)
        .join("; ")}`
    );
  }

  return {
    turnId,
    sessionId,
    input: sampleInput(sessionId, turnId),
    appliedRuleVersions: { ruleset: "test@v1", ranker: "test@v1", sufficiency: null },
    eligibility: null,
    ranking: null,
    modelTraces: [],
    publicationCheck: outcome.check,
    result: outcome.verified,
    releaseVersion: "demo@v0",
    createdAt: "2026-07-18T02:00:01.000Z",
  };
}
