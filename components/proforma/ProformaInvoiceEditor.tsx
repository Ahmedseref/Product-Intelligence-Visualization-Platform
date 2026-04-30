// =============================================================================
// ProformaInvoiceEditor — single-canvas editor for proforma invoices
// =============================================================================
// Replaces the old 3-screen flow (Create → Edit → Preview) with a single
// screen featuring:
//   • Left column  (~40%) — collapsible control sections:
//       1. Customer & Header
//       2. Shipping & Logistics
//       3. Products
//       4. Financial Calculations
//       5. Notes & Bank Details
//   • Right column (~60%, sticky) — live read-only invoice document that
//     updates the moment the user edits anything on the left.
//
// Save semantics
// --------------
// All edits live in local React state until the user clicks "Save". On Save
// we run a small client-side sync against the existing per-row endpoints:
//   • PATCH /api/proforma/:id          — invoice metadata
//   • POST  /api/proforma/:id/items    — newly-added items (negative ids)
//   • PATCH /api/proforma-items/:id    — modified items
//   • DELETE /api/proforma-items/:id   — removed items
//   • POST  /api/proforma/:id/financials       — new financials
//   • PATCH /api/proforma-financials/:id       — modified financials
//   • DELETE /api/proforma-financials/:id      — removed financials
//
// For a brand-new invoice (no proformaId yet) the first Save also POSTs to
// /api/proforma/list to allocate the canonical proforma id, then proceeds
// as if it were an edit.
//
// Exports
// -------
// • Excel — server-rendered. Forces a Save first (the export reads from DB).
// • PDF   — html2canvas snapshots the live preview ref. Independent of save.
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ArrowLeft, Save, FileText, FileSpreadsheet, Plus, Trash2, Search, X,
  ChevronDown, ChevronUp, User, Truck, Package, Calculator, StickyNote,
  Anchor, Globe, CreditCard, Percent, DollarSign, GripVertical, AlertCircle,
} from 'lucide-react';
import { api } from '../../client/api';
import {
  Product,
  ProformaData,
  ProformaItemData,
  ProformaFinancialData,
  ProformaSettingsData,
  CustomerData,
  CustomerFieldData,
} from '../../types';
import CustomerSelector from './CustomerSelector';
import { computeFinancials } from './FinancialsEditor';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY', 'AED', 'SAR', 'CNY', 'JPY'] as const;

const STATUS_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: 'draft',    label: 'Draft',    color: 'bg-slate-100 text-slate-600' },
  { value: 'sent',     label: 'Sent',     color: 'bg-blue-100 text-blue-700' },
  { value: 'accepted', label: 'Accepted', color: 'bg-green-100 text-green-700' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-100 text-red-700' },
];

// Section keys mirror the order described in the spec (top → bottom).
type SectionKey = 'customer' | 'shipping' | 'products' | 'financials' | 'notes';

// Local working copy of an item. `id` < 0 means "not yet persisted".
interface DraftItem {
  id: number;                 // negative for new, positive for persisted
  productId: string;
  productName: string;        // resolved at add-time and kept for preview
  productDescription: string;
  productPrice: number;       // catalog price; used when customPrice is null
  productUnit: string;
  productCurrency: string;
  productStockCode: string;
  productSupplier: string;
  customName: string | null;
  customDescription: string | null;
  customPrice: number | null;
  quantity: number;
}

// Local working copy of a financial step. `id` < 0 means "not yet persisted".
interface DraftFinancial {
  id: number;
  name: string;
  type: 'add' | 'subtract';
  valueType: 'percentage' | 'fixed';
  value: number;
  orderIndex: number;
}

