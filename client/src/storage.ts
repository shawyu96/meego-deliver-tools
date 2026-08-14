// =====================================================================
// 前端存储工具 — 从原 index.html 提取
// =====================================================================

const LS_KEY = 'meego_copy_config';
const SECRET_KEY = 'meego_copy_plugin_secret';

export function loadSaved(): Record<string, any> {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    const legacySecret = saved.plugin_secret;
    if (legacySecret) {
      sessionStorage.setItem(SECRET_KEY, legacySecret);
      delete saved.plugin_secret;
      localStorage.setItem(LS_KEY, JSON.stringify(saved));
    }
    const pluginSecret = sessionStorage.getItem(SECRET_KEY);
    if (pluginSecret) saved.plugin_secret = pluginSecret;
    return saved;
  } catch { return {}; }
}

export function saveConfig(data: Record<string, any>) {
  const saved = loadSaved();
  const next = { ...data };
  if (Object.prototype.hasOwnProperty.call(next, 'plugin_secret')) {
    if (next.plugin_secret) sessionStorage.setItem(SECRET_KEY, next.plugin_secret);
    else sessionStorage.removeItem(SECRET_KEY);
    delete next.plugin_secret;
  }
  delete saved.plugin_secret;
  Object.assign(saved, next);
  localStorage.setItem(LS_KEY, JSON.stringify(saved));
}

/** 从 localStorage + sessionStorage 合并出完整凭证 */
export function getCredentials() {
  const saved = loadSaved();
  return {
    base_url: saved.base_url || '',
    plugin_id: saved.plugin_id || '',
    plugin_secret: saved.plugin_secret || '',
    user_key: saved.user_key || '',
    space_key: saved.space_key || '',
    token_type: 0,
  };
}
