// =====================================================================
// 字段序列化工具 — 从 copy-a.ts / copy-c.ts 提取的公共逻辑
// =====================================================================

export function parseMaybeJson(value: any): any {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

export function normalizeOwners(value: any): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch { /* 固定值可以用逗号或空白分隔 */ }
    return trimmed.split(/[\s,，]+/).map((v) => v.trim()).filter(Boolean);
  }
  return value ? [String(value)] : [];
}

export function normalizeOptionId(value: any): string {
  const parsed = parseMaybeJson(value);
  if (parsed && typeof parsed === 'object') {
    return String(parsed.option_id ?? parsed.value ?? parsed.key ?? parsed.id ?? '');
  }
  return String(value ?? '');
}

export function normalizeOptionIdList(value: any, objectItems: boolean): any[] {
  const parsed = parseMaybeJson(value);
  const rawList = Array.isArray(parsed) ? parsed : String(parsed ?? '').split(/[\s,，]+/);
  return rawList
    .map((item: any) => {
      const id = item && typeof item === 'object' ? item.option_id ?? item.value ?? item.key ?? item.id : String(item || '').trim();
      return id ? (objectItems ? { option_id: String(id) } : String(id)) : null;
    })
    .filter(Boolean);
}

export function normalizeSchedule(value: any): { start_time: number; end_time: number } | null {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) {
    if (parsed.length >= 2 && typeof parsed[0] !== 'object') {
      const start = Number(parsed[0]);
      const end = Number(parsed[1]);
      return Number.isFinite(start) && Number.isFinite(end) ? { start_time: start, end_time: end } : null;
    }
    if (parsed.length && typeof parsed[0] === 'object') return normalizeSchedule(parsed[0]);
  }
  if (parsed && typeof parsed === 'object') {
    const start = parsed.estimate_start_date ?? parsed.start_time ?? parsed.start ?? parsed.begin_time;
    const end = parsed.estimate_end_date ?? parsed.end_time ?? parsed.end ?? parsed.finish_time;
    const startNum = Number(start);
    const endNum = Number(end);
    return Number.isFinite(startNum) && Number.isFinite(endNum) ? { start_time: startNum, end_time: endNum } : null;
  }
  return null;
}

export function serializeFieldValue(fieldType: string, value: any): any {
  if (value === undefined || value === null || value === '') return null;
  const type = String(fieldType || '').replace(/_/g, '-').toLowerCase();

  if (type === 'role-owners') return parseMaybeJson(value);
  if (type === 'multi-user') return normalizeOwners(value);
  if (type === 'user') return normalizeOwners(value)[0] || null;
  if (type === 'schedule') return normalizeSchedule(value);
  if (type === 'multi-select') return normalizeOptionIdList(value, true);
  if (type === 'tree-multi-select') return normalizeOptionIdList(value, false);
  if (type === 'precise-date') {
    const parsed = parseMaybeJson(value);
    return typeof parsed === 'object' ? parsed : Number(value) || value;
  }
  if (type === 'workitem-related-multi-select') {
    const parsed = parseMaybeJson(value);
    const list = Array.isArray(parsed) ? parsed : String(parsed ?? '').split(/[\s,，]+/);
    return list.map((v: any) => Number(v) || v).filter(Boolean);
  }
  if (type === 'compound-field' || type === 'multi-user-compound-field') return parseMaybeJson(value);
  if (['select', 'radio', 'tree-select', 'workitem-related-select'].includes(type)) {
    const id = normalizeOptionId(value);
    return id ? { value: id } : null;
  }
  if (type === 'number') {
    const num = Number(value);
    return Number.isFinite(num) ? num : String(value);
  }
  if (type === 'bool' || type === 'boolean') {
    if (typeof value === 'boolean') return value;
    return String(value).toLowerCase() === 'true';
  }
  if (type === 'date') {
    const num = Number(value);
    return Number.isFinite(num) ? num : String(value);
  }
  return value;
}

export function getFieldValue(fields: any[] | undefined, fieldKey: string): any {
  const field = (fields || []).find((f: any) => f.field_key === fieldKey || f.field_alias === fieldKey);
  return field?.field_value;
}
