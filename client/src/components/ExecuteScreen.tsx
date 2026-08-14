// =====================================================================
// 复制执行 + 结果展示
// =====================================================================

import React, { useState, useEffect } from 'react';
import { loadSaved } from '../storage';
import { executeCopy } from '../api';

interface Props {
  data: any;
  onReset: () => void;
  onBackToWorkflow: () => void;
}

export function ExecuteScreen({ data, onReset, onBackToWorkflow }: Props) {
  const saved = loadSaved();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const wi = { type: saved.wi_type, id: saved.wi_id };
        const config = {
          mode: 'A',
          auth: { base_url: saved.base_url, plugin_id: saved.plugin_id, plugin_secret: saved.plugin_secret, user_key: saved.user_key, token_type: 0 },
          space_key: saved.space_key,
          source_work_item: wi,
          source_node_id: data.selectedSourceNode || saved.source_node_id,
          source_item_ids: data.selectedSubtasks,
          target_work_item: wi,
          target_relation_id: data.selectedTargetGroup,
          target_node_id: data.selectedTargetNode || saved.target_node_id || '',
          target_type_key: data.target_type_key || saved.target_type_key,
          field_mappings: data.field_mappings || [],
          concurrency: 1,
          };
        const r = await executeCopy(config);
        setResult(r);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <div className="card"><span className="spinner" /> 正在执行复制...</div>
  );

  const summary = result?.summary || { total: 0, ok: 0, fail: 0 };
  const items = result?.items || [];

  return (
    <>
      <div className="card">
        <h2>复制结果</h2>
        {error && <div className="msg msg-error">{error}</div>}
        {result && (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <div className="msg msg-info" style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.total}</div>
                <div className="text-sm">总计</div>
              </div>
              <div className="msg msg-success" style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{summary.ok}</div>
                <div className="text-sm">成功</div>
              </div>
              <div className="msg msg-error" style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>{summary.fail}</div>
                <div className="text-sm">失败</div>
              </div>
            </div>
            {items.map((item: any, i: number) => (
              <div key={i} className={`result-item ${item.ok ? 'ok' : 'fail'}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>
                    {item.ok ? '✔' : '✘'} {item.source_name || '#' + item.source_id}
                  </span>
                  <span className="tag tag-gray">{item.strategy || ''}</span>
                </div>
                {item.ok
                  ? <div className="text-sm" style={{ marginTop: 2 }}>创建 ID: {item.created_id}</div>
                  : <div className="text-sm" style={{ marginTop: 2, color: '#dc2626' }}>{item.error}</div>}
              </div>
            ))}
            <div className="btn-group">
              <button className="btn btn-secondary" onClick={onBackToWorkflow}>返回2步</button>
              <button className="btn btn-secondary" onClick={onReset}>首页</button>
            </div>
          </>
        )}
      </div>
      {error && (
        <div className="btn-group">
          <button className="btn btn-secondary" onClick={onBackToWorkflow}>返回2步</button>
          <button className="btn btn-secondary" onClick={onReset}>首页</button>
        </div>
      )}
    </>
  );
}
