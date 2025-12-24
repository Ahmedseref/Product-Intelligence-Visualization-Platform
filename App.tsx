
import React, { useState, useMemo, useEffect } from 'react';
import { Product, ViewMode, User, CustomField } from './types';
import { INITIAL_PRODUCTS } from './mockData';
import { ICONS } from './constants';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ProductList from './components/ProductList';
import Visualize from './components/Visualize';
import ProductForm from './components/ProductForm';

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [customFieldConfigs, setCustomFieldConfigs] = useState<CustomField[]>([]);
  const [currentUser] = useState<User>({ id: 'U-01', name: 'Admin User', role: 'Admin' });
  const [searchQuery, setSearchQuery] = useState('');

  // Persist (simulated)
  useEffect(() => {
    const saved = localStorage.getItem('pip_products');
    if (saved) {
      try {
        setProducts(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load products", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('pip_products', JSON.stringify(products));
  }, [products]);

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

  const filteredProducts = useMemo(() => {
    if (!searchQuery) return products;
    const lower = searchQuery.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(lower) || 
      p.supplier.toLowerCase().includes(lower) ||
      p.id.toLowerCase().includes(lower) ||
      p.category.toLowerCase().includes(lower)
    );
  }, [products, searchQuery]);

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
          <div className="flex items-center gap-4 flex-1">
            <h1 className="text-xl font-bold text-slate-800 capitalize tracking-tight">
              {viewMode.replace('-', ' ')}
            </h1>
            <div className="relative max-w-md w-full ml-4 hidden md:block">
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

        <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {viewMode === 'dashboard' && (
            <Dashboard products={products} />
          )}
          {viewMode === 'inventory' && (
            <ProductList 
              products={filteredProducts} 
              onUpdate={updateProduct} 
              onDelete={deleteProduct}
              customFields={customFieldConfigs}
            />
          )}
          {viewMode === 'visualize' && (
            <Visualize products={products} />
          )}
          {viewMode === 'add-product' && (
            <ProductForm 
              onSubmit={addProduct} 
              onCancel={() => setViewMode('inventory')}
              currentUser={currentUser}
              customFields={customFieldConfigs}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
