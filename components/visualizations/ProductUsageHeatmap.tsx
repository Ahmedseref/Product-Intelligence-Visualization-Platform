import React, { useState, useMemo, useCallback, useRef } from 'react';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { Product, TreeNode, Supplier, CustomField, User } from '../../types';
import NivoChartWrapper, { nivoTheme, CHART_COLORS } from '../charts/NivoChartWrapper';
import { Filter, X, Download, ChevronDown, ChevronUp, Layers, Edit2, Copy, Trash2, Tag, Check, Camera, Loader2, Palette } from 'lucide-react';
import ProductForm from '../ProductForm';
import { api } from '../../client/api';
import html2canvas from 'html2canvas';

interface ProductUsageHeatmapProps {
  products: Product[];
  treeNodes: TreeNode[];
  suppliers: Supplier[];
  customFields: CustomField[];
  currentUser?: User;
  usageAreas?: string[];
  onCellClick?: (categoryId: string, usageArea: string, products: Product[]) => void;
  onProductUpdate?: (product: Product) => void;
  onProductDelete?: (productId: string) => void;
  onAddFieldDefinition?: (field: CustomField) => void;
  onAddTreeNode?: (node: TreeNode) => void;
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
  categoryName: string;
  data: HeatmapDataPoint[];
}

interface DrillDownData {
  category: string;
  usageArea: string;
  products: Product[];
}

type MatrixMode = 'category' | 'product';
type ColorPalette = 'blues' | 'ocean' | 'forest' | 'sunset' | 'berry' | 'multi';

const PALETTE_OPTIONS: { value: ColorPalette; label: string; nivoScheme: string }[] = [
  { value: 'blues', label: 'Blues', nivoScheme: 'blues' },
  { value: 'ocean', label: 'Ocean', nivoScheme: 'blues' },
  { value: 'forest', label: 'Forest', nivoScheme: 'greens' },
  { value: 'sunset', label: 'Sunset', nivoScheme: 'oranges' },
  { value: 'berry', label: 'Berry', nivoScheme: 'purples' },
  { value: 'multi', label: 'Multi-Color', nivoScheme: 'blues' },
];

