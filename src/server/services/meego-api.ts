// =====================================================================
// Meego OpenAPI 客户端 — 从 meego-8step-ts/src/api.ts 迁移
// =====================================================================

import * as https from 'node:https';
import { URL } from 'node:url';
import type { WorkflowResponse, MetaField, SubTask } from '../../shared/types.js';

/* ---------- 工具：HTTP 请求 ---------- */
function req(
  baseUrl: string,
  relPath: string,
  opts: { method?: string; headers?: Record<string, string>; body?: any; timeoutMs?: number } = {},
): Promise<any> {
  const u = new URL(relPath, baseUrl);
  const method = (opts.method || 'GET').toUpperCase();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  let payload: string | undefined;
  if (opts.body !== undefined) {
    payload = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    headers['Content-Length'] = String(Buffer.byteLength(payload));
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: any) => { if (settled) return; settled = true; resolve(value); };
    const r = https.request(
      { hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          try { done(JSON.parse(Buffer.concat(chunks).toString())); }
          catch { done({ raw: Buffer.concat(chunks).toString().slice(0, 400) }); }
        });
      },
    );
    r.setTimeout(opts.timeoutMs ?? 15000, () => r.destroy(new Error(`OpenAPI 请求超时: ${method} ${relPath}`)));
    r.on('error', (e) => done({ _exc: e.message }));
    if (payload) r.write(payload);
    r.end();
  });
}

function norm(r: any): { ec: number; msg: string; data: any } {
  if (r.raw) return { ec: 999, msg: r.raw.slice(0, 100), data: null };
  if (typeof r.err_code === 'number') return { ec: r.err_code, msg: r.err_msg || '', data: r.data };
  if (r.error && typeof r.error.code !== 'undefined') return { ec: Number(r.error.code), msg: r.error.msg || '', data: r.data };
  if (r._exc) return { ec: 999, msg: r._exc, data: null };
  return { ec: NaN, msg: 'unexpected response', data: r };
}

function uniqueStrings(values: any[]): string[] {
  return Array.from(new Set(values.map((v) => String(v || '').trim()).filter(Boolean)));
}

function collectUserKeysFromValue(value: any, out: string[]) {
  if (!value) return;
  if (typeof value === 'string' || typeof value === 'number') {
    const s = String(value);
    if (/^\d{8,}$/.test(s)) out.push(s);
    return;
  }
  if (Array.isArray(value)) { value.forEach((v) => collectUserKeysFromValue(v, out)); return; }
  if (typeof value === 'object') collectUserKeysFromValue(value.user_key ?? value.key ?? value.username, out);
}

function hydrateUsers(value: any, users: Map<string, any>): any {
  if (!value) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const key = String(value);
    return users.get(key) || { unresolved: true };
  }
  if (Array.isArray(value)) return value.map((v) => hydrateUsers(v, users));
  return value;
}

/* ---------- API Client ---------- */

export class MeegoApi {
  private baseUrl: string;
  private token: string = '';
  private userKey: string = '';
  private hexPk: string = '';
  private _ready: boolean = false;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /** 仅获取 plugin token（不依赖 space_key，用于凭证验证 / 用户解析） */
  async initToken(pluginId: string, pluginSecret: string, userKey: string, tokenType = 0) {
    this.userKey = userKey;
    const r = await req(this.baseUrl, '/open_api/authen/plugin_token', {
      method: 'POST',
      body: { plugin_id: pluginId, plugin_secret: pluginSecret, type: tokenType },
    });
    const { ec, data, msg } = norm(r);
    if (ec !== 0 || !data?.token) throw new Error(`token 获取失败: ec=${ec} msg=${msg}`);
    this.token = data.token;
  }

