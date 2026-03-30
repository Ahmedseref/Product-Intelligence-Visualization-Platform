import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Search, X, ChevronDown } from 'lucide-react';
import { api } from '../../client/api';
import { Product, ProformaSettingsData } from '../../types';

interface ProformaCreateProps {
  products: Product[];
  onCreated: (proformaId: string) => void;
  onCancel: () => void;
}

interface DraftItem {
  product: Product;
  quantity: number;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY', 'AED', 'SAR', 'CNY', 'JPY'];

const ProformaCreate: React.FC<ProformaCreateProps> = ({ products, onCreated, onCancel }) => {
  const [customerName, setCustomerName] = useState('');
  const [customerCountry, setCustomerCountry] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [notes, setNotes] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getProformaSettings().then((s: ProformaSettingsData) => {
      if (s.defaultCurrency) setCurrency(s.defaultCurrency);
      if (s.notes) setNotes(s.notes);
    }).catch(() => {});
  }, []);

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
    if (draftItems.some(i => i.product.id === product.id)) return;
    setDraftItems(prev => [...prev, { product, quantity: 1 }]);
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const removeItem = (productId: string) => {
    setDraftItems(prev => prev.filter(i => i.product.id !== productId));
  };

  const updateQty = (productId: string, qty: number) => {
    setDraftItems(prev => prev.map(i =>
      i.product.id === productId ? { ...i, quantity: Math.max(0.001, qty) } : i
    ));
  };

  const handleSubmit = async () => {
    if (!customerName.trim()) { setError('Customer name is required.'); return; }
    if (draftItems.length === 0) { setError('Add at least one product.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const proforma = await api.createProforma({
        customerName: customerName.trim(),
        customerCountry: customerCountry.trim() || null,
        customerContact: customerContact.trim() || null,
        currency,
        notes: notes.trim() || null,
        status: 'draft',
      });

      await Promise.all(
        draftItems.map((item, idx) =>
          api.addProformaItem(proforma.proformaId, {
            productId: item.product.id,
            quantity: item.quantity,
            sortOrder: idx,
          })
        )
      );

      onCreated(proforma.proformaId);
    } catch (e: any) {
      setError(e.message || 'Failed to create proforma');
    } finally {
      setSubmitting(false);
    }
  };

  const grandTotal = draftItems.reduce((sum, i) => sum + (i.product.price || 0) * i.quantity, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">New Proforma Invoice</h2>
          <p className="text-sm text-slate-500 mt-0.5">Fill in customer info and select products from the database.</p>
        </div>
        <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1.5">
          <X className="w-4 h-4" /> Cancel
        </button>
      </div>

      {/* Customer Info */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">Customer Information</h3>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Customer Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Company or person name"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Country</label>
            <input
              type="text"
              value={customerCountry}
              onChange={e => setCustomerCountry(e.target.value)}
              placeholder="Germany, UK, USA…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Contact Info</label>
            <input
              type="text"
              value={customerContact}
              onChange={e => setCustomerContact(e.target.value)}
              placeholder="Email, phone, or name of contact person"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
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
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes for this invoice"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        </div>
      </div>

      {/* Product Selection */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Products</h3>
          <span className="text-xs text-slate-400">{draftItems.length} selected</span>
        </div>
        <div className="p-6 space-y-4">
          {/* Product search */}
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400">
              <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <input
                type="text"
                value={productSearch}
                onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                onFocus={() => setShowProductDropdown(true)}
                placeholder="Search by name, stock code, supplier, or ID…"
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
                  const already = draftItems.some(i => i.product.id === p.id);
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

          {/* Selected products table */}
          {draftItems.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Product</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Unit Price</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500">Quantity</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Total</th>
                    <th className="px-4 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draftItems.map(item => (
                    <tr key={item.product.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{item.product.name}</div>
                        <div className="text-xs text-slate-400 font-mono">{item.product.stockCode || item.product.id}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {item.product.currency || currency} {(item.product.price || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={item.quantity}
                          onChange={e => updateQty(item.product.id, parseFloat(e.target.value) || 1)}
                          className="w-20 text-center px-2 py-1 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {currency} {((item.product.price || 0) * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => removeItem(item.product.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-slate-600">Grand Total</td>
                    <td className="px-4 py-3 text-right text-base font-bold text-slate-800">
                      {currency} {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {draftItems.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <Plus className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Search and add products above</p>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pb-6">
        <button onClick={onCancel} className="px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-6 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-60"
        >
          {submitting ? 'Creating…' : 'Create Proforma Invoice'}
        </button>
      </div>
    </div>
  );
};

export default ProformaCreate;
