// =====================================================================
// 终端风格弹窗 — 合并检查更新 + 获取更新流程
// 打开后先调 checkUpdate API 显示版本对比，有新版本时自动连接 WebSocket
// 执行 git pull + npm install，全程在此弹窗内显示
// =====================================================================

import React, { useState, useEffect, useRef } from 'react';
import { checkUpdate, WSMessage } from '../api';

export interface TerminalModalProps {
  open: boolean;
  onClose: () => void;
  repoUrl: string;
  currentVersion: string;
}

type Phase = 'checking' | 'up-to-date' | 'updating' | 'done' | 'error';

export function TerminalModal({ open, onClose, repoUrl, currentVersion }: TerminalModalProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('checking');
  const [latestVersion, setLatestVersion] = useState('');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // 弹窗打开时：先检查更新
  useEffect(() => {
    if (!open) return;

    setLines([]);
    setPhase('checking');
    setLatestVersion('');
    setExitCode(null);

    setLines(prev => [...prev, '📋 正在检查更新...']);

    checkUpdate()
      .then(r => {
        setLatestVersion(r.latest_version || '未知');
        if (r.has_update) {
          setLines(prev => [...prev,
            `  当前版本: ${currentVersion || 'unknown'}`,
            `  最新版本: ${r.latest_version}`,
            '',
            '✅ 检测到新版本，开始获取更新...',
            '',
          ]);
          setPhase('updating');
          startUpdate();
        } else {
          setLines(prev => [...prev,
            `  当前版本: ${currentVersion || 'unknown'}`,
            `  最新版本: ${r.latest_version || currentVersion || 'unknown'}`,
            '',
            '✅ 当前已是最新版本，无需更新。',
          ]);
          setPhase('up-to-date');
        }
      })
      .catch(e => {
        setLines(prev => [...prev, '', `❌ 检查更新失败: ${e.message || '未知错误'}`]);
        setPhase('error');
      });

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function startUpdate() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.location.port || '3001';
    const wsUrl = `${protocol}//${host}:${port}/ws/update?repo_url=${encodeURIComponent(repoUrl)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        if (msg.type === 'stdout') {
          String(msg.data).split('\n').forEach(line => {
            if (line.trim()) setLines(prev => [...prev, line]);
          });
        } else if (msg.type === 'stderr') {
          String(msg.data).split('\n').forEach(line => {
            if (line.trim()) setLines(prev => [...prev, `\x1b[31m${line}\x1b[0m`]);
          });
        } else if (msg.type === 'exit') {
          setExitCode(Number(msg.data));
          setPhase('done');
          if (Number(msg.data) === 0) {
            setLines(prev => [...prev, '', '✅ 更新完成，请重启插件以应用最新代码。']);
          } else {
            setLines(prev => [...prev, '', `❌ 更新失败（退出码 ${msg.data}）`]);
          }
        } else if (msg.type === 'status' && msg.data === 'done') {
          // status done 在 exit 之前到达，不重复处理
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      setLines(prev => [...prev, '', '❌ WebSocket 连接失败']);
      setPhase('error');
      setExitCode(1);
    };
  }

  // 自动滚动到底部
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  if (!open) return null;

  const isFinished = phase === 'done' || phase === 'error' || phase === 'up-to-date';
  const titleText = {
    checking: '检查更新中',
    'up-to-date': '已是最新版本',
    updating: '获取更新中',
    done: exitCode === 0 ? '更新完成' : '更新失败',
    error: '发生错误',
  }[phase];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={isFinished ? onClose : undefined}
    >
      <div
        style={{
          width: '80%',
          maxWidth: 800,
          maxHeight: '70vh',
          background: '#1e1e1e',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 终端标题栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            background: '#2d2d2d',
            borderBottom: '1px solid #404040',
          }}
        >
          <span style={{ color: '#cccccc', fontSize: 13, fontFamily: 'monospace' }}>
            📟 插件更新 — {titleText}
          </span>
          {isFinished && (
            <button
              onClick={onClose}
              style={{
                background: '#404040',
                color: '#cccccc',
                border: 'none',
                borderRadius: 4,
                padding: '4px 12px',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'monospace',
              }}
            >
              关闭
            </button>
          )}
        </div>

        {/* 终端输出区域 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px',
            fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
            fontSize: 13,
            lineHeight: 1.5,
            color: '#00ff00',
          }}
        >
          {lines.map((line, i) => (
            <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {line.startsWith('\x1b[31m') ? (
                <span style={{ color: '#ff6b6b' }}>{line.replace(/\x1b\[\d+m/g, '')}</span>
              ) : (
                line
              )}
            </div>
          ))}
          {!isFinished && (
            <span style={{ animation: 'blink 1s infinite', color: '#00ff00' }}>▊</span>
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* 闪烁光标动画 */}
        <style>{`
          @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}
