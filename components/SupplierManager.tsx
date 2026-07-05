import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Pencil, Trash2, Building2, Globe, Mail, Phone, X, Check, Search, Tag, Sparkles,
  RefreshCw, UploadCloud, Filter, ArrowUp, ArrowDown, ArrowUpDown, Maximize2, FileText,
} from 'lucide-react';
import { Supplier } from '../types';
import { api, NotionSyncStatus } from '../client/api';
import { useEscapeKey } from '../hooks/useEscapeKey';

type SortDirection = 'asc' | 'desc';
interface SortConfig {
  key: string;
  direction: SortDirection;
}

const COLUMN_DEFS: { key: string; label: string; defaultWidth: number; getValue: (s: Supplier) => string }[] = [
  { key: 'id', label: 'ID', defaultWidth: 90, getValue: (s) => s.id },
  { key: 'name', label: 'Company Name', defaultWidth: 220, getValue: (s) => s.name || '' },
  { key: 'supplierCode', label: 'Code', defaultWidth: 100, getValue: (s) => s.supplierCode || '' },
  { key: 'country', label: 'Country', defaultWidth: 130, getValue: (s) => s.country || '' },
  { key: 'contact', label: 'Contact', defaultWidth: 220, getValue: (s) => s.contactName || '' },
  { key: 'leadInfo', label: 'Lead Info', defaultWidth: 180, getValue: (s) => s.leadPosition || '' },
  { key: 'industry', label: 'Industry', defaultWidth: 180, getValue: (s) => s.industryMainActivities || '' },
  { key: 'status', label: 'Status', defaultWidth: 150, getValue: (s) => s.isActive ? 'Active' : 'Inactive' },
];

const FILTERABLE_COLUMNS: { key: string; label: string; getValue: (s: Supplier) => string | undefined }[] = [
  { key: 'country', label: 'Country', getValue: (s) => s.country },
  { key: 'leadSource', label: 'Lead Source', getValue: (s) => s.leadSource },
  { key: 'sourceQuality', label: 'Source Quality', getValue: (s) => s.sourceQuality },
  { key: 'action', label: 'Action', getValue: (s) => s.action },
  { key: 'priority', label: 'Priority', getValue: (s) => s.priority },
  { key: 'status', label: 'Status', getValue: (s) => s.isActive ? 'Active' : 'Inactive' },
];

const MIN_COLUMN_WIDTH = 80;

interface SupplierManagerProps {
  suppliers: Supplier[];
  onAddSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateSupplier: (id: string, updates: Partial<Supplier>) => void;
  onDeleteSupplier: (id: string) => void;
}

