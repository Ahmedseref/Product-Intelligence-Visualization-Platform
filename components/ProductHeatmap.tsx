import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Product, TreeNode, Supplier, CustomField } from '../types';
import { Filter, X, Download, FileText, ChevronDown } from 'lucide-react';

interface ProductHeatmapProps {
  products: Product[];
  treeNodes: TreeNode[];
  suppliers: Supplier[];
  customFields: CustomField[];
  onExportProducts?: (products: Product[]) => void;
  onCreatePI?: (products: Product[]) => void;
}

interface HeatmapCell {
  category: string;
  categoryId: string;
  usageArea: string;
  count: number;
  products: Product[];
  suppliers: Set<string>;
  brands: Set<string>;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
}

interface TooltipData {
  cell: HeatmapCell;
  x: number;
  y: number;
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

const ProductHeatmap: React.FC<ProductHeatmapProps> = ({
  products,
  treeNodes,
  suppliers,
  customFields,
  onExportProducts,
  onCreatePI
}) => {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedUsageAreas, setSelectedUsageAreas] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<{ min: string; max: string }>({ min: '', max: '' });
  const [categoryLevel, setCategoryLevel] = useState<'sector' | 'category' | 'subcategory' | 'group'>('category');
  const [showFilters, setShowFilters] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [drillDownCell, setDrillDownCell] = useState<HeatmapCell | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

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

