
import React, { useState, useMemo, useEffect } from 'react';
import { Product, ViewMode, User, CustomField, TreeNode } from './types';
import { INITIAL_PRODUCTS, INITIAL_TREE_NODES } from './mockData';
import { ICONS } from './constants';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ProductList from './components/ProductList';
import Visualize from './components/Visualize';
import ProductForm from './components/ProductForm';
import ProductTree from './components/ProductTree';

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>(INITIAL_TREE_NODES);
  const [customFieldConfigs, setCustomFieldConfigs] = useState<CustomField[]>([]);
  const [currentUser] = useState<User>({ id: 'U-01', name: 'Admin User', role: 'Admin' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Persist (simulated)
  useEffect(() => {
    const saved = localStorage.getItem('pip_products');
    const savedFields = localStorage.getItem('pip_custom_fields');
    const savedTree = localStorage.getItem('pip_tree');
    if (saved) {
      try {
        setProducts(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load products", e);
      }
    }
    if (savedFields) {
      try {
        setCustomFieldConfigs(JSON.parse(savedFields));
      } catch (e) {
        console.error("Failed to load custom fields", e);
      }
    }
    if (savedTree) {
      try {
        setTreeNodes(JSON.parse(savedTree));
      } catch (e) {
        console.error("Failed to load taxonomy tree", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('pip_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('pip_custom_fields', JSON.stringify(customFieldConfigs));
  }, [customFieldConfigs]);

  useEffect(() => {
    localStorage.setItem('pip_tree', JSON.stringify(treeNodes));
  }, [treeNodes]);

  const addProduct = (newProduct: Product) => {
    setProducts(prev => [newProduct, ...prev]);
    setViewMode('inventory');
  };

  const updateProduct = (updatedProduct: Product) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const deleteProduct = (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      setProducts(prev => prev.filter(p => p.id !== id));
    }
  };

  const addCustomFieldDefinition = (field: CustomField) => {
    setCustomFieldConfigs(prev => [...prev, field]);
  };

  const addTreeNode = (parentId: string | null) => {
    const name = window.prompt("Enter node name:");
    if (!name) return;
    const newNode: TreeNode = {
      id: `node-${Date.now()}`,
      name,
      type: 'category', // Defaulting to category for simplicity in quick-add
      parentId,
    };
    setTreeNodes(prev => [...prev, newNode]);
  };

  // Helper to get all descendant IDs of a node
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

    // Tree Filter
    if (selectedNodeId) {
      const targetIds = [selectedNodeId, ...getDescendantIds(selectedNodeId)];
      result = result.filter(p => targetIds.includes(p.nodeId));
    }

    // Search Filter
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
      {/* Sidebar */}
      <Sidebar 
        currentView={viewMode} 
        setView={setViewMode} 
        user={currentUser} 
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 z-10">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-800 capitalize tracking-tight whitespace-nowrap">
              {viewMode.replace('-', ' ')}
            </h1>
            
            {/* Breadcrumbs for Tree Navigation */}
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
          {/* Tree Explorer Panel - Only visible in Inventory and Dashboard for filtering */}
          {(viewMode === 'inventory' || viewMode === 'dashboard') && (
            <aside className="w-64 border-r border-slate-200 bg-white hidden xl:block flex-shrink-0">
              <div className="p-4 h-full">
                <ProductTree 
                  nodes={treeNodes} 
                  selectedNodeId={selectedNodeId} 
                  onSelectNode={setSelectedNodeId} 
                  productsCount={productCounts}
                  onAddNode={addTreeNode}
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
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;
