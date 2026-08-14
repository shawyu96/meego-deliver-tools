// =====================================================================
// 空间选择
// =====================================================================

import React, { useState, useEffect } from 'react';
import { loadSaved, saveConfig } from '../storage';
import { api } from '../api';

export function SpaceScreen({ spaces, onNext, onBack }: { spaces: any[]; onNext: (spaceKey: string) => void; onBack: () => void }) {
  const saved = loadSaved();
  const [spaceList, setSpaceList] = useState(spaces || []);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadSpaces() {
    if (!saved.base_url || !saved.plugin_id || !saved.plugin_secret || !saved.user_key) {
      setError('请先完成全局配置');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const r = await api<{ spaces: any[] }>('/api/auth/init', {
        base_url: saved.base_url,
        plugin_id: saved.plugin_id,
        plugin_secret: saved.plugin_secret,
        user_key: saved.user_key,
      });
      const nextSpaces = r.spaces || [];
      setSpaceList(nextSpaces);
      saveConfig({ spaces: nextSpaces });
    } catch (e: any) {
      setError('加载空间失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!spaceList.length) loadSpaces();
  }, []);

  function handleNext() {
    if (!selected) { setError('请选择一个空间'); return; }
    saveConfig({ space_key: selected });
    onNext(selected);
  }

  return (
    <div className="card">
      <h2>选择空间</h2>
      {loading && <div className="msg msg-info"><span className="spinner" /> 正在加载空间...</div>}
      {!loading && spaceList.length === 0 && <div className="msg msg-info">未找到可访问的空间</div>}
      {spaceList.map(s => (
        <div
          key={s.project_key}
          className={'space-item' + (selected === s.simple_name ? ' selected' : '')}
          onClick={() => setSelected(s.simple_name)}
        >
          <div className="space-body">
            <input type="radio" checked={selected === s.simple_name} onChange={() => setSelected(s.simple_name)} onClick={e => e.stopPropagation()} />
            <span className="space-name">{s.name || s.simple_name}</span>
            <span className="space-simple">{s.simple_name}</span>
          </div>
        </div>
      ))}
      {error && <div className="msg msg-error">{error}</div>}
      <div className="btn-group">
        <button className="btn btn-secondary" onClick={onBack}>返回</button>
        <button className="btn btn-secondary" onClick={loadSpaces} disabled={loading}>刷新空间</button>
        <button className="btn btn-primary" onClick={handleNext} disabled={!selected || loading}>下一步</button>
      </div>
    </div>
  );
}
