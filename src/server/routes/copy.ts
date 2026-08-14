// =====================================================================
// 复制路由 — 生成字段映射模板 + 执行 A/B/C 复制
// =====================================================================

import { Router } from 'express';
import { createApiFromBody } from '../services/meego-api.js';
import { runCopy } from '../services/copy-service.js';
import { copyRecordRepo } from '../db/repositories.js';
import type { CopyConfig } from '../../shared/types.js';

const router = Router();

const SYSTEM_FIELDS = new Set([
  'id', 'created_at', 'updated_at', 'work_item_status', 'sub_stages',
  'template_id', 'project_key', 'children', 'ancestors', 'parent',
  'work_item_id', 'project_id', 'work_item_type_key', 'type_key',
  'relation_id', 'node_id', 'state_key', 'is_archived_state',
  'is_init_state', 'flow_type', 'sort', 'position', 'index',
  'owner', 'start_time', 'updated_by', 'auto_number', 'is_frozen',
  'template_version', 'archiving_date', 'archiving_status',
  'current_status_operator_role', 'abort_reason', 'abort_detail',
]);

function filterMetaForMapping(fields: any[], typeKey: string): any[] {
  if (typeKey === 'sub_task') return fields;
  return fields.filter((f: any) => !SYSTEM_FIELDS.has(f.field_key));
}

function getTemplateId(item: any): string {
  const id = item.template_id ?? item.workflow_template_id ?? item.flow_template_id ?? item.work_item_template_id;
  return id === undefined || id === null ? '' : String(id);
}

function getWorkItemId(item: any): number | null {
  const id = Number(item.id || item.work_item_id);
  return Number.isFinite(id) ? id : null;
}

function getItemType(item: any, fallback = ''): string {
  return String(item.work_item_type_key || item.type_key || item.type || fallback || '');
}

function isNodeFlowWorkItem(item: any): boolean {
  if (String(item.pattern || '').toLowerCase() === 'node') return true;
  if (Array.isArray(item.workflow_nodes) && item.workflow_nodes.length > 0) return true;
  return false;
}

async function getRelationWorkItemType(api: any, relationId: string, parentTypeKey: string): Promise<string | null> {
  if (!relationId) return null;
  try {
    const relations = await api.listRelations();
    const normalizeRelationId = (id: any) => String(id || '').split(':').pop();
    const targetId = String(relationId);
    const targetTail = normalizeRelationId(relationId);
    const relation = relations.find((r: any) => {
      const ids = [r.id, r.relation_id, r.relation_key].filter(Boolean);
      return ids.some((id: any) => String(id) === targetId || normalizeRelationId(id) === targetTail);
    });
    if (!relation) return null;
    const details = Array.isArray(relation.relation_details) ? relation.relation_details : [];
    if (relation.work_item_type_key === parentTypeKey) return details[0]?.work_item_type_key || null;
    const detail = details.find((d: any) => d.work_item_type_key !== parentTypeKey);
    return detail?.work_item_type_key || details[0]?.work_item_type_key || null;
  } catch { return null; }
}

