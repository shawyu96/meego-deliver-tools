import { db, schema } from './client.js';
import { sql } from 'drizzle-orm';
import { copyRecords, mappingTemplates } from './schema.js';
import { eq, desc } from 'drizzle-orm';

/** 复制记录仓库 */
export const copyRecordRepo = {
  create(data: schema.NewCopyRecord) {
    return db.insert(copyRecords).values(data).returning().get();
  },
  update(id: number, data: Partial<schema.NewCopyRecord>) {
    return db.update(copyRecords).set(data).where(eq(copyRecords.id, id)).returning().get();
  },
  list(limit = 50) {
    return db.select().from(copyRecords).orderBy(desc(copyRecords.createdAt)).limit(limit).all();
  },
  getById(id: number) {
    return db.select().from(copyRecords).where(eq(copyRecords.id, id)).get();
  },
};

/** 映射模板仓库 */
export const mappingTemplateRepo = {
  create(data: schema.NewMappingTemplate) {
    return db.insert(mappingTemplates).values(data).returning().get();
  },
  list() {
    return db.select().from(mappingTemplates).orderBy(desc(mappingTemplates.createdAt)).all();
  },
  getById(id: number) {
    return db.select().from(mappingTemplates).where(eq(mappingTemplates.id, id)).get();
  },
  delete(id: number) {
    return db.delete(mappingTemplates).where(eq(mappingTemplates.id, id)).returning().get();
  },
};

/** 初始化表（开发时用） */
export function initDb() {
  // drizzle-kit migrate 的运行时版本
  db.run(sql`
    CREATE TABLE IF NOT EXISTS copy_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      mode TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_work_item_id TEXT NOT NULL,
      source_node_id TEXT,
      target_type TEXT,
      target_work_item_id TEXT,
      target_node_id TEXT,
      target_relation_id TEXT,
      field_mappings TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      total INTEGER NOT NULL DEFAULT 0,
      ok INTEGER NOT NULL DEFAULT 0,
      fail INTEGER NOT NULL DEFAULT 0,
      result TEXT,
      error TEXT
    )
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS mapping_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      name TEXT NOT NULL,
      mode TEXT NOT NULL,
      source_type TEXT,
      target_type TEXT,
      field_mappings TEXT NOT NULL
    )
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS api_cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      ttl_sec INTEGER NOT NULL DEFAULT 300
    )
  `);
}
