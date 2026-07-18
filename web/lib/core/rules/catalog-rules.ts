// Luật cứng + tiêu chí mềm + phá hoà — hiện thực mục 3–5 của bảng quy tắc
// (docs/quy-tac-quyet-dinh.md). Bộ luật `may-lanh@v1`, bộ xếp hạng `ranker@v1`.
//
// Trường dữ liệu luật đọc (hợp đồng với nguồn sản phẩm của #25):
//   areaMinM2, areaMaxM2 — phạm vi sử dụng (m²);  priceVnd — giá bán;  noiseDb — độ ồn.
// Giá trị absent/conflicting đọc qua `numberOrNull` nên thiếu và mâu thuẫn đều ra
// "không đọc được" — không đoán, không lấy trung bình.

import type { SourcedClaim } from "../contracts/provenance";
import { numberOrNull } from "../contracts/status";
import type { EligibilityFinding } from "../contracts/eligibility";
import type { Recommendation } from "../contracts/turn";
import type { SourcedProduct } from "../ports/product-source";
import type { HardRule } from "../pipeline/screening";
import type { SoftCriterion, TieBreaker } from "../pipeline/ranking";
import type { RelaxPolicy } from "../pipeline/run-turn";
import type { CategorySlug } from "@/lib/types";
import { getCategory } from "@/lib/data/category-config";

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}₫`;

/** Đọc thuộc tính SỐ; trường vắng hẳn khỏi bản ghi cũng là "không đọc được". */
function attrNumber(product: SourcedProduct, field: string): number | null {
  const value = product.attributes[field];
  return value === undefined ? null : numberOrNull(value);
}

/** Nhận định nguyên tử bám vào provenance sẵn có của một trường. */
function claimFrom(product: SourcedProduct, field: string, claim: string): SourcedClaim[] {
  const provenance = product.provenance[field];
  return provenance ? [{ claim, provenance }] : [];
}

// ---------------------------------------------------------------------------
// Mục 3 — Điều kiện loại bắt buộc (không bù trừ)
// ---------------------------------------------------------------------------

/**
 * `pham_vi_dien_tich@v1` — tương thích công suất với phòng. AN TOÀN: thiếu dữ liệu
 * khi khách đã nêu diện tích thì đóng an toàn (unverified → bộ máy #24 coi như loại).
 */
export const phamViDienTich: HardRule = {
  id: "pham_vi_dien_tich@v1",
  safetyCritical: true,

  evaluate(product, needs): EligibilityFinding {
    const id = this.id;
    const area = needs.fitValue;
    if (area == null) {
      return {
        ruleId: id,
        verdict: "eligible",
        explanation: "Khách chưa nêu diện tích nên luật không ràng buộc",
        evidence: [],
      };
    }

    const min = attrNumber(product, "areaMinM2");
    const max = attrNumber(product, "areaMaxM2");
    if (min === null || max === null) {
      return {
        ruleId: id,
        verdict: "unverified",
        explanation: `Khách cần cho phòng ${area}m² nhưng nguồn không có phạm vi sử dụng nhất quán — không có cơ sở khẳng định hợp`,
        evidence: [
          ...claimFrom(product, "areaMinM2", "Phạm vi sử dụng (cận dưới) không đọc được từ nguồn"),
          ...claimFrom(product, "areaMaxM2", "Phạm vi sử dụng (cận trên) không đọc được từ nguồn"),
        ],
      };
    }

    if (max + 5 < area) {
      return {
        ruleId: id,
        verdict: "excluded",
        explanation: `Máy chỉ dùng cho ${min}–${max}m², quá yếu so với phòng ${area}m² khách nêu — mua về không mát, không phải trade-off`,
        evidence: claimFrom(product, "areaMaxM2", `Phạm vi sử dụng tối đa ${max}m² < phòng ${area}m²`),
      };
    }

    return {
      ruleId: id,
      verdict: "eligible",
      explanation: `Phạm vi ${min}–${max}m² dùng được cho phòng ${area}m² khách nêu`,
      evidence: claimFrom(product, "areaMinM2", `Phạm vi sử dụng ${min}–${max}m² phủ phòng ${area}m²`),
    };
  },
};

/**
 * `tran_ngan_sach@v1` — trần ngân sách. KHÔNG phải luật an toàn: thiếu giá là
 * `unverified`, giữ để báo cáo riêng ("chưa có giá") chứ không tự thành điểm loại.
 */
export const tranNganSach: HardRule = {
  id: "tran_ngan_sach@v1",
  safetyCritical: false,

  evaluate(product, needs): EligibilityFinding {
    const id = this.id;
    const budget = needs.budgetVnd;
    if (budget == null) {
      return {
        ruleId: id,
        verdict: "eligible",
        explanation: "Khách chưa nêu ngân sách nên luật không ràng buộc",
        evidence: [],
      };
    }

    const price = attrNumber(product, "priceVnd");
    if (price === null) {
      return {
        ruleId: id,
        verdict: "unverified",
        explanation: "Nguồn chưa công bố giá nhất quán nên chưa so được với ngân sách",
        evidence: claimFrom(product, "priceVnd", "Giá bán không đọc được từ nguồn"),
      };
    }

    if (price > budget) {
      return {
        ruleId: id,
        verdict: "excluded",
        explanation: `Giá ${vnd(price)} vượt ngân sách ${vnd(budget)} khách nêu`,
        evidence: claimFrom(product, "priceVnd", `Giá bán ${vnd(price)} > ngân sách ${vnd(budget)}`),
      };
    }

    return {
      ruleId: id,
      verdict: "eligible",
      explanation: `Giá ${vnd(price)} trong ngân sách ${vnd(budget)} khách nêu`,
      evidence: claimFrom(product, "priceVnd", `Giá bán ${vnd(price)} ≤ ngân sách ${vnd(budget)}`),
    };
  },
};

// ---------------------------------------------------------------------------
// SP+/Ngành+ — MỘT luật phù-hợp-nhu-cầu dùng cho MỌI ngành.
//
// Đơn vị (m²/người/inch), danh từ ("phòng"/"nhà"), biên nới (`slack`) và độ dốc
// chấm điểm (`spread`) đều đọc từ `config/categories.json`. Thêm ngành = thêm khai
// báo, KHÔNG sửa mã. Nguồn sản phẩm phơi thuộc tính chuẩn `fitMin`/`fitMax`.
// ---------------------------------------------------------------------------

/** Cấu hình fit của ngành đang tư vấn (rỗng nếu ngành không ràng buộc tiêu chí này). */
function fitOf(needs: { category?: string | null }) {
  const cfg = needs.category ? getCategory(needs.category as CategorySlug) : undefined;
  return cfg?.fit ?? null;
}

/** `phu_hop_nhu_cau@v1` — thay `pham_vi_dien_tich@v1` ở dạng tổng quát theo ngành. */
export const phuHopNhuCau: HardRule = {
  id: "phu_hop_nhu_cau@v1",
  safetyCritical: true,

  evaluate(product, needs): EligibilityFinding {
    const id = this.id;
    const fit = fitOf(needs);
    const value = needs.fitValue;
    if (!fit || value == null) {
      return {
        ruleId: id,
        verdict: "eligible",
        explanation: "Khách chưa nêu tiêu chí này nên luật không ràng buộc",
        evidence: [],
      };
    }

    const { unit, subject } = fit;
    const slack = fit.slack ?? 0;
    const min = attrNumber(product, "fitMin");
    const max = attrNumber(product, "fitMax");

    if (min === null && max === null) {
      return {
        ruleId: id,
        verdict: "unverified",
        explanation: `Khách cần cho ${subject} ${value} ${unit} nhưng nguồn không có thông số phù hợp nhất quán — không có cơ sở khẳng định hợp`,
        evidence: claimFrom(product, "fitMin", "Thông số phù hợp không đọc được từ nguồn"),
      };
    }

    // Cận trên vắng mặt = "trở lên" (vd tủ lạnh "Trên 5 người"), KHÔNG phải thiếu dữ
    // liệu — coi là thiếu sẽ loại sạch đúng nhóm hợp nhu cầu lớn nhất.
    if (max !== null && max + slack < value) {
      return {
        ruleId: id,
        verdict: "excluded",
        explanation: `Mẫu chỉ đáp ứng tới ${max} ${unit}, quá nhỏ so với ${subject} ${value} ${unit} khách nêu`,
        evidence: claimFrom(product, "fitMax", `Đáp ứng tối đa ${max} ${unit} < ${value} ${unit}`),
      };
    }

    const hi = max === null ? "trở lên" : `${max} ${unit}`;
    return {
      ruleId: id,
      verdict: "eligible",
      explanation: `Mẫu hợp ${min ?? "?"}–${hi} dùng được cho ${subject} ${value} ${unit} khách nêu`,
      evidence: claimFrom(product, "fitMin", `Đáp ứng ${subject} ${value} ${unit} khách nêu`),
    };
  },
};

export const DEMO_HARD_RULES: readonly HardRule[] = [phamViDienTich, tranNganSach];

// ---------------------------------------------------------------------------
// Mục 4 — Tiêu chí xếp hạng mềm (trọng số = thứ tự ưu tiên trong bảng)
// ---------------------------------------------------------------------------

const zero = (criterionId: string, label: string) => ({
  criterionId,
  label,
  contribution: 0,
  evidence: [],
});

/** `vua_dien_tich@v1` ×1.0 — độ vừa vặn với phòng. Thiếu dữ liệu → 0, không phạt. */
const vuaDienTich: SoftCriterion = {
  id: "vua_dien_tich@v1",
  label: "Vừa diện tích phòng",

  score(product, needs) {
    const id = this.id;
    const area = needs.fitValue;
    const min = attrNumber(product, "areaMinM2");
    const max = attrNumber(product, "areaMaxM2");
    if (area == null || min === null || max === null) return zero(id, this.label);

    // Chặn ở -1 (thang [-1, 1] của bảng quy tắc), KHÔNG chặn ở 0: máy quá dư công
    // suất phải ra đóng góp ÂM để builder biến nó thành điểm đánh đổi, không im lặng.
    let raw: number;
    let text: string;
    if (area >= min && area <= max) {
      raw = 1;
      text = `Vừa đúng phòng ${area}m² (hãng khuyên ${min}–${max}m²)`;
    } else if (area < min) {
      raw = Math.max(-1, 1 - (min - area) / 10);
      text = `Hơi dư công suất cho phòng ${area}m² (máy cho ${min}–${max}m²), mát nhanh nhưng tốn hơn mức cần`;
    } else {
      raw = Math.max(-1, 1 - (area - max) / 5);
      text = `Đuối nhẹ so với phòng ${area}m² (máy cho ${min}–${max}m²), phòng lâu mát hơn`;
    }

    return {
      criterionId: id,
      label: this.label,
      contribution: raw * 1.0,
      evidence: claimFrom(product, "areaMinM2", text),
    };
  },
};

/** `du_ngan_sach@v1` ×0.7 — tiền dư so với trần. Không có ngân sách/giá → 0. */
export const duNganSach: SoftCriterion = {
  id: "du_ngan_sach@v1",
  label: "Dư ngân sách",

  score(product, needs) {
    const id = this.id;
    const budget = needs.budgetVnd;
    const price = attrNumber(product, "priceVnd");
    if (budget == null || price === null) return zero(id, this.label);

    const saved = budget - price;
    const raw = Math.min(1, 0.6 + saved / budget);
    return {
      criterionId: id,
      label: this.label,
      contribution: raw * 0.7,
      evidence: claimFrom(
        product,
        "priceVnd",
        `Giá ${vnd(price)}, rẻ hơn mức khách định chi ${vnd(saved)}`
      ),
    };
  },
};

function noiseQuality(db: number): string {
  if (db <= 25) return "rất êm";
  if (db <= 32) return "chạy êm";
  if (db <= 40) return "ồn vừa phải";
  return "khá ồn";
}

/** `do_on_thap@v1` ×0.5 (×0.75 khi khách ưu tiên "quiet") — độ ồn thấp. */
const doOnThap: SoftCriterion = {
  id: "do_on_thap@v1",
  label: "Độ ồn thấp",

  score(product, needs) {
    const id = this.id;
    const db = attrNumber(product, "noiseDb");
    if (db === null) return zero(id, this.label);

    const raw = Math.max(-1, Math.min(1, (45 - db) / 20));
    const weight = needs.priorities.includes("quiet") ? 0.75 : 0.5;
    const quality = noiseQuality(db);
    return {
      criterionId: id,
      label: this.label,
      contribution: raw * weight,
      evidence: claimFrom(product, "noiseDb", `Độ ồn ${db}dB — ${quality}`),
    };
  },
};

/**
 * `vua_nhu_cau@v1` ×1.0 — bản tổng quát của `vua_dien_tich@v1`: mức vừa vặn với
 * tiêu chí ngành, câu chữ theo đơn vị/danh từ của chính ngành đó. Dư nhiều ra đóng
 * góp ÂM để builder biến thành điểm đánh đổi (độ dốc lấy từ `spread` của registry).
 */
export const vuaNhuCau: SoftCriterion = {
  id: "vua_nhu_cau@v1",
  label: "Vừa nhu cầu",

  score(product, needs) {
    const id = this.id;
    const fit = fitOf(needs);
    const value = needs.fitValue;
    const min = attrNumber(product, "fitMin");
    const max = attrNumber(product, "fitMax");
    if (!fit || value == null || (min === null && max === null)) return zero(id, this.label);

    const { unit, subject } = fit;
    const spread = fit.spread ?? 10;
    const lo = min ?? (max as number);
    const hi = max ?? Number.POSITIVE_INFINITY;
    const hiText = max === null ? "trở lên" : `${max} ${unit}`;

    let raw: number;
    let text: string;
    if (value >= lo && value <= hi) {
      raw = 1;
      text = `Vừa đúng ${subject} ${value} ${unit} (mẫu hợp ${lo}–${hiText})`;
    } else if (value < lo) {
      raw = Math.max(-1, 1 - (lo - value) / spread);
      text = `Dư so với ${subject} ${value} ${unit} (mẫu hợp ${lo}–${hiText}) — thừa công suất, tốn hơn mức cần`;
    } else {
      raw = Math.max(-1, 1 - (value - hi) / spread);
      text = `Hơi đuối so với ${subject} ${value} ${unit} (mẫu hợp ${lo}–${hiText})`;
    }

    return {
      criterionId: id,
      label: this.label,
      contribution: raw,
      evidence: claimFrom(product, "fitMin", text),
    };
  },
};

export const DEMO_SOFT_CRITERIA: readonly SoftCriterion[] = [vuaDienTich, duNganSach, doOnThap];

// ---------------------------------------------------------------------------
// Mục 7b — Gợi ý gần nhất khi diện tích khách nêu vượt phạm vi mọi mẫu
// ---------------------------------------------------------------------------

/** Một sản phẩm kèm các số đọc được, dùng cho việc chọn mẫu gần nhất. */
interface ReadableRange {
  p: SourcedProduct;
  min: number;
  max: number;
  price: number | null;
}

/**
 * `goi_y_gan_nhat@v1` — 0 sản phẩm qua lọc CHỈ VÌ diện tích quá lớn thì không từ
 * chối khô: trả tối đa 3 mẫu công suất lớn nhất (gần diện tích khách nêu nhất) kèm
 * caveat nói rõ giới hạn. Kẹt vì ngân sách hay thiếu dữ liệu phạm vi → null, giữ
 * nguyên từ chối với hướng dẫn nới tiêu chí (bảng quy tắc, mục 7b).
 */
export const goiYGanNhat: RelaxPolicy = {
  id: "goi_y_gan_nhat@v1",

  suggest(needs, products) {
    const area = needs.fitValue;
    if (area == null) return null;

    const readable: ReadableRange[] = [];
    for (const p of products) {
      const min = attrNumber(p, "areaMinM2");
      const max = attrNumber(p, "areaMaxM2");
      if (min !== null && max !== null) {
        readable.push({ p, min, max, price: attrNumber(p, "priceVnd") });
      }
    }
    if (readable.length === 0) return null;

    // Chỉ nhận trường hợp kẹt VÌ diện tích: mẫu lớn nhất vẫn quá yếu so với area
    // (cùng biên +5 với luật `pham_vi_dien_tich@v1` — dưới biên đó luật kia đã cho qua).
    const biggest = Math.max(...readable.map((x) => x.max));
    if (biggest + 5 >= area) return null;

    // Ưu tiên mẫu trong ngân sách nếu khách đã nêu; CẢ NHÓM vượt ngân sách thì vẫn
    // gợi ý nhóm lớn nhất — điểm đánh đổi về giá nằm ngay trong lý do có nguồn.
    const budget = needs.budgetVnd;
    const inBudget =
      budget == null ? readable : readable.filter((x) => x.price !== null && x.price <= budget);
    const pool = inBudget.length > 0 ? inBudget : readable;

    // Gần area nhất = areaMaxM2 lớn nhất; hoà thì giá rẻ hơn trước, rồi mã sản phẩm
    // (cùng tinh thần `ma_san_pham@v1`) — thứ tự tất định, chạy lại y hệt.
    const top = [...pool]
      .sort(
        (a, b) =>
          b.max - a.max ||
          (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER) ||
          (a.p.id < b.p.id ? -1 : 1)
      )
      .slice(0, 3);

    const recommendations: Recommendation[] = [];
    for (const { p, min, max, price } of top) {
      const reasons = [
        ...claimFrom(p, "areaMaxM2", `Phạm vi ${min}–${max}m² — thuộc nhóm công suất lớn nhất bên em`),
        ...(price !== null ? claimFrom(p, "priceVnd", `Giá ${vnd(price)}`) : []),
      ];
      if (reasons.length === 0) continue; // không có lý do có nguồn thì không khen suông
      recommendations.push({
        productId: p.id,
        displayName: p.displayName,
        reasons,
        tradeoffs: claimFrom(
          p,
          "areaMaxM2",
          `Chỉ đáp ứng tới ${max}m², thấp hơn nhiều so với ${area}m² anh/chị nêu — không gian này thường cần lắp nhiều máy`
        ),
      });
    }
    if (recommendations.length === 0) return null;

    return {
      recommendations,
      caveat:
        `Với diện tích ${area}m² anh/chị nêu, bên em chưa có mẫu nào đáp ứng trọn (mẫu lớn nhất tới ${biggest}m²). ` +
        `Anh/chị cân nhắc các mẫu công suất lớn nhất dưới đây nhé — không gian lớn thế này thường cần lắp nhiều máy hoặc giải pháp điều hoà công nghiệp ạ.`,
    };
  },
};

// ---------------------------------------------------------------------------
// Mục 5 — Ngang hạng: thứ tự ổn định theo mã sản phẩm, không hàm ý chất lượng
// ---------------------------------------------------------------------------

export const PRODUCT_CODE_TIE_BREAKER: TieBreaker = {
  id: "ma_san_pham@v1",
  compare(a, b) {
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  },
};