  const allBrands = useMemo(() => {
    const brands = new Set<string>();
    products.forEach(p => {
      if (p.manufacturer) brands.add(p.manufacturer);
    });
    return Array.from(brands).sort();
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

  const getProductCategory = useCallback((product: Product): { id: string; name: string } | null => {
    const findAncestorOfType = (nodeId: string, type: string): TreeNode | null => {
      let current = treeNodes.find(n => n.id === nodeId);
      while (current) {
        if (current.type === type) return current;
        if (!current.parentId) break;
        current = treeNodes.find(n => n.id === current!.parentId);
      }
      return null;
    };

    const node = treeNodes.find(n => n.id === product.nodeId);
    if (!node) return null;

    if (node.type === categoryLevel) {
      return { id: node.id, name: node.name };
    }

    const ancestor = findAncestorOfType(product.nodeId, categoryLevel);
    if (ancestor) {
      return { id: ancestor.id, name: ancestor.name };
    }

    return null;
  }, [treeNodes, categoryLevel]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (selectedSuppliers.length > 0 && !selectedSuppliers.includes(p.supplier)) return false;
      if (selectedBrands.length > 0 && !selectedBrands.includes(p.manufacturer)) return false;
      if (priceRange.min && p.price < parseFloat(priceRange.min)) return false;
      if (priceRange.max && p.price > parseFloat(priceRange.max)) return false;
      return true;
    });
  }, [products, selectedSuppliers, selectedBrands, priceRange]);

  const heatmapData = useMemo(() => {
    const categories = selectedCategories.length > 0 
      ? categoriesByLevel.filter(c => selectedCategories.includes(c.id))
      : categoriesByLevel;
    
    const usageAreas = selectedUsageAreas.length > 0 
      ? selectedUsageAreas 
      : allUsageAreas;

    const matrix: HeatmapCell[][] = [];
    let maxCount = 0;

    categories.forEach(cat => {
      const row: HeatmapCell[] = [];
      
      usageAreas.forEach(area => {
        const matchingProducts = filteredProducts.filter(p => {
          const productCat = getProductCategory(p);
          if (!productCat || productCat.id !== cat.id) return false;
          const productAreas = getProductUsageAreas(p);
          return productAreas.includes(area);
        });

        const prices = matchingProducts.map(p => p.price).filter(p => p > 0);
        const suppliersSet = new Set<string>(matchingProducts.map(p => p.supplier));
        const brandsSet = new Set<string>(matchingProducts.map(p => p.manufacturer).filter((b): b is string => Boolean(b)));

        const cell: HeatmapCell = {
          category: cat.name,
          categoryId: cat.id,
          usageArea: area,
          count: matchingProducts.length,
          products: matchingProducts,
          suppliers: suppliersSet,
          brands: brandsSet,
          minPrice: prices.length > 0 ? Math.min(...prices) : 0,
          maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
          avgPrice: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0
        };

        maxCount = Math.max(maxCount, cell.count);
        row.push(cell);
      });
      
      matrix.push(row);
    });

    return { matrix, maxCount, categories, usageAreas };
  }, [filteredProducts, categoriesByLevel, selectedCategories, selectedUsageAreas, allUsageAreas, getProductCategory, getProductUsageAreas]);

  const getColor = useCallback((count: number, maxCount: number) => {
    if (count === 0) return '#f8fafc';
    const intensity = Math.min(count / Math.max(maxCount, 1), 1);
    const r = Math.round(240 - intensity * 180);
    const g = Math.round(249 - intensity * 130);
    const b = Math.round(112 + intensity * 80);
    return `rgb(${r}, ${g}, ${b})`;
  }, []);

  const handleCellHover = useCallback((cell: HeatmapCell, event: React.MouseEvent) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        setTooltip({
          cell,
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top
        });
      }
    }, 100);
  }, []);

  const handleCellLeave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setTooltip(null);
  }, []);

  const handleCellClick = useCallback((cell: HeatmapCell) => {
    if (cell.count > 0) {
      setDrillDownCell(cell);
    }
  }, []);

  const handleExport = useCallback(() => {
    if (!drillDownCell) return;
    const headers = ['ID', 'Name', 'Supplier', 'Brand', 'Price', 'Currency', 'Category', 'Usage Area'];
    const rows = drillDownCell.products.map(p => [
      p.id, p.name, p.supplier, p.manufacturer, p.price, p.currency, drillDownCell.category, drillDownCell.usageArea
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products-${drillDownCell.category}-${drillDownCell.usageArea}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [drillDownCell]);

  const CELL_WIDTH = 100;
  const CELL_HEIGHT = 50;
  const LABEL_WIDTH = 180;
  const LABEL_HEIGHT = 80;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Product Usage Density Matrix</h2>
          <p className="text-sm text-slate-500 mt-1">Visualize product distribution across categories and usage areas</p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
            showFilters ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Category Level</label>
              <select
                value={categoryLevel}
                onChange={e => setCategoryLevel(e.target.value as any)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="sector">Sector</option>
                <option value="category">Category</option>
                <option value="subcategory">Sub-Category</option>
                <option value="group">Group</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Filter Categories</label>
              <div className="relative">
                <select
                  multiple
                  value={selectedCategories}
                  onChange={e => setSelectedCategories([...e.target.selectedOptions].map(o => o.value))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none h-24"
                >
                  {categoriesByLevel.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Filter Usage Areas</label>
              <select
                multiple
                value={selectedUsageAreas}
                onChange={e => setSelectedUsageAreas([...e.target.selectedOptions].map(o => o.value))}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none h-24"
              >
                {allUsageAreas.map(area => (
                  <option key={area} value={area}>{area}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Filter Suppliers</label>
              <select
                multiple
                value={selectedSuppliers}
                onChange={e => setSelectedSuppliers([...e.target.selectedOptions].map(o => o.value))}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none h-24"
              >
                {suppliers.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Filter Brands</label>
              <select
                multiple
                value={selectedBrands}
                onChange={e => setSelectedBrands([...e.target.selectedOptions].map(o => o.value))}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none h-20"
              >
                {allBrands.map(brand => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Price Range</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={priceRange.min}
                  onChange={e => setPriceRange({ ...priceRange, min: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={priceRange.max}
                  onChange={e => setPriceRange({ ...priceRange, max: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setSelectedCategories([]);
                  setSelectedUsageAreas([]);
                  setSelectedSuppliers([]);
                  setSelectedBrands([]);
                  setPriceRange({ min: '', max: '' });
                }}
                className="px-4 py-2.5 bg-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-300 transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={containerRef} className="relative bg-white rounded-2xl border border-slate-200 p-6 overflow-auto">
        {heatmapData.matrix.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No data to display</p>
            <p className="text-sm mt-1">Adjust your filters or add more products</p>
          </div>
        ) : (
          <div className="min-w-fit">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {heatmapData.categories.length} Categories × {heatmapData.usageAreas.length} Usage Areas
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <div className="w-4 h-4 rounded" style={{ background: getColor(0, 10) }}></div>
                  <span>0</span>
                  <div className="w-20 h-4 rounded" style={{ background: 'linear-gradient(to right, #f8fafc, #3b82f6)' }}></div>
                  <span>{heatmapData.maxCount}</span>
                  <span className="text-slate-400 ml-2">Products</span>
                </div>
              </div>
            </div>

            <svg
              width={LABEL_WIDTH + heatmapData.usageAreas.length * CELL_WIDTH + 20}
              height={LABEL_HEIGHT + heatmapData.matrix.length * CELL_HEIGHT + 20}
              className="block"
            >
              <g transform={`translate(${LABEL_WIDTH}, 0)`}>
                {heatmapData.usageAreas.map((area, i) => (
                  <text
                    key={area}
                    x={i * CELL_WIDTH + CELL_WIDTH / 2}
                    y={LABEL_HEIGHT - 10}
                    textAnchor="end"
                    transform={`rotate(-45, ${i * CELL_WIDTH + CELL_WIDTH / 2}, ${LABEL_HEIGHT - 10})`}
                    className="text-xs fill-slate-600 font-medium"
                  >
                    {area}
                  </text>
                ))}
              </g>

              <g transform={`translate(0, ${LABEL_HEIGHT})`}>
                {heatmapData.matrix.map((row, rowIndex) => (
                  <g key={row[0]?.categoryId || rowIndex}>
                    <text
                      x={LABEL_WIDTH - 10}
                      y={rowIndex * CELL_HEIGHT + CELL_HEIGHT / 2 + 4}
                      textAnchor="end"
                      className="text-xs fill-slate-700 font-medium"
                    >
                      {row[0]?.category.length > 22 ? row[0]?.category.slice(0, 22) + '...' : row[0]?.category}
                    </text>

                    {row.map((cell, colIndex) => (
                      <g key={`${cell.categoryId}-${cell.usageArea}`}>
                        <rect
                          x={LABEL_WIDTH + colIndex * CELL_WIDTH}
                          y={rowIndex * CELL_HEIGHT}
                          width={CELL_WIDTH - 2}
                          height={CELL_HEIGHT - 2}
                          rx={6}
                          fill={getColor(cell.count, heatmapData.maxCount)}
                          stroke="#e2e8f0"
                          strokeWidth={1}
                          className="cursor-pointer transition-all hover:stroke-blue-500 hover:stroke-2"
                          onMouseEnter={(e) => handleCellHover(cell, e)}
                          onMouseLeave={handleCellLeave}
                          onClick={() => handleCellClick(cell)}
                        />
                        <text
                          x={LABEL_WIDTH + colIndex * CELL_WIDTH + CELL_WIDTH / 2 - 1}
                          y={rowIndex * CELL_HEIGHT + CELL_HEIGHT / 2 + 4}
                          textAnchor="middle"
                          className={`text-sm font-bold pointer-events-none ${
                            cell.count > heatmapData.maxCount * 0.5 ? 'fill-white' : 'fill-slate-700'
                          }`}
                        >
                          {cell.count}
                        </text>
                      </g>
                    ))}
                  </g>
                ))}
              </g>
            </svg>

            <div className="mt-4 flex justify-center">
              <p className="text-sm text-slate-500">Application Sector</p>
            </div>
          </div>
        )}

        {tooltip && (
          <div
            className="absolute z-50 bg-slate-900 text-white rounded-xl shadow-2xl p-4 min-w-[280px] pointer-events-none"
            style={{
              left: Math.min(tooltip.x, (containerRef.current?.clientWidth || 500) - 300),
              top: tooltip.y - 10,
              transform: 'translate(-50%, -100%)'
            }}
          >
            <div className="space-y-3">
              <div className="border-b border-slate-700 pb-2">
                <p className="font-bold text-blue-400">{tooltip.cell.category}</p>
                <p className="text-sm text-slate-400">{tooltip.cell.usageArea}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400">Products</p>
                  <p className="font-bold text-lg">{tooltip.cell.count}</p>
                </div>
                <div>
                  <p className="text-slate-400">Suppliers</p>
                  <p className="font-bold text-lg">{tooltip.cell.suppliers.size}</p>
                </div>
              </div>

              {tooltip.cell.count > 0 && (
                <>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-slate-400">Min</p>
                      <p className="font-medium">${tooltip.cell.minPrice.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Avg</p>
                      <p className="font-medium">${tooltip.cell.avgPrice.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Max</p>
                      <p className="font-medium">${tooltip.cell.maxPrice.toFixed(0)}</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-700 pt-2">
                    <p className="text-slate-400 text-xs mb-1">Top Products:</p>
                    <div className="space-y-1">
                      {tooltip.cell.products.slice(0, 5).map((p, i) => (
                        <div key={p.id} className="flex justify-between text-xs">
                          <span className="truncate max-w-[160px]">{p.name}</span>
                          <span className="text-slate-400">{p.supplier}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <p className="text-xs text-slate-500 text-center">Click to view details</p>
            </div>
          </div>
        )}
      </div>

      {drillDownCell && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-800">
                  {drillDownCell.category} × {drillDownCell.usageArea}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  {drillDownCell.count} products from {drillDownCell.suppliers.size} suppliers
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExport}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
                {onCreatePI && (
                  <button
                    onClick={() => {
                      onCreatePI(drillDownCell.products);
                      setDrillDownCell(null);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    Create PI Report
                  </button>
                )}
                <button
                  onClick={() => setDrillDownCell(null)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 font-bold text-slate-600">Product Name</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-600">Supplier</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-600">Brand</th>
                    <th className="text-right px-4 py-3 font-bold text-slate-600">Price</th>
                    <th className="text-right px-4 py-3 font-bold text-slate-600">MOQ</th>
                    <th className="text-right px-4 py-3 font-bold text-slate-600">Lead Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drillDownCell.products.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                      <td className="px-4 py-3 text-slate-600">{p.supplier}</td>
                      <td className="px-4 py-3 text-slate-600">{p.manufacturer || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium">{p.currency} {p.price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{p.moq}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{p.leadTime} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {drillDownCell.products.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <p>No products in this cell</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductHeatmap;
