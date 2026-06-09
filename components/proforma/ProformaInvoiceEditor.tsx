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
  Columns3, ArrowUp, ArrowDown, Eye, EyeOff,
} from 'lucide-react';
import { api } from '../../client/api';
import {
  Product,
  ProformaData,
  ProformaItemData,
  ProformaFinancialData,
  ProformaSettingsData,
  ProformaCustomColumn,
  CustomerData,
  CustomerFieldData,
} from '../../types';
import CustomerSelector from './CustomerSelector';
import { computeFinancials } from './FinancialsEditor';
import {
  evaluateFormula,
  computeRowTotal,
  computeSubtotal,
  FormulaColumn,
  FormulaRow,
} from '../../shared/proformaFormula';

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
  // Original persisted ordering (from the server). Used purely for
  // change-detection so a drag-reorder of unchanged rows still PATCHes
  // sortOrder. 0 for brand-new items (they always POST).
  sortOrder: number;
  // Per-row values for the proforma's user-defined custom columns. Keyed
  // by column id (NOT name). Values are stored as strings so we never
  // lose a partial entry like "12." while the user is typing; the
  // formula engine parses them lazily on read.
  customValues: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Column model — the editor and preview render columns dynamically based on
// the user's customColumns + hiddenColumns + columnOrder configuration.
// ---------------------------------------------------------------------------

// Internal display column. Both built-ins and customs are normalised to
// this shape so the rendering code can iterate uniformly.
interface DisplayColumn {
  id: string;
  label: string;
  // 'builtin' columns have hard-coded cell renderers below; the others use
  // the dynamic custom-cell renderer.
  type: 'builtin' | 'text' | 'number' | 'formula';
  // built-in columns cannot be deleted (only hidden if not required).
  builtIn: boolean;
  // 'product' (Description) and 'quantity' are required and never hidden.
  required: boolean;
  unit?: string;
  formula?: string;
}

// Canonical built-in column definitions. Order here is the legacy default
// order used when columnOrder is empty.
const BUILTIN_COLUMNS: DisplayColumn[] = [
  { id: 'product',   label: 'Description', type: 'builtin', builtIn: true, required: true  },
  { id: 'unitPrice', label: 'Unit Price',  type: 'builtin', builtIn: true, required: false },
  { id: 'quantity',  label: 'Qty',         type: 'builtin', builtIn: true, required: true  },
  { id: 'unit',      label: 'Unit',        type: 'builtin', builtIn: true, required: false },
  { id: 'total',     label: 'Total',       type: 'builtin', builtIn: true, required: false },
];

// Build the ordered list of all columns (built-in + user customs).
// columnOrder controls the explicit user-chosen order; anything not in
// columnOrder is appended in canonical / orderIndex order.
function buildColumnList(
  customCols: ProformaCustomColumn[],
  columnOrder: string[],
): DisplayColumn[] {
  const all: DisplayColumn[] = [
    ...BUILTIN_COLUMNS,
    ...customCols.map<DisplayColumn>(c => ({
      id: c.id,
      label: c.name,
      type: c.type,
      builtIn: false,
      required: false,
      unit: c.unit,
      formula: c.formula,
    })),
  ];
  if (!columnOrder || columnOrder.length === 0) return all;
  const orderMap = new Map(columnOrder.map((id, i) => [id, i]));
  // Stable sort: ordered entries first (in user order), unmatched after
  // in their original (canonical) order.
  const ordered: DisplayColumn[] = [];
  const leftover: DisplayColumn[] = [];
  for (const c of all) {
    if (orderMap.has(c.id)) ordered.push(c);
    else leftover.push(c);
  }
  ordered.sort((a, b) => orderMap.get(a.id)! - orderMap.get(b.id)!);
  return [...ordered, ...leftover];
}

// Generate a stable, opaque id for a new custom column. Crypto-random when
// available, falls back to a millisecond + counter mix.
let columnIdCounter = 0;
function newColumnId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `col_${crypto.randomUUID().slice(0, 8)}`;
    }
  } catch { /* fall through */ }
  columnIdCounter++;
  return `col_${Date.now().toString(36)}_${columnIdCounter}`;
}

// Convert our editor DraftItem into the row shape consumed by the formula
// utilities. Keeps qty / unitPrice as numbers and customValues as strings.
function toFormulaRow(it: DraftItem): FormulaRow {
  return {
    qty: it.quantity,
    unitPrice: it.customPrice ?? it.productPrice,
    customValues: it.customValues || {},
  };
}

// Convert our DisplayColumn into the FormulaColumn shape (drops the
// editor-only `builtIn`/`required` flags).
function toFormulaColumn(c: DisplayColumn): FormulaColumn {
  return { id: c.id, name: c.label, type: c.type, unit: c.unit, formula: c.formula };
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
    sortOrder: it.sortOrder ?? 0,
    customValues: (it.customValues && typeof it.customValues === 'object') ? { ...it.customValues } : {},
  };
}

