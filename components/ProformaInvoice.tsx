import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Eye, Pencil, FileText, Search, X, Users } from 'lucide-react';
import { api } from '../client/api';
import { Product, ProformaData } from '../types';
import ProformaCreate from './proforma/ProformaCreate';
import ProformaPreview from './proforma/ProformaPreview';
import CustomerManager from './proforma/CustomerManager';

interface ProformaInvoiceProps {
  products: Product[];
}

type SubView = 'list' | 'create' | 'preview' | 'customers';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const ProformaInvoice: React.FC<ProformaInvoiceProps> = ({ products }) => {
  const [subView, setSubView] = useState<SubView>('list');
  const [activeProformaId, setActiveProformaId] = useState<string | null>(null);
  const [proformas, setProformas] = useState<ProformaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getProformas();
      setProformas(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (subView === 'list') loadList();
  }, [subView, loadList]);

  const handleCreated = (proformaId: string) => {
    setActiveProformaId(proformaId);
    setSubView('preview');
  };

  const handleDelete = async (proformaId: string) => {
    if (!window.confirm(`Delete ${proformaId}? This cannot be undone.`)) return;
    setDeletingId(proformaId);
    try {
      await api.deleteProforma(proformaId);
      setProformas(prev => prev.filter(p => p.proformaId !== proformaId));
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = proformas.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.proformaId.toLowerCase().includes(q) ||
      p.customerName.toLowerCase().includes(q) ||
      (p.customerCountry || '').toLowerCase().includes(q)
    );
  });

  if (subView === 'create') {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <ProformaCreate
          products={products}
          onCreated={handleCreated}
          onCancel={() => setSubView('list')}
        />
      </div>
    );
  }

  if (subView === 'preview' && activeProformaId) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <ProformaPreview
          proformaId={activeProformaId}
          onBack={() => { setSubView('list'); setActiveProformaId(null); }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Page Header */}
      <div className="flex-shrink-0 px-6 py-5 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Proforma Invoices</h1>
              <p className="text-sm text-slate-500">Create and manage proforma invoices with financial calculations</p>
            </div>
          </div>
          {subView === 'list' && (
            <button
              onClick={() => setSubView('create')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Proforma
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSubView('list')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              subView === 'list' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <FileText className="w-4 h-4" />
            Invoices
          </button>
          <button
            onClick={() => setSubView('customers')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              subView === 'customers' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Users className="w-4 h-4" />
            Customers
          </button>
        </div>
      </div>

      {/* Customers View */}
      {subView === 'customers' && (
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div className="max-w-3xl mx-auto">
            <CustomerManager />
          </div>
        </div>
      )}

      {/* Invoice List View */}
      {subView === 'list' && (
        <>
          {/* Search */}
          <div className="flex-shrink-0 px-6 pt-4 pb-2 bg-white border-b border-slate-100">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg w-72">
              <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by ID, customer…"
                className="flex-1 text-sm outline-none bg-transparent"
              />
              {search && (
                <button onClick={() => setSearch('')}>
                  <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                <FileText className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium text-slate-500">No proforma invoices yet</p>
                <p className="text-sm mt-1">Create your first proforma to get started</p>
                <button
                  onClick={() => setSubView('create')}
                  className="mt-5 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Proforma
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Invoice ID</th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Country</th>
                      <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Currency</th>
                      <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(p => (
                      <tr key={p.proformaId} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-4">
                          <span className="font-mono font-semibold text-blue-700 text-sm">{p.proformaId}</span>
                        </td>
                        <td className="px-5 py-4 font-medium text-slate-800">{p.customerName}</td>
                        <td className="px-5 py-4 text-slate-500">{p.customerCountry || '—'}</td>
                        <td className="px-5 py-4 text-center">
                          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                            {p.currency || 'USD'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_COLORS[p.status || 'draft']}`}>
                            {p.status || 'draft'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-500 text-xs">
                          {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => { setActiveProformaId(p.proformaId); setSubView('preview'); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </button>
                            <button
                              onClick={() => { setActiveProformaId(p.proformaId); setSubView('preview'); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(p.proformaId)}
                              disabled={deletingId === p.proformaId}
                              className="p-1.5 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ProformaInvoice;
