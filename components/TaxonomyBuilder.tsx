import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { TreeNode, Product } from '../types';
import { 
  ChevronRight, ChevronDown, Plus, Edit2, Trash2, Package, FolderTree, X, Check, 
  Search, GripVertical, Building2, Layers, Grid3X3, Tag, AlertTriangle,
  ChevronsUpDown, ChevronsDownUp, Camera, Download
} from 'lucide-react';

interface TaxonomyBuilderProps {
  treeNodes: TreeNode[];
  products: Product[];
  onAddNode: (node: TreeNode) => void;
  onUpdateNode: (id: string, updates: Partial<TreeNode>) => void;
  onDeleteNode: (id: string) => void;
}

interface TreeNodeWithLevel extends TreeNode {
  level: number;
  children: TreeNodeWithLevel[];
  productCount: number;
}

interface DragState {
  nodeId: string;
  nodeName: string;
  level: number;
}

interface DropTarget {
  type: 'inside' | 'before' | 'after';
  nodeId: string;
  parentId: string | null;
}

const SECTOR_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-400', badge: 'bg-blue-100 text-blue-700 border-blue-200', text: 'text-blue-900', accent: '#3b82f6' },
  { bg: 'bg-purple-50', border: 'border-purple-400', badge: 'bg-purple-100 text-purple-700 border-purple-200', text: 'text-purple-900', accent: '#8b5cf6' },
  { bg: 'bg-rose-50', border: 'border-rose-400', badge: 'bg-rose-100 text-rose-700 border-rose-200', text: 'text-rose-900', accent: '#f43f5e' },
  { bg: 'bg-amber-50', border: 'border-amber-400', badge: 'bg-amber-100 text-amber-700 border-amber-200', text: 'text-amber-900', accent: '#f59e0b' },
  { bg: 'bg-teal-50', border: 'border-teal-400', badge: 'bg-teal-100 text-teal-700 border-teal-200', text: 'text-teal-900', accent: '#14b8a6' },
  { bg: 'bg-indigo-50', border: 'border-indigo-400', badge: 'bg-indigo-100 text-indigo-700 border-indigo-200', text: 'text-indigo-900', accent: '#6366f1' },
  { bg: 'bg-cyan-50', border: 'border-cyan-400', badge: 'bg-cyan-100 text-cyan-700 border-cyan-200', text: 'text-cyan-900', accent: '#06b6d4' },
  { bg: 'bg-orange-50', border: 'border-orange-400', badge: 'bg-orange-100 text-orange-700 border-orange-200', text: 'text-orange-900', accent: '#f97316' },
  { bg: 'bg-pink-50', border: 'border-pink-400', badge: 'bg-pink-100 text-pink-700 border-pink-200', text: 'text-pink-900', accent: '#ec4899' },
  { bg: 'bg-lime-50', border: 'border-lime-400', badge: 'bg-lime-100 text-lime-700 border-lime-200', text: 'text-lime-900', accent: '#84cc16' },
];

const LEVEL_CONFIG = {
  sector: {
    label: 'Sector',
    icon: Building2,
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-300',
    badgeClass: 'bg-blue-100 text-blue-700 border-blue-200',
    textClass: 'text-blue-900 font-bold',
  },
  category: {
    label: 'Category',
    icon: Layers,
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    textClass: 'text-emerald-900 font-semibold',
  },
  subcategory: {
    label: 'Sub',
    icon: Grid3X3,
    bgClass: 'bg-white',
    borderClass: 'border-slate-300',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    textClass: 'text-slate-800 font-medium',
  },
  group: {
    label: 'Custom',
    icon: Tag,
    bgClass: 'bg-white',
    borderClass: 'border-dashed border-slate-300',
    badgeClass: 'bg-purple-50 text-purple-600 border-purple-200',
    textClass: 'text-slate-700',
  },
};

