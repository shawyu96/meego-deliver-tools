// =====================================================================
// 复制服务 — 子任务 → 子工作项分组（方向 A）
// =====================================================================

import type { CopyConfig, CopyResult, ItemResult } from '../../shared/types.js';
import { MeegoApi } from './meego-api.js';
import {
  normalizeOwners,
  serializeFieldValue,
} from './field-utils.js';

type TargetMetaMap = Map<string, any>;

/* ---------- 源值提取 ---------- */

type SubTaskSource = { id: number; name: string; [k: string]: any } | { builtin: any; custom: any[] };

function getSubTaskValue(subtask: SubTaskSource, fieldKey: string): any {
  if ('builtin' in subtask) {
    const builtin = subtask.builtin || {};
    if (fieldKey.startsWith('role_assignee:')) {
      const role = fieldKey.slice('role_assignee:'.length);
      const item = (builtin.role_assignee || []).find((r: any) => String(r.role) === role);
      return item?.owners || [];
    }
    switch (fieldKey) {
      case 'name': return builtin.name || '';
      case 'owners': case 'assignee': case 'current_status_operator': return builtin.owners || builtin.assignee || [];
      case 'owner': return builtin.owner || builtin.created_by || '';
      case 'description': case 'details': return builtin.details || '';
      case 'passed': case 'work_item_status': return builtin.passed ?? '';
      case 'note': return builtin.note || '';
      case 'points': case 'schedules_points': return builtin.schedules?.[0]?.points ?? 0;
      case 'schedule': case 'schedules': case 'sub_task_schedule': return builtin.schedules?.[0] || '';
      case 'actual_begin_time': return builtin.actual_begin_time || '';
      case 'actual_finish_time': return builtin.actual_finish_time || '';
      case 'actual_work_time': return builtin.actual_work_time || '';
      case 'order': return builtin.order ?? '';
      case 'owner_roles': return builtin.owner_roles || [];
      case 'owner_usage_mode': return builtin.owner_usage_mode ?? '';
      default: {
        const custom = (subtask as any).custom;
        if (Array.isArray(custom)) {
          const f = custom.find((c: any) => c.field_key === fieldKey || c.field_alias === fieldKey);
          if (f?.field_value !== undefined) return f.field_value;
        }
        return builtin[fieldKey] ?? '';
      }
    }
  }
  switch (fieldKey) {
    case 'name': return subtask.name;
    case 'owners': return (subtask as any).owner || (subtask as any).owners || '';
    case 'owner': return (subtask as any).created_by || '';
    case 'description': case 'details': return (subtask as any).description || (subtask as any).details || '';
    case 'priority': return (subtask as any).priority || '';
    case 'passed': return (subtask as any).passed ?? '';
    case 'note': return (subtask as any).note || '';
    case 'schedules_points': return (subtask as any).schedules_points ?? 0;
    default: return (subtask as any)[fieldKey] ?? '';
  }
}

/* ---------- 构建字段映射 ---------- */

function buildPairsFromSubTask(subtask: SubTaskSource, config: CopyConfig, targetMeta: TargetMetaMap): { field_key: string; field_value: any }[] {
  const pairs: { field_key: string; field_value: any }[] = [];
  const roleOwners: { role: string; owners: string[] }[] = [];
  for (const m of config.field_mappings) {
    if (!m.target_field) continue;
    if (m.source_field && m.fixed_value) throw new Error(`字段映射 ${m.target_field} 同时包含源字段和固定值`);
    const targetField = m.target_base_field || (m.target_field.startsWith('role_owners:') ? 'role_owners' : m.target_field);
    const targetRole = m.target_role || (m.target_field.startsWith('role_owners:') ? m.target_field.slice('role_owners:'.length) : '');
    let value: any;
    if (m.fixed_value) value = m.fixed_value;
    else if (m.source_value === '{{from_source}}' && m.source_field) value = getSubTaskValue(subtask, m.source_field);
    else if (m.source_value && m.source_value !== '{{from_source}}') value = m.source_value;
    if (value === undefined || value === null || value === '') continue;
    if (targetField === 'role_owners' && targetRole) {
      const owners = normalizeOwners(value);
      if (owners.length) roleOwners.push({ role: targetRole, owners });
    } else {
      const fieldType = m.target_field_type || targetMeta.get(targetField)?.field_type_key || '';
      const fieldValue = serializeFieldValue(fieldType, value);
      if (fieldValue !== null) pairs.push({ field_key: targetField, field_value: fieldValue });
    }
  }
  if (roleOwners.length) pairs.push({ field_key: 'role_owners', field_value: roleOwners });
  return pairs;
}

