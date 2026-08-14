// =====================================================================
// System 路由 — 版本检查 / 检查更新 / 执行更新 / 依赖检查
// 对应需求：全局配置页增加更新区域，从 GitHub 仓库拉取最新代码
// =====================================================================

import { Router } from 'express';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getCurrentVersion,
  checkRemoteUpdate,
  performUpdate,
  checkDependencies,
} from '../services/system-service.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 项目根目录：src/server/routes/ → 向上三层
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// GitHub 仓库（与 system-service.ts 保持一致）
const GITHUB_REPO = 'shawyu96/meego-deliver-tools';

// =====================================================================
// AC-1: GET /api/system/version — 返回当前版本号
// =====================================================================
router.get('/version', (_req, res) => {
  try {
    const version = getCurrentVersion();
    res.json({ ok: true, data: { version } });
  } catch (err: any) {
    res.json({ ok: false, error: err.message });
  }
});

// =====================================================================
// AC-2: GET /api/system/check-update — 返回远程最新版本号
// =====================================================================
router.get('/check-update', async (_req, res) => {
  try {
    let latestVersion = '';
    const hasGit = fs.existsSync(path.join(PROJECT_ROOT, '.git'));

    if (hasGit) {
      // git 仓库：用 git ls-remote 获取最新 tag
      try {
        const raw = execSync('git ls-remote --tags origin', {
          cwd: PROJECT_ROOT,
          encoding: 'utf-8',
          timeout: 15000,
        });
        const tags = raw
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const parts = line.split('\t');
            const tag = parts.length > 1 ? parts[1] : parts[0];
            return tag.replace(/^refs\/tags\//, '').replace(/\^\{\}$/, '');
          })
          .filter((t) => /^v?\d+\.\d+\.\d+/.test(t));
        if (tags.length > 0) {
          latestVersion = tags[tags.length - 1].replace(/^v/, '');
        }
      } catch {
        // git ls-remote 失败，尝试 GitHub API
        try {
          const result = await checkRemoteUpdate('api.github.com', GITHUB_REPO);
          latestVersion = result.latestVersion;
        } catch {
          latestVersion = '';
        }
      }
    } else {
      // 非 git 仓库：直接用 GitHub API
      try {
        const result = await checkRemoteUpdate('api.github.com', GITHUB_REPO);
        latestVersion = result.latestVersion;
      } catch {
        latestVersion = '';
      }
    }

    const currentVersion = getCurrentVersion();
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    res.json({
      ok: true,
      data: {
        latest_version: latestVersion,
        has_update: hasUpdate,
      },
    });
  } catch (err: any) {
    res.json({ ok: false, error: err.message });
  }
});

// =====================================================================
// AC-3: POST /api/system/update — 执行更新
// .git 存在 → git pull；.git 不存在 → git init 兜底路径
// 最后执行 npm install，.env 和 data/ 靠 .gitignore 天然保护
// =====================================================================
router.post('/update', async (_req, res) => {
  try {
    const result = await performUpdate(PROJECT_ROOT);
    if (result.success) {
      res.json({ ok: true, data: { output: result.output } });
    } else {
      res.json({ ok: false, error: result.error });
    }
  } catch (err: any) {
    res.json({ ok: false, error: err.message });
  }
});

// =====================================================================
// GET /api/system/dependencies — 检查 Node.js 和 git 是否安装
// =====================================================================
router.get('/dependencies', (_req, res) => {
  try {
    const result = checkDependencies();
    res.json({ ok: true, data: result });
  } catch (err: any) {
    res.json({ ok: false, error: err.message });
  }
});

// =====================================================================
// 辅助：语义化版本比较
// =====================================================================
function compareVersions(a: string, b: string): number {
  const na = (a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const nb = (b || '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(na.length, nb.length);
  for (let i = 0; i < len; i++) {
    const va = na[i] || 0;
    const vb = nb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

export default router;
