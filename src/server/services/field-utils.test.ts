import { describe, it, expect } from 'vitest';
import {
  parseMaybeJson,
  normalizeOwners,
  normalizeOptionId,
  normalizeOptionIdList,
  normalizeSchedule,
  serializeFieldValue,
  getFieldValue,
} from '../services/field-utils.js';

// =====================================================================
// Meego 插件 OpenAPI 字段序列化工具 — 单元测试
// 依据 Meego OpenAPI 文档中字段类型定义编写
// =====================================================================

describe('parseMaybeJson', () => {
  it('直接返回非字符串值', () => {
    expect(parseMaybeJson(123)).toBe(123);
    expect(parseMaybeJson(null)).toBe(null);
    expect(parseMaybeJson({ a: 1 })).toEqual({ a: 1 });
  });

  it('解析合法 JSON 字符串', () => {
    expect(parseMaybeJson('[1,2,3]')).toEqual([1, 2, 3]);
    expect(parseMaybeJson('{"key":"val"}')).toEqual({ key: 'val' });
  });

  it('非 JSON 字符串原样返回', () => {
    expect(parseMaybeJson('hello')).toBe('hello');
    expect(parseMaybeJson('')).toBe('');
  });
});

describe('normalizeOwners', () => {
  it('数组直接清洗', () => {
    expect(normalizeOwners(['1', '2', ''])).toEqual(['1', '2']);
    expect(normalizeOwners([123, '456'])).toEqual(['123', '456']);
  });

  it('逗号分隔字符串拆分', () => {
    expect(normalizeOwners('1, 2，3')).toEqual(['1', '2', '3']);
    expect(normalizeOwners('1 2 3')).toEqual(['1', '2', '3']);
  });

  it('JSON 数组字符串解析', () => {
    expect(normalizeOwners('["1","2"]')).toEqual(['1', '2']);
  });

  it('空值返回空数组', () => {
    expect(normalizeOwners('')).toEqual([]);
    expect(normalizeOwners(null)).toEqual([]);
    expect(normalizeOwners(undefined)).toEqual([]);
  });

  it('单个值包装成数组', () => {
    expect(normalizeOwners(12345)).toEqual(['12345']);
  });
});

describe('normalizeOptionId', () => {
  it('对象取 option_id', () => {
    expect(normalizeOptionId({ option_id: 'opt1' })).toBe('opt1');
    expect(normalizeOptionId({ value: 'v1' })).toBe('v1');
    expect(normalizeOptionId({ id: 'i1' })).toBe('i1');
  });

  it('字符串直接返回', () => {
    expect(normalizeOptionId('opt2')).toBe('opt2');
  });

  it('空值返回空字符串', () => {
    expect(normalizeOptionId(null)).toBe('');
    expect(normalizeOptionId(undefined)).toBe('');
  });
});

describe('normalizeOptionIdList', () => {
  it('对象数组转 option_id 对象数组', () => {
    const result = normalizeOptionIdList([{ option_id: 'a' }, { option_id: 'b' }], true);
    expect(result).toEqual([{ option_id: 'a' }, { option_id: 'b' }]);
  });

  it('字符串数组转纯字符串数组', () => {
    expect(normalizeOptionIdList(['a', 'b'], false)).toEqual(['a', 'b']);
  });

  it('逗号分隔字符串拆分', () => {
    expect(normalizeOptionIdList('a, b, c', false)).toEqual(['a', 'b', 'c']);
  });

  it('空值过滤', () => {
    expect(normalizeOptionIdList(['a', '', 'b'], false)).toEqual(['a', 'b']);
  });
});

