// ĐIỀU PHỐI MỘT LƯỢT — điểm vào duy nhất của đường phục vụ.
//
// CONTEXT.md, "Mô-đun điều phối phiên tư vấn": nhận một lượt, giữ thứ tự và phiên
// bản phiên, gọi các mô-đun miền THEO ĐÚNG TRÌNH TỰ rồi ghi ảnh chụp quyết định
// TRƯỚC KHI trả kết quả. Mô-đun này không tự suy luận nhu cầu, không tự lọc, không
// tự xếp hạng — nó chỉ nối các bước.
//
// #24 không sở hữu luật chọn sản phẩm, nên luật được TRUYỀN VÀO. Phiếu #26 nạp bộ
// luật máy lạnh thật mà không sửa tệp này.

import type { SessionSecret, TurnId } from "../contracts/ids";
import type { SavedDecisionRecord } from "../contracts/decision";
import type { RankedRow } from "../contracts/ranking";
import type { Recommendation, TurnInput, TurnResult } from "../contracts/turn";
import { toOneToThree } from "../contracts/turn";
import { coreError, err, ok, type Result } from "../contracts/status";
import type { CoreServices } from "../composition";
import type { ExtractedNeeds } from "../ports/model-service";
import { screenProducts, type HardRule } from "./screening";
import { rankProducts, type SoftCriterion, type TieBreaker } from "./ranking";
import { declineAfterFailedPublication, verifyForPublication } from "./publication";
import type { SourcedProduct } from "../ports/product-source";

/**
 * Đánh giá đủ-thông-tin (#26): hoặc hỏi ĐÚNG MỘT câu, hoặc đi tiếp với nhu cầu
 * ĐÃ KIỂM CHỨNG (số mô hình đưa mà lời khách không có là phỏng đoán — bị loại).
 */
export type SufficiencyAssessment =
  | { kind: "ask"; question: string; targetGap: string }
  | { kind: "proceed"; needs: ExtractedNeeds; caveats: readonly string[] };

export interface SufficiencyPolicy {
  /** Mã có phiên bản, vd "sufficiency@v1" — đối chiếu với bảng quy tắc. */
  id: string;
  assess(
    candidate: ExtractedNeeds,
    input: { userText: string; category?: string }
  ): SufficiencyAssessment;
}

/** Dựng khuyến nghị từ dòng xếp hạng. Trả null = không đủ lý do → bỏ qua sản phẩm. */
export type RecommendationBuilder = (
  product: SourcedProduct,
  row: RankedRow,
  needs: ExtractedNeeds
) => Recommendation | null;

export interface TurnRules {
  hard: readonly HardRule[];
  soft: readonly SoftCriterion[];
  tieBreaker: TieBreaker | null;
  rulesetVersion: string;
  rankerVersion: string;
  /** Luật đủ-thông-tin & chọn câu hỏi (#26). Vắng mặt = không hỏi lại (khung #24). */
  sufficiency?: SufficiencyPolicy | null;
  /** Cách dựng khuyến nghị từ dòng xếp hạng. Vắng mặt = bản tối thiểu của khung. */
  recommend?: RecommendationBuilder | null;
}

/**
 * Dựng khuyến nghị từ một sản phẩm đã xếp hạng, kèm nguồn cho từng lý do.
 *
 * CHỈ lấy thuộc tính đã QUAN SÁT ĐƯỢC. Giá trị vắng mặt hay đang mâu thuẫn không
 * phải lý do để chọn sản phẩm — một ô độ ồn bỏ trống không nói lên điều gì tốt,
 * và một công suất còn mâu thuẫn thì chưa được dùng để thuyết phục khách.
 *
 * Đây là bản dựng lý do TỐI THIỂU cho khung. Phiếu #26 thay bằng lý do nối với
 * nhu cầu thật của khách thay vì liệt kê thông số.
 */
function toRecommendation(product: SourcedProduct) {
  const reasons = Object.entries(product.attributes)
    .filter(([, value]) => value.status === "observed")
    .map(([field]) => field)
    .filter((field) => product.provenance[field] !== undefined)
    .slice(0, 3)
    .map((field) => ({
      claim: `${field}: ${product.provenance[field].rawValue}`,
      provenance: product.provenance[field],
    }));

  return {
    productId: product.id,
    displayName: product.displayName,
    reasons,
    tradeoffs: [],
  };
}

/**
 * Dựng tối đa 3 khuyến nghị theo ĐÚNG thứ tự xếp hạng. Sản phẩm không dựng được
 * lý do có căn cứ thì bỏ qua — không đệm lựa chọn yếu cho đủ ba (#26).
 */