/** 生成字段映射模板 */
router.post('/gen-mapping', async (req, res) => {
  try {
    const { source_work_item, source_node_id, source_item_ids, target_work_item, target_relation_id } = req.body;
    const api = await createApiFromBody(req.body);

    const sourceTypeKey = 'sub_task';
    let targetTypeKey = '';

    targetTypeKey = await getRelationWorkItemType(api, target_relation_id, target_work_item.type) || '';
      const wf = await api.getWorkflow(target_work_item.type, target_work_item.id);
      const groups = wf.workflow_nodes.flatMap((n: any) => n.node_sub_workitem_detail);
      const targetGroup = groups.find((g: any) => g.relation_id === target_relation_id);
      if (!targetTypeKey && targetGroup?.workitems?.length) {
      const sampleIds = targetGroup.workitems.slice(0, 12);
      const details = await api.getWorkItemDetail(target_work_item.type, sampleIds);
        const typeCounts: Record<string, number> = {};
        for (const d of details) {
        const tk = d.work_item_type_key || d.type_key || 'issue';
        typeCounts[tk] = (typeCounts[tk] || 0) + 1;
          }
          targetTypeKey = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || targetTypeKey;
        }
        targetTypeKey = targetTypeKey || 'issue';

    // 源 meta
    let sourceMeta: any[] = [];
    let targetMeta: any[] = [];

    {
      const rawDetails = await api.getRawSubTaskDetails(source_work_item.type, source_work_item.id, source_node_id);
      const selectedIds = new Set((source_item_ids || []).map((id: any) => String(id)));
      const samples = rawDetails.filter((st: any) => selectedIds.has(String(st.builtin.id)));
      if (!samples.length && rawDetails.length) samples.push(rawDetails[0]);

      const has = (read: (st: any) => any) => samples.some((st: any) => {
        const value = read(st);
        return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== '';
      });
      const selected = samples[0];
      const push = (field_key: string, field_name: string, field_type_key: string, read: (st: any) => any) => {
        if (!has(read)) return;
        const builtin = selected.builtin;
        let source_value: any;
        switch (field_key) {
          case 'name': source_value = builtin.name; break;
          case 'details': source_value = builtin.details; break;
          case 'note': source_value = builtin.note; break;
          case 'owners': source_value = builtin.owners || builtin.assignee; break;
          case 'schedule': source_value = builtin.schedules?.[0]; break;
          case 'schedules_points': source_value = builtin.schedules?.[0]?.points; break;
          case 'actual_begin_time': source_value = builtin.actual_begin_time; break;
          case 'actual_finish_time': source_value = builtin.actual_finish_time; break;
          case 'actual_work_time': source_value = builtin.actual_work_time; break;
          case 'work_item_status': source_value = builtin.passed ? 'done' : 'unfinished'; break;
          default: source_value = '';
        }
        sourceMeta.push({ field_key, field_name, field_alias: field_name, field_type_key, source_value });
      };

      push('name', '名称', 'text', (st) => st.builtin.name);
      push('details', '详情', 'multi_text', (st) => st.builtin.details);
      push('note', '备注', 'multi_text', (st) => st.builtin.note);
      push('owners', '负责人', 'multi_user', (st) => st.builtin.owners || st.builtin.assignee);
      push('schedule', '排期', 'schedule', (st) => st.builtin.schedules?.[0]);
      push('schedules_points', '估分', 'number', (st) => st.builtin.schedules?.[0]?.points);
      push('actual_begin_time', '实际开始时间', 'date', (st) => st.builtin.actual_begin_time);
      push('actual_finish_time', '实际完成时间', 'date', (st) => st.builtin.actual_finish_time);
      push('actual_work_time', '实际工时', 'number', (st) => st.builtin.actual_work_time);
      push('work_item_status', '完成状态', 'bool', (st) => st.builtin.passed);

      // 角色
      const roles = new Map<string, any>();
      for (const st of samples) {
        for (const roleItem of st.builtin.role_assignee || []) {
          const role = String(roleItem.role || '').trim();
          if (role && !roles.has(role)) roles.set(role, roleItem);
        }
      }
      for (const [role, roleItem] of roles) {
        sourceMeta.push({
          field_key: `role_assignee:${role}`, field_name: roleItem.name || role,
          field_alias: roleItem.name || role, field_type_key: 'multi_user',
          is_role_source: true, source_base_field: 'role_assignee', source_role: role,
          source_role_name: roleItem.name || role,
        });
      }

      // 自定义字段
      const customFields = new Map<string, any>();
      for (const st of samples) {
        for (const field of st.custom || []) {
          const key = field.field_key || field.field_alias;
          if (key && !customFields.has(key)) customFields.set(key, field);
        }
      }
      for (const field of customFields.values()) {
        const key = field.field_key || field.field_alias;
        sourceMeta.push({
          field_key: key, field_name: field.field_name || field.field_alias || key,
          field_alias: field.field_alias, field_type_key: field.field_type_key || 'text',
          options: field.options || field.field_options, source_value: field.field_value ?? '',
        });
      }

      sourceMeta = filterMetaForMapping(sourceMeta, sourceTypeKey);
      const targetMetaRaw = await api.getCreateMeta(targetTypeKey).catch(() => []);
      targetMeta = filterMetaForMapping(targetMetaRaw, targetTypeKey);
    }

      res.json({
        ok: true,
        data: {
      mode: 'A', source_type_key: sourceTypeKey, target_type_key: targetTypeKey,
        source_meta: sourceMeta, target_meta: targetMeta,
        field_mappings: [],
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 执行复制（仅支持方向 A：子任务→子工作项） */
router.post('/execute', async (req, res) => {
  try {
    const copyConfig = req.body as CopyConfig;

    // 写入数据库记录
    const record = copyRecordRepo.create({
      mode: copyConfig.mode,
      sourceType: copyConfig.source_work_item.type,
      sourceWorkItemId: copyConfig.source_work_item.id,
      sourceNodeId: copyConfig.source_node_id || null,
      targetType: copyConfig.target_type_key || null,
      targetWorkItemId: copyConfig.target_work_item?.id || null,
      targetNodeId: copyConfig.target_node_id || null,
      targetRelationId: copyConfig.target_relation_id || null,
      fieldMappings: copyConfig.field_mappings || [],
      status: 'running',
    });

    const logs: string[] = [];
    const result = await runCopy(copyConfig, (msg) => {
      logs.push(msg);
      console.log(msg);
    });

    copyRecordRepo.update(record.id, {
      status: result.summary.fail > 0 ? 'done' : 'done',
      total: result.summary.total,
      ok: result.summary.ok,
      fail: result.summary.fail,
      result,
    });

    res.json({ ok: true, data: { ...result, recordId: record.id, logs } });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 查询历史复制记录 */
router.get('/records', (_req, res) => {
  try {
    const records = copyRecordRepo.list(50);
    res.json({ ok: true, data: records });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 查询单条复制记录 */
router.get('/records/:id', (req, res) => {
  try {
    const record = copyRecordRepo.getById(Number(req.params.id));
    if (!record) return res.status(404).json({ ok: false, error: '记录不存在' });
    res.json({ ok: true, data: record });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

export default router;
