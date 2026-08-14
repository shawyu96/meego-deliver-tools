// =====================================================================
// 插件更新页面 — 独立入口，从首页进入
// 对应需求：插件更新功能界面显示优化
// 1. 显示代码仓库地址（默认值，用户可核对修改）
// 2. 点击更新后实时显示更新进度（SSE）
// =====================================================================

import React, { useState, useEffect, useRef } from 'react';
import { getVersion, checkUpdate, getUpdateProgress, getRepoUrl, saveRepoUrl } from '../api';

export function UpdateScreen({ onBack }: { onBack: () => void }) {
  const [currentVersion, setCurrentVersion] = useState('');
  const [latestVersion, setLatestVersion] = useState('');
  const [hasUpdate, setHasUpdate] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');

  // 仓库地址（从后端加载，用户可修改，保存后持久化）
  const [repoUrl, setRepoUrl] = useState('');
  const [repoUrlLoaded, setRepoUrlLoaded] = useState(false);

  // 实时更新进度
  const [progressSteps, setProgressSteps] = useState<{ step: string; status: string; message: string; step_index: number; total_steps: number }[]>([]);

  // SSE AbortController 引用，用于取消更新
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getVersion().then(r => setCurrentVersion(r.version)).catch(() => {});
    getRepoUrl()
      .then(r => { setRepoUrl(r.repo_url || ''); })
      .catch(() => { setRepoUrl('https://github.com/shawyu96/meego-deliver-tools.git'); })
      .finally(() => setRepoUrlLoaded(true));
  }, []);

  // 组件卸载时取消 SSE 连接
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
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
    setProgressSteps([]);
    try {
      // 先保存仓库地址到后端
      if (repoUrl) await saveRepoUrl(repoUrl).catch(() => {});
      // 使用 SSE 实时获取进度
      abortRef.current = getUpdateProgress(
        repoUrl,
        (step) => {
          setProgressSteps(prev => [...prev, step]);
        },
        (success, message) => {
          if (success) {
            setUpdateMsg('更新完成，请重启插件以应用最新代码。');
            setCurrentVersion(latestVersion);
            setHasUpdate(false);
          } else {
            setUpdateMsg('更新失败: ' + message);
          }
          setUpdating(false);
          abortRef.current = null;
        },
      );
    } catch (e: any) {
      setUpdateMsg('更新失败: ' + (e.message || '未知错误'));
      setUpdating(false);
    }
  }

  function handleCancelUpdate() {
    abortRef.current?.abort();
    abortRef.current = null;
    setUpdating(false);
    setUpdateMsg('更新已取消。');
  }

  return (
    <div className="card">
      <h2>插件更新</h2>
      <p className="text-sm" style={{ marginBottom: 14 }}>
        从 GitHub 仓库拉取最新代码。本地配置（.env）和数据（data/）不受影响。
      </p>

      {/* 版本信息 */}
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>版本信息</label>
        <div className="text-sm" style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
          当前版本: <b>{currentVersion || '加载中…'}</b>
          {latestVersion && <> ｜ 最新版本: <b>{latestVersion}</b></>}
          {hasUpdate && <span style={{ color: '#dc2626', fontWeight: 600 }}> ｜ 有新版本可用</span>}
        </div>
      </div>

      {/* 仓库地址输入框 */}
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>代码仓库地址</label>
        <input
          value={repoUrl}
          onChange={e => setRepoUrl(e.target.value)}
          placeholder="https://github.com/shawyu96/meego-deliver-tools.git"
          disabled={updating || !repoUrlLoaded}
          onBlur={() => { if (repoUrl) saveRepoUrl(repoUrl).catch(() => {}); }}
        />
        <div className="text-sm" style={{ marginTop: 4, color: '#94a3b8' }}>
          默认: https://github.com/shawyu96/meego-deliver-tools.git — 可核对修改后自动保存
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="btn-group" style={{ marginBottom: 8, justifyContent: 'flex-start' }}>
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
        {updating && (
          <button className="btn btn-danger" onClick={handleCancelUpdate}>
            取消
          </button>
        )}
      </div>

      {/* 实时更新进度 */}
      {progressSteps.length > 0 && (
        <div className="msg msg-info" style={{ marginTop: 4, maxHeight: 300, overflowY: 'auto' }}>
          {progressSteps.map((s, i) => (
            <div key={i} style={{ padding: '2px 0', opacity: s.status === 'skipped' ? 0.5 : 1 }}>
              {s.status === 'done' ? '✅' : s.status === 'error' ? '❌' : s.status === 'skipped' ? '⏭️' : '⏳'}{' '}
              [{s.step_index}/{s.total_steps}] {s.step}: {s.status}
              {s.message ? ` — ${s.message.slice(0, 120)}` : ''}
            </div>
          ))}
        </div>
      )}

      {/* 状态消息 */}
      {updateMsg && (
        <div className={`msg ${updateMsg.includes('失败') ? 'msg-error' : 'msg-info'}`} style={{ marginTop: 4 }}>
          {updateMsg}
        </div>
      )}

      {hasUpdate && !updating && (
        <div className="msg msg-info" style={{ marginTop: 4 }}>
          检测到新版本，点击「立即更新」将从 GitHub 拉取最新代码。
        </div>
      )}

      <div className="btn-group">
        <button className="btn btn-secondary" onClick={onBack}>返回首页</button>
      </div>
    </div>
  );
}
