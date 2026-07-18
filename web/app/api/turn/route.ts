// Chạy một lượt tư vấn qua khung lõi.
//
// Đây là đường phục vụ theo hợp đồng #24: đầu vào đúng `TurnInput`, đầu ra đúng
// một trong ba loại `TurnResult`, và ảnh chụp quyết định được lưu TRƯỚC khi trả.
//
// Mã lượt do MÁY CHỦ cấp (#24 mục 8). Client gửi lại `turnId` đã có thì nhận đúng
// kết quả cũ, không tạo bản ghi thứ hai — chính là cơ chế thử lại an toàn.

import { createCoreServices } from "@/lib/core/composition";
import { newTurnId, parseSessionId, parseTurnId } from "@/lib/core/contracts/ids";
import { coreError } from "@/lib/core/contracts/status";
import {
  checkAccessCode,
  errorResponse,
  isCoreError,
  readSessionSecret,
} from "@/lib/core/http";
import { EMPTY_RULES, runTurn } from "@/lib/core/pipeline/run-turn";
import type { TurnInput } from "@/lib/core/contracts/turn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = checkAccessCode(req);
  if (denied) return errorResponse(denied);

  const secret = readSessionSecret(req);
  if (isCoreError(secret)) return errorResponse(secret);

  let body: { sessionId?: string; userText?: string; category?: string; turnId?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse(coreError("invalid_input", "Thân yêu cầu không phải JSON", "api/turn"));
  }

  const sessionId = parseSessionId(body.sessionId ?? "");
  if (!sessionId) {
    return errorResponse(coreError("invalid_input", "Thiếu hoặc sai sessionId", "api/turn"));
  }

  const userText = (body.userText ?? "").trim();
  if (!userText) {
    return errorResponse(coreError("invalid_input", "Thiếu userText", "api/turn"));
  }

  // Client được gửi lại mã lượt cũ để thử lại; không gửi thì máy chủ cấp mã mới.
  const turnId = body.turnId ? parseTurnId(body.turnId) : newTurnId();
  if (!turnId) {
    return errorResponse(coreError("invalid_input", "turnId sai định dạng", "api/turn"));
  }

  const input: TurnInput = {
    sessionId,
    turnId,
    userText,
    category: body.category,
    receivedAt: new Date().toISOString(),
  };

  const services = createCoreServices();
  // #24 không sở hữu luật chọn sản phẩm — phiếu #26 thay EMPTY_RULES bằng bộ luật thật.
  const result = await runTurn(input, secret, services, EMPTY_RULES);
  if (!result.ok) return errorResponse(result.error);

  return Response.json({
    turnId: result.data.turnId,
    result: result.data.result,
    // Đường dẫn để mở màn hình dấu vết cho lượt này.
    decisionTrace: {
      releaseVersion: result.data.releaseVersion,
      publicationPassed: result.data.publicationCheck.passed,
      screenedCount: result.data.eligibility?.rows.length ?? 0,
      rankedCount: result.data.ranking?.rows.length ?? 0,
    },
  });
}
