// HỒ SƠ CÁ NHÂN HOÁ — ở lại MÁY KHÁCH, không gửi lên máy chủ để lưu.
//
// Vì sao localStorage: đúng cam kết "dữ liệu khách không rời thiết bị" của bản demo
// (khớp yêu cầu bảo vệ dữ liệu của đối tác). Máy chủ KHÔNG lưu hồ sơ này; nó chỉ
// nhận `category` như một GỢI Ý cho lượt hiện tại, và mọi số liệu tư vấn vẫn phải
// truy được về catalog — hồ sơ KHÔNG bao giờ trở thành căn cứ cho giá/thông số.
//
// Chỉ giữ thứ giúp mở lời tự nhiên hơn ở lần quay lại: ngành vừa quan tâm, tầm giá
// từng nêu, lần cuối trò chuyện. Không tên, không số điện thoại, không địa chỉ.

const KEY = "dmx.assistant.profile.v1";

export interface CustomerProfile {
  /** Ngành hàng khách quan tâm gần nhất (slug), để mời tiếp cho đúng chỗ. */
  lastCategory?: string;
  /** Nhãn hiển thị của ngành đó, giữ sẵn để khỏi tra lại registry ở client. */
  lastCategoryLabel?: string;
  /** Tầm giá khách từng nêu (VND) — chỉ dùng để gợi ý, không tự áp vào bộ lọc. */
  lastBudgetVnd?: number;
  /** Số lượt đã trò chuyện, để phân biệt khách mới và khách quay lại. */
  turns?: number;
  /** ISO 8601, lần cập nhật gần nhất. */
  updatedAt?: string;
}

export function loadProfile(): CustomerProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as CustomerProfile;
    return p && typeof p === "object" ? p : null;
  } catch {
    return null;
  }
}

/** Ghi đè các trường có giá trị; giữ nguyên phần còn lại. */
export function saveProfile(patch: CustomerProfile): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadProfile() ?? {};
    const next: CustomerProfile = {
      ...current,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null)),
      turns: (current.turns ?? 0) + (patch.turns ?? 0),
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Trình duyệt chặn localStorage (chế độ riêng tư) → bỏ qua, chat vẫn chạy.
  }
}

/** Khách tự xoá dấu vết cá nhân hoá của mình. */
export function clearProfile(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* bỏ qua */
  }
}

/** Khách quay lại (đã từng chốt ngành ở phiên trước) thì mới mời tiếp. */
export function isReturning(p: CustomerProfile | null): p is CustomerProfile {
  return !!p?.lastCategory && (p.turns ?? 0) > 0;
}
