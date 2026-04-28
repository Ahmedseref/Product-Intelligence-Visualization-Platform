import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Search, X, ArrowLeft, Save, Type, Hash, Pencil, Columns3, Eye, EyeOff, Check } from 'lucide-react';
import { api } from '../../client/api';
import { Product, ProformaData, ProformaSettingsData, ProformaItemData, ProformaCustomColumn, ProformaHideableBuiltin } from '../../types';
import CustomerSelector from './CustomerSelector';
import { useRefreshContext } from '../../client/contexts/RefreshContext';

interface ProformaEditProps {
  proformaId: string;
  products: Product[];
  onSaved: (proformaId: string) => void;
  onCancel: () => void;
}

interface EditItem {
  id?: number;
  product: Product;
  quantity: number;
  customPrice?: number | null;
  customName?: string | null;
  customDescription?: string | null;
  // Per-row values for the user-defined customColumns. Stored as strings so
  // partial input (like "12.") is preserved while typing in number columns.
  customValues: Record<string, string>;
  isNew?: boolean;
}

// IDs of the built-in columns. Custom columns are inserted relative to one of
// these (or another custom column) using "left" / "right" anchors.
type BuiltInColumnId = 'product' | 'unitPrice' | 'customPrice' | 'quantity' | 'total';

// Generate a stable id for a new custom column. Doesn't need to be globally
// unique — only unique within the proforma's customColumns array.
const newColumnId = (): string =>
  `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY', 'AED', 'SAR', 'CNY', 'JPY'];

const ProformaEdit: React.FC<ProformaEditProps> = ({ proformaId, products, onSaved, onCancel }) => {
  const { lockEditing, unlockEditing } = useRefreshContext();
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('USD');
  const [notes, setNotes] = useState('');
  const [shipTo, setShipTo] = useState('');
  const [portOfLoading, setPortOfLoading] = useState('');
  const [placeOfDestination, setPlaceOfDestination] = useState('');
  const [finalPlaceOfDelivery, setFinalPlaceOfDelivery] = useState('');
  const [countryOfOrigin, setCountryOfOrigin] = useState('');
  const [transportationMode, setTransportationMode] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerCountry, setCustomerCountry] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [status, setStatus] = useState('draft');
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [removedItemIds, setRemovedItemIds] = useState<number[]>([]);
  // User-defined extra columns for the items table. Persisted on the proforma.
  // Position relative to the built-in columns is computed from orderIndex.
  const [customColumns, setCustomColumns] = useState<ProformaCustomColumn[]>([]);
  // IDs of columns the user has chosen to hide. Includes both built-in ids
  // ('unit' / 'unitPrice' / 'total' — note 'customPrice' is editor-only and
  // is always shown while editing) and ids of custom columns.
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  // Toggle for the "Columns" management panel.
  const [showColumnsPanel, setShowColumnsPanel] = useState(false);
  // Pending values for the "Add column" form inside the panel.
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<'text' | 'number'>('text');
  // Insert position for the new column. Stores the column id of the anchor
  // and which side of it ('left' | 'right'). Default = right of 'total' (end).
  const [newColPos, setNewColPos] = useState<{ relativeTo: string; side: 'left' | 'right' }>({ relativeTo: 'total', side: 'right' });
  // Inline rename state for an existing custom column.
  const [renameColId, setRenameColId] = useState<string | null>(null);
  const [renameColName, setRenameColName] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProformaSettingsData>({});

  useEffect(() => {
    lockEditing();
    return () => unlockEditing();
  }, [lockEditing, unlockEditing]);

  const loadProforma = useCallback(async () => {
    setLoading(true);
    try {
      const [pf, s] = await Promise.all([
        api.getProforma(proformaId),
        api.getProformaSettings(),
      ]);
      setSettings(s || {});
      setCurrency(pf.currency || s?.defaultCurrency || 'USD');
      setNotes(pf.notes || '');
      setShipTo(pf.shipTo || '');
      setPortOfLoading(pf.portOfLoading || '');
      setPlaceOfDestination(pf.placeOfDestination || '');
      setFinalPlaceOfDelivery(pf.finalPlaceOfDelivery || '');
      setCountryOfOrigin(pf.countryOfOrigin || '');
      setTransportationMode(pf.transportationMode || '');
      setPaymentTerms(pf.paymentTerms || '');
      setDeliveryTerms(pf.deliveryTerms || '');
      setCustomerName(pf.customerName || '');
      setCustomerCountry(pf.customerCountry || '');
      setCustomerContact(pf.customerContact || '');
      setStatus(pf.status || 'draft');
      // Load any user-defined columns saved on this proforma. Fall back to []
      // so older proformas (created before this feature shipped) still work.
      const cols: ProformaCustomColumn[] = Array.isArray((pf as any).customColumns)
        ? ((pf as any).customColumns as ProformaCustomColumn[])
        : [];
      setCustomColumns(cols);
      const hidden: string[] = Array.isArray((pf as any).hiddenColumns)
        ? ((pf as any).hiddenColumns as string[])
        : [];
      setHiddenColumns(hidden);

      const items: ProformaItemData[] = pf.items || [];
      const mapped: EditItem[] = items.map((item: any) => {
        const prod = products.find(p => p.id === item.productId) || {
          id: item.productId,
          name: item.productName || 'Unknown',
          description: item.productDescription || '',
          price: item.productPrice || 0,
          currency: item.productCurrency || '',
          stockCode: item.productStockCode || '',
          supplier: item.productSupplier || '',
          unit: item.productUnit || '',
        } as Product;
        return {
          id: item.id,
          product: prod,
          quantity: item.quantity,
          customPrice: item.customPrice,
          customName: item.customName,
          customDescription: item.customDescription,
          // Coerce stored values to strings so the input fields can render
          // them directly. Missing keys default to ''.
          customValues: item.customValues && typeof item.customValues === 'object'
            ? Object.fromEntries(Object.entries(item.customValues as Record<string, unknown>).map(([k, v]) => [k, v == null ? '' : String(v)]))
            : {},
        };
      });
      setEditItems(mapped);
    } catch (e) {
      console.error(e);
      setError('Failed to load proforma data.');
    } finally {
      setLoading(false);
    }
  }, [proformaId, products]);

  useEffect(() => { loadProforma(); }, [loadProforma]);

  const filteredProducts = products.filter(p => {
    if (!productSearch.trim()) return true;
    const q = productSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.stockCode || '').toLowerCase().includes(q) ||
      (p.supplier || '').toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  }).slice(0, 20);

  const addProduct = (product: Product) => {
    if (editItems.some(i => i.product.id === product.id)) return;
    // customValues starts empty — it'll be filled in as the user types into
    // any user-defined custom column cells for this row.
    setEditItems(prev => [...prev, { product, quantity: 1, isNew: true, customValues: {} }]);
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const removeItem = (idx: number) => {
    const item = editItems[idx];
    if (item.id) {
      setRemovedItemIds(prev => [...prev, item.id!]);
    }
    setEditItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateQty = (idx: number, qty: number) => {
    setEditItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, quantity: Math.max(0.001, qty) } : item
    ));
  };

  const updateCustomPrice = (idx: number, price: string) => {
    const val = price === '' ? null : parseFloat(price);
    setEditItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, customPrice: val } : item
    ));
  };

  // ---------------------------------------------------------------------------
  // Custom columns — add / rename / delete + per-row value updates
  // ---------------------------------------------------------------------------

  // Returns the customColumns array sorted ascending by orderIndex. The order
  // of insertion into the source array isn't trustworthy, so we always sort
  // before rendering.
  const sortedColumns = [...customColumns].sort((a, b) => a.orderIndex - b.orderIndex);

  // Compute the orderIndex for a brand-new column inserted on a given side of
  // an anchor column. We reserve "slots" 0..N for the built-in columns by
  // assigning each built-in a virtual integer position, then place the new
  // custom column halfway between its anchor and the next column on that side.
  const builtinSlot: Record<BuiltInColumnId, number> = {
    product: 1000,
    unitPrice: 2000,
    customPrice: 3000,
    quantity: 4000,
    total: 5000,
  };
  const slotForColumn = (id: string): number => {
    if ((builtinSlot as Record<string, number>)[id] !== undefined) return builtinSlot[id as BuiltInColumnId];
    const c = customColumns.find(x => x.id === id);
    return c ? c.orderIndex : 0;
  };
  const computeNewOrderIndex = (relativeTo: string, side: 'left' | 'right'): number => {
    const anchor = slotForColumn(relativeTo);
    // Find the nearest existing column on the chosen side (built-in or custom).
    const allSlots = [
      ...Object.values(builtinSlot),
      ...customColumns.map(c => c.orderIndex),
    ].sort((a, b) => a - b);
    if (side === 'left') {
      const prev = [...allSlots].reverse().find(s => s < anchor);
      return prev === undefined ? anchor - 100 : (prev + anchor) / 2;
    }
    const next = allSlots.find(s => s > anchor);
    return next === undefined ? anchor + 100 : (anchor + next) / 2;
  };

  const confirmAddColumn = () => {
    const name = newColName.trim();
    if (!name) return;
    const col: ProformaCustomColumn = {
      id: newColumnId(),
      name,
      type: newColType,
      orderIndex: computeNewOrderIndex(newColPos.relativeTo, newColPos.side),
    };
    setCustomColumns(prev => [...prev, col]);
    setNewColName('');
    setNewColType('text');
    // Default the next add to "right of the column we just inserted" so
    // adding several columns in a row places them in the order the user types.
    setNewColPos({ relativeTo: col.id, side: 'right' });
  };

  // Toggle whether a column id is hidden. Refuses to hide the two required
  // columns ('product' / Description and 'quantity' / Qty) which would leave
  // the table meaningless.
  const toggleColumnVisibility = (id: string) => {
    if (id === 'product' || id === 'quantity') return;
    setHiddenColumns(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Toggle the type of an existing custom column. Used by the column panel.
  const setCustomColumnType = (id: string, type: 'text' | 'number') => {
    setCustomColumns(prev => prev.map(c => c.id === id ? { ...c, type } : c));
  };

  const deleteCustomColumn = (id: string) => {
    if (!confirm('Delete this column? All values entered in it will be removed from every row.')) return;
    setCustomColumns(prev => prev.filter(c => c.id !== id));
    // Drop the values from each row so we don't carry orphaned data.
    setEditItems(prev => prev.map(it => {
      const next = { ...it.customValues };
      delete next[id];
      return { ...it, customValues: next };
    }));
  };

  const startRenameColumn = (id: string) => {
    const col = customColumns.find(c => c.id === id);
    if (!col) return;
    setRenameColId(id);
    setRenameColName(col.name);
  };

  const commitRenameColumn = () => {
    if (!renameColId) return;
    const name = renameColName.trim();
    if (!name) { setRenameColId(null); return; }
    setCustomColumns(prev => prev.map(c => c.id === renameColId ? { ...c, name } : c));
    setRenameColId(null);
    setRenameColName('');
  };

  const updateCustomValue = (idx: number, columnId: string, value: string) => {
    setEditItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, customValues: { ...item.customValues, [columnId]: value } } : item
    ));
  };

  // ---------------------------------------------------------------------------
  // Computed column lists for rendering. tableColumns includes everything
  // (used by the Columns panel — show/hide checkboxes need to list hidden
  // columns too). visibleColumns drops anything in hiddenColumns and is what
  // the actual <thead>/<tbody>/<tfoot> map over.
  // ---------------------------------------------------------------------------

  // One descriptor per column we know about, in render order.
  type TableColumn = {
    id: string;                       // 'product' | 'unitPrice' | ... or custom column id
    label: string;                    // header text
    kind: 'builtin' | 'custom';
    builtinId?: BuiltInColumnId;
    customCol?: ProformaCustomColumn;
    align: 'left' | 'right' | 'center';
    widthClass?: string;              // optional Tailwind width class
    slot: number;                     // for ordering against custom columns
  };

  const builtinColumnDescriptors: TableColumn[] = [
    { id: 'product',     label: 'Product',      kind: 'builtin', builtinId: 'product',     align: 'left',   slot: builtinSlot.product },
    { id: 'unitPrice',   label: 'Unit Price',   kind: 'builtin', builtinId: 'unitPrice',   align: 'right',  slot: builtinSlot.unitPrice },
    { id: 'customPrice', label: 'Custom Price', kind: 'builtin', builtinId: 'customPrice', align: 'right',  widthClass: 'w-28', slot: builtinSlot.customPrice },
    { id: 'quantity',    label: 'Quantity',     kind: 'builtin', builtinId: 'quantity',    align: 'center', widthClass: 'w-24', slot: builtinSlot.quantity },
    { id: 'total',       label: 'Total',        kind: 'builtin', builtinId: 'total',       align: 'right',  slot: builtinSlot.total },
  ];

  const tableColumns: TableColumn[] = [
    ...builtinColumnDescriptors,
    ...customColumns.map<TableColumn>(c => ({
      id: c.id,
      label: c.name,
      kind: 'custom',
      customCol: c,
      align: c.type === 'number' ? 'right' : 'left',
      slot: c.orderIndex,
    })),
  ].sort((a, b) => a.slot - b.slot);

  const visibleColumns: TableColumn[] = tableColumns.filter(c => !hiddenColumns.includes(c.id));

  const handleSave = async () => {
    if (editItems.length === 0) { setError('Add at least one product.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await api.updateProforma(proformaId, {
        currency,
        notes: notes.trim() || null,
        shipTo: shipTo.trim() || null,
        portOfLoading: portOfLoading.trim() || null,
        placeOfDestination: placeOfDestination.trim() || null,
        finalPlaceOfDelivery: finalPlaceOfDelivery.trim() || null,
        countryOfOrigin: countryOfOrigin.trim() || null,
        transportationMode: transportationMode.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        deliveryTerms: deliveryTerms.trim() || null,
        status,
        // Persist the user-defined columns alongside the proforma. The server
        // stores it as JSONB (see proformas.customColumns / hiddenColumns).
        customColumns: customColumns,
        // Drop any hidden ids that no longer correspond to an existing column
        // so we don't carry orphaned visibility settings forever.
        hiddenColumns: hiddenColumns.filter(id =>
          id === 'unit' || id === 'unitPrice' || id === 'total' ||
          customColumns.some(c => c.id === id)
        ),
      });

      for (const id of removedItemIds) {
        await api.deleteProformaItem(id);
      }

      // Build the customValues map for an item — drop any keys that no longer
      // map to an existing column so we never persist orphaned values.
      const knownColumnIds = new Set(customColumns.map(c => c.id));
      const cleanValues = (vals: Record<string, string>): Record<string, string> => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(vals || {})) {
          if (knownColumnIds.has(k)) out[k] = v;
        }
        return out;
      };

      for (let idx = 0; idx < editItems.length; idx++) {
        const item = editItems[idx];
        if (item.isNew) {
          await api.addProformaItem(proformaId, {
            productId: item.product.id,
            quantity: item.quantity,
            customPrice: item.customPrice,
            customName: item.customName,
            customDescription: item.customDescription,
            customValues: cleanValues(item.customValues),
            sortOrder: idx,
          });
        } else if (item.id) {
          await api.updateProformaItem(item.id, {
            quantity: item.quantity,
            customPrice: item.customPrice,
            customName: item.customName,
            customDescription: item.customDescription,
            customValues: cleanValues(item.customValues),
            sortOrder: idx,
          });
        }
      }

      onSaved(proformaId);
    } catch (e: any) {
      setError(e.message || 'Failed to save proforma');
    } finally {
      setSubmitting(false);
    }
  };

  const grandTotal = editItems.reduce((sum, i) => {
    const price = i.customPrice ?? i.product.price ?? 0;
    return sum + price * i.quantity;
  }, 0);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading proforma…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Edit Proforma Invoice</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            <span className="font-mono font-semibold text-blue-600">{proformaId}</span>
            <span className="mx-2">·</span>
            {customerName}
          </p>
        </div>
        <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl">
          <h3 className="text-sm font-semibold text-slate-700">Invoice Details</h3>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Customer</label>
            <input type="text" value={customerName} disabled className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Currency</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
            >
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Terms of Payment</label>
            <input
              type="text"
              value={paymentTerms}
              onChange={e => setPaymentTerms(e.target.value)}
              placeholder={settings.paymentTerms || 'e.g. 50% ADVANCE, 50% BEFORE SHIPMENT'}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
            {settings.paymentTerms && !paymentTerms && (
              <p className="text-[10px] text-slate-400 mt-1">Default: {settings.paymentTerms}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Terms of Delivery (Incoterms)</label>
            <input
              type="text"
              value={deliveryTerms}
              onChange={e => setDeliveryTerms(e.target.value)}
              placeholder={settings.deliveryTerms || 'e.g. EXWORK, CIF, FOB'}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
            {settings.deliveryTerms && !deliveryTerms && (
              <p className="text-[10px] text-slate-400 mt-1">Default: {settings.deliveryTerms}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">Shipping & Delivery Details</h3>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Invoiced To</label>
            <textarea
              value={shipTo}
              onChange={e => setShipTo(e.target.value)}
              placeholder="Leave empty for 'SAME AS CONSIGNEE'"
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Port of Loading</label>
            <input type="text" value={portOfLoading} onChange={e => setPortOfLoading(e.target.value)} placeholder="e.g. ISTANBUL" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Place of Destination</label>
            <input type="text" value={placeOfDestination} onChange={e => setPlaceOfDestination(e.target.value)} placeholder="e.g. GHANA" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Final Place of Delivery</label>
            <input type="text" value={finalPlaceOfDelivery} onChange={e => setFinalPlaceOfDelivery(e.target.value)} placeholder="e.g. ACCRA" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Country of Origin</label>
            <input type="text" value={countryOfOrigin} onChange={e => setCountryOfOrigin(e.target.value)} placeholder="e.g. TURKEY" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Transportation Mode</label>
            <input type="text" value={transportationMode} onChange={e => setTransportationMode(e.target.value)} placeholder="e.g. 1X40HC" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Products</h3>
          <span className="text-xs text-slate-400">{editItems.length} item{editItems.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="p-6 space-y-4">
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
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-400">No products found</div>
                ) : filteredProducts.map(p => {
                  const already = editItems.some(i => i.product.id === p.id);
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
            )}
            {showProductDropdown && (
              <div className="fixed inset-0 z-10" onClick={() => setShowProductDropdown(false)} />
            )}
          </div>

          {/* Column management toolbar — opens a panel for show/hide,
              add/rename/delete custom columns, and switch column type. */}
          {editItems.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400">
                {customColumns.length > 0 && (
                  <span>{customColumns.length} custom column{customColumns.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowColumnsPanel(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  showColumnsPanel
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Columns3 className="w-3.5 h-3.5" />
                Columns
              </button>
            </div>
          )}

          {/* Columns panel — show/hide toggles, add new column, manage existing custom columns. */}
          {showColumnsPanel && (
            <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Show / hide columns</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  {tableColumns.map(col => {
                    const isHidden = hiddenColumns.includes(col.id);
                    const isRequired = col.id === 'product' || col.id === 'quantity';
                    const isEditorOnly = col.id === 'customPrice';
                    return (
                      <button
                        key={col.id}
                        type="button"
                        disabled={isRequired || isEditorOnly}
                        onClick={() => toggleColumnVisibility(col.id)}
                        title={
                          isRequired ? 'This column is required and can\'t be hidden'
                          : isEditorOnly ? 'This column only appears in the editor'
                          : isHidden ? 'Show this column' : 'Hide this column'
                        }
                        className={`flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg border text-left transition-colors ${
                          isRequired || isEditorOnly
                            ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                            : isHidden
                              ? 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                              : 'bg-white border-blue-300 text-slate-700 hover:bg-blue-50'
                        }`}
                      >
                        {isRequired || isEditorOnly
                          ? <Check className="w-3.5 h-3.5 flex-shrink-0 text-slate-300" />
                          : isHidden
                            ? <EyeOff className="w-3.5 h-3.5 flex-shrink-0" />
                            : <Eye className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" />}
                        <span className="truncate">{col.label}</span>
                        {col.kind === 'custom' && (
                          <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            col.customCol!.type === 'number' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {col.customCol!.type === 'number' ? '#' : 'T'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  "Description of Goods" and "Quantity" are required. "Custom Price" only appears here in the editor.
                </p>
              </div>

              {customColumns.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Custom columns</h4>
                  <div className="space-y-1.5">
                    {sortedColumns.map(col => (
                      <div key={col.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                        {renameColId === col.id ? (
                          <input
                            autoFocus
                            value={renameColName}
                            onChange={e => setRenameColName(e.target.value)}
                            onBlur={commitRenameColumn}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitRenameColumn();
                              if (e.key === 'Escape') { setRenameColId(null); setRenameColName(''); }
                            }}
                            className="flex-1 text-xs px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => startRenameColumn(col.id)}
                            className="flex-1 flex items-center gap-1.5 text-xs text-slate-700 hover:text-blue-600 group text-left"
                          >
                            <span className="truncate">{col.name}</span>
                            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 text-slate-400" />
                          </button>
                        )}
                        <div className="flex items-center bg-slate-100 rounded p-0.5">
                          <button
                            type="button"
                            onClick={() => setCustomColumnType(col.id, 'text')}
                            title="Text column"
                            className={`p-1 rounded ${col.type === 'text' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            <Type className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomColumnType(col.id, 'number')}
                            title="Number column"
                            className={`p-1 rounded ${col.type === 'number' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            <Hash className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteCustomColumn(col.id)}
                          title="Delete column"
                          className="p-1 text-slate-300 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Add a column</h4>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                  <input
                    type="text"
                    value={newColName}
                    onChange={e => setNewColName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmAddColumn(); }}
                    placeholder="Column name (e.g. HS Code)"
                    className="md:col-span-4 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <div className="md:col-span-3 flex bg-slate-100 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setNewColType('text')}
                      className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded ${
                        newColType === 'text' ? 'bg-white shadow-sm text-slate-700 font-medium' : 'text-slate-500'
                      }`}
                    >
                      <Type className="w-3 h-3" /> Text
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewColType('number')}
                      className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded ${
                        newColType === 'number' ? 'bg-white shadow-sm text-slate-700 font-medium' : 'text-slate-500'
                      }`}
                    >
                      <Hash className="w-3 h-3" /> Number
                    </button>
                  </div>
                  <select
                    value={`${newColPos.relativeTo}::${newColPos.side}`}
                    onChange={e => {
                      const [relativeTo, side] = e.target.value.split('::');
                      setNewColPos({ relativeTo, side: side as 'left' | 'right' });
                    }}
                    className="md:col-span-3 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value={`product::left`}>Beginning of table</option>
                    {tableColumns.map(col => (
                      <option key={col.id} value={`${col.id}::right`}>After "{col.label}"</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={confirmAddColumn}
                    disabled={!newColName.trim()}
                    className="md:col-span-2 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Text columns accept any input; number columns only accept digits and decimals.
                </p>
              </div>
            </div>
          )}

          {editItems.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {visibleColumns.map(col => (
                      <th
                        key={col.id}
                        className={`px-4 py-2.5 text-xs font-semibold text-slate-500 ${
                          col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                        } ${col.widthClass || ''}`}
                      >
                        {col.label}
                        {col.kind === 'custom' && (
                          <span className={`ml-1 text-[9px] font-medium px-1 py-0.5 rounded align-middle ${
                            col.customCol!.type === 'number' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {col.customCol!.type === 'number' ? '#' : 'T'}
                          </span>
                        )}
                      </th>
                    ))}
                    <th className="px-4 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {editItems.map((item, idx) => {
                    const effectivePrice = item.customPrice ?? item.product.price ?? 0;
                    const lineTotal = effectivePrice * item.quantity;
                    return (
                      <tr key={`${item.product.id}-${idx}`} className="hover:bg-slate-50/50">
                        {visibleColumns.map(col => {
                          // Render the right cell content for each column kind.
                          if (col.kind === 'builtin') {
                            switch (col.builtinId) {
                              case 'product':
                                return (
                                  <td key={col.id} className="px-4 py-3">
                                    <div className="font-medium text-slate-800">{item.product.name}</div>
                                    <div className="text-xs text-slate-400 font-mono">{item.product.stockCode || item.product.id}</div>
                                    {item.isNew && <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">NEW</span>}
                                  </td>
                                );
                              case 'unitPrice':
                                return (
                                  <td key={col.id} className="px-4 py-3 text-right text-slate-500 text-xs">
                                    {item.product.currency || currency} {(item.product.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                );
                              case 'customPrice':
                                return (
                                  <td key={col.id} className="px-4 py-3 text-right">
                                    <input
                                      type="number"
                                      step="any"
                                      value={item.customPrice ?? ''}
                                      onChange={e => updateCustomPrice(idx, e.target.value)}
                                      placeholder="—"
                                      className="w-24 text-right px-2 py-1 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    />
                                  </td>
                                );
                              case 'quantity':
                                return (
                                  <td key={col.id} className="px-4 py-3 text-center">
                                    <input
                                      type="number"
                                      min="0.001"
                                      step="any"
                                      value={item.quantity}
                                      onChange={e => updateQty(idx, parseFloat(e.target.value) || 1)}
                                      className="w-20 text-center px-2 py-1 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    />
                                  </td>
                                );
                              case 'total':
                                return (
                                  <td key={col.id} className="px-4 py-3 text-right font-semibold text-slate-700">
                                    {currency} {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                );
                            }
                          }
                          // Custom column input cell. Number columns use type=number
                          // so mobile keyboards open the numeric keypad, but the
                          // value is still stored as a string.
                          const cc = col.customCol!;
                          const value = item.customValues[cc.id] ?? '';
                          return (
                            <td key={col.id} className={`px-4 py-3 ${cc.type === 'number' ? 'text-right' : 'text-left'}`}>
                              <input
                                type={cc.type === 'number' ? 'number' : 'text'}
                                step={cc.type === 'number' ? 'any' : undefined}
                                value={value}
                                onChange={e => updateCustomValue(idx, cc.id, e.target.value)}
                                placeholder="—"
                                className={`w-full min-w-[80px] px-2 py-1 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                  cc.type === 'number' ? 'text-right' : 'text-left'
                                }`}
                              />
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => removeItem(idx)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    {/* Subtotal label spans every visible column except the
                        last one, which carries the total amount. The trailing
                        actions cell stays unbacked. */}
                    <td colSpan={Math.max(1, visibleColumns.length - 1)} className="px-4 py-3 text-right text-sm font-semibold text-slate-600">
                      Subtotal
                    </td>
                    <td className="px-4 py-3 text-right text-base font-bold text-slate-800">
                      {currency} {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {editItems.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <Plus className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Search and add products above</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="flex justify-end gap-3 pb-6">
        <button onClick={onCancel} className="px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={submitting}
          className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          {submitting ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default ProformaEdit;
