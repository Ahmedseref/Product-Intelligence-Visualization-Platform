import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Edit2, RotateCcw, Plus, Trash2, CheckCircle, X, Printer } from 'lucide-react';
import { api } from '../../client/api';
import { ProformaData, ProformaItemData, ProformaSettingsData } from '../../types';

interface ProformaPreviewProps {
  proformaId: string;
  onBack: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

interface EditingCell {
  itemId: number;
  field: 'name' | 'description' | 'price' | 'quantity';
}

const ProformaPreview: React.FC<ProformaPreviewProps> = ({ proformaId, onBack }) => {
  const [proforma, setProforma] = useState<ProformaData | null>(null);
  const [settings, setSettings] = useState<ProformaSettingsData>({});
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pf, s] = await Promise.all([
        api.getProforma(proformaId),
        api.getProformaSettings(),
      ]);
      setProforma(pf);
      setSettings(s || {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [proformaId]);

  useEffect(() => { load(); }, [load]);

  const getDisplayValue = (item: ProformaItemData, field: 'name' | 'description' | 'price') => {
    if (field === 'name') return item.customName ?? item.productName ?? '';
    if (field === 'description') return item.customDescription ?? item.productDescription ?? '';
    if (field === 'price') return item.customPrice ?? item.productPrice ?? 0;
    return '';
  };

  const isOverridden = (item: ProformaItemData, field: string) => {
    if (field === 'name') return item.customName != null && item.customName !== '';
    if (field === 'description') return item.customDescription != null && item.customDescription !== '';
    if (field === 'price') return item.customPrice != null;
    if (field === 'quantity') return false;
    return false;
  };

  const startEdit = (itemId: number, field: EditingCell['field'], currentVal: any) => {
    setEditingCell({ itemId, field });
    setEditValue(String(currentVal));
  };

  const commitEdit = async (item: ProformaItemData) => {
    if (!editingCell) return;
    setSaving(item.id);
    try {
      let patch: any = {};
      if (editingCell.field === 'name') patch.customName = editValue;
      if (editingCell.field === 'description') patch.customDescription = editValue;
      if (editingCell.field === 'price') patch.customPrice = parseFloat(editValue) || null;
      if (editingCell.field === 'quantity') patch.quantity = parseFloat(editValue) || 1;

      await api.updateProformaItem(item.id, patch);
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(null);
      setEditingCell(null);
    }
  };

  const resetItem = async (item: ProformaItemData) => {
    setSaving(item.id);
    try {
      await api.updateProformaItem(item.id, {
        customName: null,
        customDescription: null,
        customPrice: null,
      });
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(null);
    }
  };

  const removeItem = async (itemId: number) => {
    try {
      await api.deleteProformaItem(itemId);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const updateStatus = async (status: string) => {
    if (!proforma) return;
    try {
      await api.updateProforma(proformaId, { status });
      setProforma(prev => prev ? { ...prev, status } : prev);
    } catch (e) {
      console.error(e);
    }
  };

  const EditableCell: React.FC<{
    item: ProformaItemData;
    field: EditingCell['field'];
    displayValue: any;
    isNum?: boolean;
  }> = ({ item, field, displayValue, isNum }) => {
    const isEditing = editingCell?.itemId === item.id && editingCell?.field === field;
    const overridden = isOverridden(item, field);
    const isSaving = saving === item.id;

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type={isNum ? 'number' : 'text'}
            step={isNum ? 'any' : undefined}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit(item);
              if (e.key === 'Escape') setEditingCell(null);
            }}
            className="w-full px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button onClick={() => commitEdit(item)} className="p-1 text-green-600 hover:text-green-700">
            <CheckCircle className="w-4 h-4" />
          </button>
          <button onClick={() => setEditingCell(null)} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      );
    }

