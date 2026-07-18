"use client";

// MÀN "LÝ DO QUYẾT ĐỊNH" (bảng mở rộng inline, #28).
//
// Đọc ảnh chụp quyết định BẤT BIẾN đã lưu (GET /api/decision) và bày ra đúng thứ
// người kiểm tra cần: dữ kiện đầu vào, điều còn nghi ngờ, sản phẩm bị loại kèm lý do,
// thứ hạng và nguồn chứng minh. Không tính lại gì — chỉ trình bày thứ đã lưu.

import { useCallback, useState } from "react";
import { ClipboardList, Loader2, RefreshCw } from "lucide-react";
import type {
  DecisionRecordData,
  EligibilityRow,
  RankedRow,
} from "@/lib/assistant/types";
import { formatObservedAt, verdictLabel } from "@/lib/assistant/present";
import { cn } from "@/lib/utils";
import { GroundedClaim } from "./grounded-claim";

export function ReasonPanel({
  turnId,
  fetchDecision,
}: {
  turnId: string;
  fetchDecision: (turnId: string) => Promise<DecisionRecordData>;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DecisionRecordData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDecision(turnId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được lý do quyết định.");
    } finally {
      setLoading(false);
    }
  }, [turnId, fetchDecision]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) void load();
  };

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border-strong bg-surface-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.78rem] font-semibold text-foreground hover:bg-surface"
      >
        <ClipboardList className="h-4 w-4 text-brand" aria-hidden />
        Lý do quyết định &amp; nguồn dữ liệu
        <span className="ml-auto text-[0.7rem] font-normal text-muted">
          {open ? "thu gọn" : "dành cho người kiểm tra"}
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-3 py-3">
          {loading && (
            <p className="flex items-center gap-2 text-[0.78rem] text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Đang đọc bản ghi quyết định…
            </p>
          )}
          {error && (
            <div className="text-[0.78rem] text-price">
              {error}
              <button onClick={load} className="ml-2 inline-flex items-center gap-1 text-brand hover:underline">
                <RefreshCw className="h-3 w-3" aria-hidden /> thử lại
              </button>
            </div>
          )}
          {data && <DecisionBody data={data} />}
        </div>
      )}
    </div>
  );
}

function DecisionBody({ data }: { data: DecisionRecordData }) {
  const names = new Map<string, string>();
  if (data.result.kind === "recommend") {
    for (const r of data.result.recommendations) names.set(r.productId, r.displayName);
  }
  const nameOf = (id: string) => names.get(id) ?? id;

  const doubts: string[] = [];
  if (data.result.kind === "recommend") doubts.push(...data.result.caveats);
  for (const row of data.eligibility?.rows ?? []) {
    for (const f of row.findings) {
      if (f.verdict === "unverified") doubts.push(`${nameOf(row.productId)}: ${f.explanation}`);
    }
  }
  for (const s of data.ranking?.sensitivity ?? []) {
    if (s.rankingChanges) doubts.push(`Thứ hạng mong manh — ${s.explanation}`);
  }

  const considered = data.eligibility?.rows ?? [];

  return (
    <div className="space-y-3 text-[0.78rem]">
      <Section title="Dữ kiện đầu vào">
        <p className="text-foreground">
          “{data.input.userText}”
          {data.input.category && <span className="text-muted"> · ngành: {data.input.category}</span>}
        </p>
        <p className="text-muted">
          Bản phát hành {data.releaseVersion} · lưu lúc {formatObservedAt(data.createdAt)}
        </p>
        <p className="text-muted">
          Luật áp dụng: <span className="font-mono">{data.appliedRuleVersions.ruleset}</span> · xếp hạng{" "}
          <span className="font-mono">{data.appliedRuleVersions.ranker}</span>
          {data.appliedRuleVersions.sufficiency && (
            <>
              {" "}
              · đủ-thông-tin <span className="font-mono">{data.appliedRuleVersions.sufficiency}</span>
            </>
          )}
        </p>
      </Section>

      <Section title="Điều hệ thống còn nghi ngờ">
        {doubts.length === 0 ? (
          <p className="text-muted">Không có nghi ngờ nào được ghi nhận cho lượt này.</p>
        ) : (
          <ul className="list-disc space-y-0.5 pl-4 text-foreground">
            {doubts.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}
      </Section>

      {considered.length > 0 && (
        <Section title="Sản phẩm đã cân nhắc (bước lọc cứng)">
          <ul className="space-y-2">
            {considered.map((row) => (
              <EligibilityRowView key={row.productId} row={row} name={nameOf(row.productId)} />
            ))}
          </ul>
        </Section>
      )}

      {data.ranking && data.ranking.rows.length > 0 && (
        <Section title="Thứ hạng (bước xếp hạng mềm)">
          <ol className="space-y-2">
            {data.ranking.rows.map((row) => (
              <RankedRowView key={row.productId} row={row} name={nameOf(row.productId)} />
            ))}
          </ol>
        </Section>
      )}

      <Section title="Cổng công bố an toàn">
        <p className={cn("font-medium", data.publicationCheck.passed ? "text-promo" : "text-price")}>
          {data.publicationCheck.passed ? "Đạt" : "Không đạt"} — đã đối chiếu{" "}
          {data.publicationCheck.checkedClaims.length} nhận định trước khi hiển thị.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1 text-[0.72rem] font-bold uppercase tracking-wide text-muted">{title}</h4>
      {children}
    </section>
  );
}

function EligibilityRowView({ row, name }: { row: EligibilityRow; name: string }) {
  const v = verdictLabel(row.verdict);
  const tone =
    v.tone === "ok" ? "bg-promo/12 text-promo" : v.tone === "bad" ? "bg-price/12 text-price" : "bg-accent/20 text-foreground";
  return (
    <li className="rounded-md border border-border bg-surface p-2">
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">{name}</span>
        <span className={cn("ml-auto shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold", tone)}>
          {v.text}
        </span>
      </div>
      <ul className="mt-1 space-y-1">
        {row.findings.map((f, i) => (
          <li key={i}>
            <p className="text-muted">
              <span className="font-mono text-[0.7rem]">{f.ruleId}</span> — {f.explanation}
            </p>
            <div className="mt-0.5 space-y-0.5">
              {f.evidence.map((c, j) => (
                <GroundedClaim key={j} claim={c} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </li>
  );
}

function RankedRowView({ row, name }: { row: RankedRow; name: string }) {
  return (
    <li className="rounded-md border border-border bg-surface p-2">
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-[0.7rem] font-bold text-white">
          {row.rank}
        </span>
        <span className="font-medium text-foreground">{name}</span>
      </div>
      <ul className="mt-1 space-y-0.5">
        {row.contributions.map((c, i) => (
          <li key={i} className="flex items-baseline gap-2 text-[0.75rem]">
            <span className="text-muted">{c.label}</span>
            <span
              className={cn(
                "font-mono font-medium",
                c.contribution > 0 ? "text-promo" : c.contribution < 0 ? "text-price" : "text-muted"
              )}
            >
              {c.contribution > 0 ? "+" : ""}
              {c.contribution.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}
