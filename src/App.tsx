import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  Panel,
  MarkerType,
  ConnectionMode,
  getNodesBounds,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng, toSvg } from 'html-to-image';
import { v4 as uuidv4 } from 'uuid';
import { Download, LayoutTemplate, Type, Square, SquareDashed, AlignLeft, AlignCenter, AlignRight, Bold, Heading1, Heading2, Heading3, Settings, Trash2, Undo2, Redo2, Plus, Copy, Save, FolderOpen, Wand2, HelpCircle, X, Sparkles, Upload, Image as ImageIcon, Loader2, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, FileText, Code, Check, RefreshCw } from 'lucide-react';
import dagre from 'dagre';
import { GoogleGenAI, Type as GenAIType } from '@google/genai';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';

import MethodNode from './components/MethodNode';
import PlainNode from './components/PlainNode';
import SimpleStepEdge from './components/SimpleStepEdge';
import { verticalTemplates, horizontalTemplates } from './templates';
import { extractPdfText } from './pdfExtractor';
import { extractWordText } from './wordExtractor';

const nodeTypes = {
  methodNode: MethodNode,
  plainNode: PlainNode,
};

const edgeTypes = {
  step: SimpleStepEdge,
};

const initialNodes: any[] = [
  { id: 'center-node', type: 'plainNode', position: { x: 400, y: 300 }, data: { label: '中心节点', verticalAlign: 'center' }, style: { width: 200, height: 60 } }
];
const initialEdges: any[] = [];

let id = 0;
const getId = () => `dndnode_${id++}`;