function buildTopRecommendations(
  rows: readonly RankedRow[],
  products: readonly SourcedProduct[],
  rules: TurnRules,
  needs: ExtractedNeeds
): Recommendation[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const top: Recommendation[] = [];
  for (const row of rows) {
    if (top.length === 3) break;
    const product = byId.get(row.productId);
    if (!product) continue;
    const rec = rules.recommend ? rules.recommend(product, row, needs) : toRecommendation(product);
    if (rec) top.push(rec);
  }
  return top;
}

/**
 * Chạy trọn một lượt tư vấn.
 *
 * Thứ tự cố định và không bỏ qua được bước nào:
 *   1. Bất biến — mã lượt đã có thì trả bản ghi cũ, KHÔNG chạy lại.
 *   2. Trích nhu cầu (mô hình chỉ đề xuất, chưa được tin), rồi KIỂM CHỨNG và xét
 *      đủ-thông-tin theo luật #26 — thiếu slot bắt buộc thì hỏi đúng một câu.
 *   3. Đọc sản phẩm trong phạm vi tiếp nhận.
 *   4. LỌC cứng.
 *   5. XẾP HẠNG mềm — chỉ trên tập đã qua lọc.
 *   6. Cổng công bố.
 *   7. LƯU ảnh chụp quyết định.
 *   8. Mới trả kết quả.
 */
