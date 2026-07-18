# syntax=docker/dockerfile:1.7
#
# Trợ lý tư vấn sản phẩm Điện Máy Xanh — image self-host (on-premise FIRST).
# Mọi version đều GHIM CỨNG để build lại lúc nào cũng ra đúng một kết quả:
#   - Node ghim theo patch (ARG NODE_VERSION) — đổi ở một chỗ duy nhất.
#   - Thư viện ghim bởi package-lock.json + `npm ci` (không bao giờ tự nâng version).
#   - Next chạy chế độ standalone → không cần cài node_modules ở máy đích.
#
# Build:  docker build -t tuvan-dmx:1.0.0 .            (context = thư mục web/)
# Run:    docker run --rm -p 3000:3000 \
#           -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
#           tuvan-dmx:1.0.0

ARG NODE_VERSION=22.14.0

# ---------- base ----------
FROM node:${NODE_VERSION}-alpine AS base
# libc6-compat: một số native module cần khi chạy trên Alpine (musl).
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- deps: cài đúng version trong lockfile ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- builder ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next/font tải font lúc BUILD rồi tự host → lúc CHẠY không gọi ra mạng ngoài.
RUN npm run build

# ---------- runner ----------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Lưu ý: data/*.json (6 ngành) được import tĩnh nên đã nằm sẵn trong bản build,
# không cần chép riêng ở tầng runner.

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
