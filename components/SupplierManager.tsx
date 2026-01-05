import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Building2, Globe, Mail, Phone, X, Check, Search } from 'lucide-react';
import { Supplier } from '../types';

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
  const [formData, setFormData] = useState({
    name: '',
    country: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    website: '',
    notes: '',
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
        country: formData.country || undefined,
        contactName: formData.contactName || undefined,
        contactEmail: formData.contactEmail || undefined,
        contactPhone: formData.contactPhone || undefined,
        address: formData.address || undefined,
        website: formData.website || undefined,
        notes: formData.notes || undefined,
      });
      setEditingSupplier(null);
    } else {
      onAddSupplier({
        id: generateSupplierId(),
        name: formData.name,
        country: formData.country || undefined,
        contactName: formData.contactName || undefined,
        contactEmail: formData.contactEmail || undefined,
        contactPhone: formData.contactPhone || undefined,
        address: formData.address || undefined,
        website: formData.website || undefined,
        notes: formData.notes || undefined,
        isActive: true,
      });
    }

    setFormData({
      name: '',
      country: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      address: '',
      website: '',
      notes: '',
    });
    setShowAddModal(false);
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      country: supplier.country || '',
      contactName: supplier.contactName || '',
      contactEmail: supplier.contactEmail || '',
      contactPhone: supplier.contactPhone || '',
      address: supplier.address || '',
      website: supplier.website || '',
      notes: supplier.notes || '',
    });
    setShowAddModal(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this supplier?')) {
      onDeleteSupplier(id);
    }
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingSupplier(null);
    setFormData({
      name: '',
      country: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      address: '',
      website: '',
      notes: '',
    });
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Supplier Management</h1>
          <p className="text-gray-600 mt-1">Manage your supplier database</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Add Supplier
        </button>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search suppliers..."
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Country</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredSuppliers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  <Building2 size={48} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">No suppliers found</p>
                  <p className="text-sm">Add your first supplier to get started</p>
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
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${supplier.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {supplier.isActive ? 'Active' : 'Inactive'}
                    </span>
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
        Total: {filteredSuppliers.length} supplier{filteredSuppliers.length !== 1 ? 's' : ''}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
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
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Check size={16} />
                  {editingSupplier ? 'Update Supplier' : 'Add Supplier'}
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
