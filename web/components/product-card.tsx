"use client";

import { useState } from "react";
import { ImageOff, Star } from "lucide-react";
import type { RecommendedProduct } from "@/lib/types";
import { formatSold, formatVnd } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Thẻ sản phẩm theo phong cách web Điện Máy Xanh: ảnh trên, tên 2 dòng,
 * GIÁ ĐỎ đậm + giá gốc gạch ngang, badge % giảm, sao đánh giá và số đã bán.
 *
 * Chỉ hiển thị dữ liệu CÓ THẬT — thiếu giá thì hiện badge "Giá đang cập nhật",
 * thiếu ảnh/đánh giá thì bỏ qua phần đó, không bịa.
 */
export function ProductCard({ p }: { p: RecommendedProduct }) {
  const [imgOk, setImgOk] = useState(true);

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition hover:border-brand/50 hover:shadow-lg">
      {/* Ảnh + badge giảm giá */}
      <div className="relative aspect-square bg-white p-3">
        {p.discountPercent != null && p.discountPercent > 0 && (
          <span className="absolute left-2 top-2 z-10 rounded-md bg-price px-1.5 py-0.5 text-[0.68rem] font-bold text-white">
            -{p.discountPercent}%
          </span>
        )}
        {p.imageUrl && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.imageUrl}
            alt={p.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
            className="h-full w-full object-contain transition group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center rounded-lg bg-surface-2 text-muted">
            <ImageOff className="h-7 w-7" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3 pt-2">
        <h3 className="line-clamp-2 min-h-[2.4rem] text-[0.82rem] font-medium leading-snug text-foreground">
          {p.name}
        </h3>

        {/* Giá */}
        <div className="mt-1.5">
          {p.hasPrice ? (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[1.02rem] font-bold tabular-nums text-price">
                {formatVnd(p.priceDisplay)}
              </span>
              {p.priceOriginal != null &&
                p.priceOriginal > (p.priceDisplay ?? 0) && (
                  <span className="text-xs text-muted line-through tabular-nums">
                    {formatVnd(p.priceOriginal)}
                  </span>
                )}
            </div>
          ) : (
            <span className="inline-flex rounded border border-border-strong bg-surface-2 px-1.5 py-1 text-[0.72rem] font-medium text-muted">
              Giá đang cập nhật
            </span>
          )}
        </div>

        {/* Đánh giá + đã bán (chỉ khi có thật) */}
        {(p.rating != null || p.quantitySold != null) && (
          <div className="mt-1.5 flex items-center gap-2 text-[0.72rem] text-muted">
            {p.rating != null && (
              <span className="inline-flex items-center gap-0.5">
                <Star
                  className="h-3.5 w-3.5 fill-accent text-accent"
                  aria-hidden
                />
                <span className="font-medium text-foreground">
                  {p.rating.toFixed(1)}
                </span>
              </span>
            )}
            {formatSold(p.quantitySold) && (
              <span>Đã bán {formatSold(p.quantitySold)}</span>
            )}
          </div>
        )}

        {/* Tiêu chí khớp hoàn cảnh — câu trả lời trực tiếp cho điều khách hỏi */}
        {p.fitText && (
          <div className="mt-2 inline-flex w-fit rounded-md bg-brand/10 px-2 py-1 text-[0.72rem] font-medium text-brand">
            Phù hợp {p.fitText}
          </div>
        )}

        {/* Thông số nổi bật theo cấu hình ngành */}
        {p.highlights.length > 0 && (
          <dl className="mt-2 space-y-0.5">
            {p.highlights.slice(0, 3).map((h) => (
              <div key={h.label} className="flex gap-1.5 text-[0.72rem]" title={h.title}>
                <dt className="shrink-0 text-muted">{h.label}:</dt>
                <dd className="truncate font-medium text-foreground">{h.text}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Khuyến mãi TẠM ẨN: chuỗi quà tặng của nguồn dài cả đoạn, cắt kiểu gì cũng
            đứt giữa câu và làm thẻ cao lên — che mất phần lý do tư vấn (thứ khách
            cần đọc). Dữ liệu vẫn còn ở `p.promotion`; muốn bật lại thì render ở đây. */}

        {/* Lý do phù hợp */}
        <p className="mt-auto border-t border-border pt-2 text-[0.72rem] leading-relaxed text-muted">
          {p.reason}
        </p>

        {p.url && (
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "mt-2 rounded-md bg-brand px-3 py-1.5 text-center text-xs font-semibold text-white",
              "transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            )}
          >
            Xem chi tiết
          </a>
        )}
      </div>
    </article>
  );
}
