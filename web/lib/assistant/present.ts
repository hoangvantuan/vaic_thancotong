// Trình bày dữ liệu có-căn-cứ cho người đọc — KHÔNG suy diễn, chỉ diễn đạt lại thứ
// nguồn đã ghi. Nhãn tiếng Việt cho các khoá kỹ thuật, mốc thời gian quan sát, và
// nhãn cho trạng thái lọc.

import type { AbsenceReason } from "@/lib/core/contracts/status";
import type { DeclineReason, EligibilityVerdict } from "./types";

/** Nhãn tiếng Việt cho khoá thuộc tính. Khoá lạ giữ nguyên để không giấu dữ liệu. */
const FIELD_LABELS: Record<string, string> = {
  priceVnd: "Giá quan sát",
  capacityBtu: "Công suất",
  noiseDb: "Độ ồn",
};

/** Tách nhận định `field: rawValue` thành nhãn + giá trị nguyên văn. */
export function splitClaim(claim: string): { label: string; value: string } {
  const i = claim.indexOf(": ");
  if (i < 0) return { label: "", value: claim };
  const field = claim.slice(0, i);
  return { label: FIELD_LABELS[field] ?? field, value: claim.slice(i + 2) };
}

/** Host của đường dẫn nguồn, để hiện gọn (vd "www.dienmayxanh.com"). */
export function sourceHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** ISO 8601 → "18/07/2026". Giữ nguyên chuỗi nếu không đọc được — không đoán. */
export function formatObservedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function absenceLabel(reason: AbsenceReason): string {
  const map: Record<AbsenceReason, string> = {
    missing: "nguồn không có trường này",
    not_applicable: "không áp dụng cho loại này",
    undisclosed: "nguồn cố tình không công bố",
    pending_update: "chờ đồng bộ lần sau",
    invalid: "đọc được nhưng sai dạng",
    expired: "đã quá hạn hiệu lực",
  };
  return map[reason];
}

export function verdictLabel(v: EligibilityVerdict): { text: string; tone: "ok" | "bad" | "warn" } {
  if (v === "eligible") return { text: "Đủ điều kiện", tone: "ok" };
  if (v === "excluded") return { text: "Bị loại", tone: "bad" };
  return { text: "Chưa xác minh", tone: "warn" };
}

export function declineLabel(reason: DeclineReason): string {
  const map: Record<DeclineReason, string> = {
    insufficient_evidence: "Chưa đủ dữ kiện để kết luận",
    no_eligible_product: "Không có sản phẩm nào thoả hết ràng buộc",
    out_of_serving_scope: "Ngành hàng ngoài phạm vi bản trình diễn",
    data_unavailable: "Nguồn dữ liệu chưa sẵn sàng",
  };
  return map[reason];
}
