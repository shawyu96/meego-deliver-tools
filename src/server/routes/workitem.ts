// =====================================================================
// 工作项路由 — 搜索、详情、workflow、子任务、类型、meta
// =====================================================================

import { Router } from 'express';
import { createApiFromBody } from '../services/meego-api.js';

const router = Router();

/** 查询工作流详情 */
router.post('/workflow', async (req, res) => {
  try {
    const { wi_type, wi_id } = req.body;
    if (!wi_type || !wi_id) return res.status(400).json({ ok: false, error: '缺少必填字段: wi_type, wi_id' });
    const api = await createApiFromBody(req.body);
    const wf = await api.getWorkflow(wi_type, wi_id);
    if (!Array.isArray(wf.workflow_nodes) || wf.workflow_nodes.length === 0) {
      throw new Error('当前工具仅支持节点流工作项：该工作项没有可用的节点流 workflow_nodes');
    }
    res.json({ ok: true, data: wf });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 获取节点子任务列表（含 rawDetails 自定义字段） */
router.post('/subtasks', async (req, res) => {
  try {
    const { wi_type, wi_id, node_id } = req.body;
    if (!wi_type || !wi_id || !node_id) return res.status(400).json({ ok: false, error: '缺少必填字段: wi_type, wi_id, node_id' });
    const api = await createApiFromBody(req.body);
    const subtasks = await api.getSubTasks(wi_type, wi_id, node_id);
    const rawDetails = await api.getRawSubTaskDetails(wi_type, wi_id, node_id);
    res.json({ ok: true, data: { subtasks, rawDetails } });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 搜索工作项（filter 接口，跨类型关键词搜索） */
router.post('/search', async (req, res) => {
  try {
    const { keyword, type_keys, page, page_size, work_item_ids } = req.body;
    const api = await createApiFromBody(req.body);

    let types = type_keys || [];
    if (!types.length) {
      const allTypes = await api.listTypes().catch(() => []);
      types = allTypes.filter((t: any) => !t.is_disable).map((t: any) => t.type_key);
      if (!types.length) types = ['story', 'issue', 'sub_task', 'task', 'epic'];
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const pageSize = Math.max(1, Math.min(Number(page_size) || 20, 100));

    function parseWorkItemIds(value: any): number[] {
      if (value === undefined || value === null || value === '') return [];
      const list = Array.isArray(value) ? value : String(value).split(/[,\s，]+/);
      return Array.from(new Set(list.map((item: any) => Number(item)).filter(Number.isFinite)));
    }

    const searchIds = parseWorkItemIds(work_item_ids);
    const items = await api.searchWorkItemsFilter(keyword || '', types, pageNum, pageSize, searchIds);
    res.json({ ok: true, data: { items, page: pageNum, page_size: pageSize } });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 查询工作项详情 */
router.post('/detail', async (req, res) => {
  try {
    const { wi_type, wi_ids } = req.body;
    if (!wi_type || !wi_ids) return res.status(400).json({ ok: false, error: '缺少必填字段: wi_type, wi_ids' });
    const api = await createApiFromBody(req.body);
    const details = await api.getWorkItemDetail(wi_type, wi_ids);
    res.json({ ok: true, data: details });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 获取所有工作项类型 */
router.post('/types', async (req, res) => {
  try {
    const api = await createApiFromBody(req.body);
    const types = await api.listTypes();
    res.json({ ok: true, data: types });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 获取类型创建 meta 字段 */
router.post('/meta', async (req, res) => {
  try {
    const { type_key } = req.body;
    if (!type_key) return res.status(400).json({ ok: false, error: '缺少必填字段: type_key' });
    const api = await createApiFromBody(req.body);
    const meta = await api.getCreateMeta(type_key);
    res.json({ ok: true, data: meta });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 获取空间关联关系定义 */
router.post('/relations', async (req, res) => {
  try {
    const api = await createApiFromBody(req.body);
    const relations = await api.listRelations();
    res.json({ ok: true, data: relations });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 获取类型所有字段 */
router.post('/fields', async (req, res) => {
  try {
    const { type_key } = req.body;
    if (!type_key) return res.status(400).json({ ok: false, error: '缺少必填字段: type_key' });
    const api = await createApiFromBody(req.body);
    const fields = await api.getAllFields(type_key);
    res.json({ ok: true, data: fields });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

export default router;
