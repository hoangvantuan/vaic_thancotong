// BƯỚC 3 — CỔNG CÔNG BỐ AN TOÀN.
//
// CONTEXT.md, "Cổng công bố an toàn": cửa kiểm tra CUỐI, xác nhận từng nhận định
// nguyên tử, sản phẩm, số liệu, điều kiện, nguồn và giới hạn TRƯỚC khi được phép
// hiển thị. Nếu bản soạn không đạt, cổng chỉ cho sửa lại MỘT lần rồi phải chuyển
// sang cách trình bày tất định hoặc từ chối có phạm vi.

import type { Brand } from "../contracts/brand";
import type { PublicationCheck } from "../contracts/decision";
import type { SourcedClaim } from "../contracts/provenance";
import { validateProvenance } from "../contracts/provenance";
import type { TurnResult } from "../contracts/turn";

/**
 * Kết quả ĐÃ qua cổng công bố.
 *
 * Chỉ `verifyForPublication()` tạo được. `DecisionRecordData.result` đòi đúng kiểu
 * này, nên không thể lưu — và do đó không thể hiển thị — một kết quả chưa kiểm tra.
 */
export type VerifiedTurnResult = Brand<TurnResult, "VerifiedTurnResult">;

export interface PublicationOutcome {
  /** Có giá trị khi `check.passed` là true. */
  verified: VerifiedTurnResult | null;
  check: PublicationCheck;
}

/** Rút mọi nhận định có nguồn ra khỏi một kết quả, để đối chiếu từng cái một. */
function claimsOf(result: TurnResult): readonly SourcedClaim[] {
  if (result.kind !== "recommend") return [];
  return result.recommendations.flatMap((r) => [...r.reasons, ...r.tradeoffs]);
}

/**
 * Chạy cổng công bố trên một kết quả lượt.
 *
 * Kiểm tra ở bản khung này: mọi nhận định phải có nguồn chứng minh đủ sáu trường
 * và đúng dạng. Phiếu #27 bổ sung đối chiếu từng con số với giá trị gốc.
 *
 * `repairAttempted` đánh dấu đây đã là lần soạn lại — không đạt nữa thì nơi gọi
 * phải chuyển sang từ chối có phạm vi, không được soạn lại lần ba.
 */
export function verifyForPublication(
  result: TurnResult,
  options: { repairAttempted?: boolean } = {}
): PublicationOutcome {
  const claims = claimsOf(result);

  const checkedClaims = claims.map((c) => {
    const problems = validateProvenance(c.provenance);
    return {
      claim: c.claim,
      verified: problems.length === 0,
      note: problems.length === 0 ? "nguồn chứng minh hợp lệ" : problems.join("; "),
    };
  });

  const passed = checkedClaims.every((c) => c.verified);

  const check: PublicationCheck = {
    passed,
    checkedClaims,
    repairAttempted: options.repairAttempted ?? false,
  };

  return {
    verified: passed ? (result as VerifiedTurnResult) : null,
    check,
  };
}

/**
 * Từ chối có phạm vi — lối thoát khi cổng công bố không đạt sau lần sửa duy nhất.
 *
 * Từ chối vẫn phải đi qua cổng, nhưng nó không mang nhận định sản phẩm nào nên
 * luôn đạt. Đây là lý do hệ thống không bao giờ kẹt.
 */
export function declineAfterFailedPublication(whatWouldHelp: string): PublicationOutcome {
  const result: TurnResult = {
    kind: "decline",
    reason: "insufficient_evidence",
    whatWouldHelp,
  };
  return verifyForPublication(result, { repairAttempted: true });
}
