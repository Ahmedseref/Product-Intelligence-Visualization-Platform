import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, X, Check, ChevronDown, ChevronUp, User, Users } from 'lucide-react';
import { api } from '../../client/api';
import { CustomerData, CustomerFieldData } from '../../types';

const CustomerManager: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editFields, setEditFields] = useState<Array<{ fieldName: string; fieldValue: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFields, setNewFields] = useState<Array<{ fieldName: string; fieldValue: string }>>([{ fieldName: '', fieldValue: '' }]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getCustomers();
      const withFields = await Promise.all(list.map(c => api.getCustomer(c.id)));
      setCustomers(withFields);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (customer: CustomerData) => {
    setEditingId(customer.id);
    setEditName(customer.name);
    setEditFields(
      customer.fields && customer.fields.length > 0
        ? customer.fields.map(f => ({ fieldName: f.fieldName, fieldValue: f.fieldValue || '' }))
        : [{ fieldName: '', fieldValue: '' }]
    );
  };

  const cancelEdit = () => { setEditingId(null); setEditName(''); setEditFields([]); };

  const saveEdit = async (id: number) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const fields = editFields.filter(f => f.fieldName.trim()).map((f, idx) => ({
        fieldName: f.fieldName.trim(),
        fieldValue: f.fieldValue.trim(),
        sortOrder: idx,
      }));
      const updated = await api.updateCustomer(id, { name: editName.trim(), fields });
      setCustomers(prev => prev.map(c => c.id === id ? updated : c));
      setEditingId(null);
    } catch (e: any) { alert(e.message || 'Failed to update'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete customer "${name}"? This cannot be undone.`)) return;
    try {
      await api.deleteCustomer(id);
      setCustomers(prev => prev.filter(c => c.id !== id));
    } catch (e: any) { alert(e.message || 'Failed to delete'); }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const fields = newFields.filter(f => f.fieldName.trim()).map((f, idx) => ({
        fieldName: f.fieldName.trim(),
        fieldValue: f.fieldValue.trim(),
        sortOrder: idx,
      }));
      const created = await api.createCustomer({ name: newName.trim(), fields });
      setCustomers(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setShowCreate(false);
      setNewName('');
      setNewFields([{ fieldName: '', fieldValue: '' }]);
    } catch (e: any) { alert(e.message || 'Failed to create'); }
    finally { setCreating(false); }
  };

  const addEditField = () => setEditFields(prev => [...prev, { fieldName: '', fieldValue: '' }]);
  const removeEditField = (idx: number) => setEditFields(prev => prev.filter((_, i) => i !== idx));
  const updateEditField = (idx: number, key: 'fieldName' | 'fieldValue', val: string) =>
    setEditFields(prev => prev.map((f, i) => i === idx ? { ...f, [key]: val } : f));

  const addNewField = () => setNewFields(prev => [...prev, { fieldName: '', fieldValue: '' }]);
  const removeNewField = (idx: number) => setNewFields(prev => prev.filter((_, i) => i !== idx));
  const updateNewField = (idx: number, key: 'fieldName' | 'fieldValue', val: string) =>
    setNewFields(prev => prev.map((f, i) => i === idx ? { ...f, [key]: val } : f));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-700">Customer Database</h2>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{customers.length}</span>
        </div>
        <button
          onClick={() => { setShowCreate(true); setNewName(''); setNewFields([{ fieldName: '', fieldValue: '' }]); }}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Customer
        </button>
      </div>

      {/* Create panel */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">New Customer</h3>
            <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Name *</label>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Customer or company name"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-500">Custom Fields</label>
              <button onClick={addNewField} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                <Plus className="w-3 h-3" /> Add Field
              </button>
            </div>
            <div className="space-y-2">
              {newFields.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={f.fieldName}
                    onChange={e => updateNewField(idx, 'fieldName', e.target.value)}
                    placeholder="Field name (e.g. VAT Number, Address)"
                    className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                  <input
                    type="text"
                    value={f.fieldValue}
                    onChange={e => updateNewField(idx, 'fieldValue', e.target.value)}
                    placeholder="Value"
                    className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                  <button onClick={() => removeNewField(idx)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {creating ? 'Creating…' : 'Create Customer'}
            </button>
          </div>
        </div>
      )}

      {/* Customer list */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading customers…</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-slate-500">No customers yet</p>
          <p className="text-sm mt-1">Create your first customer to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map(customer => {
            const isEditing = editingId === customer.id;
            const isExpanded = expandedId === customer.id;
            const fields: CustomerFieldData[] = customer.fields || [];

            return (
              <div key={customer.id} className={`bg-white rounded-xl border transition-colors ${isEditing ? 'border-blue-300' : 'border-slate-200 hover:border-slate-300'} shadow-sm overflow-hidden`}>
                {isEditing ? (
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Customer Name</label>
                      <input
                        autoFocus
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-medium text-slate-500">Custom Fields</label>
                        <button onClick={addEditField} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                          <Plus className="w-3 h-3" /> Add Field
                        </button>
                      </div>
                      <div className="space-y-2">
                        {editFields.map((f, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={f.fieldName}
                              onChange={e => updateEditField(idx, 'fieldName', e.target.value)}
                              placeholder="Field name"
                              className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                            />
                            <input
                              type="text"
                              value={f.fieldValue}
                              onChange={e => updateEditField(idx, 'fieldValue', e.target.value)}
                              placeholder="Value"
                              className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                            />
                            <button onClick={() => removeEditField(idx)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={cancelEdit} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(customer.id)}
                        disabled={saving}
                        className="px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                      >
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-3 px-5 py-4">
                      <div className="p-2 bg-slate-100 rounded-lg flex-shrink-0">
                        <User className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800">{customer.name}</p>
                        <p className="text-xs text-slate-400">
                          {fields.length > 0 ? `${fields.length} field${fields.length !== 1 ? 's' : ''}` : 'No custom fields'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {fields.length > 0 && (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : customer.id)}
                            className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(customer)}
                          className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                          title="Edit customer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(customer.id, customer.name)}
                          className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                          title="Delete customer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {isExpanded && fields.length > 0 && (
                      <div className="border-t border-slate-100 px-5 py-3 bg-slate-50/50">
                        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                          {fields.map((f, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <span className="text-xs text-slate-400 min-w-[90px] flex-shrink-0">{f.fieldName}</span>
                              <span className="text-xs text-slate-600 font-medium">{f.fieldValue || '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CustomerManager;
