import React, { useState, useCallback, useMemo } from 'react';
import { Product, TreeNode, Supplier, TechnicalSpec } from '../types';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, ArrowLeft, ArrowRight, X, Loader2, MapPin, Settings, ClipboardPaste, Plus, Trash2, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { CURRENCIES, UNITS } from '../constants';

type ImportMode = 'file' | 'paste';

const PASTE_FIELDS = [
  { key: 'name', label: 'Product Name', required: true, placeholder: 'Paste product names here (one per line)' },
  { key: 'description', label: 'Description', required: false, placeholder: 'Paste descriptions here' },
  { key: 'price', label: 'Price', required: false, placeholder: 'Paste prices here' },
  { key: 'hsCode', label: 'HS Code', required: false, placeholder: 'HS codes' },
  { key: 'shelfLife', label: 'Shelf Life', required: false, placeholder: 'Shelf life info' },
  { key: 'storageConditions', label: 'Storage Conditions', required: false, placeholder: 'Storage requirements' },
];

interface MassImportWizardProps {
  onImport: (products: Product[]) => void;
  onCancel: () => void;
  treeNodes: TreeNode[];
  suppliers: Supplier[];
  usageAreas?: string[];
}

type WizardStep = 1 | 2 | 3 | 4;

interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  required: boolean;
  ignored: boolean;
}

interface ParsedData {
  headers: string[];
  rows: Record<string, string>[];
}

const PRODUCT_FIELDS = [
  { key: 'name', label: 'Product Name', required: true },
  { key: 'supplier', label: 'Supplier', required: true },
  { key: 'nodeId', label: 'Category (Node ID)', required: false },
  { key: 'manufacturer', label: 'Manufacturer Name', required: false },
  { key: 'manufacturingLocation', label: 'Manufacturing Location', required: false },
  { key: 'description', label: 'Description', required: false },
  { key: 'usageAreas', label: 'Usage Areas (comma-separated)', required: false },
  { key: 'price', label: 'Price', required: false },
  { key: 'currency', label: 'Currency', required: false },
  { key: 'unit', label: 'Unit', required: false },
  { key: 'moq', label: 'MOQ', required: false },
  { key: 'leadTime', label: 'Lead Time (days)', required: false },
  { key: 'packagingType', label: 'Packaging Type', required: false },
  { key: 'hsCode', label: 'HS Code', required: false },
  { key: 'shelfLife', label: 'Shelf Life', required: false },
  { key: 'storageConditions', label: 'Storage Conditions', required: false },
];

