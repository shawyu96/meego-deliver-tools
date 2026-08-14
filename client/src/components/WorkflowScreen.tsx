// =====================================================================
// 工作流 + 选择源目标（子任务 → 子工作项分组）
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
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [nodeSubTasks, setNodeSubTasks] = useState<Record<string, any[]>>({});
  const [nodeLoading, setNodeLoading] = useState<Record<string, boolean>>({});
  const [selectedSubtasks, setSelectedSubtasks] = useState<number[]>([]);
  const [selectedTargetGroup, setSelectedTargetGroup] = useState<string | null>(null);
  const [selectedTargetNode, setSelectedTargetNode] = useState('');
  const [selectedSourceNode, setSelectedSourceNode] = useState('');
  const [error, setError] = useState('');

  const wf = data.workflow;
  const nodes = wf?.workflow_nodes || [];

  function resetRelationSelection() {
    setSelectedSubtasks([]); setSelectedTargetGroup(null);
    setSelectedTargetNode(''); setSelectedSourceNode(''); setError('');
  }

  function toggleNode(nodeKey: string) {
    const willExpand = !expandedNodes[nodeKey];
    setExpandedNodes(prev => ({ ...prev, [nodeKey]: willExpand }));
    if (willExpand && !nodeSubTasks[nodeKey] && !nodeLoading[nodeKey]) {
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

  function handleNext() {
    if (!selectedSubtasks.length) { setError('请至少选择一个源子任务'); return; }
    if (!selectedTargetGroup) { setError('请选择目标分组'); return; }
    saveConfig({ mode: 'A', source_kind: 'node_subtask', target_kind: 'sub_workitem_group', source_node_id: selectedSourceNode, source_item_ids: selectedSubtasks, target_node_id: selectedTargetNode, target_relation_id: selectedTargetGroup });
    onNext({ mode: 'A', selectedSubtasks, selectedTargetGroup, selectedTargetNode, selectedSourceNode });
  }

  return (
    <>
      <div className="card">
        <h2>选择子任务和对应关系</h2>
        <p className="text-sm" style={{ marginBottom: 12 }}>
          选择要复制的子任务，再选择复制到的子工作项分组。
        </p>
        <div className="msg msg-info" style={{ marginTop: 12, marginBottom: 0 }}>
          节点子任务 → 子工作项分组
        </div>
      </div>

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
                  {!isLoading && subtasks.length > 0 && (
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
                        子工作项分组（目标）
                      </div>
                      {groups.map((g: any) => (
                        <div key={g.relation_id} className="group" style={{
                          cursor: 'pointer',
                          borderColor: selectedTargetGroup === g.relation_id ? '#3b82f6' : '#bae6fd',
                        }} onClick={() => { setSelectedTargetGroup(g.relation_id); setSelectedTargetNode(node.state_key); }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input type="radio" checked={selectedTargetGroup === g.relation_id} onChange={() => { setSelectedTargetGroup(g.relation_id); setSelectedTargetNode(node.state_key); }} />
                            <h4 style={{ margin: 0 }}>{g.sub_workitem_group_name}</h4>
                            <span className="tag tag-blue">{`${g.workitems.length} 条`}</span>
                            <span className="text-sm">{g.relation_id.slice(0, 20)}...</span>
                          </div>
                        </div>
                      ))}
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
