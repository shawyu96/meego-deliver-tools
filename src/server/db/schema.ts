import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/** 复制操作执行记录 */
export const copyRecords = sqliteTable('copy_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(new Date()),
  /** 复制方向 A / B / C */
  mode: text('mode').notNull(),
  /** 源工作项类型 */
  sourceType: text('source_type').notNull(),
  /** 源工作项 ID */
  sourceWorkItemId: text('source_work_item_id').notNull(),
  /** 源节点 ID */
  sourceNodeId: text('source_node_id'),
  /** 目标工作项类型 */
  targetType: text('target_type'),
  /** 目标工作项 ID */
  targetWorkItemId: text('target_work_item_id'),
  /** 目标节点 ID */
  targetNodeId: text('target_node_id'),
  /** 目标分组 relation_id */
  targetRelationId: text('target_relation_id'),
  /** 字段映射 JSON */
  fieldMappings: text('field_mappings', { mode: 'json' }),
  /** 执行状态: running / done / failed */
  status: text('status').notNull().default('running'),
  /** 总数 */
  total: integer('total').notNull().default(0),
  /** 成功数 */
  ok: integer('ok').notNull().default(0),
  /** 失败数 */
  fail: integer('fail').notNull().default(0),
  /** 执行结果 JSON */
  result: text('result', { mode: 'json' }),
  /** 错误信息 */
  error: text('error'),
});

/** 字段映射模板（可保存复用） */
export const mappingTemplates = sqliteTable('mapping_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(new Date()),
  name: text('name').notNull(),
  mode: text('mode').notNull(),
  sourceType: text('source_type'),
  targetType: text('target_type'),
  fieldMappings: text('field_mappings', { mode: 'json' }).notNull(),
});

/** OpenAPI 响应缓存 */
export const apiCache = sqliteTable('api_cache', {
  key: text('key').primaryKey(),
  data: text('data', { mode: 'json' }).notNull(),
  cachedAt: integer('cached_at', { mode: 'timestamp_ms' }).notNull().default(new Date()),
  ttlSec: integer('ttl_sec').notNull().default(300),
});

export type CopyRecord = typeof copyRecords.$inferSelect;
export type NewCopyRecord = typeof copyRecords.$inferInsert;
export type MappingTemplate = typeof mappingTemplates.$inferSelect;
export type NewMappingTemplate = typeof mappingTemplates.$inferInsert;
