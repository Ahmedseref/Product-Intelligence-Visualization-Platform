import React, { useState, useMemo, useEffect } from 'react';
import { Product, User, CustomField, TreeNode, TechnicalSpec, Supplier, Color } from '../types';
import { CURRENCIES, UNITS, ICONS } from '../constants';
import { Plus, Trash2, X, Check, Hash } from 'lucide-react';
import TaxonomyNodeSelector from './TaxonomyNodeSelector';
import { api } from '../client/api';

interface ProductFormProps {
  onSubmit: (p: Product) => void;
  onCancel: () => void;
  currentUser: User;
  customFields: CustomField[];
  treeNodes: TreeNode[];
  suppliers: Supplier[];
  usageAreas?: string[];
  units?: string[];
  colors?: any[];
  onAddFieldDefinition: (field: CustomField) => void;
  onAddTreeNode: (node: TreeNode) => void;
  initialProduct?: Product;
  mode?: 'create' | 'edit';
}

const ProductForm: React.FC<ProductFormProps> = ({ onSubmit, onCancel, currentUser, customFields, treeNodes, suppliers = [], usageAreas = [], units: unitsProp, colors = [], onAddFieldDefinition, onAddTreeNode, initialProduct, mode = 'create' }) => {
  const isEditMode = mode === 'edit' && initialProduct;
  const USAGE_AREAS = usageAreas;
  const dynamicUnits = unitsProp && unitsProp.length > 0 ? unitsProp : UNITS;
  
  const [showNewFieldModal, setShowNewFieldModal] = useState(false);
  const [newFieldDef, setNewFieldDef] = useState<Partial<CustomField>>({ label: '', type: 'text' });
  
  const getNodePath = (nodeId: string) => {
    const path: string[] = [];
    let current = treeNodes.find(n => n.id === nodeId);
    while (current) {
      path.unshift(current.id);
      current = treeNodes.find(n => n.id === current?.parentId);
    }
    return path;
  };
  
  const initialPath = initialProduct ? getNodePath(initialProduct.nodeId) : [];
  
  const [selectedSector, setSelectedSector] = useState<string>(initialPath[0] || '');
  const [selectedCategory, setSelectedCategory] = useState<string>(initialPath[1] || '');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>(initialPath[2] || '');
  
  const [showAddSector, setShowAddSector] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddSubcategory, setShowAddSubcategory] = useState(false);
  const [newNodeName, setNewNodeName] = useState('');
  
  const [technicalSpecs, setTechnicalSpecs] = useState<TechnicalSpec[]>(initialProduct?.technicalSpecs || []);
  const [newSpecName, setNewSpecName] = useState('');
  const [newSpecValue, setNewSpecValue] = useState('');
  const [newSpecUnit, setNewSpecUnit] = useState('');
  const [editingSpec, setEditingSpec] = useState<{ specId: string; field: 'name' | 'value' | 'unit' } | null>(null);
  const [editSpecValue, setEditSpecValue] = useState('');
  
  const getInitialUsageAreas = (): string[] => {
    if (initialProduct?.customFields) {
      if (typeof initialProduct.customFields === 'object' && !Array.isArray(initialProduct.customFields)) {
        const areas = initialProduct.customFields['Usage Areas'];
        if (Array.isArray(areas)) return [...areas];
      }
      if (Array.isArray(initialProduct.customFields)) {
        const usageField = initialProduct.customFields.find((cf: any) =>
          cf.fieldId?.toLowerCase().includes('usage') || cf.fieldId?.toLowerCase().includes('application')
        );
        if (usageField?.value) {
          if (Array.isArray(usageField.value)) return [...usageField.value];
          return String(usageField.value).split(',').map((v: string) => v.trim()).filter(Boolean);
        }
      }
    }
    return [];
  };
  const [selectedUsageAreas, setSelectedUsageAreas] = useState<string[]>(getInitialUsageAreas());
  
  const [formData, setFormData] = useState<Partial<Product>>(isEditMode ? {
    ...initialProduct,
    lastUpdated: new Date().toISOString()
  } : {
    id: `PRD-${Math.floor(1000 + Math.random() * 9000)}`,
    name: '',
    supplier: '',
    nodeId: '',
    category: '',
    sector: '',
    manufacturer: '',
    manufacturingLocation: '',
    description: '',
    imageUrl: `https://picsum.photos/seed/${Math.random()}/400/300`,
    price: 0,
    currency: CURRENCIES[0],
    unit: dynamicUnits[0] || 'kg',
    moq: 1,
    leadTime: 30,
    packagingType: '',
    certifications: [],
    shelfLife: '',
    storageConditions: '',
    customFields: [],
    technicalSpecs: [],
    dateAdded: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    createdBy: currentUser.name,
    history: []
  });

  const [selectedColorId, setSelectedColorId] = useState<number | null>(
    isEditMode && initialProduct?.colorId ? initialProduct.colorId : null
  );
  const [stockCodePreview, setStockCodePreview] = useState<string>('');

  useEffect(() => {
    if (formData.nodeId) {
      const productId = isEditMode ? initialProduct?.id : undefined;
      api.previewStockCode(formData.nodeId, selectedColorId || undefined, productId)
        .then(res => setStockCodePreview(res.stockCode || ''))
        .catch(() => setStockCodePreview(''));
    } else {
      setStockCodePreview('');
    }
  }, [formData.nodeId, selectedColorId]);

  const sectors = useMemo(() => 
    treeNodes.filter(n => n.type === 'sector' && !n.parentId), 
    [treeNodes]
  );
  
  const categories = useMemo(() => 
    treeNodes.filter(n => n.parentId === selectedSector && (n.type === 'category' || n.type === 'subcategory')), 
    [treeNodes, selectedSector]
  );
  
  const subcategories = useMemo(() => 
    treeNodes.filter(n => n.parentId === selectedCategory), 
    [treeNodes, selectedCategory]
  );

  const handleSectorChange = (sectorId: string) => {
    if (sectorId === '__add_new__') {
      setShowAddSector(true);
      return;
    }
    setSelectedSector(sectorId);
    setSelectedCategory('');
    setSelectedSubcategory('');
    setFormData({ ...formData, nodeId: sectorId });
  };

  const handleCategoryChange = (categoryId: string) => {
    if (categoryId === '__add_new__') {
      setShowAddCategory(true);
      return;
    }
    setSelectedCategory(categoryId);
    setSelectedSubcategory('');
    setFormData({ ...formData, nodeId: categoryId });
  };

  const handleSubcategoryChange = (subcategoryId: string) => {
    if (subcategoryId === '__add_new__') {
      setShowAddSubcategory(true);
      return;
    }
    setSelectedSubcategory(subcategoryId);
    setFormData({ ...formData, nodeId: subcategoryId });
  };

  const handleAddNewSector = () => {
    if (!newNodeName.trim()) return;
    const newNode: TreeNode = {
      id: `node-${Date.now()}`,
      name: newNodeName.trim(),
      type: 'sector',
      parentId: null,
    };
    onAddTreeNode(newNode);
    setSelectedSector(newNode.id);
    setFormData({ ...formData, nodeId: newNode.id });
    setNewNodeName('');
    setShowAddSector(false);
  };

  const handleAddNewCategory = () => {
    if (!newNodeName.trim() || !selectedSector) return;
    const newNode: TreeNode = {
      id: `node-${Date.now()}`,
      name: newNodeName.trim(),
      type: 'category',
      parentId: selectedSector,
    };
    onAddTreeNode(newNode);
    setSelectedCategory(newNode.id);
    setFormData({ ...formData, nodeId: newNode.id });
    setNewNodeName('');
    setShowAddCategory(false);
  };

  const handleAddNewSubcategory = () => {
    if (!newNodeName.trim() || !selectedCategory) return;
    const newNode: TreeNode = {
      id: `node-${Date.now()}`,
      name: newNodeName.trim(),
      type: 'subcategory',
      parentId: selectedCategory,
    };
    onAddTreeNode(newNode);
    setSelectedSubcategory(newNode.id);
    setFormData({ ...formData, nodeId: newNode.id });
    setNewNodeName('');
    setShowAddSubcategory(false);
  };

  const addTechnicalSpec = () => {
    if (!newSpecName.trim() || !newSpecValue.trim()) return;
    const newSpec: TechnicalSpec = {
      id: `spec-${Date.now()}`,
      name: newSpecName.trim(),
      value: newSpecValue.trim(),
      unit: newSpecUnit.trim() || undefined,
      affectsPrice: false
    };
    setTechnicalSpecs([...technicalSpecs, newSpec]);
    setNewSpecName('');
    setNewSpecValue('');
    setNewSpecUnit('');
  };

  const removeTechnicalSpec = (id: string) => {
    setTechnicalSpecs(technicalSpecs.filter(s => s.id !== id));
  };

  const startEditSpec = (specId: string, field: 'name' | 'value' | 'unit', currentValue: string) => {
    setEditingSpec({ specId, field });
    setEditSpecValue(currentValue);
  };

  const saveSpecEdit = () => {
    if (!editingSpec) return;
    setTechnicalSpecs(technicalSpecs.map(spec => {
      if (spec.id === editingSpec.specId) {
        return { ...spec, [editingSpec.field]: editSpecValue.trim() || (editingSpec.field === 'unit' ? undefined : spec[editingSpec.field]) };
      }
      return spec;
    }));
    setEditingSpec(null);
    setEditSpecValue('');
  };

  const cancelSpecEdit = () => {
    setEditingSpec(null);
    setEditSpecValue('');
  };

  const handleCustomFieldChange = (fieldId: string, value: any) => {
    const existing = formData.customFields || [];
    const index = existing.findIndex(f => f.fieldId === fieldId);
    
    if (index >= 0) {
      const updated = [...existing];
      updated[index] = { fieldId, value };
      setFormData({ ...formData, customFields: updated });
    } else {
      setFormData({ ...formData, customFields: [...existing, { fieldId, value }] });
    }
  };

  const addNewFieldDefinition = () => {
    if (!newFieldDef.label) return;
    const id = newFieldDef.label.toLowerCase().replace(/\s+/g, '_');
    onAddFieldDefinition({
      id,
      label: newFieldDef.label,
      type: newFieldDef.type as any,
    });
    setNewFieldDef({ label: '', type: 'text' });
    setShowNewFieldModal(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.supplier || !formData.nodeId) return alert("Missing required fields");
    
    const node = treeNodes.find(n => n.id === formData.nodeId);
    let sector = 'Unknown';
    let current = node;
    while(current) {
      if(current.type === 'sector') {
        sector = current.name;
        break;
      }
      current = treeNodes.find(n => n.id === current?.parentId);
    }

    const updatedCustomFields = {
      ...(typeof formData.customFields === 'object' && !Array.isArray(formData.customFields) ? formData.customFields : {}),
      'Usage Areas': selectedUsageAreas
    };

    let updatedHistory = [...(formData.history || [])];
    
    if (mode === 'edit' && initialProduct) {
      const changes: Record<string, { old: any; new: any }> = {};
      
      if (initialProduct.price !== formData.price) {
        changes.price = { old: initialProduct.price, new: formData.price };
      }
      if (initialProduct.moq !== formData.moq) {
        changes.moq = { old: initialProduct.moq, new: formData.moq };
      }
      if (initialProduct.leadTime !== formData.leadTime) {
        changes.leadTime = { old: initialProduct.leadTime, new: formData.leadTime };
      }
      if (initialProduct.name !== formData.name) {
        changes.name = { old: initialProduct.name, new: formData.name };
      }
      if (initialProduct.supplier !== formData.supplier) {
        changes.supplier = { old: initialProduct.supplier, new: formData.supplier };
      }
      
      if (Object.keys(changes).length > 0) {
        const historyEntry = {
          id: `HIST-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          changes,
          snapshot: {}
        };
        updatedHistory = [historyEntry, ...updatedHistory];
      }
    }

    const submission = {
      ...formData,
      sector,
      category: node?.name || 'Uncategorized',
      technicalSpecs,
      customFields: updatedCustomFields,
      history: updatedHistory,
      lastUpdated: new Date().toISOString(),
      colorId: selectedColorId
    };

    onSubmit(submission as Product);
  };

  const getFullNodePathString = (id: string) => {
    const path: string[] = [];
    let current = treeNodes.find(n => n.id === id);
    while (current) {
      path.unshift(current.name);
      current = treeNodes.find(n => n.id === current?.parentId);
    }
    return path.join(' > ');
  };

  const AddNodeModal = ({ 
    show, 
    onClose, 
    onAdd, 
    title, 
    placeholder 
  }: { 
    show: boolean; 
    onClose: () => void; 
    onAdd: () => void; 
    title: string; 
    placeholder: string;
  }) => {
    if (!show) return null;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl p-6 w-96">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
              <X size={20} />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                type="text"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder={placeholder}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onAdd();
                  }
                }}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onAdd}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
              {isEditMode ? 'Edit Product' : 'Register New Product'}
            </h2>
            <p className="text-sm text-slate-400">
              {isEditMode ? 'Update product details and specifications.' : 'Assign to the taxonomy tree and define technical specs.'}
            </p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="px-6 py-2 border border-slate-200 text-slate-500 rounded-xl font-bold hover:bg-slate-50 transition-all">Cancel</button>
            <button type="submit" className="px-8 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all">
              {isEditMode ? 'Update Product' : 'Save Product Card'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span> Taxonomy & Identity
              </h3>
               
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product Name*</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="e.g. Marble Tile, Rockwool Insulation..."
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Base product name for this item</p>
                </div>
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Supplier Name*</label>
                  <select
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={formData.supplier}
                    onChange={e => {
                      const selectedSupplier = suppliers.find(s => s.name === e.target.value);
                      setFormData({
                        ...formData, 
                        supplier: e.target.value,
                        supplierId: selectedSupplier?.id
                      });
                    }}
                  >
                    <option value="">Select Supplier...</option>
                    {suppliers.filter(s => s.isActive).map(s => (
                      <option key={s.id} value={s.name}>{s.name} ({s.id})</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">Select from Supplier Manager</p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Brand Name</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="e.g. Akfix, Sika, 3M, Bosch..."
                  value={formData.manufacturer}
                  onChange={e => setFormData({...formData, manufacturer: e.target.value})}
                />
                <p className="text-[10px] text-slate-400 mt-1">The brand or manufacturer name for this product</p>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Taxonomy Placement*</label>
                <p className="text-[10px] text-slate-400">Select where this product belongs in your taxonomy tree (supports unlimited depth)</p>
                <TaxonomyNodeSelector
                  treeNodes={treeNodes}
                  selectedNodeId={formData.nodeId || null}
                  onSelect={(nodeId, path) => {
                    setFormData({ ...formData, nodeId });
                    setSelectedSector(path[0] || '');
                    setSelectedCategory(path[1] || '');
                    setSelectedSubcategory(path[2] || '');
                  }}
                  onClear={() => {
                    setFormData({ ...formData, nodeId: '' });
                    setSelectedSector('');
                    setSelectedCategory('');
                    setSelectedSubcategory('');
                  }}
                  placeholder="Select taxonomy node..."
                />
              </div>

              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Hash size={14} />
                  Product Color
                </label>
                <p className="text-[10px] text-slate-400">Select a color for stock code generation</p>
                <div className="flex flex-wrap gap-2">
                  {colors.filter((c: any) => c.isActive !== false).map((color: any) => (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => setSelectedColorId(selectedColorId === color.id ? null : color.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                        selectedColorId === color.id
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div
                        className="w-4 h-4 rounded-full border border-slate-300"
                        style={{ backgroundColor: color.hexValue || '#ccc' }}
                      />
                      <span>{color.name}</span>
                      <span className="text-[10px] text-slate-400">({color.code})</span>
                    </button>
                  ))}
                  {colors.length === 0 && (
                    <p className="text-xs text-slate-400 italic">No colors defined. Add colors in Settings.</p>
                  )}
                </div>
                {stockCodePreview && (
                  <div className="mt-2 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <Hash size={14} className="text-emerald-600" />
                    <span className="text-xs font-medium text-emerald-700">Stock Code Preview:</span>
                    <span className="text-sm font-mono font-bold text-emerald-800">{stockCodePreview}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rich Product Description</label>
                <textarea 
                  rows={4}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                  placeholder="Provide technical specs, usage context, and selling points..."
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Usage Areas</label>
                <p className="text-[10px] text-slate-400">Select the industries or applications where this product is used</p>
                <div className="flex flex-wrap gap-2">
                  {USAGE_AREAS.map(area => {
                    const isSelected = selectedUsageAreas.includes(area);
                    return (
                      <button
                        key={area}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedUsageAreas(prev => prev.filter(a => a !== area));
                          } else {
                            setSelectedUsageAreas(prev => [...prev, area]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                          isSelected 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                        {area}
                      </button>
                    );
                  })}
                </div>
                {selectedUsageAreas.length > 0 && (
                  <p className="text-xs text-blue-600 mt-2">
                    Selected: {selectedUsageAreas.join(', ')}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span> Technical Specifications
                </h3>
              </div>
              <p className="text-sm text-slate-500">Add multiple specifications like thickness, density, color, size, etc. Each specification can affect pricing.</p>

              {technicalSpecs.length > 0 && (
                <div className="space-y-2">
                  {technicalSpecs.map(spec => (
                    <div key={spec.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex-1 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase">Attribute</span>
                          {editingSpec?.specId === spec.id && editingSpec?.field === 'name' ? (
                            <input
                              type="text"
                              autoFocus
                              className="w-full bg-white border border-emerald-400 rounded px-2 py-1 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                              value={editSpecValue}
                              onChange={e => setEditSpecValue(e.target.value)}
                              onBlur={saveSpecEdit}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveSpecEdit();
                                if (e.key === 'Escape') cancelSpecEdit();
                              }}
                            />
                          ) : (
                            <p 
                              className="font-semibold text-slate-800 cursor-pointer hover:bg-emerald-100 rounded px-1 py-0.5 -mx-1 transition-colors"
                              onDoubleClick={() => startEditSpec(spec.id, 'name', spec.name)}
                              title="Double-click to edit"
                            >
                              {spec.name}
                            </p>
                          )}
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase">Value</span>
                          {editingSpec?.specId === spec.id && editingSpec?.field === 'value' ? (
                            <input
                              type="text"
                              autoFocus
                              className="w-full bg-white border border-emerald-400 rounded px-2 py-1 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                              value={editSpecValue}
                              onChange={e => setEditSpecValue(e.target.value)}
                              onBlur={saveSpecEdit}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveSpecEdit();
                                if (e.key === 'Escape') cancelSpecEdit();
                              }}
                            />
                          ) : (
                            <p 
                              className="font-semibold text-slate-800 cursor-pointer hover:bg-emerald-100 rounded px-1 py-0.5 -mx-1 transition-colors"
                              onDoubleClick={() => startEditSpec(spec.id, 'value', spec.value)}
                              title="Double-click to edit"
                            >
                              {spec.value}
                            </p>
                          )}
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase">Unit</span>
                          {editingSpec?.specId === spec.id && editingSpec?.field === 'unit' ? (
                            <input
                              type="text"
                              autoFocus
                              className="w-full bg-white border border-emerald-400 rounded px-2 py-1 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                              value={editSpecValue}
                              onChange={e => setEditSpecValue(e.target.value)}
                              onBlur={saveSpecEdit}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveSpecEdit();
                                if (e.key === 'Escape') cancelSpecEdit();
                              }}
                            />
                          ) : (
                            <p 
                              className="font-semibold text-slate-800 cursor-pointer hover:bg-emerald-100 rounded px-1 py-0.5 -mx-1 transition-colors"
                              onDoubleClick={() => startEditSpec(spec.id, 'unit', spec.unit || '')}
                              title="Double-click to edit"
                            >
                              {spec.unit || '-'}
                            </p>
                          )}
                        </div>
                      </div>
                      <button 
                        type="button"
                        onClick={() => removeTechnicalSpec(spec.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Attribute Name</label>
                  <input 
                    type="text"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g. Thickness, Color, Density"
                    value={newSpecName}
                    onChange={e => setNewSpecName(e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Value</label>
                  <input 
                    type="text"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g. 50, Red, 120"
                    value={newSpecValue}
                    onChange={e => setNewSpecValue(e.target.value)}
                  />
                </div>
                <div className="w-24 space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Unit</label>
                  <input 
                    type="text"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="mm, kg"
                    value={newSpecUnit}
                    onChange={e => setNewSpecUnit(e.target.value)}
                  />
                </div>
                <button 
                  type="button"
                  onClick={addTechnicalSpec}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2"
                >
                  <Plus size={16} /> Add
                </button>
              </div>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-purple-500 rounded-full"></span> Custom Attributes
                </h3>
                <button 
                  type="button" 
                  onClick={() => setShowNewFieldModal(true)}
                  className="text-xs font-bold bg-purple-50 text-purple-600 px-3 py-1 rounded-full hover:bg-purple-100 transition-all flex items-center gap-1"
                >
                  {ICONS.Add} New Field
                </button>
              </div>

              {customFields.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                  <p className="text-sm text-slate-400">No custom attributes defined.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {customFields.map((field) => (
                    <div key={field.id} className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{field.label}</label>
                      <input 
                        type={field.type === 'number' || field.type === 'currency' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                        placeholder={`Enter ${field.label.toLowerCase()}...`}
                        value={formData.customFields?.find(f => f.fieldId === field.id)?.value || ''}
                        onChange={e => handleCustomFieldChange(field.id, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-amber-500 rounded-full"></span> Pricing & Logistics
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Base Price</label>
                  <input 
                    type="number" step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                    value={formData.price}
                    onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Currency</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                    value={formData.currency}
                    onChange={e => setFormData({...formData, currency: e.target.value})}
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unit</label>
                  {[...dynamicUnits, 'Other'].includes(formData.unit) || formData.unit === '' ? (
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                      value={dynamicUnits.includes(formData.unit) ? formData.unit : 'Other'}
                      onChange={e => {
                        if (e.target.value === 'Other') {
                          setFormData({...formData, unit: ''});
                        } else {
                          setFormData({...formData, unit: e.target.value});
                        }
                      }}
                    >
                      {dynamicUnits.map(u => <option key={u} value={u}>{u}</option>)}
                      <option value="Other">Other</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="Enter custom unit..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                        value={formData.unit}
                        onChange={e => setFormData({...formData, unit: e.target.value})}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, unit: 'kg'})}
                        className="px-3 py-2 bg-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-300"
                        title="Back to list"
                      >
                        List
                      </button>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">MOQ</label>
                  <input 
                    type="number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                    value={formData.moq}
                    onChange={e => setFormData({...formData, moq: parseInt(e.target.value) || 1})}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Manufacturing</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Brand Name</label>
                  <input 
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none"
                    value={formData.manufacturer}
                    onChange={e => setFormData({...formData, manufacturer: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Location</label>
                  <input 
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none"
                    value={formData.manufacturingLocation}
                    onChange={e => setFormData({...formData, manufacturingLocation: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lead Time (days)</label>
                  <input 
                    type="number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none"
                    value={formData.leadTime}
                    onChange={e => setFormData({...formData, leadTime: parseInt(e.target.value) || 0})}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      <AddNodeModal
        show={showAddSector}
        onClose={() => { setShowAddSector(false); setNewNodeName(''); }}
        onAdd={handleAddNewSector}
        title="Add New Sector"
        placeholder="e.g. Construction Materials"
      />

      <AddNodeModal
        show={showAddCategory}
        onClose={() => { setShowAddCategory(false); setNewNodeName(''); }}
        onAdd={handleAddNewCategory}
        title="Add New Category"
        placeholder="e.g. Insulation Products"
      />

      <AddNodeModal
        show={showAddSubcategory}
        onClose={() => { setShowAddSubcategory(false); setNewNodeName(''); }}
        onAdd={handleAddNewSubcategory}
        title="Add New Sub-Category"
        placeholder="e.g. Thermal Panels"
      />

      {showNewFieldModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-96">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">Add Custom Field</h3>
              <button onClick={() => setShowNewFieldModal(false)} className="p-1 hover:bg-slate-100 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Field Name</label>
                <input
                  type="text"
                  value={newFieldDef.label || ''}
                  onChange={(e) => setNewFieldDef({...newFieldDef, label: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  placeholder="e.g. Certification Number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Field Type</label>
                <select
                  value={newFieldDef.type}
                  onChange={(e) => setNewFieldDef({...newFieldDef, type: e.target.value as any})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="currency">Currency</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewFieldModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addNewFieldDefinition}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Add Field
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductForm;
