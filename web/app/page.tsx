"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, ShoppingBag, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/chat-types";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Máy lạnh phòng 18m² dưới 15 triệu, ít ồn",
  "Tủ lạnh cho nhà 4 người, tầm 15 triệu",
  "Tivi 55 inch dưới 12 triệu",
  "Laptop dưới 20 triệu",
];

type Category = { slug: string; label: string; emoji: string };
type Health = { llm: boolean; model: string; categories: Category[] };

export default function Page() {
  const { messages, sendMessage, status, error, stop } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, status]);

  function submit(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    sendMessage({ text: t });
  }

  return (
    <div className="flex h-dvh flex-col">
      {/* ---------- Header thương hiệu ---------- */}
      <header className="brand-bar shrink-0 text-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/15">
            <ShoppingBag className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[1rem] font-bold leading-tight">
              Trợ lý tư vấn Điện Máy Xanh
            </h1>
            <p className="truncate text-xs text-white/80">
              Tư vấn theo nhu cầu thật · demo
            </p>
          </div>
          {health && (
            <span
              title={
                health.llm
                  ? `Đã kết nối mô hình ${health.model}`
                  : "Chưa kết nối LLM — vẫn tra cứu được sản phẩm thật"
              }
              className="hidden items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs sm:inline-flex"
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  health.llm ? "bg-promo" : "bg-accent"
                )}
                aria-hidden
              />
              {health.llm ? "LLM đã kết nối" : "Chế độ cơ bản"}
            </span>
          )}
        </div>

        {/* Thanh ngành hàng — bấm để chuyển nhóm sản phẩm */}
        {health?.categories?.length ? (
          <div className="border-t border-white/15">
            <div className="no-bar mx-auto flex max-w-4xl gap-2 overflow-x-auto px-4 py-2">
              {health.categories.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => submit(`Tư vấn ${c.label.toLowerCase()}`)}
                  className="shrink-0 rounded-full bg-white/12 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <span aria-hidden>{c.emoji}</span> {c.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      {/* ---------- Khung hội thoại ---------- */}
      <div ref={scrollRef} className="scroll-soft flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-5">
          {messages.length === 0 && (
            <section className="msg-in rounded-xl border border-border bg-surface p-5">
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                Em tư vấn sản phẩm hợp nhu cầu của mình ạ
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Anh/chị cứ mô tả tự nhiên — dùng cho mấy người, phòng bao rộng, tầm
                bao nhiêu tiền. Em hỏi thêm nếu còn thiếu, rồi gợi ý 3 lựa chọn kèm
                lý do và so sánh hơn kém.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="rounded-full border border-border-strong bg-surface-2 px-3.5 py-2 text-left text-xs text-foreground transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </section>
          )}

          {messages.map((m) => (
            <div key={m.id} className="msg-in space-y-3">
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex",
                        m.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                          m.role === "user"
                            ? "rounded-br-md bg-brand text-white"
                            : "rounded-bl-md border border-border bg-surface text-foreground"
                        )}
                      >
                        {part.text}
                      </div>
                    </div>
                  );
                }

                if (part.type === "data-categories") {
                  return (
                    <div key={i} className="flex flex-wrap gap-2">
                      {part.data.map((c) => (
                        <button
                          key={c.slug}
                          onClick={() => submit(`Tư vấn ${c.label.toLowerCase()}`)}
                          className="rounded-xl border border-border-strong bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <div key={i} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {part.data.map((p) => (
                        <ProductCard key={p.id} p={p} />
                      ))}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          ))}

          {status === "submitted" && (
            <div className="msg-in flex justify-start">
              <div className="dots rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-muted">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-price/40 bg-price/10 px-4 py-3 text-sm text-price"
            >
              Không gửi được tin nhắn. Anh/chị kiểm tra kết nối rồi thử lại giúp em nhé.
            </div>
          )}
        </div>
      </div>

      {/* ---------- Ô nhập ---------- */}
      <div className="shrink-0 border-t border-border bg-surface">
        <div className="mx-auto max-w-4xl px-4 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ví dụ: tủ lạnh cho nhà 4 người, tầm 15 triệu…"
              aria-label="Nội dung tin nhắn"
              className="h-11 flex-1 rounded-full border border-border-strong bg-surface-2 px-4 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-brand focus:bg-surface focus:ring-2 focus:ring-ring/25"
            />
            {busy ? (
              <Button type="button" variant="outline" size="icon" onClick={stop} aria-label="Dừng">
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Gửi">
                <ArrowUp className="h-5 w-5" />
              </Button>
            )}
          </form>
          <p className="mt-2 text-center text-[0.7rem] text-muted">
            Gợi ý dựa trên dữ liệu sản phẩm có sẵn. Thông tin thiếu sẽ được báo rõ, không suy đoán.
          </p>
        </div>
      </div>
    </div>
  );
}
