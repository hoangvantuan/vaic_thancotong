"use client";

// VỎ TRỢ LÝ — cửa sổ chat docked góc phải, mở/thu được, mobile bung full-screen.
// Phong cách trợ lý ĐMX: avatar, "Trực tuyến", lời chào ấm, disclaimer chân khung.
// Nghe sự kiện `dmx:ask` từ storefront để mở panel và mồi sẵn câu hỏi (funnel).
//
// Chạy trên tuyến /api/chat (agent AI tìm kiếm, đủ 6 ngành hàng): tin nhắn stream
// theo hợp đồng ChatMessage — text + data-products (thẻ sản phẩm) + data-categories
// (chip chọn ngành). Hội thoại sống trong client, xoá là làm mới ngay.

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { Send, ShieldCheck, Square, Trash2, X } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import type { ChatMessage } from "@/lib/chat-types";
import { cn } from "@/lib/utils";
import { AssistantAvatar } from "./assistant-avatar";

const SUGGESTIONS = [
  "Máy lạnh phòng 18m² dưới 15 triệu, ít ồn",
  "Tủ lạnh cho nhà 4 người, tầm 15 triệu",
  "Tivi 55 inch dưới 12 triệu",
  "Laptop dưới 20 triệu",
];

export function Assistant() {
  const { messages, sendMessage, status, error, stop, setMessages } =
    useChat<ChatMessage>({
      transport: new DefaultChatTransport({ api: "/api/chat" }),
    });
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const busy = status === "submitted" || status === "streaming";

  // Chỉ báo "đang làm việc": stream của agent xen kẽ reasoning → tool → text,
  // các đoạn reasoning/tool không render nên nếu chỉ dựa vào status thì khung
  // chat đứng im hàng giây (đầu lượt LẪN giữa lượt, khi tool tìm sản phẩm chạy).
  // Quy tắc: đang bận mà text không thực sự chảy → hiện chỉ báo chờ.
  const last = messages.at(-1);
  const lastPart = last?.role === "assistant" ? last.parts.at(-1) : undefined;
  const textFlowing =
    lastPart?.type === "text" && lastPart.state === "streaming" && !!lastPart.text.trim();
  const showTyping = busy && !textFlowing;

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
  }, [messages, status]);

  function submit(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    void sendMessage({ text: t });
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
                <span className="h-1.5 w-1.5 rounded-full bg-promo" aria-hidden /> Trực tuyến · đủ 6 ngành hàng
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
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete((v) => !v)}
                  className="grid h-8 w-8 place-items-center rounded-full text-white/90 hover:bg-white/15"
                  aria-label="Xoá hội thoại"
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
                <p className="text-[0.82rem] font-medium">Xoá hội thoại hiện tại?</p>
                <p className="mt-0.5 text-[0.75rem] text-muted">
                  Toàn bộ tin nhắn trong khung chat này sẽ bị xoá.
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
                      stop();
                      setMessages([]);
                    }}
                    className="rounded-md bg-price px-3 py-1.5 text-[0.78rem] font-semibold text-white hover:opacity-90"
                  >
                    Xoá hội thoại
                  </button>
                </div>
              </div>
            )}
          </header>

          {/* Thân */}
          <div ref={scrollRef} className="scroll-soft flex-1 space-y-3 overflow-y-auto px-3 py-4">
            {messages.length === 0 && (
              <div className="msg-in rounded-xl border border-border bg-surface-2 p-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand/10">
                    <AssistantAvatar className="h-9 w-9" />
                  </span>
                  <p className="text-[0.95rem] font-bold text-foreground">Dạ em có thể giúp gì cho mình ạ?</p>
                </div>
                <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">
                  Anh/chị mô tả nhu cầu tự nhiên — dùng cho mấy người, phòng bao rộng, tầm ngân sách nào.
                  Em hỏi thêm nếu còn thiếu, rồi gợi ý kèm lý do.
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

            {messages.map((m) => (
              <MessageItem key={m.id} message={m} onQuickAsk={submit} />
            ))}

            {showTyping && (
              <div className="msg-in flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-border bg-surface-2 px-4 py-3 text-muted">
                  <span className="text-[0.78rem]">Anh/chị chờ em chút!</span>
                  <span className="dots">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-price/40 bg-price/10 px-3 py-2 text-[0.8rem] text-price"
              >
                Không gửi được tin nhắn. Anh/chị kiểm tra kết nối rồi thử lại giúp em nhé.
              </div>
            )}
          </div>

          {/* Ô nhập */}
          <div className="shrink-0 border-t border-border bg-surface px-3 py-2.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(input);
                // Ô đã gửi thì thu lại một dòng, không để chừa khoảng trống cao.
                if (inputRef.current) inputRef.current.style.height = "auto";
              }}
              className="flex items-end gap-2"
            >
              {/* Ô nhập NHIỀU DÒNG tự giãn: câu khách dán vào (vd tên sản phẩm dài)
                  phải đọc được hết, không bị cắt trong một dòng. Enter = gửi,
                  Shift+Enter = xuống dòng. Giãn tối đa ~5 dòng rồi mới cuộn. */}
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
                placeholder="Nhập nhu cầu của mình…"
                aria-label="Nội dung tin nhắn"
                className="max-h-[120px] min-h-10 flex-1 resize-none overflow-y-auto rounded-2xl border border-border-strong bg-surface-2 px-4 py-2.5 text-[0.85rem] leading-snug text-foreground outline-none focus:border-brand focus:bg-surface focus:ring-2 focus:ring-ring/25"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border-strong text-foreground transition hover:border-brand hover:text-brand"
                  aria-label="Dừng"
                >
                  <Square className="h-4 w-4" aria-hidden />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white transition hover:bg-brand-dark disabled:opacity-50"
                  aria-label="Gửi"
                >
                  <Send className="h-4 w-4" aria-hidden />
                </button>
              )}
            </form>
            <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[0.66rem] leading-tight text-muted">
              <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
              Giá &amp; tồn kho có thể đổi, cần xác nhận lại trước khi mua. Thông tin tham khảo từ dữ liệu sản phẩm có sẵn.
            </p>
          </div>
        </section>
      )}
    </>
  );
}

/** Một tin nhắn — text bubble, chip ngành hàng, hoặc lưới thẻ sản phẩm theo part. */
function MessageItem({
  message,
  onQuickAsk,
}: Readonly<{
  message: ChatMessage;
  onQuickAsk: (text: string) => void;
}>) {
  return (
    <div className="msg-in space-y-3">
      {message.parts.map((part, i) => {
        const key = `${message.id}:${i}`;

        if (part.type === "text") {
          if (!part.text.trim()) return null;
          return (
            <div key={key} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[0.85rem] leading-relaxed",
                  message.role === "user"
                    ? "rounded-br-md bg-brand text-white"
                    : "rounded-bl-md border border-border bg-surface-2 text-foreground"
                )}
              >
                {part.text}
              </div>
            </div>
          );
        }

        if (part.type === "data-categories") {
          return (
            <div key={key} className="flex flex-wrap gap-2">
              {part.data.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => onQuickAsk(`Tư vấn ${c.label.toLowerCase()}`)}
                  className="rounded-xl border border-border-strong bg-surface px-3 py-2 text-[0.8rem] font-medium text-foreground transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span aria-hidden className="mr-1">{c.emoji}</span>
                  {c.label}
                </button>
              ))}
            </div>
          );
        }

        if (part.type === "data-products") {
          return (
            <div key={key} className="grid grid-cols-2 gap-2.5">
              {part.data.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
