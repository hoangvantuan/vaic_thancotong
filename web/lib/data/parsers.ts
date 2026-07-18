import type { NumRange } from "@/lib/types";

/**
 * Bộ parser dùng chung cho mọi ngành, tra theo TÊN trong config/categories.json.
 * Mỗi parser biến một chuỗi thô của catalog thành khoảng số {min,max} để so khớp.
 * max = null nghĩa là "trở lên". Giá trị điểm được biểu diễn bằng {min:n, max:n}.
 *
 * Mọi biểu thức ở đây đều bám ĐÚNG các dạng chuỗi có thật trong dữ liệu (đã thống kê
 * tần suất trước khi viết), không phỏng đoán.
 */
export type Parser = (raw: string) => NumRange | null;

/**
 * Máy lạnh — "Phạm vi sử dụng" / "Phạm vi làm lạnh hiệu quả".
 *   "Từ 15 - 20m² (từ 40 đến 60m³)" → {15, 20}
 *   "Từ 30 - 40m2 (...)"            → {30, 40}   (m2 không có ký tự trên)
 *   "Dưới 15m² (...)"               → {0, 15}
 *   "Trên 160m²"                     → {160, null}
 */
export const roomAreaRange: Parser = (raw) => {
  if (!raw) return null;
  const range = raw.match(/Từ\s*(\d+)\s*[-–]\s*(\d+)\s*m/iu);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const under = raw.match(/Dưới\s*(\d+)\s*m/iu);
  if (under) return { min: 0, max: Number(under[1]) };
  const over = raw.match(/Trên\s*(\d+)\s*m/iu);
  if (over) return { min: Number(over[1]), max: null };
  return null;
};

/**
 * Số người sử dụng — dùng chung cho tủ lạnh và máy giặt (hai ngành cùng một dạng chuỗi).
 *   "Trên 7 người"            → {7, null}
 *   "Từ 3 - 5 người"          → {3, 5}
 *   "635 lít - Trên 5 người"  → {5, null}   (tủ lạnh nhét cả dung tích vào cùng ô)
 *   "515 lít - 4 - 5 người"   → {4, 5}
 *   "Không"                    → null       (có thật trong dữ liệu máy giặt)
 */
export const peopleRange: Parser = (raw) => {
  if (!raw) return null;
  // Chỉ xét phần đứng trước chữ "người" để không dính số lít ở đầu chuỗi.
  const m = raw.match(/(Trên|Dưới|Từ)?\s*(\d+)\s*(?:[-–]\s*(\d+)\s*)?người/iu);
  if (!m) return null;
  const kw = (m[1] ?? "").toLowerCase();
  const a = Number(m[2]);
  const b = m[3] != null ? Number(m[3]) : null;
  if (b != null) return { min: a, max: b };
  if (kw === "trên") return { min: a, max: null };
  if (kw === "dưới") return { min: 0, max: a };
  return { min: a, max: a };
};

/** Tivi — "65 inch" → {65, 65}. Laptop — '14"' cũng nhận. */
export const inches: Parser = (raw) => {
  if (!raw) return null;
  const m = raw.match(/(\d{2,3}(?:[.,]\d)?)\s*(?:inch|"|”)/iu);
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  return Number.isFinite(v) ? { min: v, max: v } : null;
};

/** "16 GB" → {16,16}. Đơn vị MB quy về GB để so sánh cùng thang. */
export const gigabytes: Parser = (raw) => {
  if (!raw) return null;
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*(GB|MB|TB)/iu);
  if (!m) return null;
  let v = Number(m[1].replace(",", "."));
  const unit = m[2].toUpperCase();
  if (unit === "MB") v = v / 1024;
  if (unit === "TB") v = v * 1024;
  return Number.isFinite(v) ? { min: v, max: v } : null;
};

export const PARSERS: Record<string, Parser> = {
  roomAreaRange,
  peopleRange,
  inches,
  gigabytes,
};

// ---------- Định dạng hiển thị cho highlight ----------

/** "5 sao (Hiệu suất năng lượng 5.68)" → 5. */
export function energyStars(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/^(\d)\s*sao/iu);
  return m ? Number(m[1]) : null;
}

/**
 * "Dàn lạnh: 36/26/21 dB - Dàn nóng: 47 dB" → 21 (thấp nhất của DÀN LẠNH —
 * phần đặt trong phòng, thứ khách thật sự nghe thấy).
 */
export function minIndoorNoiseDb(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const indoor = raw.match(/Dàn lạnh:\s*([\d.,/]+)/iu);
  const src = indoor?.[1] ?? raw.match(/([\d.,/]+)\s*dB/iu)?.[1];
  if (!src) return null;
  const nums = src
    .split("/")
    .map((n) => Number(n.replace(",", ".")))
    .filter((n) => Number.isFinite(n));
  return nums.length ? Math.min(...nums) : null;
}

/** Rút gọn giá trị highlight theo `format` khai báo trong config. */
export function formatHighlight(
  format: string,
  raw: string
): { text: string; title: string } {
  if (format === "stars") {
    const s = energyStars(raw);
    return { text: s != null ? `${s}★` : raw, title: raw };
  }
  if (format === "db") {
    const db = minIndoorNoiseDb(raw);
    return { text: db != null ? `${db} dB` : raw, title: raw };
  }
  return { text: raw.length > 26 ? `${raw.slice(0, 25)}…` : raw, title: raw };
}
