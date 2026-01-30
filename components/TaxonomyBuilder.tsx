import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { TreeNode, Product } from '../types';
import { 
  ChevronRight, ChevronDown, Plus, Edit2, Trash2, Package, FolderTree, X, Check, 
  Search, GripVertical, Building2, Layers, Grid3X3, Tag, AlertTriangle
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
  
  const editInputRef = useRef<HTMLInputElement>(null);

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

  const handleAddClick = (parentId: string | null, level: number) => {
    setAddParentId(parentId);
    setNewNodeName('');
    if (level === 0) setNewNodeType('sector');
    else if (level === 1) setNewNodeType('category');
    else if (level === 2) setNewNodeType('subcategory');
    else setNewNodeType('group');
    setShowAddModal(true);
  };

  const handleAddConfirm = () => {
    if (!newNodeName.trim()) return;
    const newNode: TreeNode = {
      id: `node-${Date.now()}`,
      name: newNodeName.trim(),
      type: newNodeType,
      parentId: addParentId,
    };
    onAddNode(newNode);
    setShowAddModal(false);
    setNewNodeName('');
    if (addParentId) {
      setExpandedNodes(prev => new Set([...prev, addParentId]));
    }
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
    const isAnyDropTarget = isDropInside || isDropBefore || isDropAfter;

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
              ${config.bgClass} ${config.borderClass}
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

            <div className={`p-1.5 rounded-lg ${config.badgeClass} border`}>
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
                <span className={`${config.textClass} truncate cursor-text hover:underline decoration-dotted`}>
                  {node.name}
                </span>
                {isSaving && (
                  <span className="text-xs text-green-500 animate-pulse">Saved!</span>
                )}
              </div>
            )}

            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${config.badgeClass}`}>
              {config.label}
            </span>

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
          <button
            onClick={() => handleAddClick(null, 0)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-200 font-medium text-sm"
          >
            <Plus size={18} />
            Add Sector
          </button>
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
    </div>
  );
};

export default TaxonomyBuilder;