interface ProformaInvoiceEditorProps {
  // null  → user is creating a new proforma (no server record yet)
  // string → user is editing an existing proforma by id
  proformaId: string | null;
  products: Product[];
  onBack: () => void;
  // Called after the FIRST successful save of a brand-new invoice so the
  // parent can pin the active id and survive a remount.
  onSaved?: (proformaId: string) => void;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Unique negative id generator — used to give brand-new draft rows a stable
// React key without colliding with real (positive serial) database ids.
let nextTempId = -1;
const newTempId = () => nextTempId--;

// Convert an enriched server item into our DraftItem working shape.
function itemFromServer(it: ProformaItemData): DraftItem {
  return {
    id: it.id,
    productId: it.productId,
    productName: it.productName ?? '',
    productDescription: it.productDescription ?? '',
    productPrice: it.productPrice ?? 0,
    productUnit: it.productUnit ?? '',
    productCurrency: it.productCurrency ?? '',
    productStockCode: it.productStockCode ?? '',
    productSupplier: it.productSupplier ?? '',
    customName: it.customName ?? null,
    customDescription: it.customDescription ?? null,
    customPrice: it.customPrice ?? null,
    quantity: it.quantity,
  };
}

function financialFromServer(f: ProformaFinancialData): DraftFinancial {
  return {
    id: f.id,
    name: f.name,
    type: f.type,
    valueType: f.valueType,
    value: f.value,
    orderIndex: f.orderIndex ?? 0,
  };
}

// =============================================================================
// Main component
// =============================================================================

const ProformaInvoiceEditor: React.FC<ProformaInvoiceEditorProps> = ({
  proformaId,
  products,
  onBack,
  onSaved,
}) => {
  // ── Identity / persistence ─────────────────────────────────────────────
  // currentProformaId mirrors the prop initially but flips to a server-issued
  // id the first time a brand-new invoice is saved.
  const [currentProformaId, setCurrentProformaId] = useState<string | null>(proformaId);
  const isNew = currentProformaId === null;

  // ── Server-loaded reference data ───────────────────────────────────────
  const [settings, setSettings] = useState<ProformaSettingsData>({});

  // ── Editable invoice fields (stored individually for tight re-renders) ─
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  // Customer fields are auto-mirrored from the selected customer record but
  // we keep them in component state so they appear in the live preview even
  // before the first Save.
  const [customerFields, setCustomerFields] = useState<CustomerFieldData[]>([]);

  const [currency, setCurrency] = useState<string>('USD');
  const [status, setStatus] = useState<string>('draft');
  const [shipTo, setShipTo] = useState<string>('');
  const [portOfLoading, setPortOfLoading] = useState<string>('');
  const [placeOfDestination, setPlaceOfDestination] = useState<string>('');
  const [finalPlaceOfDelivery, setFinalPlaceOfDelivery] = useState<string>('');
  const [countryOfOrigin, setCountryOfOrigin] = useState<string>('');
  const [transportationMode, setTransportationMode] = useState<string>('');
  const [paymentTerms, setPaymentTerms] = useState<string>('');
  const [deliveryTerms, setDeliveryTerms] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  // Bank details are always taken live from settings — no per-invoice override
  // (mirrors the existing Excel/PDF export contract).

  const [items, setItems] = useState<DraftItem[]>([]);
  const [financials, setFinancials] = useState<DraftFinancial[]>([]);

  // ── Original snapshots — used to compute the diff at Save time ─────────
  const originalItemIds = useRef<Set<number>>(new Set());
  const originalItemsById = useRef<Map<number, DraftItem>>(new Map());
  const originalFinancialIds = useRef<Set<number>>(new Set());
  const originalFinancialsById = useRef<Map<number, DraftFinancial>>(new Map());

  // ── UI state ───────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [pdfCapturing, setPdfCapturing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    customer:   true,
    shipping:   true,
    products:   true,
    financials: true,
    notes:      false,
  });
  const toggleSection = (k: SectionKey) =>
    setOpenSections(prev => ({ ...prev, [k]: !prev[k] }));

  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  const invoiceRef = useRef<HTMLDivElement>(null);

  // ────────────────────────────────────────────────────────────────────────
  // Initial load — fetch settings always; fetch the proforma if editing.
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settingsPromise = api.getProformaSettings();
        if (currentProformaId) {
          const [pf, s] = await Promise.all([
            api.getProforma(currentProformaId),
            settingsPromise,
          ]);
          if (cancelled) return;
          setSettings(s || {});
          hydrateFromServer(pf, s || {});
        } else {
          const s = await settingsPromise;
          if (cancelled) return;
          setSettings(s || {});
          // Brand-new: seed defaults from settings so the preview is sensible.
          setCurrency(s?.defaultCurrency || 'USD');
          setPortOfLoading(s?.defaultPortOfLoading || '');
          setCountryOfOrigin(s?.defaultCountryOfOrigin || '');
          setTransportationMode(s?.defaultTransportationMode || '');
          setPaymentTerms(s?.paymentTerms || '');
          setDeliveryTerms(s?.deliveryTerms || '');
        }
      } catch (e) {
        console.error('[ProformaInvoiceEditor] initial load failed:', e);
        setSaveError('Failed to load invoice. Please go back and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // We intentionally only run this once per mounted editor — re-loads after
    // the first Save are handled by hydrateFromServer directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the server payload into local state and snapshot the originals so
  // the next Save can compute a precise diff.
  const hydrateFromServer = useCallback((pf: ProformaData, s: ProformaSettingsData) => {
    setCurrency(pf.currency || s.defaultCurrency || 'USD');
    setStatus(pf.status || 'draft');
    setShipTo(pf.shipTo || '');
    setPortOfLoading(pf.portOfLoading || '');
    setPlaceOfDestination(pf.placeOfDestination || '');
    setFinalPlaceOfDelivery(pf.finalPlaceOfDelivery || '');
    setCountryOfOrigin(pf.countryOfOrigin || '');
    setTransportationMode(pf.transportationMode || '');
    setPaymentTerms(pf.paymentTerms || '');
    setDeliveryTerms(pf.deliveryTerms || '');
    setNotes(pf.notes || '');

    if (pf.customerId) {
      // Synthesize a minimal CustomerData so the selector trigger displays
      // the right name immediately. The selector will re-fetch full details
      // when clicked.
      setCustomer({
        id: pf.customerId,
        name: pf.customerName,
        fields: pf.customerFields ?? [],
      });
    } else {
      setCustomer(null);
    }
    setCustomerFields(pf.customerFields ?? []);

    const draftItems = (pf.items ?? []).map(itemFromServer);
    setItems(draftItems);
    originalItemIds.current = new Set(draftItems.map(d => d.id));
    originalItemsById.current = new Map(draftItems.map(d => [d.id, { ...d }]));

    const draftFin = (pf.financials ?? []).map(financialFromServer);
    setFinancials(draftFin);
    originalFinancialIds.current = new Set(draftFin.map(d => d.id));
    originalFinancialsById.current = new Map(draftFin.map(d => [d.id, { ...d }]));
  }, []);

  // When the user picks a customer, mirror their fields into the preview.
  useEffect(() => {
    setCustomerFields(customer?.fields ?? []);
  }, [customer]);

  // ────────────────────────────────────────────────────────────────────────
  // Derived values — computed every render. computeFinancials is pure and
  // cheap enough to run inline.
  // ────────────────────────────────────────────────────────────────────────
  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + (it.customPrice ?? it.productPrice ?? 0) * it.quantity, 0),
    [items],
  );
  const calc = useMemo(
    () => computeFinancials(subtotal, financials as ProformaFinancialData[]),
    [subtotal, financials],
  );

  // ────────────────────────────────────────────────────────────────────────
  // Item handlers
  // ────────────────────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.stockCode || '').toLowerCase().includes(q) ||
      (p.supplier || '').toLowerCase().includes(q),
    );
  }, [products, productSearch]);

  const addProduct = (p: Product) => {
    if (items.some(i => i.productId === p.id)) return; // already present
    setItems(prev => [...prev, {
      id: newTempId(),
      productId: p.id,
      productName: p.name,
      productDescription: p.description || '',
      productPrice: p.price ?? 0,
      productUnit: p.unit || '',
      productCurrency: p.currency || '',
      productStockCode: p.stockCode || '',
      productSupplier: p.supplier || '',
      customName: null,
      customDescription: null,
      customPrice: null,
      quantity: 1,
    }]);
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const updateItem = <K extends keyof DraftItem>(id: number, field: K, value: DraftItem[K]) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };
  const removeItem = (id: number) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };
  // Reset overrides for a single item — restores catalog name/description/price.
  const resetItemOverrides = (id: number) => {
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, customName: null, customDescription: null, customPrice: null } : i,
    ));
  };

  // ────────────────────────────────────────────────────────────────────────
  // Financial handlers
  // ────────────────────────────────────────────────────────────────────────
  const addFinancial = () => {
    const orderIndex = financials.length === 0
      ? 0
      : Math.max(...financials.map(f => f.orderIndex)) + 1;
    setFinancials(prev => [...prev, {
      id: newTempId(),
      name: 'New Calculation',
      type: 'add',
      valueType: 'fixed',
      value: 0,
      orderIndex,
    }]);
  };

  const updateFinancial = <K extends keyof DraftFinancial>(id: number, field: K, value: DraftFinancial[K]) => {
    setFinancials(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
  };
  const removeFinancial = (id: number) => {
    setFinancials(prev => prev.filter(f => f.id !== id));
  };

  // ────────────────────────────────────────────────────────────────────────
  // Save — diff working state vs originals and apply the minimal API calls
  // ────────────────────────────────────────────────────────────────────────
  const buildMetadataPatch = (): Record<string, any> => {
    // Build the full metadata payload. We send empty strings as null so the
    // preview shows "—" instead of an empty string remnant.
    const norm = (s: string) => (s.trim() === '' ? null : s.trim());
    return {
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? 'Untitled Customer',
      currency,
      status,
      shipTo: norm(shipTo),
      portOfLoading: norm(portOfLoading),
      placeOfDestination: norm(placeOfDestination),
      finalPlaceOfDelivery: norm(finalPlaceOfDelivery),
      countryOfOrigin: norm(countryOfOrigin),
      transportationMode: norm(transportationMode),
      paymentTerms: norm(paymentTerms),
      deliveryTerms: norm(deliveryTerms),
      notes: norm(notes),
    };
  };

  // Reload the full proforma from the server after a Save so any server-side
  // computed fields (timestamps, sortOrder, etc.) are reflected and the
  // originals snapshot is reset for the next Save.
  const reloadAfterSave = async (id: string) => {
    const pf = await api.getProforma(id);
    hydrateFromServer(pf, settings);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const meta = buildMetadataPatch();

      // 1. Resolve the proforma id (create on first save).
      let id = currentProformaId;
      if (!id) {
        const created = await api.createProforma(meta);
        id = created.proformaId as string;
        setCurrentProformaId(id);
        onSaved?.(id);
      } else {
        await api.updateProforma(id, meta);
      }

      // 2. Sync items.
      // 2a. Deletes — anything in the originals set that isn't in the working
      //     state any more.
      const liveItemIds = new Set(items.filter(i => i.id > 0).map(i => i.id));
      const itemDeletes: Promise<unknown>[] = [];
      for (const origId of originalItemIds.current) {
        if (!liveItemIds.has(origId)) {
          itemDeletes.push(api.deleteProformaItem(origId));
        }
      }
      // 2b. Updates / inserts — preserve the user's drag-free-but-add-order
      //     ordering by writing sortOrder = array index.
      const itemWrites: Promise<unknown>[] = [];
      items.forEach((it, idx) => {
        if (it.id < 0) {
          // New item — POST with sortOrder.
          itemWrites.push(api.addProformaItem(id!, {
            productId: it.productId,
            customName: it.customName,
            customDescription: it.customDescription,
            customPrice: it.customPrice,
            quantity: it.quantity,
            sortOrder: idx,
          }));
        } else {
          const orig = originalItemsById.current.get(it.id);
          if (!orig) return;
          // Only PATCH if anything changed.
          const changed =
            orig.customName !== it.customName ||
            orig.customDescription !== it.customDescription ||
            orig.customPrice !== it.customPrice ||
            orig.quantity !== it.quantity;
          if (changed) {
            itemWrites.push(api.updateProformaItem(it.id, {
              customName: it.customName,
              customDescription: it.customDescription,
              customPrice: it.customPrice,
              quantity: it.quantity,
              sortOrder: idx,
            }));
          }
        }
      });

      // 3. Sync financials — same shape as items.
      const liveFinIds = new Set(financials.filter(f => f.id > 0).map(f => f.id));
      const finDeletes: Promise<unknown>[] = [];
      for (const origId of originalFinancialIds.current) {
        if (!liveFinIds.has(origId)) {
          finDeletes.push(api.deleteProformaFinancial(origId));
        }
      }
      const finWrites: Promise<unknown>[] = [];
      financials.forEach((f, idx) => {
        if (f.id < 0) {
          finWrites.push(api.createProformaFinancial(id!, {
            name: f.name,
            type: f.type,
            valueType: f.valueType,
            value: f.value,
            orderIndex: idx,
          }));
        } else {
          const orig = originalFinancialsById.current.get(f.id);
          if (!orig) return;
          const changed =
            orig.name !== f.name ||
            orig.type !== f.type ||
            orig.valueType !== f.valueType ||
            orig.value !== f.value ||
            orig.orderIndex !== idx;
          if (changed) {
            finWrites.push(api.updateProformaFinancial(f.id, {
              name: f.name,
              type: f.type,
              valueType: f.valueType,
              value: f.value,
              orderIndex: idx,
            }));
          }
        }
      });

      // Run deletes first (avoid unique-constraint races), then writes.
      await Promise.all([...itemDeletes, ...finDeletes]);
      await Promise.all([...itemWrites, ...finWrites]);

      // 4. Reload so we get fresh server ids for newly-inserted rows.
      await reloadAfterSave(id);

      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (e: any) {
      console.error('[ProformaInvoiceEditor] save failed:', e);
      setSaveError(e?.message || 'Failed to save invoice.');
    } finally {
      setSaving(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // Exports
  // ────────────────────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    // Excel is rendered server-side from persisted data, so we require the
    // invoice to have been saved at least once. The toolbar button enforces
    // this by disabling itself when isNew, so this guard is just defensive.
    if (!currentProformaId) return;
    setExportingExcel(true);
    api.exportProformaExcel(currentProformaId);
    setTimeout(() => setExportingExcel(false), 2000);
  };

  const handleExportPdf = async () => {
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
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageHeight = 297; // A4 height in mm
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
      pdf.save(`${currentProformaId || 'proforma'}.pdf`);
    } catch (e) {
      console.error('[ProformaInvoiceEditor] PDF export failed:', e);
      alert('PDF export failed. Please try again.');
    } finally {
      setPdfCapturing(false);
      setExportingPdf(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 text-sm">Loading invoice…</div>
      </div>
    );
  }

  const statusMeta = STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* ─── Top bar ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Invoice</span>
            <span className="font-mono font-semibold text-blue-700 text-sm">
              {currentProformaId || 'NEW'}
            </span>
          </div>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border-0 focus:outline-none cursor-pointer ${statusMeta.color}`}
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 text-[11px] font-medium border border-green-200">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live preview
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {saveError && (
            <span className="hidden md:flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5" /> {saveError}
            </span>
          )}
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf || isNew}
            title={isNew ? 'Save the invoice first' : ''}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText className="w-3.5 h-3.5" /> {exportingPdf ? 'Generating…' : 'PDF'}
          </button>
          <button
            onClick={handleExportExcel}
            disabled={exportingExcel || isNew}
            title={isNew ? 'Save the invoice first' : ''}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 border border-green-200 bg-green-50 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> {exportingExcel ? 'Exporting…' : 'Excel'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-60 ${
              saveOk ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : saveOk ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* ─── Two-column body ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-12 gap-6 p-6 max-w-[1600px] mx-auto">
          {/* ─── LEFT COLUMN — Controls ─────────────────────────────── */}
          <div className="col-span-12 lg:col-span-5 space-y-4">

            {/* 1. Customer & Header */}
            <Section
              title="Customer & Header"
              icon={<User className="w-4 h-4 text-slate-500" />}
              open={openSections.customer}
              onToggle={() => toggleSection('customer')}
            >
              <div className="space-y-4">
                <div>
                  <Label>Customer</Label>
                  <CustomerSelector
                    selectedCustomer={customer}
                    onSelect={c => setCustomer(c)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Currency</Label>
                    <select
                      value={currency}
                      onChange={e => setCurrency(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    >
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <select
                      value={status}
                      onChange={e => setStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 capitalize"
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </Section>

            {/* 2. Shipping & Logistics */}
            <Section
              title="Shipping & Logistics"
              icon={<Truck className="w-4 h-4 text-slate-500" />}
              open={openSections.shipping}
              onToggle={() => toggleSection('shipping')}
            >
              <div className="space-y-3">
                <div>
                  <Label>Ship To (consignee override)</Label>
                  <textarea
                    value={shipTo}
                    onChange={e => setShipTo(e.target.value)}
                    placeholder="Leave blank for SAME AS CONSIGNEE"
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field icon={<Anchor className="w-3.5 h-3.5" />} label="Port of Loading"
                    value={portOfLoading} onChange={setPortOfLoading} placeholder="e.g. AMBARLI" />
                  <Field icon={<Globe className="w-3.5 h-3.5" />} label="Place of Destination"
                    value={placeOfDestination} onChange={setPlaceOfDestination} placeholder="e.g. NEW YORK" />
                  <Field label="Final Place of Delivery"
                    value={finalPlaceOfDelivery} onChange={setFinalPlaceOfDelivery} placeholder="Optional" />
                  <Field label="Country of Origin"
                    value={countryOfOrigin} onChange={setCountryOfOrigin} placeholder="e.g. MADE IN TURKIYE" />
                  <Field icon={<Truck className="w-3.5 h-3.5" />} label="Transportation Mode"
                    value={transportationMode} onChange={setTransportationMode} placeholder="e.g. 1X40HC" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Payment Terms" value={paymentTerms} onChange={setPaymentTerms}
                    placeholder="e.g. 30% advance, 70% before shipment" />
                  <Field label="Delivery Terms (Incoterms)" value={deliveryTerms} onChange={setDeliveryTerms}
                    placeholder="e.g. FOB Istanbul" />
                </div>
              </div>
            </Section>

            {/* 3. Products */}
            <Section
              title="Products"
              icon={<Package className="w-4 h-4 text-slate-500" />}
              open={openSections.products}
              onToggle={() => toggleSection('products')}
              right={<span className="text-xs text-slate-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>}
            >
              <div className="space-y-3">
                {/* Product picker */}
                <div className="relative">
                  <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400">
                    <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                      onFocus={() => setShowProductDropdown(true)}
                      placeholder="Search and add products…"
                      className="flex-1 text-sm outline-none bg-transparent"
                    />
                    {productSearch && (
                      <button onClick={() => { setProductSearch(''); setShowProductDropdown(false); }}>
                        <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
                      </button>
                    )}
                  </div>
                  {showProductDropdown && (
                    <>
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
                        {filteredProducts.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-slate-400">No products found</div>
                        ) : filteredProducts.slice(0, 50).map(p => {
                          const already = items.some(i => i.productId === p.id);
                          return (
                            <button
                              key={p.id}
                              onClick={() => !already && addProduct(p)}
                              disabled={already}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                                already ? 'opacity-40 cursor-not-allowed bg-slate-50' : 'hover:bg-blue-50 cursor-pointer'
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-slate-800 truncate">{p.name}</div>
                                <div className="text-xs text-slate-400 truncate">
                                  {p.stockCode && <span className="font-mono mr-2">{p.stockCode}</span>}
                                  {p.supplier && <span>{p.supplier}</span>}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="text-sm font-semibold text-slate-700">
                                  {p.price ? `${p.currency || ''} ${p.price.toLocaleString()}` : '—'}
                                </div>
                                {already && <div className="text-xs text-green-600">Added</div>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <div className="fixed inset-0 z-10" onClick={() => setShowProductDropdown(false)} />
                    </>
                  )}
                </div>

                {/* Items list */}
                {items.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    No products added yet — search above to add one.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((it, idx) => {
                      const displayName = it.customName ?? it.productName;
                      const displayDesc = it.customDescription ?? it.productDescription;
                      const displayPrice = it.customPrice ?? it.productPrice;
                      const overridden =
                        it.customName !== null || it.customDescription !== null || it.customPrice !== null;
                      return (
                        <div key={it.id} className="border border-slate-200 rounded-lg bg-white p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-slate-400 font-mono mt-0.5 w-5 flex-shrink-0">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <input
                              type="text"
                              value={displayName}
                              onChange={e => updateItem(it.id, 'customName', e.target.value)}
                              className="flex-1 px-2 py-1 text-sm font-medium text-slate-800 border border-transparent hover:border-slate-200 rounded focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 min-w-0"
                            />
                            {overridden && (
                              <button
                                onClick={() => resetItemOverrides(it.id)}
                                className="text-[10px] text-amber-600 hover:text-amber-700 px-1.5 py-0.5 rounded hover:bg-amber-50"
                                title="Reset name / description / price to catalog values"
                              >
                                Reset
                              </button>
                            )}
                            <button
                              onClick={() => removeItem(it.id)}
                              className="p-1 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <textarea
                            value={displayDesc}
                            onChange={e => updateItem(it.id, 'customDescription', e.target.value)}
                            placeholder="Description"
                            rows={2}
                            className="w-full px-2 py-1 text-xs text-slate-600 border border-transparent hover:border-slate-200 rounded focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 resize-none"
                          />
                          <div className="grid grid-cols-3 gap-2 items-center">
                            <div>
                              <Label small>Unit Price</Label>
                              <div className="relative">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={displayPrice}
                                  onChange={e => updateItem(it.id, 'customPrice', e.target.value === '' ? null : parseFloat(e.target.value))}
                                  className="w-full pl-2 pr-9 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">{currency}</span>
                              </div>
                            </div>
                            <div>
                              <Label small>Quantity</Label>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={it.quantity}
                                onChange={e => updateItem(it.id, 'quantity', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                              />
                            </div>
                            <div>
                              <Label small>Line Total</Label>
                              <div className="px-2 py-1 text-sm font-semibold text-slate-700 bg-slate-50 rounded">
                                {currency} {fmt(displayPrice * it.quantity)}
                              </div>
                            </div>
                          </div>
                          {it.productUnit && (
                            <div className="text-[10px] text-slate-400">
                              Catalog unit: <span className="font-medium text-slate-500">{it.productUnit}</span>
                              {it.productStockCode && <> · <span className="font-mono">{it.productStockCode}</span></>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Section>

            {/* 4. Financial Calculations */}
            <Section
              title="Financial Calculations"
              icon={<Calculator className="w-4 h-4 text-slate-500" />}
              open={openSections.financials}
              onToggle={() => toggleSection('financials')}
            >
              <div className="space-y-2">
                {financials.length === 0 && (
                  <p className="text-xs text-slate-400 italic">
                    No additional calculations. Add VAT, discounts, shipping, etc.
                  </p>
                )}
                {financials.map((f) => (
                  <div key={f.id} className="border border-slate-200 rounded-lg bg-white p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                      <input
                        type="text"
                        value={f.name}
                        onChange={e => updateFinancial(f.id, 'name', e.target.value)}
                        placeholder="e.g. Discount, VAT, Shipping"
                        className="flex-1 px-2 py-1 text-sm font-medium text-slate-700 border border-transparent hover:border-slate-200 rounded focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 min-w-0"
                      />
                      <button
                        onClick={() => removeFinancial(f.id)}
                        className="p-1 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex rounded-lg overflow-hidden border border-slate-200">
                        <button
                          onClick={() => updateFinancial(f.id, 'type', 'add')}
                          className={`flex-1 py-1 text-xs font-medium transition-colors ${f.type === 'add' ? 'bg-green-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                        >+ Add</button>
                        <button
                          onClick={() => updateFinancial(f.id, 'type', 'subtract')}
                          className={`flex-1 py-1 text-xs font-medium transition-colors ${f.type === 'subtract' ? 'bg-red-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                        >− Subtract</button>
                      </div>
                      <div className="flex rounded-lg overflow-hidden border border-slate-200">
                        <button
                          onClick={() => updateFinancial(f.id, 'valueType', 'percentage')}
                          className={`flex-1 py-1 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${f.valueType === 'percentage' ? 'bg-blue-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                        ><Percent className="w-3 h-3" /> %</button>
                        <button
                          onClick={() => updateFinancial(f.id, 'valueType', 'fixed')}
                          className={`flex-1 py-1 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${f.valueType === 'fixed' ? 'bg-blue-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                        ><DollarSign className="w-3 h-3" /> Fixed</button>
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={f.value}
                        onChange={e => updateFinancial(f.id, 'value', parseFloat(e.target.value) || 0)}
                        className="w-full pl-3 pr-10 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                        {f.valueType === 'percentage' ? '%' : currency}
                      </span>
                    </div>
                  </div>
                ))}
                <button
                  onClick={addFinancial}
                  className="w-full flex items-center justify-center gap-2 py-2 text-sm text-blue-600 border border-dashed border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Calculation
                </button>

                {/* Mini calc preview — mirrors the right-column totals */}
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 mt-3">
                  <div className="flex justify-between text-xs text-slate-600 py-0.5">
                    <span>Subtotal</span>
                    <span className="font-medium">{currency} {fmt(subtotal)}</span>
                  </div>
                  {calc.steps.map(s => (
                    <div key={s.id} className="flex justify-between text-xs py-0.5">
                      <span className="text-slate-500">
                        {s.type === 'subtract' ? '−' : '+'} {s.name}
                        {s.valueType === 'percentage' && <span className="ml-1 text-slate-400">({s.value}%)</span>}
                      </span>
                      <span className={s.computedAmount < 0 ? 'text-red-600' : 'text-green-600'}>
                        {s.computedAmount < 0 ? '−' : '+'} {currency} {fmt(Math.abs(s.computedAmount))}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1.5 mt-1.5 border-t border-slate-300">
                    <span className="text-xs font-bold text-slate-700">Final Total</span>
                    <span className="text-sm font-bold text-slate-900">{currency} {fmt(calc.finalTotal)}</span>
                  </div>
                </div>
              </div>
            </Section>

            {/* 5. Notes & Bank Details */}
            <Section
              title="Notes & Bank Details"
              icon={<StickyNote className="w-4 h-4 text-slate-500" />}
              open={openSections.notes}
              onToggle={() => toggleSection('notes')}
            >
              <div className="space-y-3">
                <div>
                  <Label>Invoice Notes / Footer</Label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder={settings.notes || 'Notes shown at the bottom of the invoice (defaults from Settings if blank).'}
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                  />
                </div>
                <div>
                  <Label>
                    <span className="flex items-center gap-1.5">
                      <CreditCard className="w-3 h-3" /> Bank Details (from Settings)
                    </span>
                  </Label>
                  <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-600 whitespace-pre-wrap min-h-[60px]">
                    {settings.bankDetails || <span className="text-slate-400 italic">Set bank details on the Settings page.</span>}
                  </div>
                </div>
              </div>
            </Section>
          </div>

          {/* ─── RIGHT COLUMN — Live preview ────────────────────────── */}
          <div className="col-span-12 lg:col-span-7">
            <div className="lg:sticky lg:top-4">
              <InvoicePreview
                invoiceRef={invoiceRef}
                settings={settings}
                proformaIdDisplay={currentProformaId || 'NEW'}
                customerName={customer?.name || 'Untitled Customer'}
                customerCountry={customerFields.find(f => /country/i.test(f.fieldName))?.fieldValue || ''}
                customerFields={customerFields}
                currency={currency}
                shipTo={shipTo}
                portOfLoading={portOfLoading}
                placeOfDestination={placeOfDestination}
                finalPlaceOfDelivery={finalPlaceOfDelivery}
                countryOfOrigin={countryOfOrigin}
                transportationMode={transportationMode}
                paymentTerms={paymentTerms}
                deliveryTerms={deliveryTerms}
                notes={notes}
                items={items}
                subtotal={subtotal}
                steps={calc.steps}
                finalTotal={calc.finalTotal}
                pdfCapturing={pdfCapturing}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Reusable left-column primitives
// =============================================================================

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, open, onToggle, right, children }) => (
  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-100"
    >
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="flex items-center gap-2">
        {right}
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </div>
    </button>
    {open && <div className="p-4">{children}</div>}
  </div>
);

const Label: React.FC<{ children: React.ReactNode; small?: boolean }> = ({ children, small }) => (
  <label className={`block ${small ? 'text-[10px]' : 'text-xs'} font-medium text-slate-500 mb-1`}>
    {children}
  </label>
);

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
}> = ({ label, value, onChange, placeholder, icon }) => (
  <div>
    <Label>
      {icon ? (
        <span className="flex items-center gap-1.5">{icon} {label}</span>
      ) : (
        label
      )}
    </Label>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
    />
  </div>
);

// =============================================================================
// InvoicePreview — read-only invoice document for the right column
// =============================================================================
// Visually mirrors the legacy ProformaPreview component but with no editing
// affordances (no click-to-edit cells, no inline buttons). Driven entirely by
// props so it can be reused in any context where a static preview is needed.
// =============================================================================

interface InvoicePreviewProps {
  invoiceRef: React.RefObject<HTMLDivElement>;
  settings: ProformaSettingsData;
  proformaIdDisplay: string;
  customerName: string;
  customerCountry: string;
  customerFields: CustomerFieldData[];
  currency: string;
  shipTo: string;
  portOfLoading: string;
  placeOfDestination: string;
  finalPlaceOfDelivery: string;
  countryOfOrigin: string;
  transportationMode: string;
  paymentTerms: string;
  deliveryTerms: string;
  notes: string;
  items: DraftItem[];
  subtotal: number;
  steps: Array<{ id: number; name: string; type: string; valueType: string; value: number; computedAmount: number; runningTotal: number }>;
  finalTotal: number;
  pdfCapturing: boolean;
}

const InvoicePreview: React.FC<InvoicePreviewProps> = ({
  invoiceRef, settings, proformaIdDisplay, customerName, customerCountry,
  customerFields, currency, shipTo, portOfLoading, placeOfDestination,
  finalPlaceOfDelivery, countryOfOrigin, transportationMode, paymentTerms,
  deliveryTerms, notes, items, subtotal, steps, finalTotal,
}) => {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const invoicedTo = shipTo.trim() || 'SAME AS CONSIGNEE';
  const effectivePaymentTerms = paymentTerms || settings.paymentTerms || '';
  const effectiveDeliveryTerms = deliveryTerms || settings.deliveryTerms || '';
  const effectiveNotes = notes || settings.notes || '';

  const metaRows: [string, string][] = [
    ['DATE', today],
    ['NUMBER', proformaIdDisplay],
    ['TERMS OF PAYMENT', effectivePaymentTerms || '—'],
    ['TERMS OF DELIVERY', effectiveDeliveryTerms || '—'],
    ['PORT OF LOADING', portOfLoading || '—'],
    ['TRANSACTION CURRENCY', currency],
    ['PLACE OF DESTINATION', placeOfDestination || '—'],
    ['FINAL PLACE OF DELIVERY', finalPlaceOfDelivery || '—'],
    ['COUNTRY OF ORIGIN', countryOfOrigin || '—'],
    ['TRANSPORTATION MODE', transportationMode || '—'],
  ];

  return (
    <div ref={invoiceRef} className="bg-white border border-slate-300 shadow-sm">
      {/* ─── TITLE BAR ───────────────────────────────────────────── */}
      <div className="border-b-2 border-slate-800 px-6 py-3">
        <h2 className="text-lg font-bold text-slate-800 tracking-wide">PROFORMA INVOICE</h2>
      </div>

      {/* ─── HEADER: Company (left) + Meta table (right) ────────── */}
      <div className="grid grid-cols-5 border-b border-slate-300">
        <div className="col-span-2 p-4 border-r border-slate-300">
          {settings.companyLogo && (
            <img src={settings.companyLogo} alt="Logo" className="h-12 mb-2 object-contain" crossOrigin="anonymous" />
          )}
          <div className="text-sm font-bold text-slate-800">{settings.companyName || 'Your Company Name'}</div>
          {settings.address && (
            <div className="text-[11px] text-slate-600 mt-1 whitespace-pre-line leading-relaxed">{settings.address}</div>
          )}
          <div className="text-[11px] text-slate-600 mt-1 space-y-0.5">
            {settings.phone && <div>Tel: {settings.phone}</div>}
            {settings.email && <div>{settings.email}</div>}
          </div>
        </div>
        <div className="col-span-3">
          <table className="w-full text-[11px]">
            <tbody>
              {metaRows.map(([label, value], i) => (
                <tr key={label} className={i % 2 === 0 ? 'bg-slate-50/50' : ''}>
                  <td className="px-3 py-1.5 text-slate-500 font-semibold border-b border-slate-200 w-[55%]">{label}</td>
                  <td className="px-3 py-1.5 text-slate-800 border-b border-slate-200 font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── CONSIGNEE / INVOICED TO ────────────────────────────── */}
      <div className="grid grid-cols-2 border-b border-slate-300">
        <div className="p-4 border-r border-slate-300">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Consignee</div>
          <div className="text-sm font-bold text-slate-800">{customerName}</div>
          {customerCountry && <div className="text-[11px] text-slate-600 mt-0.5">{customerCountry}</div>}
          {customerFields.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {customerFields.map((f, i) => (
                <div key={i} className="text-[11px] text-slate-600">
                  <span className="text-slate-400">{f.fieldName}:</span>{' '}
                  <span>{f.fieldValue || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Invoiced To</div>
          <div className="text-sm font-medium text-slate-800 whitespace-pre-line">{invoicedTo}</div>
        </div>
      </div>

      {/* ─── ITEMS TABLE ────────────────────────────────────────── */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-100 border-y border-slate-300">
            <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-600 uppercase tracking-wider">Description of Goods</th>
            <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-600 uppercase tracking-wider w-[100px]">Unit Price</th>
            <th className="px-3 py-2 text-center text-[10px] font-bold text-slate-600 uppercase tracking-wider w-[60px]">Qty</th>
            <th className="px-3 py-2 text-center text-[10px] font-bold text-slate-600 uppercase tracking-wider w-[60px]">Unit</th>
            <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-600 uppercase tracking-wider w-[110px]">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-xs text-slate-400 italic">
                No products added. Use the Products section on the left to add items.
              </td>
            </tr>
          ) : items.map((it, idx) => {
            const name = it.customName ?? it.productName;
            const desc = it.customDescription ?? it.productDescription;
            const price = it.customPrice ?? it.productPrice;
            const total = price * it.quantity;
            const isLast = idx === items.length - 1;
            return (
              <tr key={it.id} className={isLast ? '' : 'border-b border-slate-200'}>
                <td className="px-3 py-2 align-top">
                  <div className="text-xs font-semibold text-slate-800">{name || <span className="italic text-slate-400">Unnamed product</span>}</div>
                  {desc && <div className="text-[11px] text-slate-600 mt-0.5 whitespace-pre-line">{desc}</div>}
                  {it.productStockCode && (
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{it.productStockCode}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right align-top text-xs text-slate-700 tabular-nums">
                  {fmt(price)}
                </td>
                <td className="px-3 py-2 text-center align-top text-xs text-slate-700 tabular-nums">
                  {it.quantity}
                </td>
                <td className="px-3 py-2 text-center align-top text-[11px] text-slate-500">
                  {it.productUnit || '—'}
                </td>
                <td className="px-3 py-2 text-right align-top text-xs font-semibold text-slate-800 tabular-nums">
                  {fmt(total)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ─── TOTALS ─────────────────────────────────────────────── */}
      <div className="border-t border-slate-300 bg-slate-50/40">
        <div className="ml-auto max-w-[55%] p-4 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-semibold text-slate-800 tabular-nums">{currency} {fmt(subtotal)}</span>
          </div>
          {steps.map(s => (
            <div key={s.id} className="flex justify-between text-xs">
              <span className="text-slate-500">
                {s.type === 'subtract' ? '−' : '+'} {s.name}
                {s.valueType === 'percentage' && <span className="ml-1 text-slate-400">({s.value}%)</span>}
              </span>
              <span className={`tabular-nums font-medium ${s.computedAmount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {s.computedAmount < 0 ? '−' : '+'} {currency} {fmt(Math.abs(s.computedAmount))}
              </span>
            </div>
          ))}
          <div className="flex justify-between pt-2 mt-1 border-t-2 border-slate-800">
            <span className="text-sm font-bold text-slate-800">FINAL TOTAL</span>
            <span className="text-base font-bold text-slate-900 tabular-nums">{currency} {fmt(finalTotal)}</span>
          </div>
        </div>
      </div>

      {/* ─── BANK + NOTES ───────────────────────────────────────── */}
      {(settings.bankDetails || effectiveNotes) && (
        <div className="border-t border-slate-300 grid grid-cols-2">
          {settings.bankDetails && (
            <div className="p-4 border-r border-slate-300">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Bank Details</div>
              <div className="text-[11px] text-slate-600 font-mono whitespace-pre-line leading-relaxed">
                {settings.bankDetails}
              </div>
            </div>
          )}
          {effectiveNotes && (
            <div className={`p-4 ${settings.bankDetails ? '' : 'col-span-2'}`}>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Notes</div>
              <div className="text-[11px] text-slate-600 whitespace-pre-line leading-relaxed">{effectiveNotes}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProformaInvoiceEditor;
