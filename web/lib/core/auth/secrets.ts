// Quy tắc bí mật (#24 mục 9).
//
// Ba bí mật KHÁC NHAU, không cái nào thay được cái nào:
//
//   DEMO_ACCESS_CODE  — mã truy cập chung, ai vào môi trường trình diễn cũng dùng.
//                       Chứng minh "được phép vào", KHÔNG chứng minh "là ai".
//   SessionSecret     — mã bí mật riêng từng phiên, máy chủ sinh lúc tạo phiên.
//                       Chứng minh "sở hữu đúng phiên này".
//   DEMO_ADMIN_SECRET — mã quản trị, chỉ dùng để xoá toàn bộ dữ liệu trình diễn.
//
// Đọc hoặc xoá một phiên đòi CẢ mã truy cập chung LẪN mã bí mật phiên. Chỉ biết
// mã phiên là chưa đủ — đó là lý do mã phiên được phép công khai.
//
// Không giá trị nào trong tệp này được hardcode; tất cả đọc từ biến môi trường.

import { createHash, timingSafeEqual } from "node:crypto";
import type { SessionSecret } from "../contracts/ids";

/** Băm một bí mật để lưu. Máy chủ không bao giờ giữ bản rõ. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/**
 * So sánh chống rò rỉ thời gian. So sánh `===` thông thường thoát sớm ở byte đầu
 * khác nhau, để lộ dần bí mật qua thời gian phản hồi.
 */
export function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual ném lỗi khi khác độ dài — băm trước để luôn cùng 32 byte.
  if (bufA.length !== bufB.length) {
    const hashA = Buffer.from(hashSecret(a), "hex");
    const hashB = Buffer.from(hashSecret(b), "hex");
    return timingSafeEqual(hashA, hashB);
  }
  return timingSafeEqual(bufA, bufB);
}

/** Mã bí mật phiên có khớp bản băm đã lưu không. */
export function sessionSecretMatches(secret: SessionSecret, storedHash: string): boolean {
  return secretsMatch(hashSecret(secret), storedHash);
}

/** Đọc mã truy cập chung từ môi trường. Chưa cấu hình thì trả null. */
export function configuredAccessCode(): string | null {
  return process.env.DEMO_ACCESS_CODE?.trim() || null;
}

/** Đọc mã quản trị từ môi trường. Chưa cấu hình thì trả null. */
export function configuredAdminSecret(): string | null {
  return process.env.DEMO_ADMIN_SECRET?.trim() || null;
}

/**
 * Kiểm tra mã truy cập chung do client gửi.
 *
 * Chưa cấu hình `DEMO_ACCESS_CODE` thì TỪ CHỐI tất cả, thay vì mở cửa. Cấu hình
 * thiếu là lỗi triển khai, không phải lý do để bỏ qua cổng.
 */
export function accessCodeValid(provided: string | null): boolean {
  const expected = configuredAccessCode();
  if (expected === null || provided === null) return false;
  return secretsMatch(provided, expected);
}

/** Kiểm tra mã quản trị. Cũng đóng an toàn khi chưa cấu hình. */
export function adminSecretValid(provided: string | null): boolean {
  const expected = configuredAdminSecret();
  if (expected === null || provided === null) return false;
  return secretsMatch(provided, expected);
}
