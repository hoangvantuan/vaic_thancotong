/** 12490000 → "12.490.000₫". Chỉ format khi có số thật, không suy diễn. */
export function formatVnd(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return `${n.toLocaleString("vi-VN")}₫`;
}

/** 14500 → "14,5k" (số lượng đã bán, hiển thị gọn kiểu sàn TMĐT). */
export function formatSold(n: number | null | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(".", ",")}k`;
}
