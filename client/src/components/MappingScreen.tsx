// =====================================================================
// 字段映射页面
// =====================================================================

import React, { useState, useEffect } from 'react';
import { loadSaved, saveConfig } from '../storage';
import { genMapping } from '../api';

interface Props {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

const TEMPLATE_KEY = 'meego_mapping_templates';

function loadMappingTemplates(): any[] {
  try {
    const list = JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function saveMappingTemplates(list: any[]) {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(list));
}

function expandTargetRoleFields(fields: any[]): any[] {
  const expanded: any[] = [];
  fields.forEach(f => {
    if ((f.field_key === 'role_owners' || f.field_type_key === 'role_owners') && Array.isArray(f.role_assign) && f.role_assign.length) {
      f.role_assign.forEach((role: any) => {
        const roleKey = String(role.role || '').trim();
        if (!roleKey) return;
        expanded.push({
          ...f, field_key: `role_owners:${roleKey}`, field_name: role.name || roleKey,
          field_alias: role.name || roleKey, field_type_key: 'role_owners', role_assign: [],
          target_base_field: 'role_owners', target_role: roleKey, target_role_name: role.name || roleKey,
        });
      });
    } else {
      expanded.push(f);
    }
  });
  return expanded;
}

export function MappingScreen({ data, onNext, onBack }: Props) {
  const saved = loadSaved();
  const [sourceMeta, setSourceMeta] = useState<any[]>([]);
  const [targetMeta, setTargetMeta] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [sourceTypeKey, setSourceTypeKey] = useState('');
  const [targetTypeKey, setTargetTypeKey] = useState('');
  const [templates, setTemplates] = useState(loadMappingTemplates());
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const wi = { type: saved.wi_type, id: saved.wi_id };
        const r = await genMapping({
          base_url: saved.base_url, plugin_id: saved.plugin_id, plugin_secret: saved.plugin_secret,
          user_key: saved.user_key, space_key: saved.space_key,
          mode: 'A',
          source_work_item: wi,
          source_node_id: data.selectedSourceNode || saved.source_node_id,
          source_item_ids: data.selectedSubtasks,
          target_work_item: wi,
          target_relation_id: data.selectedTargetGroup,
          target_node_id: data.selectedTargetNode || saved.target_node_id || '',
          });
        const cfg = r as any;
        setSourceMeta(cfg.source_meta || []);
        setTargetMeta(expandTargetRoleFields(cfg.target_meta || []));
        setSourceTypeKey(cfg.source_type_key);
        setTargetTypeKey(cfg.target_type_key);
        setMappings([]);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function getAvailableSourceFields(currentIdx: number) {
    const selectedInOther = new Set<string>();
    mappings.forEach((m, i) => { if (i !== currentIdx && m.source_field) selectedInOther.add(m.source_field); });
    return sourceMeta.filter(f => !selectedInOther.has(f.field_key));
  }

  function getAvailableTargetFields(currentIdx: number) {
    const selectedInOther = new Set<string>();
    mappings.forEach((m, i) => { if (i !== currentIdx && m.target_field) selectedInOther.add(m.target_field); });
    return targetMeta.filter(f => !selectedInOther.has(f.field_key));
  }

  function addMapping(sourceKey?: string, targetKey?: string) {
    const src = sourceKey ? sourceMeta.find(f => f.field_key === sourceKey) : null;
    const tgt = targetKey ? targetMeta.find(f => f.field_key === targetKey) : null;
    setMappings(prev => [...prev, {
      source_field: src?.field_key || '', source_alias: src?.field_name || src?.field_alias || '',
      source_type: src?.field_type_key || '',
      target_field: tgt?.field_key || '', target_field_type: tgt?.field_type_key || '',
      target_alias: tgt?.field_name || tgt?.field_alias || '',
      target_base_field: tgt?.target_base_field || tgt?.field_key || '',
      target_role: tgt?.target_role || '', target_role_name: tgt?.target_role_name || '',
      source_value: '{{from_source}}', fixed_value: '', auto: false,
    }]);
  }

  function updateMapping(idx: number, field: string, value: any) {
    setMappings(prev => prev.map((m, i) => {
      if (i !== idx) return m;
      const updated = { ...m, [field]: value };
      if (field === 'source_field') {
        const sf = sourceMeta.find(f => f.field_key === value);
        updated.source_alias = sf?.field_name || sf?.field_alias || '';
        updated.source_type = sf?.field_type_key || '';
        if (value) updated.fixed_value = '';
      }
      if (field === 'target_field') {
        const tf = targetMeta.find(f => f.field_key === value);
        updated.target_alias = tf?.field_name || tf?.field_alias || '';
        updated.target_field_type = tf?.field_type_key || '';
        updated.target_base_field = tf?.target_base_field || tf?.field_key || '';
        updated.target_role = tf?.target_role || '';
        updated.target_role_name = tf?.target_role_name || '';
      }
      if (field === 'fixed_value' && String(value || '').trim()) {
        updated.source_field = ''; updated.source_alias = ''; updated.source_type = '';
      }
      return updated;
    }));
  }

  function removeMapping(idx: number) {
    setMappings(prev => prev.filter((_, i) => i !== idx));
  }

  function templateScope() { return `A:${sourceTypeKey || ''}:${targetTypeKey || ''}`; }
  function scopedTemplates() { const scope = templateScope(); return templates.filter(t => t.scope === scope); }
  function cloneMappings(rows: any[]) { return (rows || []).map(m => ({ ...m })); }

  function saveTemplate() {
    const valid = mappings.filter(m => m.target_field);
    if (!valid.length) { setError('至少需要一条目标字段映射后才能保存模板'); return; }
    const incomplete = valid.find(m => !m.source_field && !String(m.fixed_value || '').trim());
    if (incomplete) { setError('模板里每条映射也必须选择源字段，或填写固定值。'); return; }
    const name = templateName.trim() || `${sourceTypeKey} → ${targetTypeKey}`;
    const now = Date.now();
    const tpl = {
      id: selectedTemplateId || String(now), name, scope: templateScope(),
      mode: 'A', source_type_key: sourceTypeKey, target_type_key: targetTypeKey,
      mappings: cloneMappings(valid), updated_at: now,
    };
    const next = [...templates.filter(t => t.id !== tpl.id), tpl].sort((a, b) => b.updated_at - a.updated_at);
    saveMappingTemplates(next); setTemplates(next); setSelectedTemplateId(tpl.id); setTemplateName(name); setError('');
  }

  function applyTemplate(id: string) {
    const tpl = templates.find(t => t.id === id);
    setSelectedTemplateId(id); setTemplateName(tpl?.name || '');
    if (!tpl) return;
    const sourceKeys = new Set(sourceMeta.map(f => f.field_key));
    const targetKeys = new Set(targetMeta.map(f => f.field_key));
    const rows = cloneMappings(tpl.mappings)
      .filter(m => (!m.source_field || sourceKeys.has(m.source_field)) && targetKeys.has(m.target_field));
    setMappings(rows);
    setError(rows.length ? '' : '模板里的字段在当前映射上下文中都不可用，未应用任何映射。');
  }

  function deleteTemplate() {
    if (!selectedTemplateId) return;
    const next = templates.filter(t => t.id !== selectedTemplateId);
    saveMappingTemplates(next); setTemplates(next); setSelectedTemplateId(''); setTemplateName('');
  }

  function fieldName(f: any) { return f?.field_name || f?.field_alias || f?.field_key || ''; }
  function roleSummary(f: any) {
    const roles = f?.role_assign || [];
    if (!roles.length) return '';
    return roles.map((r: any) => r.name || r.role).filter(Boolean).slice(0, 6).join('、') + (roles.length > 6 ? ` 等 ${roles.length} 个角色` : '');
  }
  function targetRoleCount() { return targetMeta.filter(f => f.target_role).length; }

  function handleNext() {
    const valid = mappings.filter(m => m.target_field);
    if (!valid.length) { setError('至少需要一条映射'); return; }
    const incomplete = valid.find(m => !m.source_field && !String(m.fixed_value || '').trim());
    if (incomplete) { setError('每条映射都必须选择源字段，或填写固定值；不会自动兜底。'); return; }
    const conflict = valid.find(m => m.source_field && String(m.fixed_value || '').trim());
    if (conflict) { setError('同一条映射不能同时选择源字段和固定值；请保留一种来源。'); return; }
    saveConfig({ field_mappings: valid, target_type_key: targetTypeKey });
    onNext({ field_mappings: valid, target_type_key: targetTypeKey });
  }

  if (loading) return (
    <div className="card"><span className="spinner" /> 加载字段列表...</div>
  );

  return (
    <div className="card">
      <h2>字段映射
        <span className="badge badge-blue">{sourceTypeKey}</span>
        <span style={{ color: '#94a3b8', fontSize: 14 }}>→</span>
        <span className="badge badge-green">{targetTypeKey}</span>
      </h2>
      {error && <div className="msg msg-error">{error}</div>}

      <div className="template-toolbar">
        <div>
          <label>映射模板</label>
          <select value={selectedTemplateId} onChange={e => applyTemplate(e.target.value)}>
            <option value="">{scopedTemplates().length ? '选择已保存模板' : '当前类型暂无模板'}</option>
            {scopedTemplates().map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label>模板名称</label>
          <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder={`${sourceTypeKey || '源'} → ${targetTypeKey || '目标'}`} />
        </div>
        <button className="btn btn-secondary" onClick={saveTemplate} disabled={!mappings.some(m => m.target_field)}>{selectedTemplateId ? '更新' : '保存'}</button>
        <button className="btn btn-danger" onClick={deleteTemplate} disabled={!selectedTemplateId}>删除</button>
      </div>

      <div className="mapping-toolbar">
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>手动配置字段映射</div>
          <div className="text-sm" style={{ marginTop: 2 }}>
            {`源字段 ${sourceMeta.length} 个，目标新建页字段 ${targetMeta.length} 个，角色 ${targetRoleCount()} 个`}
          </div>
          <div className="text-sm" style={{ marginTop: 4, color: '#64748b' }}>
            目标字段只显示"新建页"可填写的字段/角色；详情页字段、系统字段和不可创建字段不会出现在这里。
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm btn-primary" onClick={() => addMapping()}>添加</button>
          <button className="btn btn-sm btn-secondary" onClick={() => setMappings([])} disabled={!mappings.length}>清空</button>
        </div>
      </div>

      {mappings.length === 0 && (
        <div className="msg msg-info" style={{ marginBottom: 12 }}>
          暂无映射。点击"添加映射"，手动选择源字段、目标字段，或给目标字段填写固定值。
        </div>
      )}

      {targetMeta.length === 0 && (
        <div className="msg msg-info" style={{ marginBottom: 12 }}>
          {`目标类型 ${targetTypeKey} 的新建页没有返回可映射字段/角色，因此目标字段列表为空。`}
        </div>
      )}

      {mappings.length > 0 && (
        <div className="mapping-list">
          {mappings.map((m, i) => {
            const availSrc = getAvailableSourceFields(i);
            const availTgt = getAvailableTargetFields(i);
            const srcField = sourceMeta.find(f => f.field_key === m.source_field);
            const tgtField = targetMeta.find(f => f.field_key === m.target_field);
            const hasSourceMapping = m.source_field && m.source_value === '{{from_source}}';
            return (
              <div key={i} className="mapping-card">
                <div className="mapping-card-header">
                  <div className="mapping-card-title">
                    <span className="index">{i + 1}</span>
                    <span className="mapping-summary">
                      {m.target_field
                        ? `${m.source_field ? (m.source_alias || m.source_field) : '固定值'} → ${m.target_alias || m.target_field}`
                        : '请选择目标字段'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {m.target_field && (tgtField?.is_required === 1 || tgtField?.is_required === true) && (
                      <span className="tag" style={{ background: '#fef2f2', color: '#dc2626', fontSize: 10 }}>必填</span>
                    )}
                    {!hasSourceMapping && m.fixed_value && (
                      <span className="tag" style={{ background: '#fefce8', color: '#a16207', fontSize: 10 }}>固定值</span>
                    )}
                    <button className="btn btn-sm btn-danger" onClick={() => removeMapping(i)}>删除</button>
                  </div>
                </div>
                <div className="mapping-card-body">
                  <div className="mapping-field-row">
                    <div className="field-side">
                      <div className="field-label">源字段</div>
                      <select value={m.source_field} onChange={e => updateMapping(i, 'source_field', e.target.value)}>
                        <option value="">（不映射，使用固定值）</option>
                        {availSrc.map(f => (
                          <option key={f.field_key} value={f.field_key}
                            disabled={mappings.some((mm, ii) => ii !== i && mm.source_field === f.field_key)}>
                            {f.field_name || f.field_alias || f.field_key}
                          </option>
                        ))}
                      </select>
                      {m.source_field && <div className="mapping-field-type">{srcField?.field_type_key || ''}</div>}
                    </div>
                    <div className="arrow-col">→</div>
                    <div className="field-side">
                      <div className="field-label">目标字段</div>
                      <select value={m.target_field} onChange={e => updateMapping(i, 'target_field', e.target.value)} disabled={targetMeta.length === 0}>
                        <option value="">{targetMeta.length ? '（选择新建页字段/角色）' : '（新建页无可用目标字段）'}</option>
                        {availTgt.map(f => (
                          <option key={f.field_key} value={f.field_key}
                            disabled={mappings.some((mm, ii) => ii !== i && mm.target_field === f.field_key)}>
                            {`${f.field_name || f.field_alias || f.field_key}${(f.is_required === 1 || f.is_required === true) ? ' *' : ''}`}
                          </option>
                        ))}
                      </select>
                      {m.target_field && (
                        <div className="mapping-field-type">
                          {`${tgtField?.field_type_key || ''}${tgtField?.target_role_name ? ' · 角色：' + tgtField.target_role_name : ''}${(tgtField?.is_required === 1 || tgtField?.is_required === true) ? ' · 必填' : ''}${roleSummary(tgtField) ? ' · ' + roleSummary(tgtField) : ''}`}
                        </div>
                      )}
                    </div>
                    <div className="fixed-col">
                      <div className="field-label">固定值</div>
                      <input value={m.fixed_value || ''} onChange={e => updateMapping(i, 'fixed_value', e.target.value)} placeholder="留空=取源值" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: '#64748b', userSelect: 'none' }}>查看所有可用字段</summary>
        <div className="field-panel">
          <div className="field-list">
            <div className="field-list-title">{`源字段 (${sourceTypeKey})`}</div>
            {sourceMeta.map(f => {
              const used = mappings.some(m => m.source_field === f.field_key);
              return (
                <div key={f.field_key} className={`field-list-row ${used ? 'used' : ''}`}>
                  <span className="field-list-name">{fieldName(f)}</span>
                  <span className="field-list-key">{f.target_role ? `${f.target_base_field}:${f.target_role}` : f.field_key}</span>
                  {used ? <span className="tag tag-blue">已选</span> : null}
                </div>
              );
            })}
          </div>
          <div className="field-list">
            <div className="field-list-title">{`目标新建页字段/角色 (${targetTypeKey})`}</div>
            {targetMeta.length === 0 && (
              <div className="field-list-row">
                <span className="field-list-name">新建页未返回可映射字段/角色</span>
                <span className="field-list-key">meta empty</span>
              </div>
            )}
            {targetMeta.map(f => {
              const used = mappings.some(m => m.target_field === f.field_key);
              return (
                <div key={f.field_key} className={`field-list-row ${used ? 'used' : ''}`}>
                  <span className="field-list-name">{fieldName(f)}</span>
                  <span className="field-list-key">{f.field_key}</span>
                  {(f.is_required === 1 || f.is_required === true)
                    ? <span className="tag" style={{ background: '#fef2f2', color: '#dc2626' }}>必填</span>
                    : used ? <span className="tag tag-blue">已选</span> : null}
                  {roleSummary(f) && <div className="field-list-role">{`角色：${roleSummary(f)}`}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </details>

      <div className="btn-group">
        <button className="btn btn-secondary" onClick={onBack}>返回</button>
        <button className="btn btn-primary" onClick={handleNext} disabled={!mappings.some(m => m.target_field)}>下一步</button>
      </div>
    </div>
  );
}
