import React, { useState, useMemo } from 'react';
import { Product, TreeNode, Supplier, TechnicalSpec } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { CheckCircle, AlertCircle, ArrowLeft, ArrowRight, X, ClipboardPaste, Plus, Trash2, Check } from 'lucide-react';
import { UNITS } from '../constants';
import TaxonomyNodeSelector from './TaxonomyNodeSelector';

const PASTE_FIELDS = [
  { key: 'name', label: 'Product Name', required: true, placeholder: 'Paste product names here (one per line)' },
  { key: 'description', label: 'Description', required: false, placeholder: 'Paste descriptions here' },
  { key: 'price', label: 'Price', required: false, placeholder: 'Paste prices here' },
  { key: 'unit', label: 'Unit', required: false, placeholder: 'Paste units here (e.g., kg, m², piece)' },
  { key: 'packagingType', label: 'Packing', required: false, placeholder: 'Paste packing info here (e.g., 25kg bag, 20L drum, 1L can)' },
  { key: 'moq', label: 'MOQ', required: false, placeholder: 'Paste MOQ values here' },
  { key: 'leadTime', label: 'Lead Time (days)', required: false, placeholder: 'Paste lead times here' },
  { key: 'hsCode', label: 'HS Code', required: false, placeholder: 'HS codes' },
  { key: 'shelfLife', label: 'Shelf Life', required: false, placeholder: 'Shelf life info' },
  { key: 'storageConditions', label: 'Storage Conditions', required: false, placeholder: 'Storage requirements' },
];

interface MassImportWizardProps {
  onImport: (products: Product[]) => void;
  onCancel: () => void;
  treeNodes: TreeNode[];
  suppliers: Supplier[];
  existingProducts?: Product[];
  usageAreas?: string[];
  units?: string[];
  onUnitsChange?: (units: string[]) => void;
}

