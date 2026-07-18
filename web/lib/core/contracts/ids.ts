// Định danh do MÁY CHỦ sinh. Trình duyệt không bao giờ tự đặt mã phiên hay mã lượt
// (#24 mục 8) — nếu client được đặt mã, nó có thể đoán mã của người khác.

import type { Brand } from "./brand";

/** Mã phiên tư vấn. Công khai được — biết mã này KHÔNG đủ để đọc phiên. */
export type SessionId = Brand<string, "SessionId">;

/** Mã một lượt trong phiên. Dùng làm khoá bất biến (#24 mục 8). */
export type TurnId = Brand<string, "TurnId">;

/**
 * Mã bí mật riêng của một phiên. Cùng với mã truy cập chung, đây mới là thứ
 * chứng minh quyền sở hữu phiên (#24 mục 9). Không bao giờ ghi vào nhật ký.
 */
export type SessionSecret = Brand<string, "SessionSecret">;

/** 128 bit ngẫu nhiên, đủ để không đoán được bằng vét cạn. */
function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newSessionId(): SessionId {
  return `ses_${randomToken()}` as SessionId;
}

export function newTurnId(): TurnId {
  return `turn_${randomToken()}` as TurnId;
}

export function newSessionSecret(): SessionSecret {
  return `sec_${randomToken()}` as SessionSecret;
}

/**
 * Ép một chuỗi từ bên ngoài (thân yêu cầu, header) thành mã đã có kiểu.
 * Chỉ dùng ở biên ứng dụng, sau khi đã kiểm tra dạng.
 */
export function parseSessionId(raw: string): SessionId | null {
  return /^ses_[0-9a-f]{32}$/.test(raw) ? (raw as SessionId) : null;
}

export function parseTurnId(raw: string): TurnId | null {
  return /^turn_[0-9a-f]{32}$/.test(raw) ? (raw as TurnId) : null;
}

export function parseSessionSecret(raw: string): SessionSecret | null {
  return /^sec_[0-9a-f]{32}$/.test(raw) ? (raw as SessionSecret) : null;
}
