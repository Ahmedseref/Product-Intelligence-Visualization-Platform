import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Product, ViewMode, User, CustomField, TreeNode } from './types';
import { INITIAL_PRODUCTS, INITIAL_TREE_NODES } from './mockData';
import { ICONS } from './constants';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ProductList from './components/ProductList';
import Visualize from './components/Visualize';
import ProductForm from './components/ProductForm';
import ProductTree from './components/ProductTree';
import TaxonomyBuilder from './components/TaxonomyBuilder';
import { api } from './client/api';

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>(INITIAL_TREE_NODES);
  const [customFieldConfigs, setCustomFieldConfigs] = useState<CustomField[]>([]);
  const [currentUser] = useState<User>({ id: 'U-01', name: 'Admin User', role: 'Admin' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDbConnected, setIsDbConnected] = useState(false);

  const syncWithDatabase = useCallback(async () => {
    const retryFetch = async <T,>(fn: () => Promise<T>, attempts: number, delay: number): Promise<T> => {
      for (let i = 0; i < attempts; i++) {
        try {
          return await fn();
        } catch (err) {
          if (i === attempts - 1) throw err;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      throw new Error('Retry failed');
    };

    try {
      await retryFetch(() => api.seedDatabase(), 10, 1000);
      
      const [nodesData, productsData, fieldsData] = await Promise.all([
        api.getTreeNodes(),
        api.getProducts(),
        api.getCustomFields(),
      ]);

      setTreeNodes(nodesData.map(n => ({
        id: n.nodeId,
        name: n.name,
        type: n.type as any,
        parentId: n.parentId,
        description: n.description || undefined,
        metadata: n.metadata as any,
      })));

      setProducts(productsData.map(p => ({
        id: p.productId,
        name: p.name,
        supplier: p.supplier || '',
        supplierId: p.supplierId || undefined,
        nodeId: p.nodeId,
        manufacturer: p.manufacturer || '',
        manufacturingLocation: p.manufacturingLocation || '',
        description: p.description || '',
        imageUrl: p.imageUrl || '',
        price: p.price || 0,
        currency: p.currency || 'USD',
        unit: p.unit || '',
        moq: p.moq || 1,
        leadTime: p.leadTime || 0,
        packagingType: p.packagingType || '',
        hsCode: p.hsCode || undefined,
        certifications: (p.certifications as string[]) || [],
        shelfLife: p.shelfLife || '',
        storageConditions: p.storageConditions || '',
        customFields: (p.customFields as any[]) || [],
        category: p.category || '',
        sector: p.sector || '',
        createdBy: p.createdBy || '',
        dateAdded: p.dateAdded?.toString() || new Date().toISOString(),
        lastUpdated: p.lastUpdated?.toString() || new Date().toISOString(),
        history: (p.history as any[]) || [],
      })));

      setCustomFieldConfigs(fieldsData.map(f => ({
        id: f.fieldId,
        label: f.label,
        type: f.type as any,
        options: f.options as string[] | undefined,
      })));

      setIsDbConnected(true);
      setError(null);
    } catch (err) {
      console.log('Database sync failed, using local data');
      setIsDbConnected(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      syncWithDatabase();
    }, 2000);
    return () => clearTimeout(timer);
  }, [syncWithDatabase]);

  const addProduct = async (newProduct: Product) => {
    try {
      await api.createProduct({
        productId: newProduct.id,
        name: newProduct.name,
        supplier: newProduct.supplier,
        supplierId: newProduct.supplierId,
        nodeId: newProduct.nodeId,
        manufacturer: newProduct.manufacturer,
        manufacturingLocation: newProduct.manufacturingLocation,
        description: newProduct.description,
        imageUrl: newProduct.imageUrl,
        price: newProduct.price,
        currency: newProduct.currency,
        unit: newProduct.unit,
        moq: newProduct.moq,
        leadTime: newProduct.leadTime,
        packagingType: newProduct.packagingType,
        hsCode: newProduct.hsCode,
        certifications: newProduct.certifications,
        shelfLife: newProduct.shelfLife,
        storageConditions: newProduct.storageConditions,
        customFields: newProduct.customFields,
        category: newProduct.category,
        sector: newProduct.sector,
        createdBy: newProduct.createdBy,
        history: newProduct.history,
      });
      setProducts(prev => [newProduct, ...prev]);
      setViewMode('inventory');
    } catch (err) {
      console.error('Failed to add product:', err);
      setProducts(prev => [newProduct, ...prev]);
      setViewMode('inventory');
    }
  };

  const updateProduct = async (updatedProduct: Product) => {
    try {
      await api.updateProduct(updatedProduct.id, {
        name: updatedProduct.name,
        supplier: updatedProduct.supplier,
        nodeId: updatedProduct.nodeId,
        manufacturer: updatedProduct.manufacturer,
        manufacturingLocation: updatedProduct.manufacturingLocation,
        description: updatedProduct.description,
        imageUrl: updatedProduct.imageUrl,
        price: updatedProduct.price,
        currency: updatedProduct.currency,
        unit: updatedProduct.unit,
        moq: updatedProduct.moq,
        leadTime: updatedProduct.leadTime,
        packagingType: updatedProduct.packagingType,
        hsCode: updatedProduct.hsCode,
        certifications: updatedProduct.certifications,
        shelfLife: updatedProduct.shelfLife,
        storageConditions: updatedProduct.storageConditions,
        customFields: updatedProduct.customFields,
        category: updatedProduct.category,
        sector: updatedProduct.sector,
        history: updatedProduct.history,
      });
      setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    } catch (err) {
      console.error('Failed to update product:', err);
      setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    }
  };

  const deleteProduct = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await api.deleteProduct(id);
        setProducts(prev => prev.filter(p => p.id !== id));
      } catch (err) {
        console.error('Failed to delete product:', err);
        setProducts(prev => prev.filter(p => p.id !== id));
      }
    }
  };

  const addCustomFieldDefinition = async (field: CustomField) => {
    try {
      await api.createCustomField({
        fieldId: field.id,
        label: field.label,
        type: field.type,
        options: field.options,
        isGlobal: true,
      });
      setCustomFieldConfigs(prev => [...prev, field]);
    } catch (err) {
      console.error('Failed to add custom field:', err);
      setCustomFieldConfigs(prev => [...prev, field]);
    }
  };

  const addTreeNode = async (nodeOrParentId: TreeNode | string | null, nodeData?: Partial<TreeNode>) => {
    let newNode: TreeNode;
    
    if (typeof nodeOrParentId === 'object' && nodeOrParentId !== null && 'id' in nodeOrParentId) {
      newNode = nodeOrParentId as TreeNode;
    } else {
      const parentId = nodeOrParentId as string | null;
      const newNodeId = `node-${Date.now()}`;
      newNode = {
        id: newNodeId,
        name: nodeData?.name || 'New Category',
        type: nodeData?.type || 'category',
        parentId,
        description: nodeData?.description,
        metadata: nodeData?.metadata,
      };
    }

    try {
      await api.createTreeNode({
        nodeId: newNode.id,
        name: newNode.name,
        type: newNode.type,
        parentId: newNode.parentId,
        description: newNode.description,
        metadata: newNode.metadata,
      });
      setTreeNodes(prev => [...prev, newNode]);
    } catch (err) {
      console.error('Failed to add tree node:', err);
      setTreeNodes(prev => [...prev, newNode]);
    }
  };

  const editTreeNode = async (nodeOrId: TreeNode | string, updates?: Partial<TreeNode>) => {
    let nodeId: string;
    let nodeUpdates: Partial<TreeNode>;
    
    if (typeof nodeOrId === 'string') {
      nodeId = nodeOrId;
      nodeUpdates = updates || {};
    } else {
      nodeId = nodeOrId.id;
      nodeUpdates = nodeOrId;
    }

    try {
      await api.updateTreeNode(nodeId, {
        name: nodeUpdates.name,
        type: nodeUpdates.type,
        parentId: nodeUpdates.parentId,
        description: nodeUpdates.description,
        metadata: nodeUpdates.metadata,
      });
      setTreeNodes(prev => prev.map(n => n.id === nodeId ? { ...n, ...nodeUpdates } : n));
    } catch (err) {
      console.error('Failed to update tree node:', err);
      setTreeNodes(prev => prev.map(n => n.id === nodeId ? { ...n, ...nodeUpdates } : n));
    }
  };

  const deleteTreeNode = async (nodeId: string) => {
    const getDescendantIds = (id: string): string[] => {
      const children = treeNodes.filter(n => n.parentId === id);
      return [id, ...children.flatMap(c => getDescendantIds(c.id))];
    };
    const toDelete = getDescendantIds(nodeId);
    
    try {
      for (const id of toDelete) {
        await api.deleteTreeNode(id);
      }
      setTreeNodes(prev => prev.filter(n => !toDelete.includes(n.id)));
      if (selectedNodeId && toDelete.includes(selectedNodeId)) {
        setSelectedNodeId(null);
      }
    } catch (err) {
      console.error('Failed to delete tree node:', err);
      setTreeNodes(prev => prev.filter(n => !toDelete.includes(n.id)));
    }
  };

  const moveTreeNode = async (nodeId: string, newParentId: string | null) => {
    try {
      await api.updateTreeNode(nodeId, { parentId: newParentId });
      setTreeNodes(prev => prev.map(n => n.id === nodeId ? { ...n, parentId: newParentId } : n));
    } catch (err) {
      console.error('Failed to move tree node:', err);
      setTreeNodes(prev => prev.map(n => n.id === nodeId ? { ...n, parentId: newParentId } : n));
    }
  };

  const getDescendantIds = (nodeId: string): string[] => {
    const children = treeNodes.filter(n => n.parentId === nodeId);
    let ids = children.map(c => c.id);
    children.forEach(c => {
      ids = [...ids, ...getDescendantIds(c.id)];
    });
    return ids;
  };

  const filteredProducts = useMemo(() => {
    let result = products;

    if (selectedNodeId) {
      const targetIds = [selectedNodeId, ...getDescendantIds(selectedNodeId)];
      result = result.filter(p => targetIds.includes(p.nodeId));
    }

    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(lower) || 
        p.supplier.toLowerCase().includes(lower) ||
        p.id.toLowerCase().includes(lower) ||
        p.category.toLowerCase().includes(lower)
      );
    }

    return result;
  }, [products, searchQuery, selectedNodeId, treeNodes]);

  const productCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    treeNodes.forEach(node => {
      const descendantIds = [node.id, ...getDescendantIds(node.id)];
      counts[node.id] = products.filter(p => descendantIds.includes(p.nodeId)).length;
    });
    return counts;
  }, [products, treeNodes]);

  const selectedNodePath = useMemo(() => {
    if (!selectedNodeId) return null;
    const path: TreeNode[] = [];
    let current = treeNodes.find(n => n.id === selectedNodeId);
    while (current) {
      path.unshift(current);
      current = treeNodes.find(n => n.id === current?.parentId);
    }
    return path;
  }, [selectedNodeId, treeNodes]);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {error && (
        <div className="fixed top-4 right-4 bg-amber-100 border border-amber-300 text-amber-800 px-4 py-2 rounded-lg text-sm z-50">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-bold">×</button>
        </div>
      )}

      <Sidebar 
        currentView={viewMode} 
        setView={setViewMode} 
        user={currentUser} 
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 z-10">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-800 capitalize tracking-tight whitespace-nowrap">
              {viewMode.replace('-', ' ')}
            </h1>
            
            {selectedNodePath && (
              <div className="hidden md:flex items-center gap-1 ml-4 py-1 px-3 bg-slate-50 rounded-full border border-slate-100 max-w-sm overflow-hidden">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Path:</span>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 truncate">
                  {selectedNodePath.map((n, i) => (
                    <React.Fragment key={n.id}>
                      {i > 0 && <span className="text-slate-300">/</span>}
                      <span className={i === selectedNodePath.length - 1 ? 'text-blue-600' : ''}>{n.name}</span>
                    </React.Fragment>
                  ))}
                </div>
                <button 
                  onClick={() => setSelectedNodeId(null)}
                  className="ml-2 text-slate-400 hover:text-red-500"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            )}

            <div className="relative max-w-md w-full ml-4 hidden lg:block">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                {ICONS.Search}
              </span>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="Search products, suppliers, IDs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
             <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors relative">
              <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></div>
              {ICONS.Settings}
            </button>
            <div className="flex items-center gap-2 border-l pl-4 ml-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
                {currentUser.name.charAt(0)}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-slate-900 leading-none">{currentUser.name}</p>
                <p className="text-[10px] text-slate-500 leading-none mt-1">{currentUser.role}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {(viewMode === 'inventory' || viewMode === 'dashboard') && (
            <aside className="w-72 border-r border-slate-200 bg-white hidden xl:block flex-shrink-0">
              <div className="p-4 h-full">
                <ProductTree 
                  nodes={treeNodes} 
                  selectedNodeId={selectedNodeId} 
                  onSelectNode={setSelectedNodeId} 
                  productsCount={productCounts}
                  onAddNode={addTreeNode}
                  onEditNode={editTreeNode}
                  onDeleteNode={deleteTreeNode}
                  onMoveNode={moveTreeNode}
                />
              </div>
            </aside>
          )}

          <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
            {viewMode === 'dashboard' && (
              <Dashboard products={filteredProducts} />
            )}
            {viewMode === 'inventory' && (
              <ProductList 
                products={filteredProducts} 
                onUpdate={updateProduct} 
                onDelete={deleteProduct}
                customFields={customFieldConfigs}
                treeNodes={treeNodes}
              />
            )}
            {viewMode === 'visualize' && (
              <Visualize products={filteredProducts} />
            )}
            {viewMode === 'add-product' && (
              <ProductForm 
                onSubmit={addProduct} 
                onCancel={() => setViewMode('inventory')}
                currentUser={currentUser}
                customFields={customFieldConfigs}
                treeNodes={treeNodes}
                onAddFieldDefinition={addCustomFieldDefinition}
              />
            )}
            {viewMode === 'taxonomy-manager' && (
              <TaxonomyBuilder
                treeNodes={treeNodes}
                products={products}
                onAddNode={addTreeNode}
                onUpdateNode={editTreeNode}
                onDeleteNode={deleteTreeNode}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;
