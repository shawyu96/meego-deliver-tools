import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';

// Mock storage 和 api 模块，避免依赖 localStorage 和网络
vi.mock('../storage', () => ({
  loadSaved: () => ({
    base_url: 'https://project.feishu.cn',
    plugin_id: '',
    plugin_secret: '',
    user_key: '',
  }),
  saveConfig: vi.fn(),
}));

vi.mock('../api', () => ({
  api: vi.fn(),
  getVersion: vi.fn().mockResolvedValue({ version: '1.0.0' }),
  getRepoUrl: vi.fn().mockResolvedValue({ repo_url: '' }),
  saveRepoUrl: vi.fn().mockResolvedValue({}),
}));

import { ConfigScreen } from './ConfigScreen';

function render() {
  const onNext = vi.fn();
  const onBack = vi.fn();
  const html = renderToString(
    React.createElement(ConfigScreen, { onNext, onBack })
  );
  return { html, onNext, onBack };
}

describe('ConfigScreen — 返回按钮', () => {
  it('渲染文案为"返回"的按钮（非"返回首页"）', () => {
    const { html } = render();
    expect(html).toContain('返回</button>');
    expect(html).not.toContain('返回首页</button>');
  });

  it('返回按钮带有 config-back-btn 类名（标识右上角位置）', () => {
    const { html } = render();
    expect(html).toContain('config-back-btn');
  });

  it('返回按钮位于 config-header 内（标题右侧右上角）', () => {
    const { html } = render();
    // config-header 应该包含返回按钮
    const headerStart = html.indexOf('config-header');
    const headerEnd = html.indexOf('</div>', headerStart);
    const headerSection = html.substring(headerStart, headerEnd);
    expect(headerSection).toContain('config-back-btn');
  });

  it('底部 btn-group 中不再包含返回按钮', () => {
    const { html } = render();
    // 找到 btn-group 区域
    const btnGroupIdx = html.indexOf('btn-group');
    if (btnGroupIdx !== -1) {
      const btnGroupEnd = html.indexOf('</div>', btnGroupIdx);
      const btnGroupSection = html.substring(btnGroupIdx, btnGroupEnd);
      expect(btnGroupSection).not.toContain('config-back-btn');
      expect(btnGroupSection).not.toContain('返回</button>');
    }
  });
});
