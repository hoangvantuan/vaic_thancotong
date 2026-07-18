// BỘ KẾT NỐI GIẢ — dịch vụ mô hình.
//
// Trả kết quả CỐ ĐỊNH và TẤT ĐỊNH: cùng đầu vào luôn ra cùng đầu ra. Nhờ vậy kiểm
// thử không phụ thuộc việc có chạy Ollama hay không, và không tốn lượt gọi mô hình.
//
// Bản này cũng là tài liệu sống về ranh giới vai trò: mô hình chỉ TRÍCH XUẤT và
// DIỄN ĐẠT, không quyết định sản phẩm nào hợp lệ.

import { ok, type Result } from "../contracts/status";
import type { ExtractedNeeds, IntentRead, ModelService } from "../ports/model-service";
import type { SourcedProduct } from "../ports/product-source";

/** Trích số đầu tiên khớp một mẫu, hoặc null. Cố tình thô — đây là bản giả. */
function firstNumber(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  return match ? Number(match[1].replace(/[.,]/g, "")) : null;
}

export class MockModelService implements ModelService {
  readonly name = "mock";

  /** Đổi thành false để kiểm thử luồng "không có mô hình". */
  constructor(private readonly ready = true) {}

  async isReady(): Promise<boolean> {
    return this.ready;
  }

  async extractNeeds(userText: string): Promise<Result<ExtractedNeeds>> {
    const area = firstNumber(userText, /(\d+)\s*m2|(\d+)\s*m²/i);
    const budgetTrieu = firstNumber(userText, /(\d+)\s*triệu/i);

    const quotedSpans: string[] = [];
    if (area !== null) quotedSpans.push(`${area}m2`);
    if (budgetTrieu !== null) quotedSpans.push(`${budgetTrieu} triệu`);

    return ok({
      category: /máy lạnh|may lanh|điều hoà|dieu hoa/i.test(userText) ? "may_lanh" : null,
      fitValue: area,
      budgetVnd: budgetTrieu === null ? null : budgetTrieu * 1_000_000,
      priorities: /ồn|on|yên tĩnh/i.test(userText) ? ["quiet"] : [],
      quotedSpans,
    });
  }

  /**
   * Bản giả KHÔNG diễn đạt lại — trả chuỗi rỗng để nơi gọi giữ nguyên câu hỏi tất
   * định của bộ luật. Nhờ vậy luồng không-có-mô-hình vẫn dùng câu chữ đã soạn kỹ,
   * và ảnh chụp quyết định mẫu không lẫn văn bản gỡ rối của bản giả.
   */
  async phraseQuestion(): Promise<Result<string>> {
    return ok("");
  }

  /**
   * Bản giả KHÔNG suy ý định — trả `reply` rỗng để nơi gọi BỎ QUA tầng bắt sóng và
   * rơi xuống luật tất định như cũ. Nhờ vậy luồng không-có-mô-hình giữ nguyên hành vi.
   */
  async readIntent(): Promise<Result<IntentRead>> {
    return ok({ intent: "mua", suggestedCategory: null, reply: "" });
  }

  /** Bản giả KHÔNG đọc tài liệu chính sách — trả rỗng để nơi gọi hỏi lại tất định. */
  async answerPolicy(): Promise<Result<string>> {
    return ok("");
  }

  async composeExplanation(
    products: readonly SourcedProduct[],
    needs: ExtractedNeeds
  ): Promise<Result<string>> {
    const names = products.map((p) => p.displayName).join(", ");
    const fit = needs.fitValue === null ? "phòng của mình" : `phòng ${needs.fitValue}m2`;
    return ok(`Với ${fit}, em gợi ý: ${names}.`);
  }
}
