import React, { useState, useRef, useEffect } from 'react';
import { Product, CustomField, TreeNode, Supplier, User } from '../types';
import { ICONS, CURRENCIES, UNITS } from '../constants';
import ProductDetailsModal from './ProductDetailsModal';
import ProductForm from './ProductForm';
import { Check, X, Download, Filter, FileText, ChevronDown, Copy, Trash2, Columns, Eye, EyeOff } from 'lucide-react';

interface ProductListProps {
  products: Product[];
  onUpdate: (p: Product) => void;
  onDelete: (id: string, skipConfirm?: boolean) => void;
  onCreate?: (p: Product) => void;
  customFields: CustomField[];
  treeNodes: TreeNode[];
  suppliers?: Supplier[];
  currentUser?: User;
  onAddFieldDefinition?: (field: CustomField) => void;
  onAddTreeNode?: (node: TreeNode) => void;
  usageAreas?: string[];
}

interface EditingCell {
  productId: string;
  field: string;
}

interface FilterState {
  sector: string;
  category: string;
  supplier: string;
  manufacturer: string;
  priceMin: string;
  priceMax: string;
  leadTimeMin: string;
  leadTimeMax: string;
  moqMin: string;
  moqMax: string;
}

type ColumnKey = 'id' | 'name' | 'supplier' | 'sector' | 'category' | 'subCategory' | 'price' | 'currency' | 'unit' | 'moq' | 'leadTime' | 'manufacturer' | 'location' | 'description' | 'usageAreas';

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  sortable: boolean;
  defaultVisible: boolean;
}

const ALL_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', sortable: true, defaultVisible: true },
  { key: 'name', label: 'Product Name', sortable: true, defaultVisible: true },
  { key: 'supplier', label: 'Supplier', sortable: true, defaultVisible: true },
  { key: 'sector', label: 'Sector', sortable: true, defaultVisible: true },
  { key: 'category', label: 'Category', sortable: true, defaultVisible: true },
  { key: 'subCategory', label: 'Sub-Category', sortable: true, defaultVisible: false },
  { key: 'price', label: 'Price', sortable: true, defaultVisible: true },
  { key: 'currency', label: 'Currency', sortable: true, defaultVisible: false },
  { key: 'unit', label: 'Unit', sortable: true, defaultVisible: false },
  { key: 'moq', label: 'MOQ', sortable: true, defaultVisible: true },
  { key: 'leadTime', label: 'Lead Time', sortable: true, defaultVisible: true },
  { key: 'manufacturer', label: 'Manufacturer', sortable: true, defaultVisible: false },
  { key: 'location', label: 'Location', sortable: true, defaultVisible: false },
  { key: 'description', label: 'Description', sortable: false, defaultVisible: false },
  { key: 'usageAreas', label: 'Usage Areas', sortable: false, defaultVisible: true },
];

