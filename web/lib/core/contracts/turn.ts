// Đầu vào một lượt tư vấn (#24 mục 3) và ba loại kết quả (#24 mục 4).

import type { SessionId, TurnId } from "./ids";
import type { SourcedClaim } from "./provenance";
import type { CategorySlug } from "@/lib/types";

/** Một lượt khách nói. Máy chủ nhận đúng cấu trúc này, không nhận dạng nào khác. */
export interface TurnInput {
  sessionId: SessionId;
  /**
   * Mã lượt do MÁY CHỦ cấp trước khi khách gửi (#24 mục 8). Gửi lại cùng mã này
   * phải trả đúng kết quả cũ và KHÔNG tạo bản ghi quyết định thứ hai.
   */
  turnId: TurnId;
  /** Nguyên văn khách nói ở lượt này. */
  userText: string;
  /** Ngành hàng khách đã chọn, nếu giao diện có gợi ý sẵn. */
  category?: CategorySlug;
  /** Thời điểm máy chủ nhận lượt, ISO 8601. */
  receivedAt: string;
}

/** Một khuyến nghị sản phẩm. Mọi lý do đều phải có nguồn — không có nhận định trần. */
export interface Recommendation {
  productId: string;
  displayName: string;
  /** Vì sao sản phẩm này hợp, mỗi ý là một nhận định nguyên tử có nguồn. */
  reasons: readonly SourcedClaim[];
  /** Điểm đánh đổi phải nói ra, không được giấu (CONTEXT.md — "Điểm đánh đổi sản phẩm"). */
  tradeoffs: readonly SourcedClaim[];
}

/**
 * Từ một đến ba khuyến nghị — ràng buộc ở mức KIỂU, không phải kiểm tra lúc chạy.
 * Mảng bốn phần tử sẽ không biên dịch được.
 */
export type OneToThree<T> = readonly [T] | readonly [T, T] | readonly [T, T, T];

/** Vì sao hệ thống từ chối. Từ chối luôn có phạm vi, không phải im lặng. */
export type DeclineReason =
  /** Chưa đủ dữ kiện để kết luận, cần khách bổ sung. */
  | "insufficient_evidence"
  /** Không sản phẩm nào qua được cổng điều kiện hợp lệ. */
  | "no_eligible_product"
  /** Ngành hàng nằm ngoài phạm vi phục vụ của bản phát hành này. */
  | "out_of_serving_scope"
  /** Nguồn dữ liệu hỏng, không thể trả lời có căn cứ. */
  | "data_unavailable";

/**
 * Đúng BA loại kết quả một lượt (#24 mục 4). Không có loại thứ tư.
 *
 * Union này là hợp đồng chung cho các phiếu #25–#30: mọi nhánh xử lý đều phải
 * quy về một trong ba, nên không nhóm nào tự đặt thêm dạng trả lời riêng.
 */
export type TurnResult =
  /** 1. Hỏi thêm ĐÚNG MỘT câu. Trường đơn, không phải mảng — không thể hỏi hai câu. */
  | {
      kind: "ask_one_question";
      question: string;
      /** Khoảng trống mà câu hỏi này nhắm lấp. Dùng để đánh giá chất lượng hỏi. */
      targetGap: string;
    }
  /** 2. Trả từ một đến ba khuyến nghị. */
  | {
      kind: "recommend";
      recommendations: OneToThree<Recommendation>;
      /** Điều còn chưa chắc, nói kèm thay vì giấu. */
      caveats: readonly string[];
    }
  /** 3. Từ chối vì không đủ căn cứ. */
  | {
      kind: "decline";
      reason: DeclineReason;
      /** Nói cho khách biết cần gì để đi tiếp — từ chối không phải ngõ cụt. */
      whatWouldHelp: string;
    };

/** Nhãn tiếng Việt của ba loại kết quả, dùng cho nhật ký và màn hình dấu vết. */
export const TURN_RESULT_LABELS: Record<TurnResult["kind"], string> = {
  ask_one_question: "Hỏi thêm một câu",
  recommend: "Khuyến nghị sản phẩm",
  decline: "Từ chối vì thiếu căn cứ",
};

/**
 * Dựng kết quả khuyến nghị từ một mảng độ dài bất kỳ.
 * Trả null nếu rỗng hoặc quá ba — nơi gọi buộc phải xử lý thay vì cắt bớt ngầm.
 */
export function toOneToThree<T>(items: readonly T[]): OneToThree<T> | null {
  switch (items.length) {
    case 1:
      return [items[0]] as const;
    case 2:
      return [items[0], items[1]] as const;
    case 3:
      return [items[0], items[1], items[2]] as const;
    default:
      return null;
  }
}