// Stable JSON of customValues for change detection (so PATCH only fires
// when the user actually edited a custom cell).
function stringifyValues(v: Record<string, string> | null | undefined): string {
  if (!v) return '{}';
  const keys = Object.keys(v).sort();
  return JSON.stringify(keys.reduce<Record<string, string>>((acc, k) => { acc[k] = v[k]; return acc; }, {}));
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
  // Versioning metadata (read-only display; set during hydration).
  const [versionNum, setVersionNum] = useState<number>(1);
  const [parentProformaId, setParentProformaId] = useState<string | null>(null);

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

  // ── Custom column manager state ────────────────────────────────────────
  // User-defined extra columns, ids of currently-hidden columns and the
  // user's preferred display order (built-in + custom). All four pieces
  // are persisted on `proformas` (jsonb / text columns) and load/save as
  // a single block alongside the rest of the metadata.
  const [customColumns, setCustomColumns] = useState<ProformaCustomColumn[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  // Row-total formula override. null/'default' → qty * unit_price.
  const [totalFormula, setTotalFormula] = useState<string | null>(null);
  // Toggle for the Columns management panel inside the Products section.
  const [showColumnsPanel, setShowColumnsPanel] = useState(false);

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

  // ── Drag-and-drop reordering of the selected products list ──
  // `dragIndex` is the index of the row currently being dragged; `dragOverIndex`
  // is the row it is hovering over (used to show a drop indicator). Order is
  // persisted on save because we write sortOrder = array index.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Move an item from one position to another, returning a new array so React
  // re-renders. No-op when the indices are equal or out of range.
  const reorderItems = (from: number, to: number) => {
    setItems(prev => {
      if (
        from === to ||
        from < 0 || to < 0 ||
        from >= prev.length || to >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // Close the product search modal on Escape and reset the query, so the
  // keyboard alone can dismiss it for a faster selection workflow.
  useEffect(() => {
    if (!showProductDropdown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowProductDropdown(false);
        setProductSearch('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showProductDropdown]);

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
    originalItemsById.current = new Map(draftItems.map(d => [d.id, { ...d, customValues: { ...d.customValues } }]));

    const draftFin = (pf.financials ?? []).map(financialFromServer);
    setFinancials(draftFin);
    originalFinancialIds.current = new Set(draftFin.map(d => d.id));
    originalFinancialsById.current = new Map(draftFin.map(d => [d.id, { ...d }]));

    // Custom column manager state. We accept either `null` or an empty
    // value coming back from the server (legacy proformas have no entries).
    const cc = Array.isArray(pf.customColumns) ? (pf.customColumns as ProformaCustomColumn[]) : [];
    setCustomColumns(cc);
    setHiddenColumns(Array.isArray(pf.hiddenColumns) ? (pf.hiddenColumns as string[]) : []);
    setColumnOrder(Array.isArray(pf.columnOrder) ? (pf.columnOrder as string[]) : []);
    setTotalFormula(pf.totalFormula ?? null);

    // Versioning metadata (read-only)
    setVersionNum(pf.version ?? 1);
    setParentProformaId(pf.parentProformaId ?? null);
  }, []);

  // When the user picks a customer, mirror their fields into the preview.
  useEffect(() => {
    setCustomerFields(customer?.fields ?? []);
  }, [customer]);

  // ────────────────────────────────────────────────────────────────────────
  // Derived values — computed every render. computeFinancials is pure and
  // cheap enough to run inline.
  // ────────────────────────────────────────────────────────────────────────
  // Full ordered column list (built-ins + customs) and the visible subset
  // (required columns + non-hidden). Visible columns drive both the
  // editor's items-table rendering and the printed preview.
  const allColumns = useMemo(
    () => buildColumnList(customColumns, columnOrder),
    [customColumns, columnOrder],
  );
  const hiddenSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns]);
  const visibleColumns = useMemo(
    () => allColumns.filter(c => c.required || !hiddenSet.has(c.id)),
    [allColumns, hiddenSet],
  );
  // Reusable formula-engine column list (drops editor-only flags).
  const formulaColumns = useMemo(
    () => allColumns.map(toFormulaColumn),
    [allColumns],
  );

  // Subtotal: sum of computeRowTotal across rows. When totalFormula is
  // null/'default' this collapses to the legacy qty * unit_price math.
  const subtotal = useMemo(
    () => computeSubtotal(items.map(toFormulaRow), formulaColumns, totalFormula),
    [items, formulaColumns, totalFormula],
  );
  const calc = useMemo(
    () => computeFinancials(subtotal, financials as ProformaFinancialData[]),
    [subtotal, financials],
  );

  // Per-row line total (qty × unit_price OR custom totalFormula).
  const lineTotalFor = useCallback(
    (it: DraftItem) => computeRowTotal(toFormulaRow(it), formulaColumns, totalFormula),
    [formulaColumns, totalFormula],
  );

  // Evaluate a formula column's cell for a given row. Returns NaN when the
  // formula is empty so the cell renderer can show a tooltip explanation.
  const evalFormulaCell = useCallback(
    (it: DraftItem, col: DisplayColumn): number => {
      if (!col.formula || col.formula.trim() === '') return NaN;
      return evaluateFormula(col.formula, toFormulaRow(it), formulaColumns, totalFormula, 0);
    },
    [formulaColumns, totalFormula],
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
      sortOrder: 0,
      customValues: {},
    }]);
    // Keep the modal open and clear the query so several products can be
    // added in a row; the just-added one shows an "Added" badge.
    setProductSearch('');
  };

  const updateItem = <K extends keyof DraftItem>(id: number, field: K, value: DraftItem[K]) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };
  // Update one custom-column cell on one row. Empty strings are preserved
  // (we keep the key so empty cells are still distinguishable from "never
  // touched") but the formula engine treats both as 0.
  const updateItemCustomValue = (id: number, columnId: string, value: string) => {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const next = { ...(i.customValues || {}) };
      next[columnId] = value;
      return { ...i, customValues: next };
    }));
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
      // Custom column manager — persisted as jsonb / text on `proformas`.
      // We always send the full arrays (even empty) so deletes propagate.
      customColumns,
      hiddenColumns,
      columnOrder,
      totalFormula: totalFormula && totalFormula.trim() !== '' ? totalFormula : null,
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
            customValues: it.customValues || {},
          }));
        } else {
          const orig = originalItemsById.current.get(it.id);
          if (!orig) return;
          // Only PATCH if anything changed (customValues compared via stable
          // JSON). A pure drag-reorder counts as a change too: orig.sortOrder
          // is the persisted position and idx is the new array position.
          const changed =
            orig.customName !== it.customName ||
            orig.customDescription !== it.customDescription ||
            orig.customPrice !== it.customPrice ||
            orig.quantity !== it.quantity ||
            orig.sortOrder !== idx ||
            stringifyValues(orig.customValues) !== stringifyValues(it.customValues);
          if (changed) {
            itemWrites.push(api.updateProformaItem(it.id, {
              customName: it.customName,
              customDescription: it.customDescription,
              customPrice: it.customPrice,
              quantity: it.quantity,
              sortOrder: idx,
              customValues: it.customValues || {},
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
            {versionNum > 1 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200">
                v{versionNum}
              </span>
            )}
            {parentProformaId && (
              <span className="text-[10px] text-slate-400" title={`Version of ${parentProformaId}`}>
                from {parentProformaId}
              </span>
            )}
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
              icon={<User className="w-4 h-4 text-emerald-600" />}
              theme="emerald"
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
              icon={<Truck className="w-4 h-4 text-blue-600" />}
              theme="blue"
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
              icon={<Package className="w-4 h-4 text-amber-600" />}
              theme="amber"
              open={openSections.products}
              onToggle={() => toggleSection('products')}
              right={
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowColumnsPanel(v => !v); }}
                    className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border transition-colors ${
                      showColumnsPanel
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Manage table columns"
                  >
                    <Columns3 className="w-3.5 h-3.5" /> Columns
                  </button>
                </div>
              }
            >
              <div className="space-y-3">
                {/* Custom Column Manager (toggleable inline panel) */}
                {showColumnsPanel && (
                  <ColumnsPanel
                    allColumns={allColumns}
                    customColumns={customColumns}
                    hiddenSet={hiddenSet}
                    columnOrder={columnOrder}
                    totalFormula={totalFormula}
                    onSetCustomColumns={setCustomColumns}
                    onSetHiddenColumns={setHiddenColumns}
                    onSetColumnOrder={setColumnOrder}
                    onSetTotalFormula={setTotalFormula}
                  />
                )}
                {/* Product picker — the bar is a trigger that opens a
                    focused modal for fast searching/selecting. */}
                <button
                  type="button"
                  onClick={() => setShowProductDropdown(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-left bg-white hover:border-amber-400 hover:bg-amber-50/40 transition-colors"
                >
                  <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-sm text-slate-400">Search and add products…</span>
                  <span className="text-[10px] font-medium text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Click to search</span>
                </button>

                {showProductDropdown && (
                  // Centered modal overlay. Click the backdrop or press Esc
                  // (handled by the effect above) to close.
                  <div
                    className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-slate-900/40 backdrop-blur-sm"
                    onClick={() => { setShowProductDropdown(false); setProductSearch(''); }}
                  >
                    <div
                      className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[70vh]"
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Search input */}
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <input
                          type="text"
                          autoFocus
                          value={productSearch}
                          onChange={e => setProductSearch(e.target.value)}
                          placeholder="Search products by name, code, or supplier…"
                          className="flex-1 text-sm outline-none bg-transparent"
                        />
                        {productSearch && (
                          <button onClick={() => setProductSearch('')} className="text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => { setShowProductDropdown(false); setProductSearch(''); }}
                          className="ml-1 text-[11px] font-medium text-slate-500 border border-slate-200 rounded px-2 py-1 hover:bg-slate-50"
                        >
                          Esc
                        </button>
                      </div>

                      {/* Results */}
                      <div className="flex-1 overflow-y-auto">
                        {filteredProducts.length === 0 ? (
                          <div className="px-4 py-8 text-center text-sm text-slate-400">No products found</div>
                        ) : filteredProducts.slice(0, 50).map(p => {
                          const already = items.some(i => i.productId === p.id);
                          return (
                            <button
                              key={p.id}
                              onClick={() => !already && addProduct(p)}
                              disabled={already}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors border-b border-slate-50 last:border-b-0 ${
                                already ? 'opacity-40 cursor-not-allowed bg-slate-50' : 'hover:bg-amber-50 cursor-pointer'
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

                      {/* Footer hint */}
                      <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
                        <span>{filteredProducts.length} match{filteredProducts.length !== 1 ? 'es' : ''}</span>
                        <span>Press Esc to close</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Items list — each card renders the visible columns dynamically */}
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
                      // We always render Description (product) at the card top.
                      // The remaining visible columns are placed in a 2-col grid below.
                      const productVisible = visibleColumns.some(c => c.id === 'product');
                      const otherCols = visibleColumns.filter(c => c.id !== 'product');
                      return (
                        <div
                          key={it.id}
                          onDragOver={e => {
                            // Allow dropping and track the hovered row for the indicator.
                            e.preventDefault();
                            if (dragIndex !== null && dragOverIndex !== idx) setDragOverIndex(idx);
                          }}
                          onDrop={e => {
                            e.preventDefault();
                            if (dragIndex !== null) reorderItems(dragIndex, idx);
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          className={`border rounded-lg bg-white p-3 space-y-2 transition-all ${
                            dragIndex === idx
                              ? 'opacity-50 border-amber-400 ring-2 ring-amber-400/30'
                              : dragOverIndex === idx
                                ? 'border-amber-400 border-dashed'
                                : 'border-slate-200'
                          }`}
                        >
                          {/* Header row: drag handle + name + reset/delete actions */}
                          {productVisible && (
                            <>
                              <div className="flex items-start gap-2">
                                <span
                                  draggable
                                  onDragStart={() => { setDragIndex(idx); setDragOverIndex(idx); }}
                                  onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                                  title="Drag to reorder"
                                  className="mt-0.5 flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-300 hover:text-amber-500 transition-colors"
                                >
                                  <GripVertical className="w-4 h-4" />
                                </span>
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
                            </>
                          )}

                          {/* Dynamic columns grid — built-ins + customs */}
                          {otherCols.length > 0 && (
                            <div className="grid grid-cols-2 gap-2">
                              {otherCols.map(col => {
                                // ── Built-in columns ──
                                if (col.id === 'unitPrice') {
                                  return (
                                    <div key={col.id}>
                                      <Label small>{col.label}</Label>
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
                                  );
                                }
                                if (col.id === 'quantity') {
                                  return (
                                    <div key={col.id}>
                                      <Label small>{col.label}</Label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={it.quantity}
                                        onChange={e => updateItem(it.id, 'quantity', parseFloat(e.target.value) || 0)}
                                        className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                                      />
                                    </div>
                                  );
                                }
                                if (col.id === 'unit') {
                                  return (
                                    <div key={col.id}>
                                      <Label small>{col.label}</Label>
                                      <div className="px-2 py-1 text-sm text-slate-600 bg-slate-50 rounded border border-slate-100">
                                        {it.productUnit || '—'}
                                      </div>
                                    </div>
                                  );
                                }
                                if (col.id === 'total') {
                                  // When the user-supplied totalFormula is broken,
                                  // computeRowTotal returns NaN; surface as '—' with
                                  // a tooltip so the source of the error is obvious.
                                  const lt = lineTotalFor(it);
                                  const ltOk = Number.isFinite(lt);
                                  return (
                                    <div key={col.id}>
                                      <Label small>{col.label}</Label>
                                      <div
                                        className={`px-2 py-1 text-sm font-semibold rounded ${
                                          ltOk ? 'text-slate-700 bg-slate-50'
                                               : 'text-amber-700 bg-amber-50 border border-amber-200'
                                        }`}
                                        title={ltOk ? undefined : 'Row total formula is invalid — check the formula in the Columns panel.'}
                                      >
                                        {ltOk ? `${currency} ${fmt(lt)}` : '—'}
                                      </div>
                                    </div>
                                  );
                                }
                                // ── Custom text column ──
                                if (col.type === 'text') {
                                  return (
                                    <div key={col.id}>
                                      <Label small>{col.label}{col.unit ? ` (${col.unit})` : ''}</Label>
                                      <input
                                        type="text"
                                        value={it.customValues?.[col.id] ?? ''}
                                        onChange={e => updateItemCustomValue(it.id, col.id, e.target.value)}
                                        className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                                      />
                                    </div>
                                  );
                                }
                                // ── Custom number column ──
                                if (col.type === 'number') {
                                  return (
                                    <div key={col.id}>
                                      <Label small>{col.label}{col.unit ? ` (${col.unit})` : ''}</Label>
                                      <input
                                        type="number"
                                        step="any"
                                        value={it.customValues?.[col.id] ?? ''}
                                        onChange={e => updateItemCustomValue(it.id, col.id, e.target.value)}
                                        className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                                      />
                                    </div>
                                  );
                                }
                                // ── Custom formula column (read-only) ──
                                if (col.type === 'formula') {
                                  const v = evalFormulaCell(it, col);
                                  const display = Number.isFinite(v) ? fmt(v) : '—';
                                  return (
                                    <div key={col.id}>
                                      <Label small>
                                        <span className="inline-flex items-center gap-1">
                                          <span className="text-blue-500 font-bold">ƒ</span>
                                          {col.label}{col.unit ? ` (${col.unit})` : ''}
                                        </span>
                                      </Label>
                                      <div
                                        className="px-2 py-1 text-sm font-medium text-slate-700 bg-blue-50/40 rounded border border-blue-100"
                                        title={col.formula ? `= ${col.formula}` : 'No formula set'}
                                      >
                                        {display}
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })}
                            </div>
                          )}

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
              icon={<Calculator className="w-4 h-4 text-purple-600" />}
              theme="purple"
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
              icon={<StickyNote className="w-4 h-4 text-rose-600" />}
              theme="rose"
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
                visibleColumns={visibleColumns}
                lineTotalFor={lineTotalFor}
                evalFormulaCell={evalFormulaCell}
                onUpdateItem={updateItem}
                onUpdateCustomValue={updateItemCustomValue}
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

type SectionTheme = 'emerald' | 'blue' | 'amber' | 'purple' | 'rose';

const THEME_STYLES: Record<SectionTheme, {
  headerBg: string;
  headerHover: string;
  headerBorder: string;
  text: string;
  icon: string;
  chevron: string;
  bodyBorder: string;
}> = {
  emerald: {
    headerBg: 'bg-emerald-50',
    headerHover: 'hover:bg-emerald-100',
    headerBorder: 'border-emerald-100',
    text: 'text-emerald-800',
    icon: 'text-emerald-600',
    chevron: 'text-emerald-500',
    bodyBorder: 'border-emerald-200',
  },
  blue: {
    headerBg: 'bg-blue-50',
    headerHover: 'hover:bg-blue-100',
    headerBorder: 'border-blue-100',
    text: 'text-blue-800',
    icon: 'text-blue-600',
    chevron: 'text-blue-500',
    bodyBorder: 'border-blue-200',
  },
  amber: {
    headerBg: 'bg-amber-50',
    headerHover: 'hover:bg-amber-100',
    headerBorder: 'border-amber-100',
    text: 'text-amber-800',
    icon: 'text-amber-600',
    chevron: 'text-amber-500',
    bodyBorder: 'border-amber-200',
  },
  purple: {
    headerBg: 'bg-purple-50',
    headerHover: 'hover:bg-purple-100',
    headerBorder: 'border-purple-100',
    text: 'text-purple-800',
    icon: 'text-purple-600',
    chevron: 'text-purple-500',
    bodyBorder: 'border-purple-200',
  },
  rose: {
    headerBg: 'bg-rose-50',
    headerHover: 'hover:bg-rose-100',
    headerBorder: 'border-rose-100',
    text: 'text-rose-800',
    icon: 'text-rose-600',
    chevron: 'text-rose-500',
    bodyBorder: 'border-rose-200',
  },
};

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
  theme?: SectionTheme;
  children: React.ReactNode;
}> = ({ title, icon, open, onToggle, right, theme = 'emerald', children }) => {
  const t = THEME_STYLES[theme];
  return (
    // Outer is a div (not <button>) so callers can nest interactive controls
    // (e.g. the Columns toggle in `right`) without producing invalid
    // <button>-in-<button> HTML and the React hydration warning that follows.
    <div className={`bg-white rounded-xl border ${t.bodyBorder} overflow-hidden shadow-sm`}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className={`w-full flex items-center justify-between px-4 py-3 ${t.headerBg} ${t.headerHover} transition-colors border-b ${t.headerBorder} cursor-pointer select-none`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <h3 className={`text-sm font-semibold ${t.text}`}>{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {right}
          {open ? <ChevronUp className={`w-4 h-4 ${t.chevron}`} /> : <ChevronDown className={`w-4 h-4 ${t.chevron}`} />}
        </div>
      </div>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
};

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
// ColumnsPanel — inline manager for custom columns + total formula
// =============================================================================
// Lives inside the Products section of the editor. Lets the user toggle
// visibility, reorder (up/down), rename and remove columns; add new
// text/number/formula columns; apply a Discount % preset; and override the
// row-total formula. All state is owned by the parent editor.
// =============================================================================

interface ColumnsPanelProps {
  allColumns: DisplayColumn[];
  customColumns: ProformaCustomColumn[];
  hiddenSet: Set<string>;
  columnOrder: string[];
  totalFormula: string | null;
  onSetCustomColumns: (cols: ProformaCustomColumn[]) => void;
  onSetHiddenColumns: (ids: string[]) => void;
  onSetColumnOrder: (ids: string[]) => void;
  onSetTotalFormula: (f: string | null) => void;
}

const ColumnsPanel: React.FC<ColumnsPanelProps> = ({
  allColumns, customColumns, hiddenSet, columnOrder, totalFormula,
  onSetCustomColumns, onSetHiddenColumns, onSetColumnOrder, onSetTotalFormula,
}) => {
  // ── Local form state for the "Add Column" sub-form ──
  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState<'text' | 'number' | 'formula'>('text');
  const [draftUnit, setDraftUnit] = useState('');
  const [draftFormula, setDraftFormula] = useState('');

  // ── Local state for the row-total formula override ──
  // 'default' means qty × unit_price (legacy behavior).
  const isCustomTotal = !!totalFormula && totalFormula.trim() !== '';
  const [totalDraft, setTotalDraft] = useState(totalFormula ?? '');
  // Keep the draft in sync if the parent ever resets it (e.g. preset button).
  useEffect(() => { setTotalDraft(totalFormula ?? ''); }, [totalFormula]);

  // Reorder helper: move column id `id` by `delta` (-1 up, +1 down) within
  // the allColumns visual order. We materialise the current full order from
  // `allColumns` (which already respects the persisted columnOrder) and write
  // the swapped result back.
  const move = (id: string, delta: number) => {
    const order = allColumns.map(c => c.id);
    const idx = order.indexOf(id);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= order.length) return;
    [order[idx], order[target]] = [order[target], order[idx]];
    onSetColumnOrder(order);
  };

  // Toggle hidden state for one column. 'product' / 'quantity' are required
  // and silently ignored.
  const toggleHidden = (col: DisplayColumn) => {
    if (col.required) return;
    const next = new Set(hiddenSet);
    if (next.has(col.id)) next.delete(col.id);
    else next.add(col.id);
    onSetHiddenColumns(Array.from(next));
  };

  // Rename a custom column (label only — id is stable).
  const renameCustom = (id: string, name: string) => {
    onSetCustomColumns(customColumns.map(c => c.id === id ? { ...c, name } : c));
  };
  // Update unit of a custom column.
  const setCustomUnit = (id: string, unit: string) => {
    onSetCustomColumns(customColumns.map(c => c.id === id ? { ...c, unit: unit.trim() === '' ? undefined : unit } : c));
  };
  // Update formula on a formula-type custom column.
  const setCustomFormula = (id: string, formula: string) => {
    onSetCustomColumns(customColumns.map(c => c.id === id ? { ...c, formula } : c));
  };
  // Delete a custom column. Also strips its id from columnOrder + hiddenColumns
  // so we don't leak orphan ids into the persisted state.
  const deleteCustom = (id: string) => {
    onSetCustomColumns(customColumns.filter(c => c.id !== id));
    if (columnOrder.includes(id)) onSetColumnOrder(columnOrder.filter(o => o !== id));
    if (hiddenSet.has(id)) onSetHiddenColumns(Array.from(hiddenSet).filter(h => h !== id));
  };

  // Add a brand-new column from the draft form.
  const addColumn = () => {
    const name = draftName.trim();
    if (!name) return;
    const newCol: ProformaCustomColumn = {
      id: newColumnId(),
      name,
      type: draftType,
      ...(draftUnit.trim() ? { unit: draftUnit.trim() } : {}),
      ...(draftType === 'formula' ? { formula: draftFormula } : {}),
    };
    onSetCustomColumns([...customColumns, newCol]);
    setDraftName('');
    setDraftUnit('');
    setDraftFormula('');
  };

  // "Discount %" preset: adds a number column AND sets the total formula.
  // Idempotent — if a column called "Discount %" already exists we reuse it.
  const applyDiscountPreset = () => {
    let discount = customColumns.find(c => c.name.toLowerCase() === 'discount %');
    let nextCustoms = customColumns;
    if (!discount) {
      discount = { id: newColumnId(), name: 'Discount %', type: 'number', unit: '%' };
      nextCustoms = [...customColumns, discount];
      onSetCustomColumns(nextCustoms);
    }
    const formula = `{qty} * {unit_price} * (1 - {col:${discount.name}} / 100)`;
    onSetTotalFormula(formula);
  };

  return (
    <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Columns</h4>
        <span className="text-[10px] text-slate-500">
          {allColumns.length} total · {allColumns.length - hiddenSet.size} visible
        </span>
      </div>

      {/* Column list — one row each */}
      <div className="space-y-1">
        {allColumns.map((col, idx) => {
          const isHidden = hiddenSet.has(col.id);
          const isFirst = idx === 0;
          const isLast = idx === allColumns.length - 1;
          return (
            <div
              key={col.id}
              className={`flex items-start gap-2 px-2 py-1.5 rounded border ${
                isHidden ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleHidden(col)}
                disabled={col.required}
                title={col.required ? 'Required column' : isHidden ? 'Show column' : 'Hide column'}
                className={`mt-1 ${col.required ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-blue-600'}`}
              >
                {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  {col.builtIn ? (
                    <span className="text-xs font-medium text-slate-700">{col.label}</span>
                  ) : (
                    <input
                      type="text"
                      value={col.label}
                      onChange={e => renameCustom(col.id, e.target.value)}
                      className="flex-1 px-1.5 py-0.5 text-xs font-medium text-slate-700 border border-slate-200 rounded focus:outline-none focus:border-blue-400"
                    />
                  )}
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                    {col.type === 'builtin' ? 'built-in' : col.type}
                  </span>
                  {col.required && (
                    <span className="text-[10px] text-amber-600 uppercase tracking-wide">required</span>
                  )}
                </div>
                {!col.builtIn && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={col.unit ?? ''}
                      onChange={e => setCustomUnit(col.id, e.target.value)}
                      placeholder="unit (optional, e.g. kg, %)"
                      className="w-32 px-1.5 py-0.5 text-[11px] text-slate-600 border border-slate-200 rounded focus:outline-none focus:border-blue-400"
                    />
                    {col.type === 'formula' && (
                      <input
                        type="text"
                        value={col.formula ?? ''}
                        onChange={e => setCustomFormula(col.id, e.target.value)}
                        placeholder="e.g. {qty} * {unit_price} * 0.9"
                        className="flex-1 px-1.5 py-0.5 text-[11px] font-mono text-slate-600 border border-slate-200 rounded focus:outline-none focus:border-blue-400"
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => move(col.id, -1)}
                  disabled={isFirst}
                  className="p-0.5 text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-400"
                  title="Move up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(col.id, 1)}
                  disabled={isLast}
                  className="p-0.5 text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-400"
                  title="Move down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                {!col.builtIn && (
                  <button
                    type="button"
                    onClick={() => deleteCustom(col.id)}
                    className="p-0.5 text-slate-300 hover:text-red-500"
                    title="Delete column"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add column form */}
      <div className="border-t border-blue-200 pt-3 space-y-2">
        <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Add Column</div>
        <div className="grid grid-cols-12 gap-2">
          <input
            type="text"
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            placeholder="Column name"
            className="col-span-4 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400"
          />
          <select
            value={draftType}
            onChange={e => setDraftType(e.target.value as 'text' | 'number' | 'formula')}
            className="col-span-3 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400 bg-white"
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="formula">Formula</option>
          </select>
          <input
            type="text"
            value={draftUnit}
            onChange={e => setDraftUnit(e.target.value)}
            placeholder="Unit"
            className="col-span-2 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400"
          />
          <button
            type="button"
            onClick={addColumn}
            disabled={draftName.trim() === ''}
            className="col-span-3 flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
          {draftType === 'formula' && (
            <input
              type="text"
              value={draftFormula}
              onChange={e => setDraftFormula(e.target.value)}
              placeholder="Formula — e.g. {qty} * {unit_price} * 0.9 or {col:Discount %}"
              className="col-span-12 px-2 py-1 text-[11px] font-mono border border-slate-200 rounded focus:outline-none focus:border-blue-400"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={applyDiscountPreset}
            className="text-[11px] font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 px-2 py-1 rounded inline-flex items-center gap-1"
            title="Adds a Discount % column and sets row total = qty × unit_price × (1 − Discount % / 100)"
          >
            <Percent className="w-3.5 h-3.5" /> Apply Discount % Preset
          </button>
          <span className="text-[10px] text-slate-500">
            Tokens: <code className="bg-slate-100 px-1 rounded">{'{qty}'}</code>{' '}
            <code className="bg-slate-100 px-1 rounded">{'{unit_price}'}</code>{' '}
            <code className="bg-slate-100 px-1 rounded">{'{total}'}</code>{' '}
            <code className="bg-slate-100 px-1 rounded">{'{col:Name}'}</code>
          </span>
        </div>
      </div>

      {/* Row total formula override */}
      <div className="border-t border-blue-200 pt-3 space-y-2">
        <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Row Total Formula</div>
        <div className="flex items-center gap-3 text-xs">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="totalMode"
              checked={!isCustomTotal}
              onChange={() => onSetTotalFormula(null)}
            />
            <span>Default (qty × unit_price)</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="totalMode"
              checked={isCustomTotal}
              onChange={() => onSetTotalFormula(totalDraft.trim() === '' ? '{qty} * {unit_price}' : totalDraft)}
            />
            <span>Custom formula</span>
          </label>
        </div>
        {isCustomTotal && (
          <input
            type="text"
            value={totalDraft}
            onChange={e => { setTotalDraft(e.target.value); onSetTotalFormula(e.target.value); }}
            placeholder="e.g. {qty} * {unit_price} * (1 - {col:Discount %} / 100)"
            className="w-full px-2 py-1 text-[11px] font-mono border border-slate-200 rounded focus:outline-none focus:border-blue-400"
          />
        )}
      </div>
    </div>
  );
};

// =============================================================================
// InvoicePreview — live invoice document for the right column. Most cells are
// inline-editable (name, description, unit price, qty, custom text/number);
// computed columns (total/formula) and the catalog unit stay read-only. During
// PDF capture the inputs flip to plain text for a clean export.
// =============================================================================
// Visually mirrors the legacy ProformaPreview component. Driven entirely by
// props (including inline-edit handlers) so it stays in sync with the editor.
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
  // Visible columns to render in the preview's items table. Driven by the
  // editor's column-manager state and the proforma's persisted config.
  visibleColumns: DisplayColumn[];
  // Helpers from the editor — keep all formula evaluation in one place so the
  // preview cannot drift from the editor.
  lineTotalFor: (it: DraftItem) => number;
  evalFormulaCell: (it: DraftItem, col: DisplayColumn) => number;
  // Inline-edit handlers (shared with the editor card so both surfaces stay
  // in sync). Computed columns (total/formula) and the catalog-derived unit
  // are intentionally NOT editable.
  onUpdateItem: <K extends keyof DraftItem>(id: number, field: K, value: DraftItem[K]) => void;
  onUpdateCustomValue: (id: number, columnId: string, value: string) => void;
}

const InvoicePreview: React.FC<InvoicePreviewProps> = ({
  invoiceRef, settings, proformaIdDisplay, customerName, customerCountry,
  customerFields, currency, shipTo, portOfLoading, placeOfDestination,
  finalPlaceOfDelivery, countryOfOrigin, transportationMode, paymentTerms,
  deliveryTerms, notes, items, subtotal, steps, finalTotal, pdfCapturing,
  visibleColumns, lineTotalFor, evalFormulaCell, onUpdateItem, onUpdateCustomValue,
}) => {
  // While capturing the PDF we render plain text instead of <input> elements
  // so the exported document is clean (no focus rings / caret artifacts).
  const editable = !pdfCapturing;
  // Shared classes for the borderless "looks like text until you hover" inputs.
  const inlineBase =
    'w-full bg-transparent border border-transparent rounded px-1 -mx-1 ' +
    'hover:border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors';
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

      {/* ─── ITEMS TABLE (dynamic columns) ─────────────────────── */}
      {/* Header alignment / width by column id. Built-ins keep their legacy
          look; customs default to right-align (numbers feel correct that way). */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-100 border-y border-slate-300">
            {visibleColumns.map(col => {
              const align = col.id === 'product' ? 'text-left'
                          : col.id === 'quantity' || col.id === 'unit' ? 'text-center'
                          : 'text-right';
              const w = col.id === 'product' ? '' :
                        col.id === 'unitPrice' ? 'w-[100px]' :
                        col.id === 'quantity' ? 'w-[60px]' :
                        col.id === 'unit' ? 'w-[60px]' :
                        col.id === 'total' ? 'w-[110px]' :
                        'w-[100px]';
              const label = col.id === 'product' ? 'Description of Goods' : col.label;
              return (
                <th key={col.id} className={`px-3 py-2 ${align} text-[10px] font-bold text-slate-600 uppercase tracking-wider ${w}`}>
                  {label}{col.unit && col.id !== 'unit' ? ` (${col.unit})` : ''}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={Math.max(visibleColumns.length, 1)} className="px-3 py-8 text-center text-xs text-slate-400 italic">
                No products added. Use the Products section on the left to add items.
              </td>
            </tr>
          ) : items.map((it, idx) => {
            const name = it.customName ?? it.productName;
            const desc = it.customDescription ?? it.productDescription;
            const price = it.customPrice ?? it.productPrice;
            const isLast = idx === items.length - 1;
            // Auto-size the description box to its content (1–6 rows) so the
            // editable preview keeps roughly the same height as the print view.
            const descRows = Math.min(6, Math.max(1, (desc || '').split('\n').length));
            return (
              <tr key={it.id} className={isLast ? '' : 'border-b border-slate-200'}>
                {visibleColumns.map(col => {
                  // ── Description of goods: name + description (editable) ──
                  if (col.id === 'product') {
                    return (
                      <td key={col.id} className="px-3 py-2 align-top">
                        {editable ? (
                          <>
                            <input
                              type="text"
                              value={name}
                              placeholder="Unnamed product"
                              onChange={e => onUpdateItem(it.id, 'customName', e.target.value)}
                              className={`${inlineBase} text-xs font-semibold text-slate-800 placeholder:italic placeholder:text-slate-400`}
                            />
                            <textarea
                              value={desc}
                              rows={descRows}
                              placeholder="Description"
                              onChange={e => onUpdateItem(it.id, 'customDescription', e.target.value)}
                              className={`${inlineBase} text-[11px] text-slate-600 mt-0.5 resize-none whitespace-pre-line`}
                            />
                          </>
                        ) : (
                          <>
                            <div className="text-xs font-semibold text-slate-800">{name || <span className="italic text-slate-400">Unnamed product</span>}</div>
                            {desc && <div className="text-[11px] text-slate-600 mt-0.5 whitespace-pre-line">{desc}</div>}
                          </>
                        )}
                        {it.productStockCode && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{it.productStockCode}</div>
                        )}
                      </td>
                    );
                  }
                  // ── Unit price (editable number; falls back to catalog) ──
                  if (col.id === 'unitPrice') {
                    return (
                      <td key={col.id} className="px-3 py-2 text-right align-top text-xs text-slate-700 tabular-nums">
                        {editable ? (
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={price}
                            onChange={e => {
                              // Guard transient invalid input ("-", ".") — keep
                              // null rather than writing NaN into the price.
                              const parsed = parseFloat(e.target.value);
                              onUpdateItem(it.id, 'customPrice', e.target.value === '' || !Number.isFinite(parsed) ? null : parsed);
                            }}
                            className={`${inlineBase} text-right tabular-nums`}
                          />
                        ) : fmt(price)}
                      </td>
                    );
                  }
                  // ── Quantity (editable number) ──
                  if (col.id === 'quantity') {
                    return (
                      <td key={col.id} className="px-3 py-2 text-center align-top text-xs text-slate-700 tabular-nums">
                        {editable ? (
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={it.quantity}
                            onChange={e => onUpdateItem(it.id, 'quantity', parseFloat(e.target.value) || 0)}
                            className={`${inlineBase} text-center tabular-nums`}
                          />
                        ) : it.quantity}
                      </td>
                    );
                  }
                  // ── Unit: catalog-derived, not editable inline ──
                  if (col.id === 'unit') {
                    return (
                      <td key={col.id} className="px-3 py-2 text-center align-top text-[11px] text-slate-500">
                        {it.productUnit || '—'}
                      </td>
                    );
                  }
                  // ── Total: computed, not editable ──
                  if (col.id === 'total') {
                    // Mirror the editor: render '—' when the totalFormula is broken
                    // so the printed/exported preview never silently shows 0.
                    const lt = lineTotalFor(it);
                    return (
                      <td key={col.id} className="px-3 py-2 text-right align-top text-xs font-semibold text-slate-800 tabular-nums">
                        {Number.isFinite(lt) ? fmt(lt) : '—'}
                      </td>
                    );
                  }
                  // ── Custom text column (editable) ──
                  if (col.type === 'text') {
                    return (
                      <td key={col.id} className="px-3 py-2 text-right align-top text-xs text-slate-700">
                        {editable ? (
                          <input
                            type="text"
                            value={it.customValues?.[col.id] ?? ''}
                            onChange={e => onUpdateCustomValue(it.id, col.id, e.target.value)}
                            className={`${inlineBase} text-right`}
                          />
                        ) : (it.customValues?.[col.id] || '—')}
                      </td>
                    );
                  }
                  // ── Custom number column (editable) ──
                  if (col.type === 'number') {
                    const raw = it.customValues?.[col.id];
                    const n = raw == null || raw === '' ? null : parseFloat(raw);
                    return (
                      <td key={col.id} className="px-3 py-2 text-right align-top text-xs text-slate-700 tabular-nums">
                        {editable ? (
                          <input
                            type="number"
                            step="any"
                            value={raw ?? ''}
                            onChange={e => onUpdateCustomValue(it.id, col.id, e.target.value)}
                            className={`${inlineBase} text-right tabular-nums`}
                          />
                        ) : (n == null || !Number.isFinite(n) ? '—' : fmt(n))}
                      </td>
                    );
                  }
                  // ── Custom formula column: computed, not editable ──
                  if (col.type === 'formula') {
                    const v = evalFormulaCell(it, col);
                    return (
                      <td key={col.id} className="px-3 py-2 text-right align-top text-xs text-slate-700 tabular-nums">
                        {Number.isFinite(v) ? fmt(v) : '—'}
                      </td>
                    );
                  }
                  return <td key={col.id} />;
                })}
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
