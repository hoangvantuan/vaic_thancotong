#!/usr/bin/env bash
#
# Deploy lên server tct_server: SSH vào, kéo code mới nhất, dựng lại container.
# Không cần cài gì thêm — chạy xong sẽ hỏi password 1 lần, gõ vào là được.
#
# Cách dùng:
#   ./deploy.sh
#
set -euo pipefail

# ---- Cấu hình server -------------------------------------------------------
SSH_USER="miichi"
SSH_HOST="172.16.0.162"

ROOT_DIR="/home/miichi/vaic_thancotong"       # thư mục git repo
WEB_DIR="/home/miichi/vaic_thancotong/web"    # thư mục có docker-compose.yml
GIT_BRANCH="develop"                           # nhánh cần pull
# ---------------------------------------------------------------------------

echo "==> Kết nối ${SSH_USER}@${SSH_HOST} (sẽ hỏi password)..."

ssh -t "${SSH_USER}@${SSH_HOST}" bash -s <<EOF
set -euo pipefail

echo "==> [1/3] Cập nhật code tại ${ROOT_DIR}"
cd "${ROOT_DIR}"
git fetch --all --prune
git checkout "${GIT_BRANCH}"
git pull --ff-only origin "${GIT_BRANCH}"
echo "    Commit hiện tại: \$(git rev-parse --short HEAD)"

echo "==> [2/3] Dựng lại container tại ${WEB_DIR}"
cd "${WEB_DIR}"
docker compose up -d --build

echo "==> [3/3] Trạng thái container"
docker compose ps
EOF

echo "==> Xong. Triển khai thành công."
