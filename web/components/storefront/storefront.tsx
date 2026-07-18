// NỀN STOREFRONT kiểu Điện Máy Xanh — CHỈ GIAO DIỆN.
//
// Funnel về trợ lý CHỈ qua: (1) icon trợ lý nhỏ ở góc mỗi sản phẩm, (2) nút "Hỏi trợ
// lý" ở hero, (3) launcher nổi. MỌI phần khác của nền là component TRỐNG ACTION —
// bấm không làm gì (đúng tinh thần trang minh hoạ, không bán hàng thật).

import {
  CreditCard,
  MapPin,
  Repeat,
  Search,
  ShoppingCart,
  Sparkles,
  Truck,
  User,
} from "lucide-react";
import type { Showcase } from "@/lib/storefront/catalog";
import { formatVnd } from "@/lib/format";
import { AssistantAvatar } from "@/components/assistant/assistant-avatar";
import { AskTrigger } from "./ask-trigger";

const BENEFITS = [
  { icon: Sparkles, label: "Flash Sale mỗi ngày" },
  { icon: CreditCard, label: "Trả góp 0%" },
  { icon: Truck, label: "Giao nhanh 2 giờ" },
  { icon: Repeat, label: "Thu cũ đổi mới" },
];

export function Storefront({ showcase }: { showcase: Showcase }) {
  return (
    <div className="min-h-dvh bg-background pb-24">
      {/* Thanh thông báo mỏng */}
      <div className="bg-price py-1.5 text-center text-[0.72rem] font-semibold text-white">
        Bản trình diễn tư vấn AI · nền chỉ để minh hoạ · nhấn biểu tượng trợ lý ở mỗi sản phẩm để được tư vấn
      </div>

      {/* Header thương hiệu (trống action) */}
      <header className="brand-bar text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-[0.7rem] font-black text-brand">
              ĐMX
            </div>
            <span className="hidden text-lg font-black tracking-tight sm:inline">
              Điện máy<span className="text-accent">XANH</span>
            </span>
          </div>

          <div className="flex h-10 flex-1 items-center gap-2 rounded-full bg-white px-4 text-sm text-muted">
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">Bạn tìm sản phẩm nào?</span>
          </div>

          <div className="hidden items-center gap-4 text-xs sm:flex">
            <span className="inline-flex items-center gap-1">
              <User className="h-5 w-5" aria-hidden /> Đăng nhập
            </span>
            <span className="inline-flex items-center gap-1">
              <ShoppingCart className="h-5 w-5" aria-hidden /> Giỏ hàng
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-5 w-5" aria-hidden /> Hồ Chí Minh
            </span>
          </div>
        </div>

        {/* Thanh ngành hàng — trống action */}
        <div className="border-t border-white/15">
          <div className="no-bar mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2">
            {showcase.categories.map((c) => (
              <span
                key={c.slug}
                className="shrink-0 rounded-full bg-white/12 px-3 py-1.5 text-xs font-medium text-white"
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Dải tiện ích — trống action */}
      <section className="mx-auto max-w-6xl px-4 pt-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {BENEFITS.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-[0.76rem] font-medium leading-tight text-foreground">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Hero — nút "Hỏi trợ lý" là nút MỞ trợ lý nên vẫn hoạt động */}
      <section className="mx-auto max-w-6xl px-4 pt-5">
        <div className="brand-bar flex flex-col items-start gap-3 rounded-2xl px-5 py-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-accent">
              <Sparkles className="h-4 w-4" aria-hidden /> Trợ lý AI tư vấn có căn cứ
            </p>
            <h1 className="mt-1 text-xl font-black leading-tight sm:text-2xl">
              Gợi ý đúng nhu cầu — kèm lý do, đánh đổi và nguồn dữ liệu
            </h1>
            <p className="mt-1 text-sm text-white/85">
              Lọc điều kiện trước, xếp hạng sau, và mở được lý do từng gợi ý.
            </p>
          </div>
          <AskTrigger
            seed="Máy lạnh cho phòng 18m², tầm 15 triệu, ưu tiên ít ồn"
            className="shrink-0 rounded-full bg-accent px-5 py-3 text-sm font-bold text-brand shadow-lg transition hover:brightness-105"
          >
            Hỏi trợ lý ngay
          </AskTrigger>
        </div>
      </section>

      {/* Các ngành hàng — thẻ TRỐNG ACTION, chỉ icon trợ lý ở góc là mở chat */}
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {showcase.sections
          .filter((s) => s.tiles.length > 0)
          .map((section) => (
            <section key={section.slug}>
              <h2 className="mb-2 text-base font-bold text-foreground">{section.label}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {section.tiles.map((t) => (
                  <article
                    key={t.id}
                    className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface"
                  >
                    {/* Icon trợ lý nhỏ ở góc phải — LỐI DUY NHẤT từ sản phẩm vào trợ lý */}
                    <AskTrigger
                      seed={t.seed}
                      ariaLabel={`Hỏi trợ lý về ${t.name}`}
                      className="absolute bottom-2 right-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-white shadow-lg ring-1 ring-border transition hover:scale-110 hover:ring-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <AssistantAvatar className="h-7 w-7" />
                    </AskTrigger>

                    <div className="aspect-square bg-white p-2">
                      {t.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.image}
                          alt={t.name}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-contain transition group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="h-full w-full rounded bg-surface-2" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-2.5">
                      <p className="line-clamp-2 min-h-[2.2rem] text-[0.78rem] font-medium leading-snug text-foreground">
                        {t.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                        <span className="text-[0.92rem] font-bold tabular-nums text-price">
                          {formatVnd(t.priceSale)}
                        </span>
                        {t.priceOriginal != null && t.priceOriginal > (t.priceSale ?? 0) && (
                          <span className="text-[0.68rem] text-muted line-through tabular-nums">
                            {formatVnd(t.priceOriginal)}
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
      </main>
    </div>
  );
}