export async function runTurn(
  input: TurnInput,
  secret: SessionSecret,
  services: CoreServices,
  rules: TurnRules
): Promise<Result<SavedDecisionRecord>> {
  const { products, model, store, releaseVersion } = services;

  // 1. Bất biến theo mã lượt (#24 mục 8) — kiểm TRƯỚC khi làm bất cứ việc gì tốn kém.
  const existing = await store.getDecision(input.turnId, secret);
  if (!existing.ok) return err(existing.error);
  if (existing.data) return ok(existing.data);

  // 2. Trích nhu cầu. Kết quả mô hình là ỨNG VIÊN, chưa được tin.
  //
  // Tư vấn là HỘI THOẠI: dữ kiện khách đã nêu ở lượt trước vẫn còn hiệu lực. Vì vậy
  // "lời khách" xét ở đây là TOÀN BỘ các lượt khách đã nói trong phiên, không phải
  // mỗi câu cuối — thiếu bước này thì lượt sau quên sạch lượt trước (khách nói
  // "điều hoà" ở lượt 1, lượt 2 lại bị hỏi "đang quan tâm nhóm sản phẩm nào").
  //
  // Dùng cho cả bước kiểm chứng bên dưới: số liệu vẫn phải truy được về nguyên văn
  // lời khách, chỉ khác là nguyên văn ấy trải trên nhiều lượt.
  const priorTurns = await store.listDecisions(input.sessionId, secret);
  const spokenSoFar = priorTurns.ok ? priorTurns.data.map((r) => r.input.userText) : [];
  const conversation = [...spokenSoFar, input.userText].join("\n");

  const extracted = await model.extractNeeds(conversation);
  if (!extracted.ok) return err(extracted.error);
  let needs = extracted.data;
  let caveats: readonly string[] = [];

  // 2b. Kiểm chứng & đủ-thông-tin (#26): số liệu phải trích lại được từ nguyên văn
  // lời khách; thiếu slot bắt buộc thì hỏi ĐÚNG MỘT câu — vẫn lưu ảnh chụp.
  if (rules.sufficiency) {
    const assessment = rules.sufficiency.assess(needs, {
      // Kiểm chứng trên TOÀN BỘ lời khách trong phiên: luật #26 loại mọi dữ kiện
      // không truy được về nguyên văn, nên nếu chỉ đưa câu cuối thì dữ kiện đã nêu
      // ở lượt trước (vd "điều hoà") bị coi là phỏng đoán và bị vứt → hỏi lại vòng vo.
      userText: conversation,
      category: input.category,
    });
    if (assessment.kind === "ask") {
      // LUẬT (#26) quyết định HỎI GÌ — `targetGap` không nhường cho mô hình.
      // Mô hình chỉ DIỄN ĐẠT lại cho tự nhiên và bám ngữ cảnh cả hội thoại (đúng
      // "năng lực 2" của cổng mô hình). Mô hình hỏng/trả rỗng → giữ câu tất định
      // của luật, nên hội thoại không bao giờ kẹt.
      const phrased = await model.phraseQuestion(assessment.targetGap, conversation);
      const question =
        phrased.ok && phrased.data.trim() ? phrased.data.trim() : assessment.question;
      return save({
        kind: "ask_one_question",
        question,
        targetGap: assessment.targetGap,
      });
    }
    needs = assessment.needs;
    caveats = assessment.caveats;
  }

  const category = input.category ?? needs.category;
  if (!category) {
    return save(declineTurn("insufficient_evidence", "Cho em biết mình đang tìm loại sản phẩm nào ạ"));
  }

  // 3. Đọc sản phẩm.
  const listed = await products.list({ category });
  if (!listed.ok) return err(listed.error);
  if (listed.data.length === 0) {
    return save(declineTurn("data_unavailable", "Ngành hàng này chưa có dữ liệu trong bản trình diễn"));
  }

  // 4. LỌC trước. Dấu thời gian lấy từ `receivedAt` để bản ghi tái lập được từng byte.
  const eligibility = screenProducts(
    listed.data,
    needs,
    rules.hard,
    rules.rulesetVersion,
    input.receivedAt
  );

  // 5. XẾP HẠNG sau — tham số đầu là EligibilityReport nên không thể đảo hai bước này.
  const ranking = rankProducts(
    eligibility,
    listed.data,
    needs,
    rules.soft,
    rules.tieBreaker,
    rules.rankerVersion,
    input.receivedAt
  );

  if (ranking.rows.length === 0) {
    return save(
      declineTurn("no_eligible_product", "Chưa có sản phẩm nào thoả hết ràng buộc, mình nới ngân sách hoặc đổi tiêu chí nhé ạ"),
      eligibility,
      ranking
    );
  }

  const top = buildTopRecommendations(ranking.rows, listed.data, rules, needs);
  const recommendations = toOneToThree(top);
  if (!recommendations) {
    return save(
      declineTurn("no_eligible_product", "Chưa dựng được khuyến nghị có căn cứ cho lượt này"),
      eligibility,
      ranking
    );
  }

  const result: TurnResult = { kind: "recommend", recommendations, caveats };
  return save(result, eligibility, ranking);

  /** Dựng một kết quả từ chối có phạm vi. */
  function declineTurn(
    reason: Extract<TurnResult, { kind: "decline" }>["reason"],
    whatWouldHelp: string
  ): TurnResult {
    return { kind: "decline", reason, whatWouldHelp };
  }

  /**
   * 6 → 8: cổng công bố, lưu, rồi mới trả.
   *
   * Không đạt cổng thì soạn lại MỘT lần dưới dạng từ chối có phạm vi — theo
   * CONTEXT.md, cổng chỉ cho sửa một lần rồi phải dùng cách tất định.
   */
  async function save(
    result: TurnResult,
    eligibility: Parameters<typeof buildRecord>[1] = null,
    ranking: Parameters<typeof buildRecord>[2] = null
  ): Promise<Result<SavedDecisionRecord>> {
    let outcome = verifyForPublication(result);

    if (!outcome.verified) {
      outcome = declineAfterFailedPublication(
        "Em chưa xác minh được nguồn cho phần này nên chưa dám khẳng định ạ"
      );
    }
    if (!outcome.verified) {
      return err(
        coreError("model_failure", "Cổng công bố chặn cả bản từ chối", "runTurn")
      );
    }

    const saved = await store.saveDecision(
      buildRecord(outcome.verified, eligibility, ranking, outcome.check),
      secret
    );
    return saved.ok ? ok(saved.data.record) : err(saved.error);
  }

  function buildRecord(
    verified: NonNullable<ReturnType<typeof verifyForPublication>["verified"]>,
    eligibility: ReturnType<typeof screenProducts> | null,
    ranking: ReturnType<typeof rankProducts> | null,
    publicationCheck: ReturnType<typeof verifyForPublication>["check"]
  ) {
    return {
      turnId: input.turnId,
      sessionId: input.sessionId,
      input,
      appliedRuleVersions: {
        ruleset: rules.rulesetVersion,
        ranker: rules.rankerVersion,
        sufficiency: rules.sufficiency?.id ?? null,
      },
      eligibility,
      ranking,
      modelTraces: [],
      publicationCheck,
      result: verified,
      releaseVersion,
      // Lấy từ thời điểm máy chủ NHẬN lượt, không phải giờ máy lúc chạy — cùng đầu
      // vào (kể cả receivedAt) phải tạo bản ghi giống hệt từng byte (#26).
      createdAt: input.receivedAt,
    };
  }
}

/** Bộ luật rỗng — dùng khi nơi gọi chưa có luật thật (#26 sẽ thay). */
export const EMPTY_RULES: TurnRules = {
  hard: [],
  soft: [],
  tieBreaker: null,
  rulesetVersion: "empty@v1",
  rankerVersion: "empty@v1",
};

export type { TurnId };
