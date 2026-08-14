// =====================================================================
// 认证路由 — 初始化凭证 + 获取空间列表 + 查询用户信息
// =====================================================================

import { Router } from 'express';
import { config } from '../config.js';
import { MeegoApi } from '../services/meego-api.js';

const router = Router();

/** 获取后端配置的默认凭证（前端可用来预填表单） */
router.get('/config', (_req, res) => {
  res.json({
    ok: true,
    data: {
      base_url: config.meego.baseUrl,
      plugin_id: config.meego.pluginId,
      token_type: config.meego.tokenType,
      user_key: config.meego.userKey,
      space_key: config.meego.spaceKey,
      // secret 不返回前端
    },
  });
});

function pickUserName(user: any): string {
  if (!user) return '';
  if (typeof user.name === 'string') return user.name;
  if (user.name && typeof user.name === 'object') return user.name.default || user.name.zh_cn || user.name.en_us || '';
  return user.name_cn || user.name_en || user.nickname || user.en_name || '';
}

/** 查询用户信息（验证凭证 + 解析 user_key → user_name，不依赖 space_key） */
router.post('/user-info', async (req, res) => {
  try {
    const { user_key } = req.body;
    if (!user_key) return res.status(400).json({ ok: false, error: '缺少必填字段: user_key' });
    const baseUrl = req.body.base_url || config.meego.baseUrl;
    const pluginId = req.body.plugin_id || config.meego.pluginId;
    const pluginSecret = req.body.plugin_secret || config.meego.pluginSecret;
    const tokenType = req.body.token_type ?? config.meego.tokenType;
    if (!pluginId || !pluginSecret || !user_key) {
      return res.status(400).json({ ok: false, error: '缺少必要参数: plugin_id, plugin_secret, user_key' });
    }
    const api = new MeegoApi(baseUrl);
    await api.initToken(pluginId, pluginSecret, user_key, tokenType);
    const users = await api.queryUsers([user_key]);
    const user = users.get(String(user_key));
    if (!user) return res.status(404).json({ ok: false, error: '用户未找到' });
    res.json({
      ok: true,
      data: {
        user_key: String(user_key),
        user_name: pickUserName(user),
        user_id: user.user_id || user.id || '',
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 初始化凭证 + 获取空间列表（不依赖 space_key） */
router.post('/init', async (req, res) => {
  try {
    const baseUrl = req.body.base_url || config.meego.baseUrl;
    const pluginId = req.body.plugin_id || config.meego.pluginId;
    const pluginSecret = req.body.plugin_secret || config.meego.pluginSecret;
    const userKey = req.body.user_key || config.meego.userKey;
    const tokenType = req.body.token_type ?? config.meego.tokenType;
    if (!pluginId || !pluginSecret || !userKey) {
      return res.status(400).json({ ok: false, error: '缺少必要参数: plugin_id, plugin_secret, user_key' });
    }
    const api = new MeegoApi(baseUrl);
    await api.initToken(pluginId, pluginSecret, userKey, tokenType);
    const spaces = await api.listSpaces(userKey);
    const users = await api.queryUsers([userKey]).catch(() => new Map());
    const user = users.get(String(userKey));
    res.json({
      ok: true,
      data: {
        spaces,
        user_name: pickUserName(user),
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 健康检查 */
router.get('/health', (_req, res) => {
  res.json({ ok: true, status: 'running' });
});

export default router;
