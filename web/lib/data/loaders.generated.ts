// SINH TỰ ĐỘNG bởi `npm run data:extract` từ config/categories.json — ĐỪNG sửa tay.
// Bảng import TĨNH để Next tách mỗi ngành thành một chunk riêng (chỉ ngành khách
// đang hỏi mới được nạp) và dữ liệu nằm sẵn trong bản build.
import type { CategorySlug } from "@/lib/types";

export const LOADERS: Record<CategorySlug, () => Promise<{ default: unknown }>> = {
  may_lanh: () => import("@/data/may_lanh.json"),
  tu_lanh: () => import("@/data/tu_lanh.json"),
  may_giat: () => import("@/data/may_giat.json"),
  tivi: () => import("@/data/tivi.json"),
  dien_thoai: () => import("@/data/dien_thoai.json"),
  laptop: () => import("@/data/laptop.json"),
};
