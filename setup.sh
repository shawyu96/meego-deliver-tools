#!/usr/bin/env bash
set -euo pipefail

# =====================================================================
# Meego 插件工具 — 一键安装启动脚本
# 用法: ./setup.sh          安装依赖 + 开发模式启动
#       ./setup.sh dev       同上
#       ./setup.sh build     安装依赖 + 生产构建 + 启动
#       ./setup.sh prod      同 build（别名）
# =====================================================================

cd "$(dirname "$0")"

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "${RED}✘${NC} $1"; exit 1; }
step()  { echo -e "\n${BOLD}── $1 ──${NC}"; }

MODE="${1:-dev}"

# ---- 1. 检查 Node.js ----
step "检查环境"
if ! command -v node &>/dev/null; then
  fail "未检测到 Node.js，请先安装 Node.js ≥ 18：https://nodejs.org"
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js 版本过低（当前 $(node -v)），需要 ≥ 18"
fi
info "Node.js $(node -v)"

# ---- 2. 安装依赖 ----
step "安装依赖"
if [ ! -d node_modules ]; then
  npm install
  info "依赖安装完成"
else
  info "node_modules 已存在，跳过安装（如需重装请先 rm -rf node_modules）"
fi

# ---- 3. 配置 .env ----
step "检查配置"
if [ ! -f .env ]; then
  cp .env.example .env
  warn ".env 已从模板创建，请编辑填写飞书项目凭证：$(pwd)/.env"
  warn "或启动后在前端全局配置页手动填写。"
else
  info ".env 已存在"
fi

# ---- 4. 创建数据目录 ----
mkdir -p data
info "数据目录就绪"

# ---- 5. 启动 ----
case "$MODE" in
  dev)
    step "开发模式启动"
    echo -e "  前端: ${BOLD}http://127.0.0.1:3000${NC}"
    echo -e "  后端: ${BOLD}http://localhost:3001${NC}"
    echo ""
    npm run dev
    ;;
  build|prod)
    step "生产构建"
    npm run build
    info "构建完成"
    step "生产模式启动"
    echo -e "  访问: ${BOLD}http://localhost:3001${NC}"
    echo ""
    npm start
    ;;
  *)
    echo "用法: ./setup.sh [dev|build]"
    echo "  dev    安装 + 开发模式（默认）"
    echo "  build  安装 + 生产构建 + 启动"
    exit 1
    ;;
esac