/* ======================== 方向 A ======================== */

export async function runCopyA(config: CopyConfig, onProgress?: (msg: string) => void): Promise<CopyResult> {
  const log = onProgress || (() => {});
  const result: CopyResult = { items: [], summary: { total: 0, ok: 0, fail: 0 } };
  const baseUrl = config.auth.base_url || 'https://project.feishu.cn';
  const api = new MeegoApi(baseUrl);
  log('初始化 API...');
  await api.init(config.auth.plugin_id, config.auth.plugin_secret, config.auth.user_key, config.space_key, config.auth.token_type);

  log(`获取源工作项 workflow: ${config.source_work_item.type}/${config.source_work_item.id}`);
  const wf = await api.getWorkflow(config.source_work_item.type, config.source_work_item.id);
  const sourceNode = wf.workflow_nodes.find((n) => n.state_key === config.source_node_id);
  if (!sourceNode) throw new Error(`未找到源节点 ${config.source_node_id}`);

  const rawDetails = await api.getRawSubTaskDetails(config.source_work_item.type, config.source_work_item.id, config.source_node_id);
  const rawMap = new Map(rawDetails.map((st: any) => [Number(st.builtin.id), st]));
  const fallbackMap = new Map(sourceNode.node_sub_task_detail.map((s) => [Number(s.id), s]));
  const subtasks = config.source_item_ids.map((id) => rawMap.get(Number(id)) || fallbackMap.get(Number(id))).filter(Boolean) as SubTaskSource[];
  if (!subtasks.length) throw new Error('未找到匹配的源子任务');

  log(`找到 ${subtasks.length} 条子任务待复制`);
  const targetWf = await api.getWorkflow(config.target_work_item.type, config.target_work_item.id);
  const targetGroups = targetWf.workflow_nodes.flatMap((n) => n.node_sub_workitem_detail);
  const targetGroup = targetGroups.find((g) => g.relation_id === config.target_relation_id);
  if (!targetGroup) throw new Error(`未找到目标分组 relation_id=${config.target_relation_id}`);
  const targetNodeId = config.target_node_id || config.source_node_id;

  const targetTypeKey = config.target_type_key || 'issue';
  const targetCreateMeta = await api.getCreateMeta(targetTypeKey).catch(() => []);
  const targetMeta = new Map(targetCreateMeta.map((f: any) => [String(f.field_key), f]));

  result.summary.total = subtasks.length;
  for (const subtask of subtasks) {
    const subtaskId = Number('builtin' in subtask ? subtask.builtin.id : subtask.id);
    const subtaskName = String('builtin' in subtask ? subtask.builtin.name : subtask.name);
    const item: ItemResult = { source_id: subtaskId, source_name: subtaskName, ok: false, strategy: 'copy_subtask_as_sub_workitem' };
    try {
      log(`  [${subtaskId}] ${subtaskName}`);
      const pairs = buildPairsFromSubTask(subtask, config, targetMeta);
      const newId = await api.createWorkItem(targetTypeKey, pairs);
      log(`    创建实例: id=${newId}`);
      await api.linkWorkItemsToGroup(config.target_work_item.type, config.target_work_item.id, targetNodeId, config.target_relation_id!, [newId]);
      log(`    关联分组: ✔`);
      item.created_id = newId; item.ok = true; result.summary.ok++;
    } catch (e: any) {
      item.error = e.message || String(e); result.summary.fail++;
      log(`    ✘ 失败: ${item.error}`);
    }
    result.items.push(item);
  }
  log(`\n完成: 总 ${result.summary.total}, 成功 ${result.summary.ok}, 失败 ${result.summary.fail}`);
  return result;
}

/* ---------- 统一入口 ---------- */

export async function runCopy(config: CopyConfig, onProgress?: (msg: string) => void): Promise<CopyResult> {
  if (config.mode !== 'A') throw new Error(`不支持的方向: ${config.mode}，仅支持 A（子任务→子工作项）`);
  return runCopyA(config, onProgress);
}
