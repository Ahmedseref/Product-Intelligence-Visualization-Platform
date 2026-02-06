import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Product, ViewMode, User, CustomField, TreeNode, Supplier, SupplierProduct } from './types';
import { INITIAL_PRODUCTS, INITIAL_TREE_NODES } from './mockData';
import { ICONS } from './constants';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ProductList from './components/ProductList';
import Visualize from './components/Visualize';
import ProductForm from './components/ProductForm';
import ProductTree from './components/ProductTree';
import TaxonomyBuilder from './components/TaxonomyBuilder';
import SupplierManager from './components/SupplierManager';
import MassImportWizard from './components/MassImportWizard';
import FloatingNotesWidget from './components/FloatingNotesWidget';
import Settings from './components/Settings';
import Login from './components/Login';
import ChangePassword from './components/ChangePassword';
import SystemBuilder from './components/systemBuilder/SystemBuilder';
import { api, authApi, setAuthToken, initAuthToken, AuthUser } from './client/api';
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const App: React.FC = () => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>(INITIAL_TREE_NODES);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [customFieldConfigs, setCustomFieldConfigs] = useState<CustomField[]>([]);
  const [currentUser, setCurrentUser] = useState<User>({ id: 'U-01', name: 'Admin User', role: 'Admin' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [addProductMode, setAddProductMode] = useState<'single' | 'mass'>('single');
  const [usageAreas, setUsageAreas] = useState<string[]>([]);
  const [colorsList, setColorsList] = useState<any[]>([]);
  const [taxonomyPanelWidth, setTaxonomyPanelWidth] = useState(288);
  const [showTaxonomyPanel, setShowTaxonomyPanel] = useState(true);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const panelResizeRef = React.useRef<HTMLDivElement>(null);
  const resizeStartRef = React.useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    initAuthToken();
    authApi.getCurrentUser().then(user => {
      if (user) {
        setAuthUser(user);
        setCurrentUser({ id: user.id, name: user.username, role: user.role });
        if (user.isFirstLogin) {
          setShowChangePassword(true);
        }
      }
      setIsAuthLoading(false);
    });
  }, []);

  const handleLogin = async (username: string, password: string) => {
    setAuthError(null);
    setIsAuthLoading(true);
    try {
      const response = await authApi.login(username, password);
      setAuthToken(response.token);
      setAuthUser(response.user);
      setCurrentUser({ id: response.user.id, name: response.user.username, role: response.user.role });
      if (response.user.isFirstLogin) {
        setShowChangePassword(true);
      }
      try {
        const colorsData = await api.getColors();
        setColorsList(colorsData);
      } catch {}
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await authApi.logout();
    setAuthUser(null);
    setShowChangePassword(false);
    setViewMode('dashboard');
  };

  const handleChangePassword = async (oldPassword: string, newPassword: string) => {
    setAuthError(null);
    setIsAuthLoading(true);
    try {
      await authApi.changePassword(oldPassword, newPassword);
      setShowChangePassword(false);
      if (authUser) {
        setAuthUser({ ...authUser, isFirstLogin: false });
      }
    } catch (err: any) {
      setAuthError(err.message || 'Failed to change password');
    } finally {
      setIsAuthLoading(false);
    }
  };

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
      
      const [nodesData, productsData, fieldsData, suppliersData, supplierProductsData] = await Promise.all([
        api.getTreeNodes(),
        api.getProducts(),
        api.getCustomFields(),
        api.getSuppliers(),
        api.getSupplierProducts(),
      ]);

      setTreeNodes(nodesData.map(n => ({
        id: n.nodeId,
        name: n.name,
        type: n.type as any,
        parentId: n.parentId,
        description: n.description || undefined,
        metadata: n.metadata as any,
        branchCode: n.branchCode || undefined,
      })));

      setProducts(productsData.map(p => ({
        id: p.productId,
        name: p.name,
        supplier: p.supplier || '',
        supplierId: p.supplierId || undefined,
        nodeId: p.nodeId,
        stockCode: p.stockCode || undefined,
        colorId: p.colorId || undefined,
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
        technicalSpecs: (p.technicalSpecs as any[]) || [],
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

      setSuppliers(suppliersData.map(s => ({
        id: s.supplierId,
        name: s.name,
        country: s.country || undefined,
        contactName: s.contactName || undefined,
        contactEmail: s.contactEmail || undefined,
        contactPhone: s.contactPhone || undefined,
        address: s.address || undefined,
        website: s.website || undefined,
        notes: s.notes || undefined,
        isActive: s.isActive ?? true,
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: s.updatedAt || new Date().toISOString(),
      })));

      setSupplierProducts(supplierProductsData.map(sp => ({
        id: sp.supplierProductId,
        supplierId: sp.supplierId,
        formFactor: sp.formFactor || undefined,
        sku: sp.sku || undefined,
        price: sp.price || 0,
        currency: sp.currency || 'USD',
        unit: sp.unit || undefined,
        moq: sp.moq || 1,
        leadTime: sp.leadTime || 0,
        packagingType: sp.packagingType || undefined,
        hsCode: sp.hsCode || undefined,
        certifications: (sp.certifications as string[]) || [],
        technicalSpecs: (sp.technicalSpecs as any[]) || [],
        images: (sp.images as string[]) || [],
        isActive: sp.isActive ?? true,
        createdBy: sp.createdBy || undefined,
        createdAt: sp.createdAt || new Date().toISOString(),
        updatedAt: sp.updatedAt || new Date().toISOString(),
        history: (sp.history as any[]) || [],
      })));

      try {
        const areasData = await api.getUsageAreas();
        setUsageAreas(areasData);
      } catch (e) {
        console.log('Failed to fetch usage areas, using defaults');
        setUsageAreas(['Commercial', 'Food & Beverage', 'Healthcare', 'Industrial', 'Infrastructure', 'Parking', 'Residential', 'Sports']);
      }

      try {
        const colorsData = await api.getColors();
        setColorsList(colorsData);
      } catch (e) {
        console.log('Failed to fetch colors');
      }

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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingPanel || !resizeStartRef.current) return;
      const deltaX = e.clientX - resizeStartRef.current.startX;
      const newWidth = Math.max(150, Math.min(500, resizeStartRef.current.startWidth + deltaX));
      setTaxonomyPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingPanel(false);
      resizeStartRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizingPanel) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingPanel]);

  const startPanelResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartRef.current = { startX: e.clientX, startWidth: taxonomyPanelWidth };
    setIsResizingPanel(true);
  };

  const addProduct = async (newProduct: Product) => {
    try {
      const savedProduct = await api.createProduct({
        productId: newProduct.id,
        name: newProduct.name,
        supplier: newProduct.supplier,
        supplierId: newProduct.supplierId,
        nodeId: newProduct.nodeId,
        colorId: newProduct.colorId,
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
        technicalSpecs: newProduct.technicalSpecs,
        category: newProduct.category,
        sector: newProduct.sector,
        createdBy: newProduct.createdBy,
        history: newProduct.history,
      });
      const merged = { ...newProduct, ...savedProduct };
      setProducts(prev => [merged, ...prev]);
      setViewMode('inventory');
    } catch (err) {
      console.error('Failed to add product:', err);
      setProducts(prev => [newProduct, ...prev]);
      setViewMode('inventory');
    }
  };

  const massImportProducts = async (importedProducts: Product[]) => {
    try {
      for (const product of importedProducts) {
        await api.createProduct({
          productId: product.id,
          name: product.name,
          supplier: product.supplier,
          supplierId: product.supplierId,
          nodeId: product.nodeId,
          manufacturer: product.manufacturer,
          manufacturingLocation: product.manufacturingLocation,
          description: product.description,
          imageUrl: product.imageUrl || `https://picsum.photos/seed/${Math.random()}/400/300`,
          price: product.price,
          currency: product.currency,
          unit: product.unit,
          moq: product.moq,
          leadTime: product.leadTime,
          packagingType: product.packagingType,
          hsCode: product.hsCode,
          certifications: product.certifications || [],
          shelfLife: product.shelfLife,
          storageConditions: product.storageConditions,
          customFields: product.customFields || {},
          technicalSpecs: product.technicalSpecs || [],
          category: product.category,
          sector: product.sector,
          createdBy: currentUser.name,
          history: [],
        });
      }
      setProducts(prev => [...importedProducts, ...prev]);
      setViewMode('inventory');
      setAddProductMode('single');
    } catch (err) {
      console.error('Failed to import products:', err);
      setProducts(prev => [...importedProducts, ...prev]);
      setViewMode('inventory');
      setAddProductMode('single');
    }
  };

  const updateProduct = async (updatedProduct: Product) => {
    try {
      const savedProduct = await api.updateProduct(updatedProduct.id, {
        name: updatedProduct.name,
        supplier: updatedProduct.supplier,
        nodeId: updatedProduct.nodeId,
        colorId: updatedProduct.colorId,
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
        technicalSpecs: updatedProduct.technicalSpecs,
        category: updatedProduct.category,
        sector: updatedProduct.sector,
        history: updatedProduct.history,
      });
      const merged = { ...updatedProduct, ...savedProduct };
      setProducts(prev => prev.map(p => p.id === updatedProduct.id ? merged : p));
    } catch (err) {
      console.error('Failed to update product:', err);
      setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    }
  };

  const deleteProduct = async (id: string, skipConfirm = false) => {
    if (skipConfirm || window.confirm('Are you sure you want to delete this product?')) {
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

  const addSupplier = async (supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'> & { id: string }) => {
    const newSupplier: Supplier = {
      ...supplier,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await api.createSupplier({
        supplierId: newSupplier.id,
        name: newSupplier.name,
        country: newSupplier.country,
        contactName: newSupplier.contactName,
        contactEmail: newSupplier.contactEmail,
        contactPhone: newSupplier.contactPhone,
        address: newSupplier.address,
        website: newSupplier.website,
        notes: newSupplier.notes,
        isActive: newSupplier.isActive,
      });
      setSuppliers(prev => [...prev, newSupplier]);
    } catch (err) {
      console.error('Failed to add supplier:', err);
      setSuppliers(prev => [...prev, newSupplier]);
    }
  };

  const updateSupplier = async (id: string, updates: Partial<Supplier>) => {
    try {
      await api.updateSupplier(id, {
        name: updates.name,
        country: updates.country,
        contactName: updates.contactName,
        contactEmail: updates.contactEmail,
        contactPhone: updates.contactPhone,
        address: updates.address,
        website: updates.website,
        notes: updates.notes,
        isActive: updates.isActive,
      });
      setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s));
    } catch (err) {
      console.error('Failed to update supplier:', err);
      setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s));
    }
  };

  const deleteSupplier = async (id: string) => {
    try {
      await api.deleteSupplier(id);
      setSuppliers(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Failed to delete supplier:', err);
      setSuppliers(prev => prev.filter(s => s.id !== id));
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

  if (isAuthLoading && !authUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!authUser) {
    return <Login onLogin={handleLogin} error={authError} isLoading={isAuthLoading} />;
  }

  if (showChangePassword) {
    return (
      <ChangePassword 
        onChangePassword={handleChangePassword} 
        error={authError} 
        isLoading={isAuthLoading}
        isFirstLogin={authUser.isFirstLogin}
      />
    );
  }

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
              <button
                onClick={handleLogout}
                className="ml-2 p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {(viewMode === 'inventory' || viewMode === 'dashboard') && (
            <div className="relative flex flex-shrink-0">
              <aside 
                className={`border-r border-slate-200 bg-white flex-shrink-0 relative transition-all duration-300 ease-in-out overflow-hidden hidden ${showTaxonomyPanel ? 'xl:flex' : ''}`}
                style={{ width: showTaxonomyPanel ? taxonomyPanelWidth : 0, minWidth: showTaxonomyPanel ? taxonomyPanelWidth : 0 }}
              >
                <div className="p-4 h-full flex-1 overflow-auto" style={{ width: taxonomyPanelWidth }}>
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
                {showTaxonomyPanel && (
                  <div
                    ref={panelResizeRef}
                    onMouseDown={startPanelResize}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors group flex items-center justify-center"
                    style={{ marginRight: -3 }}
                  >
                    <div className="w-0.5 h-8 bg-slate-300 group-hover:bg-blue-400 rounded-full" />
                  </div>
                )}
              </aside>
              <button
                onClick={() => setShowTaxonomyPanel(!showTaxonomyPanel)}
                className="hidden xl:flex absolute top-3 z-20 w-6 h-6 bg-white border border-slate-200 rounded-full shadow-sm items-center justify-center text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-all"
                title={showTaxonomyPanel ? 'Hide taxonomy panel' : 'Show taxonomy panel'}
                style={{ right: showTaxonomyPanel ? -12 : -24 }}
              >
                {showTaxonomyPanel ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
              </button>
            </div>
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
                onCreate={addProduct}
                customFields={customFieldConfigs}
                treeNodes={treeNodes}
                suppliers={suppliers}
                currentUser={currentUser}
                onAddFieldDefinition={addCustomFieldDefinition}
                onAddTreeNode={addTreeNode}
                usageAreas={usageAreas}
                colors={colorsList}
              />
            )}
            {viewMode === 'visualize' && (
              <Visualize 
                products={filteredProducts}
                suppliers={suppliers}
                supplierProducts={supplierProducts}
                treeNodes={treeNodes}
                customFields={customFieldConfigs}
                currentUser={currentUser}
                usageAreas={usageAreas}
                onProductUpdate={updateProduct}
                onProductDelete={deleteProduct}
                onAddFieldDefinition={addCustomFieldDefinition}
                onAddTreeNode={addTreeNode}
              />
            )}
            {viewMode === 'add-product' && (
              <div className="space-y-6">
                <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-sm font-semibold text-slate-600">Import Mode:</span>
                  <div className="flex bg-slate-100 rounded-xl p-1">
                    <button
                      onClick={() => setAddProductMode('single')}
                      className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                        addProductMode === 'single' 
                          ? 'bg-white text-blue-600 shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Single Product
                    </button>
                    <button
                      onClick={() => setAddProductMode('mass')}
                      className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                        addProductMode === 'mass' 
                          ? 'bg-white text-blue-600 shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Mass Import
                    </button>
                  </div>
                </div>
                
                {addProductMode === 'single' ? (
                  <ProductForm 
                    onSubmit={addProduct} 
                    onCancel={() => setViewMode('inventory')}
                    currentUser={currentUser}
                    customFields={customFieldConfigs}
                    treeNodes={treeNodes}
                    suppliers={suppliers}
                    usageAreas={usageAreas}
                    colors={colorsList}
                    onAddFieldDefinition={addCustomFieldDefinition}
                    onAddTreeNode={addTreeNode}
                  />
                ) : (
                  <MassImportWizard
                    onImport={massImportProducts}
                    onCancel={() => { setViewMode('inventory'); setAddProductMode('single'); }}
                    treeNodes={treeNodes}
                    suppliers={suppliers}
                    usageAreas={usageAreas}
                  />
                )}
              </div>
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
            {viewMode === 'suppliers' && (
              <SupplierManager
                suppliers={suppliers}
                onAddSupplier={addSupplier}
                onUpdateSupplier={updateSupplier}
                onDeleteSupplier={deleteSupplier}
              />
            )}
            {viewMode === 'system-builder' && (
              <SystemBuilder products={products} />
            )}
            {viewMode === 'settings' && (
              <Settings
                usageAreas={usageAreas}
                colors={colorsList}
                onColorsChange={setColorsList}
                onDataRefreshNeeded={async () => {
                  try {
                    const [productsData, nodesData] = await Promise.all([
                      api.getProducts(),
                      api.getTreeNodes(),
                    ]);
                    setProducts(productsData.map(p => ({
                      id: p.productId,
                      name: p.name,
                      supplier: p.supplier || '',
                      supplierId: p.supplierId || undefined,
                      nodeId: p.nodeId,
                      stockCode: p.stockCode || undefined,
                      colorId: p.colorId || undefined,
                      manufacturer: p.manufacturer || '',
                      manufacturingLocation: p.manufacturingLocation || '',
                      description: p.description || '',
                      imageUrl: p.imageUrl || '',
                      price: p.price || 0,
                      currency: p.currency || 'USD',
                      unit: p.unit || '',
                      moq: p.moq || 0,
                      leadTime: p.leadTime || '',
                      packagingType: p.packagingType || '',
                      hsCode: p.hsCode || '',
                      certifications: (p.certifications as string[]) || [],
                      shelfLife: p.shelfLife || '',
                      storageConditions: p.storageConditions || '',
                      category: p.category || '',
                      sector: p.sector || '',
                      customFields: (p.customFields as any) || {},
                      technicalSpecs: (p.technicalSpecs as any[]) || [],
                      lastUpdated: p.lastUpdated ? new Date(p.lastUpdated).toISOString() : new Date().toISOString(),
                      createdBy: p.createdBy || '',
                      history: (p.history as any[]) || [],
                    })));
                    setTreeNodes(nodesData.map(n => ({
                      id: n.nodeId,
                      name: n.name,
                      type: n.type as any,
                      parentId: n.parentId,
                      description: n.description || undefined,
                      metadata: n.metadata as any,
                      branchCode: n.branchCode || undefined,
                    })));
                  } catch (e) {
                    console.error('Failed to refresh data:', e);
                  }
                }}
                onUpdateUsageAreas={async (areas: string[]) => {
                  try {
                    const updated = await api.updateUsageAreas(areas);
                    setUsageAreas(updated);
                  } catch (e) {
                    console.error('Failed to update usage areas:', e);
                  }
                }}
                onRenameUsageArea={async (oldName: string, newName: string) => {
                  try {
                    const productsToUpdate = products.filter(p => {
                      const usageValues = p.customFields?.['Usage Areas'] || [];
                      return Array.isArray(usageValues) && usageValues.includes(oldName);
                    });
                    for (const product of productsToUpdate) {
                      const usageValues = [...(product.customFields?.['Usage Areas'] || [])];
                      const idx = usageValues.indexOf(oldName);
                      if (idx !== -1) {
                        usageValues[idx] = newName;
                        const updated = {
                          ...product,
                          customFields: {
                            ...product.customFields,
                            'Usage Areas': usageValues
                          }
                        };
                        await updateProduct(updated);
                      }
                    }
                    console.log(`Migrated ${productsToUpdate.length} products from "${oldName}" to "${newName}"`);
                  } catch (e) {
                    console.error('Failed to migrate usage areas in products:', e);
                  }
                }}
              />
            )}
          </main>
        </div>
      </div>
      <FloatingNotesWidget />
    </div>
  );
};

export default App;
