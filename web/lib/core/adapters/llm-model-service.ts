// ĐIỂM KẾT NỐI 2/3 — dịch vụ mô hình THẬT (#27).
//
// Nối tầng hiểu-câu (LLM + bộ trích xuất tất định của nhánh search) vào cổng năng lực
// `ModelService`, để đường phục vụ `/api/turn` hiểu được lời khách nói tự nhiên MÀ VẪN
// giữ nguyên grounding: lọc cứng → xếp hạng → cổng công bố → bản ghi quyết định.
//
// RANH GIỚI VAI TRÒ (CONTEXT.md — "Cổng năng lực mô hình"): mô hình CHỈ trích xuất và
// diễn đạt. Nó KHÔNG chọn sản phẩm, KHÔNG quyết định hợp lệ, KHÔNG biến dữ liệu chưa
// xác minh thành sự thật. Việc chọn do bộ luật #26 trên dữ liệu #25 quyết định.
//
// HAI TẦNG, đóng an toàn:
//   1. Tất định (`lib/search/extract`) — luôn chạy, hiểu "20 củ", "9tr5", "20 mét vuông"…
//   2. LLM — chỉ LẤP CHỖ TRỐNG tầng 1 còn thiếu. Lỗi/không có LLM → dùng tầng 1.
// Nhờ vậy "không có LLM → app vẫn chạy", đúng yêu cầu đề bài.

import { generateText } from "ai";
import { z } from "zod";
import { getModel, probeLLM } from "@/lib/llm";
import { extract, type Need } from "@/lib/search/extract";
import { ok, type Result } from "../contracts/status";
import type { ExtractedNeeds, IntentRead, ModelService } from "../ports/model-service";
import type { SourcedProduct } from "../ports/product-source";
import { lessonsHint } from "../learning/learning-store";

const EXTRACT_SYSTEM = [
  "Bạn là bộ TRÍCH XUẤT nhu cầu mua hàng tiếng Việt.",
  "CHỈ trích xuất điều khách đã nói. TUYỆT ĐỐI không suy đoán, không gợi ý sản phẩm,",
  "không chọn hộ. Không biết thì trả null.",
  "Đơn vị tiền nói kiểu Việt: 'triệu', 'tr', 'củ', 'chai' = 1.000.000; '9tr5' = 9.500.000.",
  "budgetVndMax là TRẦN ngân sách (số VND đầy đủ).",
  "areaM2 là diện tích phòng theo m².",
  "priorities chỉ chọn trong: quiet (êm/ít ồn), energy (tiết kiệm điện), cheap (giá rẻ).",
].join(" ");

const CATEGORY_SLUGS: readonly string[] = [
  "may_lanh",
  "tu_lanh",
  "may_giat",
  "tivi",
  "dien_thoai",
  "laptop",
];
const ALLOWED_PRIORITIES = new Set(["quiet", "energy", "cheap"]);

const VALID_INTENTS = new Set([
  "mua",
  "chinh_sach",
  "su_co",
  "chao_hoi",
  "ngoai_pham_vi",
]);

