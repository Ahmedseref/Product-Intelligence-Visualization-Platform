import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, ChevronDown, Trash2, Edit2, Check, User } from 'lucide-react';
import { api } from '../../client/api';
import { CustomerData, CustomerFieldData } from '../../types';

interface CustomerSelectorProps {
  selectedCustomer: CustomerData | null;
  onSelect: (customer: CustomerData | null) => void;
}

interface DraftField {
  fieldName: string;
  fieldValue: string;
}

const CustomerSelector: React.FC<CustomerSelectorProps> = ({ selectedCustomer, onSelect }) => {
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'select' | 'create' | 'edit'>('select');
  const [newName, setNewName] = useState('');
  const [draftFields, setDraftFields] = useState<DraftField[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getCustomers().then(setCustomers).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setMode('select');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const startCreate = () => {
    setMode('create');
    setNewName('');
    setDraftFields([{ fieldName: '', fieldValue: '' }]);
    setError(null);
  };

  const startEdit = (customer: CustomerData, e: React.MouseEvent) => {
    e.stopPropagation();
    setMode('edit');
    setNewName(customer.name);
    setDraftFields(
      customer.fields && customer.fields.length > 0
        ? customer.fields.map(f => ({ fieldName: f.fieldName, fieldValue: f.fieldValue || '' }))
        : [{ fieldName: '', fieldValue: '' }]
    );
    setError(null);
    onSelect(customer);
  };

  const addDraftField = () => setDraftFields(prev => [...prev, { fieldName: '', fieldValue: '' }]);
  const removeDraftField = (idx: number) => setDraftFields(prev => prev.filter((_, i) => i !== idx));
  const updateDraftField = (idx: number, key: 'fieldName' | 'fieldValue', val: string) => {
    setDraftFields(prev => prev.map((f, i) => i === idx ? { ...f, [key]: val } : f));
  };

  const handleCreate = async () => {
    if (!newName.trim()) { setError('Customer name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const fields = draftFields.filter(f => f.fieldName.trim()).map((f, idx) => ({
        fieldName: f.fieldName.trim(),
        fieldValue: f.fieldValue.trim(),
        sortOrder: idx,
      }));
      const created = await api.createCustomer({ name: newName.trim(), fields });
      setCustomers(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      onSelect(created);
      setMode('select');
      setOpen(false);
    } catch (e: any) {
      setError(e.message || 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedCustomer || !newName.trim()) { setError('Customer name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const fields = draftFields.filter(f => f.fieldName.trim()).map((f, idx) => ({
        fieldName: f.fieldName.trim(),
        fieldValue: f.fieldValue.trim(),
        sortOrder: idx,
      }));
      const updated = await api.updateCustomer(selectedCustomer.id, { name: newName.trim(), fields });
      setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
      onSelect(updated);
      setMode('select');
      setOpen(false);
    } catch (e: any) {
      setError(e.message || 'Failed to update customer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (customer: CustomerData, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete customer "${customer.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteCustomer(customer.id);
      setCustomers(prev => prev.filter(c => c.id !== customer.id));
      if (selectedCustomer?.id === customer.id) onSelect(null);
    } catch (e: any) {
      alert(e.message || 'Failed to delete customer');
    }
  };

  const selectCustomer = async (c: CustomerData) => {
    const full = await api.getCustomer(c.id);
    onSelect(full);
    setOpen(false);
    setMode('select');
    setSearch('');
  };

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setOpen(prev => !prev); setMode('select'); }}
        className="w-full flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white text-left hover:border-slate-300 transition-colors"
      >
        <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className={`flex-1 truncate ${selectedCustomer ? 'text-slate-800' : 'text-slate-400'}`}>
          {selectedCustomer ? selectedCustomer.name : 'Select or create customer…'}
        </span>
        {selectedCustomer && (
          <button onClick={clearSelection} className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30">
          {mode === 'select' && (
            <div>
              <div className="p-2 border-b border-slate-100">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-lg">
                  <Search className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    autoFocus
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search customers…"
                    className="flex-1 text-sm bg-transparent outline-none"
                  />
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto">
                <button
                  onClick={startCreate}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors font-medium"
                >
                  <Plus className="w-4 h-4" /> New Customer
                </button>
                {filtered.length === 0 && (
                  <div className="px-4 py-3 text-sm text-slate-400">No customers found</div>
                )}
                {filtered.map(c => (
                  <div key={c.id} className="flex items-center gap-1 hover:bg-slate-50 transition-colors group">
                    <button
                      onClick={() => selectCustomer(c)}
                      className="flex-1 flex items-center gap-2 px-4 py-2.5 text-sm text-left"
                    >
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-700">{c.name}</span>
                      {selectedCustomer?.id === c.id && <Check className="w-3.5 h-3.5 text-blue-500 ml-auto" />}
                    </button>
                    <button
                      onClick={e => startEdit(c, e)}
                      className="p-2 text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all"
                      title="Edit customer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => handleDelete(c, e)}
                      className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all mr-1"
                      title="Delete customer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(mode === 'create' || mode === 'edit') && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-semibold text-slate-700">
                  {mode === 'create' ? 'New Customer' : 'Edit Customer'}
                </h4>
                <button
                  onClick={() => { setMode('select'); setError(null); }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Customer Name *</label>
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Company or person name"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-500">Custom Fields</label>
                  <button
                    onClick={addDraftField}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="w-3 h-3" /> Add Field
                  </button>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {draftFields.map((field, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={field.fieldName}
                        onChange={e => updateDraftField(idx, 'fieldName', e.target.value)}
                        placeholder="Field name (e.g. VAT Number)"
                        className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                      <input
                        type="text"
                        value={field.fieldValue}
                        onChange={e => updateDraftField(idx, 'fieldValue', e.target.value)}
                        placeholder="Value"
                        className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                      <button
                        onClick={() => removeDraftField(idx)}
                        className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setMode('select'); setError(null); }}
                  className="flex-1 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={mode === 'create' ? handleCreate : handleEdit}
                  disabled={saving}
                  className="flex-1 px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selected customer fields preview */}
      {selectedCustomer && selectedCustomer.fields && selectedCustomer.fields.length > 0 && (
        <div className="mt-2 pl-1 space-y-1">
          {selectedCustomer.fields.map((f: CustomerFieldData, idx: number) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 min-w-[100px]">{f.fieldName}</span>
              <span className="text-slate-600">{f.fieldValue || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomerSelector;
