import React, { useState, useMemo, useCallback } from 'react';
import { TreeNode, Product } from '../types';
import { ChevronRight, ChevronDown, Plus, Edit2, Trash2, Package, FolderTree, X, Check } from 'lucide-react';

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

const LEVEL_LABELS = ['Level 0 - Root', 'Level 1 - Sector', 'Level 2 - Category', 'Level 3 - Sub-Category'];
const LEVEL_COLORS = ['bg-slate-100', 'bg-blue-50', 'bg-green-50', 'bg-amber-50', 'bg-purple-50', 'bg-pink-50'];
const LEVEL_BORDERS = ['border-slate-300', 'border-blue-300', 'border-green-300', 'border-amber-300', 'border-purple-300', 'border-pink-300'];

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
  };

  const saveEdit = (nodeId: string) => {
    if (editName.trim()) {
      onUpdateNode(nodeId, { name: editName.trim() });
    }
    setEditingId(null);
    setEditName('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const getLevelLabel = (level: number): string => {
    if (level <= 3) return LEVEL_LABELS[level] || `Level ${level}`;
    return `Level ${level}`;
  };

  const renderTreeNode = (node: TreeNodeWithLevel, isLast: boolean): React.ReactNode => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children.length > 0;
    const colorIndex = Math.min(node.level, LEVEL_COLORS.length - 1);

    return (
      <div key={node.id} className="relative">
        <div className="flex items-start gap-2 mb-3">
          <div className={`flex items-center min-w-[120px] px-2 py-1 rounded text-xs font-medium ${LEVEL_COLORS[colorIndex]} ${LEVEL_BORDERS[colorIndex]} border`}>
            {node.type === 'sector' ? 'Sector' : node.type === 'category' ? 'Category' : node.type === 'subcategory' ? 'Sub-Category' : `Level ${node.level}`}
          </div>
          
          <div className={`flex-1 flex items-center gap-2 p-3 rounded-lg border-2 ${LEVEL_COLORS[colorIndex]} ${LEVEL_BORDERS[colorIndex]} hover:shadow-md transition-shadow`}>
            <button
              onClick={() => toggleExpand(node.id)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/50"
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-slate-300" />
              )}
            </button>

            {editingId === node.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 px-2 py-1 border rounded text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(node.id);
                    if (e.key === 'Escape') cancelEdit();
                  }}
                />
                <button onClick={() => saveEdit(node.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                  <Check size={16} />
                </button>
                <button onClick={cancelEdit} className="p-1 text-red-600 hover:bg-red-50 rounded">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <span className="font-semibold text-slate-800 flex-1">{node.name}</span>
                {node.productCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-slate-500 bg-white px-2 py-0.5 rounded-full">
                    <Package size={12} /> {node.productCount}
                  </span>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleAddClick(node.id, node.level)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                    title="Add child"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={() => startEdit(node)}
                    className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"
                    title="Edit"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => onDeleteNode(node.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {isExpanded && hasChildren && (
          <div className="ml-8 pl-6 border-l-2 border-slate-200">
            {node.children.map((child, idx) => renderTreeNode(child, idx === node.children.length - 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <FolderTree className="text-blue-600" size={20} />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-800">Taxonomy Builder</h2>
            <p className="text-sm text-slate-500">Build your product hierarchy with unlimited levels</p>
          </div>
        </div>
        <button
          onClick={() => handleAddClick(null, 0)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
        >
          <Plus size={16} />
          Add Sector
        </button>
      </div>

      <div className="flex gap-2 p-3 bg-slate-50 border-b border-slate-200 overflow-x-auto">
        {LEVEL_LABELS.map((label, idx) => (
          <div key={idx} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${LEVEL_COLORS[idx]} ${LEVEL_BORDERS[idx]} border`}>
            {label}
          </div>
        ))}
        <div className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap bg-purple-50 border-purple-300 border">
          Level 4+ - Custom
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="group flex items-start gap-2 mb-4">
          <div className="flex items-center min-w-[120px] px-2 py-1 rounded text-xs font-medium bg-slate-100 border-slate-300 border">
            Root
          </div>
          <div className="flex-1 flex items-center gap-2 p-3 rounded-lg border-2 bg-slate-50 border-slate-300">
            <div className="w-6 h-6 flex items-center justify-center">
              <ChevronDown size={16} className="text-slate-400" />
            </div>
            <span className="font-bold text-slate-800">ALL PRODUCTS</span>
            <span className="flex items-center gap-1 text-xs text-slate-500 bg-white px-2 py-0.5 rounded-full ml-auto">
              <Package size={12} /> {totalProducts} total
            </span>
          </div>
        </div>

        <div className="ml-8 pl-6 border-l-2 border-slate-200">
          {tree.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FolderTree size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No taxonomy defined yet</p>
              <p className="text-sm">Click "Add Sector" to create your first category</p>
            </div>
          ) : (
            tree.map((node, idx) => (
              <div key={node.id} className="group">
                {renderTreeNode(node, idx === tree.length - 1)}
              </div>
            ))
          )}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-96">
            <h3 className="text-lg font-bold text-slate-800 mb-4">
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="sector">Sector</option>
                  <option value="category">Category</option>
                  <option value="subcategory">Sub-Category</option>
                  <option value="group">Group</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddConfirm}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaxonomyBuilder;
