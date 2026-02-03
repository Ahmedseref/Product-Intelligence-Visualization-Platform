import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { TreeNode } from '../types';
import { ChevronRight, ChevronDown, Search, X, FolderTree, Check, Building2, Layers, Grid3X3, Tag } from 'lucide-react';

interface TaxonomyNodeSelectorProps {
  treeNodes: TreeNode[];
  selectedNodeId: string | null;
  onSelect: (nodeId: string, path: string[]) => void;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  inline?: boolean;
  showPath?: boolean;
  className?: string;
}

interface TreeNodeWithChildren extends TreeNode {
  children: TreeNodeWithChildren[];
  level: number;
}

const LEVEL_ICONS: Record<string, any> = {
  sector: Building2,
  category: Layers,
  subcategory: Grid3X3,
  group: Tag,
};

const LEVEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  sector: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  category: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  subcategory: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  group: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

const TaxonomyNodeSelector: React.FC<TaxonomyNodeSelectorProps> = ({
  treeNodes,
  selectedNodeId,
  onSelect,
  onClear,
  placeholder = 'Select taxonomy node...',
  disabled = false,
  inline = false,
  showPath = true,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(inline);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const buildTree = useCallback((nodes: TreeNode[]): TreeNodeWithChildren[] => {
    const nodeMap = new Map<string, TreeNodeWithChildren>();
    const rootNodes: TreeNodeWithChildren[] = [];

    nodes.forEach(node => {
      nodeMap.set(node.id, { ...node, children: [], level: 0 });
    });

    nodes.forEach(node => {
      const treeNode = nodeMap.get(node.id)!;
      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)!;
        treeNode.level = parent.level + 1;
        parent.children.push(treeNode);
      } else {
        rootNodes.push(treeNode);
      }
    });

    return rootNodes;
  }, []);

  const tree = useMemo(() => buildTree(treeNodes), [treeNodes, buildTree]);

  const getNodePath = useCallback((nodeId: string): string[] => {
    const path: string[] = [];
    let current = treeNodes.find(n => n.id === nodeId);
    while (current) {
      path.unshift(current.name);
      current = treeNodes.find(n => n.id === current?.parentId);
    }
    return path;
  }, [treeNodes]);

  const getNodePathIds = useCallback((nodeId: string): string[] => {
    const path: string[] = [];
    let current = treeNodes.find(n => n.id === nodeId);
    while (current) {
      path.unshift(current.id);
      current = treeNodes.find(n => n.id === current?.parentId);
    }
    return path;
  }, [treeNodes]);

  const selectedPath = useMemo(() => {
    if (!selectedNodeId) return [];
    return getNodePath(selectedNodeId);
  }, [selectedNodeId, getNodePath]);

  const selectedNode = useMemo(() => {
    return treeNodes.find(n => n.id === selectedNodeId);
  }, [treeNodes, selectedNodeId]);

  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;

    const query = searchQuery.toLowerCase();
    const matchingNodeIds = new Set<string>();

    treeNodes.forEach(node => {
      if (node.name.toLowerCase().includes(query)) {
        matchingNodeIds.add(node.id);
        const pathIds = getNodePathIds(node.id);
        pathIds.forEach(id => matchingNodeIds.add(id));
      }
    });

    const filterTree = (nodes: TreeNodeWithChildren[]): TreeNodeWithChildren[] => {
      return nodes
        .filter(node => matchingNodeIds.has(node.id))
        .map(node => ({
          ...node,
          children: filterTree(node.children),
        }));
    };

    return filterTree(tree);
  }, [tree, searchQuery, treeNodes, getNodePathIds]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const newExpanded = new Set<string>();
      treeNodes.forEach(node => {
        if (node.name.toLowerCase().includes(query)) {
          const pathIds = getNodePathIds(node.id);
          pathIds.forEach(id => newExpanded.add(id));
        }
      });
      setExpandedNodes(newExpanded);
    }
  }, [searchQuery, treeNodes, getNodePathIds]);

  useEffect(() => {
    if (selectedNodeId) {
      const pathIds = getNodePathIds(selectedNodeId);
      setExpandedNodes(prev => {
        const newSet = new Set(prev);
        pathIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  }, [selectedNodeId, getNodePathIds]);

  useEffect(() => {
    if (!inline) {
      const handleClickOutside = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [inline]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const toggleExpanded = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const handleSelect = (node: TreeNodeWithChildren) => {
    const path = getNodePath(node.id);
    onSelect(node.id, path);
    if (!inline) {
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  const renderNode = (node: TreeNodeWithChildren, depth: number = 0): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = node.id === selectedNodeId;
    const Icon = LEVEL_ICONS[node.type] || Tag;
    const colors = LEVEL_COLORS[node.type] || LEVEL_COLORS.group;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
            isSelected 
              ? 'bg-blue-100 border border-blue-300' 
              : 'hover:bg-gray-100'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => handleSelect(node)}
        >
          {hasChildren ? (
            <button
              className="p-0.5 hover:bg-gray-200 rounded"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(node.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <Icon className={`w-4 h-4 ${colors.text}`} />
          <span className={`flex-1 text-sm ${isSelected ? 'font-medium text-blue-900' : 'text-gray-700'}`}>
            {node.name}
          </span>
          {isSelected && <Check className="w-4 h-4 text-blue-600" />}
          <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} ${colors.border} border`}>
            {node.type === 'group' ? `L${node.level + 1}` : node.type.charAt(0).toUpperCase()}
          </span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const dropdownContent = (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-lg ${inline ? '' : 'absolute z-50 mt-1 left-0 right-0'}`}>
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setSearchQuery('')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {filteredTree.length > 0 ? (
          filteredTree.map(node => renderNode(node))
        ) : (
          <div className="text-center py-4 text-gray-500 text-sm">
            {searchQuery ? 'No matching nodes found' : 'No taxonomy nodes available'}
          </div>
        )}
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className={`${className}`}>
        {dropdownContent}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left border rounded-lg transition-colors ${
          disabled
            ? 'bg-gray-100 cursor-not-allowed border-gray-200'
            : 'bg-white border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
        }`}
      >
        <FolderTree className="w-4 h-4 text-gray-400 flex-shrink-0" />
        {selectedNode && showPath ? (
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-900 truncate">{selectedNode.name}</div>
            {selectedPath.length > 1 && (
              <div className="text-xs text-gray-500 truncate">
                {selectedPath.slice(0, -1).join(' > ')}
              </div>
            )}
          </div>
        ) : selectedNode ? (
          <span className="flex-1 text-sm text-gray-900 truncate">{selectedNode.name}</span>
        ) : (
          <span className="flex-1 text-sm text-gray-400">{placeholder}</span>
        )}
        {selectedNodeId && onClear ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        ) : (
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>
      {isOpen && dropdownContent}
    </div>
  );
};

export default TaxonomyNodeSelector;
