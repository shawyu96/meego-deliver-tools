// =====================================================================
// 首页
// =====================================================================

import React from 'react';
import { loadSaved } from '../storage';

export function HomeScreen({ onOpenCopyTool, onOpenUpdate }: { onOpenCopyTool: () => void; onOpenUpdate: () => void }) {
  const saved = loadSaved();
  const hasConfig = Boolean(saved.plugin_id && saved.plugin_secret && saved.user_key);

  return (
    <div className="card">
      <h2>工具入口</h2>
      <p className="text-sm" style={{ marginBottom: 14 }}>
        把常用实施能力收纳在这里。凭证统一放到全局配置，具体工具只处理自己的业务流程。
      </p>
      {!hasConfig && (
        <div className="msg msg-info">还没有全局配置。进入工具前需要先配置插件凭证和 User Key。</div>
      )}
      <div className="tool-grid">
        <div className="tool-card" onClick={onOpenCopyTool}>
          <div className="tool-title">节点任务复制</div>
          <div className="tool-desc">
            在同一个工作项内将节点子任务复制为子工作项。
          </div>
          <div className="tool-meta">
            <span className="tag tag-blue">字段映射</span>
            <span className="tag tag-green">批量执行</span>
          </div>
        </div>
        <div className="tool-card" onClick={onOpenUpdate}>
          <div className="tool-title">插件更新</div>
          <div className="tool-desc">
            从 GitHub 仓库拉取最新代码，实时显示更新进度。
          </div>
          <div className="tool-meta">
            <span className="tag tag-blue">版本检查</span>
            <span className="tag tag-green">实时进度</span>
          </div>
        </div>
      </div>
    </div>
  );
}
