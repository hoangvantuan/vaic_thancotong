"use client";

// VỎ TRỢ LÝ — cửa sổ chat docked góc phải, mở/thu được, mobile bung full-screen.
// Phong cách trợ lý ĐMX: avatar, "Trực tuyến", lời chào ấm, disclaimer chân khung.
// Nghe sự kiện `dmx:ask` từ storefront để mở panel và mồi sẵn câu hỏi (funnel).

import { useEffect, useRef, useState } from "react";
import { ClipboardList, RefreshCw, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { useAssistant } from "@/lib/assistant/use-assistant";
import type { ConversationItem } from "@/lib/assistant/types";
import { cn } from "@/lib/utils";
import { AssistantAvatar } from "./assistant-avatar";
import { ResultView } from "./result-view";

const SUGGESTIONS = [
  "Tư vấn máy lạnh giúp mình",
  "Máy lạnh cho phòng 18m², tầm 15 triệu, ưu tiên ít ồn",
  "Máy lạnh tầm 5 triệu",
];

export function Assistant() {
  const a = useAssistant();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Khách KHÔNG thấy bảng lý do quyết định; người kiểm tra bật lên khi cần soi (#28).
  const [reviewMode, setReviewMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = a.status === "sending";

  // Funnel từ storefront: mở panel + mồi câu hỏi.
  useEffect(() => {
    function onAsk(e: Event) {
      const detail = (e as CustomEvent<{ text?: string }>).detail;
      setOpen(true);
      if (detail?.text) setInput(detail.text);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    window.addEventListener("dmx:ask", onAsk);
    return () => window.removeEventListener("dmx:ask", onAsk);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [a.messages, a.status]);

  function submit(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    void a.send(t);
  }

  return (
    <>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 hidden bg-black/40 backdrop-blur-[2px] sm:block"
          aria-hidden
        />
      )}

      {!open && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2.5">
          <div className="nudge-in hidden items-center gap-1.5 rounded-2xl rounded-br-sm border border-border bg-surface px-3 py-2 text-[0.78rem] font-medium text-foreground shadow-lg sm:flex">
            Cần tư vấn? Hỏi em nhé!
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="bot-float group relative flex items-center gap-2.5 rounded-full bg-gradient-to-br from-[#54a0ec] to-[#14539f] py-2 pl-2 pr-5 text-white shadow-2xl ring-1 ring-white/25 transition hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            aria-label="Mở trợ lý tư vấn AI"
          >
            <span className="bot-pulse relative grid h-12 w-12 place-items-center rounded-full bg-white/95 shadow-inner">
              <AssistantAvatar className="h-10 w-10" />
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span className="flex items-center gap-1.5 text-[0.92rem] font-bold">
                Trợ lý tư vấn AI
                <span className="rounded bg-accent px-1 py-[1px] text-[0.58rem] font-black text-brand">BETA</span>
              </span>
              <span className="flex items-center gap-1 text-[0.68rem] text-white/85">
                <span className="h-1.5 w-1.5 rounded-full bg-promo" aria-hidden /> Trực tuyến · tư vấn có căn cứ
              </span>
            </span>
          </button>
        </div>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Trợ lý tư vấn Điện Máy Xanh"
          className="fixed inset-0 z-50 flex flex-col bg-surface sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(640px,calc(100dvh-2.5rem))] sm:w-[400px] sm:rounded-2xl sm:border sm:border-border-strong sm:shadow-2xl"
        >
          {/* Header trợ lý */}
          <header className="brand-bar relative shrink-0 rounded-t-none px-4 py-3 text-white sm:rounded-t-2xl">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/95 shadow-inner">
                <AssistantAvatar className="h-8 w-8" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.95rem] font-bold leading-tight">Trợ lý AI · Điện Máy Xanh</p>
                <p className="flex items-center gap-1.5 text-xs text-white/85">
                  <span className="h-2 w-2 rounded-full bg-promo" aria-hidden /> Trực tuyến
                </p>
              </div>
              {a.phase === "ready" && (
                <button
                  type="button"
                  onClick={() => setReviewMode((v) => !v)}
                  aria-pressed={reviewMode}
                  title={reviewMode ? "Tắt chế độ người kiểm tra" : "Bật chế độ người kiểm tra"}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full transition",
                    reviewMode ? "bg-white/25 text-white" : "text-white/90 hover:bg-white/15"
                  )}
                  aria-label="Chế độ người kiểm tra"
                >
                  <ClipboardList className="h-4 w-4" aria-hidden />
                </button>
              )}
              {a.phase === "ready" && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete((v) => !v)}
                  className="grid h-8 w-8 place-items-center rounded-full text-white/90 hover:bg-white/15"
                  aria-label="Xoá phiên hiện tại"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-white/90 hover:bg-white/15"
                aria-label="Thu gọn trợ lý"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {confirmDelete && (
              <div className="absolute right-3 top-full z-10 mt-1 w-64 rounded-lg border border-border bg-surface p-3 text-foreground shadow-xl">
                <p className="text-[0.82rem] font-medium">Xoá phiên hiện tại?</p>
                <p className="mt-0.5 text-[0.75rem] text-muted">
                  Toàn bộ hội thoại và lý do quyết định của phiên này sẽ không đọc lại được.
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-md border border-border px-3 py-1.5 text-[0.78rem] font-medium hover:bg-surface-2"
                  >
                    Huỷ
                  </button>
                  <button
                    onClick={() => {
                      setConfirmDelete(false);
                      void a.clearSession();
                    }}
                    className="rounded-md bg-price px-3 py-1.5 text-[0.78rem] font-semibold text-white hover:opacity-90"
                  >
                    Xoá phiên
                  </button>
                </div>
              </div>
            )}
          </header>

          {/* Thân */}
          {a.phase === "loading" ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">Đang tải…</div>
          ) : a.phase === "error" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-[0.9rem] font-semibold text-price">Không mở được phiên tư vấn</p>
              {a.error && <p className="text-[0.8rem] text-muted">{a.error.message}</p>}
              <button
                type="button"
                onClick={() => void a.startSession()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
              >
                <RefreshCw className="h-4 w-4" aria-hidden /> Thử lại
              </button>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="scroll-soft flex-1 space-y-3 overflow-y-auto px-3 py-4">
                {a.messages.length === 0 && (
                  <div className="msg-in rounded-xl border border-border bg-surface-2 p-4">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand/10">
                        <AssistantAvatar className="h-9 w-9" />
                      </span>
                      <p className="text-[0.95rem] font-bold text-foreground">Dạ em có thể giúp gì cho mình ạ?</p>
                    </div>
                    <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">
                      Anh/chị mô tả nhu cầu tự nhiên — dùng cho phòng bao rộng, tầm ngân sách nào. Em hỏi thêm nếu
                      còn thiếu, rồi gợi ý kèm lý do và nguồn.
                    </p>
                    <div className="mt-3 flex flex-col gap-1.5">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => submit(s)}
                          className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-left text-[0.8rem] text-foreground transition hover:border-brand hover:text-brand"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {a.messages.map((m) => (
                  <MessageItem
                    key={m.id}
                    item={m}
                    fetchDecision={a.fetchDecision}
                    showReason={reviewMode}
                  />
                ))}

                {busy && (
                  <div className="msg-in flex justify-start">
                    <div className="dots rounded-2xl rounded-bl-md border border-border bg-surface-2 px-4 py-3 text-muted">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}

                {a.error && a.phase === "ready" && (
                  <div
                    role="alert"
                    className={cn(
                      "rounded-lg border px-3 py-2 text-[0.8rem]",
                      a.error.retryable
                        ? "border-accent/40 bg-accent/10 text-foreground"
                        : "border-price/40 bg-price/10 text-price"
                    )}
                  >
                    <p>{a.error.message}</p>
                    {a.canRetry ? (
                      <button
                        onClick={() => void a.retry()}
                        className="mt-1 inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Thử lại
                      </button>
                    ) : (
                      <button onClick={a.dismissError} className="mt-1 font-semibold text-brand hover:underline">
                        Đã hiểu
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Ô nhập */}
              <div className="shrink-0 border-t border-border bg-surface px-3 py-2.5">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit(input);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Nhập nhu cầu của mình…"
                    aria-label="Nội dung tin nhắn"
                    className="h-10 flex-1 rounded-full border border-border-strong bg-surface-2 px-4 text-[0.85rem] text-foreground outline-none focus:border-brand focus:bg-surface focus:ring-2 focus:ring-ring/25"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || busy}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white transition hover:bg-brand-dark disabled:opacity-50"
                    aria-label="Gửi"
                  >
                    <Send className="h-4 w-4" aria-hidden />
                  </button>
                </form>
                <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[0.66rem] leading-tight text-muted">
                  <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
                  Giá &amp; tồn kho có thể đổi, cần xác nhận lại trước khi mua. Thông tin tham khảo, tư vấn bởi AI có
                  nguồn dẫn.
                </p>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

function MessageItem({
  item,
  fetchDecision,
  showReason,
}: {
  item: ConversationItem;
  fetchDecision: Assistant["fetchDecision"];
  showReason: boolean;
}) {
  if (item.sender === "user") {
    return (
      <div className="msg-in flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[0.85rem] leading-relaxed text-white">
          {item.text}
        </div>
      </div>
    );
  }
  return (
    <div className="msg-in max-w-[92%]">
      <ResultView
        result={item.result}
        turnId={item.turnId}
        fetchDecision={fetchDecision}
        showReason={showReason}
      />
    </div>
  );
}

// Kiểu tiện cho prop fetchDecision (khớp giao diện của useAssistant).
type Assistant = ReturnType<typeof useAssistant>;
