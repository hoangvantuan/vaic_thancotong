// Linh vật trợ lý — robot dễ thương kiểu ĐMX (bản GỐC, không sao chép asset của họ):
// đầu bo tròn xanh ĐMX, mắt cyan phát sáng, ăng-ten vàng nhấn. Chỉ là SVG nội tuyến.

export function AssistantAvatar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Trợ lý AI Điện Máy Xanh">
      <defs>
        <linearGradient id="botHead" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#54a0ec" />
          <stop offset="1" stopColor="#1457a0" />
        </linearGradient>
        <radialGradient id="botEye" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#d6f6ff" />
          <stop offset="0.5" stopColor="#67e0ff" />
          <stop offset="1" stopColor="#22b7e6" />
        </radialGradient>
      </defs>

      {/* Ăng-ten */}
      <line x1="32" y1="5" x2="32" y2="13" stroke="#ffd200" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="5" r="3" fill="#ffd200" />

      {/* Tai / loa hai bên */}
      <rect x="7" y="26" width="5.5" height="12" rx="2.75" fill="#1457a0" />
      <rect x="51.5" y="26" width="5.5" height="12" rx="2.75" fill="#1457a0" />

      {/* Đầu */}
      <rect x="12" y="13" width="40" height="38" rx="15" fill="url(#botHead)" />
      <rect x="12" y="13" width="40" height="38" rx="15" fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1.5" />

      {/* Màn hình mặt */}
      <rect x="17" y="19" width="30" height="26" rx="11" fill="#0e2c56" />

      {/* Mắt cyan phát sáng */}
      <ellipse cx="26" cy="30" rx="3.6" ry="4.8" fill="url(#botEye)" />
      <ellipse cx="38" cy="30" rx="3.6" ry="4.8" fill="url(#botEye)" />
      <circle cx="25" cy="28.4" r="1.1" fill="#ffffff" opacity="0.9" />
      <circle cx="37" cy="28.4" r="1.1" fill="#ffffff" opacity="0.9" />

      {/* Miệng cười */}
      <path d="M25.5 38 q6.5 4.5 13 0" stroke="#67e0ff" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
