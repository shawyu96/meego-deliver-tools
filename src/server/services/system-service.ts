// =====================================================================
// 系统服务 — 版本查询 / 检查更新 / 执行更新 / 依赖检查
// 对应需求：全局配置页增加更新区域，从 GitHub 仓库拉取最新代码
// 启动脚本检查本机运行依赖和 git 支持
// 兜底路径：.git 不存在时 git init + remote add + fetch + checkout -f
// =====================================================================

import { execSync, execFile, spawn } from 'node:child_process';
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

// =====================================================================
// 仓库地址持久化：读写本地 .env 文件中的 REPO_URL
// =====================================================================

const ENV_PATH = path.join(PROJECT_ROOT, '.env');

export function getRepoUrl(): string {
  try {
    if (!fs.existsSync(ENV_PATH)) return GITHUB_REMOTE_URL;
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    const match = content.match(/^REPO_URL=(.+)$/m);
    return match ? match[1].trim() : GITHUB_REMOTE_URL;
  } catch {
    return GITHUB_REMOTE_URL;
  }
}

export function saveRepoUrl(repoUrl: string): void {
  let content = '';
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, 'utf-8');
    if (/^REPO_URL=.+$/m.test(content)) {
      content = content.replace(/^REPO_URL=.+$/m, `REPO_URL=${repoUrl}`);
    } else {
      content += `\nREPO_URL=${repoUrl}\n`;
    }
  } else {
    content = `REPO_URL=${repoUrl}\n`;
  }
  fs.writeFileSync(ENV_PATH, content, 'utf-8');
}

// =====================================================================
// 流式更新：performUpdateStream
// 逐步执行 git/npm 命令，通过回调推送进度事件
// =====================================================================

export interface ProgressEvent {
  step: string;
  status: string;
  message: string;
  step_index: number;
  total_steps: number;
}

export async function performUpdateStream(
  projectRoot: string,
  repoUrl: string | undefined,
  onProgress: (event: ProgressEvent) => void,
): Promise<void> {
  const url = repoUrl || getRepoUrl();
  const hasGit = fs.existsSync(path.join(projectRoot, '.git'));

  // 定义步骤
  const steps: { key: string; desc: string; cmd: string; args: string[] }[] = [];

  if (hasGit) {
    steps.push({ key: 'git-pull', desc: '拉取代码', cmd: 'git', args: ['pull', 'origin', 'main'] });
  } else {
    steps.push({ key: 'git-init', desc: '初始化 git', cmd: 'git', args: ['init'] });
    steps.push({ key: 'git-remote', desc: '添加远程仓库', cmd: 'git', args: ['remote', 'add', 'origin', url] });
    steps.push({ key: 'git-fetch', desc: '拉取远程代码', cmd: 'git', args: ['fetch', 'origin', 'main'] });
    steps.push({ key: 'git-checkout', desc: '切换分支', cmd: 'git', args: ['checkout', '-f', '-t', 'origin/main'] });
  }
  steps.push({ key: 'npm-install', desc: '安装依赖', cmd: 'npm', args: ['install'] });

  const totalSteps = steps.length;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepIndex = i + 1;

    // 推送 running 状态
    onProgress({
      step: step.key,
      status: 'running',
      message: `${step.desc}中…`,
      step_index: stepIndex,
      total_steps: totalSteps,
    });

    try {
      const output = await new Promise<string>((resolve, reject) => {
        execFile(step.cmd, step.args, {
          cwd: projectRoot,
          encoding: 'utf-8',
          timeout: 120000,
          maxBuffer: 1024 * 1024,
        }, (err, stdout, stderr) => {
          if (err) {
            reject(new Error(stderr || err.message));
          } else {
            resolve(stdout.trim());
          }
        });
      });

      onProgress({
        step: step.key,
        status: 'done',
        message: output.slice(0, 200),
        step_index: stepIndex,
        total_steps: totalSteps,
      });
    } catch (err: any) {
      onProgress({
        step: step.key,
        status: 'error',
        message: err.message || String(err),
        step_index: stepIndex,
        total_steps: totalSteps,
      });
      throw err;
    }
  }

  // 推送完成
  onProgress({
    step: 'complete',
    status: 'done',
    message: '更新完成，请重启插件',
    step_index: totalSteps,
    total_steps: totalSteps,
  });
}

// =====================================================================
// V2 弹窗终端方案：performUpdateWithStream
// 用 spawn 执行命令，实时推送 stdout/stderr 原始输出（非结构化进度）
// 适用于 WebSocket 场景，前端以终端风格逐行渲染
// =====================================================================

export interface StreamMessage {
  type: 'stdout' | 'stderr' | 'exit' | 'status';
  data: string | number;
}

export async function performUpdateWithStream(
  projectRoot: string,
  repoUrl: string | undefined,
  onMessage: (msg: StreamMessage) => void,
): Promise<void> {
  const url = repoUrl || getRepoUrl();
  const hasGit = fs.existsSync(path.join(projectRoot, '.git'));

  // 定义命令序列
  const commands: { cmd: string; args: string[]; status: string }[] = [];

  if (hasGit) {
    commands.push({ cmd: 'git', args: ['pull', 'origin', 'main'], status: 'pulling' });
  } else {
    commands.push({ cmd: 'git', args: ['init'], status: 'pulling' });
    commands.push({ cmd: 'git', args: ['remote', 'add', 'origin', url], status: 'pulling' });
    commands.push({ cmd: 'git', args: ['fetch', 'origin', 'main'], status: 'pulling' });
    commands.push({ cmd: 'git', args: ['checkout', '-f', '-t', 'origin/main'], status: 'pulling' });
  }
  commands.push({ cmd: 'npm', args: ['install'], status: 'installing' });

  for (const command of commands) {
    onMessage({ type: 'status', data: command.status });

    const exitCode = await new Promise<number>((resolve) => {
      const child = spawn(command.cmd, command.args, {
        cwd: projectRoot,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        if (text.trim()) onMessage({ type: 'stdout', data: text });
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        if (text.trim()) onMessage({ type: 'stderr', data: text });
      });

      child.on('error', (err) => {
        onMessage({ type: 'stderr', data: err.message });
        resolve(1);
      });

      child.on('close', (code) => {
        resolve(code ?? 1);
      });
    });

    if (exitCode !== 0) {
      onMessage({ type: 'exit', data: exitCode });
      return;
    }
  }

  onMessage({ type: 'status', data: 'done' });
  onMessage({ type: 'exit', data: 0 });
}