export default function App() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [selectedNodes, setSelectedNodes] = useState<any[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<any[]>([]);
  const [clipboard, setClipboard] = useState<any[]>([]);
  const [past, setPast] = useState<{nodes: any[], edges: any[]}[]>([]);
  const [future, setFuture] = useState<{nodes: any[], edges: any[]}[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [exportPadding, setExportPadding] = useState<'narrow' | 'medium' | 'wide'>('medium');
  const [exportResolution, setExportResolution] = useState<'normal' | 'high'>('high');
  const [exportFormat, setExportFormat] = useState<'png' | 'svg'>('png');
  const [exportPreviewUrl, setExportPreviewUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiFilePreview, setAiFilePreview] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [verticalSpacing, setVerticalSpacing] = useState(3);
  const [horizontalSpacing, setHorizontalSpacing] = useState(3);
  const [edgeLabelInput, setEdgeLabelInput] = useState('');
  const isEdgeLabelFocused = useRef(false);
  const lastMousePos = useRef<{x: number, y: number}>({ x: 400, y: 300 });

  const takeSnapshot = useCallback(() => {
    if (reactFlowInstance) {
      setPast((p) => [...p, { nodes: reactFlowInstance.getNodes(), edges: reactFlowInstance.getEdges() }]);
      setFuture([]);
    }
  }, [reactFlowInstance]);

  const undo = useCallback(() => {
    if (past.length === 0 || !reactFlowInstance) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    setPast(newPast);
    setFuture((f) => [{ nodes: reactFlowInstance.getNodes(), edges: reactFlowInstance.getEdges() }, ...f]);
    setNodes(previous.nodes);
    setEdges(previous.edges);
  }, [past, reactFlowInstance, setNodes, setEdges]);

  const redo = useCallback(() => {
    if (future.length === 0 || !reactFlowInstance) return;
    const next = future[0];
    const newFuture = future.slice(1);
    setFuture(newFuture);
    setPast((p) => [...p, { nodes: reactFlowInstance.getNodes(), edges: reactFlowInstance.getEdges() }]);
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [future, reactFlowInstance, setNodes, setEdges]);

  const applyLayout = useCallback(() => {
    if (selectedNodes.length <= 1) return;

    takeSnapshot();

    // 1. Find bounding box of selected nodes to determine center X and start Y
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;

    selectedNodes.forEach(n => {
      const x = n.position.x;
      const y = n.position.y;
      const w = Number(n.style?.width) || 200;
      if (x < minX) minX = x;
      if (x + w > maxX) maxX = x + w;
      if (y < minY) minY = y;
    });

    const centerX = Math.round((minX + (maxX - minX) / 2) / 20) * 20;
    const startY = Math.round(minY / 20) * 20;

    // 2. Group nodes into rows by Y coordinate
    const sortedNodes = [...selectedNodes].sort((a, b) => a.position.y - b.position.y);
    const rows: any[][] = [];
    let currentRow: any[] = [];
    let currentRowY = sortedNodes[0].position.y;

    sortedNodes.forEach(n => {
      if (Math.abs(n.position.y - currentRowY) < 50) {
        currentRow.push(n);
      } else {
        rows.push(currentRow);
        currentRow = [n];
        currentRowY = n.position.y;
      }
    });
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    // 3. Calculate new positions
    const newPositions = new Map<string, { x: number, y: number }>();
    let currentY = startY;
    const gridUnit = 20;

    rows.forEach((row) => {
      // Sort row by X
      const sortedRow = [...row].sort((a, b) => a.position.x - b.position.x);
      
      // Calculate total width of the row
      let totalWidth = 0;
      sortedRow.forEach((n, i) => {
        totalWidth += Number(n.style?.width) || 200;
        if (i < sortedRow.length - 1) {
          totalWidth += horizontalSpacing * gridUnit;
        }
      });

      // Start X for this row to be centered
      let currentX = Math.round((centerX - totalWidth / 2) / 20) * 20;

      // Assign positions
      let maxRowHeight = 0;
      sortedRow.forEach(n => {
        newPositions.set(n.id, { x: currentX, y: currentY });
        currentX += (Number(n.style?.width) || 200) + horizontalSpacing * gridUnit;
        const h = Number(n.style?.height) || 60;
        if (h > maxRowHeight) maxRowHeight = h;
      });

      // Advance Y for next row
      currentY += maxRowHeight + verticalSpacing * gridUnit;
    });

    // 4. Update nodes
    setNodes(nds => nds.map(node => {
      if (newPositions.has(node.id)) {
        return {
          ...node,
          position: newPositions.get(node.id)!
        };
      }
      return node;
    }));
  }, [selectedNodes, verticalSpacing, horizontalSpacing, setNodes, takeSnapshot]);

  const addNewNode = useCallback(() => {
    takeSnapshot();
    const pos = lastMousePos.current;
    const x = Math.round(pos.x / 20) * 20;
    const y = Math.round(pos.y / 20) * 20;
    const newNode = {
      id: getId(),
      type: 'plainNode',
      position: { x, y },
      data: { label: '新节点', verticalAlign: 'center' },
      style: { width: 200, height: 60 }
    };
    setNodes((nds) => nds.map(n => ({...n, selected: false})).concat({...newNode, selected: true}));
  }, [takeSnapshot, setNodes]);

  const copyNode = useCallback(() => {
    if (selectedNodes.length > 0) {
      setClipboard(selectedNodes);
    }
  }, [selectedNodes]);

  const pasteNode = useCallback(() => {
    if (clipboard && clipboard.length > 0) {
      takeSnapshot();
      const pos = lastMousePos.current;
      const x = Math.round(pos.x / 20) * 20;
      const y = Math.round(pos.y / 20) * 20;
      
      const minX = Math.min(...clipboard.map(n => n.position.x));
      const minY = Math.min(...clipboard.map(n => n.position.y));
      
      const newNodes = clipboard.map(node => ({
        ...node,
        id: getId(),
        position: { 
          x: x + (node.position.x - minX), 
          y: y + (node.position.y - minY) 
        },
        selected: true,
      }));
      
      setNodes((nds) => nds.map(n => ({ ...n, selected: false })).concat(newNodes));
    }
  }, [clipboard, takeSnapshot, setNodes]);

  const onLayout = useCallback(() => {
    if (!reactFlowInstance) return;
    takeSnapshot();
    
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: 'TB', ranksep: 60, nodesep: 40 });

    const currentNodes = reactFlowInstance.getNodes();
    const currentEdges = reactFlowInstance.getEdges();

    currentNodes.forEach((node: any) => {
      dagreGraph.setNode(node.id, { width: node.style?.width || 200, height: node.style?.height || 60 });
    });

    currentEdges.forEach((edge: any) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const newNodes = currentNodes.map((node: any) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: Math.round((nodeWithPosition.x - (node.style?.width || 200) / 2) / 20) * 20,
          y: Math.round((nodeWithPosition.y - (node.style?.height || 60) / 2) / 20) * 20,
        },
      };
    });

    setNodes(newNodes);
    setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 50);
  }, [reactFlowInstance, setNodes, takeSnapshot]);

  const saveProject = useCallback(() => {
    if (!reactFlowInstance) return;
    const data = JSON.stringify({ nodes: reactFlowInstance.getNodes(), edges: reactFlowInstance.getEdges() });
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flowchart.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [reactFlowInstance]);

  const loadProject = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.nodes && data.edges) {
          takeSnapshot();
          setNodes(data.nodes);
          setEdges(data.edges);
          setTimeout(() => reactFlowInstance?.fitView({ padding: 0.2 }), 50);
        }
      } catch (err) {
        alert('文件格式错误');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [reactFlowInstance, setNodes, setEdges, takeSnapshot]);

  const loadTemplate = useCallback((template: any) => {
    takeSnapshot();
    setNodes(template.nodes);
    setEdges(template.edges);
    setShowTemplates(false);
    setTimeout(() => reactFlowInstance?.fitView({ padding: 0.2 }), 50);
  }, [takeSnapshot, setNodes, setEdges, reactFlowInstance]);

  const exportSvg = useCallback(() => {
    if (reactFlowWrapper.current === null) return;
    const controls = document.querySelector('.react-flow__controls') as HTMLElement;
    if (controls) controls.style.display = 'none';
    toSvg(reactFlowWrapper.current, { backgroundColor: '#ffffff' }).then((dataUrl) => {
      const a = document.createElement('a');
      a.setAttribute('download', 'flowchart.svg');
      a.setAttribute('href', dataUrl);
      a.click();
      if (controls) controls.style.display = 'flex';
    });
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (e.key.toLowerCase() === 'n' && !cmdOrCtrl) {
        e.preventDefault();
        addNewNode();
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        setEdges((eds) => eds.map((ed) => ({ ...ed, selected: true })));
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copyNode();
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteNode();
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (selectedNodes.length > 0) {
          e.preventDefault();
          const dx = e.key === 'ArrowLeft' ? -20 : e.key === 'ArrowRight' ? 20 : 0;
          const dy = e.key === 'ArrowUp' ? -20 : e.key === 'ArrowDown' ? 20 : 0;
          setNodes((nds) => nds.map(n => selectedNodes.find(sn => sn.id === n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addNewNode, copyNode, pasteNode, undo, redo, setNodes, setEdges, selectedNodes]);

  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: any) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === node.id) {
          return { ...n, data: { ...n.data, isEditing: true } };
        }
        return n;
      })
    );
  }, [setNodes]);

  const onConnect = useCallback(
    (params: any) => {
      takeSnapshot();
      const newEdge = {
        ...params,
        type: 'step',
        style: { stroke: '#1f2937', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#1f2937' },
        labelStyle: { fill: '#374151', fontWeight: 500, fontSize: 12, transform: 'translate(0, -10px)' },
        labelShowBg: false,
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges],
  );

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      takeSnapshot();
      const newNode = {
        id: getId(),
        type,
        position,
        data: { label: `${type} node`, verticalAlign: 'center' },
        style: { width: 200, height: 60 }
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes, takeSnapshot],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onSelectionChange = useCallback(({ nodes, edges }: any) => {
    setSelectedNodes(nodes);
    setSelectedEdges(edges);
    if (!isEdgeLabelFocused.current) {
      if (edges.length > 0) {
        setEdgeLabelInput(edges.every((e: any) => e.label === edges[0].label) ? (edges[0].label || '') : '');
      } else {
        setEdgeLabelInput('');
      }
    }
  }, []);

  useEffect(() => {
    setSelectedNodes(prev => prev.map(pn => nodes.find(n => n.id === pn.id) || pn).filter(Boolean));
  }, [nodes]);

  const updateNodeType = (evt: React.ChangeEvent<HTMLSelectElement>) => {
    takeSnapshot();
    const newType = evt.target.value;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.selected || selectedNodes.find(n => n.id === node.id)) {
          return { ...node, type: newType, selected: true };
        }
        return node;
      })
    );
  };

  const updateNodeSize = (dimension: 'width' | 'height', value: string) => {
    const numValue = value === '' ? 0 : parseInt(value, 10);
    if (isNaN(numValue)) return;
    takeSnapshot();
    setNodes((nds) =>
      nds.map((node) => {
        if (node.selected || selectedNodes.find(n => n.id === node.id)) {
          return { ...node, style: { ...node.style, [dimension]: numValue * 20 }, selected: true };
        }
        return node;
      })
    );
  };

  const applyVerticalAlignToNodes = (align: 'top' | 'center' | 'bottom') => {
    takeSnapshot();
    setNodes((nds) =>
      nds.map((node) => {
        if (node.selected || selectedNodes.find(n => n.id === node.id)) {
          return { ...node, data: { ...node.data, verticalAlign: align }, selected: true };
        }
        return node;
      })
    );
  };

  const applyFormatToNodes = (formatFn: (editor: Editor) => void) => {
    takeSnapshot();
    setNodes((nds) =>
      nds.map((node) => {
        if (node.selected || selectedNodes.find(n => n.id === node.id)) {
          const editor = new Editor({
            extensions: [
              StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
              TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: 'center' }),
            ],
            content: node.data.label,
          });
          editor.commands.selectAll();
          formatFn(editor);
          const newHtml = editor.getHTML();
          editor.destroy();
          return { ...node, data: { ...node.data, label: newHtml }, selected: true };
        }
        return node;
      })
    );
  };

  const reverseEdge = () => {
    if (selectedEdges.length === 0) return;
    takeSnapshot();
    setEdges((eds) =>
      eds.map((edge) => {
        if (selectedEdges.find(e => e.id === edge.id)) {
          return {
            ...edge,
            source: edge.target,
            target: edge.source,
            sourceHandle: edge.targetHandle,
            targetHandle: edge.sourceHandle,
          };
        }
        return edge;
      })
    );
  };

  const deleteEdge = () => {
    if (selectedEdges.length === 0) return;
    takeSnapshot();
    setEdges((eds) => eds.filter((e) => !selectedEdges.find(se => se.id === e.id)));
  };

  const onNodeLabelFocus = () => {
    takeSnapshot();
  };

  const updateNodeLabel = (evt: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newLabel = evt.target.value;
    setNodes((nds) =>
      nds.map((node) => {
        if (selectedNodes.find(n => n.id === node.id)) {
          return { ...node, data: { ...node.data, label: newLabel } };
        }
        return node;
      })
    );
  };

  const updateEdgeLabel = (label: string) => {
    setEdges((eds) =>
      eds.map((edge) => {
        if (selectedEdges.find(e => e.id === edge.id)) {
          return {
            ...edge,
            label,
            labelStyle: { fill: '#374151', fontWeight: 500, fontSize: 12, transform: 'translate(0, -10px)' },
            labelShowBg: false,
          };
        }
        return edge;
      })
    );
  };

  const updateEdgeStyle = (evt: React.ChangeEvent<HTMLSelectElement>) => {
    takeSnapshot();
    const style = evt.target.value;
    setEdges((eds) =>
      eds.map((edge) => {
        if (selectedEdges.find(e => e.id === edge.id)) {
          if (style === 'dashed') {
            return { ...edge, style: { ...edge.style, strokeDasharray: '5,5' } };
          } else {
            return { ...edge, style: { ...edge.style, strokeDasharray: 'none' } };
          }
        }
        return edge;
      })
    );
  };

  const clearCanvas = () => {
    takeSnapshot();
    setNodes([{ id: getId(), type: 'plainNode', position: { x: 400, y: 300 }, data: { label: '中心节点', verticalAlign: 'center' }, style: { width: 200, height: 60 } }]);
    setEdges([]);
  };

  const generateExportImage = async (paddingType: 'narrow' | 'medium' | 'wide', resolution: 'normal' | 'high', format: 'png' | 'svg') => {
    if (!reactFlowInstance) return null;
    const nodes = reactFlowInstance.getNodes();
    if (nodes.length === 0) return null;

    const nodesBounds = getNodesBounds(nodes);
    const paddingMap = { narrow: 20, medium: 50, wide: 100 };
    const padding = paddingMap[paddingType];
    const scaleMap = { normal: 1, high: 2 };
    const scale = scaleMap[resolution];

    const imageWidth = nodesBounds.width + padding * 2;
    const imageHeight = nodesBounds.height + padding * 2;

    const viewportElement = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (!viewportElement) return null;

    const options = {
      backgroundColor: '#ffffff',
      width: imageWidth,
      height: imageHeight,
      style: {
        width: `${imageWidth}px`,
        height: `${imageHeight}px`,
        transform: `translate(${-nodesBounds.x + padding}px, ${-nodesBounds.y + padding}px) scale(1)`,
      },
      pixelRatio: scale,
    };

    if (format === 'svg') {
      return await toSvg(viewportElement, options);
    }
    return await toPng(viewportElement, options);
  };

  const openExportModal = async (format: 'png' | 'svg' = 'png') => {
    if (!reactFlowInstance || reactFlowInstance.getNodes().length === 0) {
      alert('画布为空，无法导出');
      return;
    }
    setExportFormat(format);
    setShowExportModal(true);
    setIsExporting(true);
    try {
      const dataUrl = await generateExportImage(exportPadding, exportResolution, format);
      setExportPreviewUrl(dataUrl);
    } catch (error) {
      console.error('Failed to generate preview', error);
      alert('生成预览失败');
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (showExportModal) {
      setIsExporting(true);
      generateExportImage(exportPadding, exportResolution, exportFormat).then(dataUrl => {
        setExportPreviewUrl(dataUrl);
        setIsExporting(false);
      }).catch(err => {
        console.error(err);
        setIsExporting(false);
      });
    }
  }, [exportPadding, exportResolution, exportFormat]);

  const downloadExport = () => {
    if (!exportPreviewUrl) return;
    const a = document.createElement('a');
    a.setAttribute('download', `flowchart.${exportFormat}`);
    a.setAttribute('href', exportPreviewUrl);
    a.click();
    setShowExportModal(false);
  };

  const stripHtml = (html: string) => {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const generateMermaidCode = () => {
    if (!reactFlowInstance) return '';
    const nodes = reactFlowInstance.getNodes();
    const edges = reactFlowInstance.getEdges();

    let code = 'graph TD\n';

    nodes.forEach(n => {
      const cleanLabel = stripHtml(n.data?.label || '').replace(/"/g, '&quot;');
      let shapeStart = '[';
      let shapeEnd = ']';
      if (n.data?.isRounded) {
        shapeStart = '(';
        shapeEnd = ')';
      }
      code += `  ${n.id}${shapeStart}"${cleanLabel}"${shapeEnd}\n`;
      if (n.data?.isDashed) {
        code += `  style ${n.id} stroke-dasharray: 5 5\n`;
      }
    });

    edges.forEach(e => {
      const cleanLabel = stripHtml(e.data?.label || '').replace(/"/g, '&quot;');
      const labelPart = cleanLabel ? `|"${cleanLabel}"|` : '';
      const line = e.data?.isDashed ? '-.->' : '-->';
      code += `  ${e.source} ${line}${labelPart} ${e.target}\n`;
    });

    return code;
  };

  const handleExportCode = () => {
    const code = generateMermaidCode();
    setGeneratedCode(code);
    setShowCodeModal(true);
    setCopySuccess(false);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      alert('复制失败，请手动复制');
    }
  };

  const downloadCode = () => {
    const blob = new Blob([generatedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flowchart.mmd';
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyMermaidCode = () => {
    try {
      const lines = generatedCode.split('\n');
      const newNodesMap = new Map();
      const newEdges: any[] = [];
      const dashedNodes = new Set();
      
      // First pass: find all nodes and styles
      lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('graph') || line.startsWith('flowchart')) return;

        // Check for style
        const styleMatch = line.match(/^style\s+([a-zA-Z0-9_-]+)\s+stroke-dasharray/);
        if (styleMatch) {
          dashedNodes.add(styleMatch[1]);
          return;
        }

        // Check for node definition: id["label"] or id("label")
        const nodeMatch = line.match(/^([a-zA-Z0-9_-]+)\s*(?:(\[|\()"?([^"]*)"?(?:\]|\)))?$/);
        if (nodeMatch) {
          const id = nodeMatch[1];
          const shapeStart = nodeMatch[2];
          const label = nodeMatch[3] !== undefined ? nodeMatch[3] : id;
          const isRounded = shapeStart === '(';
          newNodesMap.set(id, { id, label: label.replace(/&quot;/g, '"'), isRounded });
        }
      });

      // Second pass: find edges
      lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('graph') || line.startsWith('flowchart') || line.startsWith('style')) return;

        // Check for edge: source -->|"label"| target
        const edgeMatch = line.match(/^([a-zA-Z0-9_-]+)\s*(-+\.>|--+>)\s*(?:\|"?([^"]*)"?\|)?\s*([a-zA-Z0-9_-]+)$/);
        if (edgeMatch) {
          const source = edgeMatch[1];
          const lineType = edgeMatch[2];
          const label = edgeMatch[3] || '';
          const target = edgeMatch[4];
          const isDashed = lineType.includes('.');

          newEdges.push({
            id: uuidv4(),
            source,
            target,
            type: 'custom',
            data: { label: label.replace(/&quot;/g, '"'), isDashed },
            markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#000000' },
            style: { strokeWidth: 2, stroke: '#000000', strokeDasharray: isDashed ? '5,5' : 'none' },
          });
          
          if (!newNodesMap.has(source)) newNodesMap.set(source, { id: source, label: source, isRounded: false });
          if (!newNodesMap.has(target)) newNodesMap.set(target, { id: target, label: target, isRounded: false });
        }
      });

      if (newNodesMap.size === 0) {
        alert('未解析到任何节点，请检查代码格式');
        return;
      }

      // Preserve existing node positions if possible
      const existingNodesMap = new Map(nodes.map(n => [n.id, n]));
      
      const parsedNodes = Array.from(newNodesMap.values()).map(data => {
        const existingNode = existingNodesMap.get(data.id);
        return {
          id: data.id,
          type: 'custom',
          position: existingNode ? existingNode.position : { x: 0, y: 0 },
          data: {
            label: data.label,
            isRounded: data.isRounded,
            isDashed: dashedNodes.has(data.id)
          }
        };
      });

      // If there are new nodes without positions, layout them
      const nodesWithoutPosition = parsedNodes.filter(n => n.position.x === 0 && n.position.y === 0);
      if (nodesWithoutPosition.length > 0) {
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));
        dagreGraph.setGraph({ rankdir: 'TB', nodesep: 100, ranksep: 100 });

        parsedNodes.forEach((node) => {
          dagreGraph.setNode(node.id, { width: 150, height: 60 });
        });

        newEdges.forEach((edge) => {
          dagreGraph.setEdge(edge.source, edge.target);
        });

        dagre.layout(dagreGraph);

        parsedNodes.forEach((node) => {
          if (node.position.x === 0 && node.position.y === 0) {
            const nodeWithPosition = dagreGraph.node(node.id);
            if (nodeWithPosition) {
              node.position = {
                x: nodeWithPosition.x - 75,
                y: nodeWithPosition.y - 30,
              };
            }
          }
        });
      }

      takeSnapshot();
      setNodes(parsedNodes);
      setEdges(newEdges);
      setShowCodeModal(false);
    } catch (err) {
      console.error('Failed to parse Mermaid code', err);
      alert('解析代码失败，请检查格式是否正确');
    }
  };

  const handleAiFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAiFile(file);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setAiFilePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setAiFilePreview(null);
      }
    }
  };

  const handleAIGenerate = async () => {
    if (!aiText.trim() && !aiFile) {
      alert('请输入文本或上传文件');
      return;
    }
    setAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const parts: any[] = [];
      let extractedText = '';

      if (aiFile) {
        try {
          if (aiFile.type === 'application/pdf') {
            extractedText = await extractPdfText(aiFile);
          } else if (aiFile.name.endsWith('.docx') || aiFile.name.endsWith('.doc')) {
            extractedText = await extractWordText(aiFile);
          } else if (aiFile.type.startsWith('image/')) {
            const base64Promise = new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]);
              };
              reader.readAsDataURL(aiFile);
            });
            const base64Data = await base64Promise;
            parts.push({
              inlineData: {
                data: base64Data,
                mimeType: aiFile.type,
              }
            });
          } else {
            // Fallback for other text files
            extractedText = await aiFile.text();
          }
        } catch (fileErr) {
          console.error("File extraction error:", fileErr);
          alert("无法读取该文件内容，请检查文件格式是否正确或是否损坏。");
          setAiLoading(false);
          return;
        }
      }

      const combinedText = [aiText.trim(), extractedText].filter(Boolean).join('\n\n');
      if (combinedText) {
        parts.push({ text: combinedText });
      }

      parts.push({ text: "你是一个专业的法学流程图制作助手。请根据我提供的文本、图片或文件，提取出流程图的节点和连线关系。如果是图片，请尽可能精确地复刻图片中的流程结构和视觉样式。\n\n请输出JSON格式，包含 nodes 和 edges 数组。\n\n对于 nodes，包含：\n- id: 唯一标识符\n- label: 节点文本\n- x: 节点在画布上的相对X坐标（假设画布宽度为1000，请估算其水平位置，例如最左侧为100，中间为500，右侧为900）\n- y: 节点在画布上的相对Y坐标（假设画布高度为1000，请估算其垂直位置，例如最上方为100，下方为800）\n- isDashed: 布尔值，如果图片中该节点是虚线框，则为 true，否则为 false\n- isRounded: 布尔值，如果图片中该节点是圆角（如胶囊形），则为 true，否则为 false\n\n对于 edges，包含：\n- id: 唯一标识符\n- source: 源节点id\n- target: 目标节点id\n- label: 连线上的条件文本，如果没有则为空字符串\n- isDashed: 布尔值，如果图片中该连线是虚线，则为 true，否则为 false" });

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: GenAIType.OBJECT,
            properties: {
              nodes: {
                type: GenAIType.ARRAY,
                items: {
                  type: GenAIType.OBJECT,
                  properties: {
                    id: { type: GenAIType.STRING },
                    label: { type: GenAIType.STRING },
                    x: { type: GenAIType.NUMBER },
                    y: { type: GenAIType.NUMBER },
                    isDashed: { type: GenAIType.BOOLEAN },
                    isRounded: { type: GenAIType.BOOLEAN }
                  },
                  required: ["id", "label", "x", "y"]
                }
              },
              edges: {
                type: GenAIType.ARRAY,
                items: {
                  type: GenAIType.OBJECT,
                  properties: {
                    id: { type: GenAIType.STRING },
                    source: { type: GenAIType.STRING },
                    target: { type: GenAIType.STRING },
                    label: { type: GenAIType.STRING },
                    isDashed: { type: GenAIType.BOOLEAN }
                  },
                  required: ["id", "source", "target"]
                }
              }
            },
            required: ["nodes", "edges"]
          }
        }
      });

      if (response.text) {
        const data = JSON.parse(response.text);

        const newNodes = data.nodes.map((n: any) => ({
          id: n.id,
          type: n.isRounded ? 'methodNode' : 'plainNode',
          position: { 
            x: Math.round(n.x / 20) * 20, 
            y: Math.round(n.y / 20) * 20 
          },
          data: { label: n.label },
          style: { 
            width: 200, 
            height: 60,
            ...(n.isDashed ? { borderStyle: 'dashed' } : {})
          }
        }));

        // Anti-overlap logic for nodes on the same Y level
        const yGroups: { [key: number]: any[] } = {};
        newNodes.forEach((node: any) => {
          // Group nodes within 50px of each other vertically
          const yLevel = Math.round(node.position.y / 50) * 50;
          if (!yGroups[yLevel]) yGroups[yLevel] = [];
          yGroups[yLevel].push(node);
        });

        Object.values(yGroups).forEach((group) => {
          group.sort((a, b) => a.position.x - b.position.x);
          for (let i = 1; i < group.length; i++) {
            const prevNode = group[i - 1];
            const currNode = group[i];
            const minGap = 240; // 200 width + 40 gap
            if (currNode.position.x - prevNode.position.x < minGap) {
              currNode.position.x = prevNode.position.x + minGap;
            }
          }
        });

        const newEdges = data.edges.map((e: any) => {
          const sourceNode = newNodes.find((n: any) => n.id === e.source);
          const targetNode = newNodes.find((n: any) => n.id === e.target);
          
          let sourceHandle = 'bottom';
          let targetHandle = 'top';

          if (sourceNode && targetNode) {
            const dx = targetNode.position.x - sourceNode.position.x;
            const dy = targetNode.position.y - sourceNode.position.y;

            if (Math.abs(dy) < 50) {
              // Same horizontal level
              if (dx > 0) {
                sourceHandle = 'right';
                targetHandle = 'left';
              } else {
                sourceHandle = 'left';
                targetHandle = 'right';
              }
            } else if (dy > 0) {
              // Source is above target
              sourceHandle = 'bottom';
              targetHandle = 'top';
            } else {
              // Source is below target
              sourceHandle = 'top';
              targetHandle = 'bottom';
            }
          }

          return {
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle,
            targetHandle,
            label: e.label || undefined,
            type: 'step',
            style: { 
              stroke: '#1f2937', 
              strokeWidth: 2,
              ...(e.isDashed ? { strokeDasharray: '5,5' } : {})
            },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#1f2937' },
            ...(e.label ? {
              labelStyle: { fill: '#374151', fontWeight: 500, fontSize: 12 },
              labelBgStyle: { fill: '#ffffff', fillOpacity: 0.8 },
              labelBgPadding: [4, 4],
              labelBgBorderRadius: 4
            } : {})
          };
        });

        takeSnapshot();
        setNodes(newNodes);
        setEdges(newEdges);
        setShowAIModal(false);
        setAiText('');
        setAiFile(null);
        setAiFilePreview(null);
        setTimeout(() => reactFlowInstance?.fitView({ padding: 0.2 }), 50);
      }
    } catch (error) {
      console.error("AI Generation Error:", error);
      alert("AI 生成失败，请检查控制台日志。");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-center shadow-sm z-10">
        <div className="flex items-center gap-1.5 bg-gray-100/80 p-1.5 rounded-xl">
          <button
            onClick={() => setShowAIModal(true)}
            className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg transition-all shadow-sm shadow-purple-200"
            title="AI 智能生成"
          >
            <Sparkles className="w-4 h-4" />
            AI 生成
          </button>
          
          <div className="w-px h-5 bg-gray-300 mx-1"></div>

          <button
            onClick={addNewNode}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-sm rounded-lg transition-all"
            title="快捷键: N"
          >
            <Plus className="w-4 h-4" />
            新建节点
          </button>
          
          <div className="w-px h-5 bg-gray-300 mx-1"></div>
          
          <button
            onClick={undo}
            disabled={past.length === 0}
            className="flex items-center justify-center w-8 h-8 text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-sm rounded-lg transition-all disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none"
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={future.length === 0}
            className="flex items-center justify-center w-8 h-8 text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-sm rounded-lg transition-all disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none"
            title="重做 (Ctrl+Y / Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-gray-300 mx-1"></div>

          <button
            onClick={() => setShowTemplates(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-sm rounded-lg transition-all"
            title="模板库"
          >
            <LayoutTemplate className="w-4 h-4" />
            模板库
          </button>

          <div className="w-px h-5 bg-gray-300 mx-1"></div>

          <button
            onClick={onLayout}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-sm rounded-lg transition-all"
            title="一键自动排版"
          >
            <Wand2 className="w-4 h-4" />
            自动排版
          </button>

          <div className="w-px h-5 bg-gray-300 mx-1"></div>

          <button
            onClick={saveProject}
            className="flex items-center justify-center w-8 h-8 text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-sm rounded-lg transition-all"
            title="保存工程文件"
          >
            <Save className="w-4 h-4" />
          </button>
          <label
            className="flex items-center justify-center w-8 h-8 text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-sm rounded-lg transition-all cursor-pointer"
            title="读取工程文件"
          >
            <FolderOpen className="w-4 h-4" />
            <input type="file" accept=".json" className="hidden" onChange={loadProject} />
          </label>

          <div className="w-px h-5 bg-gray-300 mx-1"></div>

          <button
            onClick={clearCanvas}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-white hover:shadow-sm rounded-lg transition-all"
          >
            <Trash2 className="w-4 h-4" />
            清空画布
          </button>

          <div className="w-px h-5 bg-gray-300 mx-1"></div>

          <button
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-white hover:shadow-sm rounded-lg transition-all"
          >
            <HelpCircle className="w-4 h-4" />
            帮助
          </button>

          <div className="w-px h-5 bg-gray-300 mx-1"></div>

          <div className="flex items-center gap-1.5 pl-1">
            <button
              onClick={handleExportCode}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-all shadow-sm"
            >
              <Code className="w-4 h-4" />
              代码
            </button>
            <button
              onClick={() => openExportModal('svg')}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-all shadow-sm"
            >
              <Download className="w-4 h-4" />
              SVG
            </button>
            <button
              onClick={() => openExportModal('png')}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-all shadow-sm"
            >
              <Download className="w-4 h-4" />
              PNG
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <main className="flex-1 relative" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={takeSnapshot}
            onNodeDoubleClick={onNodeDoubleClick}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onSelectionChange={onSelectionChange}
            onPointerMove={(e) => {
              if (reactFlowInstance && reactFlowWrapper.current) {
                const bounds = reactFlowWrapper.current.getBoundingClientRect();
                lastMousePos.current = reactFlowInstance.screenToFlowPosition({
                  x: e.clientX,
                  y: e.clientY,
                });
              }
            }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            snapToGrid={true}
            snapGrid={[20, 20]}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={['Backspace', 'Delete']}
            defaultEdgeOptions={{
              type: 'step',
              markerEnd: { type: MarkerType.ArrowClosed, color: '#1f2937' },
              style: { stroke: '#1f2937', strokeWidth: 2 },
              labelStyle: { fill: '#374151', fontWeight: 500, fontSize: 12, transform: 'translate(0, -10px)' },
              labelShowBg: false,
            }}
          >
            <Background color="#e5e7eb" gap={20} variant={BackgroundVariant.Lines} />
            <Controls />
          </ReactFlow>
        </main>

        {/* Properties Panel */}
        <aside className="w-72 bg-white border-l border-gray-200 p-5 flex flex-col gap-4 overflow-y-auto z-10 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Settings className="w-5 h-5 text-gray-500" />
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">属性编辑</h2>
          </div>

          {(() => {
            const latestSelectedNodes = selectedNodes.map(sn => nodes.find(n => n.id === sn.id) || sn);
            return latestSelectedNodes.length > 0 ? (
            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                <span className="text-xs font-semibold text-gray-500 uppercase">当前选中: {latestSelectedNodes.length} 个节点</span>
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">节点类型</label>
                <select
                  value={latestSelectedNodes.every(n => n.type === latestSelectedNodes[0].type) ? latestSelectedNodes[0].type : ''}
                  onChange={updateNodeType}
                  className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="" disabled hidden>多个不同类型</option>
                  <option value="plainNode">普通框</option>
                  <option value="methodNode">方法框 (虚线)</option>
                </select>
              </div>

              <div className="flex gap-2">
                <div className="flex flex-col gap-2 w-1/2">
                  <label className="text-sm font-medium text-gray-700">宽度 (格)</label>
                  <input
                    type="number"
                    step={1}
                    min={1}
                    value={latestSelectedNodes.every(n => n.style?.width === latestSelectedNodes[0].style?.width) ? ((latestSelectedNodes[0].style?.width !== undefined ? latestSelectedNodes[0].style?.width as number : 200) / 20 || '') : ''}
                    onChange={(e) => updateNodeSize('width', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="多个值"
                  />
                </div>
                <div className="flex flex-col gap-2 w-1/2">
                  <label className="text-sm font-medium text-gray-700">高度 (格)</label>
                  <input
                    type="number"
                    step={1}
                    min={1}
                    value={latestSelectedNodes.every(n => n.style?.height === latestSelectedNodes[0].style?.height) ? ((latestSelectedNodes[0].style?.height !== undefined ? latestSelectedNodes[0].style?.height as number : 60) / 20 || '') : ''}
                    onChange={(e) => updateNodeSize('height', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="多个值"
                  />
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">文本格式</label>
                <div className="flex flex-wrap items-center gap-1 bg-gray-50 border border-gray-200 rounded-md p-1">
                  <button
                    onClick={() => applyFormatToNodes((e) => e.chain().toggleHeading({ level: 1 }).run())}
                    className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                    title="标题 1"
                  >
                    <Heading1 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => applyFormatToNodes((e) => e.chain().toggleHeading({ level: 2 }).run())}
                    className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                    title="标题 2"
                  >
                    <Heading2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => applyFormatToNodes((e) => e.chain().toggleHeading({ level: 3 }).run())}
                    className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                    title="标题 3"
                  >
                    <Heading3 className="w-4 h-4" />
                  </button>
                  <div className="w-px h-4 bg-gray-300 mx-1"></div>
                  <button
                    onClick={() => applyFormatToNodes((e) => e.chain().setParagraph().run())}
                    className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                    title="正文"
                  >
                    <Type className="w-4 h-4" />
                  </button>
                  <div className="w-px h-4 bg-gray-300 mx-1"></div>
                  <button
                    onClick={() => applyFormatToNodes((e) => e.chain().toggleBold().run())}
                    className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                    title="加粗"
                  >
                    <Bold className="w-4 h-4" />
                  </button>
                  <div className="w-px h-4 bg-gray-300 mx-1"></div>
                  <button
                    onClick={() => applyFormatToNodes((e) => e.chain().setTextAlign('left').run())}
                    className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                    title="左对齐"
                  >
                    <AlignLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => applyFormatToNodes((e) => e.chain().setTextAlign('center').run())}
                    className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                    title="居中对齐"
                  >
                    <AlignCenter className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => applyFormatToNodes((e) => e.chain().setTextAlign('right').run())}
                    className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                    title="右对齐"
                  >
                    <AlignRight className="w-4 h-4" />
                  </button>
                  <div className="w-px h-4 bg-gray-300 mx-1"></div>
                  <button
                    onClick={() => applyVerticalAlignToNodes('top')}
                    className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                    title="顶端对齐"
                  >
                    <AlignVerticalJustifyStart className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => applyVerticalAlignToNodes('center')}
                    className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                    title="垂直居中"
                  >
                    <AlignVerticalJustifyCenter className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => applyVerticalAlignToNodes('bottom')}
                    className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                    title="底端对齐"
                  >
                    <AlignVerticalJustifyEnd className="w-4 h-4" />
                  </button>
                </div>
                <div className="w-full p-2 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-500 text-center mt-1">
                  双击画布中的节点即可直接编辑文字
                </div>
              </div>

              {latestSelectedNodes.length > 1 && (
                <div className="flex flex-col gap-3 mt-2 pt-4 border-t border-gray-200">
                  <div className="flex items-center gap-2">
                    <AlignLeft className="w-4 h-4 text-gray-500" />
                    <h3 className="text-sm font-medium text-gray-700">布局对齐</h3>
                  </div>
                  
                  <div className="flex gap-2">
                    <div className="flex flex-col gap-1.5 w-1/2">
                      <label className="text-xs text-gray-500">上下间距 (格)</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={verticalSpacing}
                        onChange={(e) => setVerticalSpacing(Number(e.target.value))}
                        className="w-full p-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 w-1/2">
                      <label className="text-xs text-gray-500">左右间距 (格)</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={horizontalSpacing}
                        onChange={(e) => setHorizontalSpacing(Number(e.target.value))}
                        className="w-full p-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  
                  <button
                    onClick={applyLayout}
                    className="w-full py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded-md text-sm font-medium transition-colors"
                  >
                    应用间距与居中
                  </button>
                </div>
              )}
            </div>
          ) : null;
          })()}

          {selectedEdges.length > 0 ? (
            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                <span className="text-xs font-semibold text-gray-500 uppercase">当前选中: {selectedEdges.length} 条连线</span>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">线条样式</label>
                <select
                  value={selectedEdges.every(e => e.style?.strokeDasharray === selectedEdges[0].style?.strokeDasharray) ? (selectedEdges[0].style?.strokeDasharray ? 'dashed' : 'solid') : ''}
                  onChange={updateEdgeStyle}
                  className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="" disabled hidden>多种样式</option>
                  <option value="solid">实线</option>
                  <option value="dashed">虚线</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">连线文本</label>
                <input
                  value={edgeLabelInput}
                  onChange={(e) => {
                    setEdgeLabelInput(e.target.value);
                    updateEdgeLabel(e.target.value);
                  }}
                  onFocus={() => {
                    isEdgeLabelFocused.current = true;
                    takeSnapshot();
                  }}
                  onBlur={() => {
                    isEdgeLabelFocused.current = false;
                  }}
                  className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="输入连线上的文字..."
                />
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <button
                  onClick={reverseEdge}
                  className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md transition-colors border border-gray-300"
                >
                  反向连线
                </button>
                <button
                  onClick={deleteEdge}
                  className="w-full py-2 px-4 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-md transition-colors border border-red-200"
                >
                  删除连线
                </button>
              </div>
            </div>
          ) : null}

          {selectedNodes.length === 0 && selectedEdges.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm text-center border-2 border-dashed border-gray-200 rounded-lg">
              <p>点击或框选画布中的节点/连线<br/>即可在此处编辑属性</p>
            </div>
          ) : null}
        </aside>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-blue-600" />
                功能与快捷键指南
              </h3>
              <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-6">
                <section>
                  <h4 className="font-bold text-gray-800 mb-3 border-b pb-2">✨ 核心功能</h4>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li><strong className="text-gray-800">AI 智能生成：</strong>支持通过文字描述或上传图片（如手绘草图）一键生成流程图。</li>
                    <li><strong className="text-gray-800">富文本编辑：</strong>双击节点即可进行富文本编辑，支持加粗、标题、对齐方式等。</li>
                    <li><strong className="text-gray-800">样式自定义：</strong>支持切换矩形/圆角矩形，实线/虚线边框，以及多种连线类型（阶梯、平滑、直线）。</li>
                    <li><strong className="text-gray-800">自动排版：</strong>点击顶部“自动排版”按钮，系统会自动将凌乱的节点整理为从上到下的树状结构。</li>
                  </ul>
                </section>

                <section>
                  <h4 className="font-bold text-gray-800 mb-3 border-b pb-2">🔄 导入与导出</h4>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li><strong className="text-gray-800">代码双向同步 (Mermaid)：</strong>支持导出 Mermaid 代码，也可直接粘贴代码并“同步到画布”实现快速导入，完美对接 draw.io。</li>
                    <li><strong className="text-gray-800">高清图片导出：</strong>支持导出 PNG 和 SVG 矢量图，可自定义四周留白和分辨率（1x/2x），SVG 格式完美适配学术论文排版，放大不模糊。</li>
                    <li><strong className="text-gray-800">工程文件存取：</strong>点击保存按钮可下载 <code>.json</code> 工程文件，下次点击文件夹图标即可恢复进度。</li>
                  </ul>
                </section>
                
                <section>
                  <h4 className="font-bold text-gray-800 mb-3 border-b pb-2">⌨️ 快捷键大全</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <div className="font-semibold text-gray-700 mb-2">基础操作</div>
                      <ul className="space-y-2 text-gray-600">
                        <li className="flex justify-between"><span>新建节点</span> <kbd className="bg-white border shadow-sm px-1.5 rounded text-xs">N</kbd></li>
                        <li className="flex justify-between"><span>全选</span> <kbd className="bg-white border shadow-sm px-1.5 rounded text-xs">Ctrl + A</kbd></li>
                        <li className="flex justify-between"><span>复制</span> <kbd className="bg-white border shadow-sm px-1.5 rounded text-xs">Ctrl + C</kbd></li>
                        <li className="flex justify-between"><span>粘贴</span> <kbd className="bg-white border shadow-sm px-1.5 rounded text-xs">Ctrl + V</kbd></li>
                        <li className="flex justify-between"><span>删除</span> <kbd className="bg-white border shadow-sm px-1.5 rounded text-xs">Delete / Backspace</kbd></li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <div className="font-semibold text-gray-700 mb-2">高级操作</div>
                      <ul className="space-y-2 text-gray-600">
                        <li className="flex justify-between"><span>撤销</span> <kbd className="bg-white border shadow-sm px-1.5 rounded text-xs">Ctrl + Z</kbd></li>
                        <li className="flex justify-between"><span>重做</span> <kbd className="bg-white border shadow-sm px-1.5 rounded text-xs">Ctrl + Y</kbd></li>
                        <li className="flex justify-between"><span>多选</span> <kbd className="bg-white border shadow-sm px-1.5 rounded text-xs">按住 Shift 框选</kbd></li>
                        <li className="flex justify-between"><span>连续多选</span> <kbd className="bg-white border shadow-sm px-1.5 rounded text-xs">按住 Ctrl 点击</kbd></li>
                        <li className="flex justify-between"><span>方向微调</span> <kbd className="bg-white border shadow-sm px-1.5 rounded text-xs">↑ ↓ ← →</kbd></li>
                      </ul>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">* Mac 用户请将 Ctrl 替换为 Cmd 键</p>
                </section>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-blue-600 font-medium italic">
                早睡早起身体好，祝你早日写完论文，天天开心
              </p>
              <button onClick={() => setShowHelp(false)} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates Modal */}
      {showTemplates && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <LayoutTemplate className="w-5 h-5 text-indigo-600" />
                模板库
              </h3>
              <button onClick={() => setShowTemplates(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
              <div className="space-y-8">
                <section>
                  <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
                    竖向模板 (自上而下)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {verticalTemplates.map((tpl) => (
                      <div key={tpl.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow flex flex-col">
                        <h5 className="font-bold text-gray-800 mb-1">{tpl.name}</h5>
                        <p className="text-xs text-gray-500 mb-4 flex-1">{tpl.description}</p>
                        <button
                          onClick={() => loadTemplate(tpl)}
                          className="w-full py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium text-sm rounded-lg transition-colors"
                        >
                          使用此模板
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
                
                <section>
                  <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                    横向模板 (从左到右)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {horizontalTemplates.map((tpl) => (
                      <div key={tpl.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow flex flex-col">
                        <h5 className="font-bold text-gray-800 mb-1">{tpl.name}</h5>
                        <p className="text-xs text-gray-500 mb-4 flex-1">{tpl.description}</p>
                        <button
                          onClick={() => loadTemplate(tpl)}
                          className="w-full py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium text-sm rounded-lg transition-colors"
                        >
                          使用此模板
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-purple-50 to-blue-50">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                AI 智能生成流程图
              </h3>
              <button onClick={() => setShowAIModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">1. 输入法条、案情或流程描述</label>
                <textarea
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder="例如：如果当事人对一审判决不服，可以在15日内提起上诉。如果提起上诉，进入二审程序；如果不提起上诉，判决生效，进入执行程序..."
                  className="w-full h-32 p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">2. 或上传参考文件 (支持图片、PDF、Word、TXT等，AI将自动提取或复刻)</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700">
                    <Upload className="w-4 h-4" />
                    选择文件
                    <input type="file" accept="image/*,.pdf,.doc,.docx,.txt" className="hidden" onChange={handleAiFileUpload} />
                  </label>
                  {aiFilePreview ? (
                    <div className="relative w-20 h-20 border border-gray-200 rounded-lg overflow-hidden">
                      <img src={aiFilePreview} alt="Preview" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => { setAiFile(null); setAiFilePreview(null); }}
                        className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5 hover:bg-black/70"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : aiFile ? (
                    <div className="relative flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white">
                      <FileText className="w-5 h-5 text-gray-500" />
                      <span className="text-sm text-gray-700 max-w-[150px] truncate">{aiFile.name}</span>
                      <button 
                        onClick={() => { setAiFile(null); setAiFilePreview(null); }}
                        className="ml-2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button 
                onClick={() => setShowAIModal(false)} 
                className="px-4 py-2 text-gray-600 bg-white border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleAIGenerate}
                disabled={aiLoading || (!aiText.trim() && !aiFile)}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {aiLoading ? 'AI 正在思考中...' : '开始生成'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Download className="w-5 h-5 text-gray-600" />
                导出预览 ({exportFormat.toUpperCase()})
              </h3>
              <button onClick={() => setShowExportModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 p-6 bg-gray-100 flex items-center justify-center overflow-auto relative">
                {isExporting ? (
                  <div className="flex flex-col items-center justify-center text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin mb-2" />
                    <p>正在生成预览...</p>
                  </div>
                ) : exportPreviewUrl ? (
                  <div className="bg-white shadow-sm border border-gray-200 max-w-full max-h-full overflow-auto">
                    <img src={exportPreviewUrl} alt="Export Preview" className="max-w-full h-auto block" />
                  </div>
                ) : null}
              </div>
              
              <div className="w-64 border-l border-gray-200 bg-white p-6 flex flex-col gap-6 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">四周留白</label>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="padding" 
                        value="narrow" 
                        checked={exportPadding === 'narrow'} 
                        onChange={(e) => setExportPadding(e.target.value as any)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">窄 (20px)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="padding" 
                        value="medium" 
                        checked={exportPadding === 'medium'} 
                        onChange={(e) => setExportPadding(e.target.value as any)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">中 (50px)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="padding" 
                        value="wide" 
                        checked={exportPadding === 'wide'} 
                        onChange={(e) => setExportPadding(e.target.value as any)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">宽 (100px)</span>
                    </label>
                  </div>
                </div>

                {exportFormat === 'png' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">分辨率</label>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="radio" 
                          name="resolution" 
                          value="normal" 
                          checked={exportResolution === 'normal'} 
                          onChange={(e) => setExportResolution(e.target.value as any)}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">普通 (1x)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="radio" 
                          name="resolution" 
                          value="high" 
                          checked={exportResolution === 'high'} 
                          onChange={(e) => setExportResolution(e.target.value as any)}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">高清 (2x)</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button 
                onClick={() => setShowExportModal(false)} 
                className="px-4 py-2 text-gray-600 bg-white border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={downloadExport}
                disabled={isExporting || !exportPreviewUrl}
                className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <Download className="w-4 h-4" />
                确认导出
              </button>
            </div>
          </div>
        </div>
      )}
      {showCodeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col h-[85vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Code className="w-5 h-5 text-gray-600" />
                导出 / 导入代码 (Mermaid)
              </h3>
              <button onClick={() => setShowCodeModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-4 overflow-hidden flex-1">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
                <p className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>您可以直接在此处编辑代码，点击<strong>同步到画布</strong>即可更新，或复制到 <strong>draw.io</strong> (排列 -&gt; 插入 -&gt; 高级 -&gt; Mermaid) 中进行二次编辑。</span>
                </p>
              </div>
              
              <div className="flex-1 relative">
                <textarea
                  value={generatedCode}
                  onChange={(e) => setGeneratedCode(e.target.value)}
                  className="w-full h-full p-4 font-mono text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="在此输入或粘贴 Mermaid 代码..."
                />
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
              <button 
                onClick={applyMermaidCode}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                同步到画布
              </button>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowCodeModal(false)} 
                  className="px-4 py-2 text-gray-600 bg-white border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  关闭
                </button>
                <button 
                  onClick={downloadCode}
                  className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  下载 .mmd
                </button>
                <button 
                  onClick={copyToClipboard}
                  className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-all shadow-sm"
                >
                  {copySuccess ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copySuccess ? '已复制' : '复制到剪贴板'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