describe('normalizeSchedule', () => {
  it('[start, end] 数字数组', () => {
    expect(normalizeSchedule([1000, 2000])).toEqual({ start_time: 1000, end_time: 2000 });
  });

  it('对象含 start_time/end_time', () => {
    expect(normalizeSchedule({ start_time: 100, end_time: 200 })).toEqual({ start_time: 100, end_time: 200 });
  });

  it('对象含 estimate_start_date/estimate_end_date', () => {
    expect(normalizeSchedule({ estimate_start_date: 1, estimate_end_date: 2 })).toEqual({ start_time: 1, end_time: 2 });
  });

  it('嵌套数组取第一个元素', () => {
    expect(normalizeSchedule([{ start_time: 10, end_time: 20 }])).toEqual({ start_time: 10, end_time: 20 });
  });

  it('无效值返回 null', () => {
    expect(normalizeSchedule(null)).toBe(null);
    expect(normalizeSchedule('invalid')).toBe(null);
    expect(normalizeSchedule([NaN, NaN])).toBe(null);
  });
});

describe('serializeFieldValue', () => {
  it('空值返回 null', () => {
    expect(serializeFieldValue('text', '')).toBe(null);
    expect(serializeFieldValue('text', null)).toBe(null);
    expect(serializeFieldValue('text', undefined)).toBe(null);
  });

  it('multi-user 类型 → normalizeOwners', () => {
    expect(serializeFieldValue('multi_user', '1,2,3')).toEqual(['1', '2', '3']);
  });

  it('user 类型 → 取第一个 user_key', () => {
    expect(serializeFieldValue('user', '1,2')).toBe('1');
    expect(serializeFieldValue('user', 'only')).toBe('only');
  });

  it('schedule 类型 → normalizeSchedule', () => {
    expect(serializeFieldValue('schedule', [1000, 2000])).toEqual({ start_time: 1000, end_time: 2000 });
  });

  it('multi-select 类型 → option_id 对象数组', () => {
    expect(serializeFieldValue('multi_select', ['a', 'b'])).toEqual([{ option_id: 'a' }, { option_id: 'b' }]);
  });

  it('tree-multi-select 类型 → 纯字符串数组', () => {
    expect(serializeFieldValue('tree_multi_select', ['x', 'y'])).toEqual(['x', 'y']);
  });

  it('select 类型 → { value: option_id }', () => {
    expect(serializeFieldValue('select', 'opt1')).toEqual({ value: 'opt1' });
    expect(serializeFieldValue('radio', { option_id: 'r1' })).toEqual({ value: 'r1' });
  });

  it('number 类型 → 数字', () => {
    expect(serializeFieldValue('number', '42')).toBe(42);
    expect(serializeFieldValue('number', 'abc')).toBe('abc');
  });

  it('bool 类型 → boolean', () => {
    expect(serializeFieldValue('bool', 'true')).toBe(true);
    expect(serializeFieldValue('bool', 'false')).toBe(false);
    expect(serializeFieldValue('boolean', true)).toBe(true);
  });

  it('date 类型 → 数字或字符串', () => {
    expect(serializeFieldValue('date', '1700000000')).toBe(1700000000);
    expect(serializeFieldValue('date', '2024-01-01')).toBe('2024-01-01');
  });

  it('role-owners 类型 → parseMaybeJson', () => {
    expect(serializeFieldValue('role_owners', '[{"role":"dev","owners":["1"]}]')).toEqual([{ role: 'dev', owners: ['1'] }]);
  });

  it('未知类型 → 原值返回', () => {
    expect(serializeFieldValue('custom_type', 'hello')).toBe('hello');
  });
});

describe('getFieldValue', () => {
  it('按 field_key 查找', () => {
    const fields = [
      { field_key: 'name', field_value: 'test' },
      { field_key: 'status', field_value: 'open' },
    ];
    expect(getFieldValue(fields, 'name')).toBe('test');
    expect(getFieldValue(fields, 'status')).toBe('open');
  });

  it('按 field_alias 查找', () => {
    const fields = [{ field_key: 'f1', field_alias: 'alias1', field_value: 42 }];
    expect(getFieldValue(fields, 'alias1')).toBe(42);
  });

  it('未找到返回 undefined', () => {
    expect(getFieldValue([], 'x')).toBeUndefined();
    expect(getFieldValue(undefined, 'x')).toBeUndefined();
  });
});
