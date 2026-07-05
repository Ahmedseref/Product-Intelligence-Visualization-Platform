import React, { useState, useCallback, useEffect } from 'react';
import { Plus, Pencil, Trash2, Building2, Globe, Mail, Phone, X, Check, Search, Tag, Sparkles, RefreshCw, UploadCloud } from 'lucide-react';
import { Supplier } from '../types';
import { api, NotionSyncStatus } from '../client/api';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface SupplierManagerProps {
  suppliers: Supplier[];
  onAddSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateSupplier: (id: string, updates: Partial<Supplier>) => void;
  onDeleteSupplier: (id: string) => void;
}

const SupplierManager: React.FC<SupplierManagerProps> = ({
  suppliers,
  onAddSupplier,
  onUpdateSupplier,
  onDeleteSupplier,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncStatus, setSyncStatus] = useState<NotionSyncStatus | null>(null);
  const [isPushing, setIsPushing] = useState(false);

  const refreshSyncStatus = useCallback(async () => {
    try {
      const status = await api.getNotionSyncStatus();
      setSyncStatus(status);
    } catch (e) {
      // Non-fatal — sync status bar simply stays hidden/stale
    }
  }, []);

  useEffect(() => {
    refreshSyncStatus();
    const interval = setInterval(refreshSyncStatus, 15000);
    return () => clearInterval(interval);
  }, [refreshSyncStatus]);

  const handlePushToNotion = async () => {
    setIsPushing(true);
    try {
      await api.notionPush();
    } catch (e) {
      console.error('Failed to push to Notion:', e);
    } finally {
      setIsPushing(false);
      refreshSyncStatus();
    }
  };

  const escCloseModal = useCallback(() => {
    setShowAddModal(false);
    setEditingSupplier(null);
  }, []);
  useEscapeKey(showAddModal || editingSupplier ? escCloseModal : null);
  const [formData, setFormData] = useState({
    name: '',
    supplierCode: '',
    country: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    website: '',
    notes: '',
    leadPosition: '',
    leadSource: '',
    sourceQuality: '',
    industryMainActivities: '',
    mobile2: '',
    action: '',
    priority: '',
    paymentTerms: '',
  });

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.country && s.country.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const generateSupplierId = () => {
    const maxNum = suppliers.reduce((max, s) => {
      const match = s.id.match(/S-(\d+)/);
      return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);
    return `S-${String(maxNum + 1).padStart(4, '0')}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingSupplier) {
      onUpdateSupplier(editingSupplier.id, {
        name: formData.name,
        supplierCode: formData.supplierCode.toUpperCase() || undefined,
        country: formData.country || undefined,
        contactName: formData.contactName || undefined,
        contactEmail: formData.contactEmail || undefined,
        contactPhone: formData.contactPhone || undefined,
        address: formData.address || undefined,
        website: formData.website || undefined,
        notes: formData.notes || undefined,
        leadPosition: formData.leadPosition || undefined,
        leadSource: formData.leadSource || undefined,
        sourceQuality: formData.sourceQuality || undefined,
        industryMainActivities: formData.industryMainActivities || undefined,
        mobile2: formData.mobile2 || undefined,
        action: formData.action || undefined,
        priority: formData.priority || undefined,
        paymentTerms: formData.paymentTerms || undefined,
      });
      setEditingSupplier(null);
    } else {
      onAddSupplier({
        id: generateSupplierId(),
        name: formData.name,
        supplierCode: formData.supplierCode.toUpperCase() || undefined,
        country: formData.country || undefined,
        contactName: formData.contactName || undefined,
        contactEmail: formData.contactEmail || undefined,
        contactPhone: formData.contactPhone || undefined,
        address: formData.address || undefined,
        website: formData.website || undefined,
        notes: formData.notes || undefined,
        leadPosition: formData.leadPosition || undefined,
        leadSource: formData.leadSource || undefined,
        sourceQuality: formData.sourceQuality || undefined,
        industryMainActivities: formData.industryMainActivities || undefined,
        mobile2: formData.mobile2 || undefined,
        action: formData.action || undefined,
        priority: formData.priority || undefined,
        paymentTerms: formData.paymentTerms || undefined,
        isActive: true,
      });
    }

    setFormData({
      name: '',
      supplierCode: '',
      country: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      address: '',
      website: '',
      notes: '',
      leadPosition: '',
      leadSource: '',
      sourceQuality: '',
      industryMainActivities: '',
      mobile2: '',
      action: '',
      priority: '',
      paymentTerms: '',
    });
    setShowAddModal(false);
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      supplierCode: supplier.supplierCode || '',
      country: supplier.country || '',
      contactName: supplier.contactName || '',
      contactEmail: supplier.contactEmail || '',
      contactPhone: supplier.contactPhone || '',
      address: supplier.address || '',
      website: supplier.website || '',
      notes: supplier.notes || '',
      leadPosition: supplier.leadPosition || '',
      leadSource: supplier.leadSource || '',
      sourceQuality: supplier.sourceQuality || '',
      industryMainActivities: supplier.industryMainActivities || '',
      mobile2: supplier.mobile2 || '',
      action: supplier.action || '',
      priority: supplier.priority || '',
      paymentTerms: supplier.paymentTerms || '',
    });
    setShowAddModal(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this contact?')) {
      onDeleteSupplier(id);
    }
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingSupplier(null);
    setFormData({
      name: '',
      supplierCode: '',
      country: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      address: '',
      website: '',
      notes: '',
      leadPosition: '',
      leadSource: '',
      sourceQuality: '',
      industryMainActivities: '',
      mobile2: '',
      action: '',
      priority: '',
      paymentTerms: '',
    });
  };

  const handleSuggestCode = async () => {
    if (!formData.name.trim()) return;
    try {
      const result = await api.suggestSupplierCode(formData.name);
      setFormData(prev => ({ ...prev, supplierCode: result.code }));
    } catch (e) {
      console.error('Failed to suggest supplier code:', e);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Contact Network</h1>
          <p className="text-gray-600 mt-1">Manage your contacts, synced with Notion</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePushToNotion}
            disabled={isPushing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60"
            title="Push local changes to Notion"
          >
            <UploadCloud size={18} className={isPushing ? 'animate-pulse' : ''} />
            {isPushing ? 'Pushing...' : 'Push to Notion'}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Add Contact
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <RefreshCw size={14} className={(syncStatus?.pullInProgress || syncStatus?.pushInProgress) ? 'animate-spin text-blue-500' : 'text-gray-400'} />
        {syncStatus ? (
          <span>
            {(syncStatus.pullInProgress || syncStatus.pushInProgress) ? 'Syncing with Notion…' : 'Notion sync'}
            {syncStatus.lastPullAt && ` · Last pull: ${new Date(syncStatus.lastPullAt).toLocaleString()}${syncStatus.lastPullCount != null ? ` (${syncStatus.lastPullCount} updated)` : ''}`}
            {syncStatus.lastPushAt && ` · Last push: ${new Date(syncStatus.lastPushAt).toLocaleString()}${syncStatus.lastPushCount != null ? ` (${syncStatus.lastPushCount} pushed)` : ''}`}
            {syncStatus.lastError && <span className="text-red-500"> · Error: {syncStatus.lastError}</span>}
          </span>
        ) : (
          <span>Notion sync status unavailable</span>
        )}
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Country</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lead Info</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Industry</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredSuppliers.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                  <Building2 size={48} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">No contacts found</p>
                  <p className="text-sm">Add your first contact to get started</p>
                </td>
              </tr>
            ) : (
              filteredSuppliers.map((supplier) => (
                <tr key={supplier.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{supplier.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                        <Building2 size={20} className="text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                        {supplier.website && (
                          <a href={supplier.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                            <Globe size={12} /> Website
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {supplier.supplierCode ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-mono text-xs font-bold">
                        <Tag size={12} />
                        {supplier.supplierCode}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{supplier.country || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{supplier.contactName || '-'}</div>
                    {supplier.contactEmail && (
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Mail size={12} /> {supplier.contactEmail}
                      </div>
                    )}
                    {supplier.contactPhone && (
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Phone size={12} /> {supplier.contactPhone}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-xs text-gray-700">{supplier.leadPosition || '-'}</div>
                    {supplier.leadSource && (
                      <div className="text-xs text-gray-500">Source: {supplier.leadSource}</div>
                    )}
                    {supplier.sourceQuality && (
                      <div className="text-xs text-gray-500">Quality: {supplier.sourceQuality}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600 max-w-[160px] truncate" title={supplier.industryMainActivities || ''}>
                    {supplier.industryMainActivities || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${supplier.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {supplier.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {supplier.notionPageId && (
                      <span className="ml-1 px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-50 text-blue-700" title="Synced with Notion">
                        Notion
                      </span>
                    )}
                    {supplier.action && (
                      <div className="text-xs text-gray-500 mt-1">Action: {supplier.action}</div>
                    )}
                    {supplier.priority && (
                      <div className="text-xs text-gray-500">Priority: {supplier.priority}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => handleEdit(supplier)} className="text-blue-600 hover:text-blue-900 mr-3">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => handleDelete(supplier.id)} className="text-red-600 hover:text-red-900">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Total: {filteredSuppliers.length} contact{filteredSuppliers.length !== 1 ? 's' : ''}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">{editingSupplier ? 'Edit Contact' : 'Add New Contact'}</h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.supplierCode}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 5);
                      setFormData({ ...formData, supplierCode: val });
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono uppercase"
                    placeholder="e.g. SUP, BAS, SIK"
                    maxLength={5}
                  />
                  <button
                    type="button"
                    onClick={handleSuggestCode}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm flex items-center gap-1 transition-colors"
                    title="Auto-suggest code from supplier name"
                  >
                    <Sparkles size={14} />
                    Suggest
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">2-5 uppercase characters. Used in product stock codes (P.SUP.BRANCH.COLOR.0001)</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                <input
                  type="text"
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lead Position</label>
                  <input
                    type="text"
                    value={formData.leadPosition}
                    onChange={(e) => setFormData({ ...formData, leadPosition: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lead Source</label>
                  <input
                    type="text"
                    value={formData.leadSource}
                    onChange={(e) => setFormData({ ...formData, leadSource: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source Quality</label>
                  <input
                    type="text"
                    value={formData.sourceQuality}
                    onChange={(e) => setFormData({ ...formData, sourceQuality: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry (Main Activities)</label>
                  <input
                    type="text"
                    value={formData.industryMainActivities}
                    onChange={(e) => setFormData({ ...formData, industryMainActivities: e.target.value })}
                    placeholder="Comma-separated"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="pt-2 border-t">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notion Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mobile 2</label>
                    <input
                      type="tel"
                      value={formData.mobile2}
                      onChange={(e) => setFormData({ ...formData, mobile2: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                    <input
                      type="text"
                      value={formData.action}
                      onChange={(e) => setFormData({ ...formData, action: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <input
                      type="text"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                    <input
                      type="text"
                      value={formData.paymentTerms}
                      onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                {editingSupplier && (editingSupplier.paidAmount != null || editingSupplier.invoiceValue != null || editingSupplier.pendingPayment) && (
                  <div className="mt-4 grid grid-cols-3 gap-4 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                    <div>
                      <span className="block text-xs text-gray-400">Invoice Value</span>
                      {editingSupplier.invoiceValue ?? '-'}
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400">Paid Amount</span>
                      {editingSupplier.paidAmount ?? '-'}
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400">Pending Payment</span>
                      {editingSupplier.pendingPayment ?? '-'}
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  Read-only fields synced from Notion (e.g. relations, files, formulas) are preserved automatically and not editable here.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Check size={16} />
                  {editingSupplier ? 'Update Contact' : 'Add Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierManager;