const MassImportWizard: React.FC<MassImportWizardProps> = ({ onImport, onCancel, treeNodes, suppliers, usageAreas = [] }) => {
  const USAGE_AREAS = usageAreas;
  const [importMode, setImportMode] = useState<ImportMode>('file');
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  
  const switchImportMode = (mode: ImportMode) => {
    setImportMode(mode);
    if (mode === 'file') {
      setPasteStep(1);
      setPasteData({});
      setTechSpecColumns([]);
      setPasteAssignment({
        selectedSector: '',
        selectedCategory: '',
        selectedSubcategory: '',
        supplierId: '',
        usageAreas: [],
        brandName: '',
        currency: 'USD',
        unit: 'piece',
        moq: '1',
        leadTime: '30',
        packagingType: '',
      });
    } else {
      setCurrentStep(1);
      setFile(null);
      setParsedData(null);
      setColumnMappings([]);
      setError(null);
    }
  };
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [defaults, setDefaults] = useState({
    supplier: '',
    nodeId: '',
    currency: 'USD',
    unit: 'piece',
    moq: 1,
    leadTime: 30,
  });

  // Paste mode state
  const [pasteData, setPasteData] = useState<Record<string, string>>({});
  const [techSpecColumns, setTechSpecColumns] = useState<{ id: string; name: string; unit: string; data: string }[]>([]);
  const [pasteStep, setPasteStep] = useState<1 | 2 | 3>(1);
  const [pasteAssignment, setPasteAssignment] = useState({
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

  const sectors = useMemo(() => treeNodes.filter(n => n.type === 'sector' && !n.parentId), [treeNodes]);
  const pasteCategories = useMemo(() => 
    treeNodes.filter(n => n.parentId === pasteAssignment.selectedSector), 
    [treeNodes, pasteAssignment.selectedSector]
  );
  const pasteSubcategories = useMemo(() => 
    treeNodes.filter(n => n.parentId === pasteAssignment.selectedCategory), 
    [treeNodes, pasteAssignment.selectedCategory]
  );

  const getFullNodePath = (nodeId: string): string => {
    const path: string[] = [];
    let current = treeNodes.find(n => n.id === nodeId);
    while (current) {
      path.unshift(current.name);
      current = treeNodes.find(n => n.id === current?.parentId);
    }
    return path.join(' > ');
  };

  const parseFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      
      if (extension === 'csv') {
        const text = await file.text();
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        
        if (result.errors.length > 0) {
          throw new Error(`CSV parsing error: ${result.errors[0].message}`);
        }
        
        if (!result.data || result.data.length === 0) {
          throw new Error('File is empty or has no valid data');
        }
        
        const headers = result.meta.fields || [];
        if (headers.length === 0) {
          throw new Error('No columns detected in file');
        }
        
        setParsedData({
          headers,
          rows: result.data as Record<string, string>[],
        });
        
        initializeColumnMappings(headers);
        
      } else if (extension === 'xls' || extension === 'xlsx') {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(firstSheet, { defval: '' });
        
        if (!jsonData || jsonData.length === 0) {
          throw new Error('File is empty or has no valid data');
        }
        
        const headers = Object.keys(jsonData[0] || {});
        if (headers.length === 0) {
          throw new Error('No columns detected in file');
        }
        
        setParsedData({
          headers,
          rows: jsonData,
        });
        
        initializeColumnMappings(headers);
        
      } else {
        throw new Error('Unsupported file format. Please upload CSV, XLS, or XLSX');
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
      setParsedData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const initializeColumnMappings = (headers: string[]) => {
    const mappings: ColumnMapping[] = headers.map(header => {
      const normalizedHeader = header.toLowerCase().trim();
      let targetField = '';
      
      if (normalizedHeader.includes('name') || normalizedHeader.includes('product')) {
        targetField = 'name';
      } else if (normalizedHeader.includes('supplier') || normalizedHeader.includes('vendor')) {
        targetField = 'supplier';
      } else if (normalizedHeader.includes('price') || normalizedHeader.includes('cost')) {
        targetField = 'price';
      } else if (normalizedHeader.includes('currency')) {
        targetField = 'currency';
      } else if (normalizedHeader.includes('description') || normalizedHeader.includes('desc')) {
        targetField = 'description';
      } else if (normalizedHeader.includes('moq') || normalizedHeader.includes('minimum')) {
        targetField = 'moq';
      } else if (normalizedHeader.includes('lead') && normalizedHeader.includes('time')) {
        targetField = 'leadTime';
      } else if (normalizedHeader.includes('manufacturer')) {
        targetField = 'manufacturer';
      } else if (normalizedHeader.includes('location')) {
        targetField = 'manufacturingLocation';
      } else if (normalizedHeader.includes('unit')) {
        targetField = 'unit';
      } else if (normalizedHeader.includes('hs') && normalizedHeader.includes('code')) {
        targetField = 'hsCode';
      } else if (normalizedHeader.includes('category') || normalizedHeader.includes('node')) {
        targetField = 'nodeId';
      }
      
      const fieldDef = PRODUCT_FIELDS.find(f => f.key === targetField);
      
      return {
        sourceColumn: header,
        targetField,
        required: fieldDef?.required || false,
        ignored: false,
      };
    });
    
    setColumnMappings(mappings);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseFile(selectedFile);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      parseFile(droppedFile);
    }
  }, [parseFile]);

  const updateMapping = (sourceColumn: string, field: keyof ColumnMapping, value: any) => {
    setColumnMappings(prev => prev.map(m => 
      m.sourceColumn === sourceColumn ? { ...m, [field]: value } : m
    ));
  };

  const getMappedRequiredFields = () => {
    return columnMappings
      .filter(m => !m.ignored && m.targetField)
      .map(m => m.targetField);
  };

  const getUnmappedRequiredFields = () => {
    const mapped = getMappedRequiredFields();
    return PRODUCT_FIELDS.filter(f => f.required && !mapped.includes(f.key));
  };

  const canProceedToStep2 = parsedData && parsedData.headers.length > 0;
  
  const isProductNameMapped = () => {
    return columnMappings.some(m => !m.ignored && m.targetField === 'name');
  };
  
  const canProceedToStep3 = () => {
    if (!isProductNameMapped()) return false;
    
    const unmapped = getUnmappedRequiredFields();
    return unmapped.length === 0 || unmapped.every(f => {
      if (f.key === 'name') return false;
      if (f.key === 'supplier') return true;
      return true;
    });
  };
  
  const canProceedToStep4 = () => {
    if (!isProductNameMapped()) return false;
    
    const unmapped = getUnmappedRequiredFields();
    const isSupplierMapped = columnMappings.some(m => !m.ignored && m.targetField === 'supplier');
    
    if (!isSupplierMapped && !defaults.supplier) return false;
    
    return true;
  };

  const generateProducts = (): Product[] => {
    if (!parsedData) return [];
    
    const products: Product[] = [];
    
    parsedData.rows.forEach((row, index) => {
      const product: Partial<Product> = {
        id: `PRD-${Date.now()}-${index}`,
        dateAdded: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        history: [],
        technicalSpecs: [],
        customFields: [],
        certifications: [],
      };
      
      columnMappings.forEach(mapping => {
        if (mapping.ignored || !mapping.targetField) return;
        
        const value = row[mapping.sourceColumn];
        if (value === undefined || value === '') return;
        
        switch (mapping.targetField) {
          case 'price':
          case 'moq':
          case 'leadTime':
            (product as any)[mapping.targetField] = parseFloat(value) || 0;
            break;
          default:
            (product as any)[mapping.targetField] = String(value).trim();
        }
      });
      
      if (!product.name) return;
      
      if (!product.supplier && defaults.supplier) {
        const supplier = suppliers.find(s => s.id === defaults.supplier);
        product.supplier = supplier?.name || '';
        product.supplierId = defaults.supplier;
      } else if (product.supplier) {
        const supplier = suppliers.find(s => 
          s.name.toLowerCase() === (product.supplier as string).toLowerCase()
        );
        if (supplier) {
          product.supplierId = supplier.id;
        }
      }
      
      if (!product.nodeId && defaults.nodeId) {
        product.nodeId = defaults.nodeId;
      }
      
      if (!product.currency) product.currency = defaults.currency;
      if (!product.unit) product.unit = defaults.unit;
      if (!product.moq) product.moq = defaults.moq;
      if (!product.leadTime) product.leadTime = defaults.leadTime;
      if (!product.price) product.price = 0;
      
      if (product.nodeId) {
        const node = treeNodes.find(n => n.id === product.nodeId);
        if (node) {
          product.category = node.name;
          let current: TreeNode | undefined = node;
          while (current && current.parentId) {
            const parent = treeNodes.find(n => n.id === current!.parentId);
            if (!parent) break;
            current = parent;
          }
          product.sector = current?.name || '';
        }
      }
      
      if ((product as any).usageAreas) {
        const usageAreasValue = String((product as any).usageAreas).trim();
        if (usageAreasValue) {
          product.customFields = [
            ...(product.customFields || []),
            { fieldId: 'usage_areas', value: usageAreasValue }
          ];
        }
        delete (product as any).usageAreas;
      }
      
      products.push(product as Product);
    });
    
    return products;
  };

  const generatePasteProducts = (): Product[] => {
    const nameLines = (pasteData['name'] || '').split('\n').filter(line => line.trim());
    if (nameLines.length === 0) return [];

    const products: Product[] = [];
    const supplier = suppliers.find(s => s.id === pasteAssignment.supplierId);
    const nodeId = pasteAssignment.selectedSubcategory || pasteAssignment.selectedCategory || pasteAssignment.selectedSector;
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
        if (parent.type === 'sector') {
          sectorName = parent.name;
          break;
        }
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
        .map(col => {
          const lines = col.data.split('\n');
          return {
            id: `${col.id}-${index}`,
            name: col.name.trim(),
            value: (lines[index] || '').trim(),
            unit: col.unit.trim(),
          };
        });

      const customFields: { fieldId: string; value: string }[] = [];
      if (pasteAssignment.usageAreas.length > 0) {
        customFields.push({ fieldId: 'usage_areas', value: pasteAssignment.usageAreas.join(', ') });
      }

      const product: Product = {
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
        currency: pasteAssignment.currency || 'USD',
        unit: pasteAssignment.unit || 'piece',
        moq: parseInt(pasteAssignment.moq) || 1,
        leadTime: parseInt(pasteAssignment.leadTime) || 30,
        packagingType: pasteAssignment.packagingType,
        certifications: [],
        shelfLife: getFieldValue('shelfLife'),
        storageConditions: getFieldValue('storageConditions'),
        customFields,
        technicalSpecs,
        dateAdded: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        createdBy: 'Import',
        history: [],
      };

      products.push(product);
    });

    return products;
  };

  const handleImport = () => {
    const products = importMode === 'paste' ? generatePasteProducts() : generateProducts();
    if (products.length > 0) {
      onImport(products);
    }
  };

  const previewProducts = useMemo(() => {
    if (importMode === 'paste') {
      if (pasteStep !== 3) return [];
      return generatePasteProducts().slice(0, 5);
    }
    if (currentStep !== 4) return [];
    return generateProducts().slice(0, 5);
  }, [currentStep, pasteStep, importMode, parsedData, columnMappings, defaults, pasteData, pasteAssignment, techSpecColumns]);

  // Paste mode functions
  const addTechSpecColumn = () => {
    setTechSpecColumns(prev => [...prev, { 
      id: `spec-${Date.now()}`, 
      name: '', 
      unit: '', 
      data: '' 
    }]);
  };

  const updateTechSpecColumn = (id: string, field: 'name' | 'unit' | 'data', value: string) => {
    setTechSpecColumns(prev => prev.map(col => 
      col.id === id ? { ...col, [field]: value } : col
    ));
  };

  const removeTechSpecColumn = (id: string) => {
    setTechSpecColumns(prev => prev.filter(col => col.id !== id));
  };

  const getPasteRowCount = (): number => {
    const nameData = pasteData['name'] || '';
    const lines = nameData.split('\n').filter(line => line.trim());
    return lines.length;
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

  const canProceedPasteStep1 = (): boolean => {
    return getPasteRowCount() > 0 && getRowCountMismatch().length === 0;
  };

  const canProceedPasteStep2 = (): boolean => {
    return pasteAssignment.supplierId !== '' && pasteAssignment.selectedSector !== '';
  };

  const toggleUsageArea = (area: string) => {
    setPasteAssignment(prev => ({
      ...prev,
      usageAreas: prev.usageAreas.includes(area)
        ? prev.usageAreas.filter(a => a !== area)
        : [...prev.usageAreas, area]
    }));
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {[1, 2, 3, 4].map((step, i) => (
        <React.Fragment key={step}>
          <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm ${
            currentStep >= step 
              ? 'bg-blue-600 text-white' 
              : 'bg-slate-200 text-slate-500'
          }`}>
            {currentStep > step ? <CheckCircle className="w-5 h-5" /> : step}
          </div>
          {i < 3 && (
            <div className={`w-16 h-1 mx-2 ${
              currentStep > step ? 'bg-blue-600' : 'bg-slate-200'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-slate-800">Upload Your Product File</h3>
        <p className="text-sm text-slate-500 mt-1">Supported formats: CSV, XLS, XLSX</p>
      </div>
      
      <div
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
          file ? 'border-green-400 bg-green-50' : 'border-slate-300 hover:border-blue-400 bg-slate-50'
        }`}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            <p className="text-slate-600">Parsing file...</p>
          </div>
        ) : file && parsedData ? (
          <div className="flex flex-col items-center gap-3">
            <FileSpreadsheet className="w-12 h-12 text-green-500" />
            <div>
              <p className="font-semibold text-slate-800">{file.name}</p>
              <p className="text-sm text-slate-500">
                {parsedData.headers.length} columns, {parsedData.rows.length} rows detected
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setFile(null); setParsedData(null); setError(null); }}
              className="text-sm text-red-500 hover:text-red-600"
            >
              Remove file
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="w-12 h-12 text-slate-400" />
            <div>
              <p className="text-slate-600">Drag and drop your file here, or</p>
              <label className="cursor-pointer text-blue-600 hover:text-blue-700 font-semibold">
                browse to upload
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}
      </div>
      
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-slate-800">Map Your Columns</h3>
        <p className="text-sm text-slate-500 mt-1">Match your file columns to product fields</p>
      </div>
      
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <div className="grid grid-cols-3 gap-4 text-xs font-bold text-slate-500 uppercase mb-3 px-2">
          <span>Source Column</span>
          <span>Map To Field</span>
          <span>Status</span>
        </div>
        
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {columnMappings.map(mapping => (
            <div key={mapping.sourceColumn} className={`grid grid-cols-3 gap-4 items-center p-3 rounded-xl ${
              mapping.ignored ? 'bg-slate-100 opacity-60' : 'bg-white'
            } border border-slate-200`}>
              <div className="font-medium text-slate-800 truncate" title={mapping.sourceColumn}>
                {mapping.sourceColumn}
              </div>
              
              <select
                value={mapping.targetField}
                onChange={e => updateMapping(mapping.sourceColumn, 'targetField', e.target.value)}
                disabled={mapping.ignored}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">-- Select Field --</option>
                {PRODUCT_FIELDS.map(field => (
                  <option key={field.key} value={field.key}>
                    {field.label} {field.required ? '*' : ''}
                  </option>
                ))}
              </select>
              
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={mapping.ignored}
                    onChange={e => updateMapping(mapping.sourceColumn, 'ignored', e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span className="text-slate-600">Ignore</span>
                </label>
                {mapping.targetField && !mapping.ignored && (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {!isProductNameMapped() && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Product Name must be mapped</p>
            <p className="text-sm">Please map a column to "Product Name" to continue. This field is required and cannot have a default value.</p>
          </div>
        </div>
      )}
      
      {isProductNameMapped() && getUnmappedRequiredFields().filter(f => f.key !== 'name').length > 0 && (
        <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Required fields not mapped:</p>
            <p className="text-sm">{getUnmappedRequiredFields().filter(f => f.key !== 'name').map(f => f.label).join(', ')}</p>
            <p className="text-sm mt-1">You can set default values in the next step.</p>
          </div>
        </div>
      )}
    </div>
  );

  const renderStep3 = () => {
    const unmappedRequired = getUnmappedRequiredFields();
    
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-bold text-slate-800">Complete Required Fields</h3>
          <p className="text-sm text-slate-500 mt-1">Set default values for missing required information</p>
        </div>
        
        <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-6">
          {unmappedRequired.some(f => f.key === 'supplier') && (
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Default Supplier *</label>
              <select
                value={defaults.supplier}
                onChange={e => setDefaults({...defaults, supplier: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Select Supplier...</option>
                {suppliers.filter(s => s.isActive).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Default Category</label>
            <select
              value={defaults.nodeId}
              onChange={e => setDefaults({...defaults, nodeId: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select Category...</option>
              {treeNodes.map(node => (
                <option key={node.id} value={node.id}>
                  {getFullNodePath(node.id)}
                </option>
              ))}
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Default Currency</label>
              <select
                value={defaults.currency}
                onChange={e => setDefaults({...defaults, currency: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Default Unit</label>
              <select
                value={defaults.unit}
                onChange={e => setDefaults({...defaults, unit: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Default MOQ</label>
              <input
                type="number"
                value={defaults.moq}
                onChange={e => setDefaults({...defaults, moq: parseInt(e.target.value) || 1})}
                min={1}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Default Lead Time (days)</label>
              <input
                type="number"
                value={defaults.leadTime}
                onChange={e => setDefaults({...defaults, leadTime: parseInt(e.target.value) || 0})}
                min={0}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStep4 = () => {
    const totalProducts = generateProducts().length;
    
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-bold text-slate-800">Review & Import</h3>
          <p className="text-sm text-slate-500 mt-1">Preview your products before importing</p>
        </div>
        
        {totalProducts > 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="font-bold text-green-800">{totalProducts} products ready to import</p>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="font-bold text-red-800">No valid products found</p>
            <p className="text-sm text-red-600 mt-1">Please go back and ensure the Product Name column is correctly mapped with valid data.</p>
          </div>
        )}
        
        {previewProducts.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-bold text-slate-700">Preview (first 5 products)</h4>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-bold text-slate-600">Name</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-600">Supplier</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-600">Category</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-600">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewProducts.map((p, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                      <td className="px-4 py-3 text-slate-600">{p.supplier}</td>
                      <td className="px-4 py-3 text-slate-600">{p.category || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{p.currency} {p.price}</td>
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

  // Paste mode render functions
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
            <button
              type="button"
              onClick={addTechSpecColumn}
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
                    <input
                      type="text"
                      placeholder="Spec name (e.g., Thickness)"
                      className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                      value={col.name}
                      onChange={e => updateTechSpecColumn(col.id, 'name', e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Unit (e.g., mm)"
                      className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                      value={col.unit}
                      onChange={e => updateTechSpecColumn(col.id, 'unit', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeTechSpecColumn(col.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    rows={3}
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
                {getRowCountMismatch().map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
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
          <select
            value={pasteAssignment.supplierId}
            onChange={e => setPasteAssignment(prev => ({ ...prev, supplierId: e.target.value }))}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">Select Supplier...</option>
            {suppliers.filter(s => s.isActive).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Sector *</label>
            <select
              value={pasteAssignment.selectedSector}
              onChange={e => setPasteAssignment(prev => ({ 
                ...prev, 
                selectedSector: e.target.value,
                selectedCategory: '',
                selectedSubcategory: ''
              }))}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select Sector...</option>
              {sectors.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Category</label>
            <select
              value={pasteAssignment.selectedCategory}
              onChange={e => setPasteAssignment(prev => ({ 
                ...prev, 
                selectedCategory: e.target.value,
                selectedSubcategory: ''
              }))}
              disabled={!pasteAssignment.selectedSector}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
            >
              <option value="">Select Category...</option>
              {pasteCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Sub-Category</label>
            <select
              value={pasteAssignment.selectedSubcategory}
              onChange={e => setPasteAssignment(prev => ({ ...prev, selectedSubcategory: e.target.value }))}
              disabled={!pasteAssignment.selectedCategory}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
            >
              <option value="">Select Sub-Category...</option>
              {pasteSubcategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Usage Areas</label>
          <p className="text-xs text-slate-500">Select the industries or applications for these products</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {USAGE_AREAS.map(area => {
              const isSelected = pasteAssignment.usageAreas.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => toggleUsageArea(area)}
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
        </div>

        <div className="border-t border-slate-200 pt-6">
          <h4 className="text-sm font-bold text-slate-700 mb-4">Product Details</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Brand Name</label>
              <input
                type="text"
                value={pasteAssignment.brandName}
                onChange={e => setPasteAssignment(prev => ({ ...prev, brandName: e.target.value }))}
                placeholder="Enter brand name"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Currency</label>
              <select
                value={pasteAssignment.currency}
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
              <label className="text-sm font-medium text-slate-600">Unit</label>
              <select
                value={pasteAssignment.unit}
                onChange={e => setPasteAssignment(prev => ({ ...prev, unit: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="piece">Piece</option>
                <option value="kg">Kilogram (kg)</option>
                <option value="g">Gram (g)</option>
                <option value="lb">Pound (lb)</option>
                <option value="oz">Ounce (oz)</option>
                <option value="m">Meter (m)</option>
                <option value="cm">Centimeter (cm)</option>
                <option value="ft">Foot (ft)</option>
                <option value="in">Inch (in)</option>
                <option value="l">Liter (l)</option>
                <option value="ml">Milliliter (ml)</option>
                <option value="gal">Gallon (gal)</option>
                <option value="box">Box</option>
                <option value="case">Case</option>
                <option value="pallet">Pallet</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">MOQ (Minimum Order Quantity)</label>
              <input
                type="number"
                value={pasteAssignment.moq}
                onChange={e => setPasteAssignment(prev => ({ ...prev, moq: e.target.value }))}
                min="1"
                placeholder="1"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Lead Time (days)</label>
              <input
                type="number"
                value={pasteAssignment.leadTime}
                onChange={e => setPasteAssignment(prev => ({ ...prev, leadTime: e.target.value }))}
                min="0"
                placeholder="30"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Packaging Type</label>
              <input
                type="text"
                value={pasteAssignment.packagingType}
                onChange={e => setPasteAssignment(prev => ({ ...prev, packagingType: e.target.value }))}
                placeholder="Box, Pallet, etc."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {!canProceedPasteStep2() && (
        <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>Please select a Supplier and Sector to continue</p>
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
                    <th className="text-left px-4 py-3 font-bold text-slate-600">Name</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-600">Brand</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-600">Category</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-600">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewProducts.map((p, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                      <td className="px-4 py-3 text-slate-600">{p.manufacturer || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{p.category || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{p.currency} {p.price}</td>
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

  const renderImportModeSelector = () => (
    <div className="flex gap-2 mb-6">
      <button
        type="button"
        onClick={() => switchImportMode('file')}
        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
          importMode === 'file'
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
      >
        <Upload className="w-4 h-4" /> Upload File
      </button>
      <button
        type="button"
        onClick={() => switchImportMode('paste')}
        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
          importMode === 'paste'
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
      >
        <ClipboardPaste className="w-4 h-4" /> Paste from Excel
      </button>
    </div>
  );

  const renderPasteStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {[1, 2, 3].map((step, i) => (
        <React.Fragment key={step}>
          <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm ${
            pasteStep >= step 
              ? 'bg-blue-600 text-white' 
              : 'bg-slate-200 text-slate-500'
          }`}>
            {pasteStep > step ? <CheckCircle className="w-5 h-5" /> : step}
          </div>
          {i < 2 && (
            <div className={`w-16 h-1 mx-2 ${
              pasteStep > step ? 'bg-blue-600' : 'bg-slate-200'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Mass Product Import</h2>
            <p className="text-sm text-slate-500">
              {importMode === 'paste' ? (
                `Step ${pasteStep} of 3: ${
                  pasteStep === 1 ? 'Paste Data' :
                  pasteStep === 2 ? 'Assign Properties' :
                  'Review & Import'
                }`
              ) : (
                `Step ${currentStep} of 4: ${
                  currentStep === 1 ? 'Upload File' :
                  currentStep === 2 ? 'Map Columns' :
                  currentStep === 3 ? 'Complete Fields' :
                  'Review & Import'
                }`
              )}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        
        <div className="p-8">
          {renderImportModeSelector()}
          
          {importMode === 'file' ? (
            <>
              {renderStepIndicator()}
              {currentStep === 1 && renderStep1()}
              {currentStep === 2 && renderStep2()}
              {currentStep === 3 && renderStep3()}
              {currentStep === 4 && renderStep4()}
            </>
          ) : (
            <>
              {renderPasteStepIndicator()}
              {pasteStep === 1 && renderPasteStep1()}
              {pasteStep === 2 && renderPasteStep2()}
              {pasteStep === 3 && renderPasteStep3()}
            </>
          )}
        </div>
        
        <div className="p-6 border-t border-slate-200 flex items-center justify-between">
          {importMode === 'file' ? (
            <>
              <button
                type="button"
                onClick={currentStep === 1 ? onCancel : () => setCurrentStep(prev => (prev - 1) as WizardStep)}
                className="flex items-center gap-2 px-6 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-all"
              >
                {currentStep === 1 ? (
                  <>Cancel</>
                ) : (
                  <><ArrowLeft className="w-4 h-4" /> Back</>
                )}
              </button>
              
              {currentStep < 4 ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep(prev => (prev + 1) as WizardStep)}
                  disabled={
                    (currentStep === 1 && !canProceedToStep2) ||
                    (currentStep === 2 && !canProceedToStep3()) ||
                    (currentStep === 3 && !canProceedToStep4())
                  }
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={generateProducts().length === 0}
                  className="flex items-center gap-2 px-8 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-4 h-4" /> Import {generateProducts().length} Products
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={pasteStep === 1 ? onCancel : () => setPasteStep(prev => (prev - 1) as 1 | 2 | 3)}
                className="flex items-center gap-2 px-6 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-all"
              >
                {pasteStep === 1 ? (
                  <>Cancel</>
                ) : (
                  <><ArrowLeft className="w-4 h-4" /> Back</>
                )}
              </button>
              
              {pasteStep < 3 ? (
                <button
                  type="button"
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
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={generatePasteProducts().length === 0}
                  className="flex items-center gap-2 px-8 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-4 h-4" /> Import {generatePasteProducts().length} Products
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MassImportWizard;
