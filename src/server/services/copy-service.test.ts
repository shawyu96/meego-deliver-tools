import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// copy-service.ts 复制逻辑测试 — mock MeegoApi 验证字段映射与构建
// =====================================================================

// 共享 mock 实例引用
let mockInstance: any;

vi.mock('../services/meego-api.js', () => {
  return {
    MeegoApi: class {
      constructor() {
        return mockInstance;
      }
    },
  };
});

import { runCopy } from '../services/copy-service.js';
import { MeegoApi } from '../services/meego-api.js';
import type { CopyConfig } from '../../shared/types.js';

function makeBaseConfig(overrides: Partial<CopyConfig> = {}): CopyConfig {
  return {
    mode: 'A',
    auth: {
      plugin_id: 'MII_test',
      plugin_secret: 'secret_test',
      user_key: '700000000000000001',
      base_url: 'https://project.feishu.cn',
      token_type: 0,
    },
    space_key: 'test_space',
    source_work_item: { type: 'story', id: '1001' },
    source_node_id: 'node_1',
    source_item_ids: [1, 2],
    target_work_item: { type: 'story', id: '2002' },
    source_relation_id: 'rel_src',
    target_relation_id: 'rel_tgt',
    target_node_id: 'node_tgt',
    target_type_key: 'issue',
    field_mappings: [],
    concurrency: 1,
    ...overrides,
  };
}

describe('runCopy — 方向 A (子任务 → 子工作项)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInstance = {
      init: vi.fn().mockResolvedValue(undefined),
      getWorkflow: vi.fn(),
      getRawSubTaskDetails: vi.fn(),
      getCreateMeta: vi.fn().mockResolvedValue([]),
      createWorkItem: vi.fn(),
      linkWorkItemsToGroup: vi.fn(),
      ready: true,
      projectKey: 'hex_test',
    };
  });

  it('源节点不存在时抛错', async () => {
    mockInstance.getWorkflow = vi.fn().mockResolvedValue({ workflow_nodes: [] });
    const config = makeBaseConfig();
    await expect(runCopy(config)).rejects.toThrow('未找到源节点');
  });

  it('目标分组不存在时抛错', async () => {
    mockInstance.getWorkflow = vi.fn().mockResolvedValue({
      workflow_nodes: [
        {
          state_key: 'node_1',
          name: '源节点',
          node_sub_task_detail: [{ id: 1, name: '子任务1' }],
          node_sub_workitem_detail: [],
        },
        {
          state_key: 'node_tgt',
          name: '目标节点',
          node_sub_task_detail: [],
          node_sub_workitem_detail: [],
        },
      ],
    });
    mockInstance.getRawSubTaskDetails = vi.fn().mockResolvedValue([
      { builtin: { id: 1, name: '子任务1' }, custom: [] },
    ]);
    const config = makeBaseConfig();
    await expect(runCopy(config)).rejects.toThrow('未找到目标分组');
  });

  it('成功复制子任务为子工作项', async () => {
    mockInstance.getWorkflow = vi.fn().mockResolvedValue({
      workflow_nodes: [
        {
          state_key: 'node_1',
          name: '源节点',
          node_sub_task_detail: [{ id: 1, name: '子任务1' }],
          node_sub_workitem_detail: [],
        },
        {
          state_key: 'node_tgt',
          name: '目标节点',
          node_sub_task_detail: [],
          node_sub_workitem_detail: [{ relation_id: 'rel_tgt', sub_workitem_group_name: '目标分组', workitems: [] }],
        },
      ],
    });
    mockInstance.getRawSubTaskDetails = vi.fn().mockResolvedValue([
      { builtin: { id: 1, name: '子任务1', details: '描述内容' }, custom: [] },
    ]);
    mockInstance.getCreateMeta = vi.fn().mockResolvedValue([
      { field_key: 'name', field_type_key: 'text' },
      { field_key: 'description', field_type_key: 'text' },
    ]);
    mockInstance.createWorkItem = vi.fn().mockResolvedValue(9999);
    mockInstance.linkWorkItemsToGroup = vi.fn().mockResolvedValue(undefined);

    const config = makeBaseConfig({
      field_mappings: [
        { source_field: 'name', target_field: 'name', target_field_type: 'text', source_value: '{{from_source}}' },
        { source_field: 'description', target_field: 'description', target_field_type: 'text', source_value: '{{from_source}}' },
      ],
    });

    const result = await runCopy(config, () => {});

    expect(result.summary.total).toBe(1);
    expect(result.summary.ok).toBe(1);
    expect(result.summary.fail).toBe(0);
    expect(result.items[0].created_id).toBe(9999);
    expect(result.items[0].ok).toBe(true);

    // 验证 createWorkItem 被调用时传入了正确的 pairs
    expect(mockInstance.createWorkItem).toHaveBeenCalledWith('issue', expect.arrayContaining([
      expect.objectContaining({ field_key: 'name', field_value: '子任务1' }),
    ]));
    // 验证 linkWorkItemsToGroup 被调用
    expect(mockInstance.linkWorkItemsToGroup).toHaveBeenCalledWith('story', '2002', 'node_tgt', 'rel_tgt', [9999]);
  });

  it('字段映射同时包含源字段和固定值时报错', async () => {
    mockInstance.getWorkflow = vi.fn().mockResolvedValue({
      workflow_nodes: [
        {
          state_key: 'node_1',
          name: '源节点',
          node_sub_task_detail: [{ id: 1, name: '子任务1' }],
          node_sub_workitem_detail: [],
        },
        {
          state_key: 'node_tgt',
          name: '目标节点',
          node_sub_task_detail: [],
          node_sub_workitem_detail: [{ relation_id: 'rel_tgt', sub_workitem_group_name: '目标分组', workitems: [] }],
        },
      ],
    });
    mockInstance.getRawSubTaskDetails = vi.fn().mockResolvedValue([
      { builtin: { id: 1, name: '子任务1' }, custom: [] },
    ]);

    const config = makeBaseConfig({
      field_mappings: [
        { source_field: 'name', fixed_value: '固定值', target_field: 'name', target_field_type: 'text', source_value: '{{from_source}}' },
      ],
    });

    const result = await runCopy(config, () => {});
    // 错误被 catch，记为 fail
    expect(result.summary.fail).toBe(1);
    expect(result.items[0].error).toContain('同时包含源字段和固定值');
  });
});

