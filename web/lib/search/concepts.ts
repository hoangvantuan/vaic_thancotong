/**
 * Ánh xạ ngôn ngữ khách hàng → facet/tag trong catalog — port từ dmx_search/concepts.py.
 *
 * Hai chiều ánh xạ, đều cần thiết:
 *   1. QUERY_LEXICON: khách nói "ít ồn" / "it on" / "chạy êm" → concept "quiet"
 *   2. CONCEPTS.tagAny: catalog ghi "Best Sleep" / "Chế độ ngủ ngon" → concept "sleep"
 *
 * Rule chứ không phải embedding: các hãng đặt tên marketing tuỳ hứng ("Sleep Curve",
 * "Dream Mode", "Good Sleep" đều là một thứ). Rule kiểm soát và giải thích được.
 */

import { fold } from "./normalize";

export interface Concept {
  key: string;
  /** Tên bình dân để giải thích cho khách. */
  label: string;
  /** Tag khớp nếu chứa BẤT KỲ chuỗi nào (đã fold). */
  tagAny: string[];
  /** Loại trừ, chặn false-positive. */
  tagNot?: string[];
}

export const CONCEPTS: Record<string, Concept> = {
  quiet: {
    key: "quiet",
    label: "chạy êm",
    tagAny: ["sieu em", "yen tinh", "quiet", "giam tieng on", "em diu", "airfree"],
  },
  sleep: {
    key: "sleep",
    label: "có chế độ ngủ đêm",
    tagAny: ["ngu dem", "sleep", "che do ngu", "van hanh khi ngu", "dream mode", "ngu ngon"],
  },
  kids_elderly: {
    key: "kids_elderly",
    label: "hợp với trẻ nhỏ và người già",
    tagAny: ["tre em", "nguoi gia", "tre nho", "baby", "thoi gio de chiu"],
    tagNot: ["khoa tre em"], // khoá an toàn, không phải tiện nghi gió
  },
  wifi: {
    key: "wifi",
    label: "điều khiển bằng điện thoại",
    tagAny: ["wi-fi", "wifi", "dien thoai", "smartthings", "comfort cloud", "mobile"],
  },
  self_clean: {
    key: "self_clean",
    label: "tự làm sạch",
    tagAny: ["tu lam sach", "self clean"],
  },
  dehumidify: {
    key: "dehumidify",
    label: "hút ẩm",
    tagAny: ["hut am", "khu am", "kiem soat do am"],
  },
  anti_corrosion: {
    key: "anti_corrosion",
    label: "chống ăn mòn (hợp vùng biển)",
    tagAny: ["chong an mon", "bluefin", "blue fin", "golden fin", "goldguard", "durafin"],
  },
  timer: {
    key: "timer",
    label: "hẹn giờ bật tắt",
    tagAny: ["hen gio"],
  },
  auto_restart: {
    key: "auto_restart",
    label: "tự bật lại khi có điện",
    tagAny: ["tu khoi dong lai", "tu dong khoi dong"],
  },
};

/** Từ khách hàng thật sự gõ → concept / intent. Tất cả key đã fold. */
export const QUERY_LEXICON: Record<string, string[]> = {
  quiet: ["it on", "khong on", "chay em", "em", "yen tinh", "on ao", "silent", "quiet", "khong ku", "em ai"],
  sleep: ["ngu dem", "che do ngu", "ban dem", "buoi toi", "sleep"],
  kids_elderly: ["tre em", "tre nho", "em be", "nguoi gia", "ong ba", "con nho", "baby"],
  wifi: ["wifi", "wi-fi", "dieu khien tu xa", "dien thoai", "smart", "thong minh", "app"],
  self_clean: ["tu lam sach", "tu ve sinh", "khong can ve sinh", "self clean"],
  dehumidify: ["hut am", "am uot", "nom", "no'm", "am"],
  anti_corrosion: ["gan bien", "vung bien", "nuoc man", "an mon", "ven bien", "hai san"],
  timer: ["hen gio", "tu tat", "tu bat"],
  // intent trên facet số
  _energy: ["tiet kiem dien", "it ton dien", "ton dien", "hoa don dien", "tien dien", "eco", "inverter", "tiet kiem"],
  _cheap: ["re", "gia re", "tiet kiem tien", "binh dan", "vua tien", "it tien"],
  _premium: ["cao cap", "xin", "tot nhat", "xin xo", "hang tot"],
};

/** Từ khoá suy ra loại phòng → ảnh hưởng trọng số (phòng ngủ ưu tiên êm). */
export const ROOM_LEXICON: Record<string, string[]> = {
  bedroom: ["phong ngu", "ngu", "phong con", "phong be"],
  living: ["phong khach", "khach", "sinh hoat", "phong an"],
  office: ["van phong", "cong ty", "lam viec", "phong hop"],
};

/** Một tag catalog → các concept nó thoả. Dùng khi index sản phẩm. */
export function tagToConcepts(tag: string): string[] {
  const f = fold(tag);
  const out: string[] = [];
  for (const c of Object.values(CONCEPTS)) {
    if (c.tagNot?.some((x) => f.includes(x))) continue;
    if (c.tagAny.some((x) => f.includes(x))) out.push(c.key);
  }
  return out;
}

/**
 * "Inverter | ECO tích hợp A.I", "Dual Inverter" → true. "Không có" → false.
 * Inverter là tín hiệu tiết kiệm điện mạnh nhất có fill rate cao.
 */
export function isInverter(rawEnergyTech: unknown): boolean {
  if (!rawEnergyTech) return false;
  return fold(rawEnergyTech).includes("inverter");
}
