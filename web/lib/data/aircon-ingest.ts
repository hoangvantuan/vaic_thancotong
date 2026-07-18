// Cách LẤY danh sách máy lạnh đủ điều kiện xem xét và nguồn chứng minh từng trường (#25).
//
// Dữ liệu do `npm run data:ingest` sinh ra tại `data/ingest/may_lanh.normalized.json`:
// 100% bản ghi ngành máy lạnh trong kho, mỗi trường tư vấn mang một nguồn chứng minh
// sáu trường đúng hợp đồng `lib/core/contracts/provenance.ts`.

import type { Provenance } from "@/lib/core/contracts/provenance";
import { numberOrNull, valueOrNull } from "@/lib/core/contracts/status";

/** Các trường tư vấn đã chuẩn hoá — mỗi trường một nguồn chứng minh riêng. */
export type AirconField =
  | "name"
  | "brand"
  | "sourceCategoryName"
  | "priceObservedVnd"
  | "roomAreaMinM2"
  | "roomAreaMaxM2"
  | "coolingCapacityBtu"
  | "coolingCapacityHp"
  | "energyLabelStars"
  | "noiseIndoorMinDb"
  | "inverter";

/** Một bản ghi máy lạnh đã nạp — giữ nguyên gốc trong provenance, không đoán gì thêm. */
export interface IngestedAircon {
  /** Khoá truy ngược duy nhất: đường dẫn tệp nguồn + số dòng. */
  recordKey: string;
  sourceLine: number;
  identifiers: {
    product_id: string | null;
    sku: string | null;
    model_code: string | null;
    productcode: string | null;
    name: string | null;
  };
  /** Đủ tên/mã nhận biết + đường dẫn nguồn + thời điểm ghi nhận (display_eligibility@v1). */
  displayEligible: boolean;
  displayEligibilityRule: string;
  displayIneligibilityReasons: readonly string[];
  /** Nhãn nhóm trùng (vd "product_id:9999") — chỉ đánh dấu, KHÔNG gộp (no_merge@v1). */
  duplicateGroup: string | null;
  fields: Record<AirconField, Provenance>;
}

let cache: IngestedAircon[] | null = null;

/** Toàn bộ bản ghi máy lạnh đã nạp — kể cả bản chưa đủ điều kiện hiển thị. */
export async function loadIngestedAircons(): Promise<IngestedAircon[]> {
  if (!cache) {
    const mod = await import("@/data/ingest/may_lanh.normalized.json");
    cache = (mod.default ?? mod) as unknown as IngestedAircon[];
  }
  return cache;
}

/**
 * Danh sách máy lạnh ĐỦ ĐIỀU KIỆN để xem xét hiển thị.
 * Sản phẩm thiếu thông tin nhận biết không bao giờ xuất hiện ở đây.
 */
export async function loadDisplayableAircons(): Promise<IngestedAircon[]> {
  return (await loadIngestedAircons()).filter((r) => r.displayEligible);
}

/** Nguồn chứng minh của một trường — đường truy ngược tệp/vị trí/thời điểm/quy tắc. */
export function fieldProvenance(record: IngestedAircon, field: AirconField): Provenance {
  return record.fields[field];
}

/**
 * Giá ĐÃ QUAN SÁT (VND) kèm thời điểm quan sát — không phải giá hiện tại.
 * Trả null khi nguồn không có giá; nơi gọi phải tự xử lý, không nhận giá đoán.
 */
export function observedPrice(
  record: IngestedAircon
): { vnd: number; observedAt: string } | null {
  const p = record.fields.priceObservedVnd;
  const vnd = numberOrNull(p.normalizedValue);
  return vnd === null ? null : { vnd, observedAt: p.observedAt };
}

/** Giá trị chuẩn hoá của một trường, hoặc null nếu vắng mặt / mâu thuẫn. */
export function normalizedValueOf(
  record: IngestedAircon,
  field: AirconField
): string | number | null {
  return valueOrNull(record.fields[field].normalizedValue);
}
