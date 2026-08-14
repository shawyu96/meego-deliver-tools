// =====================================================================
// Express 服务入口 — 装配路由 + 托管前端静态文件
// 运行: npx tsx src/server/server.ts (开发) / node dist/server/server.js (生产)
// =====================================================================

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { config } from './config.js';
import { initDb } from './db/repositories.js';
import authRoutes from './routes/auth.js';
import workitemRoutes from './routes/workitem.js';
import copyRoutes from './routes/copy.js';
import templateRoutes from './routes/templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 初始化数据库表
initDb();

const app = express();
const PORT = config.port;

app.use(express.json({ limit: '10mb' }));

// ======================== API 路由 ========================
app.use('/api/auth', authRoutes);
app.use('/api/workitem', workitemRoutes);
app.use('/api/copy', copyRoutes);
app.use('/api/templates', templateRoutes);

// ======================== 静态文件托管 ========================
// 生产构建后从 dist/client 托管；开发时由 Vite dev server (3000) 处理
const clientDir = path.resolve(__dirname, '..', '..', '..', 'dist', 'client');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  // SPA 回退
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDir, 'index.html'));
  });
} else {
  // 开发模式：非 API 路径提示前端用 Vite dev server
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.status(200).json({
      ok: false,
      message: '前端开发模式请访问 http://localhost:3000',
    });
  });
}

app.listen(PORT, () => {
  console.log(`\n  [server] 后端 API: http://localhost:${PORT}/api`);
  console.log(`  [server] 数据库: ${config.databaseUrl}`);
  if (fs.existsSync(clientDir)) {
    console.log(`  [server] 前端界面: http://localhost:${PORT}`);
  } else {
    console.log(`  [server] 前端开发: http://localhost:3000 (Vite dev server)`);
  }
  console.log();
});