// Tầng "Hiểu ý & Bắt sóng": suy Ý ĐỊNH + đoán NGÀNH để hỏi xác nhận cho mềm mại.
// Ranh giới cứng: chỉ nhắc NGÀNH hàng, TUYỆT ĐỐI không bịa giá/thông số/model — số
// liệu vẫn do tầng tất định kiểm chứng ở bước sau.
const READINTENT_SYSTEM = [
  "Bạn là NHÂN VIÊN TƯ VẤN (telesale) điện máy chuyên nghiệp người Việt: ấm áp, tinh ý, GỌN GÀNG; xưng 'em', gọi khách 'anh/chị'.",
  "Đọc lời khách rồi trả về DUY NHẤT một object JSON, không markdown, không giải thích:",
  '{"intent": một trong ["mua","chinh_sach","su_co","chao_hoi","ngoai_pham_vi"],',
  '"suggestedCategory": slug hoặc null, "reply": "..."}.',
  "Slug hợp lệ: may_lanh, tu_lanh, may_giat, tivi, dien_thoai, laptop.",
  "QUY TẮC:",
  "- Đọc CẢ hội thoại. TUYỆT ĐỐI không lặp lại câu đã hỏi ở lượt trước. Nếu khách nói 'không biết / tùy em / cứ tư vấn giúp', ĐỪNG hỏi lại xác nhận ngành — hãy chốt ngành phù hợp nhất và hỏi sang thông tin kế tiếp (vd diện tích phòng, số người).",
  "- Suy ý ĐỊNH khách muốn mua NGÀNH nào từ hoàn cảnh (nóng→may_lanh; nhà đông người/trữ đồ→tu_lanh; giặt giũ→may_giat), nhưng CHỈ để hỏi xác nhận — KHÔNG khẳng định.",
  '- reply cho intent=mua: ghi nhận NGẮN nhu cầu rồi hỏi xác nhận ngành, nêu 1 gợi ý ngành thay thế nếu hợp (vd "Dạ, trời nóng thế này mình lắp máy lạnh cho phòng, hay em tư vấn thêm quạt điều hòa tiết kiệm hơn ạ?").',
  "- reply cho intent=su_co: ghi nhận sự cố (ABC: acknowledge) + hỏi đang lỗi sản phẩm nào để tra bảo hành (KHÔNG ép mua mới).",
  "- reply cho intent=chinh_sach: nói sẽ kiểm tra chính sách (bảo hành/giao lắp/trả góp) + hỏi rõ sản phẩm/khu vực.",
  "- reply cho intent=chao_hoi: chào ngắn gọn + mời nêu nhu cầu.",
  "- reply cho intent=ngoai_pham_vi: lịch sự ghi nhận rồi khéo léo kéo về (bridge): 'Dạ cái đó ngoài chuyên môn của em, nhưng về đồ điện máy thì em hỗ trợ được ạ — mình đang cần gì ạ?'.",
  "- TUYỆT ĐỐI KHÔNG bịa giá, thông số, khuyến mãi, tồn kho, tên model cụ thể. Chỉ nhắc NGÀNH hàng.",
  "- GIỌNG telesale chuyên nghiệp: reply dưới 28 từ, đời thường, KHÔNG lặp lời chào/mở đầu giữa các lượt, KHÔNG thuật ngữ marketing. Emoji tối đa 1 và chỉ khi thật tự nhiên — phần lớn câu KHÔNG cần emoji.",
].join(" ");

const IntentSchema = z.object({
  intent: z.string().nullish(),
  suggestedCategory: z.string().nullish(),
  reply: z.string().nullish(),
});

// Câu trả lời chính sách phải bám tài liệu — chỉ nói điều CÓ trong trích đoạn.
const ANSWERPOLICY_SYSTEM = [
  "Bạn là tư vấn viên Điện Máy Xanh, thân thiện; xưng 'em', gọi khách 'anh/chị'.",
  "Trả lời câu hỏi CHÍNH SÁCH của khách CHỈ dựa trên trích đoạn tài liệu được cung cấp.",
  "TUYỆT ĐỐI không thêm thông tin ngoài trích đoạn; không suy diễn con số, thời hạn, phí.",
  "Nếu trích đoạn không chứa câu trả lời, nói thẳng: 'Phần này em chưa thấy trong tài liệu, để em kiểm tra thêm giúp anh/chị nhé' — đừng bịa.",
  "Trả lời ngắn gọn 2-4 câu, đời thường dễ hiểu, nêu đúng con số/điều kiện có trong trích đoạn.",
].join(" ");

