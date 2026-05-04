// =============================================================================
// ProformaInvoice — top-level proforma module router
// =============================================================================
// Hosts the three top-level views inside the Proforma tab:
//   • list      — invoice index (table) with version grouping
//   • editor    — single-canvas create/edit screen (ProformaInvoiceEditor)
//   • customers — customer manager (CustomerManager)
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Trash2, Pencil, FileText, Search, X, Users,
  Copy, GitBranch, ChevronRight, ChevronDown,
} from 'lucide-react';
import { api } from '../client/api';
import { Product, ProformaData } from '../types';
import ProformaInvoiceEditor from './proforma/ProformaInvoiceEditor';
import CustomerManager from './proforma/CustomerManager';

interface ProformaInvoiceProps {
  products: Product[];
}

type SubView = 'list' | 'editor' | 'customers';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

// A "group" is either a standalone proforma or a base proforma together
// with all its versions (children whose parentProformaId points to it).
interface ProformaGroup {
  base: ProformaData;
  versions: ProformaData[]; // sorted by version ASC (base is v1, children v2+)
}

const ProformaInvoice: React.FC<ProformaInvoiceProps> = ({ products }) => {
  const [subView, setSubView] = useState<SubView>('list');
  const [activeProformaId, setActiveProformaId] = useState<string | null>(null);
  const [proformas, setProformas] = useState<ProformaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  // Tracks which groups have their version sub-rows expanded.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getProformas();
      setProformas(list);
    } catch (e) {
      console.error('[ProformaInvoice] failed to load list:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (subView === 'list') loadList();
  }, [subView, loadList]);

  const openNew = () => {
    setActiveProformaId(null);
    setSubView('editor');
  };

  const openEditor = (proformaId: string) => {
    setActiveProformaId(proformaId);
    setSubView('editor');
  };

  const handleDelete = async (proformaId: string) => {
    if (!window.confirm(`Delete ${proformaId}? This cannot be undone.`)) return;
    setDeletingId(proformaId);
    try {
      await api.deleteProforma(proformaId);
      setProformas(prev => prev.filter(p => p.proformaId !== proformaId));
    } catch (e) {
      console.error('[ProformaInvoice] failed to delete:', e);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (proformaId: string) => {
    setBusyAction(proformaId);
    try {
      const created = await api.duplicateProforma(proformaId);
      if (created?.proformaId) {
        openEditor(created.proformaId);
      }
    } catch (e) {
      console.error('[ProformaInvoice] duplicate failed:', e);
    } finally {
      setBusyAction(null);
    }
  };

  const handleNewVersion = async (proformaId: string) => {
    setBusyAction(proformaId);
    try {
      const created = await api.newProformaVersion(proformaId);
      if (created?.proformaId) {
        openEditor(created.proformaId);
      }
    } catch (e) {
      console.error('[ProformaInvoice] new version failed:', e);
    } finally {
      setBusyAction(null);
    }
  };

  const toggleGroup = (baseId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(baseId)) next.delete(baseId);
      else next.add(baseId);
      return next;
    });
  };

  // ── Filter ──
  const filtered = proformas.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.proformaId.toLowerCase().includes(q) ||
      p.customerName.toLowerCase().includes(q) ||
      (p.customerCountry || '').toLowerCase().includes(q)
    );
  });

  // ── Group proformas by parent/base ──
  // When a search filter matches a version but excludes its base, the version
  // is promoted to a standalone group so it remains visible in results.
  const groups: ProformaGroup[] = useMemo(() => {
    const childrenMap = new Map<string, ProformaData[]>();
    const baseMap = new Map<string, ProformaData>();

    for (const p of filtered) {
      if (p.parentProformaId) {
        const arr = childrenMap.get(p.parentProformaId) || [];
        arr.push(p);
        childrenMap.set(p.parentProformaId, arr);
      } else {
        baseMap.set(p.proformaId, p);
      }
    }

    // Sort children by version ascending within each group.
    for (const [, arr] of childrenMap) {
      arr.sort((a, b) => (a.version ?? 1) - (b.version ?? 1));
    }

    const result: ProformaGroup[] = [];

    // First, add all base rows with their matched children.
    for (const [id, base] of baseMap) {
      result.push({
        base,
        versions: childrenMap.get(id) || [],
      });
      childrenMap.delete(id);
    }

    // Then, any remaining children whose base wasn't in the filtered set
    // become standalone groups so they still appear in the results.
    for (const [, orphans] of childrenMap) {
      for (const orphan of orphans) {
        result.push({ base: orphan, versions: [] });
      }
    }

    return result;
  }, [filtered]);

  // ─── Single-canvas editor (full-screen) ─────────────────────────────
  if (subView === 'editor') {
    return (
      <ProformaInvoiceEditor
        proformaId={activeProformaId}
        products={products}
        onBack={() => { setSubView('list'); setActiveProformaId(null); }}
        onSaved={(id) => setActiveProformaId(id)}
      />
    );
  }

  // ── Render a single proforma row ──
  const renderRow = (
    p: ProformaData,
    opts: { indent?: boolean; isVersion?: boolean; hasVersions?: boolean; isExpanded?: boolean; baseId?: string } = {},
  ) => {
    const { indent, isVersion, hasVersions, isExpanded, baseId } = opts;
    const isBusy = busyAction === p.proformaId;
    return (
      <tr key={p.proformaId} className={`hover:bg-slate-50/60 transition-colors ${indent ? 'bg-slate-50/30' : ''}`}>
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-2">
            {/* Expand/collapse chevron for bases that have versions */}
            {hasVersions && !isVersion && (
              <button
                onClick={() => toggleGroup(baseId || p.proformaId)}
                className="p-0.5 rounded hover:bg-slate-200 transition-colors"
                title={isExpanded ? 'Collapse versions' : 'Expand versions'}
              >
                {isExpanded
                  ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                }
              </button>
            )}
            {/* Indent spacer for version sub-rows */}
            {isVersion && <span className="w-5 inline-block" />}
            {/* Version branch icon for child versions */}
            {isVersion && <GitBranch className="w-3 h-3 text-slate-300 -rotate-180" />}
            <span className="font-mono font-semibold text-blue-700 text-sm">{p.proformaId}</span>
            {/* Version badge */}
            {(p.version ?? 1) > 1 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200">
                v{p.version}
              </span>
            )}
            {/* Version count badge on the base row */}
            {hasVersions && !isVersion && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                {(opts as any).versionCount} version{(opts as any).versionCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </td>
        <td className="px-5 py-3.5 font-medium text-slate-800">{p.customerName}</td>
        <td className="px-5 py-3.5 text-slate-500">{p.customerCountry || '—'}</td>
        <td className="px-5 py-3.5 text-center">
          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
            {p.currency || 'USD'}
          </span>
        </td>
        <td className="px-5 py-3.5 text-center">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_COLORS[p.status || 'draft']}`}>
            {p.status || 'draft'}
          </span>
        </td>
        <td className="px-5 py-3.5 text-slate-500 text-xs">
          {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
        </td>
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-1.5 justify-end">
            <button
              onClick={() => openEditor(p.proformaId)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              title="Open invoice"
            >
              <Pencil className="w-3.5 h-3.5" />
              Open
            </button>
            <button
              onClick={() => handleNewVersion(p.proformaId)}
              disabled={isBusy}
              className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-40"
              title="Create a new version from this invoice"
            >
              <GitBranch className="w-3.5 h-3.5" />
              Version
            </button>
            <button
              onClick={() => handleDuplicate(p.proformaId)}
              disabled={isBusy}
              className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-40"
              title="Duplicate as a new invoice"
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicate
            </button>
            <button
              onClick={() => handleDelete(p.proformaId)}
              disabled={deletingId === p.proformaId}
              className="p-1.5 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40"
              title="Delete invoice"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // ─── List view + Customers tab share the same chrome (header + tabs) ─
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
              onClick={openNew}
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
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                <FileText className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium text-slate-500">No proforma invoices yet</p>
                <p className="text-sm mt-1">Create your first proforma to get started</p>
                <button
                  onClick={openNew}
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
                    {groups.map(g => {
                      const hasVersions = g.versions.length > 0;
                      const isExpanded = expandedGroups.has(g.base.proformaId);
                      return (
                        <React.Fragment key={g.base.proformaId}>
                          {renderRow(g.base, {
                            hasVersions,
                            isExpanded,
                            baseId: g.base.proformaId,
                            versionCount: g.versions.length,
                          } as any)}
                          {hasVersions && isExpanded && g.versions.map(v =>
                            renderRow(v, {
                              indent: true,
                              isVersion: true,
                              baseId: g.base.proformaId,
                            }),
                          )}
                        </React.Fragment>
                      );
                    })}
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
