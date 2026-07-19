import type { LanguageModel } from "ai";
import type { Needs, RecommendedProduct } from "@/lib/types";
import { getCatalog } from "@/lib/data/catalog";
import { CATEGORIES, getCategory, type CategoryConfig } from "@/lib/data/category-config";
import { plainFacts, sellingFacts } from "@/lib/data/phrasebook";
import { extractNeeds } from "./needs-agent";
import { findProducts } from "./product-agent";
import { formatVnd } from "@/lib/format";

/**
 * MAIN AGENT: ĐIỀU PHỐI (đa ngành).
 *
 * Luồng: xác định ngành → thiếu tiêu chí hoàn cảnh/ngân sách thì hỏi ngược →
 * đủ thì gọi product-agent lấy top 3 và dựng câu trả lời kèm trade-off.
 * Dữ liệu & cấu trúc luôn tất định; LLM chỉ diễn đạt. `fallbackText` dùng khi không có LLM.
 */

export interface CategoryChoice {
  slug: string;
  label: string;
  emoji: string;
}

export type Plan =
  | { mode: "pick_category"; text: string; categories: CategoryChoice[] }
  | { mode: "clarify"; text: string; needs: Needs }
  | {
      mode: "recommend";
      needs: Needs;
      products: RecommendedProduct[];
      systemPrompt: string;
      fallbackText: string;
    }
  | { mode: "no_results"; text: string; needs: Needs }
  | { mode: "empty_catalog"; text: string };

const MISSING_PRICE_LINE =
  "Sản phẩm này bên em chưa cập nhật giá trên hệ thống ạ, anh/chị ghé cửa hàng gần nhất " +
  "hoặc để em gợi ý thêm lựa chọn khác đã có giá nhé.";

function summarizeNeeds(needs: Needs, cfg: CategoryConfig): string {
  const bits: string[] = [];
  if (needs.fitValue != null && cfg.fit)
    bits.push(`${cfg.fit.unit === "m²" ? "phòng ~" : ""}${needs.fitValue}${cfg.fit.unit === "m²" ? "m²" : ` ${cfg.fit.unit}`}`);
  if (needs.budgetVnd != null) bits.push(`ngân sách dưới ${formatVnd(needs.budgetVnd)}`);
  const prLabels: Record<string, string> = {
    quiet: "ít ồn",
    energy: "tiết kiệm điện",
    cheap: "giá tốt",
  };
  const prs = (needs.priorities ?? []).map(
    (p) => prLabels[p] ?? (p.startsWith("brand:") ? `hãng ${p.slice(6)}` : p)
  );
  if (prs.length) bits.push(`ưu tiên ${prs.join(", ")}`);
  return bits.join(", ");
}

/**
 * Một sản phẩm dưới dạng ngữ liệu cho LLM — thông số ĐÃ được chuyển ngữ sẵn.
 *
 * Trước đây chỗ này đưa số thô ("Độ ồn: Dàn lạnh: 36/26/21 dB") kèm lệnh "nói tự nhiên",
 * tức là giao luôn việc dịch số sang trải nghiệm cho LLM tự nghĩ — dễ nói quá và mỗi lượt
 * một kiểu. Giờ câu diễn giải lấy từ phrasebook đã duyệt, LLM chỉ còn việc nối câu cho mượt.
 */
function productLine(p: RecommendedProduct, i: number, cfg: CategoryConfig): string {
  const price = p.hasPrice ? formatVnd(p.priceDisplay) : "GIÁ ĐANG CẬP NHẬT";
  const head = `[${i + 1}] ${p.name} | hãng ${p.brand} | ${price} | phù hợp ${p.fitText ?? "—"}`;
  const facts = plainFacts(p.highlights, cfg).map((f) => {
    if (!f.plain) return `    - ${f.label}: ${f.short}`;
    const caveat = f.weak ? " [KHÔNG phải điểm mạnh — chỉ nói nếu khách hỏi thẳng]" : "";
    return `    - ${f.label}: "${f.plain}" (số gốc: ${f.short})${caveat}`;
  });
  return [head, ...facts].join("\n");
}