const TaxonomyBuilder: React.FC<TaxonomyBuilderProps> = ({
  treeNodes,
  products,
  onAddNode,
  onUpdateNode,
  onDeleteNode,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root']));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeType, setNewNodeType] = useState<'sector' | 'category' | 'subcategory' | 'group'>('category');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<TreeNodeWithLevel | null>(null);
  const [showMoveConfirm, setShowMoveConfirm] = useState<{ 
    nodeId: string; 
    nodeName: string; 
    targetId: string | null; 
    targetName: string;
    newType: string;
    position: 'inside' | 'before' | 'after';
  } | null>(null);
  const [editCancelled, setEditCancelled] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLevel, setExportLevel] = useState<'sectors' | 'categories' | 'subcategories' | 'all'>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [newBranchCode, setNewBranchCode] = useState('');
  const [branchCodeError, setBranchCodeError] = useState('');
  
  const editInputRef = useRef<HTMLInputElement>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);

  const buildTree = useCallback((nodes: TreeNode[], parentId: string | null, level: number): TreeNodeWithLevel[] => {
    return nodes
      .filter(n => n.parentId === parentId)
      .map(node => {
        const children = buildTree(nodes, node.id, level + 1);
        const descendantIds = [node.id];
        const collectDescendants = (n: TreeNodeWithLevel) => {
          descendantIds.push(n.id);
          n.children.forEach(collectDescendants);
        };
        children.forEach(collectDescendants);
        const productCount = products.filter(p => descendantIds.includes(p.nodeId)).length;
        
        return {
          ...node,
          level,
          children,
          productCount,
        };
      });
  }, [products]);

  const tree = useMemo(() => buildTree(treeNodes, null, 1), [treeNodes, buildTree]);
  const totalProducts = products.length;

  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;
    
    const query = searchQuery.toLowerCase();
    
    const filterNodes = (nodes: TreeNodeWithLevel[]): TreeNodeWithLevel[] => {
      return nodes.reduce<TreeNodeWithLevel[]>((acc, node) => {
        const matchesSearch = node.name.toLowerCase().includes(query);
        const filteredChildren = filterNodes(node.children);
        
        if (matchesSearch || filteredChildren.length > 0) {
          acc.push({
            ...node,
            children: matchesSearch ? node.children : filteredChildren,
          });
        }
        return acc;
      }, []);
    };
    
    return filterNodes(tree);
  }, [tree, searchQuery]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const allNodeIds = new Set<string>();
      const collectIds = (nodes: TreeNodeWithLevel[]) => {
        nodes.forEach(n => {
          allNodeIds.add(n.id);
          collectIds(n.children);
        });
      };
      collectIds(filteredTree);
      setExpandedNodes(prev => new Set([...prev, ...allNodeIds]));
    }
  }, [searchQuery, filteredTree]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const getSectorColorIndex = useCallback((node: TreeNodeWithLevel): number => {
    if (node.metadata?.colorIndex !== undefined) {
      return node.metadata.colorIndex as number;
    }
    const sectors = tree.filter(n => n.type === 'sector');
    const sectorIndex = sectors.findIndex(s => s.id === node.id);
    return sectorIndex % SECTOR_COLORS.length;
  }, [tree]);

  const getSectorColor = useCallback((node: TreeNodeWithLevel): typeof SECTOR_COLORS[0] | null => {
    if (node.type !== 'sector') return null;
    const colorIndex = getSectorColorIndex(node);
    return SECTOR_COLORS[colorIndex];
  }, [getSectorColorIndex]);

  const getNextColorIndex = useCallback((): number => {
    const sectors = tree.filter(n => n.type === 'sector');
    const usedIndices = sectors.map((s, idx) => {
      if (s.metadata?.colorIndex !== undefined) {
        return s.metadata.colorIndex as number;
      }
      return idx % SECTOR_COLORS.length;
    });
    for (let i = 0; i < SECTOR_COLORS.length; i++) {
      if (!usedIndices.includes(i)) return i;
    }
    return sectors.length % SECTOR_COLORS.length;
  }, [tree]);

  const expandAll = () => {
    const allIds = new Set<string>(['root']);
    const collectIds = (nodes: TreeNodeWithLevel[]) => {
      nodes.forEach(n => {
        allIds.add(n.id);
        collectIds(n.children);
      });
    };
    collectIds(tree);
    setExpandedNodes(allIds);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set(['root']));
  };

  const expandToLevel = (maxLevel: number) => {
    const ids = new Set<string>(['root']);
    const collectIds = (nodes: TreeNodeWithLevel[]) => {
      nodes.forEach(n => {
        if (n.level <= maxLevel) {
          ids.add(n.id);
          collectIds(n.children);
        }
      });
    };
    collectIds(tree);
    setExpandedNodes(ids);
  };

  const generateBranchCodeSuggestion = useCallback((name: string): string => {
    const existingCodes = treeNodes.filter(n => n.branchCode).map(n => n.branchCode!);
    const words = name.trim().toUpperCase().split(/\s+/);
    let code = '';
    if (words.length === 1) {
      const word = words[0];
      const consonants = word.replace(/[AEIOU]/g, '');
      code = consonants.length >= 2 ? consonants.substring(0, 2) : word.substring(0, 2);
    } else {
      code = words.map(w => w[0]).join('').substring(0, 5);
    }
    code = code.substring(0, 5);
    if (!existingCodes.includes(code)) return code;
    const base = code.substring(0, 4);
    for (let i = 1; i <= 9; i++) {
      const candidate = `${base}${i}`;
      if (!existingCodes.includes(candidate)) return candidate;
    }
    return code;
  }, [treeNodes]);

  const validateBranchCode = useCallback((code: string): string => {
    if (!code) return '';
    if (code !== code.toUpperCase()) return 'Must be uppercase';
    if (code.length > 5) return 'Max 5 characters';
    if (/\s/.test(code)) return 'No spaces allowed';
    if (!/^[A-Z0-9]+$/.test(code)) return 'Only uppercase letters and numbers';
    const existingCodes = treeNodes.filter(n => n.branchCode).map(n => n.branchCode!);
    if (existingCodes.includes(code)) return 'Code already in use';
    return '';
  }, [treeNodes]);

  const handleAddClick = (parentId: string | null, level: number) => {
    setAddParentId(parentId);
    setNewNodeName('');
    setNewBranchCode('');
    setBranchCodeError('');
    if (level === 0) setNewNodeType('sector');
    else if (level === 1) setNewNodeType('category');
    else if (level === 2) setNewNodeType('subcategory');
    else setNewNodeType('group');
    setShowAddModal(true);
  };

  const handleAddConfirm = () => {
    if (!newNodeName.trim()) return;
    const code = newBranchCode.trim().toUpperCase();
    if (code) {
      const error = validateBranchCode(code);
      if (error) {
        setBranchCodeError(error);
        return;
      }
    }
    const newNode: TreeNode = {
      id: `node-${Date.now()}`,
      name: newNodeName.trim(),
      type: newNodeType,
      parentId: addParentId,
      metadata: newNodeType === 'sector' ? { colorIndex: getNextColorIndex() } : undefined,
      branchCode: code || generateBranchCodeSuggestion(newNodeName.trim()),
    };
    onAddNode(newNode);
    setShowAddModal(false);
    setNewNodeName('');
    setNewBranchCode('');
    setBranchCodeError('');
    if (addParentId) {
      setExpandedNodes(prev => new Set([...prev, addParentId]));
    }
  };

  const exportToImage = async () => {
    if (!treeContainerRef.current) return;
    setIsExporting(true);
    
    const previousExpandedNodes = new Set(expandedNodes);
    
    const levelMap = { sectors: 1, categories: 2, subcategories: 3, all: 999 };
    const maxLevel = levelMap[exportLevel];
    expandToLevel(maxLevel);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
      const container = treeContainerRef.current;
      const originalOverflow = container.style.overflow;
      const originalHeight = container.style.height;
      
      container.style.overflow = 'visible';
      container.style.height = 'auto';
      
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(container, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
        windowHeight: container.scrollHeight,
        height: container.scrollHeight,
      });
      
      container.style.overflow = originalOverflow;
      container.style.height = originalHeight;
      
      const link = document.createElement('a');
      link.download = `taxonomy-${exportLevel}-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
    
    setExpandedNodes(previousExpandedNodes);
    setIsExporting(false);
    setShowExportModal(false);
  };

  const startEdit = (node: TreeNode) => {
    setEditingId(node.id);
    setEditName(node.name);
    setEditCancelled(false);
  };

  const saveEdit = async (nodeId: string) => {
    if (editCancelled) {
      setEditCancelled(false);
      return;
    }
    if (editName.trim()) {
      setSavingId(nodeId);
      onUpdateNode(nodeId, { name: editName.trim() });
      setTimeout(() => setSavingId(null), 500);
    }
    setEditingId(null);
    setEditName('');
  };

  const cancelEdit = () => {
    setEditCancelled(true);
    setEditingId(null);
    setEditName('');
  };

  const handleDeleteClick = (node: TreeNodeWithLevel) => {
    if (node.productCount > 0 || node.children.length > 0) {
      setShowDeleteConfirm(node);
    } else {
      onDeleteNode(node.id);
    }
  };

  const confirmDelete = () => {
    if (showDeleteConfirm) {
      onDeleteNode(showDeleteConfirm.id);
      setShowDeleteConfirm(null);
    }
  };

  const isDescendantOf = useCallback((nodeId: string, potentialAncestorId: string): boolean => {
    const findNode = (nodes: TreeNodeWithLevel[]): TreeNodeWithLevel | null => {
      for (const n of nodes) {
        if (n.id === potentialAncestorId) return n;
        const found = findNode(n.children);
        if (found) return found;
      }
      return null;
    };
    
    const checkDescendants = (node: TreeNodeWithLevel): boolean => {
      if (node.id === nodeId) return true;
      return node.children.some(child => checkDescendants(child));
    };
    
    const ancestor = findNode(tree);
    return ancestor ? checkDescendants(ancestor) : false;
  }, [tree]);

  const getNodeById = useCallback((nodeId: string): TreeNodeWithLevel | null => {
    const findNode = (nodes: TreeNodeWithLevel[]): TreeNodeWithLevel | null => {
      for (const n of nodes) {
        if (n.id === nodeId) return n;
        const found = findNode(n.children);
        if (found) return found;
      }
      return null;
    };
    return findNode(tree);
  }, [tree]);

  const handleDragStart = (e: React.DragEvent, node: TreeNodeWithLevel) => {
    setDragState({ nodeId: node.id, nodeName: node.name, level: node.level });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.id);
  };

  const isValidDropTarget = useCallback((targetId: string | null): boolean => {
    if (!dragState) return false;
    if (targetId === dragState.nodeId) return false;
    if (targetId && isDescendantOf(targetId, dragState.nodeId)) return false;
    return true;
  }, [dragState, isDescendantOf]);

  const getTypeForDepth = (depth: number): 'sector' | 'category' | 'subcategory' | 'group' => {
    if (depth === 1) return 'sector';
    if (depth === 2) return 'category';
    if (depth === 3) return 'subcategory';
    return 'group';
  };

  const getTypeLabelForDepth = (depth: number): string => {
    if (depth === 1) return 'Sector';
    if (depth === 2) return 'Category';
    if (depth === 3) return 'Sub-Category';
    return 'Custom Level';
  };

  const handleDragOver = (e: React.DragEvent, nodeId: string, parentId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!dragState || !isValidDropTarget(nodeId)) {
      setDropTarget(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    
    if (y < height * 0.25) {
      setDropTarget({ type: 'before', nodeId, parentId });
    } else if (y > height * 0.75) {
      setDropTarget({ type: 'after', nodeId, parentId });
    } else {
      setDropTarget({ type: 'inside', nodeId, parentId });
    }
  };

  const handleRootDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragState && isValidDropTarget(null)) {
      setDropTarget({ type: 'after', nodeId: 'root', parentId: null });
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDropTarget(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetNodeId: string, targetParentId: string | null, targetLevel: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!dragState || !dropTarget) {
      setDragState(null);
      setDropTarget(null);
      return;
    }

    let newParentId: string | null;
    let newDepth: number;
    let targetName: string;
    
    if (dropTarget.type === 'inside') {
      newParentId = targetNodeId;
      newDepth = targetLevel + 1;
      const targetNode = getNodeById(targetNodeId);
      targetName = `inside "${targetNode?.name || 'Unknown'}"`;
    } else {
      newParentId = targetParentId;
      newDepth = targetLevel;
      if (targetParentId) {
        const parentNode = getNodeById(targetParentId);
        targetName = `under "${parentNode?.name || 'Unknown'}"`;
      } else {
        targetName = 'to root level';
      }
    }

    if (!isValidDropTarget(newParentId === targetNodeId ? targetNodeId : newParentId)) {
      setDragState(null);
      setDropTarget(null);
      return;
    }

    const newType = getTypeForDepth(newDepth);
    
    setShowMoveConfirm({
      nodeId: dragState.nodeId,
      nodeName: dragState.nodeName,
      targetId: newParentId,
      targetName,
      newType,
      position: dropTarget.type
    });
    
    setDragState(null);
    setDropTarget(null);
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragState && isValidDropTarget(null)) {
      setShowMoveConfirm({
        nodeId: dragState.nodeId,
        nodeName: dragState.nodeName,
        targetId: null,
        targetName: 'root level',
        newType: 'sector',
        position: 'after'
      });
    }
    setDragState(null);
    setDropTarget(null);
  };

  const confirmMove = () => {
    if (showMoveConfirm) {
      onUpdateNode(showMoveConfirm.nodeId, { 
        parentId: showMoveConfirm.targetId,
        type: showMoveConfirm.newType as 'sector' | 'category' | 'subcategory' | 'group'
      });
      if (showMoveConfirm.targetId) {
        setExpandedNodes(prev => new Set([...prev, showMoveConfirm.targetId!]));
      }
      setShowMoveConfirm(null);
    }
  };

  const handleDragEnd = () => {
    setDragState(null);
    setDropTarget(null);
  };

  const getNodeConfig = (type: string) => {
    return LEVEL_CONFIG[type as keyof typeof LEVEL_CONFIG] || LEVEL_CONFIG.group;
  };

  const getDepthLineOpacity = (level: number): string => {
    const opacities = ['border-slate-400', 'border-slate-300', 'border-slate-200', 'border-slate-100'];
    return opacities[Math.min(level - 1, opacities.length - 1)];
  };

  const renderTreeNode = (node: TreeNodeWithLevel, isLast: boolean, ancestors: string[] = [], parentId: string | null = null): React.ReactNode => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children.length > 0;
    const config = getNodeConfig(node.type);
    const Icon = config.icon;
    const isHovered = hoveredNodeId === node.id;
    const isDragging = dragState?.nodeId === node.id;
    const isSaving = savingId === node.id;
    
    const isDropInside = dropTarget?.type === 'inside' && dropTarget?.nodeId === node.id;
    const isDropBefore = dropTarget?.type === 'before' && dropTarget?.nodeId === node.id;
    const isDropAfter = dropTarget?.type === 'after' && dropTarget?.nodeId === node.id;
    
    const sectorColor = getSectorColor(node);
    const bgClass = sectorColor ? sectorColor.bg : config.bgClass;
    const borderClass = sectorColor ? sectorColor.border : config.borderClass;
    const badgeClass = sectorColor ? sectorColor.badge : config.badgeClass;
    const textClass = sectorColor ? sectorColor.text : config.textClass;

    return (
      <div key={node.id} className={`relative ${isDragging ? 'opacity-50' : ''}`}>
        {isDropBefore && (
          <div className="absolute left-0 right-0 -top-1 h-1 bg-blue-500 rounded-full z-10" />
        )}
        <div 
          className={`relative flex items-center gap-2 mb-2 transition-all duration-200 ${
            isDropInside ? 'transform scale-[1.02]' : ''
          }`}
          onMouseEnter={() => setHoveredNodeId(node.id)}
          onMouseLeave={() => setHoveredNodeId(null)}
          draggable
          onDragStart={(e) => handleDragStart(e, node)}
          onDragOver={(e) => handleDragOver(e, node.id, parentId)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node.id, parentId, node.level)}
          onDragEnd={handleDragEnd}
        >
          <div 
            className={`
              flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200 cursor-pointer
              ${bgClass} ${borderClass}
              ${isHovered ? 'shadow-lg ring-2 ring-blue-100' : 'shadow-sm'}
              ${isDropInside ? 'ring-4 ring-blue-400 border-blue-500 bg-blue-100 shadow-lg' : ''}
              ${node.type === 'group' ? 'border-dashed' : ''}
            `}
          >
            <div 
              className="cursor-grab active:cursor-grabbing p-1 -ml-2 text-slate-400 hover:text-slate-600"
              title="Drag to reorder"
            >
              <GripVertical size={16} />
            </div>

            <button
              onClick={() => toggleExpand(node.id)}
              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/70 transition-colors"
            >
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown size={18} className="text-slate-600" />
                ) : (
                  <ChevronRight size={18} className="text-slate-600" />
                )
              ) : (
                <div className="w-2 h-2 rounded-full bg-slate-300" />
              )}
            </button>

            <div className={`p-1.5 rounded-lg ${badgeClass} border`}>
              <Icon size={14} />
            </div>

            {editingId === node.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  ref={editInputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 px-3 py-1.5 border-2 border-blue-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(node.id);
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  onBlur={() => saveEdit(node.id)}
                />
                {isSaving && (
                  <span className="text-xs text-blue-500 animate-pulse">Saving...</span>
                )}
              </div>
            ) : (
              <div 
                className="flex items-center gap-3 flex-1 min-w-0"
                onClick={() => startEdit(node)}
              >
                <span className={`${textClass} font-bold truncate cursor-text hover:underline decoration-dotted`}>
                  {node.name}
                </span>
                {isSaving && (
                  <span className="text-xs text-green-500 animate-pulse">Saved!</span>
                )}
              </div>
            )}

            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeClass}`}>
              {config.label}
            </span>

            {node.branchCode && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 tracking-wider">
                {node.branchCode}
              </span>
            )}

            {node.productCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-white/80 px-2.5 py-1 rounded-full border border-slate-200">
                <Package size={12} /> 
                <span className="font-semibold">{node.productCount}</span>
              </span>
            )}

            <div className={`flex items-center gap-0.5 transition-all duration-200 ${isHovered && !editingId ? 'opacity-100' : 'opacity-0'}`}>
              <button
                onClick={(e) => { e.stopPropagation(); handleAddClick(node.id, node.level); }}
                className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                title="Add child"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); startEdit(node); }}
                className="p-2 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors"
                title="Rename"
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteClick(node); }}
                className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>

        {isDropAfter && (
          <div className="absolute left-0 right-0 -bottom-1 h-1 bg-blue-500 rounded-full z-10" />
        )}

        {isExpanded && hasChildren && (
          <div className={`ml-6 pl-6 border-l-2 ${getDepthLineOpacity(node.level)}`}>
            {node.children.map((child, idx) => renderTreeNode(child, idx === node.children.length - 1, [...ancestors, node.id], node.id))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <FolderTree className="text-white" size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg text-slate-800">Taxonomy Builder</h2>
              <p className="text-sm text-slate-500">Build your product hierarchy with unlimited levels</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={expandAll}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
                title="Expand All"
              >
                <ChevronsDownUp size={16} />
              </button>
              <div className="w-px h-6 bg-slate-200" />
              <button
                onClick={collapseAll}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
                title="Collapse All"
              >
                <ChevronsUpDown size={16} />
              </button>
            </div>
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
              title="Export as Image"
            >
              <Camera size={16} />
            </button>
            <button
              onClick={() => handleAddClick(null, 0)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-200 font-medium text-sm"
            >
              <Plus size={18} />
              Add Sector
            </button>
          </div>
        </div>

        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories... (type to filter)"
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 rounded-lg"
            >
              <X size={14} className="text-slate-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 p-3 bg-slate-50 border-b border-slate-200 overflow-x-auto">
        {Object.entries(LEVEL_CONFIG).map(([key, config]) => {
          const Icon = config.icon;
          return (
            <div key={key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${config.badgeClass} border`}>
              <Icon size={12} />
              {config.label}
            </div>
          );
        })}
      </div>

      <div 
        ref={treeContainerRef}
        className="flex-1 overflow-auto p-6"
        onDragOver={handleRootDragOver}
        onDragLeave={() => setDropTarget(null)}
        onDrop={handleRootDrop}
      >
        <div 
          className={`flex items-center gap-3 p-4 mb-4 rounded-xl border-2 transition-all ${
            dropTarget?.nodeId === 'root' ? 'bg-blue-50 border-blue-300 ring-4 ring-blue-100' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
            <ChevronDown size={18} className="text-slate-500" />
          </div>
          <span className="font-bold text-slate-800 text-lg">ALL PRODUCTS</span>
          <span className="flex items-center gap-1.5 text-sm text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200 ml-auto">
            <Package size={14} /> 
            <span className="font-semibold">{totalProducts}</span> total
          </span>
        </div>

        <div className="ml-4 pl-6 border-l-2 border-slate-300">
          {filteredTree.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FolderTree size={48} className="mx-auto mb-4 opacity-50" />
              {searchQuery ? (
                <>
                  <p className="text-lg font-medium">No matching categories</p>
                  <p className="text-sm">Try a different search term</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium">No taxonomy defined yet</p>
                  <p className="text-sm">Click "Add Sector" to create your first category</p>
                </>
              )}
            </div>
          ) : (
            filteredTree.map((node, idx) => renderTreeNode(node, idx === filteredTree.length - 1))
          )}
        </div>
      </div>

      {dragState && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 z-50">
          <GripVertical size={16} />
          <span className="font-medium">Moving: {dragState.nodeName}</span>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-slate-800 mb-4">
              Add New {newNodeType === 'sector' ? 'Sector' : newNodeType === 'category' ? 'Category' : newNodeType === 'subcategory' ? 'Sub-Category' : 'Level'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  placeholder={`Enter ${newNodeType} name...`}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddConfirm();
                    if (e.key === 'Escape') setShowAddModal(false);
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Branch Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newBranchCode}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 5);
                      setNewBranchCode(val);
                      setBranchCodeError(validateBranchCode(val));
                    }}
                    placeholder={newNodeName.trim() ? generateBranchCodeSuggestion(newNodeName) : 'e.g. PU, EP, TC'}
                    className={`flex-1 px-4 py-3 border ${branchCodeError ? 'border-red-400' : 'border-slate-300'} rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono uppercase tracking-wider transition-all`}
                    maxLength={5}
                  />
                  {newNodeName.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        const suggested = generateBranchCodeSuggestion(newNodeName);
                        setNewBranchCode(suggested);
                        setBranchCodeError('');
                      }}
                      className="px-3 py-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 text-xs font-medium whitespace-nowrap transition-colors"
                    >
                      Auto
                    </button>
                  )}
                </div>
                {branchCodeError && (
                  <p className="text-xs text-red-500 mt-1">{branchCodeError}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">2-5 uppercase characters, used in stock code generation</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={newNodeType}
                  onChange={(e) => setNewNodeType(e.target.value as any)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option key="sector" value="sector">Sector</option>
                  <option key="category" value="category">Category</option>
                  <option key="subcategory" value="subcategory">Sub-Category</option>
                  <option key="group" value="group">Group / Custom</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddConfirm}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Delete Category</h3>
                <p className="text-sm text-slate-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-slate-600 mb-2">
              Are you sure you want to delete <span className="font-semibold">{showDeleteConfirm.name}</span>?
            </p>
            {showDeleteConfirm.productCount > 0 && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                <Package size={16} className="text-amber-600" />
                <span className="text-sm text-amber-800">
                  <strong>{showDeleteConfirm.productCount}</strong> products will be affected
                </span>
              </div>
            )}
            {showDeleteConfirm.children.length > 0 && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                <Layers size={16} className="text-amber-600" />
                <span className="text-sm text-amber-800">
                  <strong>{showDeleteConfirm.children.length}</strong> child categories will also be deleted
                </span>
              </div>
            )}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
              >
                Delete Category
              </button>
            </div>
          </div>
        </div>
      )}

      {showMoveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <GripVertical className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Move Category</h3>
                <p className="text-sm text-slate-500">Confirm category relocation</p>
              </div>
            </div>
            <p className="text-slate-600 mb-4">
              Move <span className="font-semibold text-slate-800">"{showMoveConfirm.nodeName}"</span>{' '}
              <span className="font-semibold text-blue-600">{showMoveConfirm.targetName}</span>?
            </p>
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl mb-3">
              <Tag size={16} className="text-emerald-600" />
              <span className="text-sm text-emerald-800">
                Will become a <strong>{LEVEL_CONFIG[showMoveConfirm.newType as keyof typeof LEVEL_CONFIG]?.label || 'Custom'}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl mb-4">
              <Layers size={16} className="text-blue-600" />
              <span className="text-sm text-blue-800">
                All child categories will also be moved and re-typed
              </span>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowMoveConfirm(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmMove}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <Camera className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Export Taxonomy</h3>
                <p className="text-sm text-slate-500">Download as image for presentations</p>
              </div>
            </div>
            
            <div className="space-y-3 mb-6">
              <label className="text-sm font-medium text-slate-700">Select detail level:</label>
              {[
                { value: 'sectors', label: 'Sectors only', desc: 'Top level categories' },
                { value: 'categories', label: 'With Categories', desc: 'Sectors + Categories' },
                { value: 'subcategories', label: 'With Sub-Categories', desc: 'Sectors + Categories + Sub-Categories' },
                { value: 'all', label: 'Full tree', desc: 'All levels expanded' },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    exportLevel === option.value 
                      ? 'border-emerald-400 bg-emerald-50' 
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="exportLevel"
                    value={option.value}
                    checked={exportLevel === option.value}
                    onChange={(e) => setExportLevel(e.target.value as typeof exportLevel)}
                    className="w-4 h-4 text-emerald-600"
                  />
                  <div>
                    <span className="font-medium text-slate-800">{option.label}</span>
                    <p className="text-xs text-slate-500">{option.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={exportToImage}
                disabled={isExporting}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Download PNG
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaxonomyBuilder;