const ProductList: React.FC<ProductListProps> = ({ 
  products, onUpdate, onDelete, onCreate, customFields, treeNodes,
  suppliers = [], currentUser, onAddFieldDefinition, onAddTreeNode, usageAreas = []
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [sortField, setSortField] = useState<ColumnKey>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [showPIModal, setShowPIModal] = useState(false);
  const [piName, setPIName] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key))
  );
  const [filters, setFilters] = useState<FilterState>({
    sector: '',
    category: '',
    supplier: '',
    manufacturer: '',
    priceMin: '',
    priceMax: '',
    leadTimeMin: '',
    leadTimeMax: '',
    moqMin: '',
    moqMax: ''
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurRef = useRef(false);
  
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>({
    id: 180,
    name: 300,
    supplier: 180,
    sector: 120,
    category: 120,
    subCategory: 120,
    price: 100,
    currency: 80,
    unit: 80,
    moq: 80,
    usageAreas: 200,
    leadTime: 100,
    manufacturer: 150,
    location: 150,
    description: 200
  });
  const [resizingColumn, setResizingColumn] = useState<ColumnKey | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current && typeof inputRef.current.select === 'function') {
        inputRef.current.select();
      }
    }
  }, [editingCell]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColumn) return;
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.max(60, resizeStartWidth.current + delta);
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (resizingColumn) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn]);

  const startColumnResize = (e: React.MouseEvent, columnKey: ColumnKey) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[columnKey];
    setResizingColumn(columnKey);
  };

  const autoFitColumn = (columnKey: ColumnKey) => {
    const col = ALL_COLUMNS.find(c => c.key === columnKey);
    const headerWidth = col ? (col.label.length * 9) + 50 : 100;
    
    const getContentWidth = (field: keyof Product, charWidth = 8) => {
      const maxContent = products.reduce((max, p) => {
        const val = p[field];
        const len = typeof val === 'string' ? val.length : String(val ?? '').length;
        return Math.max(max, len);
      }, 0);
      return (maxContent * charWidth) + 40;
    };

    const widthMap: Record<ColumnKey, number> = {
      id: Math.min(250, Math.max(headerWidth, getContentWidth('id', 7))),
      name: Math.min(400, Math.max(headerWidth, getContentWidth('name'))),
      supplier: Math.min(220, Math.max(headerWidth, getContentWidth('supplier'))),
      sector: Math.min(180, Math.max(headerWidth, getContentWidth('sector'))),
      category: Math.min(180, Math.max(headerWidth, getContentWidth('category'))),
      subCategory: Math.max(headerWidth, 100),
      price: Math.max(headerWidth, 85),
      currency: Math.max(headerWidth, 75),
      unit: Math.max(headerWidth, 70),
      moq: Math.max(headerWidth, 70),
      leadTime: Math.max(headerWidth, 95),
      manufacturer: Math.min(200, Math.max(headerWidth, getContentWidth('manufacturer'))),
      location: Math.min(200, Math.max(headerWidth, getContentWidth('manufacturingLocation'))),
      description: Math.min(280, Math.max(headerWidth, getContentWidth('description', 6))),
      usageAreas: Math.min(300, Math.max(headerWidth, 180))
    };
    
    setColumnWidths(prev => ({ ...prev, [columnKey]: widthMap[columnKey] }));
  };

  const handleSort = (field: ColumnKey) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const toggleColumn = (key: ColumnKey) => {
    const newSet = new Set(visibleColumns);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setVisibleColumns(newSet);
  };

  const showAllColumns = () => {
    setVisibleColumns(new Set(ALL_COLUMNS.map(c => c.key)));
  };

  const resetColumns = () => {
    setVisibleColumns(new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key)));
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
    if (field === 'supplier') {
      setEditValue(product.supplierId || '');
    } else {
      setEditValue(String(currentValue));
    }
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
    let oldValue: any = null;
    let newValue: any = null;
    
    switch (field) {
      case 'name':
        oldValue = product.name;
        newValue = editValue;
        updatedProduct.name = editValue;
        break;
      case 'supplier':
        const selectedSupplier = suppliers.find(s => s.id === editValue);
        if (selectedSupplier) {
          oldValue = product.supplier;
          newValue = selectedSupplier.name;
          updatedProduct.supplier = selectedSupplier.name;
          updatedProduct.supplierId = selectedSupplier.id;
        }
        break;
      case 'price':
        oldValue = product.price;
        newValue = parseFloat(editValue) || 0;
        updatedProduct.price = newValue;
        break;
      case 'moq':
        oldValue = product.moq;
        newValue = parseInt(editValue) || 1;
        updatedProduct.moq = newValue;
        break;
      case 'leadTime':
        oldValue = product.leadTime;
        newValue = parseInt(editValue) || 0;
        updatedProduct.leadTime = newValue;
        break;
      case 'manufacturer':
        oldValue = product.manufacturer;
        newValue = editValue;
        updatedProduct.manufacturer = editValue;
        break;
    }
    
    if (oldValue !== newValue && oldValue !== null) {
      const historyEntry = {
        id: `HIST-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser?.id || 'U-01',
        userName: currentUser?.name || 'Admin User',
        changes: {
          [field]: { old: oldValue, new: newValue }
        },
        snapshot: {}
      };
      updatedProduct.history = [historyEntry, ...(updatedProduct.history || [])];
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
  const categories = [...new Set(products.map(p => getHierarchyLevels(p.nodeId).category).filter(Boolean))];
  const uniqueSuppliers = [...new Set(products.map(p => p.supplier).filter(Boolean))];
  const manufacturers = [...new Set(products.map(p => p.manufacturer).filter(Boolean))];

  const filteredProducts = products.filter(p => {
    const hierarchy = getHierarchyLevels(p.nodeId);
    if (filters.sector && hierarchy.sector !== filters.sector) return false;
    if (filters.category && hierarchy.category !== filters.category) return false;
    if (filters.supplier && p.supplier !== filters.supplier) return false;
    if (filters.manufacturer && p.manufacturer !== filters.manufacturer) return false;
    if (filters.priceMin && p.price < parseFloat(filters.priceMin)) return false;
    if (filters.priceMax && p.price > parseFloat(filters.priceMax)) return false;
    if (filters.leadTimeMin && p.leadTime < parseInt(filters.leadTimeMin)) return false;
    if (filters.leadTimeMax && p.leadTime > parseInt(filters.leadTimeMax)) return false;
    if (filters.moqMin && p.moq < parseInt(filters.moqMin)) return false;
    if (filters.moqMax && p.moq > parseInt(filters.moqMax)) return false;
    return true;
  });

  const getSortValue = (p: Product, field: ColumnKey): string | number => {
    const hierarchy = getHierarchyLevels(p.nodeId);
    switch (field) {
      case 'id': return p.id;
      case 'name': return p.name || '';
      case 'supplier': return p.supplier;
      case 'sector': return hierarchy.sector;
      case 'category': return hierarchy.category;
      case 'subCategory': return hierarchy.subCategory;
      case 'price': return p.price;
      case 'currency': return p.currency;
      case 'unit': return p.unit;
      case 'moq': return p.moq;
      case 'leadTime': return p.leadTime;
      case 'manufacturer': return p.manufacturer || '';
      case 'location': return p.manufacturingLocation || '';
      case 'description': return p.description || '';
      case 'usageAreas': {
        const areas = p.customFields?.['Usage Areas'] || [];
        return Array.isArray(areas) ? areas.join(', ') : '';
      }
      default: return '';
    }
  };

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const valA = getSortValue(a, sortField);
    const valB = getSortValue(b, sortField);
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
    setFilters({ 
      sector: '', 
      category: '',
      supplier: '',
      manufacturer: '',
      priceMin: '', 
      priceMax: '', 
      leadTimeMin: '',
      leadTimeMax: '',
      moqMin: '',
      moqMax: ''
    });
  };

  const hasActiveFilters = filters.sector || filters.category || filters.supplier || filters.manufacturer || 
    filters.priceMin || filters.priceMax || filters.leadTimeMin || filters.leadTimeMax || 
    filters.moqMin || filters.moqMax;

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
    selectedIds.forEach(id => onDelete(id, true));
    setSelectedIds(new Set());
  };

  const renderEditableCell = (product: Product, field: string, displayValue: React.ReactNode, rawValue: string | number, className?: string) => {
    if (isEditing(product.id, field)) {
      if (field === 'supplier') {
        return (
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => handleKeyDown(e, product)}
              onBlur={() => handleBlur(product)}
              className="w-full px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Supplier</option>
              {suppliers.filter(s => s.isActive).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
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
        onClick={(e) => {
          e.stopPropagation();
          if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current);
            clickTimeoutRef.current = null;
          }
          startEditing(product, field, rawValue);
        }}
        title="Click to edit"
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
              <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg p-4 z-20 w-80 max-h-[70vh] overflow-y-auto">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Sector</label>
                      <select 
                        value={filters.sector}
                        onChange={e => setFilters({...filters, sector: e.target.value})}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                      >
                        <option value="">All</option>
                        {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                      <select 
                        value={filters.category}
                        onChange={e => setFilters({...filters, category: e.target.value})}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                      >
                        <option value="">All</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Supplier</label>
                      <select 
                        value={filters.supplier}
                        onChange={e => setFilters({...filters, supplier: e.target.value})}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                      >
                        <option value="">All</option>
                        {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Manufacturer</label>
                      <select 
                        value={filters.manufacturer}
                        onChange={e => setFilters({...filters, manufacturer: e.target.value})}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                      >
                        <option value="">All</option>
                        {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Price Min</label>
                      <input 
                        type="number"
                        value={filters.priceMin}
                        onChange={e => setFilters({...filters, priceMin: e.target.value})}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Price Max</label>
                      <input 
                        type="number"
                        value={filters.priceMax}
                        onChange={e => setFilters({...filters, priceMax: e.target.value})}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                        placeholder="∞"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lead Time Min</label>
                      <input 
                        type="number"
                        value={filters.leadTimeMin}
                        onChange={e => setFilters({...filters, leadTimeMin: e.target.value})}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lead Time Max</label>
                      <input 
                        type="number"
                        value={filters.leadTimeMax}
                        onChange={e => setFilters({...filters, leadTimeMax: e.target.value})}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                        placeholder="∞"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">MOQ Min</label>
                      <input 
                        type="number"
                        value={filters.moqMin}
                        onChange={e => setFilters({...filters, moqMin: e.target.value})}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">MOQ Max</label>
                      <input 
                        type="number"
                        value={filters.moqMax}
                        onChange={e => setFilters({...filters, moqMax: e.target.value})}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                        placeholder="∞"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                    <button 
                      onClick={clearFilters}
                      className="flex-1 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
                    >
                      Clear All
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
              onClick={() => setShowColumnsMenu(!showColumnsMenu)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all"
            >
              <Columns size={16} /> Columns
              <ChevronDown size={14} />
            </button>
            
            {showColumnsMenu && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg py-2 z-20 w-56 max-h-80 overflow-y-auto">
                <div className="px-3 py-2 border-b border-slate-100 flex gap-2">
                  <button 
                    onClick={showAllColumns}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Show All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button 
                    onClick={resetColumns}
                    className="text-xs text-slate-500 hover:underline"
                  >
                    Reset
                  </button>
                </div>
                {ALL_COLUMNS.map(col => (
                  <label 
                    key={col.key}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                  >
                    <input 
                      type="checkbox"
                      checked={visibleColumns.has(col.key)}
                      onChange={() => toggleColumn(col.key)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">{col.label}</span>
                    {visibleColumns.has(col.key) ? (
                      <Eye size={14} className="ml-auto text-blue-500" />
                    ) : (
                      <EyeOff size={14} className="ml-auto text-slate-300" />
                    )}
                  </label>
                ))}
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
          <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed', minWidth: '1400px' }}>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-3 w-10 sticky left-0 bg-slate-50 z-10">
                  <input 
                    type="checkbox"
                    checked={selectedIds.size === sortedProducts.length && sortedProducts.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                {ALL_COLUMNS.filter(col => visibleColumns.has(col.key)).map(col => (
                  <th 
                    key={col.key}
                    className={`px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap relative ${col.sortable ? 'cursor-pointer hover:bg-slate-100' : ''}`}
                    style={{ width: columnWidths[col.key], minWidth: columnWidths[col.key], maxWidth: columnWidths[col.key] }}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center justify-between">
                      <span>{col.label} {col.sortable && sortField === col.key && (sortOrder === 'asc' ? '↑' : '↓')}</span>
                    </div>
                    <div
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors"
                      onMouseDown={(e) => startColumnResize(e, col.key)}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => { e.stopPropagation(); autoFitColumn(col.key); }}
                      title="Drag to resize, double-click to auto-fit"
                    />
                  </th>
                ))}
                <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right sticky right-0 bg-slate-50 z-10">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedProducts.map((p) => {
                const hierarchy = getHierarchyLevels(p.nodeId);
                return (
                  <tr 
                    key={p.id} 
                    className={`group hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.has(p.id) ? 'bg-blue-50/50' : ''}`}
                    onClick={() => {
                      if (editingCell) return;
                      if (clickTimeoutRef.current) {
                        clearTimeout(clickTimeoutRef.current);
                      }
                      clickTimeoutRef.current = setTimeout(() => {
                        setSelectedProduct(p);
                      }, 250);
                    }}
                  >
                    <td className="px-3 py-3 sticky left-0 bg-white group-hover:bg-blue-50/30 z-10" onClick={e => e.stopPropagation()}>
                      <input 
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelection(p.id)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    {visibleColumns.has('id') && (
                      <td className="px-3 py-3 text-xs font-mono font-bold text-blue-600 overflow-hidden text-ellipsis" style={{ width: columnWidths.id, minWidth: columnWidths.id, maxWidth: columnWidths.id }}>{p.id}</td>
                    )}
                    {visibleColumns.has('name') && (
                      <td className="px-3 py-3 overflow-hidden text-ellipsis" style={{ width: columnWidths.name, minWidth: columnWidths.name, maxWidth: columnWidths.name }}>
                        {renderEditableCell(
                          p, 
                          'name', 
                          <span className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors truncate block">
                            {p.name || '-'}
                          </span>,
                          p.name || ''
                        )}
                      </td>
                    )}
                    {visibleColumns.has('supplier') && (
                      <td className="px-3 py-3 overflow-hidden text-ellipsis" style={{ width: columnWidths.supplier, minWidth: columnWidths.supplier, maxWidth: columnWidths.supplier }}>
                        {renderEditableCell(
                          p,
                          'supplier',
                          <span className="text-sm text-slate-600 truncate block">{p.supplier}</span>,
                          p.supplier
                        )}
                      </td>
                    )}
                    {visibleColumns.has('sector') && (
                      <td className="px-3 py-3 text-sm text-slate-600 overflow-hidden text-ellipsis" style={{ width: columnWidths.sector, minWidth: columnWidths.sector, maxWidth: columnWidths.sector }}>{hierarchy.sector || '-'}</td>
                    )}
                    {visibleColumns.has('category') && (
                      <td className="px-3 py-3 text-sm text-slate-600 overflow-hidden text-ellipsis" style={{ width: columnWidths.category, minWidth: columnWidths.category, maxWidth: columnWidths.category }}>{hierarchy.category || '-'}</td>
                    )}
                    {visibleColumns.has('subCategory') && (
                      <td className="px-3 py-3 text-sm text-slate-600 overflow-hidden text-ellipsis" style={{ width: columnWidths.subCategory, minWidth: columnWidths.subCategory, maxWidth: columnWidths.subCategory }}>{hierarchy.subCategory || '-'}</td>
                    )}
                    {visibleColumns.has('price') && (
                      <td className="px-3 py-3 overflow-hidden text-ellipsis" style={{ width: columnWidths.price, minWidth: columnWidths.price, maxWidth: columnWidths.price }}>
                        {renderEditableCell(
                          p,
                          'price',
                          <span className="text-sm font-semibold text-slate-900">{p.price.toLocaleString()}</span>,
                          p.price
                        )}
                      </td>
                    )}
                    {visibleColumns.has('currency') && (
                      <td className="px-3 py-3 text-sm text-slate-600" style={{ width: columnWidths.currency, minWidth: columnWidths.currency, maxWidth: columnWidths.currency }}>{p.currency}</td>
                    )}
                    {visibleColumns.has('unit') && (
                      <td className="px-3 py-3 text-sm text-slate-600" style={{ width: columnWidths.unit, minWidth: columnWidths.unit, maxWidth: columnWidths.unit }}>{p.unit}</td>
                    )}
                    {visibleColumns.has('moq') && (
                      <td className="px-3 py-3 overflow-hidden text-ellipsis" style={{ width: columnWidths.moq, minWidth: columnWidths.moq, maxWidth: columnWidths.moq }}>
                        {renderEditableCell(
                          p,
                          'moq',
                          <span className="text-sm text-slate-600">{p.moq}</span>,
                          p.moq
                        )}
                      </td>
                    )}
                    {visibleColumns.has('leadTime') && (
                      <td className="px-3 py-3 overflow-hidden text-ellipsis" style={{ width: columnWidths.leadTime, minWidth: columnWidths.leadTime, maxWidth: columnWidths.leadTime }}>
                        {renderEditableCell(
                          p,
                          'leadTime',
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${p.leadTime > 30 ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                            <span className="text-sm text-slate-600">{p.leadTime}d</span>
                          </div>,
                          p.leadTime
                        )}
                      </td>
                    )}
                    {visibleColumns.has('manufacturer') && (
                      <td className="px-3 py-3 overflow-hidden text-ellipsis" style={{ width: columnWidths.manufacturer, minWidth: columnWidths.manufacturer, maxWidth: columnWidths.manufacturer }}>
                        {renderEditableCell(
                          p,
                          'manufacturer',
                          <span className="text-sm text-slate-600 truncate block">{p.manufacturer || '-'}</span>,
                          p.manufacturer || ''
                        )}
                      </td>
                    )}
                    {visibleColumns.has('location') && (
                      <td className="px-3 py-3 text-sm text-slate-600 overflow-hidden text-ellipsis truncate" style={{ width: columnWidths.location, minWidth: columnWidths.location, maxWidth: columnWidths.location }}>{p.manufacturingLocation || '-'}</td>
                    )}
                    {visibleColumns.has('description') && (
                      <td className="px-3 py-3 text-sm text-slate-500 truncate overflow-hidden text-ellipsis" style={{ width: columnWidths.description, minWidth: columnWidths.description, maxWidth: columnWidths.description }} title={p.description}>{p.description || '-'}</td>
                    )}
                    {visibleColumns.has('usageAreas') && (
                      <td className="px-3 py-3 overflow-hidden" style={{ width: columnWidths.usageAreas, minWidth: columnWidths.usageAreas, maxWidth: columnWidths.usageAreas }}>
                        {isEditing(p.id, 'usageAreas') ? (
                          <div className="flex flex-wrap gap-1 items-center" onClick={e => e.stopPropagation()}>
                            {usageAreas.map(area => {
                              const productAreas = p.customFields?.['Usage Areas'] || [];
                              const isSelected = Array.isArray(productAreas) && productAreas.includes(area);
                              return (
                                <button
                                  key={area}
                                  onClick={() => {
                                    const currentAreas = [...(p.customFields?.['Usage Areas'] || [])];
                                    const idx = currentAreas.indexOf(area);
                                    if (idx === -1) {
                                      currentAreas.push(area);
                                    } else {
                                      currentAreas.splice(idx, 1);
                                    }
                                    const updated = {
                                      ...p,
                                      customFields: {
                                        ...p.customFields,
                                        'Usage Areas': currentAreas
                                      }
                                    };
                                    onUpdate(updated);
                                  }}
                                  className={`px-2 py-0.5 text-xs rounded-full border transition-all ${
                                    isSelected 
                                      ? 'bg-blue-100 border-blue-300 text-blue-700' 
                                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                                  }`}
                                >
                                  {area}
                                </button>
                              );
                            })}
                            <button 
                              onClick={() => setEditingCell(null)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded ml-1"
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        ) : (
                          <div 
                            className="cursor-text hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 rounded px-1 py-0.5 transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (clickTimeoutRef.current) {
                                clearTimeout(clickTimeoutRef.current);
                                clickTimeoutRef.current = null;
                              }
                              setEditingCell({ productId: p.id, field: 'usageAreas' });
                            }}
                            title="Click to edit usage areas"
                          >
                            {(() => {
                              const areas = p.customFields?.['Usage Areas'] || [];
                              const validAreas = Array.isArray(areas) ? areas.filter(a => usageAreas.includes(a)) : [];
                              if (validAreas.length === 0) {
                                return <span className="text-sm text-slate-400">-</span>;
                              }
                              return (
                                <div className="flex flex-wrap gap-1">
                                  {validAreas.slice(0, 3).map(area => (
                                    <span key={area} className="px-1.5 py-0.5 text-xs bg-blue-50 text-blue-600 rounded">
                                      {area}
                                    </span>
                                  ))}
                                  {validAreas.length > 3 && (
                                    <span className="text-xs text-slate-400">+{validAreas.length - 3} more</span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3 text-right sticky right-0 bg-white group-hover:bg-blue-50/30 z-10">
                    <div className="flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                      <button 
                        onClick={() => currentUser ? setEditingProduct(p) : startEditing(p, 'name', p.name)}
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                        title="Edit product"
                      >
                        {ICONS.Edit}
                      </button>
                      {onCreate && (
                        <button 
                          onClick={() => duplicateProduct(p)}
                          className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                          title="Duplicate product"
                        >
                          <Copy size={14} />
                        </button>
                      )}
                      <button 
                        onClick={() => onDelete(p.id)}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                        title="Delete product"
                      >
                        {ICONS.Trash}
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {sortedProducts.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.size + 2} className="px-6 py-20 text-center">
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
          onEdit={(p) => {
            setSelectedProduct(null);
            setEditingProduct(p);
          }}
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
              usageAreas={usageAreas}
              onAddFieldDefinition={onAddFieldDefinition}
              onAddTreeNode={onAddTreeNode}
            />
          </div>
        </div>
      )}

      {(showFilterPanel || showExportMenu || showColumnsMenu) && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => {
            setShowFilterPanel(false);
            setShowExportMenu(false);
            setShowColumnsMenu(false);
          }}
        />
      )}
    </div>
  );
};

export default ProductList;