// Định tuyến câu hỏi chính sách → đúng tài liệu (tất định, không nhờ LLM đoán file).
const POLICY_ROUTES: readonly { slug: string; cues: readonly string[] }[] = [
  {
    slug: "chinh_sach_bao_hanh_doi_tra",
    cues: ["bao hanh", "doi tra", "tra hang", "hoan tien", "1 doi 1", "het bao hanh", "hu hong", "bi loi", "sua chua", "doi may"],
  },
  {
    slug: "chinh_sach_giao_hang_lap_dat",
    cues: ["giao hang", "lap dat", "van chuyen", "ship", "phi giao", "phi van chuyen", "cong lap", "bao lau giao", "giao toi", "giao den"],
  },
  {
    slug: "chinh_sach_xu_ly_du_lieu_ca_nhan",
    cues: ["du lieu ca nhan", "thong tin ca nhan", "bao mat", "rieng tu", "privacy"],
  },
  {
    slug: "chinh_sach_khui_hop_apple",
    cues: ["khui hop", "mo hop", "boc hop", "iphone", "ipad", "macbook"],
  },
];

interface PolicyDoc {
  slug: string;
  title: string;
  content: string;
}

let policiesCache: PolicyDoc[] | null = null;
async function loadPolicies(): Promise<PolicyDoc[]> {
  if (policiesCache) return policiesCache;
  const mod = await import("@/data/policies.json");
  policiesCache = (mod.default ?? mod) as PolicyDoc[];
  return policiesCache;
}

