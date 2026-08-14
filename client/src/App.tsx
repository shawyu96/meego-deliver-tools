// =====================================================================
// 主应用 — 步骤路由 + 状态管理
// =====================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { loadSaved, saveConfig } from './storage';
import { api } from './api';
import { StepNav } from './components/StepNav';
import { HomeScreen } from './components/HomeScreen';
import { ConfigScreen } from './components/ConfigScreen';
import { SpaceSelector } from './components/SpaceSelector';
import { WorkItemScreen } from './components/WorkItemScreen';
import { WorkflowScreen } from './components/WorkflowScreen';
import { MappingScreen } from './components/MappingScreen';
import { ExecuteScreen } from './components/ExecuteScreen';

type Step = 'home' | 'config' | 'workitem' | 'workflow' | 'mapping' | 'execute';

export default function App() {
  const [step, setStep] = useState<Step>('home');
  const [stepDone, setStepDone] = useState(-1);
  const [spaces, setSpaces] = useState<any[]>(loadSaved().spaces || []);
  const [currentSpace, setCurrentSpace] = useState<string>(loadSaved().space_key || '');
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [workflowData, setWorkflowData] = useState<any>(null);
  const [flowData, setFlowData] = useState<any>(null);
  const [mappingData, setMappingData] = useState<any>(null);
  const [workItemCache, setWorkItemCache] = useState<any>(null);
  const [afterConfig, setAfterConfig] = useState<Step>('home');

  useEffect(() => {
    const saved = loadSaved();
    if (saved.spaces?.length) setSpaces(saved.spaces);
    if (saved.space_key) setCurrentSpace(saved.space_key);
  }, []);

  function goToStep(s: Step) { setStep(s); }

  function openConfig(nextStep: Step = 'home') {
    setAfterConfig(nextStep);
    goToStep('config');
  }

  // 刷新空间列表（供右上角 SpaceSelector 使用）
  const refreshSpaces = useCallback(async () => {
    const saved = loadSaved();
    if (!saved.plugin_id || !saved.plugin_secret || !saved.user_key) return;
    setSpacesLoading(true);
    try {
      const r = await api<{ spaces: any[] }>('/api/auth/init', {
        base_url: saved.base_url,
        plugin_id: saved.plugin_id,
        plugin_secret: saved.plugin_secret,
        user_key: saved.user_key,
      });
      const nextSpaces = r.spaces || [];
      setSpaces(nextSpaces);
      saveConfig({ spaces: nextSpaces });
    } catch (e: any) {
      console.error('[App] 刷新空间失败:', e.message);
    } finally {
      setSpacesLoading(false);
    }
  }, []);

  function openCopyTool() {
    const saved = loadSaved();
    if (!saved.plugin_id || !saved.plugin_secret || !saved.user_key) {
      openConfig('workitem');
      return;
    }
    if (!saved.space_key) {
      // 没选过空间，先拉取一次
      refreshSpaces();
    }
    setStepDone(-1);
    setWorkflowData(null); setFlowData(null); setMappingData(null); setWorkItemCache(null);
    goToStep('workitem');
  }

  function handleConfigDone(spacesList: any[]) {
    setSpaces(spacesList);
    // 如果之前没选过空间，且拉取到了空间，默认选第一个
    if (!currentSpace && spacesList.length > 0) {
      const first = spacesList[0];
      const firstKey = first.simple_name || first.project_key;
      setCurrentSpace(firstKey);
      saveConfig({ space_key: firstKey });
    }
    setStepDone(-1);
    setWorkItemCache(null);
    goToStep(afterConfig || 'home');
  }

  function handleSpaceSelect(spaceKey: string) {
    setCurrentSpace(spaceKey);
    saveConfig({ space_key: spaceKey });
  }

  function handleWorkItemDone(data: any) {
    setWorkflowData(data);
    setStepDone(0);
    goToStep('workflow');
  }

  function handleWorkflowDone(data: any) {
    setFlowData(data);
    setStepDone(1);
    goToStep('mapping');
  }

  function handleMappingDone(data: any) {
    setMappingData(data);
    setStepDone(2);
    goToStep('execute');
  }

  function handleBackToWorkflow() {
    setFlowData(null);
    setMappingData(null);
    setStepDone(0);
    goToStep('workflow');
  }

  function handleReset() {
    const saved = loadSaved();
    [
      'wi_id', 'wi_type', 'wi_keyword', 'mode', 'source_kind', 'target_kind',
      'source_node_id', 'source_item_ids', 'target_node_id',
      'target_relation_id', 'target_type_key', 'field_mappings',
    ].forEach(k => delete saved[k]);
    localStorage.setItem('meego_copy_config', JSON.stringify(saved));
    setStep('home'); setStepDone(-1);
    setWorkflowData(null); setFlowData(null); setMappingData(null); setWorkItemCache(null);
  }

  const headerSaved = loadSaved();
  const hasGlobalConfig = Boolean(headerSaved.plugin_id && headerSaved.plugin_secret && headerSaved.user_key);

  // 进入功能页后需要选了空间才能操作
  const inToolFlow = !['home', 'config'].includes(step);
  const needsSpace = inToolFlow && hasGlobalConfig && !currentSpace;

  return (
    <div className="app">
      <div className="app-header">
        <div>
          <div className="app-title">实施工具</div>
          <div className="app-subtitle">
            {step === 'home' || step === 'config' ? '全局配置与工具入口' : '节点任务复制'}
          </div>
        </div>
        {step !== 'config' && (
          <div className="header-actions">
            {hasGlobalConfig && (
              <SpaceSelector
                spaces={spaces}
                selected={currentSpace}
                onSelect={handleSpaceSelect}
                onRefresh={refreshSpaces}
                loading={spacesLoading}
              />
            )}
            <button
            className={`config-pill clickable ${hasGlobalConfig ? 'ok' : 'warn'}`}
              onClick={() => openConfig(step === 'home' ? 'home' : step)}
            title={hasGlobalConfig ? '点击修改全局配置' : '点击配置凭证'}
          >
        {hasGlobalConfig ? `✓ ${headerSaved.user_name || '已配置'}` : '⚠ 未配置'}
            </button>
          </div>
        )}
      </div>

      {!['home', 'config'].includes(step) && <StepNav current={step} done={stepDone} />}

      {needsSpace && (
        <div className="card">
          <div className="msg msg-info">请先在右上角选择一个空间，再继续操作。</div>
        </div>
      )}

      {step === 'home' && <HomeScreen onOpenCopyTool={openCopyTool} />}
      {step === 'config' && <ConfigScreen onNext={handleConfigDone} onBack={() => goToStep('home')} />}
      {step === 'workitem' && !needsSpace && (
        <WorkItemScreen
          onNext={handleWorkItemDone}
          onBack={() => goToStep('home')}
          initialState={workItemCache}
          onStateChange={setWorkItemCache}
        />
      )}
      {step === 'workflow' && (
        <WorkflowScreen data={workflowData} onNext={handleWorkflowDone} onBack={() => goToStep('workitem')} />
      )}
      {step === 'mapping' && (
        <MappingScreen
          data={{ ...flowData, ...mappingData }}
          onNext={handleMappingDone}
          onBack={() => goToStep('workflow')}
        />
      )}
      {step === 'execute' && (
        <ExecuteScreen
          data={{ ...flowData, ...mappingData }}
          onReset={handleReset}
          onBackToWorkflow={handleBackToWorkflow}
        />
      )}
    </div>
  );
}
