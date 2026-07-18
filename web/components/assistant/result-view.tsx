"use client";

// Render ĐÚNG BA loại kết quả một lượt (#24 mục 4), mỗi loại một hình thức riêng để
// khách phân biệt ngay:
//   - ask_one_question → một câu hỏi làm rõ
//   - recommend        → 1–3 thẻ sản phẩm có-căn-cứ + bảng lý do
//   - decline          → từ chối CÓ lý do và bước đi tiếp (không phải ngõ cụt)

import { HelpCircle, Info, Sparkles, TimerReset } from "lucide-react";
import type { DecisionRecordData, Recommendation, TurnResult } from "@/lib/assistant/types";
import { declineLabel, formatObservedAt } from "@/lib/assistant/present";
import { GroundedClaim } from "./grounded-claim";
import { ReasonPanel } from "./reason-panel";

export function ResultView({
  result,
  turnId,
  fetchDecision,
  showReason = false,
}: {
  result: TurnResult;
  turnId: string;
  fetchDecision: (turnId: string) => Promise<DecisionRecordData>;
  /** Bảng "Lý do quyết định" mặc định ẨN khỏi khung chat của khách; bật ở chế độ kiểm tra. */
  showReason?: boolean;
}) {
  if (result.kind === "ask_one_question") {
    return (
      <div className="rounded-xl rounded-bl-md border border-brand/30 bg-brand/5 p-3">
        <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-brand">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden /> Em hỏi thêm một câu
        </p>
        <p className="mt-1 text-[0.92rem] font-medium leading-relaxed text-foreground">{result.question}</p>
      </div>
    );
  }

  if (result.kind === "decline") {
    return (
      <div className="rounded-xl rounded-bl-md border border-border-strong bg-surface-2 p-3">
        <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-muted">
          <Info className="h-3.5 w-3.5" aria-hidden /> Em chưa thể gợi ý
        </p>
        <p className="mt-1 text-[0.88rem] font-medium text-foreground">{declineLabel(result.reason)}</p>
        <p className="mt-1.5 text-[0.82rem] leading-relaxed text-muted">
          <span className="font-medium text-foreground">Để đi tiếp: </span>
          {result.whatWouldHelp}
        </p>
      </div>
    );
  }

  // recommend
  const observedAt = firstObservedAt(result.recommendations);
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[0.85rem] text-foreground">
        <Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden />
        Em gợi ý {result.recommendations.length} lựa chọn hợp nhu cầu, kèm lý do và nguồn:
      </p>

      <div className="space-y-2">
        {result.recommendations.map((rec, i) => (
          <ProductRecCard key={rec.productId} rec={rec} index={i} />
        ))}
      </div>

      {result.caveats.length > 0 && (
        <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[0.8rem] text-foreground">
          <p className="font-semibold">Điều cần lưu ý</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
            {result.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {observedAt && (
        <p className="flex items-start gap-1.5 rounded-md bg-accent/12 px-2.5 py-1.5 text-[0.72rem] leading-relaxed text-foreground">
          <TimerReset className="mt-[1px] h-3.5 w-3.5 shrink-0 text-price" aria-hidden />
          Giá và thông số là số <span className="font-medium">đã quan sát</span> lúc {formatObservedAt(observedAt)},
          không phải giá hiện tại — vui lòng kiểm lại giá &amp; tồn kho trước khi mua.
        </p>
      )}

      {showReason && <ReasonPanel turnId={turnId} fetchDecision={fetchDecision} />}
    </div>
  );
}

function ProductRecCard({ rec, index }: { rec: Recommendation; index: number }) {
  const price = firstPrice(rec);

  return (
    <article className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-[0.92rem] font-bold leading-snug text-foreground">{rec.displayName}</h4>
        <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[0.62rem] font-bold text-brand">
          Gợi ý {index + 1}
        </span>
      </div>

      {price && (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[1.15rem] font-black tabular-nums text-price">{price.display}</span>
          <span className="rounded bg-accent/15 px-1.5 py-[1px] text-[0.62rem] font-medium text-foreground">
            giá đã quan sát {formatObservedAt(price.observedAt)}
          </span>
        </div>
      )}

      {rec.reasons.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted">Vì sao hợp · có nguồn</p>
          {rec.reasons.map((c, i) => (
            <GroundedClaim key={i} claim={c} />
          ))}
        </div>
      )}

      {rec.tradeoffs.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted">Điểm đánh đổi</p>
          {rec.tradeoffs.map((c, i) => (
            <GroundedClaim key={i} claim={c} />
          ))}
        </div>
      )}
    </article>
  );
}

/** Bóc token giá đầu tiên (…₫) từ nhận định #26 (câu tự nhiên) để hiện nổi bật. */
function firstPrice(rec: Recommendation): { display: string; observedAt: string } | null {
  for (const c of rec.reasons) {
    const m = c.claim.match(/(\d[\d.]*)\s*₫/);
    if (m) return { display: `${m[1]}₫`, observedAt: c.provenance.observedAt };
  }
  return null;
}

function firstObservedAt(recs: readonly Recommendation[]): string | null {
  for (const r of recs) {
    if (r.reasons[0]) return r.reasons[0].provenance.observedAt;
  }
  return null;
}
