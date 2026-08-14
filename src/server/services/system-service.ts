// =====================================================================
// 系统服务 — 版本查询 / 检查更新 / 执行更新 / 依赖检查
// 对应需求：全局配置页增加更新区域，从 GitHub 仓库拉取最新代码
// 启动脚本检查本机运行依赖和 git 支持
// 兜底路径：.git 不存在时 git init + remote add + fetch + checkout -f
// =====================================================================

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 项目根目录（从 src/server/services/ 向上三层）
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// GitHub 仓库地址
const GITHUB_REMOTE_URL = 'https://github.com/shawyu96/meego-deliver-tools.git';
const GITHUB_REPO = 'shawyu96/meego-deliver-tools';

// =====================================================================
// AC-1: getCurrentVersion — 返回当前版本号
// =====================================================================

export function getCurrentVersion(): string {
  try {
    const pkgPath = path.join(PROJECT_ROOT, 'package.json');
    if (!fs.existsSync(pkgPath)) return 'unknown';
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

// =====================================================================
// AC-2: checkRemoteUpdate — 检查远程最新版本
// =====================================================================

export interface UpdateCheckResult {
  latestVersion: string;
  hasUpdate: boolean;
}

export async function checkRemoteUpdate(
  baseUrl: string,
  repo: string,
): Promise<UpdateCheckResult> {
  return new Promise((resolve, reject) => {
    const apiPath = `/repos/${repo}/releases/latest`;
    const options = {
      hostname: baseUrl.replace(/^https?:\/\//, ''),
      path: apiPath,
      method: 'GET',
      headers: { 'User-Agent': 'meego-plugin-tools' },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.message && !data.tag_name) {
            reject(new Error(data.message));
            return;
          }
          const tag = data.tag_name || '';
          const latestVersion = tag.replace(/^v/, '');
          const currentVersion = getCurrentVersion();
          const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
          resolve({ latestVersion, hasUpdate });
        } catch (err) {
          reject(new Error('Failed to parse remote response'));
        }
      });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

// 语义化版本比较：返回 1 表示 a > b，-1 表示 a < b，0 表示相等
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

// =====================================================================
// AC-3: performUpdate — 执行更新
// .git 存在 → git pull
// .git 不存在 → git init + remote add + fetch + checkout -f（兜底路径）
// 最后执行 npm install 更新依赖
// .env 和 data/ 在 .gitignore 中，git 操作不会触碰它们
// =====================================================================

export interface UpdateResult {
  success: boolean;
  output?: string;
  error?: string;
}

export async function performUpdate(projectRoot: string): Promise<UpdateResult> {
  const outputs: string[] = [];

  try {
    const gitDir = path.join(projectRoot, '.git');
    const hasGit = fs.existsSync(gitDir);

    if (hasGit) {
      // 路径 A：git pull
      const output = execSync('git pull origin main', {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 60000,
      });
      outputs.push(output);
    } else {
      // 路径 B：兜底 — git init + remote add + fetch + checkout -f
      outputs.push(execSync('git init', {
        cwd: projectRoot, encoding: 'utf-8', timeout: 15000,
      }));
      outputs.push(execSync(`git remote add origin ${GITHUB_REMOTE_URL}`, {
        cwd: projectRoot, encoding: 'utf-8', timeout: 15000,
      }));
      outputs.push(execSync('git fetch origin main', {
        cwd: projectRoot, encoding: 'utf-8', timeout: 60000,
      }));
      outputs.push(execSync('git checkout -f -t origin/main', {
        cwd: projectRoot, encoding: 'utf-8', timeout: 30000,
      }));
    }

    // 通用：更新依赖
    outputs.push(execSync('npm install', {
      cwd: projectRoot, encoding: 'utf-8', timeout: 120000,
    }));

    return { success: true, output: outputs.join('\n') };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

// =====================================================================
// 依赖检查：检查本机运行依赖和 git 支持
// =====================================================================

export interface DependencyCheckResult {
  node: { installed: boolean; version?: string };
  git: { installed: boolean; version?: string };
  allOk: boolean;
}

export function checkDependencies(): DependencyCheckResult {
  const result: DependencyCheckResult = {
    node: { installed: false },
    git: { installed: false },
    allOk: false,
  };

  // 检查 Node.js
  try {
    const nodeVersion = execSync('node -v', { encoding: 'utf-8' }).trim();
    result.node = { installed: true, version: nodeVersion };
  } catch {
    result.node = { installed: false };
  }

  // 检查 git
  try {
    const gitVersion = execSync('git --version', { encoding: 'utf-8' }).trim();
    result.git = { installed: true, version: gitVersion };
  } catch {
    result.git = { installed: false };
  }

  result.allOk = result.node.installed && result.git.installed;
  return result;
}
