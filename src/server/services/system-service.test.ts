import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// system-service.ts 测试 — 版本查询、远程检查更新、更新执行
// AC-1: GET /api/system/version → 返回当前版本号
// AC-2: GET /api/system/check-update → 返回远程最新版本号
// AC-3: POST /api/system/update → 触发更新并返回结果
// AC-7: 更新过程保护 .env 和 data/ 目录不被覆盖（.gitignore 天然保护）
// 兜底路径：.git 不存在时 git init + remote add + fetch + checkout -f
// =====================================================================

// ---- mock node:child_process ----
const { mockExecSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
}));
vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}));

// ---- mock node:https ----
const { mockHttpsResponseRef } = vi.hoisted(() => ({
  mockHttpsResponseRef: { value: null as any },
}));
vi.mock('node:https', () => ({
  request: vi.fn((opts: any, cb: (res: any) => void) => {
    const bodyStr = JSON.stringify(mockHttpsResponseRef.value || { tag_name: 'v1.2.0' });
    const res = {
      on: (event: string, handler: (chunk?: any) => void) => {
        if (event === 'data') handler(Buffer.from(bodyStr));
        else if (event === 'end') handler();
      },
    };
    cb(res);
    return {
      setTimeout: vi.fn(),
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    };
  }),
}));

// ---- mock fs ----
const { mockFs } = vi.hoisted(() => ({
  mockFs: {
    existsSync: vi.fn((_p?: string) => true),
    readFileSync: vi.fn(() => JSON.stringify({ version: '1.0.0' })),
    writeFileSync: vi.fn(),
    copyFileSync: vi.fn(),
    rmSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));
const mockExistsSync = mockFs.existsSync;
const mockReadFileSync = mockFs.readFileSync;

vi.mock('node:fs', () => mockFs);

import {
  getCurrentVersion,
  checkRemoteUpdate,
  performUpdate,
  checkDependencies,
} from './system-service.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockHttpsResponseRef.value = { tag_name: 'v1.2.0' };
  mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));
  mockExistsSync.mockReturnValue(true);
});

// =====================================================================
// AC-1: getCurrentVersion — 返回当前版本号
// =====================================================================
describe('AC-1: getCurrentVersion', () => {
  it('从 package.json 读取版本号', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));
    const v = getCurrentVersion();
    expect(v).toBe('1.0.0');
  });

  it('package.json 版本号不存在时返回 unknown', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'test' }));
    const v = getCurrentVersion();
    expect(v).toBe('unknown');
  });

  it('读取异常时返回 unknown', () => {
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    const v = getCurrentVersion();
    expect(v).toBe('unknown');
  });
});

// =====================================================================
// AC-2: checkRemoteUpdate — 检查远程最新版本
// =====================================================================
describe('AC-2: checkRemoteUpdate', () => {
  it('从 GitHub API 获取最新版本号 (tag_name)', async () => {
    mockHttpsResponseRef.value = { tag_name: 'v1.2.0' };
    const r = await checkRemoteUpdate('https://api.github.com', 'owner/repo');
    expect(r.latestVersion).toBe('1.2.0');
    expect(r.hasUpdate).toBe(true); // 1.0.0 < 1.2.0
  });

  it('远程版本不高于当前版本时 hasUpdate=false', async () => {
    mockHttpsResponseRef.value = { tag_name: 'v1.0.0' };
    const r = await checkRemoteUpdate('https://api.github.com', 'owner/repo');
    expect(r.latestVersion).toBe('1.0.0');
    expect(r.hasUpdate).toBe(false);
  });

  it('远程版本低于当前版本时 hasUpdate=false', async () => {
    mockHttpsResponseRef.value = { tag_name: 'v0.9.0' };
    const r = await checkRemoteUpdate('https://api.github.com', 'owner/repo');
    expect(r.hasUpdate).toBe(false);
  });

  it('tag_name 带 v 前缀时正确去除', async () => {
    mockHttpsResponseRef.value = { tag_name: 'v2.0.3' };
    const r = await checkRemoteUpdate('https://api.github.com', 'owner/repo');
    expect(r.latestVersion).toBe('2.0.3');
  });

  it('GitHub API 返回异常时抛出错误', async () => {
    mockHttpsResponseRef.value = { message: 'Not Found' };
    await expect(checkRemoteUpdate('https://api.github.com', 'bad/repo'))
      .rejects.toThrow();
  });
});

