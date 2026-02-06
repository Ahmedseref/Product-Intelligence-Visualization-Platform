import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Check, X, AlertCircle, Tag, Palette, RefreshCw, ArrowRightLeft } from 'lucide-react';
import BackupManager from './settings/BackupManager';
import { api } from '../client/api';

interface SettingsProps {
  usageAreas: string[];
  onUpdateUsageAreas: (areas: string[]) => void;
  onRenameUsageArea?: (oldName: string, newName: string) => void;
  colors: any[];
  onColorsChange: (colors: any[]) => void;
}

const Settings: React.FC<SettingsProps> = ({ usageAreas, onUpdateUsageAreas, onRenameUsageArea, colors, onColorsChange }) => {
  const [newArea, setNewArea] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

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
    } catch (err: any) {
      setColorError(err.message || 'Failed to create color');
    }
  };

  const handleColorEditStart = (color: any) => {
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

  const handleColorEditCancel = () => {
    setEditingColorId(null);
    setEditColorName('');
    setEditColorCode('');
    setEditColorHex('');
  };

  const handleColorDelete = async (id: number) => {
    setColorError('');
    try {
      await api.deleteColor(id);
      onColorsChange(colors.filter(c => c.id !== id));
      setDeleteColorConfirm(null);
    } catch (err: any) {
      setColorError(err.message || 'Failed to delete color');
    }
  };

  const handleMigrateBranchCodes = async () => {
    setMigrateLoading(true);
    setMigrateResult(null);
    try {
      const result = await api.migrateExistingBranchCodes();
      setMigrateResult(`Successfully migrated ${result.migrated} branch codes.`);
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
    } catch (err: any) {
      setRegenerateResult(`Error: ${err.message}`);
    } finally {
      setRegenerateLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Manage system configuration and options</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-xl">
              <Tag className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Usage Areas</h2>
              <p className="text-sm text-slate-500">Manage the usage areas available for products</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="flex gap-3 mb-6">
            <input
              type="text"
              value={newArea}
              onChange={e => setNewArea(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddArea()}
              placeholder="Enter new usage area..."
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <button
              onClick={handleAddArea}
              disabled={!newArea.trim() || usageAreas.includes(newArea.trim())}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>

          {usageAreas.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Tag className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No usage areas defined yet.</p>
              <p className="text-sm mt-1">Add your first usage area above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {usageAreas.map((area, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                    deleteConfirm === index 
                      ? 'bg-red-50 border-red-200' 
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
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
                      <span className="font-medium text-slate-700">{area}</span>
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

          <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-sm text-blue-700">
              <strong>Tip:</strong> Usage areas are used in the Product Usage Density Matrix visualization and can be assigned to products in the product form or during bulk import.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-xl">
              <Palette className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Color Management</h2>
              <p className="text-sm text-slate-500">Manage colors used in the stock code system</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {colorError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {colorError}
            </div>
          )}

          <div className="flex gap-3 mb-6">
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
                      <button
                        onClick={handleColorEditSave}
                        className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleColorEditCancel}
                        className="p-2 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors"
                      >
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
                        <button
                          onClick={() => handleColorDelete(color.id)}
                          className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeleteColorConfirm(null)}
                          className="px-3 py-1.5 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-6 h-6 rounded-md border border-slate-300"
                          style={{ backgroundColor: color.hexValue || '#cccccc' }}
                        />
                        <span className="font-medium text-slate-700">{color.name}</span>
                        <span className="text-sm text-slate-400 font-mono">{color.code}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleColorEditStart(color)}
                          className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteColorConfirm(color.id)}
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

          <div className="mt-6 p-4 bg-purple-50 border border-purple-100 rounded-xl">
            <p className="text-sm text-purple-700">
              <strong>Tip:</strong> Colors are used in the stock code system. Each color has a numeric code that becomes part of the product stock code.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
        <BackupManager />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl">
              <RefreshCw className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Stock Code System</h2>
              <p className="text-sm text-slate-500">Manage stock code generation and migration</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleMigrateBranchCodes}
              disabled={migrateLoading}
              className="px-6 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <ArrowRightLeft className="w-4 h-4" />
              {migrateLoading ? 'Migrating...' : 'Migrate Branch Codes'}
            </button>
            <button
              onClick={handleBulkRegenerate}
              disabled={regenerateLoading}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              {regenerateLoading ? 'Regenerating...' : 'Regenerate All Stock Codes'}
            </button>
          </div>

          {migrateResult && (
            <div className={`p-3 rounded-xl text-sm ${migrateResult.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
              {migrateResult}
            </div>
          )}

          {regenerateResult && (
            <div className={`p-3 rounded-xl text-sm ${regenerateResult.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
              {regenerateResult}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
