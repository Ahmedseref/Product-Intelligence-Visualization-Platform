import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Edit2, Trash2, Check, X, AlertCircle, Tag, Hash, Archive, Settings as SettingsIcon, ChevronRight, Ruler, GripVertical, Eye, EyeOff, Columns, RotateCcw } from 'lucide-react';
import BackupManager from './settings/BackupManager';
import StockCodeManager from './settings/StockCodeManager';

export interface InventoryColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  order: number;
}

interface SettingsProps {
  usageAreas: string[];
  onUpdateUsageAreas: (areas: string[]) => void;
  onRenameUsageArea?: (oldName: string, newName: string) => void;
  units?: string[];
  onUpdateUnits?: (units: string[]) => void;
  colors: any[];
  onColorsChange: (colors: any[]) => void;
  onDataRefreshNeeded?: () => void;
  inventoryColumns?: InventoryColumnConfig[];
  onUpdateInventoryColumns?: (columns: InventoryColumnConfig[]) => void;
}

type SettingsSection = 'usage-areas' | 'units' | 'stock-codes' | 'backups' | 'inventory-columns';

const NAV_ITEMS: { id: SettingsSection; label: string; description: string; icon: React.ReactNode; color: string; bgColor: string }[] = [
  { 
    id: 'usage-areas', 
    label: 'Usage Areas', 
    description: 'Product usage classifications',
    icon: <Tag className="w-5 h-5" />, 
    color: 'text-blue-600',
    bgColor: 'bg-blue-50'
  },
  { 
    id: 'units', 
    label: 'Units', 
    description: 'Measurement & packing units',
    icon: <Ruler className="w-5 h-5" />, 
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50'
  },
  { 
    id: 'stock-codes', 
    label: 'Stock Codes', 
    description: 'Branch codes & generation',
    icon: <Hash className="w-5 h-5" />, 
    color: 'text-amber-600',
    bgColor: 'bg-amber-50'
  },
  { 
    id: 'inventory-columns', 
    label: 'Inventory Columns', 
    description: 'Column visibility & order',
    icon: <Columns className="w-5 h-5" />, 
    color: 'text-violet-600',
    bgColor: 'bg-violet-50'
  },
  { 
    id: 'backups', 
    label: 'Backups', 
    description: 'Data protection & recovery',
    icon: <Archive className="w-5 h-5" />, 
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50'
  },
];

const DEFAULT_COLUMNS: InventoryColumnConfig[] = [
  { key: 'stockCode', label: 'Stock Code', visible: true, order: 0 },
  { key: 'name', label: 'Product Name', visible: true, order: 1 },
  { key: 'supplier', label: 'Supplier', visible: true, order: 2 },
  { key: 'taxonomyPath', label: 'Taxonomy Path', visible: true, order: 3 },
  { key: 'price', label: 'Price', visible: true, order: 4 },
  { key: 'usageAreas', label: 'Usage Areas', visible: true, order: 5 },
  { key: 'id', label: 'ID', visible: false, order: 6 },
  { key: 'sector', label: 'Sector', visible: false, order: 7 },
  { key: 'category', label: 'Category', visible: false, order: 8 },
  { key: 'subCategory', label: 'Sub-Category', visible: false, order: 9 },
  { key: 'currency', label: 'Currency', visible: false, order: 10 },
  { key: 'unit', label: 'Unit', visible: false, order: 11 },
  { key: 'moq', label: 'MOQ', visible: false, order: 12 },
  { key: 'leadTime', label: 'Lead Time', visible: false, order: 13 },
  { key: 'manufacturer', label: 'Manufacturer', visible: false, order: 14 },
  { key: 'location', label: 'Location', visible: false, order: 15 },
  { key: 'description', label: 'Description', visible: false, order: 16 },
  { key: 'dateAdded', label: 'Date Added', visible: false, order: 17 },
  { key: 'lastUpdated', label: 'Last Updated', visible: false, order: 18 },
];