const MassImportWizard: React.FC<MassImportWizardProps> = ({
  onImport,
  onCancel,
  treeNodes,
  suppliers,
  existingProducts = [],
  usageAreas = [],
  units: unitsProp,
  onUnitsChange,
}) => {
  const dynamicUnits = unitsProp && unitsProp.length > 0 ? unitsProp : UNITS;
  const USAGE_AREAS = usageAreas;

  const [pasteData, setPasteData] = useState<Record<string, string>>({});
  const [techSpecColumns, setTechSpecColumns] = useState<{ id: string; name: string; unit: string; data: string }[]>([]);
  const [pasteStep, setPasteStep] = useState<1 | 2 | 3>(1);
  const [pasteAssignment, setPasteAssignment] = useState({
    selectedNodeId: '',
    selectedSector: '',
    selectedCategory: '',
    selectedSubcategory: '',
    supplierId: '',
    usageAreas: [] as string[],
    brandName: '',
    currency: 'USD',
    unit: 'piece',
    moq: '1',
    leadTime: '30',
    packagingType: '',
  });

  const [duplicateResults, setDuplicateResults] = useState<{ duplicates: Product[]; unique: Product[] } | null>(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  useEscapeKey(showDuplicateWarning ? () => setShowDuplicateWarning(false) : null);

  const addTechSpecColumn = () => {
    setTechSpecColumns(prev => [...prev, { id: `spec-${Date.now()}`, name: '', unit: '', data: '' }]);
  };

  const updateTechSpecColumn = (id: string, field: 'name' | 'unit' | 'data', value: string) => {
    setTechSpecColumns(prev => prev.map(col => col.id === id ? { ...col, [field]: value } : col));
  };

  const removeTechSpecColumn = (id: string) => {
    setTechSpecColumns(prev => prev.filter(col => col.id !== id));
  };

  const getPasteRowCount = (): number => {
    const nameData = pasteData['name'] || '';
    return nameData.split('\n').filter(line => line.trim()).length;
  };

  const getRowCountMismatch = (): string[] => {
    const expectedCount = getPasteRowCount();
    if (expectedCount === 0) return [];
    const mismatches: string[] = [];
    PASTE_FIELDS.forEach(field => {
      if (field.key === 'name') return;
      const data = pasteData[field.key] || '';
      if (data.trim()) {
        const count = data.split('\n').filter(l => l.trim()).length;
        if (count !== expectedCount) {
          mismatches.push(`${field.label}: ${count} rows (expected ${expectedCount})`);
        }
      }
    });
    techSpecColumns.forEach(col => {
      if (col.data.trim()) {
        const count = col.data.split('\n').filter(l => l.trim()).length;
        if (count !== expectedCount) {
          mismatches.push(`${col.name || 'Unnamed Spec'}: ${count} rows (expected ${expectedCount})`);
        }
      }
    });
    return mismatches;
  };

  const canProceedPasteStep1 = (): boolean =>
    getPasteRowCount() > 0 && getRowCountMismatch().length === 0;

  const canProceedPasteStep2 = (): boolean =>
    pasteAssignment.supplierId !== '' && pasteAssignment.selectedNodeId !== '';

  const toggleUsageArea = (area: string) => {
    setPasteAssignment(prev => ({
      ...prev,
      usageAreas: prev.usageAreas.includes(area)
        ? prev.usageAreas.filter(a => a !== area)
        : [...prev.usageAreas, area],
    }));
  };

  const generatePasteProducts = (): Product[] => {
    const nameLines = (pasteData['name'] || '').split('\n').filter(line => line.trim());
    if (nameLines.length === 0) return [];

    const products: Product[] = [];
    const supplier = suppliers.find(s => s.id === pasteAssignment.supplierId);
    const nodeId = pasteAssignment.selectedNodeId;
    const node = treeNodes.find(n => n.id === nodeId);

    let sectorName = '';
    let categoryName = '';

    if (node?.type === 'sector') {
      sectorName = node.name;
      categoryName = '';
    } else if (node) {
      categoryName = node.name;
      let parent = node;
      while (parent) {
        if (parent.type === 'sector') { sectorName = parent.name; break; }
        parent = treeNodes.find(n => n.id === parent?.parentId);
      }
    }

    nameLines.forEach((name, index) => {
      const getFieldValue = (key: string): string => {
        const lines = (pasteData[key] || '').split('\n');
        return (lines[index] || '').trim();
      };

      const technicalSpecs: TechnicalSpec[] = techSpecColumns
        .filter(col => col.name.trim())
        .map(col => ({
          id: `${col.id}-${index}`,
          name: col.name.trim(),
          value: (col.data.split('\n')[index] || '').trim(),
          unit: col.unit.trim(),
        }));

      const customFields: { fieldId: string; value: string }[] = [];
      if (pasteAssignment.usageAreas.length > 0) {
        customFields.push({ fieldId: 'usage_areas', value: pasteAssignment.usageAreas.join(', ') });
      }

      products.push({
        id: `PRD-${Date.now()}-${index}`,
        name: name.trim(),
        supplier: supplier?.name || '',
        supplierId: pasteAssignment.supplierId,
        nodeId,
        category: categoryName,
        sector: sectorName,
        manufacturer: pasteAssignment.brandName,
        manufacturingLocation: '',
        description: getFieldValue('description'),
        imageUrl: '',
        price: parseFloat(getFieldValue('price')) || 0,
        currency: getFieldValue('currency') || pasteAssignment.currency || 'USD',
        unit: getFieldValue('unit') || pasteAssignment.unit || 'piece',
        moq: parseInt(getFieldValue('moq')) || parseInt(pasteAssignment.moq) || 1,
        leadTime: parseInt(getFieldValue('leadTime')) || parseInt(pasteAssignment.leadTime) || 30,
        packagingType: getFieldValue('packagingType') || pasteAssignment.packagingType || '',
        hsCode: getFieldValue('hsCode'),
        certifications: [],
        shelfLife: getFieldValue('shelfLife'),
        storageConditions: getFieldValue('storageConditions'),
        customFields,
        technicalSpecs,
        dateAdded: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        createdBy: 'Import',
        history: [],
      });
    });

    return products;
  };

  const checkDuplicates = (products: Product[]) => {
    const existingKeys = new Set(
      existingProducts.map(p => `${p.name.trim().toLowerCase()}|||${(p.supplier || '').trim().toLowerCase()}`)
    );
    const seenInBatch = new Set<string>();
    const duplicates: Product[] = [];
    const unique: Product[] = [];
    products.forEach(p => {
      const key = `${p.name.trim().toLowerCase()}|||${(p.supplier || '').trim().toLowerCase()}`;
      if (existingKeys.has(key) || seenInBatch.has(key)) {
        duplicates.push(p);
      } else {
        unique.push(p);
        seenInBatch.add(key);
      }
    });
    return { duplicates, unique };
  };

  const proceedImport = (products: Product[]) => {
    if (products.length > 0) {
      if (onUnitsChange) {
        const newUnits = new Set<string>();
        products.forEach(p => {
          if (p.unit && !dynamicUnits.includes(p.unit)) newUnits.add(p.unit);
        });
        if (newUnits.size > 0) {
          onUnitsChange([...dynamicUnits, ...Array.from(newUnits)]);
        }
      }
      onImport(products);
    }
    setDuplicateResults(null);
    setShowDuplicateWarning(false);
  };

  const handleImport = () => {
    const products = generatePasteProducts();
    if (products.length === 0) return;
    const result = checkDuplicates(products);
    if (result.duplicates.length > 0) {
      setDuplicateResults(result);
      setShowDuplicateWarning(true);
    } else {
      proceedImport(products);
    }
  };

  const previewProducts = useMemo(() => {
    if (pasteStep !== 3) return [];
    return generatePasteProducts().slice(0, 5);
  }, [pasteStep, pasteData, pasteAssignment, techSpecColumns]);

  const renderPasteStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {[1, 2, 3].map((step, i) => (
        <React.Fragment key={step}>
          <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm ${
            pasteStep >= step ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
          }`}>
            {pasteStep > step ? <CheckCircle className="w-5 h-5" /> : step}
          </div>
          {i < 2 && (
            <div className={`w-16 h-1 mx-2 ${pasteStep > step ? 'bg-blue-600' : 'bg-slate-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  const renderPasteStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-slate-800">Paste Product Data</h3>
        <p className="text-sm text-slate-500 mt-1">Copy columns from Excel and paste them into the fields below (one value per line)</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> In Excel, select a column and press Ctrl+C (or Cmd+C on Mac) to copy. Then paste here.
          Each row becomes one product. Make sure all columns have the same number of rows.
        </p>
      </div>

      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
        {PASTE_FIELDS.map(field => (
          <div key={field.key} className="bg-white rounded-xl border border-slate-200 p-4">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              {field.label}
              {field.required && <span className="text-red-500">*</span>}
            </label>
            <textarea
              rows={4}
              className="w-full mt-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none font-mono"
              placeholder={field.placeholder}
              value={pasteData[field.key] || ''}
              onChange={e => setPasteData(prev => ({ ...prev, [field.key]: e.target.value }))}
            />
            {pasteData[field.key] && (
              <p className="text-xs text-slate-500 mt-1">
                {pasteData[field.key].split('\n').filter(l => l.trim()).length} rows
              </p>
            )}
          </div>
        ))}

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-bold text-slate-700">Technical Specifications</label>
            <button type="button" onClick={addTechSpecColumn}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-all"
            >
              <Plus className="w-4 h-4" /> Add Specification
            </button>
          </div>

          {techSpecColumns.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No technical specifications added. Click "Add Specification" to add columns.</p>
          ) : (
            <div className="space-y-4">
              {techSpecColumns.map(col => (
                <div key={col.id} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="flex items-center gap-3 mb-3">
                    <input type="text" placeholder="Spec name (e.g., Thickness)"
                      className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                      value={col.name}
                      onChange={e => updateTechSpecColumn(col.id, 'name', e.target.value)}
                    />
                    <input type="text" placeholder="Unit (e.g., mm)"
                      className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                      value={col.unit}
                      onChange={e => updateTechSpecColumn(col.id, 'unit', e.target.value)}
                    />
                    <button type="button" onClick={() => removeTechSpecColumn(col.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea rows={3}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono resize-none"
                    placeholder={`Paste ${col.name || 'specification'} values here`}
                    value={col.data}
                    onChange={e => updateTechSpecColumn(col.id, 'data', e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {getPasteRowCount() > 0 && getRowCountMismatch().length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <CheckCircle className="w-6 h-6 text-green-500 mx-auto mb-1" />
          <p className="font-semibold text-green-800">{getPasteRowCount()} products detected</p>
        </div>
      )}

      {getRowCountMismatch().length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">Row count mismatch</p>
              <p className="text-sm text-red-600 mt-1">All columns must have the same number of rows as Product Name ({getPasteRowCount()} rows):</p>
              <ul className="text-sm text-red-600 mt-2 list-disc list-inside">
                {getRowCountMismatch().map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderPasteStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-slate-800">Assign Common Properties</h3>
        <p className="text-sm text-slate-500 mt-1">These values will be applied to all {getPasteRowCount()} products</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Supplier *</label>
          <select value={pasteAssignment.supplierId}
            onChange={e => setPasteAssignment(prev => ({ ...prev, supplierId: e.target.value }))}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">Select Supplier...</option>
            {suppliers.filter(s => s.isActive).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Taxonomy Node * (Any Depth)</label>
          <p className="text-xs text-slate-500">Select where these products belong in your taxonomy tree</p>
          <TaxonomyNodeSelector
            treeNodes={treeNodes}
            selectedNodeId={pasteAssignment.selectedNodeId || null}
            onSelect={(nodeId, path) => {
              setPasteAssignment(prev => ({
                ...prev,
                selectedNodeId: nodeId,
                selectedSector: path[0] || '',
                selectedCategory: path[1] || '',
                selectedSubcategory: path[2] || '',
              }));
            }}
            onClear={() => setPasteAssignment(prev => ({
              ...prev,
              selectedNodeId: '',
              selectedSector: '',
              selectedCategory: '',
              selectedSubcategory: '',
            }))}
            placeholder="Select taxonomy node at any depth..."
          />
        </div>

        {USAGE_AREAS.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Usage Areas</label>
            <p className="text-xs text-slate-500">Select the industries or applications for these products</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {USAGE_AREAS.map(area => {
                const isSelected = pasteAssignment.usageAreas.includes(area);
                return (
                  <button key={area} type="button" onClick={() => toggleUsageArea(area)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                      isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                    {area}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 pt-6">
          <h4 className="text-sm font-bold text-slate-700 mb-4">Product Details</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Brand Name</label>
              <input type="text" value={pasteAssignment.brandName}
                onChange={e => setPasteAssignment(prev => ({ ...prev, brandName: e.target.value }))}
                placeholder="Enter brand name"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Currency</label>
              <select value={pasteAssignment.currency}
                onChange={e => setPasteAssignment(prev => ({ ...prev, currency: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="JPY">JPY - Japanese Yen</option>
                <option value="CNY">CNY - Chinese Yuan</option>
                <option value="INR">INR - Indian Rupee</option>
                <option value="AUD">AUD - Australian Dollar</option>
                <option value="CAD">CAD - Canadian Dollar</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Default Unit</label>
              <select value={pasteAssignment.unit}
                onChange={e => setPasteAssignment(prev => ({ ...prev, unit: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {dynamicUnits.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <p className="text-xs text-slate-400">Per-product unit can be set in Step 1</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">MOQ (Minimum Order Quantity)</label>
              <input type="number" value={pasteAssignment.moq}
                onChange={e => setPasteAssignment(prev => ({ ...prev, moq: e.target.value }))}
                min="1" placeholder="1"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Lead Time (days)</label>
              <input type="number" value={pasteAssignment.leadTime}
                onChange={e => setPasteAssignment(prev => ({ ...prev, leadTime: e.target.value }))}
                min="0" placeholder="30"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Default Packaging Type</label>
              <input type="text" value={pasteAssignment.packagingType}
                onChange={e => setPasteAssignment(prev => ({ ...prev, packagingType: e.target.value }))}
                placeholder="Box, Pallet, etc."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-xs text-slate-400">Per-product packing can be set in Step 1</p>
            </div>
          </div>
        </div>
      </div>

      {!canProceedPasteStep2() && (
        <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>Please select a Supplier and Taxonomy Node to continue</p>
        </div>
      )}
    </div>
  );

  const renderPasteStep3 = () => {
    const products = generatePasteProducts();
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-bold text-slate-800">Review & Import</h3>
          <p className="text-sm text-slate-500 mt-1">Verify your products before importing</p>
        </div>

        {products.length > 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="font-bold text-green-800">{products.length} products ready to import</p>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="font-bold text-red-800">No valid products found</p>
          </div>
        )}

        {previewProducts.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-bold text-slate-700">Preview (first 5 products)</h4>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold text-slate-600 text-xs">Name</th>
                    <th className="text-left px-3 py-2 font-bold text-slate-600 text-xs">Brand</th>
                    <th className="text-left px-3 py-2 font-bold text-slate-600 text-xs">Category</th>
                    <th className="text-left px-3 py-2 font-bold text-slate-600 text-xs">Price</th>
                    <th className="text-left px-3 py-2 font-bold text-slate-600 text-xs">Unit</th>
                    <th className="text-left px-3 py-2 font-bold text-slate-600 text-xs">Packing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewProducts.map((p, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-slate-800 text-sm">{p.name}</td>
                      <td className="px-3 py-2 text-slate-600 text-sm">{p.manufacturer || '-'}</td>
                      <td className="px-3 py-2 text-slate-600 text-sm">{p.category || '-'}</td>
                      <td className="px-3 py-2 text-slate-600 text-sm">{p.currency} {p.price}</td>
                      <td className="px-3 py-2 text-slate-600 text-sm">{p.unit || '-'}</td>
                      <td className="px-3 py-2 text-slate-600 text-sm">{p.packagingType || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto">
      {showDuplicateWarning && duplicateResults && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Duplicates Detected</h3>
                  <p className="text-sm text-slate-500">
                    {duplicateResults.duplicates.length} duplicate{duplicateResults.duplicates.length > 1 ? 's' : ''} found (matched by product name + supplier)
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 max-h-[40vh] overflow-y-auto">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Duplicate Products (will be skipped)</p>
              <div className="space-y-1">
                {duplicateResults.duplicates.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                    <X className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <span className="text-sm text-red-700 font-medium truncate">{p.name}</span>
                    <span className="text-xs text-red-400 flex-shrink-0">({p.supplier})</span>
                  </div>
                ))}
              </div>
              {duplicateResults.unique.length > 0 && (
                <>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 mt-4">New Products ({duplicateResults.unique.length})</p>
                  <div className="space-y-1">
                    {duplicateResults.unique.slice(0, 10).map((p, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                        <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        <span className="text-sm text-emerald-700 font-medium truncate">{p.name}</span>
                        <span className="text-xs text-emerald-400 flex-shrink-0">({p.supplier})</span>
                      </div>
                    ))}
                    {duplicateResults.unique.length > 10 && (
                      <p className="text-xs text-slate-400 pl-3">...and {duplicateResults.unique.length - 10} more</p>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 flex gap-3">
              <button onClick={() => { setShowDuplicateWarning(false); setDuplicateResults(null); }}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              {duplicateResults.unique.length > 0 ? (
                <button onClick={() => proceedImport(duplicateResults.unique)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
                >
                  Skip Duplicates & Import {duplicateResults.unique.length} New
                </button>
              ) : (
                <div className="flex-1 px-4 py-2.5 text-sm font-semibold text-center text-amber-600 bg-amber-50 rounded-xl">
                  All products are duplicates — nothing to import
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardPaste className="w-5 h-5 text-blue-600" />
              <h2 className="text-2xl font-bold text-slate-800">Paste from Excel</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Step {pasteStep} of 3: {
                pasteStep === 1 ? 'Paste Data' :
                pasteStep === 2 ? 'Assign Properties' :
                'Review & Import'
              }
            </p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-8">
          {renderPasteStepIndicator()}
          {pasteStep === 1 && renderPasteStep1()}
          {pasteStep === 2 && renderPasteStep2()}
          {pasteStep === 3 && renderPasteStep3()}
        </div>

        <div className="p-6 border-t border-slate-200 flex items-center justify-between">
          <button type="button"
            onClick={pasteStep === 1 ? onCancel : () => setPasteStep(prev => (prev - 1) as 1 | 2 | 3)}
            className="flex items-center gap-2 px-6 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-all"
          >
            {pasteStep === 1 ? <>Cancel</> : <><ArrowLeft className="w-4 h-4" /> Back</>}
          </button>

          {pasteStep < 3 ? (
            <button type="button"
              onClick={() => setPasteStep(prev => (prev + 1) as 1 | 2 | 3)}
              disabled={
                (pasteStep === 1 && !canProceedPasteStep1()) ||
                (pasteStep === 2 && !canProceedPasteStep2())
              }
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button"
              onClick={handleImport}
              disabled={generatePasteProducts().length === 0}
              className="flex items-center gap-2 px-8 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle className="w-4 h-4" /> Import {generatePasteProducts().length} Products
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MassImportWizard;
