"use client";

// Một nhận định nguyên tử KÈM đường truy ngược. Mặc định gọn; bấm "nguồn" mở ra sáu
// trường chứng minh (#24 mục 6). Không có nhận định trần — mọi con số đều mở được nguồn.

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { SourcedClaim } from "@/lib/assistant/types";
import { formatObservedAt, sourceHost, splitClaim } from "@/lib/assistant/present";
import { cn } from "@/lib/utils";

export function GroundedClaim({ claim }: { claim: SourcedClaim }) {
  const [open, setOpen] = useState(false);
  const { label, value } = splitClaim(claim.claim);
  const p = claim.provenance;

  return (
    <div className="text-[0.8rem] leading-relaxed">
      <div className="flex items-start gap-1.5">
        <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand/60" aria-hidden />
        <div className="min-w-0 flex-1">
          <span className="text-foreground">
            {label && <span className="text-muted">{label}: </span>}
            <span className="font-medium">{value}</span>
          </span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="ml-1.5 inline-flex items-center gap-0.5 align-baseline text-[0.7rem] font-medium text-brand hover:underline"
          >
            nguồn
            <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} aria-hidden />
          </button>

          {open && (
            <dl className="mt-1 space-y-0.5 rounded-md border border-border bg-surface-2 p-2 text-[0.7rem] text-muted">
              <Row k="Nguyên văn" v={p.rawValue || "(trống)"} />
              <Row k="Ghi nhận lúc" v={formatObservedAt(p.observedAt)} />
              <Row k="Vị trí bản ghi" v={p.recordLocation} mono />
              <Row k="Quy tắc chuẩn hoá" v={p.transformRule} mono />
              <div className="flex gap-1">
                <dt className="shrink-0">Đường dẫn:</dt>
                <dd className="truncate">
                  <a
                    href={p.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-brand hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden />
                    {sourceHost(p.sourceUrl)}
                  </a>
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-1">
      <dt className="shrink-0">{k}:</dt>
      <dd className={cn("min-w-0 break-words", mono && "font-mono")}>{v}</dd>
    </div>
  );
}
