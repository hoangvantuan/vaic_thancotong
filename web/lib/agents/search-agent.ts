import { ToolLoopAgent, stepCountIs, tool, type LanguageModel } from "ai";
import { z } from "zod";
import type { RecommendedProduct } from "@/lib/types";
import { getCatalog } from "@/lib/data/catalog";
import {
  CATEGORIES,
  categoryLabelList,
  fitToText,
  getCategory,
  type CategoryConfig,
} from "@/lib/data/category-config";
import { formatVnd } from "@/lib/format";
import { extract, type Need } from "@/lib/search/extract";
import { isReady, recommendedToAsk, signals } from "@/lib/search/clarify";
import { search, type Results, type Scored } from "@/lib/search/search";

/**
 * AGENT AI TÌM KIẾM: LLM cầm lái vòng lặp tool — thay cho pipeline điều phối cứng.
 *
 * LLM tự quyết định GỌI GÌ TIẾP (phân tích nhu cầu → hỏi thêm hay tìm sản phẩm),
 * nhưng mọi con số và mọi lựa chọn sản phẩm đều do TOOL TẤT ĐỊNH trả về:
 *   - `phan_tich_nhu_cau`: trích Need bằng regex/lexicon (port dmx_search) — không đoán.
 *   - `tim_san_pham`     : lọc cứng + xếp hạng mềm + MMR trên catalog thật.
 *
 * Quy tắc bắt buộc của #26 được giữ bằng THIẾT KẾ chứ không bằng lời dặn:
 * LLM không truyền được số vào tool (input rỗng — Need do server giữ), nên nó
 * không thể tự chọn sản phẩm hay đổi thứ hạng; nó chỉ diễn đạt kết quả tool.
 */

export interface SearchAgentState {
  /** Toàn bộ text khách đã nói (server gộp) — nguồn duy nhất để trích Need. */
  userText: string;
  hintCategory?: string;
  /** Need sau lần phân tích gần nhất — tool `tim_san_pham` đọc từ đây. */
  need: Need | null;
  /** Kết quả search gần nhất + bản đồ ra thẻ UI. */
  results: Results | null;
  products: RecommendedProduct[];
  /** Bên route đăng ký để đẩy thẻ sản phẩm vào stream ngay khi tool chạy. */
  onProducts?: (products: RecommendedProduct[]) => void;
}

/** Scored → thẻ sản phẩm UI. `reason` là các lý do tất định nối lại — LLM không sửa được thẻ. */
function toRecommended(s: Scored, cfg: CategoryConfig): RecommendedProduct {
  const p = s.product;
  const reason = s.reasons
    .filter((r) => r.criterion !== "category")
    .map((r) => r.text)
    .slice(0, 3)
    .join("; ");
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    categoryLabel: p.categoryLabel,
    priceDisplay: p.price.display,
    priceOriginal: p.price.original,
    hasPrice: p.price.hasPrice,
    discountPercent: p.price.discountPercent,
    priceUpdating: !p.price.hasPrice,
    rating: p.rating,
    quantitySold: p.quantitySold,
    fitText: cfg.fit ? fitToText(p.fit, cfg.fit.unit) : null,
    highlights: p.highlights,
    imageUrl: p.imageUrl,
    url: p.url,
    promotion: p.promotion,
    reason: reason ? reason.charAt(0).toUpperCase() + reason.slice(1) + "." : "Phù hợp nhu cầu của anh/chị.",
  };
}

/** Một sản phẩm dưới dạng ngữ liệu cho LLM — chỉ dữ liệu thật, kèm nhược điểm. */
function productForLlm(s: Scored, i: number) {
  const p = s.product;
  return {
    thu_hang: i + 1,
    ten: p.name,
    hang: p.brand,
    gia: p.price.hasPrice ? formatVnd(p.price.display) : "GIÁ ĐANG CẬP NHẬT",
    ly_do: s.reasons.filter((r) => r.criterion !== "category").map((r) => r.text),
    nhuoc_diem: s.caveats,
  };
}

