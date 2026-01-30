import React, { useState, useMemo, useCallback, useRef } from 'react';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { Product, TreeNode, Supplier, CustomField } from '../../types';
import NivoChartWrapper, { nivoTheme, CHART_COLORS } from '../charts/NivoChartWrapper';
import { Filter, X, Download, ChevronDown, ChevronUp, Layers } from 'lucide-react';

interface ProductUsageHeatmapProps {
  products: Product[];
  treeNodes: TreeNode[];
  suppliers: Supplier[];
  customFields: CustomField[];
  onCellClick?: (categoryId: string, usageArea: string, products: Product[]) => void;
}

interface HeatmapDataPoint {
  x: string;
  y: number;
  meta: {
    products: Product[];
    suppliers: Set<string>;
    manufacturers: Set<string>;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    certifications: string[];
  };
}

interface HeatmapSeriesData {
  id: string;
  categoryId: string;
  data: HeatmapDataPoint[];
}

interface DrillDownData {
  category: string;
  usageArea: string;
  products: Product[];
}

const DEFAULT_USAGE_AREAS = [
  'Industrial',
  'Commercial',
  'Residential',
  'Infrastructure',
  'Food & Beverage',
  'Healthcare',
  'Parking',
  'Sports'
];

const ProductUsageHeatmap: React.FC<ProductUsageHeatmapProps> = ({
  products,
  treeNodes,
  suppliers,
  customFields,
  onCellClick
}) => {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedUsageAreas, setSelectedUsageAreas] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedManufacturers, setSelectedManufacturers] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<{ min: string; max: string }>({ min: '', max: '' });
  const [categoryLevel, setCategoryLevel] = useState<'sector' | 'category' | 'subcategory' | 'group'>('category');
  const [showFilters, setShowFilters] = useState(true);
  const [drillDown, setDrillDown] = useState<DrillDownData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allUsageAreas = useMemo(() => {
    const areas = new Set<string>(DEFAULT_USAGE_AREAS);
    products.forEach(p => {
      const usageField = p.customFields?.find(cf => 
        cf.fieldId.toLowerCase().includes('usage') || 
        cf.fieldId.toLowerCase().includes('application') ||
        cf.fieldId.toLowerCase().includes('industry')
      );
      if (usageField?.value) {
        const values = String(usageField.value).split(',').map(v => v.trim());
        values.forEach(v => areas.add(v));
      }
    });
    return Array.from(areas).sort();
  }, [products]);

  const allManufacturers = useMemo(() => {
    const manufacturers = new Set<string>();
    products.forEach(p => {
      if (p.manufacturer) manufacturers.add(p.manufacturer);
    });
    return Array.from(manufacturers).sort();
  }, [products]);

  const categoriesByLevel = useMemo(() => {
    return treeNodes.filter(n => n.type === categoryLevel);
  }, [treeNodes, categoryLevel]);

  const getProductUsageAreas = useCallback((product: Product): string[] => {
    const usageField = product.customFields?.find(cf => 
      cf.fieldId.toLowerCase().includes('usage') || 
      cf.fieldId.toLowerCase().includes('application') ||
      cf.fieldId.toLowerCase().includes('industry')
    );
    if (usageField?.value) {
      return String(usageField.value).split(',').map(v => v.trim());
    }
    return DEFAULT_USAGE_AREAS.slice(0, 2);
  }, []);

  const getProductCategory = useCallback((product: Product): TreeNode | undefined => {
    const findCategoryAtLevel = (nodeId: string): TreeNode | undefined => {
      const node = treeNodes.find(n => n.id === nodeId);
      if (!node) return undefined;
      if (node.type === categoryLevel) return node;
      if (node.parentId) return findCategoryAtLevel(node.parentId);
      return undefined;
    };
    if (product.nodeId) {
      const node = treeNodes.find(n => n.id === product.nodeId);
      if (node) return findCategoryAtLevel(node.id);
    }
    if (product.category) {
      const cat = treeNodes.find(n => n.id === product.category || n.name === product.category);
      if (cat) return findCategoryAtLevel(cat.id);
    }
    if (product.sector) {
      const sector = treeNodes.find(n => n.id === product.sector || n.name === product.sector);
      if (sector) return findCategoryAtLevel(sector.id);
    }
    return undefined;
  }, [treeNodes, categoryLevel]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (selectedSuppliers.length > 0 && !selectedSuppliers.includes(p.supplier)) return false;
      if (selectedManufacturers.length > 0 && !selectedManufacturers.includes(p.manufacturer || '')) return false;
      if (priceRange.min && p.price < parseFloat(priceRange.min)) return false;
      if (priceRange.max && p.price > parseFloat(priceRange.max)) return false;
      return true;
    });
  }, [products, selectedSuppliers, selectedManufacturers, priceRange]);

  const heatmapData = useMemo((): HeatmapSeriesData[] => {
    const categories = selectedCategories.length > 0 
      ? categoriesByLevel.filter(c => selectedCategories.includes(c.id))
      : categoriesByLevel;
    
    const usageAreas = selectedUsageAreas.length > 0 
      ? selectedUsageAreas 
      : allUsageAreas;

    return categories.map(cat => {
      const dataPoints: HeatmapDataPoint[] = usageAreas.map(area => {
        const matchingProducts = filteredProducts.filter(p => {
          const productCat = getProductCategory(p);
          if (!productCat || productCat.id !== cat.id) return false;
          const productAreas = getProductUsageAreas(p);
          return productAreas.includes(area);
        });

        const prices = matchingProducts.map(p => p.price).filter(p => p > 0);
        const suppliersSet = new Set<string>(matchingProducts.map(p => p.supplier));
        const manufacturersSet = new Set<string>(matchingProducts.map(p => p.manufacturer).filter((m): m is string => Boolean(m)));
        
        const certifications: string[] = [];
        matchingProducts.forEach(p => {
          p.customFields?.forEach(cf => {
            if (cf.fieldId.toLowerCase().includes('cert') && cf.value) {
              certifications.push(String(cf.value));
            }
          });
        });
        const uniqueCerts = [...new Set(certifications)].slice(0, 3);

        return {
          x: area,
          y: matchingProducts.length,
          meta: {
            products: matchingProducts,
            suppliers: suppliersSet,
            manufacturers: manufacturersSet,
            avgPrice: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
            minPrice: prices.length > 0 ? Math.min(...prices) : 0,
            maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
            certifications: uniqueCerts,
          }
        };
      });

      return {
        id: cat.name,
        categoryId: cat.id,
        data: dataPoints
      };
    });
  }, [filteredProducts, categoriesByLevel, selectedCategories, selectedUsageAreas, allUsageAreas, getProductCategory, getProductUsageAreas]);

  const maxValue = useMemo(() => {
    let max = 0;
    heatmapData.forEach(series => {
      series.data.forEach(d => {
        if (d.y > max) max = d.y;
      });
    });
    return max;
  }, [heatmapData]);

  const handleCellClick = useCallback((cell: any) => {
    const series = heatmapData.find(s => s.id === cell.serieId);
    const dataPoint = series?.data.find(d => d.x === cell.data.x);
    if (dataPoint && dataPoint.meta.products.length > 0) {
      setDrillDown({
        category: cell.serieId,
        usageArea: cell.data.x,
        products: dataPoint.meta.products
      });
      if (onCellClick) {
        onCellClick(series?.categoryId || '', cell.data.x, dataPoint.meta.products);
      }
    }
  }, [heatmapData, onCellClick]);

  const exportToCSV = useCallback(() => {
    if (!drillDown) return;
    const headers = ['Product ID', 'Name', 'Supplier', 'Category', 'Price', 'Currency', 'MOQ', 'Lead Time'];
    const rows = drillDown.products.map(p => [
      p.id,
      p.name,
      p.supplier,
      p.category,
      p.price,
      p.currency,
      p.moq,
      p.leadTime
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products_${drillDown.category}_${drillDown.usageArea}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [drillDown]);

  const CustomTooltip = ({ cell }: { cell: any }) => {
    const series = heatmapData.find(s => s.id === cell.serieId);
    const dataPoint = series?.data.find(d => d.x === cell.data.x);
    if (!dataPoint) return null;

    const { meta } = dataPoint;
    const supplierCount = meta.suppliers.size;
    const manufacturerCount = meta.manufacturers.size;

    return (
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-4 min-w-[240px]">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
          <div 
            className="w-4 h-4 rounded-sm" 
            style={{ backgroundColor: cell.color }}
          />
          <div>
            <div className="font-bold text-slate-800">{cell.serieId}</div>
            <div className="text-xs text-slate-500">{cell.data.x}</div>
          </div>
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Products:</span>
            <span className="font-bold text-blue-600">{dataPoint.y}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Suppliers:</span>
            <span className="font-semibold text-slate-700">{supplierCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Manufacturers:</span>
            <span className="font-semibold text-slate-700">{manufacturerCount}</span>
          </div>
          
          {meta.avgPrice > 0 && (
            <>
              <div className="border-t border-slate-100 pt-2 mt-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Avg Price:</span>
                  <span className="font-semibold text-green-600">${meta.avgPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Range:</span>
                  <span className="text-slate-500">${meta.minPrice.toFixed(2)} - ${meta.maxPrice.toFixed(2)}</span>
                </div>
              </div>
            </>
          )}
          
          {meta.certifications.length > 0 && (
            <div className="border-t border-slate-100 pt-2 mt-2">
              <div className="text-xs text-slate-500 mb-1">Certifications:</div>
              <div className="flex flex-wrap gap-1">
                {meta.certifications.map((cert, i) => (
                  <span key={i} className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs">
                    {cert}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {dataPoint.y > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-blue-600 font-medium">
            Click to view products
          </div>
        )}
      </div>
    );
  };

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const toggleUsageArea = (area: string) => {
    setSelectedUsageAreas(prev => 
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
    );
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setSelectedUsageAreas([]);
    setSelectedSuppliers([]);
    setSelectedManufacturers([]);
    setPriceRange({ min: '', max: '' });
  };

  const hasActiveFilters = selectedCategories.length > 0 || selectedUsageAreas.length > 0 || 
    selectedSuppliers.length > 0 || selectedManufacturers.length > 0 || 
    priceRange.min || priceRange.max;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-slate-600">Level:</span>
            <select
              value={categoryLevel}
              onChange={e => setCategoryLevel(e.target.value as any)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="sector">Sector</option>
              <option value="category">Category</option>
              <option value="subcategory">Sub-Category</option>
              <option value="group">Group</option>
            </select>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              showFilters ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Categories ({selectedCategories.length} selected)
              </label>
              <div className="max-h-40 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-2">
                {categoriesByLevel.map(cat => (
                  <label key={cat.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(cat.id)}
                      onChange={() => toggleCategory(cat.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700 truncate">{cat.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Usage Areas ({selectedUsageAreas.length} selected)
              </label>
              <div className="max-h-40 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-2">
                {allUsageAreas.map(area => (
                  <label key={area} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedUsageAreas.includes(area)}
                      onChange={() => toggleUsageArea(area)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700 truncate">{area}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Supplier</label>
              <select
                value={selectedSuppliers[0] || ''}
                onChange={e => setSelectedSuppliers(e.target.value ? [e.target.value] : [])}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Suppliers</option>
                {suppliers.map(s => (
                  <option key={s.supplierId} value={s.name}>{s.name}</option>
                ))}
              </select>

              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 mt-4">Manufacturer</label>
              <select
                value={selectedManufacturers[0] || ''}
                onChange={e => setSelectedManufacturers(e.target.value ? [e.target.value] : [])}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Manufacturers</option>
                {allManufacturers.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Price Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={priceRange.min}
                  onChange={e => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={priceRange.max}
                  onChange={e => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={containerRef}>
        <NivoChartWrapper
          title={`Product Usage Density Matrix`}
          subtitle={`${heatmapData.length} categories × ${selectedUsageAreas.length || allUsageAreas.length} usage areas • Max: ${maxValue} products`}
          isEmpty={heatmapData.length === 0 || heatmapData.every(d => d.data.every(p => p.y === 0))}
          emptyMessage="No products match the current filters"
          height={Math.max(400, heatmapData.length * 50 + 100)}
        >
          <ResponsiveHeatMap
            data={heatmapData}
            margin={{ top: 60, right: 90, bottom: 60, left: 120 }}
            valueFormat=">-.0f"
            axisTop={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: -45,
              legend: 'Usage Areas',
              legendOffset: -46,
              legendPosition: 'middle'
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: categoryLevel.charAt(0).toUpperCase() + categoryLevel.slice(1),
              legendPosition: 'middle',
              legendOffset: -100,
              truncateTickAt: 20
            }}
            colors={{
              type: 'sequential',
              scheme: 'blues',
              minValue: 0,
              maxValue: Math.max(maxValue, 1)
            }}
            emptyColor="#f8fafc"
            borderColor="#e2e8f0"
            borderWidth={1}
            borderRadius={4}
            enableLabels={true}
            labelTextColor={{ from: 'color', modifiers: [['darker', 2.5]] }}
            legends={[
              {
                anchor: 'right',
                translateX: 60,
                translateY: 0,
                length: 200,
                thickness: 12,
                direction: 'column',
                tickPosition: 'after',
                tickSize: 3,
                tickSpacing: 4,
                tickOverlap: false,
                title: 'Products →',
                titleAlign: 'start',
                titleOffset: 4
              }
            ]}
            annotations={[]}
            onClick={handleCellClick}
            tooltip={CustomTooltip}
            theme={nivoTheme}
            hoverTarget="cell"
            animate={true}
            motionConfig="gentle"
          />
        </NivoChartWrapper>
      </div>

      {drillDown && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDrillDown(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  {drillDown.category} × {drillDown.usageArea}
                </h3>
                <p className="text-sm text-slate-500">{drillDown.products.length} products</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportToCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
                <button
                  onClick={() => setDrillDown(null)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>
            
            <div className="overflow-auto max-h-[calc(80vh-80px)]">
              <table className="w-full">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Product Name</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Supplier</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Price</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">MOQ</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Lead Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drillDown.products.map((product, idx) => (
                    <tr key={product.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-600 font-mono">{product.id}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{product.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{product.supplier}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {product.currency} {product.price.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{product.moq}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{product.leadTime} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductUsageHeatmap;