const Settings: React.FC<SettingsProps> = ({ usageAreas, onUpdateUsageAreas, onRenameUsageArea, units = [], onUpdateUnits, colors, onColorsChange, onDataRefreshNeeded, inventoryColumns, onUpdateInventoryColumns }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('usage-areas');
  const [newArea, setNewArea] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [newUnit, setNewUnit] = useState('');
  const [editingUnitIndex, setEditingUnitIndex] = useState<number | null>(null);
  const [editUnitValue, setEditUnitValue] = useState('');
  const [deleteUnitConfirm, setDeleteUnitConfirm] = useState<number | null>(null);

  const [localColumns, setLocalColumns] = useState<InventoryColumnConfig[]>(
    inventoryColumns && inventoryColumns.length > 0 ? [...inventoryColumns].sort((a, b) => a.order - b.order) : [...DEFAULT_COLUMNS]
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [columnsSaving, setColumnsSaving] = useState(false);

  useEffect(() => {
    if (inventoryColumns && inventoryColumns.length > 0) {
      setLocalColumns([...inventoryColumns].sort((a, b) => a.order - b.order));
    }
  }, [inventoryColumns]);

  const saveColumns = useCallback(async (cols: InventoryColumnConfig[]) => {
    if (!onUpdateInventoryColumns) return;
    setColumnsSaving(true);
    try {
      const withOrder = cols.map((c, i) => ({ ...c, order: i }));
      onUpdateInventoryColumns(withOrder);
    } finally {
      setTimeout(() => setColumnsSaving(false), 500);
    }
  }, [onUpdateInventoryColumns]);

  const handleToggleColumnVisibility = (key: string) => {
    const updated = localColumns.map(c => c.key === key ? { ...c, visible: !c.visible } : c);
    setLocalColumns(updated);
    saveColumns(updated);
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const updated = [...localColumns];
      const [dragged] = updated.splice(dragIndex, 1);
      updated.splice(dragOverIndex, 0, dragged);
      const reordered = updated.map((c, i) => ({ ...c, order: i }));
      setLocalColumns(reordered);
      saveColumns(reordered);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleResetColumns = () => {
    const reset = [...DEFAULT_COLUMNS];
    setLocalColumns(reset);
    saveColumns(reset);
  };

  const handleShowAll = () => {
    const updated = localColumns.map(c => ({ ...c, visible: true }));
    setLocalColumns(updated);
    saveColumns(updated);
  };

  const handleShowDefaults = () => {
    const defaultVisibleKeys = DEFAULT_COLUMNS.filter(c => c.visible).map(c => c.key);
    const updated = localColumns.map(c => ({ ...c, visible: defaultVisibleKeys.includes(c.key) }));
    setLocalColumns(updated);
    saveColumns(updated);
  };

  const handleAddArea = () => {
    const trimmed = newArea.trim();
    if (trimmed && !usageAreas.includes(trimmed)) {
      onUpdateUsageAreas([...usageAreas, trimmed]);
      setNewArea('');
    }
  };

  const handleEditStart = (index: number) => {
    setEditingIndex(index);
    setEditValue(usageAreas[index]);
  };

  const handleEditSave = () => {
    if (editingIndex === null) return;
    const trimmed = editValue.trim();
    const oldName = usageAreas[editingIndex];
    if (trimmed && trimmed !== oldName && !usageAreas.filter((_, i) => i !== editingIndex).includes(trimmed)) {
      const updated = [...usageAreas];
      updated[editingIndex] = trimmed;
      onUpdateUsageAreas(updated);
      if (onRenameUsageArea) {
        onRenameUsageArea(oldName, trimmed);
      }
    }
    setEditingIndex(null);
    setEditValue('');
  };

  const handleEditCancel = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  const handleDelete = (index: number) => {
    const updated = usageAreas.filter((_, i) => i !== index);
    onUpdateUsageAreas(updated);
    setDeleteConfirm(null);
  };

  const renderUsageAreas = () => (
    <div className="space-y-6">
      <div className="flex gap-3">
        <input
          type="text"
          value={newArea}
          onChange={e => setNewArea(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddArea()}
          placeholder="Enter new usage area..."
          className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
        />
        <button
          onClick={handleAddArea}
          disabled={!newArea.trim() || usageAreas.includes(newArea.trim())}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {usageAreas.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Tag className="w-8 h-8 text-slate-300" />
          </div>
          <p className="font-medium text-slate-500">No usage areas defined yet</p>
          <p className="text-sm mt-1">Add your first usage area using the input above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {usageAreas.map((area, index) => (
            <div
              key={index}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                deleteConfirm === index 
                  ? 'bg-red-50 border-red-200 shadow-sm' 
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              {editingIndex === index ? (
                <div className="flex-1 flex items-center gap-3">
                  <input
                    type="text"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleEditSave();
                      if (e.key === 'Escape') handleEditCancel();
                    }}
                    autoFocus
                    className="flex-1 px-3 py-2 bg-white border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    onClick={handleEditSave}
                    className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleEditCancel}
                    className="p-2 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : deleteConfirm === index ? (
                <div className="flex-1 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Delete "{area}"?</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDelete(index)}
                      className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-3 py-1.5 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                    <span className="font-medium text-slate-700">{area}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditStart(index)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(index)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
        <p className="text-sm text-blue-700">
          <strong>Tip:</strong> Usage areas are used in the Product Usage Density Matrix visualization and can be assigned to products in the product form or during bulk import.
        </p>
      </div>
    </div>
  );

  const handleAddUnit = () => {
    const trimmed = newUnit.trim();
    if (trimmed && !units.includes(trimmed) && onUpdateUnits) {
      onUpdateUnits([...units, trimmed]);
      setNewUnit('');
    }
  };

  const handleEditUnitStart = (index: number) => {
    setEditingUnitIndex(index);
    setEditUnitValue(units[index]);
  };

  const handleEditUnitSave = () => {
    if (editingUnitIndex === null || !onUpdateUnits) return;
    const trimmed = editUnitValue.trim();
    if (trimmed && trimmed !== units[editingUnitIndex] && !units.filter((_, i) => i !== editingUnitIndex).includes(trimmed)) {
      const updated = [...units];
      updated[editingUnitIndex] = trimmed;
      onUpdateUnits(updated);
    }
    setEditingUnitIndex(null);
    setEditUnitValue('');
  };

  const handleEditUnitCancel = () => {
    setEditingUnitIndex(null);
    setEditUnitValue('');
  };

  const handleDeleteUnit = (index: number) => {
    if (!onUpdateUnits) return;
    const updated = units.filter((_, i) => i !== index);
    onUpdateUnits(updated);
    setDeleteUnitConfirm(null);
  };

  const renderUnits = () => (
    <div className="space-y-6">
      <div className="flex gap-3">
        <input
          type="text"
          value={newUnit}
          onChange={e => setNewUnit(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddUnit()}
          placeholder="Enter new unit (e.g., kg, m², piece)..."
          className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
        />
        <button
          onClick={handleAddUnit}
          disabled={!newUnit.trim() || units.includes(newUnit.trim())}
          className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {units.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Ruler className="w-8 h-8 text-slate-300" />
          </div>
          <p className="font-medium text-slate-500">No units defined yet</p>
          <p className="text-sm mt-1">Add your first unit using the input above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {units.map((unit, index) => (
            <div
              key={index}
              className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                deleteUnitConfirm === index 
                  ? 'bg-red-50 border-red-200 shadow-sm col-span-2' 
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              {editingUnitIndex === index ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={editUnitValue}
                    onChange={e => setEditUnitValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleEditUnitSave();
                      if (e.key === 'Escape') handleEditUnitCancel();
                    }}
                    autoFocus
                    className="flex-1 px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <button onClick={handleEditUnitSave} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={handleEditUnitCancel} className="p-1.5 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : deleteUnitConfirm === index ? (
                <div className="flex-1 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Delete "{unit}"?</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleDeleteUnit(index)} className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
                      Delete
                    </button>
                    <button onClick={() => setDeleteUnitConfirm(null)} className="px-3 py-1.5 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                    <span className="font-medium text-slate-700 text-sm">{unit}</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => handleEditUnitStart(index)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Edit">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteUnitConfirm(index)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
        <p className="text-sm text-emerald-700">
          <strong>Tip:</strong> Units are used in product forms, mass import, and inventory tables. Common units include measurement (m, m², ft), weight (kg, ton, lb), and packaging (piece, box, carton).
        </p>
      </div>
    </div>
  );

  const renderInventoryColumns = () => (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleShowAll}
          className="px-4 py-2 text-sm font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 transition-colors flex items-center gap-2"
        >
          <Eye className="w-4 h-4" />
          Show All
        </button>
        <button
          onClick={handleShowDefaults}
          className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-2"
        >
          <EyeOff className="w-4 h-4" />
          Defaults Only
        </button>
        <button
          onClick={handleResetColumns}
          className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Reset Order & Visibility
        </button>
        {columnsSaving && (
          <span className="px-3 py-2 text-xs font-medium text-green-600 bg-green-50 rounded-xl flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            Saved
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {localColumns.map((col, index) => (
          <div
            key={col.key}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-grab active:cursor-grabbing select-none ${
              dragIndex === index
                ? 'bg-violet-50 border-violet-300 shadow-md opacity-70 scale-[0.98]'
                : dragOverIndex === index
                ? 'bg-violet-50/50 border-violet-200 border-dashed'
                : col.visible
                ? 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                : 'bg-slate-50 border-slate-150 hover:border-slate-200'
            }`}
          >
            <div className="text-slate-300 hover:text-slate-500 transition-colors">
              <GripVertical className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${col.visible ? 'text-slate-800' : 'text-slate-400'}`}>
                  {col.label}
                </span>
                <span className="text-[10px] font-mono text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded">
                  {col.key}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium px-2 py-1 rounded-lg ${
                col.visible ? 'text-green-700 bg-green-50' : 'text-slate-400 bg-slate-100'
              }`}>
                #{index + 1}
              </span>
              <button
                onClick={() => handleToggleColumnVisibility(col.key)}
                className={`p-2 rounded-lg transition-all ${
                  col.visible
                    ? 'text-violet-600 bg-violet-50 hover:bg-violet-100'
                    : 'text-slate-300 bg-slate-100 hover:bg-slate-200 hover:text-slate-500'
                }`}
                title={col.visible ? 'Hide column' : 'Show column'}
              >
                {col.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-violet-50 border border-violet-100 rounded-xl">
        <p className="text-sm text-violet-700">
          <strong>Tip:</strong> Drag rows to reorder columns in the inventory table. Toggle the eye icon to show or hide columns. Changes are saved automatically and apply to the inventory table immediately.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl">
          <SettingsIcon className="w-6 h-6 text-slate-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
          <p className="text-sm text-slate-500">Manage system configuration and options</p>
        </div>
      </div>

      <div className="flex gap-6 min-h-[600px]">
        <nav className="w-64 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-4">
            <div className="p-2">
              {NAV_ITEMS.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all group mb-1 last:mb-0 ${
                      isActive
                        ? `${item.bgColor} shadow-sm`
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className={`p-2 rounded-lg transition-colors ${
                      isActive ? `${item.bgColor} ${item.color}` : 'bg-slate-100 text-slate-400 group-hover:text-slate-600'
                    }`}>
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold transition-colors ${
                        isActive ? 'text-slate-800' : 'text-slate-600 group-hover:text-slate-800'
                      }`}>
                        {item.label}
                      </div>
                      <div className={`text-xs truncate transition-colors ${
                        isActive ? 'text-slate-500' : 'text-slate-400'
                      }`}>
                        {item.description}
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-all ${
                      isActive ? `${item.color} opacity-100` : 'text-slate-300 opacity-0 group-hover:opacity-100'
                    }`} />
                  </button>
                );
              })}
            </div>

            <div className="mx-4 mb-4 mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-xs text-slate-400 leading-relaxed">
                Changes are saved automatically. Use Backups to protect your data.
              </p>
            </div>
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {activeSection === 'usage-areas' && (
              <>
                <div className="px-8 py-6 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 to-transparent">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-100 rounded-xl">
                      <Tag className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">Usage Areas</h2>
                      <p className="text-sm text-slate-500">Define and manage the usage areas available for products</p>
                    </div>
                    <div className="ml-auto">
                      <span className="text-xs font-medium bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full">
                        {usageAreas.length} area{usageAreas.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="p-8">
                  {renderUsageAreas()}
                </div>
              </>
            )}

            {activeSection === 'units' && (
              <>
                <div className="px-8 py-6 border-b border-slate-100 bg-gradient-to-r from-emerald-50/50 to-transparent">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-100 rounded-xl">
                      <Ruler className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">Units</h2>
                      <p className="text-sm text-slate-500">Define and manage measurement and packing units for products</p>
                    </div>
                    <div className="ml-auto">
                      <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full">
                        {units.length} unit{units.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="p-8">
                  {renderUnits()}
                </div>
              </>
            )}

            {activeSection === 'stock-codes' && (
              <StockCodeManager
                colors={colors}
                onColorsChange={onColorsChange}
                onDataRefreshNeeded={onDataRefreshNeeded}
              />
            )}

            {activeSection === 'inventory-columns' && (
              <>
                <div className="px-8 py-6 border-b border-slate-100 bg-gradient-to-r from-violet-50/50 to-transparent">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-violet-100 rounded-xl">
                      <Columns className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">Inventory Columns</h2>
                      <p className="text-sm text-slate-500">Configure which columns appear and their order in the inventory table</p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-xs font-medium bg-green-100 text-green-700 px-3 py-1.5 rounded-full">
                        {localColumns.filter(c => c.visible).length} visible
                      </span>
                      <span className="text-xs font-medium bg-slate-100 text-slate-500 px-3 py-1.5 rounded-full">
                        {localColumns.filter(c => !c.visible).length} hidden
                      </span>
                    </div>
                  </div>
                </div>
                <div className="p-8">
                  {renderInventoryColumns()}
                </div>
              </>
            )}

            {activeSection === 'backups' && (
              <>
                <div className="px-8 py-6 border-b border-slate-100 bg-gradient-to-r from-indigo-50/50 to-transparent">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-100 rounded-xl">
                      <Archive className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">Backup & Versioning</h2>
                      <p className="text-sm text-slate-500">Data protection with compression and point-in-time recovery</p>
                    </div>
                  </div>
                </div>
                <div className="p-8">
                  <BackupManager />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