/** Câu so sánh trade-off tất định giữa các lựa chọn (yêu cầu D1#4 của đề bài). */
function buildTradeoff(products: RecommendedProduct[]): string | null {
  const priced = products.filter((p) => p.hasPrice && p.priceDisplay != null);
  if (priced.length < 2) return null;
  const lo = priced[0];
  const hi = priced[priced.length - 1];
  if (hi.priceDisplay! <= lo.priceDisplay!) return null;
  const gap = formatVnd(hi.priceDisplay! - lo.priceDisplay!);
  const hiEdge = hi.highlights[0];
  const edge = hiEdge ? ` đổi lại ${hiEdge.label.toLowerCase()} ${hiEdge.text}` : "";
  return `Cân nhắc: ${lo.name} tiết kiệm hơn ${gap};${edge ? ` ${hi.brand} ${hi.name} nhỉnh hơn về giá nhưng${edge}.` : ` ${hi.name} cao hơn về giá.`}`;
}

function buildSystemPrompt(
  needs: Needs,
  products: RecommendedProduct[],
  cfg: CategoryConfig
): string {
  const list = products.map((p, i) => productLine(p, i, cfg)).join("\n");
  return `Bạn là nhân viên tư vấn của Điện Máy Xanh, thân thiện và trung thực.
Ngành hàng đang tư vấn: ${cfg.label}.

Nhu cầu khách: ${summarizeNeeds(needs, cfg) || "(chưa rõ nhiều)"}.

Danh sách sản phẩm ĐÃ chọn sẵn (chỉ được dùng đúng thông tin dưới đây, KHÔNG bịa thêm):
${list}

QUY TẮC BẮT BUỘC:
- Chỉ khẳng định điều CÓ trong danh sách trên. Tuyệt đối không bịa thông số, giá, khuyến mãi hay tồn kho.
- Sản phẩm ghi "GIÁ ĐANG CẬP NHẬT": nói đúng ý này — "${MISSING_PRICE_LINE}"
- Phần trong ngoặc kép "..." là cách diễn đạt ĐÃ DUYỆT cho thông số đó. Dùng lại đúng ý ấy,
  được rút gọn cho mượt nhưng KHÔNG đổi nghĩa và KHÔNG tự nghĩ ví von/so sánh mới
  (cấm kiểu "êm nhất phân khúc", "êm như thư viện" — đó là nói quá, tính là bịa).
- NÓI LỢI ÍCH, KHÔNG NÓI THÔNG SỐ. Diễn ý đã duyệt thành cái khách CẢM ĐƯỢC trong
  sinh hoạt: "đêm ngủ không bị tiếng máy làm tỉnh giấc", "bật cả ngày cũng đỡ lo hoá
  đơn điện", "đồ ăn cả tuần vẫn còn chỗ". KHÔNG kèm số trong ngoặc, KHÔNG dùng thuật
  ngữ (dB, chỉ số, BTU, inverter, sao năng lượng…) — thẻ sản phẩm đã hiện số rồi.
  Chỉ nêu số khi khách HỎI THẲNG con số đó, hoặc khi nói về GIÁ.
- Thông số KHÔNG có cách diễn đạt trong ngoặc kép: BỎ QUA, đừng nêu số trần.
- Xưng "em", gọi khách "anh/chị". Giọng như nhân viên bán hàng quen, ngắn gọn (3–5 câu),
  không sáo rỗng, không liệt kê gạch đầu dòng.
- Nêu VÌ SAO hợp bằng chính HOÀN CẢNH khách kể (phòng ngủ hay phòng khách, nhà mấy
  người, hay bật ban đêm, có trẻ nhỏ/người già…) rồi mới tới **trade-off** giữa các
  lựa chọn theo lợi ích thực tế — tuyệt đối không đọc lại bảng thông số.
- Thẻ sản phẩm đã hiển thị riêng cho khách rồi — đừng liệt kê lại toàn bộ thông số.
- Kết bằng một câu mời khách cho biết thêm nhu cầu nếu cần.`;
}

