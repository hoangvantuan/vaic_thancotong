// Kiểu dữ liệu dùng chung — thiết kế ĐA NGÀNH: không có gì gắn cứng với máy lạnh.

/** Slug ngành hàng, lấy từ config/categories.json (vd "may_lanh", "tivi"). */
export type CategorySlug = string;

/** Khoảng số. max = null nghĩa là "trở lên"; giá trị điểm là {min:n, max:n}. */
export interface NumRange {
  min: number;
  max: number | null;
}

/** Giá đã chuẩn hoá. Giữ null nếu nguồn thiếu — KHÔNG suy diễn giá. */
export interface NormalizedPrice {
  original: number | null;
  sale: number | null;
  /** Giá hiển thị = sale ?? original. null nếu không có giá. */
  display: number | null;
  hasPrice: boolean;
  /** % giảm, chỉ tính khi có CẢ giá gốc lẫn giá bán và giá gốc cao hơn. */
  discountPercent: number | null;
}

/** Một thông số nổi bật để hiện trên thẻ (label + bản rút gọn + nguyên văn). */
export interface Highlight {
  label: string;
  text: string;
  /** Nguyên văn từ catalog — dùng cho tooltip, đảm bảo không mất dữ liệu thật. */
  title: string;
}

/** Sản phẩm đã chuẩn hoá, không phụ thuộc ngành. */
export interface NormalizedProduct {
  id: string;
  category: CategorySlug;
  categoryLabel: string;
  name: string;
  brand: string;
  price: NormalizedPrice;
  rating: number | null;
  quantitySold: number | null;
  /** Tiêu chí số của ngành (m² / người / inch) đã parse. null nếu ngành không có hoặc thiếu dữ liệu. */
  fit: NumRange | null;
  /** Nguyên văn ô dữ liệu sinh ra `fit` — để trích dẫn. */
  fitRaw: string | null;
  highlights: Highlight[];
  imageUrl: string | null;
  url: string | null;
  promotion: string | null;
  /** specs gốc ĐÃ loại field cấm. Nguồn trích dẫn duy nhất — chống bịa. */
  rawFields: Record<string, unknown>;
}

/** Nhu cầu (slot) trích từ hội thoại. */
export interface Needs {
  /** Ngành khách đang hỏi. */
  category?: CategorySlug;
  /** Giá trị tiêu chí số của ngành: 18 (m²) / 4 (người) / 55 (inch). */
  fitValue?: number;
  /** Ngân sách tối đa (VND). */
  budgetVnd?: number;
  /** "quiet" | "energy" | "cheap" | "brand:<Hãng>" */
  priorities?: string[];
}

/** Sản phẩm đã chọn để trả về UI + làm ngữ liệu cho LLM. */
export interface RecommendedProduct {
  id: string;
  name: string;
  brand: string;
  categoryLabel: string;
  priceDisplay: number | null;
  priceOriginal: number | null;
  hasPrice: boolean;
  discountPercent: number | null;
  priceUpdating: boolean;
  rating: number | null;
  quantitySold: number | null;
  /** Mô tả tiêu chí khớp, vd "15–20m²", "4–5 người", "65 inch". */
  fitText: string | null;
  highlights: Highlight[];
  imageUrl: string | null;
  url: string | null;
  promotion: string | null;
  /** Một câu vì sao hợp — chỉ bám field thật. */
  reason: string;
}
