// =====================================================================
// 主应用 — 步骤路由 + 状态管理
// =====================================================================

import React, { useState, useEffect } from 'react';
import { loadSaved, saveConfig } from './storage';
import { StepNav } from './components/StepNav';
import { HomeScreen } from './components/HomeScreen';
import { ConfigScreen } from './components/ConfigScreen';
import { SpaceScreen } from './components/SpaceScreen';
import { WorkItemScreen } from './components/WorkItemScreen';
import { WorkflowScreen } from './components/WorkflowScreen';
import { MappingScreen } from './components/MappingScreen';
import { ExecuteScreen } from './components/ExecuteScreen';

type Step = 'home' | 'config' | 'space' | 'workitem' | 'workflow' | 'mapping' | 'execute';

export default function App() {
  const [step, setStep] = useState<Step>('home');
  const [stepDone, setStepDone] = useState(-1);
  const [spaces, setSpaces] = useState<any[]>(loadSaved().spaces || []);
  const [workflowData, setWorkflowData] = useState<any>(null);
  const [flowData, setFlowData] = useState<any>(null);
  const [mappingData, setMappingData] = useState<any>(null);
  const [workItemCache, setWorkItemCache] = useState<any>(null);
  const [afterConfig, setAfterConfig] = useState<Step>('home');

  useEffect(() => {
    const saved = loadSaved();
    if (saved.spaces?.length) setSpaces(saved.spaces);
  }, []);

  function goToStep(s: Step) { setStep(s); }

  function openConfig(nextStep: Step = 'home') {
    setAfterConfig(nextStep);
    goToStep('config');
  }

  function openCopyTool() {
    const saved = loadSaved();
    if (!saved.plugin_id || !saved.plugin_secret || !saved.user_key) {
      openConfig('space');
      return;
    }
    setSpaces(saved.spaces || []);
    setStepDone(-1);
    setWorkflowData(null); setFlowData(null); setMappingData(null); setWorkItemCache(null);
    goToStep('space');
  }

  function handleConfigDone(spacesList: any[]) {
    setSpaces(spacesList);
    setStepDone(-1);
    setWorkItemCache(null);
    goToStep(afterConfig || 'home');
  }

  function handleSpaceDone(_spaceKey: string) {
    setStepDone(-1);
    setWorkItemCache(null);
    goToStep('workitem');
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
      'source_relation_id', 'target_relation_id', 'target_type_key', 'field_mappings', 'hierarchy_depth',
    ].forEach(k => delete saved[k]);
    localStorage.setItem('meego_copy_config', JSON.stringify(saved));
    setStep('home'); setStepDone(-1); setSpaces(saved.spaces || []);
    setWorkflowData(null); setFlowData(null); setMappingData(null); setWorkItemCache(null);
  }

  const headerSaved = loadSaved();
  const hasGlobalConfig = Boolean(headerSaved.plugin_id && headerSaved.plugin_secret && headerSaved.user_key);
  const configText = hasGlobalConfig
    ? `已配置 · ${headerSaved.user_name || '用户未解析'}`
    : '未配置';

  return (
    <div className="app">
      <div className="app-header">
        <div>
          <div className="app-title">实施工具</div>
          <div className="app-subtitle">
            {step === 'home' || step === 'config' ? '全局配置与工具入口' : '工作项复制'}
          </div>
        </div>
        {step !== 'config' && (
          <div className="header-actions">
            <span className={`config-pill ${hasGlobalConfig ? 'ok' : 'warn'}`}>{configText}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => openConfig(step === 'home' ? 'home' : step)}>
              全局配置
            </button>
          </div>
        )}
      </div>

      {!['home', 'config', 'space'].includes(step) && <StepNav current={step} done={stepDone} />}

      {step === 'home' && <HomeScreen onOpenCopyTool={openCopyTool} />}
      {step === 'config' && <ConfigScreen onNext={handleConfigDone} onBack={() => goToStep('home')} />}
      {step === 'space' && <SpaceScreen spaces={spaces} onNext={handleSpaceDone} onBack={() => goToStep('home')} />}
      {step === 'workitem' && (
        <WorkItemScreen
          onNext={handleWorkItemDone}
          onBack={() => goToStep('space')}
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
