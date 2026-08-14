// =====================================================================
// 工作流 + 选择源目标
// =====================================================================

import React, { useState } from 'react';
import { loadSaved, saveConfig } from '../storage';
import { api, getSubtasks } from '../api';

interface Props {
  data: { wi_id: string; wi_type: string; workflow: any; workitem: any };
  onNext: (data: any) => void;
  onBack: () => void;
}

function userDisplayName(user: any): string {
  if (!user) return '';
  if (typeof user === 'string') return /^\d{8,}$/.test(user) ? '用户未解析' : user;
  if (user.unresolved) return '用户未解析';
  if (user.name && typeof user.name === 'object') return user.name.zh_cn || user.name.default || user.name.en_us || '';
  return user.name_cn || user.zh_name || user.display_name || user.name || user.en_name || user.user_name || '用户未解析';
}

function subtaskOwnerText(task: any): string {
  const list = Array.isArray(task.owners) ? task.owners : Array.isArray(task.assignee) ? task.assignee : [];
  const names = list.map(userDisplayName).filter(Boolean);
  if (names.length) return names.join('、');
  return userDisplayName(task.owner) || '-';
}

export function WorkflowScreen({ data, onNext, onBack }: Props) {
  const saved = loadSaved();
  const [sourceKind, setSourceKind] = useState('node_subtask');
  const [targetKind, setTargetKind] = useState('sub_workitem_group');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [nodeSubTasks, setNodeSubTasks] = useState<Record<string, any[]>>({});
  const [nodeLoading, setNodeLoading] = useState<Record<string, boolean>>({});
  const [selectedSubtasks, setSelectedSubtasks] = useState<number[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedGroupItems, setSelectedGroupItems] = useState<number[]>([]);
  const [selectedTargetGroup, setSelectedTargetGroup] = useState<string | null>(null);
  const [selectedTargetNode, setSelectedTargetNode] = useState('');
  const [selectedSourceNode, setSelectedSourceNode] = useState('');
  const [hierarchyDepth, setHierarchyDepth] = useState(1);
  const [error, setError] = useState('');

  const wf = data.workflow;
  const nodes = wf?.workflow_nodes || [];

  function deriveMode(src = sourceKind, tgt = targetKind): string {
    if (src === 'node_subtask' && tgt === 'sub_workitem_group') return 'A';
    if (src === 'sub_workitem' && tgt === 'node_subtask') return 'B';
    if (src === 'sub_workitem_hierarchy' && tgt === 'sub_workitem_group') return 'C';
    return '';
  }

  const mode = deriveMode();

  function resetRelationSelection() {
    setSelectedSubtasks([]); setSelectedGroup(null); setSelectedGroupItems([]);
    setSelectedTargetGroup(null); setSelectedTargetNode(''); setSelectedSourceNode(''); setError('');
  }

  function selectSourceKind(kind: string) {
    setSourceKind(kind);
    if (kind === 'node_subtask') setTargetKind('sub_workitem_group');
    if (kind === 'sub_workitem') setTargetKind('node_subtask');
    if (kind === 'sub_workitem_hierarchy') setTargetKind('sub_workitem_group');
    resetRelationSelection();
  }

  function selectTargetKind(kind: string) {
    setTargetKind(kind);
    resetRelationSelection();
  }

  function toggleNode(nodeKey: string) {
    const willExpand = !expandedNodes[nodeKey];
    setExpandedNodes(prev => ({ ...prev, [nodeKey]: willExpand }));
    if (willExpand && sourceKind === 'node_subtask' && !nodeSubTasks[nodeKey] && !nodeLoading[nodeKey]) {
      setNodeLoading(prev => ({ ...prev, [nodeKey]: true }));
      getSubtasks({
        base_url: saved.base_url, plugin_id: saved.plugin_id, plugin_secret: saved.plugin_secret,
        user_key: saved.user_key, space_key: saved.space_key, token_type: 0,
        wi_type: data.wi_type, wi_id: data.wi_id, node_id: nodeKey,
      }).then(r => {
        const st = (r as any)?.subtasks || [];
        setNodeSubTasks(prev => ({ ...prev, [nodeKey]: st }));
        setNodeLoading(prev => ({ ...prev, [nodeKey]: false }));
      }).catch(() => {
        setNodeLoading(prev => ({ ...prev, [nodeKey]: false }));
      });
    }
  }

  function toggleSubtask(id: number, nodeKey?: string) {
    if (nodeKey) setSelectedSourceNode(nodeKey);
    setSelectedSubtasks(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleGroupItem(id: number) {
    setSelectedGroupItems(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function handleNext() {
    if (!mode) { setError('当前复制内容和复制到的组合暂不支持'); return; }
    if (mode === 'A') {
      if (!selectedSubtasks.length) { setError('请至少选择一个源子任务'); return; }
      if (!selectedTargetGroup) { setError('请选择目标分组'); return; }
      saveConfig({ mode, source_kind: sourceKind, target_kind: targetKind, source_node_id: selectedSourceNode, source_item_ids: selectedSubtasks, target_node_id: selectedTargetNode, target_relation_id: selectedTargetGroup });
    } else if (mode === 'B') {
      if (!selectedGroupItems.length) { setError('请至少选择一个源子工作项'); return; }
      if (!selectedTargetNode) { setError('请选择目标节点'); return; }
      saveConfig({ mode, source_kind: sourceKind, target_kind: targetKind, source_node_id: selectedSourceNode, source_item_ids: selectedGroupItems, target_node_id: selectedTargetNode, target_relation_id: selectedGroup });
    } else {
      if (!selectedGroup) { setError('请选择源分组'); return; }
      if (!selectedGroupItems.length) { setError('请至少选择一个源子工作项'); return; }
      if (!selectedTargetGroup) { setError('请选择目标分组'); return; }
      saveConfig({ mode, source_kind: sourceKind, target_kind: targetKind, source_relation_id: selectedGroup, source_node_id: selectedSourceNode, source_item_ids: selectedGroupItems, target_node_id: selectedTargetNode, target_relation_id: selectedTargetGroup, hierarchy_depth: hierarchyDepth });
    }
    onNext({ mode, sourceKind, targetKind, selectedSubtasks, selectedGroupItems, selectedGroup, selectedTargetGroup, selectedTargetNode, selectedSourceNode, hierarchyDepth });
  }

  return (
    <>
      <div className="card">
        <h2>选择子任务和对应关系</h2>
        <p className="text-sm" style={{ marginBottom: 12 }}>
          先选择要复制的内容，再选择复制到哪里。系统内部会按组合使用对应执行策略。
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div className="field-label">复制内容</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className={`btn ${sourceKind === 'node_subtask' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => selectSourceKind('node_subtask')}>子任务</button>
              <button className={`btn ${sourceKind === 'sub_workitem' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => selectSourceKind('sub_workitem')}>子工作项</button>
              <button className={`btn ${sourceKind === 'sub_workitem_hierarchy' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => selectSourceKind('sub_workitem_hierarchy')}>层级</button>
            </div>
          </div>
          <div>
            <div className="field-label">复制到</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className={`btn ${targetKind === 'node_subtask' ? 'btn-primary' : 'btn-secondary'}`} disabled={sourceKind !== 'sub_workitem'} onClick={() => selectTargetKind('node_subtask')}>子任务</button>
              <button className={`btn ${targetKind === 'sub_workitem_group' ? 'btn-primary' : 'btn-secondary'}`} disabled={sourceKind === 'sub_workitem'} onClick={() => selectTargetKind('sub_workitem_group')}>分组</button>
            </div>
          </div>
        </div>
        <div className="msg msg-info" style={{ marginTop: 12, marginBottom: 0 }}>
          {mode
            ? `当前组合：${sourceKind === 'node_subtask' ? '节点子任务' : sourceKind === 'sub_workitem_hierarchy' ? '子工作项层级' : '子工作项'} → ${targetKind === 'node_subtask' ? '节点子任务' : '子工作项分组'}`
            : '当前组合暂不支持'}
        </div>
      </div>

      {sourceKind === 'sub_workitem_hierarchy' && (
        <div className="card">
          <h2>层级范围</h2>
          <p className="text-sm" style={{ marginBottom: 10 }}>
            会先复制选中的源子工作项，再按深度继续复制其下级子工作项。默认深度 1，最多 3。
          </p>
          <div className="form-group">
            <label>复制深度</label>
            <select value={hierarchyDepth} onChange={e => setHierarchyDepth(Number(e.target.value))}>
              <option value={1}>1 · 只复制当前选中的子工作项</option>
              <option value={2}>2 · 复制一层下级</option>
              <option value={3}>3 · 复制两层下级</option>
            </select>
          </div>
        </div>
      )}

      <div className="card">
        <h2>工作流节点 <span className="badge">{`${data.wi_type}/${data.wi_id}`}</span></h2>
        {nodes.map((node: any) => {
          const isOpen = expandedNodes[node.state_key] === true;
          const subtasks = nodeSubTasks[node.state_key] || node.node_sub_task_detail || [];
          const isLoading = nodeLoading[node.state_key];
          const groups = node.node_sub_workitem_detail || [];
          return (
            <div key={node.state_key} className="node">
              <div className="node-header" onClick={() => toggleNode(node.state_key)}>
                <span className={`arrow ${isOpen ? 'open' : ''}`}>▶</span>
                <span style={{ fontWeight: 600 }}>{node.name || node.state_key}</span>
                <span className="tag tag-gray">{node.state_key}</span>
                <span className="text-sm">{`${subtasks.length} 子任务 · ${groups.length} 分组`}</span>
              </div>
              {isOpen && (
                <div className="node-body">
                  {isLoading && <p style={{ fontSize: 12, color: '#94a3b8' }}>加载中...</p>}
                  {sourceKind === 'node_subtask' && !isLoading && subtasks.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#475569' }}>子任务（源）</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => { setSelectedSubtasks(subtasks.map((s: any) => s.id)); setSelectedSourceNode(node.state_key); }}>全选</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => setSelectedSubtasks([])}>清空</button>
                      </div>
                      <table style={{ marginTop: 6 }}>
                        <thead><tr><th style={{ width: 40 }}></th><th>ID</th><th>名称</th><th>负责人</th></tr></thead>
                        <tbody>
                          {subtasks.map((s: any) => (
                            <tr key={s.id} className={selectedSubtasks.includes(s.id) ? 'selected' : ''} style={{ cursor: 'pointer' }} onClick={() => toggleSubtask(s.id, node.state_key)}>
                              <td><input type="checkbox" checked={selectedSubtasks.includes(s.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSubtask(s.id, node.state_key)} /></td>
                              <td>{s.id}</td>
                              <td>{s.name}</td>
                              <td>{subtaskOwnerText(s)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {groups.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#475569' }}>
                        {sourceKind === 'node_subtask' ? '子工作项分组（目标）' : sourceKind === 'sub_workitem_hierarchy' ? '子工作项分组（源 / 目标）' : '子工作项分组（源）'}
                      </div>
                      {groups.map((g: any) => (
                        <div key={g.relation_id} className="group" style={{
                          cursor: 'pointer',
                          borderColor: (mode === 'A' && selectedTargetGroup === g.relation_id) || (mode === 'B' && selectedGroup === g.relation_id) || (mode === 'C' && (selectedGroup === g.relation_id || selectedTargetGroup === g.relation_id)) ? '#3b82f6' : '#bae6fd',
                        }} onClick={() => {
                          if (mode === 'A') { setSelectedTargetGroup(g.relation_id); setSelectedTargetNode(node.state_key); }
                          else { setSelectedGroup(g.relation_id); setSelectedSourceNode(node.state_key); }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {mode === 'A'
                              ? <input type="radio" checked={selectedTargetGroup === g.relation_id} onChange={() => { setSelectedTargetGroup(g.relation_id); setSelectedTargetNode(node.state_key); }} />
                              : <input type="radio" checked={selectedGroup === g.relation_id} onChange={() => { setSelectedGroup(g.relation_id); setSelectedSourceNode(node.state_key); }} />}
                            <h4 style={{ margin: 0 }}>{g.sub_workitem_group_name}</h4>
                            <span className="tag tag-blue">{`${g.workitems.length} 条`}</span>
                            <span className="text-sm">{g.relation_id.slice(0, 20)}...</span>
                            {mode === 'C' && selectedGroup === g.relation_id && <span className="tag tag-green">源</span>}
                            {mode === 'C' && selectedTargetGroup === g.relation_id && <span className="tag tag-blue">目标</span>}
                          </div>
                          {mode === 'C' && (
                            <div style={{ marginTop: 8, display: 'flex', gap: 6, paddingLeft: 24 }}>
                              <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); setSelectedGroup(g.relation_id); setSelectedSourceNode(node.state_key); setSelectedGroupItems([]); }}>源分组</button>
                              <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); setSelectedTargetGroup(g.relation_id); setSelectedTargetNode(node.state_key); }}>目标组</button>
                            </div>
                          )}
                          {sourceKind !== 'node_subtask' && selectedGroup === g.relation_id && (
                            <div style={{ marginTop: 8, paddingLeft: 24 }}>
                              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                                <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); setSelectedGroupItems(g.workitems); }}>全选</button>
                                <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); setSelectedGroupItems([]); }}>清空</button>
                              </div>
                              {g.workitems.map((id: number) => (
                                <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0', cursor: 'pointer', fontSize: 13 }}>
                                  <input type="checkbox" checked={selectedGroupItems.includes(id)} onChange={(e) => { e.stopPropagation(); toggleGroupItem(id); }} />
                                  {`#${id}`}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {targetKind === 'node_subtask' && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#475569' }}>目标节点</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {nodes.map((n: any) => (
                          <button key={n.state_key} className={`btn btn-sm ${selectedTargetNode === n.state_key ? 'btn-primary' : 'btn-secondary'}`} title={n.name || n.state_key} onClick={() => setSelectedTargetNode(n.state_key)}>
                            {n.name || n.state_key}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {error && <div className="msg msg-error">{error}</div>}
        <div className="btn-group">
          <button className="btn btn-secondary" onClick={onBack}>返回</button>
          <button className="btn btn-primary" onClick={handleNext}>下一步</button>
        </div>
      </div>
    </>
  );
}
