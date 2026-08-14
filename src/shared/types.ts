// =====================================================================
// 共享类型定义 — 前后端通用
// =====================================================================

/* ---------- 复制方向 ---------- */
export type Direction = 'A' | 'B' | 'C';

/* ---------- 工作流节点 ---------- */
export interface WorkflowNode {
  state_key: string;
  name: string;
  node_sub_task_detail: SubTask[];
  node_sub_workitem_detail: SubWorkitemGroup[];
  [key: string]: any;
}

/* ---------- 节点子任务 ---------- */
export interface SubTask {
  id: number;
  name: string;
  owner?: any;
  description?: string;
  priority?: string;
  node_id?: string;
  passed?: boolean;
  note?: string;
  schedules_points?: number;
  details?: string;
  owners?: any[];
  assignee?: any[];
  fields?: any[];
  [key: string]: any;
}

/* ---------- 节点子工作项分组 ---------- */
export interface SubWorkitemGroup {
  relation_id: string;
  sub_workitem_group_name: string;
  workitems: number[];
  [key: string]: any;
}

/* ---------- 工作流查询响应 ---------- */
export interface WorkflowResponse {
  workflow_nodes: WorkflowNode[];
  [key: string]: any;
}

/* ---------- 工作项详情 ---------- */
export interface WorkItemDetail {
  id: number;
  name: string;
  owner?: string;
  description?: string;
  priority_level?: string;
  work_item_status?: string;
  work_item_type_key?: string;
  [key: string]: any;
}

/* ---------- 创建 Meta 字段定义 ---------- */
export interface MetaField {
  field_key: string;
  field_type_key: string;
  field_alias?: string;
  is_required?: boolean | number;
  field_options?: { key: string; value: string }[];
  [key: string]: any;
}

/* ---------- 字段映射对 ---------- */
export interface FieldMapping {
  source_field: string;
  target_field: string;
  target_field_type: string;
  target_base_field?: string;
  target_role?: string;
  target_role_name?: string;
  source_value: string;
  fixed_value?: string;
  auto?: boolean;
}

/* ---------- 复制配置 ---------- */
export interface CopyConfig {
  mode: Direction;
  auth: {
    plugin_id: string;
    plugin_secret: string;
    token_type?: number;
    user_key: string;
    base_url?: string;
  };
  space_key: string;
  source_work_item: { type: string; id: string };
  source_node_id: string;
  source_item_ids: number[];
  target_work_item: { type: string; id: string };
  source_relation_id?: string;
  target_relation_id?: string;
  target_node_id?: string;
  target_type_key?: string;
  hierarchy_depth?: number;
  field_mappings: FieldMapping[];
  concurrency: number;
}

/* ---------- 执行结果 ---------- */
export interface CopyResult {
  items: ItemResult[];
  summary: { total: number; ok: number; fail: number };
}

export interface ItemResult {
  source_id: number;
  source_name: string;
  ok: boolean;
  created_id?: number;
  strategy?: string;
  error?: string;
  diagnostics?: any[];
  field_mapping_hits?: { field_key: string; source_value: any; target_value: any }[];
}

/* ---------- API 统一响应 ---------- */
export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
}
