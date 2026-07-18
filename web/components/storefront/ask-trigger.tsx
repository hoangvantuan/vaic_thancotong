"use client";

// Mọi hành động trên NỀN storefront đều funnel về trợ lý: bấm → phát sự kiện `dmx:ask`
// (mở panel + mồi câu hỏi). Nền không có hành động thương mại thật — chỉ dẫn tới AI.

export function AskTrigger({
  seed,
  className,
  children,
  ariaLabel,
}: {
  seed: string;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => window.dispatchEvent(new CustomEvent("dmx:ask", { detail: { text: seed } }))}
      className={className}
    >
      {children}
    </button>
  );
}
