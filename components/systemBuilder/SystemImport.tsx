import React, { useState, useRef } from 'react';
import { Product } from '../../types';
import { systemsApi } from '../../client/api';
import { Upload, FileJson, FileSpreadsheet, AlertCircle, Check, X, FileUp } from 'lucide-react';

interface SystemImportProps {
  products: Product[];
  onImportComplete: () => void;
}

interface ImportPreview {
  name: string;
  description?: string;
  typicalUses?: string;
  layers: { layerName: string; order: number; products: { productId: string; benefit?: string; isDefault?: boolean; productName?: string }[] }[];
  warnings: string[];
  errors: string[];
}

const SystemImport: React.FC<SystemImportProps> = ({ products, onImportComplete }) => {
  const [importMode, setImportMode] = useState<'json' | 'manual'>('json');
  const [jsonInput, setJsonInput] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndPreview = (data: any) => {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!data.name || typeof data.name !== 'string') {
      errors.push('System name is required');
    }

    const layers = (data.layers || []).map((layer: any, idx: number) => {
      const layerName = layer.layerName || layer.name || `Layer ${idx + 1}`;
      const layerProducts = (layer.products || []).map((prod: any) => {
        const productId = prod.productId || prod.id;
        const existing = products.find(p => p.id === productId);
        if (!existing) {
          warnings.push(`Product "${productId}" in layer "${layerName}" not found in inventory`);
        }
        return {
          productId,
          benefit: prod.benefit || '',
          isDefault: prod.isDefault || false,
          productName: existing?.name || productId,
        };
      });

      if (layerProducts.length === 0) {
        warnings.push(`Layer "${layerName}" has no products assigned`);
      }

      return {
        layerName,
        order: layer.orderSequence ?? layer.order ?? idx,
        products: layerProducts,
      };
    });

    if (layers.length === 0) {
      warnings.push('No layers defined in import data');
    }

    setPreview({
      name: data.name || '',
      description: data.description,
      typicalUses: data.typicalUses,
      layers,
      warnings,
      errors,
    });
  };

  const handleJsonParse = () => {
    try {
      const data = JSON.parse(jsonInput);
      validateAndPreview(data);
    } catch (e) {
      setPreview({
        name: '',
        layers: [],
        warnings: [],
        errors: ['Invalid JSON format. Please check your input.'],
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (file.name.endsWith('.json')) {
          const data = JSON.parse(text);
          setJsonInput(JSON.stringify(data, null, 2));
          validateAndPreview(data);
        } else if (file.name.endsWith('.csv')) {
          const lines = text.split('\n').filter(l => l.trim());
          if (lines.length < 2) {
            setPreview({ name: '', layers: [], warnings: [], errors: ['CSV file is empty or has no data rows'] });
            return;
          }
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          const firstRowValues = lines[1].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const sysIdx = headers.indexOf('System');
          const systemName = sysIdx >= 0 && firstRowValues[sysIdx] ? firstRowValues[sysIdx] : `Imported System - ${new Date().toLocaleString()}`;
          const layerMap: Record<string, { products: any[] }> = {};

          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const layerName = values[headers.indexOf('Layer')] || `Layer ${i}`;
            const productName = values[headers.indexOf('Product')] || '';
            if (!layerMap[layerName]) layerMap[layerName] = { products: [] };

            if (productName) {
              const matchedProduct = products.find(p => 
                p.name.toLowerCase() === productName.toLowerCase() ||
                p.stockCode === values[headers.indexOf('Stock Code')]
              );
              layerMap[layerName].products.push({
                productId: matchedProduct?.id || productName,
                benefit: values[headers.indexOf('Benefit')] || '',
                isDefault: values[headers.indexOf('Default')]?.toLowerCase() === 'yes',
                productName: matchedProduct?.name || productName,
              });
            }
          }

          const importData = {
            name: systemName,
            layers: Object.entries(layerMap).map(([name, data], idx) => ({
              layerName: name,
              order: idx,
              products: data.products,
            })),
          };

          setJsonInput(JSON.stringify(importData, null, 2));
          validateAndPreview(importData);
        }
      } catch (err) {
        setPreview({ name: '', layers: [], warnings: [], errors: ['Failed to parse file'] });
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!preview || preview.errors.length > 0) return;
    setImporting(true);
    try {
      const importData = {
        name: preview.name,
        description: preview.description,
        typicalUses: preview.typicalUses,
        layers: preview.layers.map(l => ({
          layerName: l.layerName,
          orderSequence: l.order,
          products: l.products.map(p => ({
            productId: p.productId,
            benefit: p.benefit,
            isDefault: p.isDefault,
          })),
        })),
      };

      await systemsApi.importSystem(importData);
      setImportResult({ success: true, message: `System "${preview.name}" imported successfully` });
      setPreview(null);
      setJsonInput('');
      onImportComplete();
    } catch (err) {
      setImportResult({ success: false, message: 'Failed to import system' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-1">Import System</h2>
        <p className="text-sm text-slate-500">Import system specifications from JSON or CSV files</p>
      </div>

      {importResult && (
        <div className={`flex items-center gap-2 p-3 rounded-lg ${importResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {importResult.success ? <Check size={16} /> : <AlertCircle size={16} />}
          <span className="text-sm">{importResult.message}</span>
          <button onClick={() => setImportResult(null)} className="ml-auto p-1 hover:bg-white/50 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
        >
          <FileUp size={32} className="mx-auto mb-3 text-slate-400" />
          <p className="text-sm font-medium text-slate-600">Drop or click to upload</p>
          <p className="text-xs text-slate-400 mt-1">Supports .json and .csv files</p>
          <input ref={fileInputRef} type="file" accept=".json,.csv" onChange={handleFileUpload} className="hidden" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-semibold text-slate-700">Or paste JSON directly</label>
          <button onClick={handleJsonParse} disabled={!jsonInput.trim()} className="text-xs px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
            Parse & Preview
          </button>
        </div>
        <textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          placeholder='{"name": "Epoxy Floor System", "layers": [{"layerName": "Primer", "products": [{"productId": "...", "benefit": "Adhesion"}]}]}'
          className="w-full h-40 px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
        />
      </div>

      {preview && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-700">Import Preview</h3>
          </div>

          {preview.errors.length > 0 && (
            <div className="px-4 py-3 bg-red-50 border-b border-red-100">
              {preview.errors.map((err, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle size={14} /> {err}
                </div>
              ))}
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
              {preview.warnings.map((warn, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertCircle size={14} /> {warn}
                </div>
              ))}
            </div>
          )}

          <div className="p-4">
            <div className="mb-3">
              <span className="text-xs text-slate-500">System Name:</span>
              <span className="text-sm font-semibold text-slate-700 ml-2">{preview.name}</span>
            </div>
            {preview.description && (
              <div className="mb-3">
                <span className="text-xs text-slate-500">Description:</span>
                <span className="text-sm text-slate-600 ml-2">{preview.description}</span>
              </div>
            )}

            <div className="space-y-2">
              {preview.layers.map((layer, idx) => (
                <div key={idx} className="border border-slate-100 rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">{idx + 1}</span>
                    <span className="text-sm font-medium text-slate-700">{layer.layerName}</span>
                    <span className="text-xs text-slate-400">{layer.products.length} product(s)</span>
                  </div>
                  {layer.products.length > 0 && (
                    <div className="ml-7 mt-1 space-y-0.5">
                      {layer.products.map((prod, pidx) => (
                        <div key={pidx} className="text-xs text-slate-500">
                          {prod.productName} {prod.benefit && <span className="text-emerald-600">({prod.benefit})</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
            <button onClick={() => { setPreview(null); setJsonInput(''); }} className="px-3 py-1.5 text-sm bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={preview.errors.length > 0 || importing}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {importing ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Upload size={14} />}
              Import System
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemImport;