describe('runCopy — 方向 B (子工作项 → 子任务)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInstance = {
      init: vi.fn().mockResolvedValue(undefined),
      getWorkflow: vi.fn(),
      getWorkItemDetail: vi.fn(),
      createSubTask: vi.fn(),
      ready: true,
    };
  });

  it('成功复制子工作项为子任务', async () => {
    mockInstance.getWorkflow = vi.fn().mockResolvedValue({
      workflow_nodes: [
        {
          state_key: 'node_1',
          name: '源节点',
          node_sub_task_detail: [],
          node_sub_workitem_detail: [
            { relation_id: 'rel_tgt', sub_workitem_group_name: '源分组', workitems: [10, 20] },
          ],
        },
        {
          state_key: 'node_tgt',
          name: '目标节点',
          node_sub_task_detail: [],
          node_sub_workitem_detail: [],
        },
      ],
    });
    mockInstance.getWorkItemDetail = vi.fn().mockResolvedValue([
      { id: 10, name: '工作项10', description: '描述10' },
      { id: 20, name: '工作项20', description: '描述20' },
    ]);
    mockInstance.createSubTask = vi.fn()
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(200);

    const config = makeBaseConfig({
      mode: 'B',
      source_item_ids: [10, 20],
      field_mappings: [
        { source_field: 'name', target_field: 'name', target_field_type: 'text', source_value: '{{from_source}}' },
        { source_field: 'description', target_field: 'description', target_field_type: 'text', source_value: '{{from_source}}' },
      ],
    });

    const result = await runCopy(config, () => {});

    expect(result.summary.total).toBe(2);
    expect(result.summary.ok).toBe(2);
    expect(result.items[0].created_id).toBe(100);
    expect(result.items[1].created_id).toBe(200);

    // 验证 createSubTask 调用参数
    expect(mockInstance.createSubTask).toHaveBeenCalledWith('story', '2002', 'node_tgt', expect.objectContaining({
      name: '工作项10',
    }));
  });

  it('源分组不存在时抛错', async () => {
    mockInstance.getWorkflow = vi.fn().mockResolvedValue({
      workflow_nodes: [{
        state_key: 'node_1',
        name: '源节点',
        node_sub_task_detail: [],
        node_sub_workitem_detail: [],
      }],
    });
    const config = makeBaseConfig({ mode: 'B' });
    await expect(runCopy(config)).rejects.toThrow('未找到源分组');
  });
});

describe('runCopy — 方向 C (层级复制)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInstance = {
      init: vi.fn().mockResolvedValue(undefined),
      listRelations: vi.fn().mockResolvedValue([]),
      getCreateMeta: vi.fn().mockResolvedValue([]),
      getWorkItemDetail: vi.fn(),
      createWorkItem: vi.fn(),
      linkWorkItemsToGroup: vi.fn(),
      getWorkflow: vi.fn(),
      ready: true,
    };
  });

  it('缺少 source_relation_id 时抛错', async () => {
    const config = makeBaseConfig({ mode: 'C', source_relation_id: '' });
    await expect(runCopy(config)).rejects.toThrow('C 模式需要同时选择源分组和目标分组');
  });

  it('缺少 source_item_ids 时抛错', async () => {
    const config = makeBaseConfig({ mode: 'C', source_item_ids: [] });
    await expect(runCopy(config)).rejects.toThrow('C 模式需要至少选择一个源子工作项');
  });

  it('成功执行单层复制', async () => {
    mockInstance.listRelations = vi.fn().mockResolvedValue([
      { id: 'rel_tgt', work_item_type_key: 'story', relation_details: [{ work_item_type_key: 'issue' }] },
    ]);
    mockInstance.getCreateMeta = vi.fn().mockResolvedValue([
      { field_key: 'name', field_type_key: 'text' },
    ]);
    mockInstance.getWorkItemDetail = vi.fn().mockResolvedValue([
      { id: 10, name: '源工作项10', work_item_type_key: 'story' },
    ]);
    mockInstance.createWorkItem = vi.fn().mockResolvedValue(5000);
    mockInstance.linkWorkItemsToGroup = vi.fn().mockResolvedValue(undefined);
    mockInstance.getWorkflow = vi.fn().mockResolvedValue({ workflow_nodes: [] });

    const config = makeBaseConfig({
      mode: 'C',
      source_item_ids: [10],
      hierarchy_depth: 1,
      field_mappings: [
        { source_field: 'name', target_field: 'name', target_field_type: 'text', source_value: '{{from_source}}' },
      ],
    });

    const result = await runCopy(config, () => {});

    expect(result.summary.total).toBe(1);
    expect(result.summary.ok).toBe(1);
    expect(result.items[0].created_id).toBe(5000);
  });
});

describe('runCopy — 未知方向', () => {
  it('抛出未知方向错误', async () => {
    mockInstance = {};
    const config = makeBaseConfig({ mode: 'X' as any });
    await expect(runCopy(config)).rejects.toThrow('未知复制方向');
  });
});
