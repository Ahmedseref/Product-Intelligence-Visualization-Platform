import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Pencil, Trash2, Building2, Globe, Mail, Phone, X, Check, Search, Tag, Sparkles,
  RefreshCw, UploadCloud, Filter, ArrowUp, ArrowDown, ArrowUpDown, Maximize2, FileText,
  Columns3, Eye, EyeOff, UsersRound, UserRound, GripVertical,
} from 'lucide-react';
import { Supplier } from '../types';
import { api, NotionSyncStatus } from '../client/api';
import { useEscapeKey } from '../hooks/useEscapeKey';

type SortDirection = 'asc' | 'desc';
interface SortConfig {
  key: string;
  direction: SortDirection;
}

// formats a Notion/ISO date string for display in the table & filters. This
// "Last Updated" column mirrors Notion's own "Date" property 1:1 (both are
// the page's last-edited timestamp), so no separate schema column is needed.
const formatDate = (value?: string | null): string => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const getIndustryTags = (value?: string): string[] => {
  if (!value) return [];
  return Array.from(new Set(
    value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  ));
};

const IndustryTags: React.FC<{ value?: string; compact?: boolean }> = ({ value, compact = false }) => {
  const tags = getIndustryTags(value);
  if (tags.length === 0) return <span className="text-gray-400">-</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center rounded-full bg-violet-50 text-violet-700 font-medium ${
            compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
          }`}
        >
          {tag}
        </span>
      ))}
    </div>
  );
};

interface ColumnDef {
  key: string;
  label: string;
  defaultWidth: number;
  getValue: (s: Supplier) => string;
  sortValue?: (s: Supplier) => number | string;
  render: (s: Supplier) => React.ReactNode;
}

const COLUMN_DEFS: ColumnDef[] = [
  {
    key: 'id',
    label: 'ID',
    defaultWidth: 90,
    getValue: (s) => s.id,
    render: (s) => (
      <div className="flex items-center gap-2">
        <span className="truncate">{s.id}</span>
        <span className="hidden group-hover:inline-flex items-center gap-1 px-1.5 py-0.5 bg-yellow-200 text-yellow-900 text-[10px] font-semibold rounded">
          <Maximize2 size={10} /> OPEN
        </span>
      </div>
    ),
  },
  {
    key: 'name',
    label: 'Company Name',
    defaultWidth: 220,
    getValue: (s) => s.name || '',
    render: (s) => (
      <div className="flex items-center">
        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
          <Building2 size={20} className="text-blue-600" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{s.name}</div>
          {s.website && (
            <a href={s.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
              <Globe size={12} /> Website
            </a>
          )}
        </div>
      </div>
    ),
  },
  {
    key: 'supplierCode',
    label: 'Code',
    defaultWidth: 100,
    getValue: (s) => s.supplierCode || '',
    render: (s) => s.supplierCode ? (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-mono text-xs font-bold">
        <Tag size={12} />
        {s.supplierCode}
      </span>
    ) : <span className="text-xs text-gray-400">-</span>,
  },
  {
    key: 'country',
    label: 'Country',
    defaultWidth: 130,
    getValue: (s) => s.country || '',
    render: (s) => s.country || '-',
  },
  {
    key: 'contact',
    label: 'Contact',
    defaultWidth: 220,
    getValue: (s) => s.contactName || '',
    render: (s) => (
      <>
        <div className="text-sm text-gray-900 truncate">{s.contactName || '-'}</div>
        {s.contactEmail && (
          <div className="text-xs text-gray-500 flex items-center gap-1 truncate">
            <Mail size={12} className="flex-shrink-0" /> <span className="truncate">{s.contactEmail}</span>
          </div>
        )}
        {s.contactPhone && (
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <Phone size={12} className="flex-shrink-0" /> {s.contactPhone}
          </div>
        )}
      </>
    ),
  },
  {
    key: 'leadInfo',
    label: 'Lead Info',
    defaultWidth: 180,
    getValue: (s) => s.leadPosition || '',
    render: (s) => (
      <>
        <div className="text-xs text-gray-700 truncate">{s.leadPosition || '-'}</div>
        {s.leadSource && <div className="text-xs text-gray-500 truncate">Source: {s.leadSource}</div>}
        {s.sourceQuality && <div className="text-xs text-gray-500 truncate">Quality: {s.sourceQuality}</div>}
      </>
    ),
  },
  {
    key: 'industry',
    label: 'Industry',
    defaultWidth: 180,
    getValue: (s) => s.industryMainActivities || '',
    render: (s) => <IndustryTags value={s.industryMainActivities} compact />,
  },
  {
    key: 'contactType',
    label: 'Type',
    defaultWidth: 130,
    getValue: (s) => s.contactType || '',
    render: (s) => s.contactType || '-',
  },
  {
    key: 'status',
    label: 'Status',
    defaultWidth: 150,
    getValue: (s) => s.isActive ? 'Active' : 'Inactive',
    render: (s) => (
      <>
        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${s.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
          {s.isActive ? 'Active' : 'Inactive'}
        </span>
        {s.notionPageId && (
          <span className="ml-1 px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-50 text-blue-700" title="Synced with Notion">
            Notion
          </span>
        )}
        {s.action && <div className="text-xs text-gray-500 mt-1 truncate">Action: {s.action}</div>}
        {s.priority && <div className="text-xs text-gray-500 truncate">Priority: {s.priority}</div>}
      </>
    ),
  },
  {
    key: 'lastUpdated',
    label: 'Date',
    defaultWidth: 140,
    getValue: (s) => formatDate(s.notionLastEditedTime) || formatDate(s.updatedAt),
    sortValue: (s) => new Date(s.notionLastEditedTime || s.updatedAt || 0).getTime(),
    render: (s) => formatDate(s.notionLastEditedTime) || formatDate(s.updatedAt) || '-',
  },
];

type FilterType = 'select' | 'multi';

interface FilterDef {
  key: string;
  label: string;
  type: FilterType;
  getValue?: (s: Supplier) => string | undefined;
  getValues?: (s: Supplier) => string[] | undefined;
}

const FILTERABLE_COLUMNS: FilterDef[] = [
  { key: 'country', label: 'Country', type: 'select', getValue: (s) => s.country },
  { key: 'contactName', label: 'Contact Name', type: 'select', getValue: (s) => s.contactName },
  { key: 'contactEmail', label: 'Contact Email', type: 'select', getValue: (s) => s.contactEmail },
  { key: 'contactPhone', label: 'Contact Phone', type: 'select', getValue: (s) => s.contactPhone },
  { key: 'address', label: 'Address', type: 'select', getValue: (s) => s.address },
  { key: 'website', label: 'Website', type: 'select', getValue: (s) => s.website },
  { key: 'leadPosition', label: 'Lead Info', type: 'select', getValue: (s) => s.leadPosition },
  { key: 'leadSource', label: 'Lead Source', type: 'select', getValue: (s) => s.leadSource },
  { key: 'sourceQuality', label: 'Source Quality', type: 'select', getValue: (s) => s.sourceQuality },
  { key: 'action', label: 'Action', type: 'select', getValue: (s) => s.action },
  { key: 'priority', label: 'Priority', type: 'select', getValue: (s) => s.priority },
  { key: 'paymentTerms', label: 'Payment Terms', type: 'select', getValue: (s) => s.paymentTerms },
  { key: 'pendingPayment', label: 'Pending Payment', type: 'select', getValue: (s) => s.pendingPayment },
  { key: 'paidAmount', label: 'Paid Amount', type: 'select', getValue: (s) => s.paidAmount != null ? String(s.paidAmount) : undefined },
  { key: 'invoiceValue', label: 'Invoice Value', type: 'select', getValue: (s) => s.invoiceValue != null ? String(s.invoiceValue) : undefined },
  { key: 'mobile2', label: 'Mobile 2', type: 'select', getValue: (s) => s.mobile2 },
  { key: 'reminder', label: 'Reminder', type: 'select', getValue: (s) => s.reminder },
  { key: 'notes', label: 'Notes', type: 'select', getValue: (s) => s.notes },
  { key: 'updates', label: 'Updates', type: 'select', getValue: (s) => s.updates },
  { key: 'recordId', label: 'Record ID', type: 'select', getValue: (s) => s.recordId },
  { key: 'industryMainActivities', label: 'Industry', type: 'multi', getValues: (s) => getIndustryTags(s.industryMainActivities) },
  { key: 'contactType', label: 'Supplier / Customer', type: 'select', getValue: (s) => s.contactType },
  { key: 'brand', label: 'Brand', type: 'multi', getValues: (s) => s.brand },
  { key: 'product', label: 'Product', type: 'multi', getValues: (s) => s.product },
  { key: 'result', label: 'Result', type: 'multi', getValues: (s) => s.result },
  { key: 'tasksRelation', label: 'Tasks', type: 'multi', getValues: (s) => s.tasksRelation },
  { key: 'dailyTasksConnector', label: 'Daily Tasks', type: 'multi', getValues: (s) => s.dailyTasksConnector },
  { key: 'relatedDocs', label: 'Related Docs', type: 'multi', getValues: (s) => s.relatedDocs },
  { key: 'docsRelation', label: 'Docs Relation', type: 'multi', getValues: (s) => s.docsRelation },
  { key: 'status', label: 'Status', type: 'select', getValue: (s) => s.isActive ? 'Active' : 'Inactive' },
];

const MIN_COLUMN_WIDTH = 80;

interface SupplierManagerProps {
  suppliers: Supplier[];
  onAddSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateSupplier: (id: string, updates: Partial<Supplier>) => void;
  onDeleteSupplier: (id: string) => void;
  onRefresh?: () => void | Promise<void>;
}

const SupplierManager: React.FC<SupplierManagerProps> = ({
  suppliers,
  onAddSupplier,
  onUpdateSupplier,
  onDeleteSupplier,
  onRefresh,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncStatus, setSyncStatus] = useState<NotionSyncStatus | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, c.defaultWidth]))
  );
  const [columnOrder, setColumnOrder] = useState<string[]>(() => COLUMN_DEFS.map((c) => c.key));
  const [draggedColumnKey, setDraggedColumnKey] = useState<string | null>(null);
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;
  const [contactTypeView, setContactTypeView] = useState<'supplier' | 'customer' | 'both'>('both');

  const [showColumnsPanel, setShowColumnsPanel] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const visibleColumnDefs = useMemo(
    () => columnOrder
      .map((key) => COLUMN_DEFS.find((c) => c.key === key))
      .filter((c): c is ColumnDef => Boolean(c) && !hiddenColumns.has(c.key)),
    [columnOrder, hiddenColumns]
  );
  const toggleColumnVisibility = (key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const resetColumns = () => setHiddenColumns(new Set());
  const moveColumn = (sourceKey: string, targetKey: string) => {
    if (sourceKey === targetKey) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const sourceIndex = next.indexOf(sourceKey);
      const targetIndex = next.indexOf(targetKey);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      next.splice(sourceIndex, 1);
      next.splice(next.indexOf(targetKey), 0, sourceKey);
      return next;
    });
  };

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

  const handlePullFromNotion = async () => {
    setIsPulling(true);
    try {
      await api.notionPull();
      onRefresh?.();
    } catch (e) {
      console.error('Failed to pull from Notion:', e);
    } finally {
      setIsPulling(false);
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
        if (col.type === 'multi') {
          (col.getValues?.(s) || []).forEach((v) => v && values.add(v));
        } else {
          const v = col.getValue?.(s);
          if (v) values.add(v);
        }
      });
      options[col.key] = Array.from(values).sort((a, b) => a.localeCompare(b));
    });
    return options;
  }, [suppliers]);

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    let result = suppliers.filter(s => {
      const matchesType = contactTypeView === 'both' ||
        s.contactType?.toLowerCase() === contactTypeView;
      const matchesSearch = !q ||
        s.name.toLowerCase().includes(q) ||
        (s.country && s.country.toLowerCase().includes(q)) ||
        (s.contactName && s.contactName.toLowerCase().includes(q)) ||
        (s.contactEmail && s.contactEmail.toLowerCase().includes(q)) ||
        (s.contactPhone && s.contactPhone.toLowerCase().includes(q)) ||
        (s.leadSource && s.leadSource.toLowerCase().includes(q)) ||
        (s.notes && s.notes.toLowerCase().includes(q)) ||
        (s.updates && s.updates.toLowerCase().includes(q)) ||
        (s.contactType && s.contactType.toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });

    FILTERABLE_COLUMNS.forEach((col) => {
      const selected = activeFilters[col.key];
      if (!selected) return;
      if (col.type === 'multi') {
        result = result.filter((s) => (col.getValues?.(s) || []).includes(selected));
      } else {
        result = result.filter((s) => col.getValue?.(s) === selected);
      }
    });

    if (sortConfig) {
      const colDef = COLUMN_DEFS.find((c) => c.key === sortConfig.key);
      if (colDef) {
        result = [...result].sort((a, b) => {
          const aVal = colDef.sortValue ? colDef.sortValue(a) : colDef.getValue(a).toLowerCase();
          const bVal = colDef.sortValue ? colDef.sortValue(b) : colDef.getValue(b).toLowerCase();
          const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return sortConfig.direction === 'asc' ? cmp : -cmp;
        });
      }
    }

    return result;
  }, [suppliers, searchQuery, activeFilters, sortConfig, contactTypeView]);

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
            onClick={handlePullFromNotion}
            disabled={isPulling}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-60"
            title="Pull the latest changes from Notion now"
          >
            <RefreshCw size={18} className={isPulling ? 'animate-spin' : ''} />
            {isPulling ? 'Syncing...' : 'Sync Now'}
          </button>
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
            <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">Filters</span>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline">
                    Clear all
                  </button>
                )}
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {FILTERABLE_COLUMNS.map((col) => {
                  const options = filterOptions[col.key] || [];
                  if (options.length === 0) return null;
                  return (
                    <div key={col.key}>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{col.label}</label>
                      <select
                        value={activeFilters[col.key] || ''}
                        onChange={(e) => handleFilterChange(col.key, e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">All</option>
                        {options.map((val) => (
                          <option key={val} value={val}>{val}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div
          className="flex items-center border border-gray-300 rounded-lg bg-white p-0.5"
          role="group"
          aria-label="Contact type view"
        >
          {([
            { key: 'supplier' as const, label: 'Suppliers', icon: Building2 },
            { key: 'customer' as const, label: 'Customers', icon: UserRound },
            { key: 'both' as const, label: 'Both', icon: UsersRound },
          ]).map(({ key, label, icon: Icon }) => {
            const isActive = contactTypeView === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setContactTypeView(key)}
                aria-label={`Show ${label.toLowerCase()}`}
                aria-pressed={isActive}
                title={`Show ${label}`}
                className={`p-2 rounded-md transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                <Icon size={17} />
              </button>
            );
          })}
        </div>
        <div className="relative">
          <button
            onClick={() => setShowColumnsPanel((v) => !v)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
              hiddenColumns.size > 0 ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Columns3 size={16} />
            Columns
            {hiddenColumns.size > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold rounded-full bg-blue-600 text-white">
                {hiddenColumns.size}
              </span>
            )}
          </button>
          {showColumnsPanel && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">Show / Hide Columns</span>
                {hiddenColumns.size > 0 && (
                  <button onClick={resetColumns} className="text-xs text-blue-600 hover:underline">
                    Show all
                  </button>
                )}
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {columnOrder.map((key) => COLUMN_DEFS.find((col) => col.key === key)).filter((col): col is ColumnDef => Boolean(col)).map((col) => {
                  const isVisible = !hiddenColumns.has(col.key);
                  return (
                    <label
                      key={col.key}
                      draggable
                      onDragStart={() => setDraggedColumnKey(col.key)}
                      onDragEnd={() => setDraggedColumnKey(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedColumnKey) moveColumn(draggedColumnKey, col.key);
                        setDraggedColumnKey(null);
                      }}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-grab text-sm text-gray-700 ${
                        draggedColumnKey === col.key ? 'opacity-50' : ''
                      }`}
                    >
                      <GripVertical size={14} className="text-gray-300 flex-shrink-0" />
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => toggleColumnVisibility(col.key)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {isVisible ? <Eye size={14} className="text-gray-400" /> : <EyeOff size={14} className="text-gray-300" />}
                      <span className="truncate">{col.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="divide-y divide-gray-200" style={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {visibleColumnDefs.map((col) => (
              <col key={col.key} style={{ width: columnWidths[col.key] }} />
            ))}
            <col style={{ width: 90 }} />
          </colgroup>
          <thead className="bg-gray-50">
            <tr>
              {visibleColumnDefs.map((col) => {
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
                <td colSpan={visibleColumnDefs.length + 1} className="px-6 py-12 text-center text-gray-500">
                  <Building2 size={48} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">No contacts found</p>
                  <p className="text-sm">Add your first contact to get started</p>
                </td>
              </tr>
            ) : (
              filteredSuppliers.map((supplier) => (
                <tr key={supplier.id} className="group hover:bg-gray-50 cursor-pointer" onClick={() => setPeekSupplier(supplier)}>
                  {visibleColumnDefs.map((col) => (
                    <td key={col.key} className="px-6 py-4 whitespace-nowrap overflow-hidden text-sm text-gray-600">
                      {col.render(supplier)}
                    </td>
                  ))}
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
            <PeekRow label="Industry / Main Activities" value={<IndustryTags value={supplier.industryMainActivities} />} />
            <PeekRow label="Supplier / Customer" value={supplier.contactType} />
            <PeekRow label="Date (Last Updated)" value={formatDate(supplier.notionLastEditedTime) || formatDate(supplier.updatedAt)} />
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