const ProductUsageHeatmap: React.FC<ProductUsageHeatmapProps> = ({
  products,
  treeNodes,
  suppliers,
  customFields,
  currentUser,
  usageAreas: propUsageAreas = [],
  onCellClick,
  onProductUpdate,
  onProductDelete,
  onAddFieldDefinition,
  onAddTreeNode
}) => {
  const USAGE_AREAS = propUsageAreas;
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedUsageAreas, setSelectedUsageAreas] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedManufacturers, setSelectedManufacturers] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<{ min: string; max: string }>({ min: '', max: '' });
  const [categoryLevel, setCategoryLevel] = useState<'sector' | 'category' | 'subcategory' | 'group' | 'leaf'>('category');
  const [showFilters, setShowFilters] = useState(true);
  const [drillDown, setDrillDown] = useState<DrillDownData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [matrixMode, setMatrixMode] = useState<MatrixMode>('category');
  const [colorPalette, setColorPalette] = useState<ColorPalette>('blues');
  const [isCapturing, setIsCapturing] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ serieId: string; dataX: string } | null>(null);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [duplicatingProduct, setDuplicatingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingUsageProductId, setEditingUsageProductId] = useState<string | null>(null);

  const allUsageAreas = useMemo(() => {
    return [...USAGE_AREAS].sort();
  }, [USAGE_AREAS]);

  const allManufacturers = useMemo(() => {
    const manufacturers = new Set<string>();
    products.forEach(p => {
      if (p.manufacturer) manufacturers.add(p.manufacturer);
    });
    return Array.from(manufacturers).sort();
  }, [products]);

  const categoriesByLevel = useMemo(() => {
    if (categoryLevel === 'leaf') {
      const nodeIdsWithProducts = new Set(products.map(p => p.nodeId).filter(Boolean));
      return treeNodes.filter(n => nodeIdsWithProducts.has(n.id));
    }
    return treeNodes.filter(n => n.type === categoryLevel);
  }, [treeNodes, categoryLevel, products]);

  const getProductUsageAreas = useCallback((product: Product): string[] => {
    if (Array.isArray(product.customFields)) {
      const usageField = product.customFields.find((cf: any) =>
        cf.fieldId?.toLowerCase().includes('usage') ||
        cf.fieldId?.toLowerCase().includes('application')
      );
      if (usageField?.value) {
        return String(usageField.value).split(',').map((v: string) => v.trim()).filter(v => USAGE_AREAS.includes(v));
      }
      return [];
    }
    if (product.customFields && typeof product.customFields === 'object') {
      const usageAreas = (product.customFields as any)['Usage Areas'];
      if (Array.isArray(usageAreas)) {
        return usageAreas.filter(v => USAGE_AREAS.includes(v));
      }
    }
    return [];
  }, [USAGE_AREAS]);

  const getProductCategory = useCallback((product: Product): TreeNode | undefined => {
    if (categoryLevel === 'leaf') {
      if (product.nodeId) {
        return treeNodes.find(n => n.id === product.nodeId);
      }
      return undefined;
    }

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
          if (p.customFields && typeof p.customFields === 'object') {
            Object.entries(p.customFields).forEach(([key, value]) => {
              if (key.toLowerCase().includes('cert') && value) {
                if (Array.isArray(value)) {
                  certifications.push(...value.map(String));
                } else {
                  certifications.push(String(value));
                }
              }
            });
          }
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
        categoryName: cat.name,
        data: dataPoints
      };
    });
  }, [filteredProducts, categoriesByLevel, selectedCategories, selectedUsageAreas, allUsageAreas, getProductCategory, getProductUsageAreas]);

  const productHeatmapData = useMemo((): HeatmapSeriesData[] => {
    if (matrixMode !== 'product') return [];

    const usageAreas = selectedUsageAreas.length > 0
      ? selectedUsageAreas
      : allUsageAreas;

    let prods = filteredProducts;
    if (selectedCategories.length > 0) {
      prods = prods.filter(p => {
        const cat = getProductCategory(p);
        return cat && selectedCategories.includes(cat.id);
      });
    }

    const nameOccurrences: Record<string, number> = {};
    prods.forEach(p => { nameOccurrences[p.name] = (nameOccurrences[p.name] || 0) + 1; });
    const nameIndex: Record<string, number> = {};

    return prods.map(product => {
      const productAreas = getProductUsageAreas(product);
      const dataPoints: HeatmapDataPoint[] = usageAreas.map(area => {
        const hasArea = productAreas.includes(area);
        return {
          x: area,
          y: hasArea ? 1 : 0,
          meta: {
            products: [product],
            suppliers: new Set<string>([product.supplier]),
            manufacturers: new Set<string>(product.manufacturer ? [product.manufacturer] : []),
            avgPrice: product.price,
            minPrice: product.price,
            maxPrice: product.price,
            certifications: [],
          }
        };
      });

      let displayName = product.name;
      if (nameOccurrences[product.name] > 1) {
        nameIndex[product.name] = (nameIndex[product.name] || 0) + 1;
        displayName = `${product.name} [${product.supplier || ''} #${nameIndex[product.name]}]`;
      }
      return {
        id: `pid_${product.id}`,
        categoryId: product.id,
        categoryName: displayName,
        data: dataPoints
      };
    });
  }, [matrixMode, filteredProducts, selectedCategories, selectedUsageAreas, allUsageAreas, getProductCategory, getProductUsageAreas]);

  const activeData = matrixMode === 'category' ? heatmapData : productHeatmapData;

  const seriesIdToName = useMemo(() => {
    const map: Record<string, string> = {};
    activeData.forEach(s => { map[s.id] = s.categoryName; });
    return map;
  }, [activeData]);

  const maxValue = useMemo(() => {
    let max = 0;
    activeData.forEach(series => {
      series.data.forEach(d => {
        if (d.y > max) max = d.y;
      });
    });
    return max;
  }, [activeData]);

  const handleCellClick = useCallback((cell: any) => {
    const data = activeData;
    const series = data.find(s => s.id === cell.serieId || s.categoryName === cell.serieId);
    const dataPoint = series?.data.find(d => d.x === cell.data.x);
    if (dataPoint && dataPoint.meta.products.length > 0) {
      setDrillDown({
        category: series?.categoryName || cell.serieId,
        usageArea: cell.data.x,
        products: dataPoint.meta.products
      });
      if (onCellClick) {
        onCellClick(series?.categoryId || '', cell.data.x, dataPoint.meta.products);
      }
    }
  }, [activeData, onCellClick]);

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

  const handleEditProduct = useCallback((product: Product) => {
    setEditingProduct(product);
  }, []);

  const handleDuplicateProduct = useCallback((product: Product) => {
    const duplicated: Product = {
      ...product,
      id: '',
      name: `${product.name} (Copy)`,
      dateAdded: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
    setDuplicatingProduct(duplicated);
  }, []);

  const handleToggleUsageArea = useCallback(async (product: Product, area: string) => {
    if (!onProductUpdate) return;
    const currentAreas = getProductUsageAreas(product);
    const newAreas = currentAreas.includes(area)
      ? currentAreas.filter(a => a !== area)
      : [...currentAreas, area];

    const updatedCustomFields = {
      ...(typeof product.customFields === 'object' && !Array.isArray(product.customFields) ? product.customFields : {}),
      'Usage Areas': newAreas
    };

    const updatedProduct: Product = {
      ...product,
      customFields: updatedCustomFields,
      lastUpdated: new Date().toISOString()
    };

    try {
      await api.updateProduct(product.id, { customFields: updatedCustomFields } as any);
      onProductUpdate(updatedProduct);
      if (drillDown) {
        setDrillDown({
          ...drillDown,
          products: drillDown.products.map(p => p.id === product.id ? updatedProduct : p)
        });
      }
    } catch (error) {
      console.error('Failed to update usage areas:', error);
    }
  }, [onProductUpdate, getProductUsageAreas, drillDown]);

  const handleDeleteProduct = useCallback(async () => {
    if (!deletingProduct || !onProductDelete) return;
    setIsDeleting(true);
    try {
      await api.deleteProduct(deletingProduct.id);
      onProductDelete(deletingProduct.id);
      if (drillDown) {
        setDrillDown({
          ...drillDown,
          products: drillDown.products.filter(p => p.id !== deletingProduct.id)
        });
      }
      setDeletingProduct(null);
    } catch (error) {
      console.error('Failed to delete product:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [deletingProduct, onProductDelete, drillDown]);

  const handleProductFormSubmit = useCallback((updatedProduct: Product) => {
    if (editingProduct && onProductUpdate) {
      onProductUpdate(updatedProduct);
      if (drillDown) {
        setDrillDown({
          ...drillDown,
          products: drillDown.products.map(p => p.id === updatedProduct.id ? updatedProduct : p)
        });
      }
    } else if (duplicatingProduct && onProductUpdate) {
      onProductUpdate(updatedProduct);
      if (drillDown && updatedProduct.category === drillDown.category) {
        setDrillDown({
          ...drillDown,
          products: [...drillDown.products, updatedProduct]
        });
      }
    }
    setEditingProduct(null);
    setDuplicatingProduct(null);
  }, [editingProduct, duplicatingProduct, onProductUpdate, drillDown]);

  const handleDownloadImage = useCallback(async () => {
    if (!containerRef.current) return;
    setIsCapturing(true);
    try {
      const canvas = await html2canvas(containerRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const dateStr = new Date().toISOString().split('T')[0];
      const filterParts: string[] = [];
      if (selectedSuppliers.length > 0) filterParts.push(`supplier-${selectedSuppliers[0].replace(/\s+/g, '')}`);
      if (selectedManufacturers.length > 0) filterParts.push(`mfr-${selectedManufacturers[0].replace(/\s+/g, '')}`);
      if (priceRange.min) filterParts.push(`min${priceRange.min}`);
      if (priceRange.max) filterParts.push(`max${priceRange.max}`);
      const filterStr = filterParts.length > 0 ? `_${filterParts.join('_')}` : '';
      const levelStr = matrixMode === 'category' ? `_${categoryLevel}` : '';
      const filename = `matrix_${matrixMode}${levelStr}${filterStr}_${dateStr}.png`;
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Failed to capture image:', error);
    } finally {
      setIsCapturing(false);
    }
  }, [matrixMode, categoryLevel, selectedSuppliers, selectedManufacturers, priceRange]);

  const paletteNivoScheme = useMemo(() => {
    const found = PALETTE_OPTIONS.find(p => p.value === colorPalette);
    return found ? found.nivoScheme : 'blues';
  }, [colorPalette]);

  const colorsConfig = useMemo(() => {
    if (colorPalette === 'multi') {
      return {
        type: 'sequential' as const,
        scheme: 'blues' as const,
        minValue: 0,
        maxValue: Math.max(maxValue, 1)
      };
    }
    return {
      type: 'sequential' as const,
      scheme: paletteNivoScheme as any,
      minValue: 0,
      maxValue: Math.max(maxValue, 1)
    };
  }, [colorPalette, paletteNivoScheme, maxValue]);

  const usageAreaColumns = useMemo(() => {
    return selectedUsageAreas.length > 0 ? selectedUsageAreas : allUsageAreas;
  }, [selectedUsageAreas, allUsageAreas]);

  const getColumnColor = useCallback((colIndex: number): string => {
    return CHART_COLORS.categorical[colIndex % CHART_COLORS.categorical.length];
  }, []);

  const CustomCellComponent = useCallback(({ cell, onMouseEnter, onMouseMove, onMouseLeave, onClick, ...props }: any) => {
    const isMultiColor = colorPalette === 'multi';
    const isProductMode = matrixMode === 'product';

    const value = cell.value ?? 0;
    const cellLabel = isProductMode && value > 0 ? 'X' : (value > 0 ? value : null);
    const cellFontSize = isProductMode ? 13 : 11;
    const cellFontWeight = isProductMode ? 800 : 600;

    const nivoMouseEnter = onMouseEnter ? onMouseEnter(cell) : undefined;
    const nivoMouseMove = onMouseMove ? onMouseMove(cell) : undefined;
    const nivoMouseLeave = onMouseLeave ? onMouseLeave(cell) : undefined;
    const nivoClick = onClick ? onClick(cell) : undefined;

    const handleMouseEnter = (e: React.MouseEvent) => {
      setHoveredCell({ serieId: cell.serieId, dataX: cell.data.x });
      if (nivoMouseEnter) nivoMouseEnter(e);
    };
    const handleMouseMove = (e: React.MouseEvent) => {
      if (nivoMouseMove) nivoMouseMove(e);
    };
    const handleMouseLeave = (e: React.MouseEvent) => {
      setHoveredCell(null);
      if (nivoMouseLeave) nivoMouseLeave(e);
    };
    const handleClick = (e: React.MouseEvent) => {
      handleCellClick(cell);
      if (nivoClick) nivoClick(e);
    };

    if (isMultiColor && isProductMode) {
      const colIndex = usageAreaColumns.indexOf(cell.data.x);
      const baseColor = getColumnColor(colIndex >= 0 ? colIndex : 0);
      const opacity = value > 0 ? 1 : 0.08;
      const fillColor = value > 0 ? baseColor : '#f1f5f9';

      return (
        <g
          transform={`translate(${cell.x}, ${cell.y})`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: 'pointer' }}
        >
          <rect
            x={cell.width / -2}
            y={cell.height / -2}
            width={cell.width}
            height={cell.height}
            fill={fillColor}
            fillOpacity={opacity}
            strokeWidth={1}
            stroke="#e2e8f0"
            rx={4}
          />
          {cellLabel && (
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fill="#ffffff"
              fontSize={cellFontSize}
              fontWeight={cellFontWeight}
              style={{ pointerEvents: 'none' }}
            >
              {cellLabel}
            </text>
          )}
        </g>
      );
    }

    if (isMultiColor && !isProductMode) {
      const colIndex = usageAreaColumns.indexOf(cell.data.x);
      const baseColor = getColumnColor(colIndex >= 0 ? colIndex : 0);
      const maxV = Math.max(maxValue, 1);
      const intensity = Math.min(value / maxV, 1);
      const opacity = value > 0 ? 0.15 + intensity * 0.85 : 0.05;
      const fillColor = value > 0 ? baseColor : '#f8fafc';

      return (
        <g
          transform={`translate(${cell.x}, ${cell.y})`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: 'pointer' }}
        >
          <rect
            x={cell.width / -2}
            y={cell.height / -2}
            width={cell.width}
            height={cell.height}
            fill={fillColor}
            fillOpacity={opacity}
            strokeWidth={1}
            stroke="#e2e8f0"
            rx={4}
          />
          {cellLabel && (
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fill={intensity > 0.5 ? '#ffffff' : '#334155'}
              fontSize={11}
              fontWeight={600}
              style={{ pointerEvents: 'none' }}
            >
              {cellLabel}
            </text>
          )}
        </g>
      );
    }

    const defaultTextColor = isProductMode ? (value > 0 ? '#ffffff' : cell.labelTextColor) : cell.labelTextColor;

    return (
      <g
        transform={`translate(${cell.x}, ${cell.y})`}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: 'pointer' }}
      >
        <rect
          x={cell.width / -2}
          y={cell.height / -2}
          width={cell.width}
          height={cell.height}
          fill={cell.color}
          fillOpacity={cell.opacity}
          strokeWidth={1}
          stroke="#e2e8f0"
          rx={4}
        />
        {cellLabel && (
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill={defaultTextColor}
            fontSize={cellFontSize}
            fontWeight={cellFontWeight}
            style={{ pointerEvents: 'none' }}
          >
            {cellLabel}
          </text>
        )}
      </g>
    );
  }, [colorPalette, matrixMode, usageAreaColumns, getColumnColor, maxValue, handleCellClick]);

  const HighlightLayer = useCallback(({ cells }: any) => {
    if (!hoveredCell) return null;

    const matchingCells = cells.filter(
      (c: any) => c.serieId === hoveredCell.serieId || c.data.x === hoveredCell.dataX
    );

    if (matchingCells.length === 0) return null;

    const rowCells = cells.filter((c: any) => c.serieId === hoveredCell.serieId);
    const colCells = cells.filter((c: any) => c.data.x === hoveredCell.dataX);

    const rects: React.ReactElement[] = [];

    if (rowCells.length > 0) {
      const minX = Math.min(...rowCells.map((c: any) => c.x - c.width / 2));
      const maxX = Math.max(...rowCells.map((c: any) => c.x + c.width / 2));
      const y = rowCells[0].y - rowCells[0].height / 2;
      const h = rowCells[0].height;
      rects.push(
        <rect
          key="row-highlight"
          x={minX}
          y={y}
          width={maxX - minX}
          height={h}
          fill="rgba(59, 130, 246, 0.06)"
          pointerEvents="none"
        />
      );
    }

    if (colCells.length > 0) {
      const minY = Math.min(...colCells.map((c: any) => c.y - c.height / 2));
      const maxY = Math.max(...colCells.map((c: any) => c.y + c.height / 2));
      const x = colCells[0].x - colCells[0].width / 2;
      const w = colCells[0].width;
      rects.push(
        <rect
          key="col-highlight"
          x={x}
          y={minY}
          width={w}
          height={maxY - minY}
          fill="rgba(59, 130, 246, 0.06)"
          pointerEvents="none"
        />
      );
    }

    return <g>{rects}</g>;
  }, [hoveredCell]);

  const CustomTooltip = ({ cell }: { cell: any }) => {
    const data = activeData;
    const series = data.find(s => s.id === cell.serieId || s.categoryName === cell.serieId);
    const dataPoint = series?.data.find(d => d.x === cell.data.x);
    if (!dataPoint) return null;

    const { meta } = dataPoint;
    const supplierCount = meta.suppliers.size;
    const manufacturerCount = meta.manufacturers.size;

    if (matrixMode === 'product') {
      const product = meta.products[0];
      return (
        <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-4 min-w-[240px]">
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
            <div
              className="w-4 h-4 rounded-sm"
              style={{ backgroundColor: cell.color || '#3b82f6' }}
            />
            <div>
              <div className="font-bold text-slate-800">{product?.name || cell.serieId}</div>
              <div className="text-xs text-slate-500">{cell.data.x}</div>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Has Usage Area:</span>
              <span className={`font-bold ${dataPoint.y > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                {dataPoint.y > 0 ? 'Yes' : 'No'}
              </span>
            </div>
            {product && (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-500">Supplier:</span>
                  <span className="font-semibold text-slate-700">{product.supplier}</span>
                </div>
                {product.price > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Price:</span>
                    <span className="font-semibold text-green-600">{product.currency} {product.price.toFixed(2)}</span>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-blue-600 font-medium">
            Click to view product
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-4 min-w-[240px]">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
          <div
            className="w-4 h-4 rounded-sm"
            style={{ backgroundColor: cell.color }}
          />
          <div>
            <div className="font-bold text-slate-800">{series?.categoryName || cell.serieId}</div>
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

  const chartHeight = Math.max(400, activeData.length * 50 + 100);
  const leftMargin = matrixMode === 'product' ? 200 : 160;

  const chartTitle = matrixMode === 'category'
    ? 'Product Usage Density Matrix'
    : 'Product × Usage Area Matrix';

  const chartSubtitle = matrixMode === 'category'
    ? `${activeData.length} categories × ${usageAreaColumns.length} usage areas • Max: ${maxValue} products`
    : `${activeData.length} products × ${usageAreaColumns.length} usage areas`;

  const axisLeftLegend = matrixMode === 'category'
    ? categoryLevel.charAt(0).toUpperCase() + categoryLevel.slice(1)
    : 'Product';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setMatrixMode('category')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                matrixMode === 'category'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Category × Usage Area
            </button>
            <button
              onClick={() => setMatrixMode('product')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                matrixMode === 'product'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Product × Usage Area
            </button>
          </div>

          {matrixMode === 'category' && (
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-slate-600">Level:</span>
              <select
                value={categoryLevel}
                onChange={e => setCategoryLevel(e.target.value as any)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option key="sector" value="sector">Sector</option>
                <option key="category" value="category">Category</option>
                <option key="subcategory" value="subcategory">Sub-Category</option>
                <option key="group" value="group">Group</option>
                <option key="leaf" value="leaf">Leaf Level (Product Nodes)</option>
              </select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-slate-500" />
            <select
              value={colorPalette}
              onChange={e => setColorPalette(e.target.value as ColorPalette)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PALETTE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
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
            onClick={handleDownloadImage}
            disabled={isCapturing}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            title="Download chart as image"
          >
            {isCapturing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
          </button>
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
                <option key="all-suppliers" value="">All Suppliers</option>
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
                <option key="all-manufacturers" value="">All Manufacturers</option>
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
          title={chartTitle}
          subtitle={chartSubtitle}
          isEmpty={activeData.length === 0 || activeData.every(d => d.data.every(p => p.y === 0))}
          emptyMessage="No products match the current filters"
          height={chartHeight}
        >
          <ResponsiveHeatMap
            data={activeData}
            margin={{ top: 80, right: 90, bottom: 30, left: leftMargin }}
            valueFormat=">-.0f"
            axisTop={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: -55,
              legend: 'Usage Areas',
              legendOffset: -55,
              legendPosition: 'middle'
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: axisLeftLegend,
              legendPosition: 'middle',
              legendOffset: -(leftMargin - 20),
              truncateTickAt: 18,
              format: (v: string) => seriesIdToName[v] || v
            }}
            colors={colorsConfig}
            emptyColor="#f8fafc"
            borderColor="#e2e8f0"
            borderWidth={1}
            borderRadius={4}
            enableLabels={colorPalette !== 'multi'}
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
                title: matrixMode === 'category' ? 'Products →' : 'X = Assigned',
                titleAlign: 'start',
                titleOffset: 4
              }
            ]}
            annotations={[]}
            onClick={handleCellClick}
            tooltip={CustomTooltip}
            theme={nivoTheme}
            hoverTarget="cell"
            cellComponent={CustomCellComponent}
            layers={['grid', 'axes', HighlightLayer, 'cells', 'legends', 'annotations']}
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
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Usage Areas</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Price</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drillDown.products.map((product, idx) => {
                    const productAreas = getProductUsageAreas(product);
                    const isEditingUsage = editingUsageProductId === product.id;
                    return (
                      <tr key={product.id} className="hover:bg-slate-50 group">
                        <td className="px-4 py-3 text-sm text-slate-600 font-mono">{product.id}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{product.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{product.supplier}</td>
                        <td className="px-4 py-3">
                          {isEditingUsage ? (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-1">
                                {USAGE_AREAS.map(area => {
                                  const isSelected = productAreas.includes(area);
                                  return (
                                    <button
                                      key={area}
                                      onClick={() => handleToggleUsageArea(product, area)}
                                      className={`px-2 py-0.5 text-xs rounded-full transition-all ${
                                        isSelected
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                                      {area}
                                    </button>
                                  );
                                })}
                              </div>
                              <button
                                onClick={() => setEditingUsageProductId(null)}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Done
                              </button>
                            </div>
                          ) : (
                            <div
                              className="flex flex-wrap gap-1 cursor-pointer group/usage"
                              onClick={() => setEditingUsageProductId(product.id)}
                              title="Click to edit usage areas"
                            >
                              {productAreas.length > 0 ? (
                                productAreas.map(area => (
                                  <span
                                    key={area}
                                    className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"
                                  >
                                    {area}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-slate-400 italic">No areas</span>
                              )}
                              <Tag className="w-3 h-3 text-slate-400 opacity-0 group-hover/usage:opacity-100 transition-opacity ml-1" />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {product.currency} {product.price.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEditProduct(product)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit product"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDuplicateProduct(product)}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Duplicate product"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeletingProduct(product)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete product"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {editingProduct && currentUser && onAddFieldDefinition && onAddTreeNode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <ProductForm
              initialProduct={editingProduct}
              mode="edit"
              onSubmit={handleProductFormSubmit}
              onCancel={() => setEditingProduct(null)}
              currentUser={currentUser}
              customFields={customFields}
              treeNodes={treeNodes}
              suppliers={suppliers}
              onAddFieldDefinition={onAddFieldDefinition}
              onAddTreeNode={onAddTreeNode}
            />
          </div>
        </div>
      )}

      {duplicatingProduct && currentUser && onAddFieldDefinition && onAddTreeNode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <ProductForm
              initialProduct={duplicatingProduct}
              mode="create"
              onSubmit={handleProductFormSubmit}
              onCancel={() => setDuplicatingProduct(null)}
              currentUser={currentUser}
              customFields={customFields}
              treeNodes={treeNodes}
              suppliers={suppliers}
              onAddFieldDefinition={onAddFieldDefinition}
              onAddTreeNode={onAddTreeNode}
            />
          </div>
        </div>
      )}

      {deletingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Delete Product</h3>
                <p className="text-sm text-slate-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-slate-600 mb-6">
              Are you sure you want to delete <span className="font-semibold">{deletingProduct.name}</span>?
              This will permanently remove the product from your inventory.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingProduct(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProduct}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductUsageHeatmap;
