import React, { useState, useEffect, useMemo } from 'react';
import { 
  RefreshCw, ArrowRightLeft, ChevronDown, ChevronRight, Edit2, Check, X, 
  AlertCircle, Search, Package, GitBranch, Hash, Palette, History, 
  BarChart3, FolderTree, Sparkles, Info, ChevronUp
} from 'lucide-react';
import { api } from '../../client/api';

interface BranchDirectoryEntry {
  nodeId: string;
  name: string;
  type: string;
  branchCode: string | null;
  parentId: string | null;
  path: string;
  productCount: number;
}

interface StockCodeStats {
  totalNodes: number;
  nodesWithBranchCode: number;
  nodesWithoutBranchCode: number;
  totalProducts: number;
  productsWithStockCode: number;
  productsWithoutStockCode: number;
  productsWithColor: number;
  totalColors: number;
}

interface HistoryEntry {
  id: number;
  productId: string;
  oldStockCode: string | null;
  newStockCode: string;
  reason: string;
  changedBy: string;
  changedAt: string;
}

interface ColorEntry {
  id: number;
  name: string;
  code: string;
  hexValue?: string;
  isActive?: boolean;
}

interface StockCodeManagerProps {
  colors: ColorEntry[];
  onColorsChange: (colors: ColorEntry[]) => void;
  onDataRefreshNeeded?: () => void;
}

type ManagerTab = 'overview' | 'branches' | 'colors' | 'operations' | 'history';

const TYPE_COLORS: Record<string, string> = {
  sector: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  category: 'bg-blue-100 text-blue-700 border-blue-200',
  subcategory: 'bg-violet-100 text-violet-700 border-violet-200',
  sub: 'bg-violet-100 text-violet-700 border-violet-200',
  group: 'bg-amber-100 text-amber-700 border-amber-200',
  custom: 'bg-rose-100 text-rose-700 border-rose-200',
};

