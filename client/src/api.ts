// =====================================================================
// 前端 API 封装 — 统一 fetch 调用
// =====================================================================

export async function api<T = any>(path: string, body?: any): Promise<T> {
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  if (data.ok === false) throw new Error(data.error || '请求失败');
  return data.data ?? data;
}

// ======================== 配置 ========================

export function getConfig() {
  return api('/api/auth/config');
}

// ======================== 工作项 ========================

export function getWorkflow(params: {
  base_url?: string; plugin_id?: string; plugin_secret?: string;
  user_key?: string; space_key?: string; token_type?: number;
  wi_type: string; wi_id: string;
}) {
  return api('/api/workitem/workflow', params);
}

export function getSubtasks(params: {
  base_url?: string; plugin_id?: string; plugin_secret?: string;
  user_key?: string; space_key?: string; token_type?: number;
  wi_type: string; wi_id: string; node_id: string;
}) {
  return api('/api/workitem/subtasks', params);
}

export function searchWorkItems(params: {
  base_url?: string; plugin_id?: string; plugin_secret?: string;
  user_key?: string; space_key?: string; token_type?: number;
  keyword?: string; type_keys?: string[]; page?: number; page_size?: number;
  work_item_ids?: string;
}) {
  return api('/api/workitem/search', params);
}

export function getWorkItemDetail(params: {
  base_url?: string; plugin_id?: string; plugin_secret?: string;
  user_key?: string; space_key?: string; token_type?: number;
  wi_type: string; wi_ids: number[];
}) {
  return api('/api/workitem/detail', params);
}

export function getTypes(params: {
  base_url?: string; plugin_id?: string; plugin_secret?: string;
  user_key?: string; space_key?: string; token_type?: number;
}) {
  return api('/api/workitem/types', params);
}

export function getMeta(params: {
  base_url?: string; plugin_id?: string; plugin_secret?: string;
  user_key?: string; space_key?: string; token_type?: number;
  type_key: string;
}) {
  return api('/api/workitem/meta', params);
}

export function getRelations(params: {
  base_url?: string; plugin_id?: string; plugin_secret?: string;
  user_key?: string; space_key?: string; token_type?: number;
}) {
  return api('/api/workitem/relations', params);
}

// ======================== 复制 ========================

export function genMapping(params: {
  base_url?: string; plugin_id?: string; plugin_secret?: string;
  user_key?: string; space_key?: string; token_type?: number;
  mode: 'A';
  source_work_item: { type: string; id: string };
  source_node_id?: string;
  source_item_ids?: number[];
  target_work_item: { type: string; id: string };
  target_relation_id?: string;
  target_node_id?: string;
}) {
  return api('/api/copy/gen-mapping', params);
}

export function executeCopy(config: any) {
  return api('/api/copy/execute', config);
}

export function getCopyRecords() {
  return api('/api/copy/records');
}

// ======================== 模板 ========================

export function getTemplates() {
  return api('/api/templates/templates');
}

export function saveTemplate(data: { name: string; mode: string; source_type?: string; target_type?: string; field_mappings: any[] }) {
  return api('/api/templates/templates', data);
}

export function deleteTemplate(id: number) {
  return fetch(`/api/templates/templates/${id}`, { method: 'DELETE' }).then(r => r.json());
}
