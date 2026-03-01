import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Product, Supplier, DocumentRecord } from '../types';
import { api } from '../client/api';
import {
  Plus, Search, Filter, FileText, ExternalLink, Pencil, Trash2, X, Check,
  Tag, Link2, Building2, Package, Combine, ChevronDown, Loader2, FolderOpen
} from 'lucide-react';

const DOCUMENT_TYPES = ['TDS', 'MSDS', 'Certificate', 'Technical Drawing', 'Commercial', 'Contract', 'Catalog', 'Other'];

const TYPE_COLORS: Record<string, string> = {
  TDS: 'bg-blue-100 text-blue-700',
  MSDS: 'bg-red-100 text-red-700',
  Certificate: 'bg-green-100 text-green-700',
  'Technical Drawing': 'bg-purple-100 text-purple-700',
  Commercial: 'bg-amber-100 text-amber-700',
  Contract: 'bg-orange-100 text-orange-700',
  Catalog: 'bg-cyan-100 text-cyan-700',
  Other: 'bg-slate-100 text-slate-700',
};

const RELATION_TYPES = ['Supplier', 'Product', 'System'] as const;

const RELATION_ICONS: Record<string, React.ReactNode> = {
  Supplier: <Building2 size={14} />,
  Product: <Package size={14} />,
  System: <Combine size={14} />,
};

interface DocumentMemoryProps {
  products: Product[];
  suppliers: Supplier[];
  systems?: any[];
}

interface DocumentFormData {
  name: string;
  link: string;
  type: string;
  relatedToType: string;
  relatedToId: string;
  relatedToName: string;
  tags: string;
  description: string;
}

const emptyForm: DocumentFormData = {
  name: '',
  link: '',
  type: 'TDS',
  relatedToType: 'Supplier',
  relatedToId: '',
  relatedToName: '',
  tags: '',
  description: '',
};