  async init(pluginId: string, pluginSecret: string, userKey: string, spaceKey: string, tokenType = 0) {
    await this.initToken(pluginId, pluginSecret, userKey, tokenType);
    const detail = await req(this.baseUrl, '/open_api/projects/detail', {
      method: 'POST',
      headers: this.headers,
      body: { user_key: userKey, simple_names: [spaceKey] },
    });
    const { data: detailData } = norm(detail);
    const hex = detailData ? Object.keys(detailData).find((k) => String(detailData[k]?.simple_name).toLowerCase() === spaceKey.toLowerCase()) : null;
    if (!hex) throw new Error(`resolve projectKey 失败: ${spaceKey}`);
    this.hexPk = hex;
    this._ready = true;
  }

  get ready() { return this._ready; }
  get projectKey() { return this.hexPk; }

  private get headers() {
    return { 'X-PLUGIN-TOKEN': this.token, 'X-USER-KEY': this.userKey };
  }

  private path(rel: string) {
    return `/open_api/${this.hexPk}${rel.startsWith('/') ? rel : '/' + rel}`;
  }

  private async get(rel: string) {
    return norm(await req(this.baseUrl, this.path(rel), { headers: this.headers }));
  }

  private async post(rel: string, body: any) {
    return norm(await req(this.baseUrl, this.path(rel), { method: 'POST', headers: this.headers, body }));
  }

  private async put(rel: string, body: any) {
    return norm(await req(this.baseUrl, this.path(rel), { method: 'PUT', headers: this.headers, body }));
  }

  // ======================== 读接口 ========================

  async getWorkflow(wiType: string, wiId: string): Promise<WorkflowResponse> {
    const { ec, data, msg } = await this.post(`/work_item/${wiType}/${wiId}/workflow/query`, {
      flow_type: 0,
      expand: { need_sub_workitem_detail: true, need_sub_task_detail: true },
    });
    if (ec !== 0) throw new Error(`getWorkflow 失败: ec=${ec} msg=${msg}`);
    const wf = data as WorkflowResponse;
    for (const node of wf.workflow_nodes || []) {
      if (!node.node_sub_task_detail || !node.node_sub_task_detail.length) {
        try {
          const tasks = await this.getSubTasks(wiType, wiId, node.state_key);
          node.node_sub_task_detail = tasks;
        } catch { /* 静默 */ }
      }
    }
    return wf;
  }

  async getSubTasks(wiType: string, wiId: string, nodeId: string): Promise<SubTask[]> {
    const { ec, data, msg } = await this.get(`/work_item/${wiType}/${wiId}/workflow/task?node_id=${nodeId}`);
    if (ec !== 0) throw new Error(`getSubTasks 失败: ec=${ec} msg=${msg}`);
    if (Array.isArray(data)) {
      const node = data.find((n: any) => n.state_key === nodeId || n.id === nodeId);
      if (node?.sub_tasks) {
        const userKeys: string[] = [];
        for (const s of node.sub_tasks) {
          collectUserKeysFromValue(s.owners, userKeys);
          collectUserKeysFromValue(s.assignee, userKeys);
          collectUserKeysFromValue(s.schedules?.flatMap((sch: any) => sch?.owners || []), userKeys);
          collectUserKeysFromValue(s.role_assignee?.flatMap((role: any) => role?.owners || []), userKeys);
        }
        const users = await this.queryUsers(uniqueStrings(userKeys)).catch(() => new Map<string, any>());
        return node.sub_tasks.map((s: any) => {
          const owners = s.owners || s.assignee || [];
          const assignee = s.assignee || s.owners || [];
          return {
            id: Number(s.id), name: s.name,
            owner: hydrateUsers(assignee?.[0] || owners?.[0] || '', users),
            description: s.details || '', node_id: nodeId,
            passed: s.passed ?? false, note: s.note || '',
            details: s.details || '',
            owners: hydrateUsers(owners, users),
            assignee: hydrateUsers(assignee, users),
            schedules_points: s.schedules?.[0]?.points ?? 0,
            fields: s.fields || [],
          };
        });
      }
    }
    return [];
  }

