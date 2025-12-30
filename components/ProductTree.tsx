import React, { useState, useRef } from 'react';
import { TreeNode, TreeNodeType } from '../types';
import { ICONS } from '../constants';

interface ProductTreeProps {
  nodes: TreeNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  productsCount: Record<string, number>;
  onAddNode?: (parentId: string | null, nodeData?: Partial<TreeNode>) => void;
  onEditNode?: (node: TreeNode) => void;
  onDeleteNode?: (nodeId: string) => void;
  onMoveNode?: (nodeId: string, newParentId: string | null) => void;
}

const NODE_TYPES: TreeNodeType[] = ['sector', 'category', 'subcategory', 'group'];

const NodeEditor: React.FC<{
  node?: TreeNode;
  parentId: string | null;
  onSave: (data: Partial<TreeNode>) => void;
  onCancel: () => void;
}> = ({ node, parentId, onSave, onCancel }) => {
  const [name, setName] = useState(node?.name || '');
  const [type, setType] = useState<TreeNodeType>(node?.type || 'category');
  const [description, setDescription] = useState(node?.description || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      type,
      description: description.trim() || undefined,
      parentId: node ? node.parentId : parentId,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-white border border-slate-200 rounded-lg shadow-lg space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Node name"
        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as TreeNodeType)}
        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {NODE_TYPES.map(t => (
          <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
        ))}
      </select>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          {node ? 'Update' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

const ProductTree: React.FC<ProductTreeProps> = ({ 
  nodes, 
  selectedNodeId, 
  onSelectNode, 
  productsCount, 
  onAddNode,
  onEditNode,
  onDeleteNode,
  onMoveNode 
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [editingNode, setEditingNode] = useState<TreeNode | null>(null);
  const [addingToParent, setAddingToParent] = useState<string | null | undefined>(undefined);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [dragOverNode, setDragOverNode] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{nodeId: string; x: number; y: number} | null>(null);

  const toggleExpand = (id: string) => {
    const next = new Set(expandedNodes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedNodes(next);
  };

  const expandAll = () => {
    setExpandedNodes(new Set(nodes.map(n => n.id)));
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  const handleDragStart = (e: React.DragEvent, nodeId: string) => {
    setDraggedNode(nodeId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, nodeId: string) => {
    e.preventDefault();
    if (draggedNode && draggedNode !== nodeId) {
      setDragOverNode(nodeId);
    }
  };

  const handleDragLeave = () => {
    setDragOverNode(null);
  };

  const handleDrop = (e: React.DragEvent, targetNodeId: string | null) => {
    e.preventDefault();
    if (draggedNode && draggedNode !== targetNodeId && onMoveNode) {
      const getDescendants = (id: string): string[] => {
        const children = nodes.filter(n => n.parentId === id);
        return [id, ...children.flatMap(c => getDescendants(c.id))];
      };
      const descendants = getDescendants(draggedNode);
      if (!descendants.includes(targetNodeId || '')) {
        onMoveNode(draggedNode, targetNodeId);
      }
    }
    setDraggedNode(null);
    setDragOverNode(null);
  };

  const handleContextMenu = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    setContextMenu({ nodeId, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleAddChild = (parentId: string | null) => {
    setAddingToParent(parentId);
    if (parentId) {
      setExpandedNodes(prev => new Set([...prev, parentId]));
    }
  };

  const handleCreateNode = (data: Partial<TreeNode>) => {
    if (onAddNode) {
      onAddNode(addingToParent ?? null, data);
    }
    setAddingToParent(undefined);
  };

  const handleEditSave = (data: Partial<TreeNode>) => {
    if (editingNode && onEditNode) {
      onEditNode({ ...editingNode, ...data });
    }
    setEditingNode(null);
  };

  const roots = nodes.filter(n => !n.parentId);

  const getNodePath = (nodeId: string): TreeNode[] => {
    const path: TreeNode[] = [];
    let current = nodes.find(n => n.id === nodeId);
    while (current) {
      path.unshift(current);
      current = nodes.find(n => n.id === current?.parentId);
    }
    return path;
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const children = nodes.filter(n => n.parentId === node.id);
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const count = productsCount[node.id] || 0;
    const isDragging = draggedNode === node.id;
    const isDragOver = dragOverNode === node.id;

    if (searchTerm && !node.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      const hasMatchingDescendant = (n: TreeNode): boolean => {
        const directChildren = nodes.filter(c => c.parentId === n.id);
        return directChildren.some(c => 
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) || hasMatchingDescendant(c)
        );
      };
      if (!hasMatchingDescendant(node)) return null;
    }

    if (editingNode?.id === node.id) {
      return (
        <div key={node.id} style={{ paddingLeft: `${depth * 16}px` }}>
          <NodeEditor
            node={node}
            parentId={node.parentId}
            onSave={handleEditSave}
            onCancel={() => setEditingNode(null)}
          />
        </div>
      );
    }

    return (
      <div key={node.id} className="select-none">
        <div 
          draggable
          onDragStart={(e) => handleDragStart(e, node.id)}
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node.id)}
          onContextMenu={(e) => handleContextMenu(e, node.id)}
          className={`group flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-all ${
            isSelected ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-700'
          } ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onSelectNode(node.id)}
        >
          <div className="flex items-center justify-center w-4 h-4">
            {children.length > 0 && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.id);
                }}
                className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              >
                {ICONS.ChevronRight}
              </button>
            )}
          </div>
          <span className="text-xs font-medium flex-1 truncate">{node.name}</span>
          <span className={`text-[8px] uppercase tracking-wider ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>
            {node.type}
          </span>
          {count > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
              {count}
            </span>
          )}
          <div className={`flex gap-0.5 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAddChild(node.id);
              }}
              className={`p-0.5 rounded ${isSelected ? 'hover:bg-blue-500' : 'hover:bg-slate-200'}`}
              title="Add child"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingNode(node);
              }}
              className={`p-0.5 rounded ${isSelected ? 'hover:bg-blue-500' : 'hover:bg-slate-200'}`}
              title="Edit"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            {onDeleteNode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete "${node.name}" and all its children?`)) {
                    onDeleteNode(node.id);
                  }
                }}
                className={`p-0.5 rounded ${isSelected ? 'hover:bg-red-500' : 'hover:bg-red-100 text-red-500'}`}
                title="Delete"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            )}
          </div>
        </div>
        {isExpanded && (
          <div className="mt-1">
            {addingToParent === node.id && (
              <div style={{ paddingLeft: `${(depth + 1) * 16}px` }} className="mb-2">
                <NodeEditor
                  parentId={node.id}
                  onSave={handleCreateNode}
                  onCancel={() => setAddingToParent(undefined)}
                />
              </div>
            )}
            {children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-full" onClick={closeContextMenu}>
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            {ICONS.Taxonomy} Taxonomy
          </h3>
          <div className="flex gap-1">
            <button 
              onClick={expandAll}
              className="p-1 hover:bg-slate-100 rounded-md text-slate-500"
              title="Expand all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <button 
              onClick={collapseAll}
              className="p-1 hover:bg-slate-100 rounded-md text-slate-500"
              title="Collapse all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            </button>
            <button 
              onClick={() => handleAddChild(null)}
              className="p-1 hover:bg-slate-100 rounded-md text-slate-500"
              title="Add root node"
            >
              {ICONS.Add}
            </button>
          </div>
        </div>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-400">
            {ICONS.Search}
          </span>
          <input
            type="text"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      <div 
        className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop(e, null)}
      >
        <div 
          className={`flex items-center gap-2 py-1.5 px-3 rounded-lg cursor-pointer mb-2 transition-all ${
            selectedNodeId === null ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-500'
          }`}
          onClick={() => onSelectNode(null)}
        >
          <span className="text-xs font-bold uppercase tracking-wider">All Products</span>
        </div>
        
        {addingToParent === null && (
          <div className="mb-2 px-2">
            <NodeEditor
              parentId={null}
              onSave={handleCreateNode}
              onCancel={() => setAddingToParent(undefined)}
            />
          </div>
        )}
        
        <div className="space-y-1">
          {roots.map(root => renderNode(root, 0))}
        </div>
      </div>

      {contextMenu && (
        <div 
          className="fixed bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full px-4 py-2 text-xs text-left hover:bg-slate-100"
            onClick={() => {
              handleAddChild(contextMenu.nodeId);
              closeContextMenu();
            }}
          >
            Add Child
          </button>
          <button
            className="w-full px-4 py-2 text-xs text-left hover:bg-slate-100"
            onClick={() => {
              const node = nodes.find(n => n.id === contextMenu.nodeId);
              if (node) setEditingNode(node);
              closeContextMenu();
            }}
          >
            Edit
          </button>
          {onDeleteNode && (
            <button
              className="w-full px-4 py-2 text-xs text-left hover:bg-red-50 text-red-600"
              onClick={() => {
                const node = nodes.find(n => n.id === contextMenu.nodeId);
                if (node && window.confirm(`Delete "${node.name}"?`)) {
                  onDeleteNode(node.id);
                }
                closeContextMenu();
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductTree;
