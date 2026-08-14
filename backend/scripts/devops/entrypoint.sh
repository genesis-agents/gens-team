#!/bin/sh
# Single source of truth for backend startup (PR-X43).
#
# Previously two paths existed:
#   1. Dockerfile CMD ["./scripts/devops/docker-entrypoint.sh"]
#   2. railway.toml startCommand (overrode the CMD with a different sequence)
#
# Railway always overrode the CMD, so this file was dead code in production.
# Now (PR-X43) railway.toml drops its startCommand override, this script
# becomes the only entry point on every platform (local docker run, Railway,
# anything else honoring the OCI CMD), and its logic is the merge of what
# the two previous paths did:
#
#   - Set production runtime env (NODE_ENV, NODE_OPTIONS, Chromium path)
#   - Run the diagnostic (best-effort, never blocks startup)
#   - Run the unified deploy script (prisma migrate deploy + seed); fail hard
#     if it errors so we don't boot against a broken schema.
#   - exec node dist/main
#
# Historical "SQL hotfix" stages (fix-enum-values.js, fix-export-tables.js,
# manually-resolved migration markers) have been folded into the regular
# prisma migrations under prisma/migrations/. If a future drift requires a
# one-off SQL patch, write a new migration; do not put procedural fixes here.

set -e

export NODE_ENV="${NODE_ENV:-production}"
# ★ 2026-08-14 内存成本治理：本行是堆上限的唯一真相源。
#   历史问题：Railway Variables 面板曾设 NODE_OPTIONS=--max-old-space-size=3072，
#   静默覆盖此处默认值，导致代码里的 1536 变成没人在看的死配置（配置漂移）。
#   V8 拿到 3GB 授权后不会把已释放的页还给 OS，任何一次突发分配都变成永久平台期，
#   而 Railway 按 RSS 分钟计费 —— 生产实测空载常驻 1.7GB、峰值 2.4GB。
#   面板变量已删除，改回本行统一管理；要调整请改这里并走 code review，
#   不要在面板重新加回去，否则漂移会重现。
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"
export PUPPETEER_EXECUTABLE_PATH="${PUPPETEER_EXECUTABLE_PATH:-/usr/bin/chromium}"
# 浏览器空闲多久后自动关闭释放内存（配合 PuppeteerPoolService 空闲扫描）。
# 设为 0 可禁用，回到"拉起后常驻到进程退出"的旧行为。
export PUPPETEER_IDLE_TIMEOUT_MS="${PUPPETEER_IDLE_TIMEOUT_MS:-300000}"

echo "=========================================="
echo "Starting ${BRAND_FULL_NAME:-gens.team} Backend"
echo "  NODE_ENV=$NODE_ENV"
echo "  NODE_OPTIONS=$NODE_OPTIONS"
echo "=========================================="

echo "🩺 Step 1/3: Database diagnose (best-effort)..."
npm run diagnose || echo "⚠️ diagnose failed, continuing"

echo "🔄 Step 2/3: Database deploy (prisma migrate deploy + seed)..."
npm run deploy || exit 1

echo "🚀 Step 3/3: Starting application..."
exec node dist/main
