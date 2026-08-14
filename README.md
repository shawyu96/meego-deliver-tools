# Meego 插件工具

飞书项目（Meego）可视化操作台 — 在同一个工作项内将**节点子任务**批量复制为**子工作项**，支持字段映射、模板保存与批量执行。

## 功能

- **节点子任务 → 子工作项**：选择工作流节点下的子任务，按字段映射创建为子工作项并关联到目标分组
- **字段映射**：手动配置源字段→目标字段的映射关系，支持固定值、角色负责人
- **映射模板**：保存常用映射配置，下次复用一键应用
- **空间选择**：切换飞书项目空间，凭证统一在全局配置页管理
- **复制记录**：自动写入 SQLite，可查看历史执行结果

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite 5 + TypeScript |
| 后端 | Express 5 + TypeScript + tsx |
| 数据库 | better-sqlite3 + Drizzle ORM |
| 测试 | Vitest 4 |
| 配置校验 | Zod |

## 前置条件

- Node.js ≥ 18
- 飞书项目（Meego）插件凭证：`Plugin ID`、`Plugin Secret`、`User Key`、`Space Key`

## 快速开始

### 一键启动（推荐）

```bash
chmod +x setup.sh
./setup.sh           # 开发模式（默认）
./setup.sh build     # 生产构建 + 启动
```

脚本会自动检查 Node.js 版本、安装依赖、创建 `.env` 和数据目录，然后启动服务。

<details>
<summary>手动操作（如需逐步控制）</summary>

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制示例配置并填写真实凭证：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# 飞书项目 OpenAPI 凭证
MEEGO_BASE_URL=https://project.feishu.cn
MEEGO_PLUGIN_ID=MII_your_plugin_id
MEEGO_PLUGIN_SECRET=your_plugin_secret
MEEGO_TOKEN_TYPE=0
MEEGO_USER_KEY=your_user_key
MEEGO_SPACE_KEY=your_space_key

# 服务端口
PORT=3001

# 数据库
DATABASE_URL=./data/app.db
```

> 凭证也可在前端全局配置页手动填写，无需写入 `.env`。

### 3. 开发模式

同时启动前端 Vite 开发服务器和后端 API 服务：

```bash
npm run dev
```

| 服务 | 地址 |
|---|---|
| 前端开发服务器 | http://127.0.0.1:3000 |
| 后端 API | http://localhost:3001 |

Vite 会自动将 `/api` 请求代理到后端 `3001` 端口。

单独启动：

```bash
npm run dev:server   # 仅后端
npm run dev:client   # 仅前端
```

### 4. 生产构建

```bash
npm run build
npm start
```

构建产物输出到 `dist/`，`npm start` 启动后端并托管前端静态文件，访问 http://localhost:3001。

### 5. 运行测试

```bash
npm test              # 单次运行
npm run test:watch    # 监听模式
npm run typecheck     # 类型检查
```

</details>

## 使用流程

1. **全局配置** — 点击右上角配置 pill，填写插件凭证和 User Key
2. **选择空间** — 凭证配置完成后，右上角空间选择器切换目标空间
3. **选择工作项** — 输入工作项类型和 ID，加载工作流
4. **选择子任务** — 展开工作流节点，勾选要复制的子任务，选择目标分组
5. **字段映射** — 配置源字段到目标字段的映射（可保存为模板）
6. **执行复制** — 确认后批量执行，查看结果

## 项目结构

```
meego-plugin-tools/
├── client/src/           # 前端 React 应用
│   ├── components/       # 页面组件
│   ├── api.ts            # API 封装
│   └── storage.ts        # 本地存储
├── src/
│   ├── server/           # 后端 Express 服务
│   │   ├── routes/       # API 路由（auth/workitem/copy/templates）
│   │   ├── services/     # 业务逻辑（meego-api/copy-service/field-utils）
│   │   ├── db/           # 数据库初始化与仓库
│   │   └── config.ts     # 环境变量校验
│   └── shared/           # 前后端共享类型
├── .env.example          # 环境变量示例
├── vite.config.ts        # Vite 配置
└── package.json
```

## 环境变量说明

| 变量 | 说明 | 默认值 |
|---|---|---|
| `MEEGO_BASE_URL` | 飞书项目 API 地址 | `https://project.feishu.cn` |
| `MEEGO_PLUGIN_ID` | 插件 ID | — |
| `MEEGO_PLUGIN_SECRET` | 插件密钥 | — |
| `MEEGO_TOKEN_TYPE` | Token 类型 | `0` |
| `MEEGO_USER_KEY` | 用户 Key | — |
| `MEEGO_SPACE_KEY` | 空间 Key | — |
| `PORT` | 后端服务端口 | `3001` |
| `DATABASE_URL` | SQLite 数据库路径 | `./data/app.db` |
