// ĐIỂM KẾT NỐI 2/3 — dịch vụ mô hình (#24 mục 7).
//
// CONTEXT.md, "Cổng năng lực mô hình": gọi mô hình theo NĂNG LỰC CÓ KIỂU, không
// theo tên nhà cung cấp. Kết quả mô hình luôn là ứng viên CHƯA ĐƯỢC TIN CẬY; chi
// tiết riêng của dịch vụ chỉ nằm trong bộ chuyển tiếp và không được trao quyền
// quyết định sự thật, lọc hay công bố.
//
// Vì vậy giao diện này KHÔNG có hàm kiểu `chat(messages)`. Mỗi năng lực là một
// hàm riêng, đầu ra có kiểu hẹp, để mô hình không thể tự ý mở rộng vai trò.

import type { Result } from "../contracts/status";
import type { SourcedProduct } from "./product-source";

/** Nhu cầu mô hình trích được từ lời khách. Luôn là ứng viên, phải kiểm chứng lại. */
export interface ExtractedNeeds {
  category: string | null;
  /** Tiêu chí số của ngành (m² / người / inch). */
  fitValue: number | null;
  budgetVnd: number | null;
  priorities: readonly string[];
  /** Phần lời khách mà mô hình dựa vào — để người đọc dấu vết đối chiếu. */
  quotedSpans: readonly string[];
}

/** Ba năng lực mô hình được phép dùng ở bản trình diễn 48 giờ. */
export interface ModelService {
  /** Tên bản hiện thực, ghi vào ảnh chụp quyết định. */
  readonly name: string;

  /** Mô hình có sẵn sàng không. Không sẵn sàng thì lõi chạy luồng tất định. */
  isReady(): Promise<boolean>;

  /** Năng lực 1: đề xuất cách trích xuất quan sát từ lời khách. */
  extractNeeds(userText: string): Promise<Result<ExtractedNeeds>>;

  /** Năng lực 2: diễn đạt một câu hỏi kiểm chứng cho khoảng trống đã xác định. */
  phraseQuestion(gap: string, context: string): Promise<Result<string>>;

  /**
   * Năng lực 3: soạn lời giải thích cho các sản phẩm ĐÃ được chọn.
   *
   * Mô hình chỉ diễn đạt — nó nhận danh sách đã chốt và không được thêm, bớt hay
   * đổi thứ tự. Cổng công bố sẽ đối chiếu lại từng con số trước khi hiển thị.
   */
  composeExplanation(
    products: readonly SourcedProduct[],
    needs: ExtractedNeeds
  ): Promise<Result<string>>;
}
