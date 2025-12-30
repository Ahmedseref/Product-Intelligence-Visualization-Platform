
import React, { useState } from 'react';
import { TreeNode, TreeNodeType } from '../types';
import { ICONS } from '../constants';

interface ProductTreeProps {
  nodes: TreeNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  productsCount: Record<string, number>; // Mapping node id to product count
  onAddNode?: (parentId: string | null) => void;
  onEditNode?: (node: TreeNode) => void;
}

const ProductTree: React.FC<ProductTreeProps> = ({ nodes, selectedNodeId, onSelectNode, productsCount, onAddNode }) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const toggleExpand = (id: string) => {
    const next = new Set(expandedNodes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedNodes(next);
  };

  const roots = nodes.filter(n => !n.parentId);

  const renderNode = (node: TreeNode, depth: number) => {
    const children = nodes.filter(n => n.parentId === node.id);
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const count = productsCount[node.id] || 0;

    if (searchTerm && !node.name.toLowerCase().includes(searchTerm.toLowerCase()) && !children.some(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))) {
      return null;
    }

    return (
      <div key={node.id} className="select-none">
        <div 
          className={`flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-all ${
            isSelected ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-700'
          }`}
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
          {count > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
              {count}
            </span>
          )}
        </div>
        {isExpanded && children.length > 0 && (
          <div className="mt-1">
            {children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-full">
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            {ICONS.Taxonomy} Taxonomy
          </h3>
          <button 
            onClick={() => onAddNode?.(null)}
            className="p-1 hover:bg-slate-100 rounded-md text-slate-500"
          >
            {ICONS.Add}
          </button>
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
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200">
        <div 
          className={`flex items-center gap-2 py-1.5 px-3 rounded-lg cursor-pointer mb-2 transition-all ${
            selectedNodeId === null ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-500'
          }`}
          onClick={() => onSelectNode(null)}
        >
          <span className="text-xs font-bold uppercase tracking-wider">All Products</span>
        </div>
        <div className="space-y-1">
          {roots.map(root => renderNode(root, 0))}
        </div>
      </div>
    </div>
  );
};

export default ProductTree;