    return (
      <div
        className={`group flex items-start gap-1 cursor-pointer rounded px-1 py-0.5 hover:bg-blue-50 transition-colors ${
          overridden ? 'ring-1 ring-amber-300 bg-amber-50/40 rounded' : ''
        }`}
        onClick={() => !isSaving && startEdit(item.id, field, displayValue)}
        title="Click to edit"
      >
        <span className={`flex-1 text-sm ${overridden ? 'text-amber-800' : 'text-slate-700'}`}>
          {isNum ? Number(displayValue).toLocaleString() : (displayValue || <span className="text-slate-300 italic">—</span>)}
        </span>
        <Edit2 className="w-3 h-3 text-slate-300 group-hover:text-blue-400 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-slate-400 text-sm">Loading proforma…</div>
      </div>
    );
  }

  if (!proforma) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p>Proforma not found.</p>
        <button onClick={onBack} className="mt-4 text-blue-600 hover:underline text-sm">Go back</button>
      </div>
    );
  }

  const items: ProformaItemData[] = proforma.items || [];
  const currency = proforma.currency || settings.defaultCurrency || 'USD';
  const grandTotal = items.reduce((sum, item) => {
    const price = item.customPrice ?? item.productPrice ?? 0;
    return sum + price * item.quantity;
  }, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to List
        </button>
        <div className="flex items-center gap-2">
          <select
            value={proforma.status || 'draft'}
            onChange={e => updateStatus(e.target.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border-0 focus:outline-none cursor-pointer ${STATUS_COLORS[proforma.status || 'draft']}`}
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {/* Invoice Document */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:rounded-none">
        {/* Document Header */}
        <div className="p-8 border-b border-slate-100">
          <div className="flex items-start justify-between">
            {/* Company Info */}
            <div className="flex items-start gap-4">
              {settings.companyLogo && (
                <img src={settings.companyLogo} alt="Logo" className="h-14 w-auto object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
              <div>
                <h1 className="text-lg font-bold text-slate-800">{settings.companyName || 'Your Company'}</h1>
                {settings.address && <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">{settings.address}</p>}
                {settings.phone && <p className="text-xs text-slate-500">{settings.phone}</p>}
                {settings.email && <p className="text-xs text-slate-500">{settings.email}</p>}
              </div>
            </div>
            {/* Invoice Meta */}
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">PROFORMA INVOICE</div>
              <div className="text-sm font-mono font-semibold text-slate-700 mt-1">{proforma.proformaId}</div>
              <div className="text-xs text-slate-400 mt-1">
                {proforma.date ? new Date(proforma.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Bill To */}
        <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50">
          <div className="grid grid-cols-3 gap-8">
            <div className="col-span-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Bill To</p>
              <p className="font-semibold text-slate-800">{proforma.customerName}</p>
              {proforma.customerCountry && <p className="text-sm text-slate-500">{proforma.customerCountry}</p>}
              {proforma.customerContact && <p className="text-sm text-slate-500">{proforma.customerContact}</p>}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Invoice Currency</p>
              <p className="text-lg font-bold text-slate-700">{currency}</p>
              {settings.paymentTerms && (
                <div className="mt-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Payment Terms</p>
                  <p className="text-xs text-slate-600">{settings.paymentTerms}</p>
                </div>
              )}
              {settings.deliveryTerms && (
                <div className="mt-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Delivery Terms</p>
                  <p className="text-xs text-slate-600">{settings.deliveryTerms}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="px-8 pt-3 pb-0 flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-amber-100 ring-1 ring-amber-300" />
            Overridden (differs from product database)
          </span>
          <span className="flex items-center gap-1.5">
            <Edit2 className="w-3 h-3" />
            Click any cell to edit inline
          </span>
        </div>

        {/* Items Table */}
        <div className="px-8 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="text-left py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider w-6">#</th>
                <th className="text-left py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Product</th>
                <th className="text-left py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                <th className="text-center py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider w-24">Qty</th>
                <th className="text-right py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider w-28">Unit Price</th>
                <th className="text-right py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider w-28">Total</th>
                <th className="w-16 print:hidden" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-sm">No products in this proforma</td>
                </tr>
              )}
              {items.map((item, idx) => {
                const displayName = String(getDisplayValue(item, 'name'));
                const displayDesc = String(getDisplayValue(item, 'description'));
                const displayPrice = Number(getDisplayValue(item, 'price'));
                const lineTotal = displayPrice * item.quantity;
                const hasOverride = ['name', 'description', 'price'].some(f => isOverridden(item, f));
                const isSav = saving === item.id;

                return (
                  <tr key={item.id} className={`${isSav ? 'opacity-60' : ''} hover:bg-slate-50/50 transition-colors`}>
                    <td className="py-3 text-xs text-slate-400 pr-2">{idx + 1}</td>
                    <td className="py-3 pr-4">
                      <EditableCell item={item} field="name" displayValue={displayName} />
                      {item.productStockCode && (
                        <div className="text-xs font-mono text-slate-400 px-1 mt-0.5">{item.productStockCode}</div>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <EditableCell item={item} field="description" displayValue={displayDesc} />
                    </td>
                    <td className="py-3 text-center">
                      <EditableCell item={item} field="quantity" displayValue={item.quantity} isNum />
                    </td>
                    <td className="py-3 text-right">
                      <EditableCell item={item} field="price" displayValue={displayPrice} isNum />
                    </td>
                    <td className="py-3 text-right font-semibold text-slate-800">
                      {currency} {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 pl-2 print:hidden">
                      <div className="flex items-center gap-1 justify-end">
                        {hasOverride && (
                          <button
                            onClick={() => resetItem(item)}
                            title="Reset to original product data"
                            className="p-1 text-amber-500 hover:text-amber-700 transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200">
                <td colSpan={5} className="py-4 text-right font-semibold text-slate-600 pr-4">Grand Total</td>
                <td className="py-4 text-right text-xl font-bold text-slate-800">
                  {currency} {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="print:hidden" />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer sections */}
        <div className="px-8 pb-8 grid grid-cols-2 gap-8 border-t border-slate-100 pt-6">
          {settings.bankDetails && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Bank Details</p>
              <p className="text-xs text-slate-600 whitespace-pre-line font-mono leading-relaxed">{settings.bankDetails}</p>
            </div>
          )}
          {(settings.notes || proforma.notes) && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Notes</p>
              <p className="text-xs text-slate-500 whitespace-pre-line leading-relaxed">{proforma.notes || settings.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProformaPreview;