const DocumentMemory: React.FC<DocumentMemoryProps> = ({ products, suppliers, systems = [] }) => {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentRecord | null>(null);
  const [form, setForm] = useState<DocumentFormData>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterRelation, setFilterRelation] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');

  const [relationSearch, setRelationSearch] = useState('');
  const [showRelationDropdown, setShowRelationDropdown] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getDocuments();
      setDocuments(data.map((d: any) => ({
        id: d.id,
        documentId: d.documentId,
        name: d.name,
        link: d.link,
        type: d.type,
        relatedToType: d.relatedToType,
        relatedToId: d.relatedToId || undefined,
        relatedToName: d.relatedToName || undefined,
        tags: d.tags || [],
        description: d.description || undefined,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })));
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const filteredDocs = useMemo(() => {
    return documents.filter(doc => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = doc.name.toLowerCase().includes(q);
        const matchDesc = doc.description?.toLowerCase().includes(q);
        const matchTags = doc.tags.some(t => t.toLowerCase().includes(q));
        const matchRelated = doc.relatedToName?.toLowerCase().includes(q);
        const matchId = doc.documentId.toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchTags && !matchRelated && !matchId) return false;
      }
      if (filterType && doc.type !== filterType) return false;
      if (filterRelation && doc.relatedToType !== filterRelation) return false;
      if (filterSupplier) {
        if (doc.relatedToType === 'Supplier' && doc.relatedToId !== filterSupplier) return false;
        if (doc.relatedToType !== 'Supplier') return false;
      }
      return true;
    });
  }, [documents, searchQuery, filterType, filterRelation, filterSupplier]);

  const relationOptions = useMemo(() => {
    const q = relationSearch.toLowerCase();
    if (form.relatedToType === 'Supplier') {
      return suppliers.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.supplierCode && s.supplierCode.toLowerCase().includes(q))
      ).slice(0, 20).map(s => ({ id: s.id, name: s.name, sub: s.supplierCode || s.id }));
    }
    if (form.relatedToType === 'Product') {
      return products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.stockCode && p.stockCode.toLowerCase().includes(q))
      ).slice(0, 20).map(p => ({ id: p.id, name: p.name, sub: p.stockCode || p.id }));
    }
    if (form.relatedToType === 'System') {
      return systems.filter((s: any) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.systemId || '').toLowerCase().includes(q)
      ).slice(0, 20).map((s: any) => ({ id: s.systemId || s.id, name: s.name, sub: s.systemId || '' }));
    }
    return [];
  }, [form.relatedToType, relationSearch, suppliers, products, systems]);

  const openAddModal = () => {
    setEditingDoc(null);
    setForm(emptyForm);
    setRelationSearch('');
    setShowModal(true);
  };

  const openEditModal = (doc: DocumentRecord) => {
    setEditingDoc(doc);
    setForm({
      name: doc.name,
      link: doc.link,
      type: doc.type,
      relatedToType: doc.relatedToType,
      relatedToId: doc.relatedToId || '',
      relatedToName: doc.relatedToName || '',
      tags: doc.tags.join(', '),
      description: doc.description || '',
    });
    setRelationSearch(doc.relatedToName || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.link.trim()) return;
    setSaving(true);
    try {
      const tags = form.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      const payload: any = {
        name: form.name.trim(),
        link: form.link.trim(),
        type: form.type,
        relatedToType: form.relatedToType,
        relatedToId: form.relatedToId || null,
        relatedToName: form.relatedToName || null,
        tags,
        description: form.description.trim() || null,
      };

      if (editingDoc) {
        await api.updateDocument(editingDoc.documentId, payload);
      } else {
        await api.createDocument(payload);
      }
      await loadDocuments();
      setShowModal(false);
    } catch (err) {
      console.error('Failed to save document:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    try {
      await api.deleteDocument(documentId);
      setDocuments(prev => prev.filter(d => d.documentId !== documentId));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  const hasActiveFilters = filterType || filterRelation || filterSupplier;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Document Memory</h1>
          <p className="text-sm text-slate-500 mt-1">
            {documents.length} document{documents.length !== 1 ? 's' : ''} stored
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm"
        >
          <Plus size={18} />
          Add Document
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search documents by name, tags, description..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All Types</option>
            {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select
            value={filterRelation}
            onChange={e => setFilterRelation(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All Relations</option>
            {RELATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select
            value={filterSupplier}
            onChange={e => setFilterSupplier(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All Suppliers</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          {hasActiveFilters && (
            <button
              onClick={() => { setFilterType(''); setFilterRelation(''); setFilterSupplier(''); }}
              className="text-xs text-blue-600 hover:underline font-medium"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
            <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center">
              <FolderOpen size={28} />
            </div>
            <p className="text-sm font-medium">
              {documents.length === 0 ? 'No documents yet' : 'No documents match the current filters'}
            </p>
            {documents.length === 0 && (
              <button onClick={openAddModal} className="text-sm text-blue-600 hover:underline font-medium">
                Add your first document
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider">ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider">Related To</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider">Tags</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider">Link</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocs.map(doc => (
                  <tr key={doc.documentId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{doc.documentId}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{doc.name}</div>
                      {doc.description && (
                        <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[300px]">{doc.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_COLORS[doc.type] || TYPE_COLORS.Other}`}>
                        {doc.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {doc.relatedToName ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">{RELATION_ICONS[doc.relatedToType]}</span>
                          <span className="text-slate-700 text-xs">{doc.relatedToName}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {doc.tags.slice(0, 3).map((tag, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                            <Tag size={9} />
                            {tag}
                          </span>
                        ))}
                        {doc.tags.length > 3 && (
                          <span className="text-[10px] text-slate-400">+{doc.tags.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={doc.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium"
                      >
                        <ExternalLink size={13} />
                        Open
                      </a>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(doc)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        {deleteConfirm === doc.documentId ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(doc.documentId)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                              title="Confirm delete"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"
                              title="Cancel"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(doc.documentId)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">
                {editingDoc ? 'Edit Document' : 'Add Document'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Link *</label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="url"
                    value={form.link}
                    onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
                    placeholder="https://drive.google.com/..."
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Document Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Product TDS Sheet"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description..."
                  rows={2}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Document Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Related To</label>
                <div className="flex gap-2 mb-2">
                  {RELATION_TYPES.map(rt => (
                    <button
                      key={rt}
                      onClick={() => {
                        setForm(f => ({ ...f, relatedToType: rt, relatedToId: '', relatedToName: '' }));
                        setRelationSearch('');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        form.relatedToType === rt
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {RELATION_ICONS[rt]}
                      {rt}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    value={relationSearch}
                    onChange={e => {
                      setRelationSearch(e.target.value);
                      setShowRelationDropdown(true);
                      if (!e.target.value) {
                        setForm(f => ({ ...f, relatedToId: '', relatedToName: '' }));
                      }
                    }}
                    onFocus={() => setShowRelationDropdown(true)}
                    placeholder={`Search ${form.relatedToType.toLowerCase()} by name, code, or ID...`}
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  {form.relatedToId && (
                    <button
                      onClick={() => {
                        setForm(f => ({ ...f, relatedToId: '', relatedToName: '' }));
                        setRelationSearch('');
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
                    </button>
                  )}
                  {showRelationDropdown && relationSearch && !form.relatedToId && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-10">
                      {relationOptions.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-slate-400">No results found</div>
                      ) : (
                        relationOptions.map(opt => (
                          <button
                            key={opt.id}
                            onClick={() => {
                              setForm(f => ({ ...f, relatedToId: opt.id, relatedToName: opt.name }));
                              setRelationSearch(opt.name);
                              setShowRelationDropdown(false);
                            }}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 text-left transition-colors"
                          >
                            <span className="text-sm text-slate-700 font-medium">{opt.name}</span>
                            <span className="text-xs text-slate-400 font-mono">{opt.sub}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {form.relatedToId && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                    <span className="text-blue-400">{RELATION_ICONS[form.relatedToType]}</span>
                    <span className="text-blue-700 font-medium">{form.relatedToName}</span>
                    <span className="text-blue-400 font-mono">({form.relatedToId})</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tags</label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    value={form.tags}
                    onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                    placeholder="Comma-separated tags, e.g., waterproofing, SDS, 2024"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.link.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {editingDoc ? 'Update' : 'Add Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentMemory;