function buildFallbackText(
  needs: Needs,
  products: RecommendedProduct[],
  cfg: CategoryConfig
): string {
  const summary = summarizeNeeds(needs, cfg);
  const head = summary
    ? `Dạ, dựa trên nhu cầu của anh/chị (${summary}), em gợi ý ${products.length} mẫu ${cfg.label.toLowerCase()} phù hợp nhất ạ:`
    : `Dạ, em gợi ý ${products.length} mẫu ${cfg.label.toLowerCase()} phù hợp ạ:`;
  const bullets = products
    .map((p) => {
      const price = p.hasPrice ? formatVnd(p.priceDisplay) : "giá đang cập nhật";
      const fit = p.fitText ? ` · ${p.fitText}` : "";
      // Ngay cả khi không có LLM, khách vẫn đọc được lời người thay vì bảng thông số.
      const said = sellingFacts(p.highlights, cfg)
        .map((f) => `${f.plain} (${f.short})`)
        .join("; ");
      return `• ${p.name} — ${price}${fit}${said ? `\n  ${said}.` : ""}`;
    })
    .join("\n");
  const tradeoff = buildTradeoff(products);
  return [
    head,
    bullets,
    tradeoff,
    "Anh/chị xem thử nhé ạ, cần em lọc thêm theo hãng hay tầm giá thì cứ nói với em.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function orchestrate(
  userText: string,
  deps: { model: LanguageModel | null; hintCategory?: string }
): Promise<Plan> {
  const needs = await extractNeeds(userText, {
    model: deps.model,
    hintCategory: deps.hintCategory,
  });

  // Chưa rõ ngành → mời khách chọn (UI hiện chip ngành hàng).
  if (!needs.category) {
    return {
      mode: "pick_category",
      text:
        "Dạ em chào anh/chị 👋 Em là trợ lý tư vấn của Điện Máy Xanh. " +
        "Anh/chị đang quan tâm nhóm sản phẩm nào ạ?",
      categories: CATEGORIES.map((c) => ({
        slug: c.slug,
        label: c.label,
        emoji: c.emoji,
      })),
    };
  }

  const cfg = getCategory(needs.category)!;
  const catalog = await getCatalog(needs.category);

  if (catalog.length === 0) {
    return {
      mode: "empty_catalog",
      text: `Dạ hệ thống chưa nạp được dữ liệu ${cfg.label.toLowerCase()} nên em chưa tư vấn ngay được ạ. Anh/chị thử lại sau giúp em nhé.`,
    };
  }

  // Hỏi ngược tiêu chí hoàn cảnh của ngành (nếu ngành có) rồi tới ngân sách.
  if (cfg.fit && needs.fitValue == null) {
    return {
      mode: "clarify",
      needs,
      text: `Dạ em tư vấn ${cfg.label.toLowerCase()} cho mình ngay ạ. ${cfg.fit.question}`,
    };
  }
  if (needs.budgetVnd == null) {
    const ctx =
      cfg.fit && needs.fitValue != null
        ? ` (${needs.fitValue}${cfg.fit.unit === "m²" ? "m²" : ` ${cfg.fit.unit}`})`
        : "";
    return {
      mode: "clarify",
      needs,
      text: `Dạ em nắm rồi ạ${ctx}. Anh/chị dự tính ngân sách khoảng bao nhiêu để em lọc đúng tầm giá ạ?`,
    };
  }

  const products = findProducts(needs, catalog, cfg);

  if (products.length === 0) {
    return {
      mode: "no_results",
      needs,
      text:
        `Dạ với tiêu chí hiện tại (${summarizeNeeds(needs, cfg)}), em chưa tìm được ` +
        `${cfg.label.toLowerCase()} khớp trong dữ liệu hiện có ạ. Anh/chị nới nhẹ một tiêu chí giúp em nhé — ` +
        `ví dụ tăng ngân sách hoặc điều chỉnh lại hoàn cảnh sử dụng — để em gợi ý thêm.`,
    };
  }

  return {
    mode: "recommend",
    needs,
    products,
    systemPrompt: buildSystemPrompt(needs, products, cfg),
    fallbackText: buildFallbackText(needs, products, cfg),
  };
}
