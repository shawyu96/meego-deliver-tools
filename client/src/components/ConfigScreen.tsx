// =====================================================================
// 全局配置页面
// =====================================================================

import React, { useState, useEffect } from 'react';
import { loadSaved, saveConfig } from '../storage';
import { api, getVersion, checkUpdate, performUpdate } from '../api';

export function ConfigScreen({ onNext, onBack }: { onNext: (spaces: any[]) => void; onBack?: () => void }) {
  const saved = loadSaved();
  const [baseUrl, setBaseUrl] = useState(saved.base_url || 'https://project.feishu.cn');
  const [pluginId, setPluginId] = useState(saved.plugin_id || '');
  const [pluginSecret, setPluginSecret] = useState(saved.plugin_secret || '');
  const [userKey, setUserKey] = useState(saved.user_key || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ---- 更新功能 ----
  const [currentVersion, setCurrentVersion] = useState('');
  const [latestVersion, setLatestVersion] = useState('');
  const [hasUpdate, setHasUpdate] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');

  useEffect(() => {
    getVersion().then(r => setCurrentVersion(r.version)).catch(() => {});
  }, []);

  async function handleCheckUpdate() {
    setUpdateChecking(true);
    setUpdateMsg('');
    try {
      const r = await checkUpdate();
      setLatestVersion(r.latest_version || '未知');
      setHasUpdate(r.has_update);
      if (!r.has_update) {
        setUpdateMsg('当前已是最新版本');
      }
    } catch (e: any) {
      setUpdateMsg('检查更新失败: ' + (e.message || '未知错误'));
    } finally {
      setUpdateChecking(false);
    }
  }

  async function handlePerformUpdate() {
    setUpdating(true);
    setUpdateMsg('正在更新，请稍候…');
    try {
      const r = await performUpdate();
      setUpdateMsg('更新完成，请重启插件以应用最新代码。');
      setCurrentVersion(latestVersion);
      setHasUpdate(false);
    } catch (e: any) {
      setUpdateMsg('更新失败: ' + (e.message || '未知错误'));
    } finally {
      setUpdating(false);
    }
  }

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

    // 凭证保存成功后，立即拉取空间列表
    let spaces: any[] = [];
    try {
      const initResp = await api<{ spaces: any[] }>('/api/auth/init', {
        base_url: baseUrl,
        plugin_id: pluginId,
        plugin_secret: pluginSecret,
        user_key: userKey,
      });
      spaces = initResp.spaces || [];
      saveConfig({ spaces });
    } catch (e: any) {
      // 空间拉取失败不阻塞配置保存，用户可在右上角刷新
      console.error('[ConfigScreen] 拉取空间失败:', e.message);
    }
    setLoading(false);
    onNext(spaces);
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

      {/* ---- 更新区域 ---- */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-color, #eee)' }}>
        <h3 style={{ margin: '0 0 8px' }}>检查更新</h3>
        <p className="text-sm" style={{ marginBottom: 10, color: 'var(--text-secondary, #888)' }}>
          当前版本: <b>{currentVersion || '加载中…'}</b>
          {latestVersion && <> ｜ 最新版本: <b>{latestVersion}</b></>}
        </p>
        <div className="btn-group" style={{ marginBottom: 8 }}>
          <button className="btn btn-secondary" onClick={handleCheckUpdate} disabled={updateChecking || updating}>
            {updateChecking && <span className="spinner" />}
            检查更新
          </button>
          {hasUpdate && (
            <button className="btn btn-primary" onClick={handlePerformUpdate} disabled={updateChecking || updating}>
              {updating && <span className="spinner" />}
              立即更新
            </button>
          )}
        </div>
        {updateMsg && (
          <div className={`msg ${updateMsg.includes('失败') ? 'msg-error' : 'msg-info'}`} style={{ marginTop: 4 }}>
            {updateMsg}
          </div>
        )}
        {hasUpdate && (
          <div className="msg msg-info" style={{ marginTop: 4 }}>
            检测到新版本，点击「立即更新」将从 GitHub 拉取最新代码。本地配置（.env）和数据（data/）不受影响。
          </div>
        )}
      </div>

      <div className="btn-group" style={{ marginTop: 16 }}>
        {onBack && <button className="btn btn-secondary" onClick={onBack} disabled={loading}>返回首页</button>}
        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
          {loading && <span className="spinner" />}
          保存
        </button>
      </div>
    </div>
  );
}
