// =====================================================================
// 步骤导航
// =====================================================================

import React from 'react';

const COPY_STEPS = [
  { id: 'workitem', label: '选择工作项' },
  { id: 'workflow', label: '选择子任务和对应关系' },
  { id: 'mapping', label: '字段映射' },
  { id: 'execute', label: '复制' },
];

export function StepNav({ current, done, steps = COPY_STEPS }: { current: string; done: number; steps?: typeof COPY_STEPS }) {
  return (
    <div className="steps">
      {steps.map((s, i) => {
        const cls = ['step', current === s.id ? 'active' : '', done >= i ? 'done' : ''].filter(Boolean).join(' ');
        return (
          <div key={s.id} className={cls}>
            <span className="num">{i + 1}</span>
            {s.label}
          </div>
        );
      })}
    </div>
  );
}
