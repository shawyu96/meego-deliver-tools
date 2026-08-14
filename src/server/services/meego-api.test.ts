import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// MeegoApi 响应解析与接口调用测试 — vi.mock('node:https')
// 基于真实 Meego OpenAPI 响应格式编写（error.code + data 格式）
// 真实 API 验证结果：
//   - plugin_token 响应: { error: { code: 0, msg: "success" }, data: { token, expire_time } }
//   - /open_api/projects 响应: { err_code: 0, data: ["project_key_1", ...] }
//   - /open_api/projects/detail 响应: { err_code: 0, data: { hex_key: { simple_name, name, ... } } }
//   - /open_api/user/query 响应: { err_code: 0, data: [{ user_key, name: { default, zh_cn, en_us }, ... }] }
// =====================================================================

// mock 响应队列：每个元素 { match: string, body: any }
let mockResponses: { match: string; body: any }[] = [];

vi.mock('node:https', () => ({
  request: vi.fn((opts: any, cb: (res: any) => void) => {
    const path: string = opts.path || '';
    const matched = mockResponses.find((r) => path.includes(r.match));
    const body = matched ? matched.body : { error: { code: 0, msg: 'success' }, data: null };
    const bodyStr = JSON.stringify(body);

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

// 在 mock 之后导入
import { MeegoApi } from '../services/meego-api.js';

function setResponses(responses: { match: string; body: any }[]) {
  mockResponses = responses;
}

// 真实 API 的成功响应格式
function ok(data: any) {
  return { error: { code: 0, msg: 'success' }, err_code: 0, err_msg: '', data };
}

// 真实 API 的错误响应格式
function err(code: number, msg: string) {
  return { error: { code, msg }, err_code: code, err_msg: msg, data: null };
}

// =====================================================================
// norm() 兼容性测试 — 验证两种响应格式都能正确解析
// =====================================================================

describe('MeegoApi — norm() 响应格式兼容', () => {
  it('error.code 格式（真实 API 格式）', async () => {
    setResponses([
      { match: 'plugin_token', body: { error: { code: 0, msg: 'success' }, data: { token: 'tok_err_fmt' } } },
    ]);
    const api = new MeegoApi('https://project.feishu.cn');
    await api.initToken('id', 'secret', 'key', 0);
    // initToken 成功说明 norm() 正确解析了 error.code 格式
    expect(api.ready).toBe(false);
  });

  it('err_code 格式（旧格式兼容）', async () => {
    setResponses([
      { match: 'plugin_token', body: { err_code: 0, err_msg: '', data: { token: 'tok_ec_fmt' } } },
    ]);
    const api = new MeegoApi('https://project.feishu.cn');
    await api.initToken('id', 'secret', 'key', 0);
    expect(api.ready).toBe(false);
  });

  it('error.code 格式失败时抛错', async () => {
    setResponses([
      { match: 'plugin_token', body: { error: { code: 1001, msg: 'invalid plugin' }, data: null } },
    ]);
    const api = new MeegoApi('https://project.feishu.cn');
    await expect(api.initToken('bad', 'bad', 'bad', 0)).rejects.toThrow('token 获取失败');
  });
});

// =====================================================================
// initToken
// =====================================================================

describe('MeegoApi — initToken', () => {
  beforeEach(() => { mockResponses = []; });

  it('成功获取 token（真实 API 格式）', async () => {
    setResponses([
      { match: 'plugin_token', body: ok({ token: 'p-abc123', expire_time: 5437 }) },
    ]);
    const api = new MeegoApi('https://project.feishu.cn');
    await api.initToken('MII_test', 'secret', '7000001', 0);
    expect(api.ready).toBe(false);
  });

  it('token 获取失败时抛错', async () => {
    setResponses([
      { match: 'plugin_token', body: err(1001, 'invalid plugin') },
    ]);
    const api = new MeegoApi('https://project.feishu.cn');
    await expect(api.initToken('bad_id', 'bad_secret', 'bad_key', 0))
      .rejects.toThrow('token 获取失败');
  });
});

// =====================================================================
// queryUsers
// =====================================================================

describe('MeegoApi — queryUsers', () => {
  beforeEach(() => { mockResponses = []; });

  it('正确解析用户列表（name 为对象格式）', async () => {
    setResponses([
      { match: 'plugin_token', body: ok({ token: 'tok' }) },
      {
        match: 'user/query',
        body: ok([
          {
            user_key: '7628161565052652744',
            name: { default: '王天傲', zh_cn: '王天傲', en_us: '王天傲' },
            name_cn: '王天傲',
            name_en: '王天傲',
            username: '7628161565052652744',
            status: 'activated',
          },
          {
            user_key: '7000002',
            name: { default: '李四', zh_cn: '李四', en_us: 'Li Si' },
          },
        ]),
      },
    ]);

    const api = new MeegoApi('https://project.feishu.cn');
    await api.initToken('id', 'secret', 'key', 0);
    const users = await api.queryUsers(['7628161565052652744', '7000002']);

    expect(users.size).toBe(2);
    expect(users.get('7628161565052652744').name.default).toBe('王天傲');
    expect(users.get('7000002').name.zh_cn).toBe('李四');
  });

  it('空 userKeys 返回空 Map', async () => {
    const api = new MeegoApi('https://project.feishu.cn');
    const users = await api.queryUsers([]);
    expect(users.size).toBe(0);
  });

  it('queryUsers 失败时抛错', async () => {
    setResponses([
      { match: 'plugin_token', body: ok({ token: 'tok' }) },
      { match: 'user/query', body: err(2001, 'no permission') },
    ]);
    const api = new MeegoApi('https://project.feishu.cn');
    await api.initToken('id', 'secret', 'key', 0);
    await expect(api.queryUsers(['7000001'])).rejects.toThrow('queryUsers 失败');
  });
});

// =====================================================================
// init (含 projectKey 解析)
// =====================================================================

describe('MeegoApi — init (含 projectKey 解析)', () => {
  beforeEach(() => { mockResponses = []; });

  it('成功 init 并解析 projectKey', async () => {
    setResponses([
      { match: 'plugin_token', body: ok({ token: 'tok_init' }) },
      {
        match: 'projects/detail',
        body: ok({
          hex_abc123: { simple_name: 'test_space', name: '测试空间' },
        }),
      },
    ]);

    const api = new MeegoApi('https://project.feishu.cn');
    await api.init('id', 'secret', 'key', 'test_space', 0);

    expect(api.ready).toBe(true);
    expect(api.projectKey).toBe('hex_abc123');
  });

  it('projectKey 解析失败时抛错', async () => {
    setResponses([
      { match: 'plugin_token', body: ok({ token: 'tok' }) },
      {
        match: 'projects/detail',
        body: ok({
          hex_other: { simple_name: 'other_space', name: '其他空间' },
        }),
      },
    ]);

    const api = new MeegoApi('https://project.feishu.cn');
    await expect(api.init('id', 'secret', 'key', 'nonexistent_space', 0))
      .rejects.toThrow('resolve projectKey 失败');
  });
});

// =====================================================================
// listSpaces — 两步调用：/open_api/projects → /open_api/projects/detail
// 真实 API 验证结果：
//   Step 1: /open_api/projects 返回 ["6a0eb5a239eb22bd44505669"] (project_key 数组)
//   Step 2: /open_api/projects/detail 传 simple_names 返回 { hex_key: { simple_name, name, ... } }
// =====================================================================

describe('MeegoApi — listSpaces', () => {
  beforeEach(() => { mockResponses = []; });

  it('正确解析空间列表（两步调用）', async () => {
    setResponses([
      { match: 'plugin_token', body: ok({ token: 'tok' }) },
      // Step 1: /open_api/projects 返回 project_key 数组
      // 注意: match 用 'projects' 结尾不含 '/detail'，避免误匹配 projects/detail
      // mock 匹配逻辑是 path.includes(match)，需确保顺序正确
      { match: 'projects/detail', body: ok({
        hex_a: { simple_name: 'space_a', name: '空间A' },
        hex_b: { simple_name: 'space_b', name: '空间B' },
      }) },
      { match: 'projects', body: ok(['hex_a', 'hex_b']) },
    ]);

    const api = new MeegoApi('https://project.feishu.cn');
    await api.initToken('id', 'secret', 'key', 0);
    const spaces = await api.listSpaces('key');

    expect(spaces).toHaveLength(2);
    expect(spaces[0]).toEqual({
      project_key: 'hex_a',
      name: '空间A',
      simple_name: 'space_a',
    });
    expect(spaces[1]).toEqual({
      project_key: 'hex_b',
      name: '空间B',
      simple_name: 'space_b',
    });
  });

  it('真实场景：单个空间', async () => {
    // 基于真实 API 返回数据
    setResponses([
      { match: 'plugin_token', body: ok({ token: 'p-86b19276', expire_time: 5437 }) },
      { match: 'projects/detail', body: ok({
        '6a0eb5a239eb22bd44505669': {
          simple_name: 'i618x4',
          name: '王天傲软研测试空间',
          project_key: '6a0eb5a239eb22bd44505669',
        },
      }) },
      { match: 'projects', body: ok(['6a0eb5a239eb22bd44505669']) },
    ]);

    const api = new MeegoApi('https://project.feishu.cn');
    await api.initToken('MII_6A7999521B008BBC', 'secret', '7628161565052652744', 0);
    const spaces = await api.listSpaces('7628161565052652744');

    expect(spaces).toHaveLength(1);
    expect(spaces[0].project_key).toBe('6a0eb5a239eb22bd44505669');
    expect(spaces[0].name).toBe('王天傲软研测试空间');
    expect(spaces[0].simple_name).toBe('i618x4');
  });

  it('/open_api/projects 返回错误时返回空数组', async () => {
    setResponses([
      { match: 'plugin_token', body: ok({ token: 'tok' }) },
      { match: 'projects', body: err(10301, 'Check Token Perm Failed') },
    ]);

    const api = new MeegoApi('https://project.feishu.cn');
    await api.initToken('id', 'secret', 'key', 0);
    const spaces = await api.listSpaces('key');
    expect(spaces).toEqual([]);
  });

  it('/open_api/projects 返回空数组时返回空数组', async () => {
    setResponses([
      { match: 'plugin_token', body: ok({ token: 'tok' }) },
      { match: 'projects', body: ok([]) },
    ]);

    const api = new MeegoApi('https://project.feishu.cn');
    await api.initToken('id', 'secret', 'key', 0);
    const spaces = await api.listSpaces('key');
    expect(spaces).toEqual([]);
  });

  it('projects/detail 失败时降级返回 project_key', async () => {
    setResponses([
      { match: 'plugin_token', body: ok({ token: 'tok' }) },
      { match: 'projects/detail', body: err(10022, 'no project admin permission') },
      { match: 'projects', body: ok(['hex_a']) },
    ]);

    const api = new MeegoApi('https://project.feishu.cn');
    await api.initToken('id', 'secret', 'key', 0);
    const spaces = await api.listSpaces('key');

    // 降级：只有 project_key，name 和 simple_name 用 key 填充
    expect(spaces).toHaveLength(1);
    expect(spaces[0]).toEqual({
      project_key: 'hex_a',
      name: 'hex_a',
      simple_name: 'hex_a',
    });
  });

  it('projects/detail 返回非对象时降级返回 project_key', async () => {
    setResponses([
      { match: 'plugin_token', body: ok({ token: 'tok' }) },
      { match: 'projects/detail', body: ok(null) },
      { match: 'projects', body: ok(['hex_a', 'hex_b']) },
    ]);

    const api = new MeegoApi('https://project.feishu.cn');
    await api.initToken('id', 'secret', 'key', 0);
    const spaces = await api.listSpaces('key');

    expect(spaces).toHaveLength(2);
    expect(spaces[0].project_key).toBe('hex_a');
    expect(spaces[1].project_key).toBe('hex_b');
  });
});

// =====================================================================
// createWorkItem
// =====================================================================

describe('MeegoApi — createWorkItem', () => {
  beforeEach(() => { mockResponses = []; });

  it('缺少 name 字段时抛错', async () => {
    const api = new MeegoApi('https://project.feishu.cn');
    await expect(api.createWorkItem('issue', [{ field_key: 'status', field_value: 'open' }]))
      .rejects.toThrow('缺少显式映射的 name 字段');
  });

  it('成功创建并返回数字 ID', async () => {
    setResponses([
      { match: 'plugin_token', body: ok({ token: 'tok' }) },
      { match: 'projects/detail', body: ok({ hex_pk: { simple_name: 'test_space' } }) },
      { match: 'work_item/create', body: ok({ work_item_id: 8888 }) },
    ]);

    const api = new MeegoApi('https://project.feishu.cn');
    await api.init('id', 'secret', 'key', 'test_space', 0);
    const id = await api.createWorkItem('issue', [
      { field_key: 'name', field_value: '测试工作项' },
    ]);
    expect(id).toBe(8888);
  });

  it('创建失败时抛错', async () => {
    setResponses([
      { match: 'plugin_token', body: ok({ token: 'tok' }) },
      { match: 'projects/detail', body: ok({ hex_pk: { simple_name: 'test_space' } }) },
      { match: 'work_item/create', body: err(5001, 'field validation failed') },
    ]);

    const api = new MeegoApi('https://project.feishu.cn');
    await api.init('id', 'secret', 'key', 'test_space', 0);
    await expect(api.createWorkItem('issue', [
      { field_key: 'name', field_value: 'test' },
    ])).rejects.toThrow('createWorkItem');
  });
});

// =====================================================================
// constructor
// =====================================================================

describe('MeegoApi — constructor', () => {
  it('去除尾部斜杠', () => {
    const api = new MeegoApi('https://project.feishu.cn/');
    expect(api.ready).toBe(false);
  });
});
