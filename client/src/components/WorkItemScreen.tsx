// =====================================================================
// 工作项选择 — 搜索 + 选中后查 workflow
// =====================================================================

import React, { useState, useEffect } from 'react';
import { loadSaved, saveConfig } from '../storage';
import { api, getTypes, searchWorkItems, getWorkflow } from '../api';

interface Props {
  onNext: (data: { wi_id: string; wi_type: string; workflow: any; workitem: any }) => void;
  onBack: () => void;
  initialState?: any;
  onStateChange?: (state: any) => void;
}

const PAGE_SIZE = 20;

export function WorkItemScreen({ onNext, onBack, initialState, onStateChange }: Props) {
  const saved = loadSaved();
  const cache = initialState || {};
  const [types, setTypes] = useState<any[]>(cache.types || []);
  const [selectedType, setSelectedType] = useState(cache.selectedType ?? saved.wi_type ?? '');
  const [keyword, setKeyword] = useState(cache.keyword ?? saved.wi_keyword ?? '');
  const [workItemId, setWorkItemId] = useState(cache.workItemId ?? saved.wi_id_filter ?? '');
  const [items, setItems] = useState<any[]>(cache.items || []);
  const [selectedItem, setSelectedItem] = useState<any | null>(cache.selectedItem || null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(Boolean(cache.hasSearched));
  const [page, setPage] = useState(cache.page || 1);
  const [hasMore, setHasMore] = useState(Boolean(cache.hasMore));
  const [workflowLoad, setWorkflowLoad] = useState(false);
  const [error, setError] = useState('');
  const showEmptyPager = items.length === 0 && hasSearched && (hasMore || page > 1);

  useEffect(() => {
    if (types.length) return;
    (async () => {
      setLoading(true);
      try {
        const r = await getTypes({
          base_url: saved.base_url, plugin_id: saved.plugin_id, plugin_secret: saved.plugin_secret,
          user_key: saved.user_key, space_key: saved.space_key,
        });
        setTypes(r || []);
      } catch (e: any) {
        setError('加载类型失败: ' + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    onStateChange?.({ types, selectedType, keyword, workItemId, items, selectedItem, hasSearched, page, hasMore });
  }, [types, selectedType, keyword, workItemId, items, selectedItem, hasSearched, page, hasMore]);

  function isNodeFlowItem(item: any) {
    if (!item) return false;
    if (String(item.pattern || '').toLowerCase() === 'node') return true;
    if (Array.isArray(item.workflow_nodes) && item.workflow_nodes.length > 0) return true;
    return false;
  }

  function getFlowTemplate(item: any) {
    const t = item.workflow_template || item.template || item.flow_template || item.work_item_template || item.process_template;
    if (t && typeof t === 'object') return t.name || t.label || t.zh_name || t.display_name || t.template_name || t.id || '-';
    return item.workflow_template_name || item.template_name || item.flow_template_name || item.process_template_name || item.workflow_name || item.template_id || '-';
  }

  async function handleSearch(nextPage = 1) {
    if (!selectedType) { setError('请先选择工作项类型'); return; }
    setSearching(true);
    setError('');
    setItems([]);
    setSelectedItem(null);
    setHasSearched(true);
    try {
      saveConfig({ wi_keyword: keyword, wi_id_filter: workItemId, wi_type: selectedType });
      const r = await searchWorkItems({
        base_url: saved.base_url, plugin_id: saved.plugin_id, plugin_secret: saved.plugin_secret,
        user_key: saved.user_key, space_key: saved.space_key,
        keyword: keyword.trim(),
        work_item_ids: workItemId.trim(),
        type_keys: [selectedType],
        page: nextPage, page_size: PAGE_SIZE,
      });
      const data = r as any;
      setItems(data.items || []);
      setPage(data.page || nextPage);
      setHasMore(Boolean(data.has_more));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function handleSelectItem(item: any) {
    if (!isNodeFlowItem(item)) {
      setError('当前工具仅支持节点流工作项：该工作项不是节点流，无法继续选择节点子任务');
      setSelectedItem(null);
      return;
    }
    setSelectedItem(item);
    const id = item.id || item.work_item_id;
    const type = item.work_item_type_key || selectedType;
    setWorkflowLoad(true);
    setError('');
    try {
      const wf = await getWorkflow({
        base_url: saved.base_url, plugin_id: saved.plugin_id, plugin_secret: saved.plugin_secret,
        user_key: saved.user_key, space_key: saved.space_key,
        wi_type: type, wi_id: String(id),
      });
      saveConfig({ wi_id: String(id), wi_type: type });
      onNext({ wi_id: String(id), wi_type: type, workflow: wf, workitem: item });
    } catch (e: any) {
      setError('查询工作流失败: ' + e.message);
      setSelectedItem(null);
    } finally {
      setWorkflowLoad(false);
    }
  }

  return (
    <div className="card">
      <h2>选择工作项</h2>
      <p className="text-sm" style={{ marginBottom: 12, color: '#64748b' }}>
        先选择工作项类型，再按标题或 ID 筛选节点流工作项。
      </p>
      {error && <div className="msg msg-error">{error}</div>}

      <div className="workitem-filters">
        <div className="form-group">
          <label>工作项类型</label>
          <select
            value={selectedType}
            onChange={e => {
              setSelectedType(e.target.value);
              setItems([]); setSelectedItem(null); setHasSearched(false); setPage(1); setHasMore(false);
            }}
          >
            <option value="">请选择工作项类型</option>
            {types.map(t => <option key={t.type_key} value={t.type_key}>{t.name || t.type_key}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>标题（可选）</label>
          <input value={keyword} onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch(1)} placeholder="按标题搜索..." />
        </div>
        <div className="form-group">
          <label>ID（可选）</label>
          <input value={workItemId} onChange={e => setWorkItemId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch(1)} placeholder="输入工作项 ID" />
        </div>
      </div>

      <div className="btn-group" style={{ marginTop: 0 }}>
        {items.length === 0 && !showEmptyPager && (
          <button className="btn btn-secondary" onClick={onBack} disabled={searching || workflowLoad}>返回</button>
        )}
        <button className="btn btn-primary" onClick={() => handleSearch(1)} disabled={searching || workflowLoad || !selectedType}>
          {searching ? '查询中...' : '查询'}
        </button>
      </div>

      {workflowLoad && (
        <div className="msg msg-info" style={{ marginTop: 12 }}>
          <span className="spinner" /> 正在加载工作流，准备进入下一步...
        </div>
      )}

      {items.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="text-sm" style={{ marginBottom: 8, fontWeight: 600 }}>
            第 {page} 页工作项列表 ({items.length} 条)
          </div>
          <table>
            <thead>
              <tr><th>ID</th><th>标题</th><th>类型</th><th>流程类型</th></tr>
            </thead>
            <tbody>
              {items.map(item => {
                const id = item.id || item.work_item_id;
                const typeKey = item.work_item_type_key;
                const typeName = types.find(t => t.type_key === typeKey)?.name || typeKey;
                const isSelected = selectedItem && (selectedItem.id === id || selectedItem.work_item_id === id);
                return (
                  <tr key={id} className={isSelected ? 'selected' : ''}
                    style={{ cursor: workflowLoad ? 'wait' : 'pointer', opacity: workflowLoad && !isSelected ? .55 : 1 }}
                    onClick={() => !workflowLoad && handleSelectItem(item)}>
                    <td>{id}</td>
                    <td><span style={{ fontWeight: 500 }}>{item.name || item.title || `#${id}`}</span></td>
                    <td><span className="tag tag-blue">{typeName}</span></td>
                    <td>{getFlowTemplate(item)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="workitem-list-actions">
            <span className="text-sm" style={{ color: '#64748b' }}>
              第 {page} 页 · 每页 {PAGE_SIZE} 条{hasMore ? '' : ' · 已到末页'}
            </span>
            <div className="btn-group" style={{ marginTop: 0 }}>
              <button className="btn btn-secondary" onClick={() => handleSearch(Math.max(1, page - 1))} disabled={searching || page <= 1}>上一页</button>
              <button className="btn btn-secondary" onClick={() => handleSearch(page + 1)} disabled={searching || !hasMore}>下一页</button>
              <button className="btn btn-secondary" onClick={onBack}>返回</button>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 && !searching && hasSearched && (
        <div className="msg msg-info" style={{ marginTop: 12 }}>
          {hasMore ? '当前页没有节点流工作项，可继续翻页查找。' : '没有匹配的节点流工作项。当前工具只支持节点流，因为只有节点流才有节点子任务。请换一个工作项类型或关键词再查。'}
        </div>
      )}

      {showEmptyPager && (
        <div className="workitem-list-actions">
          <span className="text-sm" style={{ color: '#64748b' }}>
            第 {page} 页 · 每页 {PAGE_SIZE} 条{hasMore ? '' : ' · 已到末页'}
          </span>
          <div className="btn-group" style={{ marginTop: 0 }}>
            <button className="btn btn-secondary" onClick={() => handleSearch(Math.max(1, page - 1))} disabled={searching || page <= 1}>上一页</button>
            <button className="btn btn-secondary" onClick={() => handleSearch(page + 1)} disabled={searching || !hasMore}>下一页</button>
            <button className="btn btn-secondary" onClick={onBack}>返回</button>
          </div>
        </div>
      )}

      {loading && (
        <div className="msg msg-info" style={{ marginTop: 12 }}>
          <span className="spinner" /> 加载类型列表...
        </div>
      )}
    </div>
  );
}
