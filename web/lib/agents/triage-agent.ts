import { ToolLoopAgent, stepCountIs, tool, type LanguageModel } from "ai";
import { z } from "zod";
import { triage, type TriageReport } from "@/lib/search/triage";

/**
 * AGENT AI PHÂN LOẠI THÔNG TIN (triage) — agent thứ hai bên cạnh search-agent.
 *
 * Nhiệm vụ: trước khi tư vấn, tách bạch cho cả khách lẫn các agent khác thấy:
 *   1. Điều khách ĐÃ NÓI CHẮC CHẮN (kèm trích dẫn nguyên văn).
 *   2. Điều hệ thống ĐANG DỰ ĐOÁN (cách đọc của LLM — trưng ra, không dùng để lọc).
 *   3. Điều còn THIẾU hoặc MÂU THUẪN (khách nói hai giá trị khác nhau).
 * Nếu chưa đủ để quyết định: đưa ĐÚNG MỘT câu hỏi có khả năng làm thay đổi
 * quyết định nhiều nhất.
 *
 * Phân vai giữ đúng nguyên tắc của search-agent: LLM cầm lái vòng lặp và ĐƯỢC
 * nộp cách đọc của chính nó vào tool — nhưng lõi tất định (lib/search/triage)
 * chỉ có thể xếp phần nộp đó vào ngăn DỰ ĐOÁN; nguyên văn lời khách mới quyết
 * định cái gì là CHẮC CHẮN. LLM không có đường thăng cấp dự đoán thành sự thật,
 * và câu hỏi kế tiếp do lõi chọn theo bảng xếp hạng tác động cố định.
 */

export interface TriageAgentState {
  /** Toàn bộ lời khách trong hội thoại (server gộp) — nguồn sự thật duy nhất. */
  userText: string;
  hintCategory?: string;
  /** Báo cáo phân loại gần nhất — tầng gọi đọc từ đây (UI, agent khác). */
  report: TriageReport | null;
}

const INSTRUCTIONS = `Bạn là bộ phận tiếp nhận của Điện Máy Xanh: nhiệm vụ của bạn KHÔNG phải tư vấn sản phẩm, mà là làm rõ đầu bài trước khi đội tư vấn vào việc. Xưng "em", gọi khách "anh/chị".

CÁCH LÀM VIỆC:
1. Đọc lời khách, hình thành cách hiểu của riêng bạn (ngành gì, hoàn cảnh nào, ngân sách bao nhiêu, kể cả suy đoán như "chắc là phòng ngủ vì...").
2. LUÔN gọi tool "phan_loai_thong_tin" và nộp cách hiểu đó vào "du_doan" — trung thực, kể cả khi bạn không chắc. Hệ thống sẽ đối chiếu với nguyên văn: cái gì khách nói thật sẽ thành CHẮC CHẮN, cái gì chỉ là suy đoán của bạn sẽ nằm ở ngăn DỰ ĐOÁN.
3. Trình bày lại kết quả tool cho khách theo đúng ba mục, ngắn gọn:
   - "Em đã nắm chắc:" — từng ý kèm trích dẫn tool trả về. Không có thì nói chưa có.
   - "Em đang đoán (chưa chắc):" — chỉ nêu khi tool có mục dự đoán; nói rõ đây là đoán, chưa dùng để lọc.
   - "Còn thiếu / chưa khớp:" — các slot thiếu và mâu thuẫn tool chỉ ra.
4. Nếu tool trả "cau_hoi_ke_tiep": kết thúc bằng ĐÚNG câu hỏi đó, nguyên văn. Không tự nghĩ câu khác, không hỏi thêm câu thứ hai. Nếu null: chốt "đầu bài đã đủ để tư vấn" và dừng.

QUY TẮC BẮT BUỘC:
- Chỉ khẳng định điều nằm trong "chac_chan" của tool. Tuyệt đối không nói một dự đoán như thể khách đã xác nhận.
- Không bịa trích dẫn, không đoán giá/thông số sản phẩm — việc đó của đội tư vấn.
- Mâu thuẫn thì KHÔNG tự chọn một phía, kể cả phía có vẻ hợp lý hơn.
- Giọng tự nhiên, tối đa 6-7 câu.`;

/** Tạo agent phân loại cho MỘT lượt. */
export function createTriageAgent(model: LanguageModel, state: TriageAgentState) {
  const phanLoaiThongTin = tool({
    description:
      "Đối chiếu cách đọc của bạn (du_doan) với NGUYÊN VĂN lời khách, trả về bốn ngăn: " +
      "chắc chắn (kèm trích dẫn), dự đoán (phần bạn nộp mà nguyên văn không xác nhận), " +
      "thiếu, mâu thuẫn — cùng đúng một câu hỏi kế tiếp nếu chưa đủ thông tin. " +
      "Tất định: cùng hội thoại + cùng du_doan luôn ra cùng kết quả.",
    inputSchema: z.object({
      du_doan: z
        .object({
          nganh: z.string().nullable().describe("Slug ngành bạn đoán (vd may_lanh); null nếu không đoán"),
          tieu_chi_hoan_canh: z
            .number()
            .nullable()
            .describe("Con số hoàn cảnh bạn đoán (m²/người/inch); null nếu không đoán"),
          ngan_sach_vnd: z.number().nullable().describe("Ngân sách VND bạn đoán; null nếu không đoán"),
          suy_luan: z
            .array(z.string())
            .describe("Các suy đoán thêm, mỗi ý một câu (vd 'chắc là phòng ngủ vì khách nhắc trẻ con')"),
        })
        .describe("Cách đọc trung thực của bạn về hội thoại — kể cả phần không chắc"),
    }),
    execute: async ({ du_doan }) => {
      const report = triage(
        state.userText,
        {
          category: du_doan.nganh,
          fitValue: du_doan.tieu_chi_hoan_canh,
          budgetVnd: du_doan.ngan_sach_vnd,
          assumptions: du_doan.suy_luan,
        },
        { hintCategory: state.hintCategory }
      );
      state.report = report;
      return {
        chac_chan: report.facts.map((f) => ({
          slot: f.slot,
          gia_tri: f.value,
          trich_dan: f.quote,
        })),
        du_doan: report.predictions.map((p) => ({
          slot: p.slot,
          gia_tri: p.value,
          ghi_chu: p.note,
        })),
        thieu: report.missing,
        mau_thuan: report.conflicts.map((c) => ({
          slot: c.slot,
          cac_gia_tri: c.values,
          cac_trich_dan: c.quotes,
        })),
        cau_hoi_ke_tiep: report.nextQuestion,
      };
    },
  });

  return new ToolLoopAgent({
    id: "triage-agent",
    model,
    instructions: INSTRUCTIONS,
    tools: { phan_loai_thong_tin: phanLoaiThongTin },
    stopWhen: stepCountIs(3),
    temperature: 0.2,
  });
}
