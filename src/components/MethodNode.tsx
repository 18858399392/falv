import { Handle, Position, NodeResizer, useReactFlow } from '@xyflow/react';
import React from 'react';
import NodeEditor from './NodeEditor';

export default function MethodNode({ id, data, selected }: any) {
  const { setNodes } = useReactFlow();

  const onChange = (content: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, label: content } };
        }
        return n;
      })
    );
  };

  const onBlur = () => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, isEditing: false } };
        }
        return n;
      })
    );
  };

  return (
    <div className="relative w-full h-full group">
      <NodeResizer color="#3b82f6" isVisible={selected} minWidth={60} minHeight={40} />
      
      <div className={`w-full h-full px-4 py-2 border-2 border-dashed border-gray-800 rounded-full bg-white text-center shadow-sm flex items-center justify-center ${selected ? 'ring-2 ring-blue-500' : ''}`}>
        <Handle type="source" position={Position.Top} id="top" className="w-2 h-2 !bg-gray-800 opacity-0 group-hover:opacity-100" />
        <Handle type="source" position={Position.Left} id="left" className="w-2 h-2 !bg-gray-800 opacity-0 group-hover:opacity-100" />
        <Handle type="source" position={Position.Right} id="right" className="w-2 h-2 !bg-gray-800 opacity-0 group-hover:opacity-100" />
        <Handle type="source" position={Position.Bottom} id="bottom" className="w-2 h-2 !bg-gray-800 opacity-0 group-hover:opacity-100" />
        <div className={`w-full h-full text-gray-800 flex items-center justify-center overflow-hidden ${data.isEditing ? 'nodrag' : ''}`}>
          <NodeEditor 
            content={data.label} 
            onChange={onChange} 
            onBlur={onBlur} 
            isEditing={!!data.isEditing} 
            verticalAlign={data.verticalAlign || 'center'}
          />
        </div>
      </div>
    </div>
  );
}
