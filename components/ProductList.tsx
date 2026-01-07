import React, { useState, useRef, useEffect } from 'react';
import { Product, CustomField, TreeNode, Supplier, MasterProduct, User } from '../types';
import { ICONS, CURRENCIES, UNITS } from '../constants';
import ProductDetailsModal from './ProductDetailsModal';
import ProductForm from './ProductForm';
import { Check, X, Download, Filter, FileText, ChevronDown, Copy, Trash2 } from 'lucide-react';

interface ProductListProps {
  products: Product[];
  onUpdate: (p: Product) => void;
  onDelete: (id: string) => void;
  onCreate?: (p: Product) => void;
  customFields: CustomField[];
  treeNodes: TreeNode[];
  suppliers?: Supplier[];
  masterProducts?: MasterProduct[];
  currentUser?: User;
  onAddFieldDefinition?: (field: CustomField) => void;
  onAddTreeNode?: (node: TreeNode) => void;
}

interface EditingCell {
  productId: string;
  field: string;
}

interface FilterState {
  sector: string;
  priceMin: string;
  priceMax: string;
  leadTimeMax: string;
}

const ProductList: React.FC<ProductListProps> = ({ 
  products, onUpdate, onDelete, onCreate, customFields, treeNodes,
  suppliers = [], masterProducts = [], currentUser, onAddFieldDefinition, onAddTreeNode 
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [sortField, setSortField] = useState<keyof Product>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showPIModal, setShowPIModal] = useState(false);
  const [piName, setPIName] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    sector: '',
    priceMin: '',
    priceMax: '',
    leadTimeMax: ''
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurRef = useRef(false);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const handleSort = (field: keyof Product) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getProductPathString = (nodeId: string) => {
    const path: string[] = [];
    let current = treeNodes.find(n => n.id === nodeId);
    while (current) {
      path.unshift(current.name);
      current = treeNodes.find(n => n.id === current?.parentId);
    }
    return path.join(' > ');
  };

  const getProductSector = (nodeId: string) => {
    let current = treeNodes.find(n => n.id === nodeId);
    while (current) {
      if (!current.parentId) return current.name;
      current = treeNodes.find(n => n.id === current?.parentId);
    }
    return '';
  };

  const getProductCategory = (nodeId: string) => {
    const node = treeNodes.find(n => n.id === nodeId);
    return node?.name || 'Uncategorized';
  };

  const getHierarchyLevels = (nodeId: string) => {
    const path: string[] = [];
    let current = treeNodes.find(n => n.id === nodeId);
    while (current) {
      path.unshift(current.name);
      current = treeNodes.find(n => n.id === current?.parentId);
    }
    return {
      sector: path[0] || '',
      category: path[1] || '',
      subCategory: path[2] || '',
      level4: path[3] || '',
      level5: path[4] || '',
      fullPath: path.join(' > ')
    };
  };

  const getAllTechSpecKeys = (productsToExport: Product[]) => {
    const keys = new Set<string>();
    productsToExport.forEach(p => {
      if (p.technicalSpecs) {
        p.technicalSpecs.forEach(spec => keys.add(spec.name));
      }
    });
    return Array.from(keys).sort();
  };

  const getAllCustomFieldKeys = (productsToExport: Product[]) => {
    const keys = new Set<string>();
    productsToExport.forEach(p => {
      if (p.customFields) {
        p.customFields.forEach(cf => {
          const fieldDef = customFields.find(f => f.id === cf.fieldId);
          if (fieldDef) keys.add(fieldDef.name);
        });
      }
    });
    return Array.from(keys).sort();
  };

  const startEditing = (product: Product, field: string, currentValue: string | number) => {
    setEditingCell({ productId: product.id, field });
    setEditValue(String(currentValue));
  };

  const cancelEditing = () => {
    skipBlurRef.current = true;
    setEditingCell(null);
    setEditValue('');
  };

  const saveEdit = (product: Product) => {
    if (!editingCell) return;
    
    const updatedProduct = { ...product };
    const field = editingCell.field;
    
    switch (field) {
      case 'name':
        updatedProduct.name = editValue;
        break;
      case 'supplier':
        updatedProduct.supplier = editValue;
        break;
      case 'price':
        updatedProduct.price = parseFloat(editValue) || 0;
        break;
      case 'moq':
        updatedProduct.moq = parseInt(editValue) || 1;
        break;
      case 'leadTime':
        updatedProduct.leadTime = parseInt(editValue) || 0;
        break;
      case 'manufacturer':
        updatedProduct.manufacturer = editValue;
        break;
    }
    
    updatedProduct.lastUpdated = new Date().toISOString();
    onUpdate(updatedProduct);
    setEditingCell(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, product: Product) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit(product);
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  const handleBlur = (product: Product) => {
    setTimeout(() => {
      if (!skipBlurRef.current && editingCell) {
        saveEdit(product);
      }
      skipBlurRef.current = false;
    }, 100);
  };

  const handleSaveClick = (e: React.MouseEvent, product: Product) => {
    e.preventDefault();
    e.stopPropagation();
    skipBlurRef.current = true;
    saveEdit(product);
  };

  const handleCancelClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cancelEditing();
  };

  const sectors = [...new Set(treeNodes.filter(n => !n.parentId).map(n => n.name))];

  const filteredProducts = products.filter(p => {
    if (filters.sector && getProductSector(p.nodeId) !== filters.sector) return false;
    if (filters.priceMin && p.price < parseFloat(filters.priceMin)) return false;
    if (filters.priceMax && p.price > parseFloat(filters.priceMax)) return false;
    if (filters.leadTimeMax && p.leadTime > parseInt(filters.leadTimeMax)) return false;
    return true;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    }
    return 0;
  });

  const isEditing = (productId: string, field: string) => 
    editingCell?.productId === productId && editingCell?.field === field;

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedProducts.map(p => p.id)));
    }
  };

  const exportToCSV = (productsToExport: Product[]) => {
    const techSpecKeys = getAllTechSpecKeys(productsToExport);
    const customFieldKeys = getAllCustomFieldKeys(productsToExport);
    
    const baseHeaders = [
      'ID', 'Name', 'Description', 'Supplier', 'Supplier ID',
      'Sector', 'Category', 'Sub-Category', 'Level 4', 'Level 5', 'Full Hierarchy Path',
      'Price', 'Currency', 'Unit', 'MOQ', 'Lead Time (days)',
      'Manufacturer', 'Manufacturing Location', 'Image URL',
      'HS Code', 'Packaging Type', 'Shelf Life', 'Storage Conditions',
      'Date Added', 'Last Updated', 'Created By'
    ];
    
    const techSpecHeaders = techSpecKeys.map(k => `Spec: ${k}`);
    const customFieldHeaders = customFieldKeys.map(k => `Custom: ${k}`);
    const headers = [...baseHeaders, ...techSpecHeaders, ...customFieldHeaders];
    
    const escapeCSV = (val: string | number | undefined | null) => {
      if (val === undefined || val === null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    const rows = productsToExport.map(p => {
      const hierarchy = getHierarchyLevels(p.nodeId);
      
      const baseData = [
        p.id,
        escapeCSV(p.name),
        escapeCSV(p.description),
        escapeCSV(p.supplier),
        escapeCSV(p.supplierId),
        escapeCSV(hierarchy.sector),
        escapeCSV(hierarchy.category),
        escapeCSV(hierarchy.subCategory),
        escapeCSV(hierarchy.level4),
        escapeCSV(hierarchy.level5),
        escapeCSV(hierarchy.fullPath),
        p.price,
        p.currency,
        p.unit,
        p.moq,
        p.leadTime,
        escapeCSV(p.manufacturer),
        escapeCSV(p.manufacturingLocation),
        escapeCSV(p.imageUrl),
        escapeCSV(p.hsCode),
        escapeCSV(p.packagingType),
        escapeCSV(p.shelfLife),
        escapeCSV(p.storageConditions),
        escapeCSV(p.dateAdded),
        escapeCSV(p.lastUpdated),
        escapeCSV(p.createdBy)
      ];
      
      const techSpecData = techSpecKeys.map(key => {
        const spec = p.technicalSpecs?.find(s => s.name === key);
        return spec ? escapeCSV(`${spec.value}${spec.unit ? ' ' + spec.unit : ''}`) : '';
      });
      
      const customFieldData = customFieldKeys.map(key => {
        const fieldDef = customFields.find(f => f.name === key);
        if (!fieldDef) return '';
        const cf = p.customFields?.find(f => f.fieldId === fieldDef.id);
        return cf ? escapeCSV(cf.value) : '';
      });
      
      return [...baseData, ...techSpecData, ...customFieldData];
    });
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const exportToJSON = (productsToExport: Product[]) => {
    const enrichedProducts = productsToExport.map(p => {
      const hierarchy = getHierarchyLevels(p.nodeId);
      
      const techSpecsObject: Record<string, string> = {};
      if (p.technicalSpecs) {
        p.technicalSpecs.forEach(spec => {
          techSpecsObject[spec.name] = `${spec.value}${spec.unit ? ' ' + spec.unit : ''}`;
        });
      }
      
      const customFieldsObject: Record<string, string> = {};
      if (p.customFields) {
        p.customFields.forEach(cf => {
          const fieldDef = customFields.find(f => f.id === cf.fieldId);
          if (fieldDef) customFieldsObject[fieldDef.name] = cf.value;
        });
      }
      
      return {
        id: p.id,
        name: p.name,
        description: p.description || '',
        supplier: p.supplier,
        supplierId: p.supplierId || '',
        hierarchy: {
          sector: hierarchy.sector,
          category: hierarchy.category,
          subCategory: hierarchy.subCategory,
          level4: hierarchy.level4,
          level5: hierarchy.level5,
          fullPath: hierarchy.fullPath
        },
        pricing: {
          price: p.price,
          currency: p.currency,
          unit: p.unit,
          moq: p.moq
        },
        leadTimeDays: p.leadTime,
        manufacturer: p.manufacturer || '',
        manufacturingLocation: p.manufacturingLocation || '',
        imageUrl: p.imageUrl || '',
        hsCode: p.hsCode || '',
        packagingType: p.packagingType || '',
        shelfLife: p.shelfLife || '',
        storageConditions: p.storageConditions || '',
        technicalSpecifications: techSpecsObject,
        customFields: customFieldsObject,
        dateAdded: p.dateAdded,
        lastUpdated: p.lastUpdated,
        createdBy: p.createdBy || ''
      };
    });
    
    const json = JSON.stringify(enrichedProducts, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const createPI = () => {
    if (!piName.trim() || selectedIds.size === 0) return;
    
    const selectedProducts = products.filter(p => selectedIds.has(p.id));
    const piData = {
      name: piName,
      createdAt: new Date().toISOString(),
      products: selectedProducts.map(p => ({
        id: p.id,
        name: p.name,
        supplier: p.supplier,
        price: p.price,
        currency: p.currency,
        sector: getProductSector(p.nodeId),
        category: getProductCategory(p.nodeId),
        hierarchyPath: getProductPathString(p.nodeId),
        technicalSpecs: p.technicalSpecs || []
      })),
      summary: {
        totalProducts: selectedProducts.length,
        avgPrice: selectedProducts.reduce((sum, p) => sum + p.price, 0) / selectedProducts.length,
        sectors: [...new Set(selectedProducts.map(p => getProductSector(p.nodeId)))],
        suppliers: [...new Set(selectedProducts.map(p => p.supplier))]
      }
    };
    
    const json = JSON.stringify(piData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PI_${piName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    setShowPIModal(false);
    setPIName('');
    setSelectedIds(new Set());
  };

  const clearFilters = () => {
    setFilters({ sector: '', priceMin: '', priceMax: '', leadTimeMax: '' });
  };

  const hasActiveFilters = filters.sector || filters.priceMin || filters.priceMax || filters.leadTimeMax;

  const duplicateProduct = (product: Product) => {
    if (!onCreate) return;
    const newId = `PRD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const duplicatedProduct: Product = {
      ...product,
      id: newId,
      name: `${product.name} (Copy)`,
      lastUpdated: new Date().toISOString(),
      history: [{
        id: `hist-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: 'system',
        userName: 'System',
        changes: { source: { old: '', new: `Duplicated from ${product.id}` } },
        snapshot: {}
      }]
    };
    onCreate(duplicatedProduct);
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} product(s)?`)) return;
    selectedIds.forEach(id => onDelete(id));
    setSelectedIds(new Set());
  };

  const renderEditableCell = (product: Product, field: string, displayValue: React.ReactNode, rawValue: string | number, className?: string) => {
    if (isEditing(product.id, field)) {
      return (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <input
            ref={inputRef}
            type={typeof rawValue === 'number' ? 'number' : 'text'}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => handleKeyDown(e, product)}
            onBlur={() => handleBlur(product)}
            className="w-full px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button 
            onMouseDown={(e) => handleSaveClick(e, product)}
            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
          >
            <Check size={14} />
          </button>
          <button 
            onMouseDown={(e) => handleCancelClick(e)}
            className="p-1 text-red-600 hover:bg-red-50 rounded"
          >
            <X size={14} />
          </button>
        </div>
      );
    }
    
    return (
      <div 
        className={`cursor-text hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 rounded px-1 py-0.5 transition-all ${className || ''}`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEditing(product, field, rawValue);
        }}
        title="Double-click to edit"
      >
        {displayValue}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <button 
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm font-medium transition-all ${
                hasActiveFilters 
                  ? 'bg-blue-50 border-blue-300 text-blue-700' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Filter size={16} /> Filter
              {hasActiveFilters && (
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              )}
              <ChevronDown size={14} />
            </button>
            
            {showFilterPanel && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg p-4 z-20 w-72">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Sector</label>
                    <select 
                      value={filters.sector}
                      onChange={e => setFilters({...filters, sector: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="">All Sectors</option>
                      {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Min Price</label>
                      <input 
                        type="number"
                        value={filters.priceMin}
                        onChange={e => setFilters({...filters, priceMin: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max Price</label>
                      <input 
                        type="number"
                        value={filters.priceMax}
                        onChange={e => setFilters({...filters, priceMax: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        placeholder="∞"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max Lead Time (days)</label>
                    <input 
                      type="number"
                      value={filters.leadTimeMax}
                      onChange={e => setFilters({...filters, leadTimeMax: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      placeholder="∞"
                    />
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                    <button 
                      onClick={clearFilters}
                      className="flex-1 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
                    >
                      Clear
                    </button>
                    <button 
                      onClick={() => setShowFilterPanel(false)}
                      className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all"
            >
              <Download size={16} /> Export
              <ChevronDown size={14} />
            </button>
            
            {showExportMenu && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg py-2 z-20 w-48">
                <button 
                  onClick={() => exportToCSV(sortedProducts)}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  Export All as CSV
                </button>
                <button 
                  onClick={() => exportToJSON(sortedProducts)}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  Export All as JSON
                </button>
                {selectedIds.size > 0 && (
                  <>
                    <div className="border-t border-slate-100 my-1"></div>
                    <button 
                      onClick={() => exportToCSV(products.filter(p => selectedIds.has(p.id)))}
                      className="w-full px-4 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
                    >
                      Export Selected ({selectedIds.size}) as CSV
                    </button>
                    <button 
                      onClick={() => exportToJSON(products.filter(p => selectedIds.has(p.id)))}
                      className="w-full px-4 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
                    >
                      Export Selected ({selectedIds.size}) as JSON
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {selectedIds.size > 0 && (
            <>
              <button 
                onClick={() => setShowPIModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-all"
              >
                <FileText size={16} /> Create PI ({selectedIds.size})
              </button>
              <button 
                onClick={deleteSelected}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-all"
              >
                <Trash2 size={16} /> Delete ({selectedIds.size})
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">Double-click cells to edit</span>
          <p className="text-sm text-slate-500 font-medium">
            {filteredProducts.length !== products.length 
              ? `${filteredProducts.length} of ${products.length} Products`
              : `${products.length} Products`
            }
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-4 w-10">
                  <input 
                    type="checkbox"
                    checked={selectedIds.size === sortedProducts.length && sortedProducts.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer" onClick={() => handleSort('id')}>
                  ID {sortField === 'id' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer" onClick={() => handleSort('name')}>
                  Product {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Hierarchy Path
                </th>
                <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer" onClick={() => handleSort('price')}>
                  Pricing {sortField === 'price' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer" onClick={() => handleSort('leadTime')}>
                  Lead Time {sortField === 'leadTime' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedProducts.map((p) => (
                <tr 
                  key={p.id} 
                  className={`group hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.has(p.id) ? 'bg-blue-50/50' : ''}`}
                  onClick={() => !editingCell && setSelectedProduct(p)}
                >
                  <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                    <input 
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelection(p.id)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-4 text-xs font-mono font-bold text-blue-600">{p.id}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <img src={p.imageUrl} alt={p.name} className="w-10 h-10 rounded-lg object-cover bg-slate-100 border border-slate-200 flex-shrink-0" />
                      <div className="min-w-0">
                        {renderEditableCell(
                          p, 
                          'name', 
                          <span className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors block truncate">{p.name}</span>,
                          p.name
                        )}
                        {renderEditableCell(
                          p,
                          'supplier',
                          <span className="text-[10px] text-slate-500 truncate block">{p.supplier}</span>,
                          p.supplier
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-[10px] font-medium text-slate-400 block max-w-[200px] truncate" title={getProductPathString(p.nodeId)}>
                      {getProductPathString(p.nodeId) || 'Uncategorized'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      {renderEditableCell(
                        p,
                        'price',
                        <div className="text-sm font-bold text-slate-900">{p.currency} {p.price.toLocaleString()}</div>,
                        p.price
                      )}
                      {renderEditableCell(
                        p,
                        'moq',
                        <div className="text-[10px] text-slate-400">Min. {p.moq} {p.unit}</div>,
                        p.moq
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {renderEditableCell(
                      p,
                      'leadTime',
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${p.leadTime > 30 ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                        <span className="text-xs text-slate-600">{p.leadTime}d</span>
                      </div>,
                      p.leadTime
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <button 
                        onClick={() => currentUser ? setEditingProduct(p) : startEditing(p, 'name', p.name)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Edit product"
                      >
                        {ICONS.Edit}
                      </button>
                      {onCreate && (
                        <button 
                          onClick={() => duplicateProduct(p)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                          title="Duplicate product"
                        >
                          <Copy size={16} />
                        </button>
                      )}
                      <button 
                        onClick={() => setSelectedProduct(p)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                        title="View details"
                      >
                        {ICONS.Details}
                      </button>
                      <button 
                        onClick={() => onDelete(p.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete product"
                      >
                        {ICONS.Trash}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center">
                        {ICONS.Inventory}
                      </div>
                      <p className="text-sm font-medium">
                        {hasActiveFilters 
                          ? 'No products match the current filters.' 
                          : 'No products found for this category or search.'
                        }
                      </p>
                      {hasActiveFilters && (
                        <button 
                          onClick={clearFilters}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showPIModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[480px] max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">Create Product Intelligence Report</h3>
              <button onClick={() => setShowPIModal(false)} className="p-1 hover:bg-slate-100 rounded">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Report Name</label>
                <input
                  type="text"
                  value={piName}
                  onChange={(e) => setPIName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Q1 2025 Materials Analysis"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Selected Products ({selectedIds.size})</label>
                <div className="max-h-48 overflow-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {products.filter(p => selectedIds.has(p.id)).map(p => (
                    <div key={p.id} className="px-3 py-2 text-sm flex items-center gap-2">
                      <img src={p.imageUrl} alt={p.name} className="w-8 h-8 rounded object-cover" />
                      <div>
                        <p className="font-medium text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-500">{p.supplier} • {p.currency} {p.price}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-slate-50 rounded-lg p-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Report Preview</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500">Products:</span>
                    <span className="ml-2 font-medium">{selectedIds.size}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Avg Price:</span>
                    <span className="ml-2 font-medium">
                      {products.filter(p => selectedIds.has(p.id)).length > 0 
                        ? (products.filter(p => selectedIds.has(p.id)).reduce((sum, p) => sum + p.price, 0) / selectedIds.size).toFixed(2)
                        : 0
                      }
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500">Suppliers:</span>
                    <span className="ml-2 font-medium">
                      {[...new Set(products.filter(p => selectedIds.has(p.id)).map(p => p.supplier))].join(', ')}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowPIModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={createPI}
                  disabled={!piName.trim()}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create & Download PI
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedProduct && (
        <ProductDetailsModal 
          product={selectedProduct} 
          onClose={() => setSelectedProduct(null)} 
          onUpdate={onUpdate}
          treeNodes={treeNodes}
        />
      )}

      {editingProduct && currentUser && onAddFieldDefinition && onAddTreeNode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <ProductForm
              initialProduct={editingProduct}
              mode="edit"
              onSubmit={(updatedProduct) => {
                onUpdate(updatedProduct);
                setEditingProduct(null);
              }}
              onCancel={() => setEditingProduct(null)}
              currentUser={currentUser}
              customFields={customFields}
              treeNodes={treeNodes}
              suppliers={suppliers}
              masterProducts={masterProducts}
              onAddFieldDefinition={onAddFieldDefinition}
              onAddTreeNode={onAddTreeNode}
            />
          </div>
        </div>
      )}

      {(showFilterPanel || showExportMenu) && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => {
            setShowFilterPanel(false);
            setShowExportMenu(false);
          }}
        />
      )}
    </div>
  );
};

export default ProductList;
