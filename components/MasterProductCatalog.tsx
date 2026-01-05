import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Package, X, Check, Search, ChevronRight } from 'lucide-react';
import { MasterProduct, TreeNode } from '../types';

interface MasterProductCatalogProps {
  masterProducts: MasterProduct[];
  treeNodes: TreeNode[];
  onAddMasterProduct: (mp: Omit<MasterProduct, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateMasterProduct: (id: string, updates: Partial<MasterProduct>) => void;
  onDeleteMasterProduct: (id: string) => void;
}

const MasterProductCatalog: React.FC<MasterProductCatalogProps> = ({
  masterProducts,
  treeNodes,
  onAddMasterProduct,
  onUpdateMasterProduct,
  onDeleteMasterProduct,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MasterProduct | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    nodeId: '',
    description: '',
    imageUrl: '',
  });

  const getNodePath = (nodeId: string): string => {
    const path: string[] = [];
    let currentNode = treeNodes.find(n => n.id === nodeId);
    while (currentNode) {
      path.unshift(currentNode.name);
      currentNode = currentNode.parentId ? treeNodes.find(n => n.id === currentNode?.parentId) : undefined;
    }
    return path.join(' > ');
  };

  const getCategoryName = (nodeId: string): string => {
    const node = treeNodes.find(n => n.id === nodeId);
    return node?.name || 'Unknown';
  };

  const filteredProducts = masterProducts.filter(mp =>
    mp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getCategoryName(mp.nodeId).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const generateProductId = () => {
    const maxNum = masterProducts.reduce((max, p) => {
      const match = p.id.match(/P-(\d+)/);
      return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);
    return `P-${String(maxNum + 1).padStart(4, '0')}`;
  };

  const sectors = treeNodes.filter(n => n.type === 'sector');
  const categories = treeNodes.filter(n => n.type === 'category');
  const subcategories = treeNodes.filter(n => n.type === 'subcategory');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.nodeId) return;

    if (editingProduct) {
      onUpdateMasterProduct(editingProduct.id, {
        name: formData.name,
        nodeId: formData.nodeId,
        description: formData.description || undefined,
        imageUrl: formData.imageUrl || undefined,
      });
      setEditingProduct(null);
    } else {
      onAddMasterProduct({
        id: generateProductId(),
        name: formData.name,
        nodeId: formData.nodeId,
        description: formData.description || undefined,
        imageUrl: formData.imageUrl || undefined,
        isActive: true,
      });
    }

    setFormData({ name: '', nodeId: '', description: '', imageUrl: '' });
    setShowAddModal(false);
  };

  const handleEdit = (product: MasterProduct) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      nodeId: product.nodeId,
      description: product.description || '',
      imageUrl: product.imageUrl || '',
    });
    setShowAddModal(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this product? All supplier variants will also be deleted.')) {
      onDeleteMasterProduct(id);
    }
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingProduct(null);
    setFormData({ name: '', nodeId: '', description: '', imageUrl: '' });
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Master Product Catalog</h1>
          <p className="text-gray-600 mt-1">Define base products before adding supplier variants</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus size={20} />
          Add Product
        </button>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-lg shadow">
            <Package size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-500">No master products found</p>
            <p className="text-sm text-gray-400">Add your first product to get started</p>
          </div>
        ) : (
          filteredProducts.map((product) => (
            <div key={product.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
              <div className="aspect-video bg-gray-100 rounded-t-lg overflow-hidden">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package size={48} className="text-gray-300" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-xs font-mono text-gray-500">{product.id}</span>
                    <h3 className="text-lg font-semibold text-gray-800">{product.name}</h3>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${product.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {product.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="text-sm text-gray-500 flex items-center gap-1 mb-2">
                  <ChevronRight size={14} />
                  {getNodePath(product.nodeId) || 'Uncategorized'}
                </div>
                {product.description && (
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">{product.description}</p>
                )}
                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    onClick={() => handleEdit(product)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(product.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Total: {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g., Marble, Granite, Cotton Fabric"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select
                  value={formData.nodeId}
                  onChange={(e) => setFormData({ ...formData, nodeId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                >
                  <option value="">Select category...</option>
                  {sectors.map(sector => (
                    <optgroup key={sector.id} label={sector.name}>
                      {categories
                        .filter(cat => cat.parentId === sector.id)
                        .map(category => (
                          <React.Fragment key={category.id}>
                            <option value={category.id}>{category.name}</option>
                            {subcategories
                              .filter(sub => sub.parentId === category.id)
                              .map(sub => (
                                <option key={sub.id} value={sub.id}>&nbsp;&nbsp;- {sub.name}</option>
                              ))}
                          </React.Fragment>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Brief description of the product..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="https://example.com/image.jpg"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2">
                  <Check size={16} />
                  {editingProduct ? 'Update Product' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterProductCatalog;