// =====================================================================
// AC-3: performUpdate — git 路径（.git 存在）
// =====================================================================
describe('AC-3: performUpdate — git 路径 (.git 存在)', () => {
  it('执行 git pull 并返回成功结果', async () => {
    // .git 存在
    mockExistsSync.mockImplementation((p?: string) => String(p).endsWith('.git'));
    mockExecSync.mockReturnValue('Already up to date.\n');
    const r = await performUpdate('/project/root');
    expect(r.success).toBe(true);
    expect(r.output).toContain('Already up to date');
  });

  it('git pull 有新更新时返回成功', async () => {
    mockExistsSync.mockImplementation((p?: string) => String(p).endsWith('.git'));
    mockExecSync.mockReturnValue('Updating abc1234..def5678\nFast-forward\n');
    const r = await performUpdate('/project/root');
    expect(r.success).toBe(true);
    expect(r.output).toContain('Fast-forward');
  });

  it('git pull 失败时返回 success=false 和错误信息', async () => {
    mockExistsSync.mockImplementation((p?: string) => String(p).endsWith('.git'));
    mockExecSync.mockImplementation(() => {
      throw new Error('merge conflict');
    });
    const r = await performUpdate('/project/root');
    expect(r.success).toBe(false);
    expect(r.error).toContain('merge conflict');
  });

  it('git pull 后执行 npm install 更新依赖', async () => {
    mockExistsSync.mockImplementation((p?: string) => String(p).endsWith('.git'));
    mockExecSync.mockReturnValue('Already up to date.\n');
    await performUpdate('/project/root');
    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('npm install'))).toBe(true);
  });
});

// =====================================================================
// AC-3b: performUpdate — zip 兜底路径 (.git 不存在)
// =====================================================================
describe('AC-3b: performUpdate — zip 兜底路径 (.git 不存在)', () => {
  it('.git 不存在时执行 git init', async () => {
    // .git 目录不存在
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('');
    await performUpdate('/project/root');
    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('git init'))).toBe(true);
  });

  it('.git 不存在时执行 git remote add origin', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('');
    await performUpdate('/project/root');
    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('git remote add origin'))).toBe(true);
  });

  it('.git 不存在时执行 git fetch origin main', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('');
    await performUpdate('/project/root');
    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('git fetch origin main'))).toBe(true);
  });

  it('.git 不存在时执行 git checkout -f -t origin/main（强制覆盖）', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('');
    await performUpdate('/project/root');
    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('git checkout -f'))).toBe(true);
    expect(calls.some(c => c.includes('origin/main'))).toBe(true);
  });

  it('兜底路径也执行 npm install 更新依赖', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('');
    await performUpdate('/project/root');
    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('npm install'))).toBe(true);
  });

  it('兜底路径成功时返回 success=true', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('');
    const r = await performUpdate('/project/root');
    expect(r.success).toBe(true);
  });

  it('兜底路径 git init 失败时返回 success=false', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => {
      throw new Error('git init failed');
    });
    const r = await performUpdate('/project/root');
    expect(r.success).toBe(false);
    expect(r.error).toContain('git init failed');
  });
});

// =====================================================================
// AC-7: 保护 .env 和 data/ — 不使用 backup/restore，靠 .gitignore 天然保护
// =====================================================================
describe('AC-7: 配置保护 — .env 和 data/ 不受更新影响', () => {
  it('更新过程中不执行备份操作（不使用 backup/restore）', async () => {
    mockExistsSync.mockImplementation((p?: string) => String(p).endsWith('.git'));
    mockExecSync.mockReturnValue('Already up to date.\n');
    await performUpdate('/project/root');
    // 不应有 backup 相关的文件操作
    const copyCalls = mockFs.copyFileSync.mock.calls;
    expect(copyCalls.length).toBe(0);
  });

  it('git pull 不触碰 .gitignore 中的文件', async () => {
    mockExistsSync.mockImplementation((p?: string) => String(p).endsWith('.git'));
    mockExecSync.mockReturnValue('Already up to date.\n');
    await performUpdate('/project/root');
    // git pull 本身不会修改 .gitignore 中的文件
    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    // 不应有 rm -rf .env 或类似命令
    expect(calls.some(c => c.includes('rm ') && c.includes('.env'))).toBe(false);
  });

  it('兜底路径也不触碰 .env 和 data/', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('');
    await performUpdate('/project/root');
    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    // checkout -f 不会删除 .gitignore 中的文件
    expect(calls.some(c => c.includes('rm ') && (c.includes('.env') || c.includes('data')))).toBe(false);
  });
});

// =====================================================================
// 依赖检查：checkDependencies — 检查 Node.js 和 git
// =====================================================================
describe('checkDependencies', () => {
  it('Node.js 和 git 都安装时 allOk=true', () => {
    mockExecSync
      .mockReturnValueOnce('v20.10.0\n')   // node -v
      .mockReturnValueOnce('git version 2.39.0\n'); // git --version
    const r = checkDependencies();
    expect(r.node.installed).toBe(true);
    expect(r.node.version).toBe('v20.10.0');
    expect(r.git.installed).toBe(true);
    expect(r.git.version).toBe('git version 2.39.0');
    expect(r.allOk).toBe(true);
  });

  it('git 未安装时 allOk=false', () => {
    mockExecSync
      .mockReturnValueOnce('v20.10.0\n')
      .mockImplementationOnce(() => { throw new Error('not found'); });
    const r = checkDependencies();
    expect(r.node.installed).toBe(true);
    expect(r.git.installed).toBe(false);
    expect(r.allOk).toBe(false);
  });

  it('Node.js 未安装时 allOk=false', () => {
    mockExecSync
      .mockImplementationOnce(() => { throw new Error('not found'); })
      .mockReturnValueOnce('git version 2.39.0\n');
    const r = checkDependencies();
    expect(r.node.installed).toBe(false);
    expect(r.git.installed).toBe(true);
    expect(r.allOk).toBe(false);
  });
});
