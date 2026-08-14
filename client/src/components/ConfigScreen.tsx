// =====================================================================
// 全局配置页面 — 凭证配置 + 插件更新区域
// 更新功能：单个「检查并更新」按钮，点击后弹窗显示完整流程
// =====================================================================

import React, { useState, useEffect } from 'react';
import { loadSaved, saveConfig } from '../storage';
import { api, getVersion, getRepoUrl, saveRepoUrl } from '../api';
import { TerminalModal } from './TerminalModal';

export function ConfigScreen({ onNext, onBack }: { onNext: (spaces: any[]) => void; onBack?: () => void }) {
  const saved = loadSaved();
  const [baseUrl, setBaseUrl] = useState(saved.base_url || 'https://project.feishu.cn');
  const [pluginId, setPluginId] = useState(saved.plugin_id || '');
  const [pluginSecret, setPluginSecret] = useState(saved.plugin_secret || '');
  const [userKey, setUserKey] = useState(saved.user_key || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ======================== 插件更新状态 ========================
  const [currentVersion, setCurrentVersion] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [repoUrlLoaded, setRepoUrlLoaded] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  // 加载版本和仓库地址
  useEffect(() => {
    getVersion().then(r => setCurrentVersion(r.version)).catch(() => {});
    getRepoUrl()
      .then(r => { setRepoUrl(r.repo_url || ''); })
      .catch(() => { setRepoUrl('https://github.com/shawyu96/meego-deliver-tools.git'); })
      .finally(() => setRepoUrlLoaded(true));
  }, []);

  function handleCheckAndUpdate() {
    if (repoUrl) saveRepoUrl(repoUrl).catch(() => {});
    setTerminalOpen(true);
  }

  function handleTerminalClose() {
    setTerminalOpen(false);
    // 更新完成后重新加载版本
    getVersion().then(r => setCurrentVersion(r.version)).catch(() => {});
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
      console.error('[ConfigScreen] 拉取空间失败:', e.message);
    }
    setLoading(false);
    onNext(spaces);
  }

  return (
    <div className="card">
      <div className="config-header">
        <h2>全局配置</h2>
        {onBack && (
          <button
            className="btn btn-secondary btn-sm config-back-btn"
            onClick={onBack}
            disabled={loading}
          >
            返回
          </button>
        )}
      </div>
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

      <div className="btn-group" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
        {loading && <span className="spinner" />}
          保存
          </button>
        </div>

      {/* ======================= 插件更新区域 ======================= */}
      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

      <h2>插件更新</h2>
      <p className="text-sm" style={{ marginBottom: 14 }}>
        从 GitHub 仓库拉取最新代码。本地配置（.env）和数据（data/）不受影响。
      </p>

      {/* 版本信息 */}
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>版本信息</label>
        <div className="text-sm" style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
          当前版本: <b>{currentVersion || '加载中…'}</b>
        </div>
      </div>

      {/* 仓库地址输入框 */}
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>代码仓库地址</label>
        <input
          value={repoUrl}
          onChange={e => setRepoUrl(e.target.value)}
          placeholder="https://github.com/shawyu96/meego-deliver-tools.git"
          disabled={!repoUrlLoaded || terminalOpen}
          onBlur={() => { if (repoUrl) saveRepoUrl(repoUrl).catch(() => {}); }}
        />
      </div>

      {/* 操作按钮 — 合并为单个按钮 */}
      <div className="btn-group" style={{ marginBottom: 8, justifyContent: 'flex-end' }}>
        <button
          className="btn btn-primary"
          onClick={handleCheckAndUpdate}
          disabled={terminalOpen || !repoUrlLoaded}
        >
          检查并更新
        </button>
      </div>

      {/* 终端弹窗 — 先检查更新，有新版本时自动获取更新 */}
      <TerminalModal
        open={terminalOpen}
        onClose={handleTerminalClose}
        repoUrl={repoUrl}
        currentVersion={currentVersion}
      />
    </div>
  );
}
