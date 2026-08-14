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

# 端口占用检查：
#   - 被其他项目占用 → 提示并退出
#   - 被本项目占用 → 杀旧进程，继续启动新的
check_ports() {
  local PROJECT_DIR
  PROJECT_DIR="$(pwd)"
  for PORT in 3000 3001; do
    if ! command -v lsof &>/dev/null; then
      warn "未找到 lsof，跳过端口 $PORT 检查"
      continue
    fi
    local PIDS
    PIDS=$(lsof -ti ":${PORT}" -sTCP:LISTEN 2>/dev/null || true)
    if [ -z "$PIDS" ]; then
      info "端口 $PORT 空闲"
      continue
    fi
    # 检查占用进程是否属于本项目：
    #   1. 命令行包含项目路径，或
    #   2. 进程 cwd 在项目目录下，且命令行含 Node 生态关键词
    local OWNED="" EXTERNAL=""
    for PID in $PIDS; do
      local CMDLINE CWD IS_OWNED
      CMDLINE=$(ps -p "$PID" -o command= 2>/dev/null || true)
      CWD=$(lsof -a -p "$PID" -d cwd -Fn 2>/dev/null | grep '^n' | sed 's/^n//' || true)
      IS_OWNED=0
        if echo "$CMDLINE" | grep -q "$PROJECT_DIR"; then
      IS_OWNED=1
        elif [ "${CWD#"$PROJECT_DIR"}" != "$CWD" ] && \
      echo "$CMDLINE" | grep -qE 'node|npm|npx|tsx|vite|concurrently|better-sqlite3'; then
    IS_OWNED=1
      fi
      if [ "$IS_OWNED" -eq 1 ]; then
        OWNED="$OWNED $PID"
      else
        EXTERNAL="$EXTERNAL $PID"
      fi
    done
    # 有外部进程占用 → 提示退出
    if [ -n "$EXTERNAL" ]; then
      warn "端口 $PORT 被其他程序占用："
      for PID in $EXTERNAL; do
        echo "  PID $PID: $(ps -p "$PID" -o command= 2>/dev/null || echo '未知')"
      done
      fail "请关闭上述程序后重试，或修改 .env 中的 PORT 配置"
    fi
    # 本项目旧进程 → 杀掉
    if [ -n "$OWNED" ]; then
      warn "端口 $PORT 被本项目旧进程占用，正在关闭..."
      for PID in $OWNED; do
        kill "$PID" 2>/dev/null || true
      done
      sleep 1
      # 若仍未退出，强制杀
      for PID in $OWNED; do
        if kill -0 "$PID" 2>/dev/null; then
          kill -9 "$PID" 2>/dev/null || true
        fi
      done
      info "旧进程已关闭"
    fi
  done
}

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
    step "端口检查"
    check_ports
    step "开发模式启动"
    echo -e "  前端: ${BOLD}http://127.0.0.1:3000${NC}"
    echo -e "  后端: ${BOLD}http://localhost:3001${NC}"
        echo ""
        npm run dev
    ;;
  build|prod)
    step "端口检查"
    check_ports
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
