import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Check, X, AlertCircle, Tag, Hash, Archive, Settings as SettingsIcon, ChevronRight, Ruler } from 'lucide-react';
import BackupManager from './settings/BackupManager';
import StockCodeManager from './settings/StockCodeManager';

interface SettingsProps {
  usageAreas: string[];
  onUpdateUsageAreas: (areas: string[]) => void;
  onRenameUsageArea?: (oldName: string, newName: string) => void;
  units?: string[];
  onUpdateUnits?: (units: string[]) => void;
  colors: any[];
  onColorsChange: (colors: any[]) => void;
  onDataRefreshNeeded?: () => void;
}

type SettingsSection = 'usage-areas' | 'units' | 'stock-codes' | 'backups';

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
    id: 'backups', 
    label: 'Backups', 
    description: 'Data protection & recovery',
    icon: <Archive className="w-5 h-5" />, 
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50'
  },
];

const Settings: React.FC<SettingsProps> = ({ usageAreas, onUpdateUsageAreas, onRenameUsageArea, units = [], onUpdateUnits, colors, onColorsChange, onDataRefreshNeeded }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('usage-areas');
  const [newArea, setNewArea] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [newUnit, setNewUnit] = useState('');
  const [editingUnitIndex, setEditingUnitIndex] = useState<number | null>(null);
  const [editUnitValue, setEditUnitValue] = useState('');
  const [deleteUnitConfirm, setDeleteUnitConfirm] = useState<number | null>(null);

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