const StockCodeManager: React.FC<StockCodeManagerProps> = ({ colors, onColorsChange, onDataRefreshNeeded }) => {
  const [activeTab, setActiveTab] = useState<ManagerTab>('overview');
  const [stats, setStats] = useState<StockCodeStats | null>(null);
  const [directory, setDirectory] = useState<BranchDirectoryEntry[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const [branchSearch, setBranchSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState<'all' | 'missing' | 'assigned'>('all');
  const [editingBranchNodeId, setEditingBranchNodeId] = useState<string | null>(null);
  const [editBranchValue, setEditBranchValue] = useState('');
  const [branchError, setBranchError] = useState('');
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());

  const [newColorName, setNewColorName] = useState('');
  const [newColorCode, setNewColorCode] = useState('');
  const [newColorHex, setNewColorHex] = useState('#000000');
  const [editingColorId, setEditingColorId] = useState<number | null>(null);
  const [editColorName, setEditColorName] = useState('');
  const [editColorCode, setEditColorCode] = useState('');
  const [editColorHex, setEditColorHex] = useState('');
  const [deleteColorConfirm, setDeleteColorConfirm] = useState<number | null>(null);
  const [colorError, setColorError] = useState('');

  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);
  const [regenerateLoading, setRegenerateLoading] = useState(false);
  const [regenerateResult, setRegenerateResult] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsData, dirData] = await Promise.all([
        api.getStockCodeStats(),
        api.getBranchDirectory(),
      ]);
      setStats(statsData);
      setDirectory(dirData);
    } catch (e) {
      console.error('Failed to load stock code data:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const histData = await api.getAllStockCodeHistory();
      setHistory(histData);
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab]);

  const treeData = useMemo(() => {
    const roots = directory.filter(d => !d.parentId);
    const childrenMap: Record<string, BranchDirectoryEntry[]> = {};
    for (const d of directory) {
      if (d.parentId) {
        if (!childrenMap[d.parentId]) childrenMap[d.parentId] = [];
        childrenMap[d.parentId].push(d);
      }
    }
    return { roots, childrenMap };
  }, [directory]);

  const filteredDirectory = useMemo(() => {
    let filtered = directory;
    if (branchSearch) {
      const s = branchSearch.toLowerCase();
      filtered = filtered.filter(d => 
        d.name.toLowerCase().includes(s) || 
        (d.branchCode && d.branchCode.toLowerCase().includes(s)) ||
        d.path.toLowerCase().includes(s)
      );
    }
    if (branchFilter === 'missing') {
      filtered = filtered.filter(d => !d.branchCode);
    } else if (branchFilter === 'assigned') {
      filtered = filtered.filter(d => !!d.branchCode);
    }
    return filtered;
  }, [directory, branchSearch, branchFilter]);

  const handleBranchEditStart = async (entry: BranchDirectoryEntry) => {
    setEditingBranchNodeId(entry.nodeId);
    setBranchError('');
    if (entry.branchCode) {
      setEditBranchValue(entry.branchCode);
    } else {
      try {
        const { suggestion } = await api.suggestBranchCode(entry.name, entry.nodeId);
        setEditBranchValue(suggestion);
      } catch {
        setEditBranchValue('');
      }
    }
  };

  const handleBranchEditSave = async () => {
    if (!editingBranchNodeId) return;
    const code = editBranchValue.trim().toUpperCase();
    if (!code) {
      setBranchError('Branch code is required');
      return;
    }
    if (code.length < 2 || code.length > 5) {
      setBranchError('Must be 2-5 characters');
      return;
    }
    if (!/^[A-Z0-9]+$/.test(code)) {
      setBranchError('Only uppercase letters and numbers');
      return;
    }
    const duplicate = directory.find(d => d.branchCode === code && d.nodeId !== editingBranchNodeId);
    if (duplicate) {
      setBranchError(`Code "${code}" already used by "${duplicate.name}"`);
      return;
    }
    try {
      await api.updateTreeNode(editingBranchNodeId, { branchCode: code });
      setDirectory(prev => prev.map(d => d.nodeId === editingBranchNodeId ? { ...d, branchCode: code } : d));
      setEditingBranchNodeId(null);
      setEditBranchValue('');
      setBranchError('');
      const newStats = await api.getStockCodeStats();
      setStats(newStats);
    } catch (err: any) {
      setBranchError(err.message || 'Failed to save');
    }
  };

  const handleAddColor = async () => {
    const name = newColorName.trim();
    const code = newColorCode.trim();
    if (!name || !code) return;
    setColorError('');
    try {
      const created = await api.createColor({ name, code, hexValue: newColorHex });
      onColorsChange([...colors, created]);
      setNewColorName('');
      setNewColorCode('');
      setNewColorHex('#000000');
      const newStats = await api.getStockCodeStats();
      setStats(newStats);
    } catch (err: any) {
      setColorError(err.message || 'Failed to create color');
    }
  };

  const handleColorEditStart = (color: ColorEntry) => {
    setEditingColorId(color.id);
    setEditColorName(color.name);
    setEditColorCode(color.code);
    setEditColorHex(color.hexValue || '#000000');
  };

  const handleColorEditSave = async () => {
    if (editingColorId === null) return;
    setColorError('');
    try {
      const updated = await api.updateColor(editingColorId, {
        name: editColorName.trim(),
        code: editColorCode.trim(),
        hexValue: editColorHex,
      });
      onColorsChange(colors.map(c => c.id === editingColorId ? updated : c));
      setEditingColorId(null);
    } catch (err: any) {
      setColorError(err.message || 'Failed to update color');
    }
  };

  const handleColorDelete = async (id: number) => {
    setColorError('');
    try {
      await api.deleteColor(id);
      onColorsChange(colors.filter(c => c.id !== id));
      setDeleteColorConfirm(null);
      const newStats = await api.getStockCodeStats();
      setStats(newStats);
    } catch (err: any) {
      setColorError(err.message || 'Failed to delete color');
    }
  };

  const handleMigrateBranchCodes = async () => {
    setMigrateLoading(true);
    setMigrateResult(null);
    try {
      const result = await api.migrateExistingBranchCodes();
      setMigrateResult(`Successfully auto-assigned ${result.migrated} branch codes.`);
      await loadData();
      if (onDataRefreshNeeded) onDataRefreshNeeded();
    } catch (err: any) {
      setMigrateResult(`Error: ${err.message}`);
    } finally {
      setMigrateLoading(false);
    }
  };

  const handleBulkRegenerate = async () => {
    setRegenerateLoading(true);
    setRegenerateResult(null);
    try {
      const result = await api.bulkRegenerateStockCodes();
      setRegenerateResult(`Successfully regenerated ${result.updated} stock codes.`);
      setConfirmRegenerate(false);
      if (onDataRefreshNeeded) onDataRefreshNeeded();
    } catch (err: any) {
      setRegenerateResult(`Error: ${err.message}`);
    } finally {
      setRegenerateLoading(false);
    }
  };

  const toggleSector = (nodeId: string) => {
    setExpandedSectors(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const expandAll = () => {
    const allParentIds = new Set<string>();
    directory.forEach(d => {
      if (treeData.childrenMap[d.nodeId]?.length) {
        allParentIds.add(d.nodeId);
      }
    });
    treeData.roots.forEach(r => allParentIds.add(r.nodeId));
    setExpandedSectors(allParentIds);
  };

  const collapseAll = () => setExpandedSectors(new Set());

  const renderTreeNode = (entry: BranchDirectoryEntry, depth: number = 0): React.ReactNode => {
    const children = treeData.childrenMap[entry.nodeId] || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedSectors.has(entry.nodeId);
    const isEditing = editingBranchNodeId === entry.nodeId;
    const typeColor = TYPE_COLORS[entry.type] || TYPE_COLORS.custom;

    if (branchSearch || branchFilter !== 'all') {
      if (!filteredDirectory.find(d => d.nodeId === entry.nodeId)) {
        const hasMatchingDescendant = children.some(c => 
          filteredDirectory.find(d => d.nodeId === c.nodeId) || 
          (treeData.childrenMap[c.nodeId] || []).length > 0
        );
        if (!hasMatchingDescendant) return null;
      }
    }

    return (
      <div key={entry.nodeId}>
        <div 
          className={`flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors group ${
            isEditing ? 'bg-blue-50 ring-1 ring-blue-200' : ''
          }`}
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleSector(entry.nodeId)}
              className="p-0.5 hover:bg-slate-200 rounded transition-colors"
            >
              {isExpanded ? 
                <ChevronDown className="w-4 h-4 text-slate-400" /> : 
                <ChevronRight className="w-4 h-4 text-slate-400" />
              }
            </button>
          ) : (
            <span className="w-5" />
          )}

          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeColor}`}>
            {entry.type.toUpperCase()}
          </span>

          <span className="font-medium text-slate-700 flex-1 min-w-0 truncate">{entry.name}</span>

          {entry.productCount > 0 && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Package className="w-3 h-3" />
              {entry.productCount}
            </span>
          )}

          {isEditing ? (
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                value={editBranchValue}
                onChange={e => setEditBranchValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleBranchEditSave();
                  if (e.key === 'Escape') { setEditingBranchNodeId(null); setBranchError(''); }
                }}
                maxLength={5}
                autoFocus
                className="w-20 px-2 py-1 text-sm font-mono font-bold bg-white border border-blue-300 rounded-lg text-center uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="CODE"
              />
              <button onClick={handleBranchEditSave} className="p-1 text-green-600 hover:bg-green-100 rounded">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => { setEditingBranchNodeId(null); setBranchError(''); }} className="p-1 text-slate-400 hover:bg-slate-200 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {entry.branchCode ? (
                <span className="font-mono font-bold text-sm bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200">
                  {entry.branchCode}
                </span>
              ) : (
                <span className="text-xs text-orange-500 bg-orange-50 px-2 py-1 rounded-lg border border-orange-200">
                  No code
                </span>
              )}
              <button
                onClick={() => handleBranchEditStart(entry)}
                className="p-1 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                title="Edit branch code"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {isEditing && branchError && (
          <div className="flex items-center gap-1 text-red-600 text-xs mt-1" style={{ paddingLeft: `${depth * 24 + 48}px` }}>
            <AlertCircle className="w-3 h-3" />
            {branchError}
          </div>
        )}

        {hasChildren && isExpanded && children.map(child => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  const tabs: { id: ManagerTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'branches', label: 'Branch Codes', icon: <GitBranch className="w-4 h-4" /> },
    { id: 'colors', label: 'Colors', icon: <Palette className="w-4 h-4" /> },
    { id: 'operations', label: 'Bulk Operations', icon: <RefreshCw className="w-4 h-4" /> },
    { id: 'history', label: 'Change History', icon: <History className="w-4 h-4" /> },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-amber-100 to-orange-100 rounded-xl">
              <Hash className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Stock Code Manager</h2>
              <p className="text-sm text-slate-500">Manage branch codes, colors, and stock code generation</p>
            </div>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="border-b border-slate-100">
        <div className="flex gap-1 px-4 py-2 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'overview' && stats && (
          <div className="space-y-6">
            <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold mb-1">Stock Code Format</p>
                  <div className="font-mono bg-white/60 rounded-lg px-3 py-2 border border-amber-200 text-base mb-2">
                    P.<span className="text-emerald-600">SECTOR</span>.<span className="text-blue-600">CATEGORY</span>.<span className="text-violet-600">SUB</span>.<span className="text-rose-600">COLOR</span>.<span className="text-slate-600">0001</span>
                  </div>
                  <p className="text-amber-700">Each segment comes from the taxonomy branch code path, followed by the product color code and a 4-digit product number.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
                  <FolderTree className="w-3.5 h-3.5" />
                  TAXONOMY NODES
                </div>
                <div className="text-2xl font-bold text-slate-800">{stats.totalNodes}</div>
                <div className="text-xs text-slate-500 mt-1">
                  <span className="text-green-600">{stats.nodesWithBranchCode} coded</span>
                  {stats.nodesWithoutBranchCode > 0 && (
                    <span className="text-orange-500"> · {stats.nodesWithoutBranchCode} missing</span>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
                  <Package className="w-3.5 h-3.5" />
                  PRODUCTS
                </div>
                <div className="text-2xl font-bold text-slate-800">{stats.totalProducts}</div>
                <div className="text-xs text-slate-500 mt-1">
                  <span className="text-green-600">{stats.productsWithStockCode} coded</span>
                  {stats.productsWithoutStockCode > 0 && (
                    <span className="text-orange-500"> · {stats.productsWithoutStockCode} missing</span>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
                  <Palette className="w-3.5 h-3.5" />
                  COLORS
                </div>
                <div className="text-2xl font-bold text-slate-800">{stats.totalColors}</div>
                <div className="text-xs text-slate-500 mt-1">
                  <span className="text-blue-600">{stats.productsWithColor} products colored</span>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
                  <GitBranch className="w-3.5 h-3.5" />
                  COVERAGE
                </div>
                <div className="text-2xl font-bold text-slate-800">
                  {stats.totalNodes > 0 ? Math.round((stats.nodesWithBranchCode / stats.totalNodes) * 100) : 0}%
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  branch code coverage
                </div>
              </div>
            </div>

            {(stats.nodesWithoutBranchCode > 0 || stats.productsWithoutStockCode > 0) && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-orange-700">
                    <p className="font-semibold mb-1">Action Needed</p>
                    <ul className="space-y-1">
                      {stats.nodesWithoutBranchCode > 0 && (
                        <li>{stats.nodesWithoutBranchCode} taxonomy node{stats.nodesWithoutBranchCode > 1 ? 's' : ''} missing branch codes. Use the <strong>Branch Codes</strong> tab to assign them, or run <strong>Bulk Operations</strong> to auto-generate.</li>
                      )}
                      {stats.productsWithoutStockCode > 0 && (
                        <li>{stats.productsWithoutStockCode} product{stats.productsWithoutStockCode > 1 ? 's' : ''} missing stock codes. Use <strong>Bulk Operations</strong> to regenerate all codes.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'overview' && !stats && loading && (
          <div className="text-center py-12 text-slate-400">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin" />
            <p>Loading stock code data...</p>
          </div>
        )}

        {activeTab === 'branches' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={branchSearch}
                  onChange={e => setBranchSearch(e.target.value)}
                  placeholder="Search nodes by name, code, or path..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                />
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                {(['all', 'missing', 'assigned'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setBranchFilter(f)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      branchFilter === f
                        ? 'bg-white text-slate-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'missing' ? 'Missing' : 'Assigned'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={expandAll} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg" title="Expand all">
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button onClick={collapseAll} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg" title="Collapse all">
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-500 flex items-center justify-between px-1">
              <span>Showing {filteredDirectory.length} of {directory.length} nodes</span>
              <span className="font-mono text-slate-400">Click edit icon to change branch codes</span>
            </div>

            {branchSearch || branchFilter !== 'all' ? (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {filteredDirectory.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">No matching nodes found.</div>
                ) : (
                  filteredDirectory.map(entry => {
                    const isEditing = editingBranchNodeId === entry.nodeId;
                    const typeColor = TYPE_COLORS[entry.type] || TYPE_COLORS.custom;
                    return (
                      <div key={entry.nodeId} className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 group ${isEditing ? 'bg-blue-50' : ''}`}>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeColor} flex-shrink-0`}>
                          {entry.type.toUpperCase()}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-700 truncate">{entry.name}</div>
                          <div className="text-xs text-slate-400 truncate">{entry.path}</div>
                        </div>
                        {entry.productCount > 0 && (
                          <span className="text-xs text-slate-400 flex items-center gap-1 flex-shrink-0">
                            <Package className="w-3 h-3" />{entry.productCount}
                          </span>
                        )}
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <input
                              type="text"
                              value={editBranchValue}
                              onChange={e => setEditBranchValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleBranchEditSave();
                                if (e.key === 'Escape') { setEditingBranchNodeId(null); setBranchError(''); }
                              }}
                              maxLength={5}
                              autoFocus
                              className="w-20 px-2 py-1 text-sm font-mono font-bold bg-white border border-blue-300 rounded-lg text-center uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <button onClick={handleBranchEditSave} className="p-1 text-green-600 hover:bg-green-100 rounded"><Check className="w-4 h-4" /></button>
                            <button onClick={() => { setEditingBranchNodeId(null); setBranchError(''); }} className="p-1 text-slate-400 hover:bg-slate-200 rounded"><X className="w-4 h-4" /></button>
                            {branchError && <span className="text-red-500 text-xs">{branchError}</span>}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {entry.branchCode ? (
                              <span className="font-mono font-bold text-sm bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200">{entry.branchCode}</span>
                            ) : (
                              <span className="text-xs text-orange-500 bg-orange-50 px-2 py-1 rounded-lg border border-orange-200">No code</span>
                            )}
                            <button onClick={() => handleBranchEditStart(entry)} className="p-1 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-all">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl max-h-[500px] overflow-y-auto">
                {treeData.roots.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">No taxonomy nodes found.</div>
                ) : (
                  treeData.roots.map(root => renderTreeNode(root, 0))
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'colors' && (
          <div className="space-y-6">
            {colorError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {colorError}
              </div>
            )}

            <div className="flex gap-3">
              <input
                type="text"
                value={newColorName}
                onChange={e => setNewColorName(e.target.value)}
                placeholder="Color name..."
                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
              <input
                type="text"
                value={newColorCode}
                onChange={e => setNewColorCode(e.target.value.replace(/\D/g, ''))}
                placeholder="Code (e.g. 111)"
                className="w-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColorHex}
                  onChange={e => setNewColorHex(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                />
              </div>
              <button
                onClick={handleAddColor}
                disabled={!newColorName.trim() || !newColorCode.trim()}
                className="px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>

            {colors.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Palette className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No colors defined yet.</p>
                <p className="text-sm mt-1">Add your first color above.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {colors.map((color) => (
                  <div
                    key={color.id}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                      deleteColorConfirm === color.id
                        ? 'bg-red-50 border-red-200'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {editingColorId === color.id ? (
                      <div className="flex-1 flex items-center gap-3">
                        <input
                          type="text"
                          value={editColorName}
                          onChange={e => setEditColorName(e.target.value)}
                          autoFocus
                          className="flex-1 px-3 py-2 bg-white border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                        <input
                          type="text"
                          value={editColorCode}
                          onChange={e => setEditColorCode(e.target.value.replace(/\D/g, ''))}
                          className="w-24 px-3 py-2 bg-white border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                        <input
                          type="color"
                          value={editColorHex}
                          onChange={e => setEditColorHex(e.target.value)}
                          className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                        />
                        <button onClick={handleColorEditSave} className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setEditingColorId(null); }} className="p-2 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : deleteColorConfirm === color.id ? (
                      <div className="flex-1 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-red-700">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-sm font-medium">Delete "{color.name}"?</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleColorDelete(color.id)} className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">Delete</button>
                          <button onClick={() => setDeleteColorConfirm(null)} className="px-3 py-1.5 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300 transition-colors">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg border border-slate-300 shadow-sm"
                            style={{ backgroundColor: color.hexValue || '#cccccc' }}
                          />
                          <span className="font-medium text-slate-700">{color.name}</span>
                          <span className="text-sm text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded">{color.code}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleColorEditStart(color)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Edit">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => setDeleteColorConfirm(color.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl">
              <p className="text-sm text-purple-700">
                <strong>Tip:</strong> Colors are used in the stock code system. Each color's numeric code becomes a segment in the product stock code (e.g., P.BM.FL.PO.<strong>111</strong>.5459).
              </p>
            </div>
          </div>
        )}

        {activeTab === 'operations' && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="border border-slate-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <Sparkles className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">Auto-Assign Branch Codes</h3>
                    <p className="text-xs text-slate-500">Generate codes for nodes that don't have one</p>
                  </div>
                </div>
                <p className="text-sm text-slate-600 mb-4">
                  Automatically generates 2-5 character branch codes based on each taxonomy node's name. Only affects nodes without an existing code.
                </p>
                <button
                  onClick={handleMigrateBranchCodes}
                  disabled={migrateLoading}
                  className="w-full px-4 py-2.5 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  {migrateLoading ? 'Processing...' : 'Auto-Assign Branch Codes'}
                </button>
                {migrateResult && (
                  <div className={`mt-3 p-3 rounded-lg text-sm ${migrateResult.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
                    {migrateResult}
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <RefreshCw className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">Regenerate All Stock Codes</h3>
                    <p className="text-xs text-slate-500">Rebuild every product's stock code</p>
                  </div>
                </div>
                <p className="text-sm text-slate-600 mb-4">
                  Recalculates stock codes for all products based on their current taxonomy path, branch codes, and color. Use after editing branch codes.
                </p>
                {!confirmRegenerate ? (
                  <button
                    onClick={() => setConfirmRegenerate(true)}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerate All Stock Codes
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                      This will recalculate stock codes for all products. Changes are recorded in the history. Continue?
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleBulkRegenerate}
                        disabled={regenerateLoading}
                        className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {regenerateLoading ? 'Processing...' : 'Yes, Regenerate'}
                      </button>
                      <button
                        onClick={() => setConfirmRegenerate(false)}
                        className="px-4 py-2.5 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {regenerateResult && (
                  <div className={`mt-3 p-3 rounded-lg text-sm ${regenerateResult.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
                    {regenerateResult}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            {history.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No stock code changes recorded yet.</p>
                <p className="text-sm mt-1">Changes will appear here when stock codes are generated or modified.</p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {[...history].reverse().map((entry) => (
                  <div key={entry.id} className="px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700 font-mono">{entry.productId}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(entry.changedAt).toLocaleDateString()} {new Date(entry.changedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {entry.oldStockCode ? (
                        <span className="font-mono text-red-500 line-through bg-red-50 px-2 py-0.5 rounded">{entry.oldStockCode}</span>
                      ) : (
                        <span className="text-slate-400 text-xs">(none)</span>
                      )}
                      <span className="text-slate-400">→</span>
                      <span className="font-mono text-green-600 bg-green-50 px-2 py-0.5 rounded">{entry.newStockCode}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                      <span>{entry.reason}</span>
                      <span className="text-slate-300">·</span>
                      <span>by {entry.changedBy}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Plus: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);

const Trash2: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
);

export default StockCodeManager;
