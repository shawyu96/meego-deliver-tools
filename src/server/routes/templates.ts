// =====================================================================
// 模板路由 — 保存/查询/删除字段映射模板
// =====================================================================

import { Router } from 'express';
import { mappingTemplateRepo } from '../db/repositories.js';
import type { NewMappingTemplate } from '../db/schema.js';

const router = Router();

/** 保存映射模板 */
router.post('/templates', (req, res) => {
  try {
    const { name, mode, source_type, target_type, field_mappings } = req.body;
    if (!name || !mode || !field_mappings) {
      return res.status(400).json({ ok: false, error: '缺少必填字段: name, mode, field_mappings' });
    }
    const template = mappingTemplateRepo.create({
      name, mode,
      sourceType: source_type || null,
      targetType: target_type || null,
      fieldMappings: field_mappings,
    } as NewMappingTemplate);
    res.json({ ok: true, data: template });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 查询所有模板 */
router.get('/templates', (_req, res) => {
  try {
    const templates = mappingTemplateRepo.list();
    res.json({ ok: true, data: templates });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 查询单个模板 */
router.get('/templates/:id', (req, res) => {
  try {
    const template = mappingTemplateRepo.getById(Number(req.params.id));
    if (!template) return res.status(404).json({ ok: false, error: '模板不存在' });
    res.json({ ok: true, data: template });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** 删除模板 */
router.delete('/templates/:id', (req, res) => {
  try {
    mappingTemplateRepo.delete(Number(req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

export default router;
