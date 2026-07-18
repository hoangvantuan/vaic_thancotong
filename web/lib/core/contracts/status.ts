// Cách biểu diễn dữ liệu thiếu, mâu thuẫn, lỗi và chưa xác minh (#24 mục 10).
//
// Nguyên tắc từ CONTEXT.md — "Trạng thái giá trị nguồn": các trạng thái này KHÔNG
// được gộp thành một giá trị rỗng, và KHÔNG tự đổi thành đúng hoặc sai. Vì vậy ở
// đây không có `undefined` mang nghĩa "không biết": mọi giá trị đều mang theo lý do
// vì sao nó vắng mặt.

/** Vì sao một giá trị không có mặt. Mỗi nhãn giữ nguyên tình trạng tại nguồn. */
export type AbsenceReason =
  /** Nguồn không có trường này. */
  | "missing"
  /** Trường không áp dụng cho loại sản phẩm này. */
  | "not_applicable"
  /** Nguồn cố tình không công bố. */
  | "undisclosed"
  /** Nguồn có nhưng chưa đọc được, chờ lần đồng bộ sau. */
  | "pending_update"
  /** Đọc được nhưng sai dạng, không dùng được. */
  | "invalid"
  /** Từng hợp lệ nhưng đã quá hạn. */
  | "expired";

/**
 * Một giá trị lấy từ nguồn, ở đúng một trong ba tình trạng.
 *
 * `conflicting` giữ CẢ HAI phía thay vì chọn một hoặc lấy trung bình — theo
 * "Mâu thuẫn chưa giải quyết" trong CONTEXT.md.
 */
export type SourcedValue<T> =
  | { status: "observed"; value: T }
  | { status: "absent"; reason: AbsenceReason }
  | { status: "conflicting"; values: readonly T[] };

export function observed<T>(value: T): SourcedValue<T> {
  return { status: "observed", value };
}

export function absent<T>(reason: AbsenceReason): SourcedValue<T> {
  return { status: "absent", reason };
}

export function conflicting<T>(values: readonly T[]): SourcedValue<T> {
  if (values.length < 2) {
    throw new Error("Mâu thuẫn phải có ít nhất hai giá trị cùng còn hiệu lực");
  }
  return { status: "conflicting", values };
}

/**
 * Đọc giá trị chỉ khi nó đã được quan sát. Vắng mặt và mâu thuẫn đều trả null —
 * nơi gọi buộc phải xử lý, không nhận được giá trị đoán.
 */
export function valueOrNull<T>(v: SourcedValue<T>): T | null {
  return v.status === "observed" ? v.value : null;
}

/**
 * Đọc giá trị SỐ đã quan sát. Trả null nếu vắng mặt, mâu thuẫn, hoặc nguồn cho
 * kiểu khác — luật so sánh số không được tự ép chuỗi thành số.
 */
export function numberOrNull(v: SourcedValue<string | number>): number | null {
  const raw = valueOrNull(v);
  return typeof raw === "number" ? raw : null;
}

/** Trạng thái kiểm chứng của một nhận định trước khi được phép công bố. */
export type VerificationState =
  /** Đã đối chiếu với nguồn, được phép công bố. */
  | "verified"
  /** Chưa đối chiếu. Với an toàn/pháp lý/tương thích thì phải đóng an toàn. */
  | "unverified"
  /** Đối chiếu rồi và sai so với nguồn. */
  | "contradicted";

/** Lỗi có cấu trúc — không dùng chuỗi tự do để nơi gọi phân nhánh được. */
export type CoreErrorKind =
  | "invalid_input"
  | "forbidden"
  | "not_found"
  | "data_source_failure"
  | "model_failure"
  | "storage_failure";

export interface CoreError {
  kind: CoreErrorKind;
  /** Thông điệp cho người phát triển. Không chứa bí mật, không chứa PII. */
  message: string;
  /** Bộ phận sinh ra lỗi, để lần theo khi gỡ rối. */
  origin?: string;
}

export function coreError(
  kind: CoreErrorKind,
  message: string,
  origin?: string
): CoreError {
  return { kind, message, origin };
}

/** Kết quả có thể hỏng, thay cho việc ném ngoại lệ qua ranh giới mô-đun. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: CoreError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T>(error: CoreError): Result<T> {
  return { ok: false, error };
}
