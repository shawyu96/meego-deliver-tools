// =====================================================================
// 全局配置页面
// =====================================================================

import React, { useState } from 'react';
import { loadSaved, saveConfig } from '../storage';
import { api } from '../api';

export function ConfigScreen({ onNext, onBack }: { onNext: (spaces: any[]) => void; onBack?: () => void }) {
  const saved = loadSaved();
  const [baseUrl, setBaseUrl] = useState(saved.base_url || 'https://project.feishu.cn');
  const [pluginId, setPluginId] = useState(saved.plugin_id || '');
  const [pluginSecret, setPluginSecret] = useState(saved.plugin_secret || '');
  const [userKey, setUserKey] = useState(saved.user_key || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!baseUrl || !pluginId || !pluginSecret || !userKey) {
      setError('请填写所有必填字段');
      return;
    }
    setError('');
    setLoading(true);
    let userName = '';
    try {
      const r = await api<any>('/api/auth/user-info', {
        base_url: baseUrl,
        plugin_id: pluginId,
        plugin_secret: pluginSecret,
        user_key: userKey,
        token_type: 0,
      });
      userName = r.user_name || '';
    } catch (e: any) {
      setError('凭证验证失败: ' + (e.message || '未知错误'));
      setLoading(false);
      return;
    }
    saveConfig({ base_url: baseUrl, plugin_id: pluginId, plugin_secret: pluginSecret, user_key: userKey, user_name: userName });
    setLoading(false);
    onNext(loadSaved().spaces || []);
  }

  return (
    <div className="card">
      <h2>全局配置</h2>
      <p className="text-sm" style={{ marginBottom: 12 }}>
        这里统一保存飞书项目插件凭证。Secret 仅保存在当前浏览器会话中，关闭浏览器后需要重新填写。
      </p>
      <div className="form-group">
        <label>API 地址</label>
        <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://project.feishu.cn" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Plugin ID</label>
          <input value={pluginId} onChange={e => setPluginId(e.target.value)} placeholder="MII_..." />
        </div>
        <div className="form-group">
          <label>Plugin Secret</label>
          <input type="password" value={pluginSecret} onChange={e => setPluginSecret(e.target.value)} placeholder="输入 Secret" />
        </div>
      </div>
      <div className="form-group">
        <label>User Key</label>
        <input value={userKey} onChange={e => setUserKey(e.target.value)} placeholder="用户 user_key" />
      </div>
      {error && <div className="msg msg-error">{error}</div>}
      <div className="btn-group">
        {onBack && <button className="btn btn-secondary" onClick={onBack} disabled={loading}>返回首页</button>}
        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
          {loading && <span className="spinner" />}
          保存
        </button>
      </div>
    </div>
  );
}
