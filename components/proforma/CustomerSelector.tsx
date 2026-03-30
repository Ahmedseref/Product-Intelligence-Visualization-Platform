import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, X, Trash2, Edit2, Check, User, ChevronDown } from 'lucide-react';
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

interface DropdownPos {
  top: number;
  left: number;
  width: number;
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
  const [dropdownPos, setDropdownPos] = useState<DropdownPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadCustomers = useCallback(() => {
    api.getCustomers()
      .then(list => setCustomers(list))
      .catch(e => console.error('Failed to load customers:', e));
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
    setOpen(true);
    setMode('select');
    setSearch('');
  };

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setMode('select');
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        closeDropdown();
      }
    };
    const handleScroll = () => closeDropdown();
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, closeDropdown]);

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
  const updateDraftField = (idx: number, key: 'fieldName' | 'fieldValue', val: string) =>
    setDraftFields(prev => prev.map((f, i) => i === idx ? { ...f, [key]: val } : f));

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
      closeDropdown();
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
      closeDropdown();
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
    try {
      const full = await api.getCustomer(c.id);
      onSelect(full);
    } catch {
      onSelect(c);
    }
    closeDropdown();
  };

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
  };

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={open ? closeDropdown : openDropdown}
        className="w-full flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white text-left hover:border-slate-300 transition-colors"
      >
        <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className={`flex-1 truncate ${selectedCustomer ? 'text-slate-800' : 'text-slate-400'}`}>
          {selectedCustomer ? selectedCustomer.name : 'Select or create customer…'}
        </span>
        {selectedCustomer && (
          <span
            role="button"
            onClick={clearSelection}
            className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Fixed-position dropdown portal */}
      {open && dropdownPos && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 9999,
            maxHeight: '70vh',
          }}
          className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col"
        >
          {mode === 'select' && (
            <>
              <div className="p-2 border-b border-slate-100 flex-shrink-0">
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
                  {search && (
                    <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-y-auto flex-1">
                <button
                  onClick={startCreate}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors font-medium border-b border-slate-100"
                >
                  <Plus className="w-4 h-4" /> New Customer
                </button>
                {customers.length === 0 && (
                  <div className="px-4 py-4 text-sm text-slate-400 text-center">
                    No customers yet — create your first one
                  </div>
                )}
                {customers.length > 0 && filtered.length === 0 && (
                  <div className="px-4 py-3 text-sm text-slate-400">No customers match "{search}"</div>
                )}
                {filtered.map(c => (
                  <div key={c.id} className="flex items-center gap-1 hover:bg-slate-50 transition-colors group">
                    <button
                      onClick={() => selectCustomer(c)}
                      className="flex-1 flex items-center gap-2 px-4 py-2.5 text-sm text-left"
                    >
                      <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="text-slate-700 flex-1 truncate">{c.name}</span>
                      {selectedCustomer?.id === c.id && <Check className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
                    </button>
                    <button
                      onClick={e => startEdit(c, e)}
                      className="p-2 text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => handleDelete(c, e)}
                      className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all mr-1"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {(mode === 'create' || mode === 'edit') && (
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-semibold text-slate-700">
                  {mode === 'create' ? 'New Customer' : 'Edit Customer'}
                </h4>
                <button onClick={() => { setMode('select'); setError(null); }} className="text-slate-400 hover:text-slate-600">
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
                  onKeyDown={e => { if (e.key === 'Enter') mode === 'create' ? handleCreate() : handleEdit(); }}
                  placeholder="Company or person name"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-500">Custom Fields</label>
                  <button onClick={addDraftField} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                    <Plus className="w-3 h-3" /> Add Field
                  </button>
                </div>
                <div className="space-y-2">
                  {draftFields.map((field, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={field.fieldName}
                        onChange={e => updateDraftField(idx, 'fieldName', e.target.value)}
                        placeholder="Name (e.g. VAT No.)"
                        className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                      <input
                        type="text"
                        value={field.fieldValue}
                        onChange={e => updateDraftField(idx, 'fieldValue', e.target.value)}
                        placeholder="Value"
                        className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                      <button onClick={() => removeDraftField(idx)} className="p-1 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setMode('select'); setError(null); }}
                  className="flex-1 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={mode === 'create' ? handleCreate : handleEdit}
                  disabled={saving || !newName.trim()}
                  className="flex-1 px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {saving ? 'Saving…' : mode === 'create' ? 'Create Customer' : 'Save Changes'}
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
              <span className="text-slate-400 min-w-[100px]">{f.fieldName}:</span>
              <span className="text-slate-600">{f.fieldValue || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomerSelector;
