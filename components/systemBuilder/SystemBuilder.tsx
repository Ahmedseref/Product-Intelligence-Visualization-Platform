import React, { useState, useEffect, useCallback } from 'react';
import { SystemData, SystemFull, SystemLayer, SystemProductOption, Product, Sector } from '../../types';
import { systemsApi } from '../../client/api';
import { 
  Plus, Search, ChevronRight, ChevronDown, GripVertical, Trash2, Edit, Save, X, 
  Download, Upload, Layers, Package, Star, StarOff, MoreVertical, Copy, 
  History, Eye, FileJson, FileSpreadsheet, ChevronUp, AlertCircle, Check,
  BarChart3, FileUp
} from 'lucide-react';
import SystemDashboard from './SystemDashboard';
import SystemImport from './SystemImport';

interface SystemBuilderProps {
  products: Product[];
}

type TabMode = 'builder' | 'analytics' | 'import';

const SystemBuilder: React.FC<SystemBuilderProps> = ({ products }) => {
  const [activeTab, setActiveTab] = useState<TabMode>('builder');
  const [systems, setSystems] = useState<SystemData[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [fullSystem, setFullSystem] = useState<SystemFull | null>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreateSystem, setShowCreateSystem] = useState(false);
  const [showAddLayer, setShowAddLayer] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState<string | null>(null);
  const [editingLayer, setEditingLayer] = useState<string | null>(null);
  const [editingOption, setEditingOption] = useState<string | null>(null);
  const [newSystemForm, setNewSystemForm] = useState({ name: '', description: '', typicalUses: '', sectorMapping: [] as string[] });
  const [sectorInput, setSectorInput] = useState('');
  const [newLayerForm, setNewLayerForm] = useState({ layerName: '', notes: '' });
  const [productSearch, setProductSearch] = useState('');
  const [editLayerForm, setEditLayerForm] = useState({ layerName: '', notes: '' });
  const [editBenefit, setEditBenefit] = useState('');
  const [draggedLayerIdx, setDraggedLayerIdx] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const loadSystems = useCallback(async () => {
    try {
      const data = await systemsApi.getSystems();
      setSystems(data);
    } catch (err) {
      console.error('Failed to load systems:', err);
    }
  }, []);

  const loadSectors = useCallback(async () => {
    try {
      const data = await systemsApi.getSectors();
      setSectors(data);
    } catch (err) {
      console.error('Failed to load sectors:', err);
    }
  }, []);

  const loadFullSystem = useCallback(async (systemId: string) => {
    setLoading(true);
    try {
      const data = await systemsApi.getSystemFull(systemId);
      setFullSystem(data);
    } catch (err) {
      console.error('Failed to load full system:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSystems();
    loadSectors();
  }, [loadSystems, loadSectors]);

  useEffect(() => {
    if (selectedSystemId) {
      loadFullSystem(selectedSystemId);
    } else {
      setFullSystem(null);
    }
  }, [selectedSystemId, loadFullSystem]);

  const handleAddSector = () => {
    const trimmed = sectorInput.trim();
    if (trimmed && !newSystemForm.sectorMapping.includes(trimmed)) {
      setNewSystemForm({ ...newSystemForm, sectorMapping: [...newSystemForm.sectorMapping, trimmed] });
    }
    setSectorInput('');
  };

  const handleRemoveSector = (sector: string) => {
    setNewSystemForm({ ...newSystemForm, sectorMapping: newSystemForm.sectorMapping.filter(s => s !== sector) });
  };

  const handleCreateSystem = async () => {
    if (!newSystemForm.name.trim()) return;
    try {
      await systemsApi.createSystem(newSystemForm);
      setNewSystemForm({ name: '', description: '', typicalUses: '', sectorMapping: [] });
      setSectorInput('');
      setShowCreateSystem(false);
      await loadSystems();
    } catch (err) {
      console.error('Failed to create system:', err);
    }
  };

  const handleDeleteSystem = async (systemId: string) => {
    if (!confirm('Delete this system and all its layers?')) return;
    try {
      await systemsApi.deleteSystem(systemId);
      if (selectedSystemId === systemId) {
        setSelectedSystemId(null);
        setFullSystem(null);
      }
      await loadSystems();
    } catch (err) {
      console.error('Failed to delete system:', err);
    }
  };

  const handleAddLayer = async () => {
    if (!selectedSystemId || !newLayerForm.layerName.trim()) return;
    try {
      const orderSequence = fullSystem?.layers?.length || 0;
      await systemsApi.createLayer({
        systemId: selectedSystemId,
        layerName: newLayerForm.layerName,
        orderSequence,
        notes: newLayerForm.notes,
      });
      setNewLayerForm({ layerName: '', notes: '' });
      setShowAddLayer(false);
      await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to add layer:', err);
    }
  };

  const handleUpdateLayer = async (layerId: string) => {
    try {
      await systemsApi.updateLayer(layerId, editLayerForm);
      setEditingLayer(null);
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to update layer:', err);
    }
  };

  const handleDeleteLayer = async (layerId: string) => {
    if (!confirm('Delete this layer and all its product assignments?')) return;
    try {
      await systemsApi.deleteLayer(layerId);
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to delete layer:', err);
    }
  };

  const handleAddProductToLayer = async (layerId: string, productId: string) => {
    try {
      await systemsApi.addProductOption({ layerId, productId, benefit: '', isDefault: false });
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to add product:', err);
    }
  };

  const handleToggleDefault = async (optionId: string, current: boolean) => {
    try {
      await systemsApi.updateProductOption(optionId, { isDefault: !current });
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to toggle default:', err);
    }
  };

  const handleUpdateBenefit = async (optionId: string) => {
    try {
      await systemsApi.updateProductOption(optionId, { benefit: editBenefit });
      setEditingOption(null);
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to update benefit:', err);
    }
  };

  const handleRemoveProduct = async (optionId: string) => {
    try {
      await systemsApi.removeProductOption(optionId);
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to remove product:', err);
    }
  };

  const handleLayerDragStart = (idx: number) => {
    setDraggedLayerIdx(idx);
  };

  const handleLayerDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedLayerIdx === null || draggedLayerIdx === idx) return;
  };

  const handleLayerDrop = async (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggedLayerIdx === null || !fullSystem || !selectedSystemId) return;
    const layers = [...fullSystem.layers];
    const [moved] = layers.splice(draggedLayerIdx, 1);
    layers.splice(targetIdx, 0, moved);
    const layerOrder = layers.map((l) => l.layerId);
    try {
      await systemsApi.reorderLayers(selectedSystemId, layerOrder);
      await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to reorder layers:', err);
    }
    setDraggedLayerIdx(null);
  };

  const handleExport = async (format: 'json' | 'csv') => {
    if (!selectedSystemId) return;
    try {
      const result = await systemsApi.exportSystem(selectedSystemId, format);
      if (format === 'csv' && result instanceof Blob) {
        const url = URL.createObjectURL(result);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fullSystem?.name?.replace(/\s+/g, '_') || 'system'}_spec.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fullSystem?.name?.replace(/\s+/g, '_') || 'system'}_spec.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to export:', err);
    }
    setShowExportMenu(false);
  };

  const handleSnapshot = async () => {
    if (!selectedSystemId) return;
    try {
      await systemsApi.createSnapshot(selectedSystemId, { description: 'Manual snapshot' });
      alert('Version snapshot created successfully');
    } catch (err) {
      console.error('Failed to create snapshot:', err);
    }
  };

  const loadHistory = async () => {
    if (!selectedSystemId) return;
    try {
      const data = await systemsApi.getHistory(selectedSystemId);
      setHistoryEntries(data);
      setShowHistory(true);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const handleUpdateSystemStatus = async (status: string) => {
    if (!selectedSystemId) return;
    try {
      await systemsApi.updateSystem(selectedSystemId, { status });
      await loadSystems();
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const filteredSystems = systems.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.stockCode && p.stockCode.toLowerCase().includes(productSearch.toLowerCase())) ||
    (p.supplier && p.supplier.toLowerCase().includes(productSearch.toLowerCase()))
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-100 text-emerald-700';
      case 'draft': return 'bg-amber-100 text-amber-700';
      case 'archived': return 'bg-slate-100 text-slate-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  if (activeTab === 'analytics') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
          <div>
            <h1 className="text-xl font-bold text-slate-800">System Builder</h1>
            <div className="flex items-center gap-1 mt-2">
              <button onClick={() => setActiveTab('builder')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500">Builder</button>
              <button className="px-3 py-1 text-sm rounded-lg bg-blue-100 text-blue-700 font-medium">Analytics</button>
              <button onClick={() => setActiveTab('import')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500">Import</button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <SystemDashboard products={products} />
        </div>
      </div>
    );
  }

  if (activeTab === 'import') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
          <div>
            <h1 className="text-xl font-bold text-slate-800">System Builder</h1>
            <div className="flex items-center gap-1 mt-2">
              <button onClick={() => setActiveTab('builder')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500">Builder</button>
              <button onClick={() => setActiveTab('analytics')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500">Analytics</button>
              <button className="px-3 py-1 text-sm rounded-lg bg-blue-100 text-blue-700 font-medium">Import</button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <SystemImport products={products} onImportComplete={loadSystems} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-slate-800">System Builder</h1>
          <div className="flex items-center gap-1 mt-2">
            <button className="px-3 py-1 text-sm rounded-lg bg-blue-100 text-blue-700 font-medium">Builder</button>
            <button onClick={() => setActiveTab('analytics')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500">Analytics</button>
            <button onClick={() => setActiveTab('import')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500">Import</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedSystemId && (
            <>
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <Download size={14} /> Export
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 w-40">
                    <button onClick={() => handleExport('json')} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                      <FileJson size={14} /> JSON
                    </button>
                    <button onClick={() => handleExport('csv')} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                      <FileSpreadsheet size={14} /> CSV
                    </button>
                  </div>
                )}
              </div>
              <button onClick={handleSnapshot} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
                <Copy size={14} /> Snapshot
              </button>
              <button onClick={loadHistory} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
                <History size={14} /> History
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* LEFT PANEL - System List */}
        <div className="w-72 border-r border-slate-200 bg-slate-50 flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search systems..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <button
                onClick={() => setShowCreateSystem(true)}
                className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title="Create New System"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {showCreateSystem && (
            <div className="p-3 border-b border-slate-200 bg-blue-50">
              <input
                type="text"
                placeholder="System name"
                value={newSystemForm.name}
                onChange={(e) => setNewSystemForm({ ...newSystemForm, name: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:ring-2 focus:ring-blue-500 outline-none"
                autoFocus
              />
              <textarea
                placeholder="Description (optional)"
                value={newSystemForm.description}
                onChange={(e) => setNewSystemForm({ ...newSystemForm, description: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                rows={2}
              />
              <input
                type="text"
                placeholder="Typical uses (optional)"
                value={newSystemForm.typicalUses}
                onChange={(e) => setNewSystemForm({ ...newSystemForm, typicalUses: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <div className="mb-2">
                <div className="flex items-center gap-1 mb-1">
                  <input
                    type="text"
                    placeholder="Add sector (e.g. Flooring, Roofing)"
                    value={sectorInput}
                    onChange={(e) => setSectorInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSector(); } }}
                    className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button type="button" onClick={handleAddSector} className="px-2 py-1.5 text-sm bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300">
                    <Plus size={14} />
                  </button>
                </div>
                {newSystemForm.sectorMapping.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {newSystemForm.sectorMapping.map(sec => (
                      <span key={sec} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                        {sec}
                        <button onClick={() => handleRemoveSector(sec)} className="hover:text-red-500"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreateSystem} className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
                <button onClick={() => setShowCreateSystem(false)} className="px-3 py-1.5 text-sm bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300">Cancel</button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {filteredSystems.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-sm">
                {searchTerm ? 'No systems match your search' : 'No systems yet. Create your first system to get started.'}
              </div>
            )}
            {filteredSystems.map((sys) => (
              <div
                key={sys.systemId}
                onClick={() => setSelectedSystemId(sys.systemId)}
                className={`group px-3 py-2.5 border-b border-slate-100 cursor-pointer transition-colors ${
                  selectedSystemId === sys.systemId ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-slate-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-700 truncate">{sys.name}</span>
                    </div>
                    {sys.description && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate pl-5">{sys.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 pl-5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getStatusColor(sys.status)}`}>
                        {sys.status}
                      </span>
                      <span className="text-[10px] text-slate-400">v{sys.version}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteSystem(sys.systemId); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER PANEL - Layer Editor */}
        <div className="flex-1 overflow-y-auto bg-white">
          {!selectedSystemId ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Layers size={48} className="mb-3 opacity-50" />
              <p className="text-lg font-medium">Select a System</p>
              <p className="text-sm mt-1">Choose a system from the left panel or create a new one</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          ) : fullSystem ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{fullSystem.name}</h2>
                  {fullSystem.description && <p className="text-sm text-slate-500 mt-0.5">{fullSystem.description}</p>}
                  {fullSystem.typicalUses && <p className="text-xs text-slate-400 mt-0.5">Uses: {fullSystem.typicalUses}</p>}
                  {(() => {
                    const mapping = fullSystem.sectorMapping as string[] | undefined;
                    return Array.isArray(mapping) && mapping.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {mapping.map(sec => (
                          <span key={sec} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-indigo-50 text-indigo-600 rounded-full font-medium">
                            {sec}
                            <button
                              onClick={() => {
                                const updated = mapping.filter(s => s !== sec);
                                systemsApi.updateSystem(selectedSystemId!, { sectorMapping: updated }).then(() => loadFullSystem(selectedSystemId!));
                              }}
                              className="hover:text-red-500"
                            ><X size={8} /></button>
                          </span>
                        ))}
                        <button
                          onClick={() => {
                            const newSec = prompt('Add sector:');
                            if (newSec?.trim()) {
                              const updated = [...mapping, newSec.trim()];
                              systemsApi.updateSystem(selectedSystemId!, { sectorMapping: updated }).then(() => loadFullSystem(selectedSystemId!));
                            }
                          }}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200"
                        ><Plus size={8} /> Sector</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          const newSec = prompt('Add sector (e.g. Flooring, Roofing):');
                          if (newSec?.trim()) {
                            systemsApi.updateSystem(selectedSystemId!, { sectorMapping: [newSec.trim()] }).then(() => loadFullSystem(selectedSystemId!));
                          }
                        }}
                        className="inline-flex items-center gap-0.5 mt-1 px-2 py-0.5 text-[10px] bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200"
                      ><Plus size={8} /> Add Sector</button>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={fullSystem.status}
                    onChange={(e) => handleUpdateSystemStatus(e.target.value)}
                    className="text-sm border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                  <button
                    onClick={() => setShowAddLayer(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus size={14} /> Add Layer
                  </button>
                </div>
              </div>

              {showAddLayer && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Layer name (e.g., Primer, Base Coat, Top Coat)"
                      value={newLayerForm.layerName}
                      onChange={(e) => setNewLayerForm({ ...newLayerForm, layerName: e.target.value })}
                      className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      autoFocus
                    />
                  </div>
                  <textarea
                    placeholder="Notes (optional)"
                    value={newLayerForm.notes}
                    onChange={(e) => setNewLayerForm({ ...newLayerForm, notes: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddLayer} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add Layer</button>
                    <button onClick={() => setShowAddLayer(false)} className="px-3 py-1.5 text-sm bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300">Cancel</button>
                  </div>
                </div>
              )}

              {fullSystem.layers.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Layers size={36} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No layers yet. Add your first layer to start building the system.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {fullSystem.layers.map((layer, idx) => (
                    <div
                      key={layer.layerId}
                      draggable
                      onDragStart={() => handleLayerDragStart(idx)}
                      onDragOver={(e) => handleLayerDragOver(e, idx)}
                      onDrop={(e) => handleLayerDrop(e, idx)}
                      className={`border rounded-xl transition-all ${
                        draggedLayerIdx === idx ? 'opacity-50 border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-t-xl border-b border-slate-100">
                        <GripVertical size={14} className="text-slate-300 cursor-grab flex-shrink-0" />
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {idx + 1}
                        </div>
                        {editingLayer === layer.layerId ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={editLayerForm.layerName}
                              onChange={(e) => setEditLayerForm({ ...editLayerForm, layerName: e.target.value })}
                              className="flex-1 px-2 py-1 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <button onClick={() => handleUpdateLayer(layer.layerId)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                              <Check size={14} />
                            </button>
                            <button onClick={() => setEditingLayer(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="flex-1 text-sm font-semibold text-slate-700">{layer.layerName}</span>
                            {layer.notes && <span className="text-xs text-slate-400 truncate max-w-[200px]">{layer.notes}</span>}
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                              {layer.productOptions.length} product{layer.productOptions.length !== 1 ? 's' : ''}
                            </span>
                            <button
                              onClick={() => {
                                setEditingLayer(layer.layerId);
                                setEditLayerForm({ layerName: layer.layerName, notes: layer.notes || '' });
                              }}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            >
                              <Edit size={13} />
                            </button>
                            <button
                              onClick={() => setShowAddProduct(showAddProduct === layer.layerId ? null : layer.layerId)}
                              className="p-1 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                              title="Add product to layer"
                            >
                              <Plus size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteLayer(layer.layerId)}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>

                      {showAddProduct === layer.layerId && (
                        <div className="px-3 py-2 bg-green-50 border-b border-green-100">
                          <div className="relative mb-2">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Search products by name, stock code, or supplier..."
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                              autoFocus
                            />
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-0.5">
                            {filteredProducts.slice(0, 20).map((prod) => {
                              const alreadyAdded = layer.productOptions.some((o) => o.productId === prod.id);
                              return (
                                <div
                                  key={prod.id}
                                  className={`flex items-center justify-between px-2 py-1.5 rounded text-sm ${
                                    alreadyAdded ? 'bg-slate-100 text-slate-400' : 'hover:bg-green-100 cursor-pointer'
                                  }`}
                                  onClick={() => !alreadyAdded && handleAddProductToLayer(layer.layerId, prod.id)}
                                >
                                  <div className="flex items-center gap-2">
                                    <Package size={12} className="flex-shrink-0" />
                                    <span className="truncate">{prod.name}</span>
                                    {prod.stockCode && <span className="text-xs text-slate-400">{prod.stockCode}</span>}
                                  </div>
                                  {alreadyAdded ? (
                                    <span className="text-[10px] text-slate-400">Added</span>
                                  ) : (
                                    <Plus size={12} className="text-green-600" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="divide-y divide-slate-50">
                        {layer.productOptions.map((opt) => (
                          <div key={opt.optionId} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 group/opt transition-colors">
                            <button
                              onClick={() => handleToggleDefault(opt.optionId, opt.isDefault)}
                              className={`flex-shrink-0 ${opt.isDefault ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                              title={opt.isDefault ? 'Default product' : 'Set as default'}
                            >
                              {opt.isDefault ? <Star size={14} fill="currentColor" /> : <StarOff size={14} />}
                            </button>
                            <Package size={13} className="text-slate-400 flex-shrink-0" />
                            <span className="text-sm text-slate-700 font-medium truncate">{opt.productName || opt.productId}</span>
                            {opt.productStockCode && (
                              <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{opt.productStockCode}</span>
                            )}
                            {opt.productSupplier && (
                              <span className="text-xs text-slate-400">{opt.productSupplier}</span>
                            )}
                            <div className="flex-1" />
                            {editingOption === opt.optionId ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={editBenefit}
                                  onChange={(e) => setEditBenefit(e.target.value)}
                                  placeholder="Product benefit..."
                                  className="px-2 py-0.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 outline-none w-48"
                                />
                                <button onClick={() => handleUpdateBenefit(opt.optionId)} className="p-0.5 text-green-600 hover:bg-green-50 rounded">
                                  <Check size={12} />
                                </button>
                                <button onClick={() => setEditingOption(null)} className="p-0.5 text-slate-400 hover:bg-slate-100 rounded">
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <>
                                {opt.benefit && <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{opt.benefit}</span>}
                                <button
                                  onClick={() => { setEditingOption(opt.optionId); setEditBenefit(opt.benefit || ''); }}
                                  className="opacity-0 group-hover/opt:opacity-100 p-1 text-slate-400 hover:text-blue-500 rounded transition-all"
                                  title="Edit benefit"
                                >
                                  <Edit size={12} />
                                </button>
                                <button
                                  onClick={() => handleRemoveProduct(opt.optionId)}
                                  className="opacity-0 group-hover/opt:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-all"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                        {layer.productOptions.length === 0 && (
                          <div className="px-3 py-3 text-center text-xs text-slate-400">
                            No products assigned to this layer yet
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* RIGHT PANEL - Preview & Summary */}
        <div className="w-80 border-l border-slate-200 bg-slate-50 flex flex-col flex-shrink-0 overflow-y-auto">
          {fullSystem ? (
            <div className="p-4">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">System Summary</h3>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <div className="text-2xl font-bold text-blue-600">{fullSystem.layers.length}</div>
                  <div className="text-xs text-slate-500">Layers</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <div className="text-2xl font-bold text-emerald-600">
                    {fullSystem.layers.reduce((sum, l) => sum + l.productOptions.length, 0)}
                  </div>
                  <div className="text-xs text-slate-500">Products</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <div className="text-2xl font-bold text-amber-600">
                    {fullSystem.layers.reduce((sum, l) => sum + l.productOptions.filter((o) => o.isDefault).length, 0)}
                  </div>
                  <div className="text-xs text-slate-500">Defaults</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <div className="text-2xl font-bold text-slate-600">v{fullSystem.version}</div>
                  <div className="text-xs text-slate-500">Version</div>
                </div>
              </div>

              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Build-Up Preview</h3>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {fullSystem.layers.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">Add layers to see the build-up preview</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {fullSystem.layers.map((layer, idx) => {
                      const defaultProducts = layer.productOptions.filter((o) => o.isDefault);
                      const colorScale = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500'];
                      const layerColor = colorScale[idx % colorScale.length];
                      return (
                        <div key={layer.layerId} className="relative">
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${layerColor}`} />
                          <div className="pl-4 pr-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full ${layerColor} text-white flex items-center justify-center text-[10px] font-bold`}>
                                {idx + 1}
                              </span>
                              <span className="text-xs font-semibold text-slate-700">{layer.layerName}</span>
                            </div>
                            {defaultProducts.length > 0 ? (
                              <div className="ml-7 mt-1 space-y-0.5">
                                {defaultProducts.map((dp) => (
                                  <div key={dp.optionId} className="text-[11px] text-slate-500 flex items-center gap-1">
                                    <Star size={8} className="text-amber-500" fill="currentColor" />
                                    {dp.productName || dp.productId}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="ml-7 mt-1 text-[11px] text-slate-400 italic">
                                {layer.productOptions.length > 0 ? `${layer.productOptions.length} option(s), no default set` : 'No products assigned'}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {fullSystem.typicalUses && (
                <div className="mt-4">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">Typical Uses</h3>
                  <p className="text-xs text-slate-600 bg-white rounded-lg border border-slate-200 p-3">{fullSystem.typicalUses}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6">
              <Eye size={36} className="mb-2 opacity-50" />
              <p className="text-sm text-center">Select a system to view its summary and build-up preview</p>
            </div>
          )}
        </div>
      </div>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[600px] max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">Version History</h3>
              <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {historyEntries.length === 0 ? (
                <p className="text-center text-slate-400 py-6">No version history yet. Create a snapshot to start tracking changes.</p>
              ) : (
                <div className="space-y-3">
                  {historyEntries.map((entry) => (
                    <div key={entry.id} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700">Version {entry.version}</span>
                        <span className="text-xs text-slate-400">{new Date(entry.createdAt).toLocaleString()}</span>
                      </div>
                      {entry.changeDescription && <p className="text-xs text-slate-500 mt-1">{entry.changeDescription}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemBuilder;
