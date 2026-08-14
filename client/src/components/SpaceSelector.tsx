// =====================================================================
// 右上角空间选择器 — 下拉切换当前 space_key
// =====================================================================

import React, { useState, useRef, useEffect } from 'react';
import { loadSaved, saveConfig } from '../storage';

interface Props {
  spaces: any[];
  selected: string;
  onSelect: (spaceKey: string) => void;
  onRefresh: () => void;
  loading?: boolean;
}

export function SpaceSelector({ spaces, selected, onSelect, onRefresh, loading }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const current = spaces.find((s) => s.simple_name === selected);
  const label = current ? (current.name || current.simple_name) : (selected || '选择空间');

  return (
    <div className="space-selector" ref={ref}>
      <button
        className="btn btn-secondary space-trigger"
        onClick={() => setOpen(!open)}
        disabled={loading}
      >
        {loading && <span className="spinner" />}
        <span className="space-icon">📁</span>
        <span className="space-label-text">{label}</span>
        <span className="space-caret">▾</span>
      </button>
      {open && (
        <div className="space-dropdown">
          <div className="space-dropdown-header">
            <span className="text-sm">选择空间</span>
            <button className="btn btn-secondary" onClick={() => { setOpen(false); onRefresh(); }}>
              刷新
            </button>
          </div>
          {spaces.length === 0 && (
            <div className="space-dropdown-empty">未找到可访问的空间</div>
          )}
          {spaces.map((s) => (
            <div
              key={s.project_key}
              className={'space-dropdown-item' + (selected === s.simple_name ? ' active' : '')}
              onClick={() => {
                saveConfig({ space_key: s.simple_name });
                onSelect(s.simple_name);
                setOpen(false);
              }}
            >
              <span className="space-dropdown-name">{s.name || s.simple_name}</span>
              <span className="space-dropdown-simple">{s.simple_name}</span>
              {selected === s.simple_name && <span className="space-check">✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