const CLARIFY_QUESTIONS: Record<string, string> = {
  category: `Anh/chị đang quan tâm nhóm sản phẩm nào (${categoryLabelList()})?`,
  budget_max: "Anh/chị dự tính ngân sách khoảng bao nhiêu để em lọc đúng tầm giá ạ?",
};

function questionFor(slot: string, cfg: CategoryConfig | undefined): string {
  if (cfg?.fit && slot === cfg.fit.slot) return cfg.fit.question;
  return CLARIFY_QUESTIONS[slot] ?? `Anh/chị cho em xin thêm thông tin về ${slot} ạ?`;
}

function needSummary(need: Need) {
  return {
    nganh: need.category,
    ngan_sach_toi_da: need.budgetMax,
    dien_tich_m2: need.areaM2,
    so_nguoi: need.people,
    kich_co_inch: need.inches,
    phong: need.room,
    hang_yeu_cau: need.brands,
    tien_ich_muon_co: need.concepts,
    muon_tiet_kiem_dien: need.wantsEnergySaving,
    muon_gia_re: need.wantsCheap,
  };
}

const INSTRUCTIONS = `Bạn là nhân viên tư vấn của Điện Máy Xanh, thân thiện và trung thực. Xưng "em", gọi khách "anh/chị".

CÁCH LÀM VIỆC (vòng lặp tool):
1. LUÔN gọi "phan_tich_nhu_cau" trước tiên để hệ thống trích nhu cầu từ lời khách.
2. Nhìn kết quả:
   - "san_sang_tim" = false → hỏi khách MỘT câu duy nhất (lấy trong "cau_hoi_goi_y"), không tìm sản phẩm.
   - "san_sang_tim" = true nhưng còn "nen_hoi_them" quan trọng (ngành hoặc tiêu chí hoàn cảnh) → ưu tiên hỏi MỘT câu trước.
   - Đủ thông tin (có ngành + hoàn cảnh hoặc ngân sách) → gọi "tim_san_pham".
3. Diễn đạt kết quả "tim_san_pham" thành câu tư vấn.

QUY TẮC BẮT BUỘC:
- VIẾT VĂN XUÔI THUẦN, TUYỆT ĐỐI KHÔNG dùng markdown: không **in đậm**, không #, không
  gạch đầu dòng, không danh sách đánh số. Khung chat hiển thị nguyên ký tự nên dấu sao
  sẽ lộ ra như lỗi. Cần tách ý thì xuống dòng và viết thành câu.
- Chỉ khẳng định điều CÓ trong dữ liệu tool trả về. Tuyệt đối không bịa thông số, giá, khuyến mãi hay tồn kho.
- Không tự chọn sản phẩm, không đổi thứ tự, không thêm/bớt sản phẩm ngoài danh sách "top" tool trả về.
- Với mỗi sản phẩm: nêu VÌ SAO hợp (bám "ly_do") và nêu trung thực nhược điểm đáng kể (bám "nhuoc_diem") — không khen suông.
- Sản phẩm "GIÁ ĐANG CẬP NHẬT": mời khách ghé cửa hàng gần nhất hoặc để em gợi ý lựa chọn khác đã có giá.
- Nếu "top" rỗng: nói thật là chưa tìm được sản phẩm khớp trong dữ liệu hiện có, mời khách nới một tiêu chí (tăng ngân sách / đổi hoàn cảnh). Nếu có "so_mau_hop_nhu_cau_chua_co_gia" > 0 thì báo thêm ý đó.
- Mỗi lượt chỉ hỏi tối đa MỘT câu. Giọng tự nhiên, ngắn gọn (3–5 câu). So sánh trade-off giữa các lựa chọn bằng lợi ích thực tế.
- Thẻ sản phẩm đã hiển thị riêng cho khách — đừng đọc lại toàn bộ thông số.
- Kết bằng một câu mời khách cho biết thêm nhu cầu nếu cần.`;

/**
 * Tạo agent cho MỘT lượt chat. `state.userText` là toàn bộ lời khách (server gộp),
 * nên Need tất định theo hội thoại — LLM không tiêm được dữ liệu vào tool.
 */