/** Bỏ dấu + thường hoá để dò cue chính sách trên cả văn không dấu. */
function foldVi(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/**
 * Lược đồ CỐ TÌNH lỏng: mô hình chạy tại chỗ hay trả thừa/thiếu trường. Ta nhận rộng
 * rồi tự lọc về vốn từ hợp lệ, thay vì vứt cả kết quả chỉ vì một nhãn lạ.
 */
const ExtractSchema = z.object({
  category: z.string().nullish(),
  areaM2: z.number().nullish(),
  budgetVndMax: z.number().nullish(),
  priorities: z.array(z.string()).nullish(),
});

/**
 * Bóc JSON từ câu trả lời tự do (nhiều endpoint OpenAI-compatible KHÔNG hỗ trợ
 * structured output, nên không dùng `generateObject`). Gỡ rào ```json rồi lấy khối
 * { … } đầu–cuối. Không parse được thì trả null để nơi gọi dùng tầng tất định.
 */
function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Need (tầng tất định) → ExtractedNeeds (hợp đồng cổng mô hình). */
function toExtracted(n: Need): ExtractedNeeds {
  const priorities: string[] = [...n.concepts];
  if (n.wantsEnergySaving) priorities.push("energy");
  if (n.wantsCheap) priorities.push("cheap");
  for (const b of n.brands) priorities.push(`brand:${b}`);

  const quotedSpans: string[] = [];
  if (n.areaM2 != null) quotedSpans.push(`${n.areaM2}m²`);
  if (n.budgetMax != null) quotedSpans.push(`${(n.budgetMax / 1_000_000).toLocaleString("vi-VN")} triệu`);
  if (n.people != null) quotedSpans.push(`${n.people} người`);
  if (n.room) quotedSpans.push(n.room);

  return {
    // Tiêu chí số theo ngành: máy lạnh = m², tủ lạnh/máy giặt = người, tivi/laptop = inch.
    category: n.category,
    fitValue: n.areaM2 ?? n.people ?? n.inches,
    budgetVnd: n.budgetMax,
    priorities: [...new Set(priorities)],
    quotedSpans,
  };
}

export class LlmModelService implements ModelService {
  readonly name = "llm@openai-compatible";

  private ready: boolean | null = null;

  async isReady(): Promise<boolean> {
    if (this.ready === null) this.ready = await probeLLM();
    return this.ready;
  }

  /**
   * Trích nhu cầu. Tầng tất định chạy trước và ĐƯỢC ƯU TIÊN (số nó bắt được là số
   * khách thật sự gõ); LLM chỉ điền vào ô còn null và bổ sung ưu tiên.
   */
  async extractNeeds(userText: string): Promise<Result<ExtractedNeeds>> {
    const base = toExtracted(extract(userText));

    if (!(await this.isReady())) return ok(base);

    try {
      const { text } = await generateText({
        model: getModel(),
        system: EXTRACT_SYSTEM,
        prompt:
          `Câu khách: "${userText}"\n\n` +
          "Trả về DUY NHẤT một object JSON, không giải thích, không markdown:\n" +
          '{"category": slug hoặc null, "areaM2": số hoặc null, ' +
          '"budgetVndMax": số hoặc null, "priorities": ["quiet"|"energy"|"cheap"]}',
      });

      const parsed = ExtractSchema.safeParse(parseJsonLoose(text));
      if (!parsed.success) return ok(base);
      const o = parsed.data;

      const category =
        o.category && CATEGORY_SLUGS.includes(o.category) ? o.category : null;
      const llmPriorities = (o.priorities ?? []).filter((p) => ALLOWED_PRIORITIES.has(p));

      // Tầng tất định được ƯU TIÊN: số nó bắt được là số khách thật sự gõ.
      return ok({
        category: base.category ?? category,
        fitValue: base.fitValue ?? o.areaM2 ?? null,
        budgetVnd: base.budgetVnd ?? o.budgetVndMax ?? null,
        priorities: [...new Set([...base.priorities, ...llmPriorities])],
        quotedSpans: base.quotedSpans,
      });
    } catch {
      // Mô hình hỏng/không trả được → giữ kết quả tất định, không chặn lượt.
      return ok(base);
    }
  }

  /**
   * Đọc ý định + đoán ngành để hỏi xác nhận mềm mại. Không có LLM/parse fail/lỗi →
   * trả reply rỗng (nơi gọi sẽ bỏ qua tầng này, rơi xuống luật tất định như cũ).
   */
  async readIntent(conversation: string): Promise<Result<IntentRead>> {
    const empty: IntentRead = { intent: "mua", suggestedCategory: null, reply: "" };
    if (!(await this.isReady())) return ok(empty);
    try {
      const { text } = await generateText({
        model: getModel(),
        system: READINTENT_SYSTEM + (await lessonsHint("intent")),
        prompt: `Hội thoại (mỗi dòng một lượt khách nói):\n${conversation}`,
      });
      const parsed = IntentSchema.safeParse(parseJsonLoose(text));
      if (!parsed.success) return ok(empty);
      const o = parsed.data;

      const intent = (o.intent && VALID_INTENTS.has(o.intent) ? o.intent : "mua") as IntentRead["intent"];
      const suggestedCategory =
        o.suggestedCategory && CATEGORY_SLUGS.includes(o.suggestedCategory)
          ? o.suggestedCategory
          : null;
      return ok({ intent, suggestedCategory, reply: (o.reply ?? "").trim() });
    } catch {
      return ok(empty);
    }
  }

  /**
   * Trả lời câu hỏi chính sách CÓ NGUỒN. Định tuyến tất định tới đúng tài liệu, rồi
   * để LLM diễn đạt CHỈ từ trích đoạn đó + dẫn tên chính sách. Không match tài liệu
   * hoặc không có LLM → chuỗi rỗng (nơi gọi sẽ hỏi lại cho rõ).
   */
  async answerPolicy(conversation: string): Promise<Result<string>> {
    const policies = await loadPolicies();
    const f = foldVi(conversation);
    const route = POLICY_ROUTES.find((r) => r.cues.some((c) => f.includes(c)));
    const doc = route ? policies.find((p) => p.slug === route.slug) : undefined;
    if (!doc) return ok("");
    if (!(await this.isReady())) return ok("");
    try {
      const excerpt = doc.content.slice(0, 7000);
      const { text } = await generateText({
        model: getModel(),
        system: ANSWERPOLICY_SYSTEM + (await lessonsHint("policy")),
        prompt:
          `Câu hỏi của khách:\n${conversation}\n\n` +
          `TRÍCH ĐOẠN CHÍNH SÁCH "${doc.title}" (chỉ dùng nội dung dưới đây):\n${excerpt}`,
      });
      const answer = text.trim();
      return ok(answer ? `${answer}\n\n(Nguồn: chính sách ĐMX — ${doc.title})` : "");
    } catch {
      return ok("");
    }
  }

  /**
   * Diễn đạt MỘT câu hỏi làm rõ. Không có LLM/lỗi → trả RỖNG để pipeline dùng câu
   * tất định của luật (câu ấy đã đúng và đủ — vd đã liệt kê sẵn ngành hàng thật);
   * tự chế câu từ `gap` ở đây sẽ đè mất câu của luật vì nơi gọi chỉ rơi về khi rỗng.
   */
  async phraseQuestion(gap: string, context: string): Promise<Result<string>> {
    const fallback = "";
    if (!(await this.isReady())) return ok(fallback);
    try {
      const { text } = await generateText({
        model: getModel(),
        system: [
          "Bạn là NHÂN VIÊN TƯ VẤN (telesale) điện máy chuyên nghiệp người Việt; xưng 'em', gọi khách 'anh/chị'.",
          "GHI NHẬN ngắn điều khách vừa nói (nếu có) rồi hỏi ĐÚNG MỘT câu lấy thông tin còn thiếu — mỗi lượt tiến đúng MỘT bước.",
          "TUYỆT ĐỐI không hỏi lại thứ khách đã nói, không lặp câu hay lời chào/mở đầu đã dùng ở lượt trước.",
          "Nếu 'thông tin còn thiếu' có kèm DANH SÁCH lựa chọn cho phép: câu hỏi PHẢI nêu đúng và CHỈ các lựa chọn ấy — tuyệt đối không bịa thêm ngành hàng/nhóm hàng ngoài danh sách. Khách hỏi 'bên mình có gì' thì trả lời bằng chính danh sách đó.",
          "Nếu khách trả lời mơ hồ mà KHÔNG có danh sách kèm theo, đưa 2–3 lựa chọn cụ thể để chọn nhanh.",
          "Không nhắc tên sản phẩm/model cụ thể. Câu dưới 25 từ, không chào dài; emoji tối đa 1 và hạn chế.",
          "Chỉ trả về đúng câu hỏi, không thêm gì khác.",
        ].join(" ") + (await lessonsHint("phrase")),
        prompt: `Thông tin còn thiếu: ${gap}\n\nHội thoại đã có (mỗi dòng một lượt khách nói):\n${context}`,
      });
      return ok(text.trim() || fallback);
    } catch {
      return ok(fallback);
    }
  }

  /**
   * Diễn đạt lời giải thích cho các sản phẩm ĐÃ được chọn.
   * Mô hình KHÔNG được thêm, bớt hay đổi thứ tự — cổng công bố vẫn đối chiếu lại.
   */
  async composeExplanation(
    products: readonly SourcedProduct[],
    needs: ExtractedNeeds
  ): Promise<Result<string>> {
    const names = products.map((p) => p.displayName).join(", ");
    const fallback = `Em gợi ý: ${names}.`;
    if (!(await this.isReady())) return ok(fallback);
    try {
      const { text } = await generateText({
        model: getModel(),
        system:
          "Bạn là tư vấn viên điện máy người Việt. Diễn đạt lại NGẮN GỌN danh sách đã cho. " +
          "TUYỆT ĐỐI không thêm, bớt, đổi thứ tự sản phẩm; không bịa thông số hay giá.",
        prompt: `Danh sách đã chốt: ${names}\nNhu cầu khách: ${JSON.stringify(needs)}`,
      });
      return ok(text.trim() || fallback);
    } catch {
      return ok(fallback);
    }
  }
}
