"use client";

// Màn nhập mã truy cập chung (#28). Mã gửi lên máy chủ để mở phiên; không lưu hiển thị.

import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import type { AssistantError } from "@/lib/assistant/types";

export function AccessGate({
  onSubmit,
  error,
}: {
  onSubmit: (code: string) => Promise<void>;
  error: AssistantError | null;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    await onSubmit(code);
    setBusy(false);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-brand/10 text-brand">
        <Lock className="h-6 w-6" aria-hidden />
      </div>
      <div>
        <h3 className="text-[0.98rem] font-bold text-foreground">Nhập mã truy cập</h3>
        <p className="mt-0.5 text-[0.8rem] text-muted">Bản trình diễn dùng một mã truy cập chung.</p>
      </div>
      <form onSubmit={submit} className="w-full max-w-xs space-y-2">
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Mã truy cập"
          aria-label="Mã truy cập"
          autoFocus
          className="h-11 w-full rounded-lg border border-border-strong bg-surface-2 px-3 text-center text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring/25"
        />
        {error && <p className="text-[0.78rem] text-price">{error.message}</p>}
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {busy ? "Đang mở phiên…" : "Vào tư vấn"}
        </button>
      </form>
    </div>
  );
}
