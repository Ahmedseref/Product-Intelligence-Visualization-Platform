import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Edit2, RotateCcw, Plus, Trash2, CheckCircle, X, Printer, FileSpreadsheet, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../client/api';
import { ProformaData, ProformaItemData, ProformaSettingsData, ProformaFinancialData, CustomerFieldData } from '../../types';
import FinancialsEditor, { computeFinancials } from './FinancialsEditor';

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
  const [financials, setFinancials] = useState<ProformaFinancialData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState<number | null>(null);
  const [showFinancials, setShowFinancials] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pf, s] = await Promise.all([
        api.getProforma(proformaId),
        api.getProformaSettings(),
      ]);
      setProforma(pf);
      setSettings(s || {});
      setFinancials(pf.financials || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [proformaId]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (status: string) => {
    if (!proforma) return;
    try {
      const updated = await api.updateProforma(proformaId, { status });
      setProforma(prev => prev ? { ...prev, status } : null);
    } catch (e) { console.error(e); }
  };

  const getDisplayValue = (item: ProformaItemData, field: 'name' | 'description' | 'price') => {
    if (field === 'name') return item.customName ?? item.productName ?? '';
    if (field === 'description') return item.customDescription ?? item.productDescription ?? '';
    if (field === 'price') return item.customPrice ?? item.productPrice ?? 0;
    return '';
  };

  const isOverridden = (item: ProformaItemData, field: string) => {
    if (field === 'name') return item.customName != null;
    if (field === 'description') return item.customDescription != null;
    if (field === 'price') return item.customPrice != null;
    return false;
  };

  const startEdit = (itemId: number, field: EditingCell['field'], value: string | number) => {
    setEditingCell({ itemId, field });
    setEditValue(String(value));
  };

  const commitEdit = async () => {
    if (!editingCell || !proforma) return;
    const { itemId, field } = editingCell;
    const item = (proforma.items || []).find(i => i.id === itemId);
    if (!item) return;
    setSaving(itemId);
    try {
      let patch: Record<string, any> = {};
      if (field === 'name') patch = { customName: editValue };
      if (field === 'description') patch = { customDescription: editValue };
      if (field === 'price') patch = { customPrice: parseFloat(editValue) || 0 };
      if (field === 'quantity') patch = { quantity: parseFloat(editValue) || 1 };
      await api.updateProformaItem(itemId, patch);
      setProforma(prev => {
        if (!prev) return null;
        return { ...prev, items: (prev.items || []).map(i => i.id === itemId ? { ...i, ...patch } : i) };
      });
    } catch (e) { console.error(e); }
    setSaving(null);
    setEditingCell(null);
  };

  const resetItem = async (item: ProformaItemData) => {
    setSaving(item.id);
    try {
      await api.updateProformaItem(item.id, { customName: null, customDescription: null, customPrice: null });
      setProforma(prev => {
        if (!prev) return null;
        return { ...prev, items: (prev.items || []).map(i => i.id === item.id ? { ...i, customName: null, customDescription: null, customPrice: null } : i) };
      });
    } catch (e) { console.error(e); }
    setSaving(null);
  };

  const removeItem = async (itemId: number) => {
    setSaving(itemId);
    try {
      await api.deleteProformaItem(itemId);
      setProforma(prev => {
        if (!prev) return null;
        return { ...prev, items: (prev.items || []).filter(i => i.id !== itemId) };
      });
    } catch (e) { console.error(e); }
    setSaving(null);
  };

  const handleExcelExport = () => {
    setExportingExcel(true);
    api.exportProformaExcel(proformaId);
    setTimeout(() => setExportingExcel(false), 2000);
  };

  const EditableCell = ({
    item,
    field,
    displayValue,
    isNum = false,
  }: {
    item: ProformaItemData;
    field: EditingCell['field'];
    displayValue: string | number;
    isNum?: boolean;
  }) => {
    const isEditing = editingCell?.itemId === item.id && editingCell?.field === field;
    const isSaving = saving === item.id;
    const overridden = field !== 'quantity' && isOverridden(item, field);

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type={isNum ? 'number' : 'text'}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingCell(null); }}
            className="flex-1 px-2 py-1 text-sm border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-w-0"
          />
          <button onClick={commitEdit} className="p-1 text-green-500 hover:text-green-700">
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
        className={`group flex items-start gap-1 cursor-pointer rounded px-1 py-0.5 hover:bg-blue-50 transition-colors ${overridden ? 'ring-1 ring-amber-300 bg-amber-50/40 rounded' : ''}`}
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
  const customerFields: CustomerFieldData[] = proforma.customerFields || [];
  const currency = proforma.currency || settings.defaultCurrency || 'USD';
  const subtotal = items.reduce((sum, item) => {
    const price = item.customPrice ?? item.productPrice ?? 0;
    return sum + price * item.quantity;
  }, 0);
  const { steps: calcSteps, finalTotal } = computeFinancials(subtotal, financials);
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
            onClick={handleExcelExport}
            disabled={exportingExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 border border-green-200 bg-green-50 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-60"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> {exportingExcel ? 'Exporting…' : 'Export Excel'}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print / PDF
          </button>
        </div>
      </div>

      {/* Invoice Document */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:rounded-none">
        {/* Document Header */}
        <div className="p-8 border-b border-slate-100">
          <div className="flex items-start justify-between">
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
              {/* Dynamic customer fields */}
              {customerFields.filter(f =>
                f.fieldName.toLowerCase() !== 'country' && f.fieldName.toLowerCase() !== 'contact' && f.fieldName.toLowerCase() !== 'email'
              ).map((f, idx) => (
                <div key={idx} className="flex items-start gap-2 mt-1">
                  <span className="text-xs text-slate-400 min-w-[90px]">{f.fieldName}:</span>
                  <span className="text-xs text-slate-600">{f.fieldValue || '—'}</span>
                </div>
              ))}
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
        <div className="px-8 pt-3 pb-0 flex items-center gap-4 text-xs text-slate-400 print:hidden">
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
                      {currency} {fmt(lineTotal)}
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
              {/* Subtotal row */}
              <tr className="border-t-2 border-slate-200">
                <td colSpan={5} className="py-3 text-right text-sm text-slate-500 pr-4">Subtotal</td>
                <td className="py-3 text-right font-semibold text-slate-700">{currency} {fmt(subtotal)}</td>
                <td className="print:hidden" />
              </tr>
              {/* Financial calculation steps */}
              {calcSteps.map((step) => (
                <tr key={step.id} className="border-t border-dashed border-slate-100">
                  <td colSpan={5} className="py-1.5 text-right text-xs text-slate-500 pr-4">
                    <span className={`inline-flex items-center gap-1 ${step.computedAmount < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {step.computedAmount < 0 ? '−' : '+'} {step.name}
                      {step.valueType === 'percentage' && <span className="text-slate-400">({step.value}%)</span>}
                    </span>
                  </td>
                  <td className={`py-1.5 text-right text-sm font-medium ${step.computedAmount < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {step.computedAmount < 0 ? '− ' : '+ '}{currency} {fmt(Math.abs(step.computedAmount))}
                  </td>
                  <td className="print:hidden" />
                </tr>
              ))}
              {/* Final total row */}
              <tr className={financials.length > 0 ? 'border-t-2 border-slate-700' : ''}>
                <td colSpan={5} className="py-4 text-right font-bold text-slate-700 pr-4">
                  {financials.length > 0 ? 'Final Total' : 'Grand Total'}
                </td>
                <td className="py-4 text-right text-xl font-bold text-slate-800">
                  {currency} {fmt(finalTotal)}
                </td>
                <td className="print:hidden" />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Financial Calculations Panel — collapsible, print:hidden */}
        <div className="px-8 pb-4 print:hidden">
          <button
            onClick={() => setShowFinancials(prev => !prev)}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors py-2 border-t border-slate-100 w-full text-left"
          >
            {showFinancials ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Financial Calculations
            <span className="text-xs font-normal text-slate-400 ml-1">
              {financials.length > 0 ? `${financials.length} calculation${financials.length !== 1 ? 's' : ''}` : 'Discount, VAT, Shipping…'}
            </span>
          </button>
          {showFinancials && (
            <div className="mt-3">
              <FinancialsEditor
                proformaId={proformaId}
                financials={financials}
                subtotal={subtotal}
                currency={currency}
                onChange={setFinancials}
              />
            </div>
          )}
        </div>

        {/* Print-only financials breakdown */}
        {financials.length > 0 && (
          <div className="hidden print:block px-8 pb-4">
            <div className="border-t border-slate-100 pt-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Financial Breakdown</p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium text-slate-700">{currency} {fmt(subtotal)}</span>
                </div>
                {calcSteps.map(step => (
                  <div key={step.id} className="flex justify-between text-xs">
                    <span className="text-slate-500">{step.type === 'subtract' ? '−' : '+'} {step.name}{step.valueType === 'percentage' ? ` (${step.value}%)` : ''}</span>
                    <span className={step.computedAmount < 0 ? 'text-red-600' : 'text-green-700'}>{step.computedAmount < 0 ? '− ' : '+ '}{currency} {fmt(Math.abs(step.computedAmount))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
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
