import { MarkerType } from '@xyflow/react';

const defaultEdge = {
  type: 'step',
  style: { stroke: '#1f2937', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#1f2937' },
};

const labelStyle = { fill: '#374151', fontWeight: 500, fontSize: 12 };
const labelBgStyle = { fill: '#ffffff', fillOpacity: 0.8 };

export const verticalTemplates = [
  {
    id: 'v1',
    name: '基础流程 (竖向)',
    description: '适用于简单的线性步骤说明',
    nodes: [
      { id: '1', type: 'plainNode', position: { x: 400, y: 100 }, data: { label: '开始' }, style: { width: 200, height: 60 } },
      { id: '2', type: 'plainNode', position: { x: 400, y: 200 }, data: { label: '第一步' }, style: { width: 200, height: 60 } },
      { id: '3', type: 'plainNode', position: { x: 400, y: 300 }, data: { label: '第二步' }, style: { width: 200, height: 60 } },
      { id: '4', type: 'plainNode', position: { x: 400, y: 400 }, data: { label: '结束' }, style: { width: 200, height: 60 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', ...defaultEdge },
      { id: 'e2-3', source: '2', target: '3', ...defaultEdge },
      { id: 'e3-4', source: '3', target: '4', ...defaultEdge },
    ]
  },
  {
    id: 'v2',
    name: '条件分支 (竖向)',
    description: '适用于包含判断和分支的逻辑',
    nodes: [
      { id: '1', type: 'plainNode', position: { x: 400, y: 100 }, data: { label: '提出申请' }, style: { width: 200, height: 60 } },
      { id: '2', type: 'plainNode', position: { x: 400, y: 200 }, data: { label: '是否符合条件？' }, style: { width: 200, height: 60 } },
      { id: '3', type: 'plainNode', position: { x: 250, y: 300 }, data: { label: '予以受理' }, style: { width: 200, height: 60 } },
      { id: '4', type: 'plainNode', position: { x: 550, y: 300 }, data: { label: '驳回申请' }, style: { width: 200, height: 60 } },
      { id: '5', type: 'plainNode', position: { x: 400, y: 400 }, data: { label: '流程结束' }, style: { width: 200, height: 60 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', ...defaultEdge },
      { id: 'e2-3', source: '2', target: '3', label: '是', labelStyle, labelBgStyle, labelBgPadding: [4, 4], labelBgBorderRadius: 4, ...defaultEdge },
      { id: 'e2-4', source: '2', target: '4', label: '否', labelStyle, labelBgStyle, labelBgPadding: [4, 4], labelBgBorderRadius: 4, ...defaultEdge },
      { id: 'e3-5', source: '3', target: '5', ...defaultEdge },
      { id: 'e4-5', source: '4', target: '5', ...defaultEdge },
    ]
  },
  {
    id: 'v3',
    name: '复杂审批流 (竖向)',
    description: '适用于多级审核、驳回重审的场景',
    nodes: [
      { id: '1', type: 'plainNode', position: { x: 400, y: 100 }, data: { label: '提交材料' }, style: { width: 200, height: 60 } },
      { id: '2', type: 'plainNode', position: { x: 400, y: 200 }, data: { label: '初审' }, style: { width: 200, height: 60 } },
      { id: '3', type: 'plainNode', position: { x: 400, y: 300 }, data: { label: '复审' }, style: { width: 200, height: 60 } },
      { id: '4', type: 'plainNode', position: { x: 400, y: 400 }, data: { label: '终审批准' }, style: { width: 200, height: 60 } },
      { id: '5', type: 'plainNode', position: { x: 150, y: 250 }, data: { label: '退回修改' }, style: { width: 200, height: 60 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', ...defaultEdge },
      { id: 'e2-3', source: '2', target: '3', label: '通过', labelStyle, labelBgStyle, labelBgPadding: [4, 4], labelBgBorderRadius: 4, ...defaultEdge },
      { id: 'e3-4', source: '3', target: '4', label: '通过', labelStyle, labelBgStyle, labelBgPadding: [4, 4], labelBgBorderRadius: 4, ...defaultEdge },
      { id: 'e2-5', source: '2', target: '5', label: '不通过', labelStyle, labelBgStyle, labelBgPadding: [4, 4], labelBgBorderRadius: 4, ...defaultEdge },
      { id: 'e3-5', source: '3', target: '5', label: '不通过', labelStyle, labelBgStyle, labelBgPadding: [4, 4], labelBgBorderRadius: 4, ...defaultEdge },
      { id: 'e5-1', source: '5', target: '1', label: '重新提交', labelStyle, labelBgStyle, labelBgPadding: [4, 4], labelBgBorderRadius: 4, ...defaultEdge },
    ]
  }
];

export const horizontalTemplates = [
  {
    id: 'h1',
    name: '基础流程 (横向)',
    description: '适用于时间轴或步骤递进说明',
    nodes: [
      { id: '1', type: 'plainNode', position: { x: 100, y: 300 }, data: { label: '阶段一' }, style: { width: 200, height: 60 } },
      { id: '2', type: 'plainNode', position: { x: 350, y: 300 }, data: { label: '阶段二' }, style: { width: 200, height: 60 } },
      { id: '3', type: 'plainNode', position: { x: 600, y: 300 }, data: { label: '阶段三' }, style: { width: 200, height: 60 } },
      { id: '4', type: 'plainNode', position: { x: 850, y: 300 }, data: { label: '阶段四' }, style: { width: 200, height: 60 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', ...defaultEdge },
      { id: 'e2-3', source: '2', target: '3', ...defaultEdge },
      { id: 'e3-4', source: '3', target: '4', ...defaultEdge },
    ]
  },
  {
    id: 'h2',
    name: '并行任务 (横向)',
    description: '适用于多任务同时进行后汇总的场景',
    nodes: [
      { id: '1', type: 'plainNode', position: { x: 100, y: 300 }, data: { label: '任务分发' }, style: { width: 200, height: 60 } },
      { id: '2', type: 'plainNode', position: { x: 350, y: 200 }, data: { label: '子任务 A' }, style: { width: 200, height: 60 } },
      { id: '3', type: 'plainNode', position: { x: 350, y: 400 }, data: { label: '子任务 B' }, style: { width: 200, height: 60 } },
      { id: '4', type: 'plainNode', position: { x: 600, y: 300 }, data: { label: '结果汇总' }, style: { width: 200, height: 60 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', ...defaultEdge },
      { id: 'e1-3', source: '1', target: '3', ...defaultEdge },
      { id: 'e2-4', source: '2', target: '4', ...defaultEdge },
      { id: 'e3-4', source: '3', target: '4', ...defaultEdge },
    ]
  },
  {
    id: 'h3',
    name: '对比分析 (横向)',
    description: '适用于两种观点或机制的对比',
    nodes: [
      { id: '1', type: 'plainNode', position: { x: 100, y: 300 }, data: { label: '核心争议点' }, style: { width: 200, height: 60 } },
      { id: '2', type: 'plainNode', position: { x: 350, y: 200 }, data: { label: '肯定说' }, style: { width: 200, height: 60 } },
      { id: '3', type: 'plainNode', position: { x: 350, y: 400 }, data: { label: '否定说' }, style: { width: 200, height: 60 } },
      { id: '4', type: 'plainNode', position: { x: 600, y: 200 }, data: { label: '理由 A' }, style: { width: 200, height: 60 } },
      { id: '5', type: 'plainNode', position: { x: 600, y: 400 }, data: { label: '理由 B' }, style: { width: 200, height: 60 } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', ...defaultEdge },
      { id: 'e1-3', source: '1', target: '3', ...defaultEdge },
      { id: 'e2-4', source: '2', target: '4', ...defaultEdge },
      { id: 'e3-5', source: '3', target: '5', ...defaultEdge },
    ]
  }
];
