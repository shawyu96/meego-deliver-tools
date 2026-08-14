// =====================================================================
// 复制服务 — 从 copy-a/b/c.ts 迁移，统一入口
// =====================================================================

import type { CopyConfig, CopyResult, ItemResult, FieldMapping } from '../../shared/types.js';
import { MeegoApi } from './meego-api.js';
import {
  getFieldValue,
  normalizeOwners,
  parseMaybeJson,
  normalizeSchedule,
  normalizeOptionId,
  normalizeOptionIdList,
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
      default: return getFieldValue(subtask.custom, fieldKey) ?? builtin[fieldKey] ?? '';
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
    default: return getFieldValue((subtask as any).fields, fieldKey) ?? (subtask as any)[fieldKey] ?? '';
  }
}

function getWiValue(wi: any, fieldKey: string): any {
  if (fieldKey.startsWith('role_owners:')) {
    const role = fieldKey.slice('role_owners:'.length);
    const roleField = (wi?.fields || []).find((f: any) => f.field_key === 'role_owners');
    const roleOwners = Array.isArray(roleField?.field_value) ? roleField.field_value : [];
    return roleOwners.find((item: any) => String(item.role) === role)?.owners || [];
  }
  const field = (wi?.fields || []).find((f: any) => f.field_key === fieldKey || f.field_alias === fieldKey);
  if (field && field.field_value !== undefined) return field.field_value;
  switch (fieldKey) {
    case 'name': return wi.name || '';
    case 'owner': return wi.owner?.user_key || wi.owner?.key || wi.owner || '';
    case 'description': return wi.description || '';
    case 'priority_level': return wi.priority_level || wi.priority || '';
    case 'work_item_status': return wi.work_item_status || wi.status || '';
    default: return wi?.[fieldKey] ?? '';
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

function buildPairsFromWi(wi: any, mappings: FieldMapping[], targetMeta: TargetMetaMap): { field_key: string; field_value: any }[] {
  const pairs: { field_key: string; field_value: any }[] = [];
  const roleOwners: { role: string; owners: string[] }[] = [];
  for (const m of mappings || []) {
    if (!m.target_field) continue;
    if (m.source_field && m.fixed_value) throw new Error(`字段映射 ${m.target_field} 同时包含源字段和固定值`);
    const targetField = m.target_base_field || (m.target_field.startsWith('role_owners:') ? 'role_owners' : m.target_field);
    const targetRole = m.target_role || (m.target_field.startsWith('role_owners:') ? m.target_field.slice('role_owners:'.length) : '');
    let value: any;
    if (m.fixed_value) value = m.fixed_value;
    else if (m.source_value === '{{from_source}}' && m.source_field) value = getWiValue(wi, m.source_field);
    else if (m.source_value && m.source_value !== '{{from_source}}') value = m.source_value;
    if (value === undefined || value === null || value === '') continue;
    if (targetField === 'role_owners' && targetRole) {
      const owners = normalizeOwners(value);
      if (owners.length) roleOwners.push({ role: targetRole, owners });
      continue;
    }
    const fieldType = m.target_field_type || targetMeta.get(targetField)?.field_type_key || '';
    const fieldValue = serializeFieldValue(fieldType, value);
    if (fieldValue !== null) pairs.push({ field_key: targetField, field_value: fieldValue });
  }
  if (roleOwners.length) pairs.push({ field_key: 'role_owners', field_value: roleOwners });
  return pairs;
}

/* ---------- 子任务 payload 构建（方向 B） ---------- */

function applySubTaskPayloadField(payload: Record<string, any>, targetField: string, value: any) {
  if (value === undefined || value === null || value === '') return;
  const toFieldValue = (v: any) => typeof v === 'string' ? v : (v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
  switch (targetField) {
    case 'name': payload.name = String(value); break;
    case 'owner': case 'owners': case 'current_status_operator':
      payload.owner = Array.isArray(value) ? value[0] : value; break;
    case 'description': case 'details': payload.details = String(value); break;
    case 'note': payload.note = String(value); break;
    case 'passed': payload.passed = value; break;
    case 'points': case 'schedules_points':
      payload.schedules = [{ ...(payload.schedules?.[0] || {}), points: Number(value) || 0 }]; break;
    case 'actual_begin_time': case 'actual_finish_time': payload[targetField] = value; break;
    default:
      if (!payload.fields) payload.fields = [];
      payload.fields.push({ field_key: targetField, field_value: toFieldValue(value) });
      break;
  }
}

function buildSubTaskPayload(wi: any, config: CopyConfig): Record<string, any> {
  const payload: Record<string, any> = {};
  for (const m of config.field_mappings || []) {
    if (!m.target_field) continue;
    if (m.source_field && m.fixed_value) throw new Error(`字段映射 ${m.target_field} 同时包含源字段和固定值`);
    let value: any;
    if (m.fixed_value) value = m.fixed_value;
    else if (m.source_value === '{{from_source}}' && m.source_field) value = getWiValue(wi, m.source_field);
    else if (m.source_value && m.source_value !== '{{from_source}}') value = m.source_value;
    applySubTaskPayloadField(payload, m.target_field, value);
  }
  return payload;
}

/* ---------- 关联类型推断 ---------- */

async function inferRelationChildType(api: MeegoApi, relationId: string, parentTypeKey: string): Promise<string | null> {
  const relations = await api.listRelations().catch(() => []);
  const tail = (id: any) => String(id || '').split(':').pop();
  const relation = relations.find((r: any) => {
    const ids = [r.id, r.relation_id, r.relation_key].filter(Boolean);
    return ids.some((id: any) => String(id) === String(relationId) || tail(id) === tail(relationId));
  });
  const details = Array.isArray(relation?.relation_details) ? relation.relation_details : [];
  if (!details.length) return null;
  if (relation?.work_item_type_key === parentTypeKey) return details[0]?.work_item_type_key || null;
  return details.find((d: any) => d.work_item_type_key !== parentTypeKey)?.work_item_type_key || details[0]?.work_item_type_key || null;
}

function itemType(item: any, fallback: string): string {
  return item?.work_item_type_key || item?.type_key || item?.type || fallback;
}
function itemId(item: any): number {
  return Number(item?.id || item?.work_item_id);
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

/* ======================== 方向 B ======================== */

export async function runCopyB(config: CopyConfig, onProgress?: (msg: string) => void): Promise<CopyResult> {
  const log = onProgress || (() => {});
  const result: CopyResult = { items: [], summary: { total: 0, ok: 0, fail: 0 } };
  const baseUrl = config.auth.base_url || 'https://project.feishu.cn';
  const api = new MeegoApi(baseUrl);
  log('初始化 API...');
  await api.init(config.auth.plugin_id, config.auth.plugin_secret, config.auth.user_key, config.space_key, config.auth.token_type);

  log(`获取源工作项 workflow: ${config.source_work_item.type}/${config.source_work_item.id}`);
  const wf = await api.getWorkflow(config.source_work_item.type, config.source_work_item.id);
  const groups = wf.workflow_nodes.flatMap((n) => n.node_sub_workitem_detail);
  const sourceGroup = groups.find((g) => g.relation_id === config.target_relation_id);
  if (!sourceGroup) throw new Error(`未找到源分组 relation_id=${config.target_relation_id}`);

  const wiIds = sourceGroup.workitems.filter((id) => config.source_item_ids.includes(id));
  if (!wiIds.length) throw new Error('未找到匹配的源子工作项');

  log(`反查 ${wiIds.length} 条子工作项详情...`);
  const details = await api.getWorkItemDetail(config.source_work_item.type, wiIds);
  const detailMap = new Map<number, any>();
  for (const d of details) detailMap.set(Number(d.id || d.work_item_id), d);

  const targetWf = await api.getWorkflow(config.target_work_item.type, config.target_work_item.id);
  const targetNode = targetWf.workflow_nodes.find((n) => n.state_key === config.target_node_id);
  if (!targetNode) throw new Error(`未找到目标节点 ${config.target_node_id}`);

  result.summary.total = wiIds.length;
  for (const wiId of wiIds) {
    const wi = detailMap.get(wiId);
    const name = wi?.name || `#${wiId}`;
    const item: ItemResult = { source_id: wiId, source_name: name, ok: false, strategy: 'copy_sub_workitem_as_sub_task' };
    try {
      log(`  [${wiId}] ${name}`);
      const payload = buildSubTaskPayload(wi, config);
      if (!payload.name || !String(payload.name).trim()) throw new Error('createSubTask 失败: 缺少 name');
      const newId = await api.createSubTask(config.target_work_item.type, config.target_work_item.id, config.target_node_id!, payload);
      log(`    创建子任务: id=${newId}`);
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

/* ======================== 方向 C ======================== */

export async function runCopyC(config: CopyConfig, onProgress?: (msg: string) => void): Promise<CopyResult> {
  const log = onProgress || (() => {});
  const result: CopyResult = { items: [], summary: { total: 0, ok: 0, fail: 0 } };
  const depthLimit = Math.max(1, Math.min(Number(config.hierarchy_depth || 1), 3));
  const sourceRelationId = config.source_relation_id || '';
  const targetRelationId = config.target_relation_id || '';
  if (!sourceRelationId || !targetRelationId) throw new Error('C 模式需要同时选择源分组和目标分组');
  if (!config.source_item_ids?.length) throw new Error('C 模式需要至少选择一个源子工作项');

  const api = new MeegoApi(config.auth.base_url || 'https://project.feishu.cn');
  log('初始化 API...');
  await api.init(config.auth.plugin_id, config.auth.plugin_secret, config.auth.user_key, config.space_key, config.auth.token_type);

  const rootTargetType = config.target_type_key || await inferRelationChildType(api, targetRelationId, config.target_work_item.type) || 'issue';
  const rootTargetMeta = new Map((await api.getCreateMeta(rootTargetType).catch(() => [])).map((f: any) => [String(f.field_key), f]));
  const rootDetails = await api.getWorkItemDetail(config.source_work_item.type, config.source_item_ids.map(Number));
  const rootMap = new Map(rootDetails.map((item) => [itemId(item), item]));

  async function copyOne(source: any, targetParent: { type: string; id: string }, relationId: string, targetNodeId: string, level: number, targetType: string): Promise<number | null> {
    const sourceId = itemId(source);
    const sourceName = source?.name || `#${sourceId}`;
    const item: ItemResult = { source_id: sourceId, source_name: sourceName, ok: false, strategy: 'copy_sub_workitem_hierarchy' };
    result.summary.total++;
    try {
      const targetMeta = targetType === rootTargetType ? rootTargetMeta : new Map((await api.getCreateMeta(targetType).catch(() => [])).map((f: any) => [String(f.field_key), f]));
      const pairs = buildPairsFromWi(source, config.field_mappings, targetMeta);
      const newId = await api.createWorkItem(targetType, pairs);
      await api.linkWorkItemsToGroup(targetParent.type, targetParent.id, targetNodeId, relationId, [newId]);
      item.created_id = newId; item.ok = true; result.summary.ok++;
      result.items.push(item);
      log(`  L${level} [${sourceId}] ${sourceName} -> ${newId}`);
      return newId;
    } catch (e: any) {
      item.error = e.message || String(e); result.summary.fail++;
      result.items.push(item);
      log(`  L${level} [${sourceId}] ${sourceName} ✘ ${item.error}`);
      return null;
    }
  }

  async function walk(source: any, targetParent: { type: string; id: string }, relationId: string, targetNodeId: string, level: number, targetType: string) {
    const newId = await copyOne(source, targetParent, relationId, targetNodeId, level, targetType);
    if (!newId || level >= depthLimit) return;
    const sourceType = itemType(source, targetType);
    const sourceWorkItemId = String(itemId(source));
    const targetChildParent = { type: targetType, id: String(newId) };
    const sourceWf = await api.getWorkflow(sourceType, sourceWorkItemId).catch(() => null);
    const targetWf = await api.getWorkflow(targetType, String(newId)).catch(() => null);
    if (!sourceWf || !targetWf) return;
    for (const sourceGroup of sourceWf.workflow_nodes.flatMap((n: any) => (n.node_sub_workitem_detail || []).map((g: any) => ({ ...g, node_id: n.state_key })))) {
      const childIds = (sourceGroup.workitems || []).map(Number).filter(Boolean);
      if (!childIds.length) continue;
      const targetGroup = targetWf.workflow_nodes
        .flatMap((n: any) => (n.node_sub_workitem_detail || []).map((g: any) => ({ ...g, node_id: n.state_key })))
        .find((g: any) => g.relation_id === sourceGroup.relation_id || g.sub_workitem_group_name === sourceGroup.sub_workitem_group_name);
      if (!targetGroup) { log(`  L${level + 1} 跳过分组: 目标无对应分组`); continue; }
      const childTargetType = await inferRelationChildType(api, targetGroup.relation_id, targetType) || targetType;
      const children = await api.getWorkItemDetail(sourceType, childIds);
      for (const child of children) await walk(child, targetChildParent, targetGroup.relation_id, targetGroup.node_id, level + 1, childTargetType);
    }
  }

  log(`C 模式层级复制: 根 ${config.source_item_ids.length} 个，深度 ${depthLimit}`);
  for (const sourceId of config.source_item_ids.map(Number)) {
    const source = rootMap.get(sourceId);
    if (!source) {
      result.summary.total++; result.summary.fail++;
      result.items.push({ source_id: sourceId, source_name: `#${sourceId}`, ok: false, strategy: 'copy_sub_workitem_hierarchy_failed', error: '未查询到源工作项详情' });
      continue;
    }
    await walk(source, config.target_work_item, targetRelationId, config.target_node_id || config.source_node_id, 1, rootTargetType);
  }
  log(`\n完成: 总 ${result.summary.total}, 成功 ${result.summary.ok}, 失败 ${result.summary.fail}`);
  return result;
}

/* ---------- 统一入口 ---------- */

export async function runCopy(config: CopyConfig, onProgress?: (msg: string) => void): Promise<CopyResult> {
  switch (config.mode) {
    case 'A': return runCopyA(config, onProgress);
    case 'B': return runCopyB(config, onProgress);
    case 'C': return runCopyC(config, onProgress);
    default: throw new Error(`未知复制方向: ${config.mode}`);
  }
}