export function createSearchAgent(
  model: LanguageModel,
  state: SearchAgentState,
  /**
   * Bài học đã tích luỹ từ kho `data/learnings.json` — nối vào cuối chỉ dẫn để agent
   * không lặp lại lỗi các lượt trước. Rỗng khi chưa có bài học nào được duyệt.
   */
  lessons = ""
) {
  const phanTichNhuCau = tool({
    description:
      "Trích nhu cầu có cấu trúc (ngành, ngân sách, diện tích/số người, hãng, tiện ích) " +
      "từ toàn bộ lời khách trong hội thoại. Tất định — cùng hội thoại luôn ra cùng kết quả.",
    inputSchema: z.object({}),
    execute: async () => {
      const catalog = state.hintCategory ? await getCatalog(state.hintCategory) : [];
      const knownBrands = [...new Set(catalog.map((p) => p.brand))];
      const need = extract(state.userText, {
        hintCategory: state.hintCategory,
        knownBrands,
      });
      // Chưa có hint hãng (chưa rõ ngành) → thử lại với hãng của ngành vừa dò ra.
      if (!need.brands.length && need.category && !state.hintCategory) {
        const cat = await getCatalog(need.category);
        const brands = [...new Set(cat.map((p) => p.brand))];
        const retry = extract(state.userText, { knownBrands: brands });
        need.brands = retry.brands;
      }
      state.need = need;
      const cfg = need.category ? getCategory(need.category) : undefined;
      const ask = recommendedToAsk(need);
      return {
        nhu_cau: needSummary(need),
        tin_hieu_da_co: signals(need),
        san_sang_tim: isReady(need),
        nen_hoi_them: ask,
        cau_hoi_goi_y: Object.fromEntries(ask.map((s) => [s, questionFor(s, cfg)])),
      };
    },
  });

  const timSanPham = tool({
    description:
      "Tìm và xếp hạng 1-3 sản phẩm phù hợp nhất từ catalog thật, theo nhu cầu đã phân tích. " +
      "Lọc cứng (ngành, hãng, quá yếu so với phòng, vượt ngân sách) rồi xếp hạng mềm có lý do. " +
      "Chỉ gọi sau khi phan_tich_nhu_cau cho san_sang_tim = true.",
    inputSchema: z.object({}),
    execute: async () => {
      const need = state.need;
      if (!need) return { loi: "Chưa phân tích nhu cầu. Gọi phan_tich_nhu_cau trước." };
      if (!need.category) {
        return { loi: "Chưa rõ ngành hàng — hãy hỏi khách đang cần nhóm sản phẩm nào." };
      }
      const cfg = getCategory(need.category);
      if (!cfg) return { loi: `Ngành "${need.category}" chưa được cấu hình.` };
      const catalog = await getCatalog(need.category);
      if (!catalog.length) {
        return { loi: `Hệ thống chưa nạp được dữ liệu ${cfg.label.toLowerCase()}.` };
      }

      const results = search(catalog, need, cfg, 3);
      state.results = results;
      state.products = results.top.map((s) => toRecommended(s, cfg));
      state.onProducts?.(state.products);

      return {
        top: results.top.map(productForLlm),
        so_san_pham_khop_nhu_cau: results.totalMatched,
        so_bi_loai_vi_vuot_ngan_sach: results.filteredOutByBudget,
        so_mau_hop_nhu_cau_chua_co_gia: results.noPrice.length,
        so_mau_chua_ro_hop_hoan_canh: results.unverifiedFit.length,
        nhu_cau_da_dung: needSummary(need),
      };
    },
  });

  return new ToolLoopAgent({
    id: "search-agent",
    model,
    instructions: INSTRUCTIONS + lessons,
    tools: {
      phan_tich_nhu_cau: phanTichNhuCau,
      tim_san_pham: timSanPham,
    },
    stopWhen: stepCountIs(5),
    temperature: 0.4,
  });
}

/** Danh sách chip ngành cho UI khi chưa rõ khách cần gì. */
export function categoryChoices() {
  return CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, emoji: c.emoji }));
}
