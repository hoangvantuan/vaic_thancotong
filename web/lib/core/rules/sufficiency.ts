// Luật đủ-thông-tin & chọn câu hỏi kế tiếp — `sufficiency@v1`.
//
// Hiện thực mục 1–2 của bảng quy tắc (docs/quy-tac-quyet-dinh.md). Vai trò:
//   1. KIỂM CHỨNG nhu cầu: kết quả mô hình là ứng viên; số liệu chỉ được dùng khi
//      trích lại được bằng luật tất định từ nguyên văn lời khách. Giá trị mô hình
//      đưa mà nguyên văn không có là PHỎNG ĐOÁN — loại, tính là khoảng trống.
//   2. Đủ slot bắt buộc (ngành + tiêu chí hoàn cảnh) thì cho đi tiếp; thiếu thì
//      chọn ĐÚNG MỘT câu hỏi theo thứ tự ưu tiên cố định.
//
// Tầng trích tất định dùng lại lib/search (regex + lexicon, không LLM) — cùng câu
// nói luôn ra cùng nhu cầu, đúng bất biến tái lập của phiếu #26.

import { CATEGORIES, getCategory } from "@/lib/data/category-config";
import { extract } from "@/lib/search/extract";
import { fitValueOf } from "@/lib/search/clarify";
import type { SufficiencyPolicy } from "../pipeline/run-turn";

// Hợp đồng SufficiencyPolicy/SufficiencyAssessment do KHUNG (#24 pipeline) sở hữu —
// luật ở đây chỉ là một bản hiện thực cắm vào, cùng chiều với HardRule/SoftCriterion.
export type { SufficiencyAssessment, SufficiencyPolicy } from "../pipeline/run-turn";

// Câu hỏi ngành PHẢI liệt kê ngành thật từ registry — hỏi trống ("nhóm sản phẩm nào?")
// thì khách không biết doanh nghiệp bán gì, còn tầng diễn đạt LLM sẽ tự bịa ngành
// không tồn tại ("điện lạnh", "viễn thông"…) và hội thoại kẹt vòng lặp hỏi ngành.
const CATEGORY_LABELS = CATEGORIES.map((c) => c.label).join(", ");
const CATEGORY_QUESTION = `Dạ bên em hiện tư vấn các nhóm: ${CATEGORY_LABELS}. Anh/chị đang quan tâm nhóm nào ạ?`;
// targetGap mang theo danh sách ngành cho phép — tầng diễn đạt chỉ được chọn trong này.
const CATEGORY_GAP = `ngành hàng đang tư vấn — bên em CHỈ có các nhóm: ${CATEGORY_LABELS}`;

/** Ưu tiên trích tất định từ lời khách; ứng viên mô hình chỉ để đối chiếu. */
export const demoSufficiency: SufficiencyPolicy = {
  id: "sufficiency@v1",

  assess(candidate, input) {
    // Nguồn sự thật duy nhất cho số liệu: trích tất định từ NGUYÊN VĂN lời khách.
    const det = extract(input.userText, { hintCategory: input.category });

    // Ngành: khách chọn trên giao diện → trích tất định. Mô hình không tự đặt ngành.
    const category = input.category ?? det.category;
    if (!category) {
      return { kind: "ask", question: CATEGORY_QUESTION, targetGap: CATEGORY_GAP };
    }

    const cfg = getCategory(category);
    const fitValue = fitValueOf(det); // theo đơn vị của ngành (m²/người/inch)
    if (cfg?.fit && fitValue == null) {
      return {
        kind: "ask",
        question: cfg.fit.question,
        targetGap: `tiêu chí hoàn cảnh: ${cfg.fit.unit === "m²" ? "diện tích phòng (m²)" : cfg.fit.slot}`,
      };
    }

    const priorities: string[] = [...det.concepts];
    if (det.wantsEnergySaving) priorities.push("energy");
    if (det.wantsCheap) priorities.push("cheap");
    for (const b of det.brands) priorities.push(`brand:${b}`);

    const quotedSpans: string[] = [];
    if (fitValue != null && cfg?.fit) quotedSpans.push(`${fitValue}${cfg.fit.unit}`);
    if (det.budgetMax != null) quotedSpans.push(`ngân sách ${det.budgetMax.toLocaleString("vi-VN")}₫`);

    // Caveat CHỈ được sinh từ dữ kiện tất định. Ứng viên mô hình (candidate) không
    // được chạm vào bản ghi — kể cả dạng ghi chú — vì đầu ra mô hình đổi giữa hai
    // lần chạy sẽ đổi byte của bản ghi, phá bất biến tái lập (#26).
    const caveats: string[] = [];
    if (det.budgetMax == null) {
      caveats.push("Anh/chị chưa nêu ngân sách nên em chưa lọc theo giá.");
    }

    return {
      kind: "proceed",
      needs: {
        category,
        fitValue,
        budgetVnd: det.budgetMax,
        priorities,
        quotedSpans,
      },
      caveats,
    };
  },
};