const SupplierManager: React.FC<SupplierManagerProps> = ({
  suppliers,
  onAddSupplier,
  onUpdateSupplier,
  onDeleteSupplier,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncStatus, setSyncStatus] = useState<NotionSyncStatus | null>(null);
  const [isPushing, setIsPushing] = useState(false);

  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, c.defaultWidth]))
  );
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;

  const [peekSupplier, setPeekSupplier] = useState<Supplier | null>(null);

  const refreshSyncStatus = useCallback(async () => {
    try {
      const status = await api.getNotionSyncStatus();
      setSyncStatus(status);
    } catch (e) {
      // Non-fatal — sync status bar simply stays hidden/stale
    }
  }, []);

  useEffect(() => {
    refreshSyncStatus();
    const interval = setInterval(refreshSyncStatus, 15000);
    return () => clearInterval(interval);
  }, [refreshSyncStatus]);

  const handlePushToNotion = async () => {
    setIsPushing(true);
    try {
      await api.notionPush();
    } catch (e) {
      console.error('Failed to push to Notion:', e);
    } finally {
      setIsPushing(false);
      refreshSyncStatus();
    }
  };

  const escCloseModal = useCallback(() => {
    setShowAddModal(false);
    setEditingSupplier(null);
  }, []);
  useEscapeKey(showAddModal || editingSupplier ? escCloseModal : null);
  const [formData, setFormData] = useState({
    name: '',
    supplierCode: '',
    country: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    website: '',
    notes: '',
    leadPosition: '',
    leadSource: '',
    sourceQuality: '',
    industryMainActivities: '',
    mobile2: '',
    action: '',
    priority: '',
    paymentTerms: '',
  });

  const filterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    FILTERABLE_COLUMNS.forEach((col) => {
      const values = new Set<string>();
      suppliers.forEach((s) => {
        const v = col.getValue(s);
        if (v) values.add(v);
      });
      options[col.key] = Array.from(values).sort((a, b) => a.localeCompare(b));
    });
    return options;
  }, [suppliers]);

  const filteredSuppliers = useMemo(() => {
    let result = suppliers.filter(s =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.country && s.country.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    FILTERABLE_COLUMNS.forEach((col) => {
      const selected = activeFilters[col.key];
      if (selected) {
        result = result.filter((s) => col.getValue(s) === selected);
      }
    });

    if (sortConfig) {
      const colDef = COLUMN_DEFS.find((c) => c.key === sortConfig.key);
      if (colDef) {
        result = [...result].sort((a, b) => {
          const aVal = colDef.getValue(a).toLowerCase();
          const bVal = colDef.getValue(b).toLowerCase();
          const cmp = aVal.localeCompare(bVal);
          return sortConfig.direction === 'asc' ? cmp : -cmp;
        });
      }
    }

    return result;
  }, [suppliers, searchQuery, activeFilters, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  const handleFilterChange = (key: string, value: string) => {
    setActiveFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  const clearFilters = () => setActiveFilters({});

  const handleResizeStart = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startWidth: columnWidths[key] };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const { key: resizeKey, startX, startWidth } = resizingRef.current;
      const newWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + (moveEvent.clientX - startX));
      setColumnWidths((prev) => ({ ...prev, [resizeKey]: newWidth }));
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const generateSupplierId = () => {
    const maxNum = suppliers.reduce((max, s) => {
      const match = s.id.match(/S-(\d+)/);
      return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);
    return `S-${String(maxNum + 1).padStart(4, '0')}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingSupplier) {
      onUpdateSupplier(editingSupplier.id, {
        name: formData.name,
        supplierCode: formData.supplierCode.toUpperCase() || undefined,
        country: formData.country || undefined,
        contactName: formData.contactName || undefined,
        contactEmail: formData.contactEmail || undefined,
        contactPhone: formData.contactPhone || undefined,
        address: formData.address || undefined,
        website: formData.website || undefined,
        notes: formData.notes || undefined,
        leadPosition: formData.leadPosition || undefined,
        leadSource: formData.leadSource || undefined,
        sourceQuality: formData.sourceQuality || undefined,
        industryMainActivities: formData.industryMainActivities || undefined,
        mobile2: formData.mobile2 || undefined,
        action: formData.action || undefined,
        priority: formData.priority || undefined,
        paymentTerms: formData.paymentTerms || undefined,
      });
      setEditingSupplier(null);
    } else {
      onAddSupplier({
        id: generateSupplierId(),
        name: formData.name,
        supplierCode: formData.supplierCode.toUpperCase() || undefined,
        country: formData.country || undefined,
        contactName: formData.contactName || undefined,
        contactEmail: formData.contactEmail || undefined,
        contactPhone: formData.contactPhone || undefined,
        address: formData.address || undefined,
        website: formData.website || undefined,
        notes: formData.notes || undefined,
        leadPosition: formData.leadPosition || undefined,
        leadSource: formData.leadSource || undefined,
        sourceQuality: formData.sourceQuality || undefined,
        industryMainActivities: formData.industryMainActivities || undefined,
        mobile2: formData.mobile2 || undefined,
        action: formData.action || undefined,
        priority: formData.priority || undefined,
        paymentTerms: formData.paymentTerms || undefined,
        isActive: true,
      });
    }

    setFormData({
      name: '',
      supplierCode: '',
      country: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      address: '',
      website: '',
      notes: '',
      leadPosition: '',
      leadSource: '',
      sourceQuality: '',
      industryMainActivities: '',
      mobile2: '',
      action: '',
      priority: '',
      paymentTerms: '',
    });
    setShowAddModal(false);
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      supplierCode: supplier.supplierCode || '',
      country: supplier.country || '',
      contactName: supplier.contactName || '',
      contactEmail: supplier.contactEmail || '',
      contactPhone: supplier.contactPhone || '',
      address: supplier.address || '',
      website: supplier.website || '',
      notes: supplier.notes || '',
      leadPosition: supplier.leadPosition || '',
      leadSource: supplier.leadSource || '',
      sourceQuality: supplier.sourceQuality || '',
      industryMainActivities: supplier.industryMainActivities || '',
      mobile2: supplier.mobile2 || '',
      action: supplier.action || '',
      priority: supplier.priority || '',
      paymentTerms: supplier.paymentTerms || '',
    });
    setShowAddModal(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this contact?')) {
      onDeleteSupplier(id);
    }
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingSupplier(null);
    setFormData({
      name: '',
      supplierCode: '',
      country: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      address: '',
      website: '',
      notes: '',
      leadPosition: '',
      leadSource: '',
      sourceQuality: '',
      industryMainActivities: '',
      mobile2: '',
      action: '',
      priority: '',
      paymentTerms: '',
    });
  };

  const handleSuggestCode = async () => {
    if (!formData.name.trim()) return;
    try {
      const result = await api.suggestSupplierCode(formData.name);
      setFormData(prev => ({ ...prev, supplierCode: result.code }));
    } catch (e) {
      console.error('Failed to suggest supplier code:', e);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Contact Network</h1>
          <p className="text-gray-600 mt-1">Manage your contacts, synced with Notion</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePushToNotion}
            disabled={isPushing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60"
            title="Push local changes to Notion"
          >
            <UploadCloud size={18} className={isPushing ? 'animate-pulse' : ''} />
            {isPushing ? 'Pushing...' : 'Push to Notion'}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Add Contact
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <RefreshCw size={14} className={(syncStatus?.pullInProgress || syncStatus?.pushInProgress) ? 'animate-spin text-blue-500' : 'text-gray-400'} />
        {syncStatus ? (
          <span>
            {(syncStatus.pullInProgress || syncStatus.pushInProgress) ? 'Syncing with Notion…' : 'Notion sync'}
            {syncStatus.lastPullAt && ` · Last pull: ${new Date(syncStatus.lastPullAt).toLocaleString()}${syncStatus.lastPullCount != null ? ` (${syncStatus.lastPullCount} updated)` : ''}`}
            {syncStatus.lastPushAt && ` · Last push: ${new Date(syncStatus.lastPushAt).toLocaleString()}${syncStatus.lastPushCount != null ? ` (${syncStatus.lastPushCount} pushed)` : ''}`}
            {syncStatus.lastError && <span className="text-red-500"> · Error: {syncStatus.lastError}</span>}
          </span>
        ) : (
          <span>Notion sync status unavailable</span>
        )}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setShowFilterPanel((v) => !v)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
              activeFilterCount > 0 ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Filter size={16} />
            Filter
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold rounded-full bg-blue-600 text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          {showFilterPanel && (
            <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">Filters</span>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline">
                    Clear all
                  </button>
                )}
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {FILTERABLE_COLUMNS.map((col) => (
                  <div key={col.key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{col.label}</label>
                    <select
                      value={activeFilters[col.key] || ''}
                      onChange={(e) => handleFilterChange(col.key, e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">All</option>
                      {(filterOptions[col.key] || []).map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="divide-y divide-gray-200" style={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {COLUMN_DEFS.map((col) => (
              <col key={col.key} style={{ width: columnWidths[col.key] }} />
            ))}
            <col style={{ width: 90 }} />
          </colgroup>
          <thead className="bg-gray-50">
            <tr>
              {COLUMN_DEFS.map((col) => {
                const isSorted = sortConfig?.key === col.key;
                return (
                  <th
                    key={col.key}
                    className="relative px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider select-none group"
                  >
                    <button
                      onClick={() => handleSort(col.key)}
                      className="flex items-center gap-1 hover:text-gray-700"
                      title={`Sort by ${col.label}`}
                    >
                      <span className="truncate">{col.label}</span>
                      {isSorted ? (
                        sortConfig!.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-40" />
                      )}
                    </button>
                    <div
                      onMouseDown={(e) => handleResizeStart(e, col.key)}
                      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-300"
                    />
                  </th>
                );
              })}
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredSuppliers.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_DEFS.length + 1} className="px-6 py-12 text-center text-gray-500">
                  <Building2 size={48} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">No contacts found</p>
                  <p className="text-sm">Add your first contact to get started</p>
                </td>
              </tr>
            ) : (
              filteredSuppliers.map((supplier) => (
                <tr key={supplier.id} className="group hover:bg-gray-50 cursor-pointer" onClick={() => setPeekSupplier(supplier)}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600 relative">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{supplier.id}</span>
                      <span className="hidden group-hover:inline-flex items-center gap-1 px-1.5 py-0.5 bg-yellow-200 text-yellow-900 text-[10px] font-semibold rounded">
                        <Maximize2 size={10} /> OPEN
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap overflow-hidden">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                        <Building2 size={20} className="text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{supplier.name}</div>
                        {supplier.website && (
                          <a href={supplier.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                            <Globe size={12} /> Website
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {supplier.supplierCode ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-mono text-xs font-bold">
                        <Tag size={12} />
                        {supplier.supplierCode}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate">{supplier.country || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap overflow-hidden">
                    <div className="text-sm text-gray-900 truncate">{supplier.contactName || '-'}</div>
                    {supplier.contactEmail && (
                      <div className="text-xs text-gray-500 flex items-center gap-1 truncate">
                        <Mail size={12} className="flex-shrink-0" /> <span className="truncate">{supplier.contactEmail}</span>
                      </div>
                    )}
                    {supplier.contactPhone && (
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Phone size={12} className="flex-shrink-0" /> {supplier.contactPhone}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap overflow-hidden">
                    <div className="text-xs text-gray-700 truncate">{supplier.leadPosition || '-'}</div>
                    {supplier.leadSource && (
                      <div className="text-xs text-gray-500 truncate">Source: {supplier.leadSource}</div>
                    )}
                    {supplier.sourceQuality && (
                      <div className="text-xs text-gray-500 truncate">Quality: {supplier.sourceQuality}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600 truncate" title={supplier.industryMainActivities || ''}>
                    {supplier.industryMainActivities || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap overflow-hidden">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${supplier.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {supplier.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {supplier.notionPageId && (
                      <span className="ml-1 px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-50 text-blue-700" title="Synced with Notion">
                        Notion
                      </span>
                    )}
                    {supplier.action && (
                      <div className="text-xs text-gray-500 mt-1 truncate">Action: {supplier.action}</div>
                    )}
                    {supplier.priority && (
                      <div className="text-xs text-gray-500 truncate">Priority: {supplier.priority}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={(e) => { e.stopPropagation(); setPeekSupplier(supplier); }} className="text-gray-500 hover:text-gray-700 mr-3" title="Open details">
                      <Maximize2 size={16} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(supplier); }} className="text-blue-600 hover:text-blue-900 mr-3" title="Edit">
                      <Pencil size={16} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(supplier.id); }} className="text-red-600 hover:text-red-900" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Total: {filteredSuppliers.length} contact{filteredSuppliers.length !== 1 ? 's' : ''}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">{editingSupplier ? 'Edit Contact' : 'Add New Contact'}</h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.supplierCode}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 5);
                      setFormData({ ...formData, supplierCode: val });
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono uppercase"
                    placeholder="e.g. SUP, BAS, SIK"
                    maxLength={5}
                  />
                  <button
                    type="button"
                    onClick={handleSuggestCode}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm flex items-center gap-1 transition-colors"
                    title="Auto-suggest code from supplier name"
                  >
                    <Sparkles size={14} />
                    Suggest
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">2-5 uppercase characters. Used in product stock codes (P.SUP.BRANCH.COLOR.0001)</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                <input
                  type="text"
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lead Position</label>
                  <input
                    type="text"
                    value={formData.leadPosition}
                    onChange={(e) => setFormData({ ...formData, leadPosition: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lead Source</label>
                  <input
                    type="text"
                    value={formData.leadSource}
                    onChange={(e) => setFormData({ ...formData, leadSource: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source Quality</label>
                  <input
                    type="text"
                    value={formData.sourceQuality}
                    onChange={(e) => setFormData({ ...formData, sourceQuality: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry (Main Activities)</label>
                  <input
                    type="text"
                    value={formData.industryMainActivities}
                    onChange={(e) => setFormData({ ...formData, industryMainActivities: e.target.value })}
                    placeholder="Comma-separated"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="pt-2 border-t">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notion Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mobile 2</label>
                    <input
                      type="tel"
                      value={formData.mobile2}
                      onChange={(e) => setFormData({ ...formData, mobile2: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                    <input
                      type="text"
                      value={formData.action}
                      onChange={(e) => setFormData({ ...formData, action: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <input
                      type="text"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                    <input
                      type="text"
                      value={formData.paymentTerms}
                      onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                {editingSupplier && (editingSupplier.paidAmount != null || editingSupplier.invoiceValue != null || editingSupplier.pendingPayment) && (
                  <div className="mt-4 grid grid-cols-3 gap-4 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                    <div>
                      <span className="block text-xs text-gray-400">Invoice Value</span>
                      {editingSupplier.invoiceValue ?? '-'}
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400">Paid Amount</span>
                      {editingSupplier.paidAmount ?? '-'}
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400">Pending Payment</span>
                      {editingSupplier.pendingPayment ?? '-'}
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  Read-only fields synced from Notion (e.g. relations, files, formulas) are preserved automatically and not editable here.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Check size={16} />
                  {editingSupplier ? 'Update Contact' : 'Add Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {peekSupplier && (
        <SupplierPeekModal
          supplier={peekSupplier}
          onClose={() => setPeekSupplier(null)}
          onEdit={() => {
            const s = peekSupplier;
            setPeekSupplier(null);
            handleEdit(s);
          }}
        />
      )}
    </div>
  );
};

interface PeekRowProps {
  label: string;
  value?: React.ReactNode;
}

const PeekRow: React.FC<PeekRowProps> = ({ label, value }) => (
  <div className="flex items-start gap-4 py-2.5 border-b border-gray-100 last:border-0">
    <div className="w-40 flex-shrink-0 text-xs font-medium text-gray-400 pt-0.5">{label}</div>
    <div className="flex-1 text-sm text-gray-800 break-words">
      {value === undefined || value === null || value === '' ? (
        <span className="text-gray-300">Empty</span>
      ) : (
        value
      )}
    </div>
  </div>
);

interface SupplierPeekModalProps {
  supplier: Supplier;
  onClose: () => void;
  onEdit: () => void;
}

const SupplierPeekModal: React.FC<SupplierPeekModalProps> = ({ supplier, onClose, onEdit }) => {
  useEscapeKey(onClose);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Building2 size={22} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">{supplier.name}</h2>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <FileText size={12} /> View details
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onEdit}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-lg"
              title="Edit contact"
            >
              <Pencil size={18} />
            </button>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg" title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${supplier.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                {supplier.isActive ? 'Active' : 'Inactive'}
              </span>
              {supplier.notionPageId && (
                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-50 text-blue-700">
                  Synced with Notion
                </span>
              )}
              <span className="px-2 py-1 inline-flex text-xs leading-5 font-mono rounded-full bg-gray-50 text-gray-500">
                {supplier.id}
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Company</h3>
            <PeekRow label="Company Name" value={supplier.name} />
            <PeekRow label="Code" value={supplier.supplierCode} />
            <PeekRow label="Country" value={supplier.country} />
            <PeekRow
              label="Website"
              value={supplier.website ? (
                <a href={supplier.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                  <Globe size={14} /> {supplier.website}
                </a>
              ) : undefined}
            />
            <PeekRow label="Address" value={supplier.address} />
            <PeekRow label="Industry / Main Activities" value={supplier.industryMainActivities} />
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Lead Contact</h3>
            <PeekRow label="Lead Name" value={supplier.contactName} />
            <PeekRow label="Lead Position" value={supplier.leadPosition} />
            <PeekRow label="Email" value={supplier.contactEmail ? (
              <a href={`mailto:${supplier.contactEmail}`} className="text-blue-600 hover:underline flex items-center gap-1">
                <Mail size={14} /> {supplier.contactEmail}
              </a>
            ) : undefined} />
            <PeekRow label="Mobile" value={supplier.contactPhone ? (
              <span className="flex items-center gap-1"><Phone size={14} /> {supplier.contactPhone}</span>
            ) : undefined} />
            <PeekRow label="Mobile 2" value={supplier.mobile2} />
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Lead Management</h3>
            <PeekRow label="Lead Source" value={supplier.leadSource} />
            <PeekRow label="Source Quality" value={supplier.sourceQuality} />
            <PeekRow label="Action" value={supplier.action} />
            <PeekRow label="Priority" value={supplier.priority} />
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Commercial</h3>
            <PeekRow label="Payment Terms" value={supplier.paymentTerms} />
            <PeekRow label="Invoice Value" value={supplier.invoiceValue ?? undefined} />
            <PeekRow label="Paid Amount" value={supplier.paidAmount ?? undefined} />
            <PeekRow label="Pending Payment" value={supplier.pendingPayment ?? undefined} />
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes & Follow-up</h3>
            <PeekRow label="Reminder" value={supplier.reminder} />
            <PeekRow label="Updates" value={supplier.updates} />
            <PeekRow label="Notes" value={supplier.notes} />
          </div>

          {(supplier.brand?.length || supplier.product?.length || supplier.result?.length) ? (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Related</h3>
              <PeekRow label="Brand" value={supplier.brand?.length ? supplier.brand.join(', ') : undefined} />
              <PeekRow label="Product" value={supplier.product?.length ? supplier.product.join(', ') : undefined} />
              <PeekRow label="Result" value={supplier.result?.length ? supplier.result.join(', ') : undefined} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default SupplierManager;
