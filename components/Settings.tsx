import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Check, X, AlertCircle, Tag } from 'lucide-react';
import BackupManager from './settings/BackupManager';

interface SettingsProps {
  usageAreas: string[];
  onUpdateUsageAreas: (areas: string[]) => void;
  onRenameUsageArea?: (oldName: string, newName: string) => void;
}

const Settings: React.FC<SettingsProps> = ({ usageAreas, onUpdateUsageAreas, onRenameUsageArea }) => {
  const [newArea, setNewArea] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

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

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
        <BackupManager />
      </div>
    </div>
  );
};

export default Settings;
