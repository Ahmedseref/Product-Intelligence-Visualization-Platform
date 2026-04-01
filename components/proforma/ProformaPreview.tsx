import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Edit2, RotateCcw, Plus, Trash2, CheckCircle, X, Printer, FileSpreadsheet, FileText, Search, ChevronDown, ChevronUp, Save, Pencil } from 'lucide-react';
import { api } from '../../client/api';
import { ProformaData, ProformaItemData, ProformaSettingsData, ProformaFinancialData, CustomerFieldData } from '../../types';
import FinancialsEditor, { computeFinancials } from './FinancialsEditor';
import { useRefreshContext } from '../../client/contexts/RefreshContext';

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
  const { lockEditing, unlockEditing } = useRefreshContext();
  const [proforma, setProforma] = useState<ProformaData | null>(null);
  const [settings, setSettings] = useState<ProformaSettingsData>({});
  const [financials, setFinancials] = useState<ProformaFinancialData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState<number | null>(null);
  const [showFinancials, setShowFinancials] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfCapturing, setPdfCapturing] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaDraft, setMetaDraft] = useState<Record<string, string>>({});
  const [savingMeta, setSavingMeta] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingCell !== null || editingMeta) {
      lockEditing();
      return () => unlockEditing();
    }
  }, [editingCell, editingMeta, lockEditing, unlockEditing]);

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
      await api.updateProforma(proformaId, { status });
      setProforma(prev => prev ? { ...prev, status } : null);
    } catch (e) { console.error(e); }
  };

  const startEditMeta = () => {
    if (!proforma) return;
    setMetaDraft({
      notes: proforma.notes || '',
      shipTo: proforma.shipTo || '',
      portOfLoading: proforma.portOfLoading || '',
      placeOfDestination: proforma.placeOfDestination || '',
      finalPlaceOfDelivery: proforma.finalPlaceOfDelivery || '',
      countryOfOrigin: proforma.countryOfOrigin || '',
      transportationMode: proforma.transportationMode || '',
      paymentTerms: proforma.paymentTerms || '',
      deliveryTerms: proforma.deliveryTerms || '',
      currency: proforma.currency || settings.defaultCurrency || 'USD',
    });
    setEditingMeta(true);
  };

  const saveMetaEdits = async () => {
    if (!proforma) return;
    setSavingMeta(true);
    try {
      const patch: Record<string, any> = {};
      for (const key of ['notes', 'shipTo', 'portOfLoading', 'placeOfDestination', 'finalPlaceOfDelivery', 'countryOfOrigin', 'transportationMode', 'paymentTerms', 'deliveryTerms', 'currency']) {
        patch[key] = metaDraft[key]?.trim() || null;
      }
      await api.updateProforma(proformaId, patch);
      setProforma(prev => prev ? { ...prev, ...patch } : null);
      setEditingMeta(false);
    } catch (e) {
      console.error(e);
      alert('Failed to save changes.');
    } finally {
      setSavingMeta(false);
    }
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

  const handlePdfExport = async () => {
    if (!invoiceRef.current) return;
    setExportingPdf(true);
    setPdfCapturing(true);
    await new Promise(r => setTimeout(r, 100));
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const element = invoiceRef.current!;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageHeight = 297;
      const pdf = new jsPDF('p', 'mm', 'a4');
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = -(imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`${proforma?.proformaId || 'proforma'}.pdf`);
    } catch (e) {
      console.error('PDF export failed:', e);
      alert('PDF export failed. Please try again.');
    } finally {
      setPdfCapturing(false);
      setExportingPdf(false);
    }
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
            className="flex-1 px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-w-0"
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
        {!pdfCapturing && <Edit2 className="w-3 h-3 text-slate-300 group-hover:text-blue-400 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity print:hidden" />}
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

  const invoiceDate = proforma.date
    ? new Date(proforma.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const invoicedToDisplay = proforma.shipTo?.trim() || 'SAME AS CONSIGNEE';

  const effectivePaymentTerms = proforma.paymentTerms || settings.paymentTerms || '';
  const effectiveDeliveryTerms = proforma.deliveryTerms || settings.deliveryTerms || '';

  const metaRows: [string, string][] = [
    ['DATE', invoiceDate],
    ['NUMBER', proforma.proformaId],
    ['TERMS OF PAYMENT', effectivePaymentTerms || '—'],
    ['TERMS OF DELIVERY', effectiveDeliveryTerms || '—'],
    ['PORT OF LOADING', proforma.portOfLoading || '—'],
    ['TRANSACTION CURRENCY', currency],
    ['PLACE OF DESTINATION', proforma.placeOfDestination || '—'],
    ['FINAL PLACE OF DELIVERY', proforma.finalPlaceOfDelivery || '—'],
    ['COUNTRY OF ORIGIN', proforma.countryOfOrigin || '—'],
    ['TRANSPORTATION MODE', proforma.transportationMode || '—'],
  ];

  const CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY', 'AED', 'SAR', 'CNY', 'JPY'];

  return (
    <div className="max-w-[900px] mx-auto space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between print:hidden">
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
          {!editingMeta && (
            <button
              onClick={startEditMeta}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Details
            </button>
          )}
          <button
            onClick={handlePdfExport}
            disabled={exportingPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-60"
          >
            <FileText className="w-3.5 h-3.5" /> {exportingPdf ? 'Generating…' : 'Export PDF'}
          </button>
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
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {/* Edit Details Panel */}
      {editingMeta && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden print:hidden">
          <div className="px-6 py-3 border-b border-blue-100 bg-blue-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-blue-800">Edit Invoice Details</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditingMeta(false)}
                className="px-3 py-1 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={saveMetaEdits}
                disabled={savingMeta}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                <Save className="w-3.5 h-3.5" /> {savingMeta ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <div className="p-6 grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Currency</label>
              <select
                value={metaDraft.currency || 'USD'}
                onChange={e => setMetaDraft(p => ({ ...p, currency: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Port of Loading</label>
              <input type="text" value={metaDraft.portOfLoading || ''} onChange={e => setMetaDraft(p => ({ ...p, portOfLoading: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Place of Destination</label>
              <input type="text" value={metaDraft.placeOfDestination || ''} onChange={e => setMetaDraft(p => ({ ...p, placeOfDestination: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Final Place of Delivery</label>
              <input type="text" value={metaDraft.finalPlaceOfDelivery || ''} onChange={e => setMetaDraft(p => ({ ...p, finalPlaceOfDelivery: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Country of Origin</label>
              <input type="text" value={metaDraft.countryOfOrigin || ''} onChange={e => setMetaDraft(p => ({ ...p, countryOfOrigin: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Transportation Mode</label>
              <input type="text" value={metaDraft.transportationMode || ''} onChange={e => setMetaDraft(p => ({ ...p, transportationMode: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-medium text-slate-500 mb-1">Invoiced To (leave empty for "SAME AS CONSIGNEE")</label>
              <textarea value={metaDraft.shipTo || ''} onChange={e => setMetaDraft(p => ({ ...p, shipTo: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" />
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
              <textarea value={metaDraft.notes || ''} onChange={e => setMetaDraft(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" />
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-400 print:hidden">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-amber-100 ring-1 ring-amber-300" />
          Overridden (differs from product database)
        </span>
        <span className="flex items-center gap-1.5">
          <Edit2 className="w-3 h-3" />
          Click any cell to edit inline
        </span>
      </div>

      {/* Invoice Document — professional bordered layout */}
      <div ref={invoiceRef} className="bg-white border-2 border-slate-800 shadow-sm print:shadow-none print:border-2" style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
        {/* Title bar */}
        <div className="border-b-2 border-slate-800 px-6 py-3">
          <h1 className="text-lg font-bold text-slate-900 tracking-wide">PROFORMA INVOICE</h1>
        </div>

        {/* Header: Company Info (left) + Meta Table (right) */}
        <div className="flex border-b-2 border-slate-800">
          {/* Left side — company & customer info */}
          <div className="flex-1 border-r-2 border-slate-800 flex flex-col">
            {/* Produced & Exported By */}
            <div className="p-4 border-b border-slate-800">
              <p className="text-[10px] font-semibold text-slate-500 mb-1">Produced & Exported By:</p>
              {settings.companyLogo && (
                <img src={settings.companyLogo} alt="Logo" className="h-10 w-auto object-contain mb-1" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
              <p className="text-sm font-bold text-slate-900">{settings.companyName || 'Your Company'}</p>
              {settings.address && <p className="text-xs text-slate-700 whitespace-pre-line mt-0.5">{settings.address}</p>}
              {settings.phone && <p className="text-xs text-slate-700">T: {settings.phone}</p>}
              {settings.email && <p className="text-xs text-slate-700">E: {settings.email}</p>}
            </div>

            {/* Bill & Ship To */}
            <div className="p-4 border-b border-slate-800">
              <p className="text-[10px] font-semibold text-slate-500 mb-1">Bill & Ship To:</p>
              <p className="text-sm font-semibold text-slate-900">{proforma.customerName}</p>
              {proforma.customerCountry && <p className="text-xs text-slate-700">{proforma.customerCountry}</p>}
              {proforma.customerContact && <p className="text-xs text-slate-700">{proforma.customerContact}</p>}
              {customerFields.filter(f =>
                !['country', 'contact', 'email'].includes(f.fieldName.toLowerCase())
              ).map((f, idx) => (
                <p key={idx} className="text-xs text-slate-700">{f.fieldName}: {f.fieldValue || '—'}</p>
              ))}
            </div>

            {/* Invoiced To */}
            <div className="p-4 flex-1">
              <p className="text-[10px] font-semibold text-slate-500 mb-1">Invoiced To:</p>
              <p className="text-xs text-slate-700 whitespace-pre-line">{invoicedToDisplay}</p>
            </div>
          </div>

          {/* Right side — metadata table */}
          <div className="w-[340px] flex-shrink-0">
            <table className="w-full text-xs border-collapse">
              <tbody>
                {metaRows.map(([label, value], idx) => (
                  <tr key={idx} className={idx < metaRows.length - 1 ? 'border-b border-slate-300' : ''}>
                    <td className="px-3 py-2 text-slate-600 font-medium border-r border-slate-300 whitespace-nowrap">{label}</td>
                    <td className="px-3 py-2 text-slate-900 font-semibold">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Products Table */}
        <div className="border-b-2 border-slate-800">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-800 bg-slate-50">
                <th className="text-left px-3 py-2 font-bold text-slate-700 border-r border-slate-300">DESCRIPTION OF GOODS</th>
                <th className="text-center px-2 py-2 font-bold text-slate-700 border-r border-slate-300 w-[70px]">QTY</th>
                <th className="text-center px-2 py-2 font-bold text-slate-700 border-r border-slate-300 w-[50px]">UNIT</th>
                <th className="text-right px-3 py-2 font-bold text-slate-700 border-r border-slate-300 w-[100px]">UNIT PRICE</th>
                <th className="text-right px-3 py-2 font-bold text-slate-700 w-[110px]">TOTAL</th>
                {!pdfCapturing && <th className="w-[60px] print:hidden" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400 text-sm">No products in this proforma</td>
                </tr>
              )}
              {items.map((item) => {
                const displayName = String(getDisplayValue(item, 'name'));
                const displayDesc = String(getDisplayValue(item, 'description'));
                const displayPrice = Number(getDisplayValue(item, 'price'));
                const lineTotal = displayPrice * item.quantity;
                const hasOverride = ['name', 'description', 'price'].some(f => isOverridden(item, f));
                const isSav = saving === item.id;

                return (
                  <tr key={item.id} className={`${isSav ? 'opacity-60' : ''} border-b border-slate-200 hover:bg-slate-50/50 transition-colors`}>
                    <td className="px-3 py-2 border-r border-slate-300">
                      <EditableCell item={item} field="name" displayValue={displayName} />
                      {displayDesc && (
                        <div className="mt-0.5">
                          <EditableCell item={item} field="description" displayValue={displayDesc} />
                        </div>
                      )}
                      {item.productStockCode && (
                        <div className="text-[10px] font-mono text-slate-400 px-1 mt-0.5">{item.productStockCode}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center border-r border-slate-300">
                      <EditableCell item={item} field="quantity" displayValue={item.quantity} isNum />
                    </td>
                    <td className="px-2 py-2 text-center text-slate-600 border-r border-slate-300">
                      {item.productUnit || 'pc'}
                    </td>
                    <td className="px-3 py-2 text-right border-r border-slate-300 text-slate-800">
                      {currency} <EditableCell item={item} field="price" displayValue={displayPrice} isNum />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">
                      {currency} {fmt(lineTotal)}
                    </td>
                    {!pdfCapturing && (
                      <td className="px-2 py-2 print:hidden">
                        <div className="flex items-center gap-0.5 justify-center">
                          {hasOverride && (
                            <button
                              onClick={() => resetItem(item)}
                              title="Reset to original product data"
                              className="p-0.5 text-amber-500 hover:text-amber-700 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-0.5 text-slate-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {/* Totals */}
            <tfoot>
              {calcSteps.length > 0 && (
                <tr className="border-t-2 border-slate-300 bg-slate-50/50">
                  <td colSpan={4} className="px-3 py-2 text-right text-xs font-bold text-slate-700 uppercase">
                    SUBTOTAL {effectiveDeliveryTerms}{proforma.portOfLoading ? ` ${proforma.portOfLoading}` : ''}{proforma.countryOfOrigin ? `, ${proforma.countryOfOrigin}` : ''}
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-slate-700">
                    {currency} {fmt(subtotal)}
                  </td>
                  {!pdfCapturing && <td className="print:hidden" />}
                </tr>
              )}
              {calcSteps.map((step) => (
                <tr key={step.id} className="border-t border-dashed border-slate-200">
                  <td colSpan={4} className="px-3 py-1.5 text-right text-xs text-slate-900 uppercase font-medium">
                    {step.name}
                    {step.valueType === 'percentage' && ` (${step.value}%)`}
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs font-medium text-slate-900 uppercase">
                    {currency} {fmt(Math.abs(step.computedAmount))}
                  </td>
                  {!pdfCapturing && <td className="print:hidden" />}
                </tr>
              ))}
              <tr className="border-t-2 border-slate-800 bg-slate-50">
                <td colSpan={4} className="px-3 py-3 text-right text-xs font-bold text-slate-900 uppercase">
                  {calcSteps.length > 0
                    ? `TOTAL ${effectiveDeliveryTerms || 'CIF'}${proforma.finalPlaceOfDelivery ? ` ${proforma.finalPlaceOfDelivery}` : ''}${proforma.placeOfDestination ? `, ${proforma.placeOfDestination}` : ''}`
                    : `TOTAL ${effectiveDeliveryTerms}${proforma.portOfLoading ? ` ${proforma.portOfLoading}` : ''}`
                  }
                </td>
                <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">
                  {currency} {fmt(finalTotal)}
                </td>
                {!pdfCapturing && <td className="print:hidden" />}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notes section */}
        {(settings.notes || proforma.notes) && (
          <div className="border-b-2 border-slate-800 p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Notes</p>
            <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">{proforma.notes || settings.notes}</p>
          </div>
        )}

        {/* Bank Details section */}
        {settings.bankDetails && (
          <div className="p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Bank Details</p>
            <p className="text-xs text-slate-700 whitespace-pre-line font-mono leading-relaxed">{settings.bankDetails}</p>
          </div>
        )}
      </div>

      {/* Financial Calculations Panel — collapsible, print:hidden */}
      <div className="print:hidden bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setShowFinancials(prev => !prev)}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors py-3 px-6 w-full text-left hover:bg-slate-50"
        >
          {showFinancials ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          Financial Calculations
          <span className="text-xs font-normal text-slate-400 ml-1">
            {financials.length > 0 ? `${financials.length} calculation${financials.length !== 1 ? 's' : ''}` : 'Discount, VAT, Shipping…'}
          </span>
        </button>
        {showFinancials && (
          <div className="px-6 pb-4 border-t border-slate-100 pt-3">
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
    </div>
  );
};

export default ProformaPreview;