  async queryUsers(userKeys: string[]): Promise<Map<string, any>> {
    const keys = uniqueStrings(userKeys).slice(0, 100);
    const result = new Map<string, any>();
    if (!keys.length) return result;
    const { ec, data, msg } = norm(await req(this.baseUrl, '/open_api/user/query', {
      method: 'POST', headers: this.headers, body: { user_keys: keys },
    }));
    if (ec !== 0) throw new Error(`queryUsers 失败: ec=${ec} msg=${msg}`);
    const list = Array.isArray(data) ? data : [];
    for (const user of list) {
      const key = user?.user_key || user?.username || user?.key;
      if (key) result.set(String(key), user);
    }
    return result;
  }

  async getRawSubTaskDetails(wiType: string, wiId: string, nodeId: string): Promise<{ builtin: any; custom: any[] }[]> {
    const { ec, data, msg } = await this.get(`/work_item/${wiType}/${wiId}/workflow/task?node_id=${nodeId}`);
    if (ec !== 0) throw new Error(`getRawSubTaskDetails 失败: ec=${ec} msg=${msg}`);
    const results: { builtin: any; custom: any[] }[] = [];
    if (Array.isArray(data)) {
      const node = data.find((n: any) => n.state_key === nodeId || n.id === nodeId);
      if (node?.sub_tasks) {
        for (const st of node.sub_tasks) {
          results.push({
            builtin: {
              id: st.id, name: st.name, details: st.details || '',
              owners: st.owners || st.assignee || [],
              assignee: st.assignee || st.owners || [],
              role_assignee: st.role_assignee || [],
              passed: st.passed ?? false, note: st.note || '',
              schedules: st.schedules || [],
              actual_begin_time: st.actual_begin_time || '',
              actual_finish_time: st.actual_finish_time || '',
              actual_work_time: st.actual_work_time || '',
              order: st.order || 0,
              owner_roles: st.owner_roles || [],
              owner_usage_mode: st.owner_usage_mode ?? 0,
            },
            custom: st.fields || [],
          });
        }
      }
    }
    return results;
  }

  async getWorkItemDetail(wiType: string, ids: number[]): Promise<any[]> {
    if (!ids.length) return [];
    const requested = Array.from(new Set(ids.map(Number).filter(Number.isFinite)));
    const found = new Map<number, any>();
    const queryAndMerge = async (typeKey: string) => {
      const missing = requested.filter((id) => !found.has(id));
      if (!missing.length) return;
      const items = await this._queryWorkItems(typeKey, missing);
      for (const item of items) {
        const id = Number(item.id || item.work_item_id);
        if (Number.isFinite(id) && requested.includes(id) && !found.has(id)) found.set(id, item);
      }
    };
    await queryAndMerge(wiType);
    if (found.size < requested.length && wiType !== 'issue') await queryAndMerge('issue');
    if (found.size < requested.length) {
      const types = await this.listTypes().catch(() => []);
      for (const t of types) {
        if (found.size >= requested.length) break;
        if (t.type_key === wiType || t.type_key === 'issue') continue;
        await queryAndMerge(t.type_key);
      }
    }
    return requested.map((id) => found.get(id)).filter(Boolean);
  }

