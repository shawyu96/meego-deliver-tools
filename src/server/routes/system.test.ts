// =====================================================================
// System 路由 — 版本检查 / 更新功能 单元测试
// 对应验收标准 AC-1 ~ AC-7 + 兜底路径
// =====================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

// ---------- Mock execSync ----------
const { mockExecSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
}));

// ---------- Mock fs ----------
const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({ execSync: mockExecSync }));
vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  copyFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// 被测模块
import systemRouter from './system.js';

// ---------- 测试辅助 ----------
const app = express();
app.use(express.json());
app.use('/api/system', systemRouter);

let server: Server;
const PORT = 3999;

function get(pathStr: string): Promise<any> {
  return fetch(`http://127.0.0.1:${PORT}${pathStr}`).then(r => r.json());
}
function post(pathStr: string, body?: any): Promise<any> {
  return fetch(`http://127.0.0.1:${PORT}${pathStr}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());
}

beforeEach(() => {
  mockExecSync.mockReset();
  mockExistsSync.mockReset();
  mockReadFileSync.mockReset();
});

beforeEach(async () => {
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 100));
});

afterEach(async () => {
  await new Promise<void>(r => server.close(() => r()));
});

// =====================================================================
// AC-1: GET /api/system/version 返回当前版本号
// =====================================================================
describe('AC-1: GET /api/system/version', () => {
  it('返回 ok=true 和 version 字段', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ name: 'meego-plugin-tools', version: '1.0.0' })
    );

    const res = await get('/api/system/version');

    expect(res.ok).toBe(true);
    expect(res.data).toHaveProperty('version');
    expect(typeof res.data.version).toBe('string');
    expect(res.data.version.length).toBeGreaterThan(0);
  });

  it('package.json 不存在时返回 fallback 版本号 unknown', async () => {
    mockExistsSync.mockReturnValue(false);

    const res = await get('/api/system/version');

    expect(res.ok).toBe(true);
    expect(res.data.version).toBe('unknown');
  });
});

// =====================================================================
// AC-2: GET /api/system/check-update 返回远程最新版本号
// =====================================================================
describe('AC-2: GET /api/system/check-update', () => {
  it('返回 ok=true 和 latest_version 字段', async () => {
    mockExecSync.mockReturnValue('1.1.0\n');
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ name: 'meego-plugin-tools', version: '1.0.0' })
    );

    const res = await get('/api/system/check-update');

    expect(res.ok).toBe(true);
    expect(res.data).toHaveProperty('latest_version');
    expect(typeof res.data.latest_version).toBe('string');
  });

  it('返回 has_update 布尔值，当远程版本高于本地时为 true', async () => {
    mockExecSync.mockReturnValue('1.1.0\n');
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ name: 'meego-plugin-tools', version: '1.0.0' })
    );

    const res = await get('/api/system/check-update');

    expect(res.ok).toBe(true);
    expect(res.data.has_update).toBe(true);
  });

  it('本地版本等于远程版本时 has_update 为 false', async () => {
    mockExecSync.mockReturnValue('1.0.0\n');
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ name: 'meego-plugin-tools', version: '1.0.0' })
    );

    const res = await get('/api/system/check-update');

    expect(res.ok).toBe(true);
    expect(res.data.has_update).toBe(false);
  });
});

// =====================================================================
// AC-3: POST /api/system/update — git 路径
// =====================================================================
describe('AC-3: POST /api/system/update — git 路径', () => {
  it('成功执行 git pull 并返回 ok=true', async () => {
    // .git 存在 → git pull 路径
    mockExistsSync.mockImplementation((p: string) => String(p).endsWith('.git'));
    mockExecSync.mockReturnValue('Already up to date.\n');
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));

    const res = await post('/api/system/update');

    expect(res.ok).toBe(true);
    expect(res.data).toHaveProperty('output');
    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('git pull'))).toBe(true);
  });

  it('git 命令失败时返回 ok=false 和 error', async () => {
    mockExistsSync.mockImplementation((p: string) => String(p).endsWith('.git'));
    mockExecSync.mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });

    const res = await post('/api/system/update');

    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('更新后执行 npm install', async () => {
    mockExistsSync.mockImplementation((p: string) => String(p).endsWith('.git'));
    mockExecSync.mockReturnValue('Already up to date.\n');
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));

    await post('/api/system/update');

    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('npm install'))).toBe(true);
  });
});

// =====================================================================
// AC-3b: POST /api/system/update — zip 兜底路径
// =====================================================================
describe('AC-3b: POST /api/system/update — zip 兜底路径', () => {
  it('.git 不存在时执行 git init 兜底', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('');
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));

    const res = await post('/api/system/update');

    expect(res.ok).toBe(true);
    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('git init'))).toBe(true);
  });

  it('.git 不存在时执行 git remote add origin', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('');
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));

    await post('/api/system/update');

    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('git remote add origin'))).toBe(true);
  });

  it('.git 不存在时执行 git fetch + git checkout -f', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('');
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));

    await post('/api/system/update');

    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('git fetch origin main'))).toBe(true);
    expect(calls.some(c => c.includes('git checkout -f'))).toBe(true);
  });

  it('兜底路径也执行 npm install', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('');
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));

    await post('/api/system/update');

    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('npm install'))).toBe(true);
  });
});

// =====================================================================
// AC-7: 更新过程保护 .env 和 data/ 目录不被覆盖
// =====================================================================
describe('AC-7: 保护 .env 和 data/ 目录', () => {
  it('update 接口不删除 .env 和 data/ 目录', async () => {
    mockExistsSync.mockImplementation((p: string) => String(p).endsWith('.git'));
    mockExecSync.mockReturnValue('Already up to date.\n');
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));

    const res = await post('/api/system/update');

    expect(res.ok).toBe(true);
    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('rm ') || c.includes('rmdir'))).toBe(false);
  });

  it('兜底路径不删除 .env 和 data/', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('');
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));

    const res = await post('/api/system/update');

    expect(res.ok).toBe(true);
    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('rm ') && (c.includes('.env') || c.includes('data')))).toBe(false);
  });
});

// =====================================================================
// GET /api/system/dependencies — 依赖检查
// =====================================================================
describe('GET /api/system/dependencies', () => {
  it('返回 Node.js 和 git 的安装状态', async () => {
    mockExecSync
      .mockReturnValueOnce('v20.10.0\n')
      .mockReturnValueOnce('git version 2.39.0\n');

    const res = await get('/api/system/dependencies');

    expect(res.ok).toBe(true);
    expect(res.data.node.installed).toBe(true);
    expect(res.data.git.installed).toBe(true);
    expect(res.data.allOk).toBe(true);
  });
});
