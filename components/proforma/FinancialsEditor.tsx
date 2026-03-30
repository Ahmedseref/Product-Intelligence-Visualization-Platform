import React, { useState } from 'react';
import { Plus, Trash2, GripVertical, Percent, DollarSign } from 'lucide-react';
import { api } from '../../client/api';
import { ProformaFinancialData } from '../../types';

interface FinancialStep {
  id: number;
  name: string;
  type: 'add' | 'subtract';
  valueType: 'percentage' | 'fixed';
  value: number;
  computedAmount: number;
  runningTotal: number;
}

interface FinancialCalcResult {
  subtotal: number;
  steps: FinancialStep[];
  finalTotal: number;
}

function computeFinancials(subtotal: number, financials: ProformaFinancialData[]): FinancialCalcResult {
  const sorted = [...financials].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  let running = subtotal;
  const steps: FinancialStep[] = [];
  for (const fin of sorted) {
    const amount = fin.valueType === 'percentage' ? running * (fin.value / 100) : fin.value;
    const signed = fin.type === 'subtract' ? -amount : amount;
    running += signed;
    steps.push({
      id: fin.id,
      name: fin.name,
      type: fin.type,
      valueType: fin.valueType,
      value: fin.value,
      computedAmount: signed,
      runningTotal: running,
    });
  }
  return { subtotal, steps, finalTotal: running };
}

interface FinancialsEditorProps {
  proformaId: string;
  financials: ProformaFinancialData[];
  subtotal: number;
  currency: string;
  onChange: (updated: ProformaFinancialData[]) => void;
}

const FinancialsEditor: React.FC<FinancialsEditorProps> = ({ proformaId, financials, subtotal, currency, onChange }) => {
  const [saving, setSaving] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ProformaFinancialData>>({});

  const calc = computeFinancials(subtotal, financials);

  const handleAdd = async () => {
    setAdding(true);
    try {
      const created = await api.createProformaFinancial(proformaId, {
        name: 'New Calculation',
        type: 'add',
        valueType: 'fixed',
        value: 0,
      });
      onChange([...financials, created]);
      setEditingId(created.id);
      setEditDraft({ name: created.name, type: created.type, valueType: created.valueType, value: created.value });
    } catch (e: any) {
      console.error('Failed to add financial:', e);
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (fin: ProformaFinancialData) => {
    setEditingId(fin.id);
    setEditDraft({ name: fin.name, type: fin.type, valueType: fin.valueType, value: fin.value });
  };

  const cancelEdit = () => { setEditingId(null); setEditDraft({}); };

  const saveEdit = async (fin: ProformaFinancialData) => {
    setSaving(fin.id);
    try {
      const updated = await api.updateProformaFinancial(fin.id, editDraft);
      onChange(financials.map(f => f.id === fin.id ? { ...f, ...updated } : f));
      setEditingId(null);
    } catch (e: any) {
      console.error('Failed to save financial:', e);
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (id: number) => {
    setSaving(id);
    try {
      await api.deleteProformaFinancial(id);
      onChange(financials.filter(f => f.id !== id));
      if (editingId === id) setEditingId(null);
    } catch (e: any) {
      console.error('Failed to delete financial:', e);
    } finally {
      setSaving(null);
    }
  };

  const fmt = (n: number) => Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-3">
      {/* Financial rows */}
      {financials.length > 0 && (
        <div className="space-y-2">
          {financials
            .slice()
            .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
            .map(fin => {
              const isEditing = editingId === fin.id;
              const isSaving = saving === fin.id;
              return (
                <div key={fin.id} className={`rounded-lg border transition-colors ${isEditing ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  {isEditing ? (
                    <div className="p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <input
                            autoFocus
                            type="text"
                            value={editDraft.name ?? ''}
                            onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                            placeholder="e.g. Discount, VAT, Shipping"
                            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                          />
                        </div>
                        <div className="flex rounded-lg overflow-hidden border border-slate-200">
                          <button
                            onClick={() => setEditDraft(d => ({ ...d, type: 'add' }))}
                            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${editDraft.type === 'add' ? 'bg-green-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                          >
                            + Add
                          </button>
                          <button
                            onClick={() => setEditDraft(d => ({ ...d, type: 'subtract' }))}
                            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${editDraft.type === 'subtract' ? 'bg-red-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                          >
                            − Subtract
                          </button>
                        </div>
                        <div className="flex rounded-lg overflow-hidden border border-slate-200">
                          <button
                            onClick={() => setEditDraft(d => ({ ...d, valueType: 'percentage' }))}
                            className={`flex-1 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${editDraft.valueType === 'percentage' ? 'bg-blue-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                          >
                            <Percent className="w-3 h-3" /> %
                          </button>
                          <button
                            onClick={() => setEditDraft(d => ({ ...d, valueType: 'fixed' }))}
                            className={`flex-1 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${editDraft.valueType === 'fixed' ? 'bg-blue-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                          >
                            <DollarSign className="w-3 h-3" /> Fixed
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={editDraft.value ?? 0}
                            onChange={e => setEditDraft(d => ({ ...d, value: parseFloat(e.target.value) || 0 }))}
                            className="w-full pl-3 pr-10 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                            {editDraft.valueType === 'percentage' ? '%' : currency}
                          </span>
                        </div>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveEdit(fin)}
                          disabled={isSaving}
                          className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                        >
                          {isSaving ? '…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => !isSaving && startEdit(fin)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left group"
                      disabled={isSaving}
                    >
                      <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-slate-700 font-medium">{fin.name}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          {fin.type === 'add' ? '+' : '−'} {fin.valueType === 'percentage' ? `${fin.value}%` : `${currency} ${fin.value}`}
                        </span>
                      </div>
                      <span className={`text-sm font-semibold flex-shrink-0 ${fin.type === 'subtract' ? 'text-red-600' : 'text-green-600'}`}>
                        {fin.type === 'subtract' ? '−' : '+'} {currency} {fmt(fin.valueType === 'percentage' ? 0 : fin.value)}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(fin.id); }}
                        className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}

      <button
        onClick={handleAdd}
        disabled={adding}
        className="w-full flex items-center justify-center gap-2 py-2 text-sm text-blue-600 border border-dashed border-blue-300 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-60"
      >
        <Plus className="w-4 h-4" /> {adding ? 'Adding…' : 'Add Calculation'}
      </button>

      {/* Live Calculation Preview */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Calculation Preview</p>
        <div className="flex justify-between items-center py-1 border-b border-slate-200">
          <span className="text-sm text-slate-600">Subtotal</span>
          <span className="text-sm font-semibold text-slate-800">{currency} {calc.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        {calc.steps.map((step) => (
          <div key={step.id} className="flex justify-between items-center py-0.5">
            <span className="text-xs text-slate-500">
              {step.type === 'subtract' ? '−' : '+'} {step.name}
              {step.valueType === 'percentage' && <span className="ml-1 text-slate-400">({step.value}%)</span>}
            </span>
            <span className={`text-xs font-medium ${step.computedAmount < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {step.computedAmount < 0 ? '−' : '+'} {currency} {fmt(step.computedAmount)}
            </span>
          </div>
        ))}
        <div className="flex justify-between items-center pt-2 border-t-2 border-slate-300">
          <span className="text-sm font-bold text-slate-700">Final Total</span>
          <span className="text-base font-bold text-slate-900">{currency} {calc.finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>
  );
};

export default FinancialsEditor;
export { computeFinancials };
