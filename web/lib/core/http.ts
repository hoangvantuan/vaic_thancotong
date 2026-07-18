// Biên HTTP — nơi DUY NHẤT chuyển chuỗi từ bên ngoài thành kiểu của lõi.
//
// Mọi tuyến API đi qua đây, nên quy tắc "phải có cả mã truy cập chung lẫn mã bí mật
// phiên" nằm ở một chỗ thay vì lặp lại ở từng tuyến và lệch nhau.

import { parseSessionSecret, type SessionSecret } from "./contracts/ids";
import { accessCodeValid } from "./auth/secrets";
import type { CoreError } from "./contracts/status";
import { coreError } from "./contracts/status";

export const ACCESS_CODE_HEADER = "x-demo-access-code";
export const SESSION_SECRET_HEADER = "x-session-secret";
export const ADMIN_SECRET_HEADER = "x-demo-admin-secret";

/** Mã HTTP tương ứng từng loại lỗi lõi. */
const STATUS_BY_KIND: Record<CoreError["kind"], number> = {
  invalid_input: 400,
  forbidden: 403,
  not_found: 404,
  data_source_failure: 502,
  model_failure: 502,
  storage_failure: 500,
};

/**
 * Trả lỗi cho client.
 *
 * Chỉ gửi `kind` và `message` — `origin` giữ lại phía máy chủ để không lộ cấu trúc
 * nội bộ ra ngoài.
 */
export function errorResponse(error: CoreError): Response {
  return Response.json(
    { error: { kind: error.kind, message: error.message } },
    { status: STATUS_BY_KIND[error.kind] }
  );
}

/** Cổng 1: mã truy cập chung. Sai hoặc thiếu là dừng ngay. */
export function checkAccessCode(req: Request): CoreError | null {
  const provided = req.headers.get(ACCESS_CODE_HEADER);
  return accessCodeValid(provided)
    ? null
    : coreError("forbidden", "Mã truy cập không hợp lệ", "http");
}

/** Cổng 2: mã bí mật phiên. Chỉ gọi SAU khi cổng 1 đã qua. */
export function readSessionSecret(req: Request): SessionSecret | CoreError {
  const raw = req.headers.get(SESSION_SECRET_HEADER);
  if (!raw) {
    return coreError("forbidden", "Thiếu mã bí mật phiên", "http");
  }
  const parsed = parseSessionSecret(raw);
  return parsed ?? coreError("forbidden", "Mã bí mật phiên sai định dạng", "http");
}

/** Dạng lỗi và dạng dữ liệu phân biệt được bằng thuộc tính `kind`. */
export function isCoreError(v: unknown): v is CoreError {
  return typeof v === "object" && v !== null && "kind" in v && "message" in v;
}