  private async _queryWorkItems(wiType: string, ids: number[]): Promise<any[]> {
    if (!ids.length) return [];
    try {
      const { ec, data } = await this.post(`/work_item/${wiType}/query`, {
        page: 1, page_size: Math.min(ids.length, 200), work_item_ids: ids,
      });
      if (ec !== 0) return [];
      const list = data?.list || data?.items || data;
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  async searchWorkItemsFilter(keyword: string, typeKeys?: string[], page = 1, pageSize = 20, workItemIds: number[] = []): Promise<any[]> {
    const body: Record<string, any> = { page_num: page, page_size: pageSize };
    if (keyword?.trim()) body.work_item_name = keyword.trim();
    if (typeKeys?.length) body.work_item_type_keys = typeKeys;
    if (workItemIds.length) body.work_item_ids = workItemIds;
    const { ec, data } = await this.post('/work_item/filter', body);
    if (ec !== 0) return [];
    const list = data?.list || data?.items || data || [];
    return Array.isArray(list) ? list : [];
  }

  async searchWorkItems(wiType: string, keyword: string, page = 1, pageSize = 20): Promise<any[]> {
    try {
      const { ec, data } = await this.post(`/work_item/${wiType}/query`, { page, page_size: pageSize, keyword });
      if (ec !== 0) return [];
      const list = data?.list || data?.items || data;
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  async getCreateMeta(wiType: string): Promise<MetaField[]> {
    const { ec, data, msg } = await this.get(`/work_item/${wiType}/meta`);
    if (ec !== 0) throw new Error(`getCreateMeta(${wiType}) 失败: ec=${ec} msg=${msg}`);
    return Array.isArray(data) ? data : [];
  }

  async getTemplateList(wiType: string): Promise<any[]> {
    const { ec, data, msg } = await this.get(`/template_list/${wiType}`);
    if (ec !== 0) throw new Error(`getTemplateList(${wiType}) 失败: ec=${ec} msg=${msg}`);
    if (Array.isArray(data)) return data;
    if (data?.list) return data.list;
    if (data?.items) return data.items;
    return [];
  }

  async getTemplateDetail(templateId: string | number): Promise<any> {
    const { ec, data, msg } = await this.get(`/template_detail/${templateId}`);
    if (ec !== 0) throw new Error(`getTemplateDetail(${templateId}) 失败: ec=${ec} msg=${msg}`);
    return data || {};
  }

  async getAllFields(wiType: string): Promise<MetaField[]> {
    const { ec, data, msg } = await this.post('/field/all', { work_item_type_key: wiType });
    if (ec !== 0) throw new Error(`getAllFields(${wiType}) 失败: ec=${ec} msg=${msg}`);
    return Array.isArray(data) ? data : [];
  }

  async listSpaces(userKey: string): Promise<any[]> {
    // Step 1: 调用 /open_api/projects 获取用户可访问的 project_key 列表
      const listResp = await req(this.baseUrl, '/open_api/projects', {
      method: 'POST',
      headers: this.headers,
    body: { user_key: userKey },
    });
    const { ec: listEc, msg: listMsg, data: listData } = norm(listResp);
    if (listEc !== 0) {
      console.error(`[listSpaces] /open_api/projects 错误: ec=${listEc} msg=${listMsg}`);
      return [];
      }
    const projectKeys: string[] = Array.isArray(listData) ? listData.filter((k: any) => typeof k === 'string' && k) : [];
  if (!projectKeys.length) return [];

        // Step 2: 调用 /open_api/projects/detail 传 simple_names 获取空间详情
        const detailResp = await req(this.baseUrl, '/open_api/projects/detail', {
        method: 'POST',
      headers: this.headers,
    body: { user_key: userKey, simple_names: projectKeys },
    });
      const { ec: detailEc, msg: detailMsg, data: detailData } = norm(detailResp);
      if (detailEc !== 0) {
        console.error(`[listSpaces] /open_api/projects/detail 错误: ec=${detailEc} msg=${detailMsg}`);
        // 降级：只返回 project_key，不包含详情
          return projectKeys.map((key) => ({ project_key: key, name: key, simple_name: key }));
          }
          if (!detailData || typeof detailData !== 'object' || Array.isArray(detailData)) {
        return projectKeys.map((key) => ({ project_key: key, name: key, simple_name: key }));
    }
    return Object.entries(detailData)
  .filter(([, val]: [string, any]) => val && typeof val === 'object')
      .map(([key, val]: [string, any]) => ({
        project_key: key,
        name: val?.name || val?.simple_name || key,
        simple_name: val?.simple_name || key,
      }));
  }

  async listTypes(): Promise<{ type_key: string; name: string; simple_name?: string }[]> {
    const { ec, data, msg } = await this.get('/work_item/all-types');
    if (ec !== 0) throw new Error(`listTypes 失败: ec=${ec} msg=${msg}`);
    if (Array.isArray(data)) return data;
    if (data?.list) return data.list;
    if (data?.items) return data.items;
    return [];
  }

  async listRelations(): Promise<any[]> {
    const { ec, data, msg } = await this.get('/work_item/relation');
    if (ec !== 0) throw new Error(`listRelations 失败: ec=${ec} msg=${msg}`);
    if (Array.isArray(data)) return data;
    if (data?.list) return data.list;
    if (data?.items) return data.items;
    return [];
  }

  // ======================== 写接口 ========================

  async createWorkItem(typeKey: string, pairs: { field_key: string; field_value: any }[]): Promise<number> {
    const namePair = pairs.find((p) => p.field_key === 'name');
    if (!namePair || namePair.field_value === undefined || namePair.field_value === null || String(namePair.field_value).trim() === '') {
      throw new Error(`createWorkItem(${typeKey}) 失败: 缺少显式映射的 name 字段`);
    }
    const fieldValuePairs = pairs.filter((p) => p.field_key !== 'name').map((p) => ({ field_key: p.field_key, field_value: p.field_value }));
    const { ec, data, msg } = await this.post('/work_item/create', {
      work_item_type_key: typeKey,
      name: String(namePair.field_value),
      field_value_pairs: fieldValuePairs,
    });
    if (ec !== 0) throw new Error(`createWorkItem(${typeKey}) 失败: ec=${ec} msg=${msg}`);
    if (typeof data === 'number') return data;
    if (typeof data === 'string') return Number(data);
    const id = data?.work_item_id || data?.id;
    if (id) return Number(id);
    throw new Error(`createWorkItem 返回格式异常: ${JSON.stringify(data).slice(0, 100)}`);
  }

  async linkWorkItemsToGroup(wiType: string, wiId: string, nodeId: string, relationId: string, workItemIds: number[]): Promise<void> {
    if (!workItemIds.length) throw new Error('linkWorkItemsToGroup: workItemIds 为空');
    const { ec, msg } = await this.put(`/workflow/${wiType}/${wiId}/node/${nodeId}`, {
      add_sub_workitems: { relation_id: relationId, workitems: workItemIds.map(Number) },
    });
    if (ec !== 0) throw new Error(`linkToGroup 失败: ec=${ec} msg=${msg}`);
  }

  async createSubTask(wiType: string, wiId: string, nodeId: string, nameOrPayload: string | Record<string, any>, owner?: string): Promise<number> {
    const body: any = typeof nameOrPayload === 'string' ? { name: nameOrPayload, node_id: nodeId } : { ...nameOrPayload, node_id: nodeId };
    if (owner) body.owner = owner;
    const { ec, data, msg } = await this.post(`/work_item/${wiType}/${wiId}/workflow/task`, body);
    if (ec !== 0) throw new Error(`createSubTask 失败: ec=${ec} msg=${msg}`);
    if (typeof data === 'number') return data;
    const id = data?.id || data?.task_id;
    if (id) return Number(id);
    throw new Error(`createSubTask 返回格式异常: ${JSON.stringify(data).slice(0, 100)}`);
  }
}

/* ---------- 工厂函数：从 config 创建 + 初始化 ---------- */

import { config } from '../config.js';

export async function createApiFromConfig(): Promise<MeegoApi> {
  const api = new MeegoApi(config.meego.baseUrl);
  await api.init(config.meego.pluginId, config.meego.pluginSecret, config.meego.userKey, config.meego.spaceKey, config.meego.tokenType);
  return api;
}

/** 从前端请求体创建（兼容前端传凭证的模式） */
export async function createApiFromBody(body: any): Promise<MeegoApi> {
  const baseUrl = body.base_url || config.meego.baseUrl;
  const pluginId = body.plugin_id || config.meego.pluginId;
  const pluginSecret = body.plugin_secret || config.meego.pluginSecret;
  const userKey = body.user_key || config.meego.userKey;
  const spaceKey = body.space_key || config.meego.spaceKey;
  const tokenType = body.token_type ?? config.meego.tokenType;
  if (!pluginId || !pluginSecret || !userKey || !spaceKey) {
    throw new Error('缺少必要参数: plugin_id, plugin_secret, user_key, space_key（可在 .env 中配置或前端传入）');
  }
  const api = new MeegoApi(baseUrl);
  await api.init(pluginId, pluginSecret, userKey, spaceKey, tokenType);
  return api;
}
