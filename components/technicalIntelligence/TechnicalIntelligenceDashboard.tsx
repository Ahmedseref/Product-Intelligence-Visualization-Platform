import React, { useState, useEffect, useCallback, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsivePie } from '@nivo/pie';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { ResponsiveRadar } from '@nivo/radar';
import { ResponsiveScatterPlot } from '@nivo/scatterplot';
import { ResponsiveTreeMap } from '@nivo/treemap';
import { nivoTheme, CHART_COLORS } from '../charts/NivoChartWrapper';
import { analyticsApi } from '../../client/api';
import { Product, TreeNode, Supplier, CustomField, User } from '../../types';
import ProductUsageHeatmap from '../visualizations/ProductUsageHeatmap';
import {
  BarChart3, TrendingUp, Package, Users, Layers, Grid3X3,
  RefreshCw, Download, Filter, ChevronDown, Activity, Target,
  Radar, GitBranch, Award, Loader2, AlertCircle, X,
  Building2, Boxes, Network, Cpu, Shield, Zap, PieChart
} from 'lucide-react';

interface ErrorBoundaryProps { children: ReactNode }
interface ErrorBoundaryState { hasError: boolean; error: Error | null }

class DashboardErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Dashboard Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md p-8">
            <AlertCircle className="mx-auto mb-4 text-red-400" size={48} />
            <h2 className="text-lg font-bold text-slate-700 mb-2">Dashboard Error</h2>
            <p className="text-sm text-slate-500 mb-4">
              Something went wrong while rendering the dashboard. This is usually caused by unexpected data formats.
            </p>
            <p className="text-xs text-red-400 mb-4 font-mono bg-red-50 p-2 rounded">{this.state.error?.message}</p>
            <button
              onClick={() => { (this as any).setState({ hasError: false, error: null }); }}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

type DashboardTab = 'overview' | 'product' | 'system' | 'supplier-heatmap' | 'taxonomy' | 'coverage' | 'benchmark' | 'usage-density';

const TAB_CONFIG: { id: DashboardTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Activity size={16} /> },
  { id: 'product', label: 'Product Intelligence', icon: <Package size={16} /> },
  { id: 'system', label: 'System Intelligence', icon: <Layers size={16} /> },
  { id: 'supplier-heatmap', label: 'Supplier Matrix', icon: <Grid3X3 size={16} /> },
  { id: 'taxonomy', label: 'Taxonomy & Supplier', icon: <GitBranch size={16} /> },
  { id: 'usage-density', label: 'Usage Density', icon: <PieChart size={16} /> },
  { id: 'coverage', label: 'Technical Coverage', icon: <Radar size={16} /> },
  { id: 'benchmark', label: 'Competitive Benchmark', icon: <Award size={16} /> },
];

interface TechnicalIntelligenceDashboardProps {
  products?: Product[];
  treeNodes?: TreeNode[];
  suppliers?: Supplier[];
  customFields?: CustomField[];
  currentUser?: User;
  usageAreas?: string[];
  onProductUpdate?: (product: Product) => void;
  onProductDelete?: (productId: string) => void;
  onAddFieldDefinition?: (field: CustomField) => void;
  onAddTreeNode?: (node: TreeNode) => void;
}

const TechnicalIntelligenceDashboard: React.FC<TechnicalIntelligenceDashboardProps> = ({
  products = [],
  treeNodes = [],
  suppliers: suppliersProp = [],
  customFields = [],
  currentUser,
  usageAreas = [],
  onProductUpdate,
  onProductDelete,
  onAddFieldDefinition,
  onAddTreeNode,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [loading, setLoading] = useState(false);
  const [overviewData, setOverviewData] = useState<any>(null);
  const [productData, setProductData] = useState<any>(null);
  const [systemData, setSystemData] = useState<any>(null);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [heatmapMode, setHeatmapMode] = useState('supplier-system');
  const [taxonomyData, setTaxonomyData] = useState<any>(null);
  const [coverageData, setCoverageData] = useState<any>(null);
  const [benchmarkData, setBenchmarkData] = useState<any>(null);
  const [selectedBenchmarkSystem, setSelectedBenchmarkSystem] = useState<string>('');
  const [filters, setFilters] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{ supplier?: string; sector?: string; taxonomy?: string }>({});

  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;

  const categoryDistribution = useMemo(() => {
    if (!products || products.length === 0 || !treeNodes || treeNodes.length === 0) return [];
    const rootNodes = treeNodes.filter(n => !n.parentId);
    const getDescendantIds = (nodeId: string): string[] => {
      const result = [nodeId];
      const children = treeNodes.filter(n => n.parentId === nodeId);
      for (const child of children) {
        result.push(...getDescendantIds(child.id));
      }
      return result;
    };
    const distribution = rootNodes.map(root => {
      const descendantIds = getDescendantIds(root.id);
      const count = products.filter(p => p.nodeId && descendantIds.includes(p.nodeId)).length;
      return { id: root.name, label: root.name, value: count };
    }).filter(d => d.value > 0);
    const uncategorized = products.filter(p => !p.nodeId).length;
    if (uncategorized > 0) {
      distribution.push({ id: 'Uncategorized', label: 'Uncategorized', value: uncategorized });
    }
    return distribution;
  }, [products, treeNodes]);

  const loadTabData = useCallback(async (tab: DashboardTab) => {
    setLoading(true);
    setError(null);
    const f = activeFilterCount > 0 ? activeFilters : undefined;
    try {
      switch (tab) {
        case 'overview': {
          const [overview, filtersData] = await Promise.all([
            analyticsApi.getOverview(f),
            analyticsApi.getFilters(),
          ]);
          setOverviewData(overview);
          setFilters(filtersData);
          break;
        }
        case 'product': {
          const data = await analyticsApi.getProductIntelligence(f);
          setProductData(data);
          break;
        }
        case 'system': {
          const data = await analyticsApi.getSystemIntelligence(f);
          setSystemData(data);
          break;
        }
        case 'supplier-heatmap': {
          const data = await analyticsApi.getSupplierHeatmap(heatmapMode, f);
          setHeatmapData(data);
          break;
        }
        case 'taxonomy': {
          const data = await analyticsApi.getTaxonomySupplier(f);
          setTaxonomyData(data);
          break;
        }
        case 'coverage': {
          const data = await analyticsApi.getCoverageRadar(f);
          setCoverageData(data);
          break;
        }
        case 'benchmark': {
          const data = await analyticsApi.getCompetitiveBenchmark(selectedBenchmarkSystem || undefined, f);
          setBenchmarkData(data);
          break;
        }
      }
    } catch (err: any) {
      console.error('Failed to load tab data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [heatmapMode, selectedBenchmarkSystem, activeFilters, activeFilterCount]);

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  useEffect(() => {
    if (!filters) {
      analyticsApi.getFilters().then(setFilters).catch(() => {});
    }
  }, []);

  const handleHeatmapModeChange = async (mode: string) => {
    setHeatmapMode(mode);
    setLoading(true);
    const f = activeFilterCount > 0 ? activeFilters : undefined;
    try {
      const data = await analyticsApi.getSupplierHeatmap(mode, f);
      setHeatmapData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBenchmarkSystemChange = async (systemId: string) => {
    setSelectedBenchmarkSystem(systemId);
    setLoading(true);
    const f = activeFilterCount > 0 ? activeFilters : undefined;
    try {
      const data = await analyticsApi.getCompetitiveBenchmark(systemId || undefined, f);
      setBenchmarkData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportChart = (chartId: string, format: 'png' | 'svg' | 'csv') => {
    const el = document.getElementById(chartId);
    if (!el) return;

    if (format === 'svg') {
      const svg = el.querySelector('svg');
      if (svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${chartId}.svg`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } else if (format === 'png') {
      const svg = el.querySelector('svg');
      if (svg) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const svgData = new XMLSerializer().serializeToString(svg);
        const img = new Image();
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        img.onload = () => {
          canvas.width = img.width * 2;
          canvas.height = img.height * 2;
          ctx!.scale(2, 2);
          ctx!.fillStyle = '#ffffff';
          ctx!.fillRect(0, 0, canvas.width, canvas.height);
          ctx!.drawImage(img, 0, 0);
          const pngUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `${chartId}.png`;
          a.click();
          URL.revokeObjectURL(url);
        };
        img.src = url;
      }
    }
  };

  const exportCsv = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    for (const row of data) {
      csvRows.push(headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportHeatmapCsv = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;
    const cols = data[0]?.data?.map((d: any) => d.x) || [];
    const csvRows = [',' + cols.join(',')];
    for (const row of data) {
      csvRows.push(row.id + ',' + row.data.map((d: any) => d.y).join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ChartExportBar: React.FC<{ chartId: string; title?: string; csvData?: any[]; csvFilename?: string; isHeatmap?: boolean }> = ({ chartId, title, csvData, csvFilename, isHeatmap }) => (
    <div className="flex items-center gap-1">
      {title && <span className="text-xs text-slate-400 mr-2">{title}</span>}
      <button onClick={() => exportChart(chartId, 'png')} className="px-2 py-1 text-[10px] bg-slate-100 text-slate-500 rounded hover:bg-slate-200 transition-colors">PNG</button>
      <button onClick={() => exportChart(chartId, 'svg')} className="px-2 py-1 text-[10px] bg-slate-100 text-slate-500 rounded hover:bg-slate-200 transition-colors">SVG</button>
      {csvData && csvData.length > 0 && (
        <button
          onClick={() => isHeatmap ? exportHeatmapCsv(csvData, csvFilename || chartId) : exportCsv(csvData, csvFilename || chartId)}
          className="px-2 py-1 text-[10px] bg-slate-100 text-slate-500 rounded hover:bg-slate-200 transition-colors"
        >CSV</button>
      )}
    </div>
  );

  const LoadingState = () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      <span className="ml-3 text-slate-500">Loading analytics...</span>
    </div>
  );

  const EmptyState: React.FC<{ message: string; icon?: React.ReactNode }> = ({ message, icon }) => (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      {icon || <AlertCircle size={40} className="mb-3 opacity-40" />}
      <p className="text-sm font-medium mt-2">{message}</p>
      <p className="text-xs mt-1">Add more data to your platform to see insights</p>
    </div>
  );

  const renderOverview = () => {
    if (!overviewData) return <LoadingState />;

    const kpis = [
      { label: 'Total Products', value: overviewData.totalProducts, icon: <Package size={20} />, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
      { label: 'Total Systems', value: overviewData.totalSystems, icon: <Layers size={20} />, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
      { label: 'Total Suppliers', value: overviewData.totalSuppliers, icon: <Building2 size={20} />, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
      { label: 'System Variants', value: overviewData.totalSystemVariants, icon: <Boxes size={20} />, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
      { label: 'Avg Suppliers/System', value: overviewData.avgSuppliersPerSystem, icon: <Users size={20} />, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-100' },
      { label: 'Multi-Supplier Systems', value: `${overviewData.multiSupplierSystemsPct}%`, icon: <Network size={20} />, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' },
      { label: 'Multi-Source Products', value: overviewData.productsWithMultipleSuppliers, icon: <Zap size={20} />, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
      { label: 'Equivalent Products', value: overviewData.systemsWithEquivalentProducts, icon: <Shield size={20} />, color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100' },
      { label: 'Tech Coverage', value: `${overviewData.supplierTechCoverage}%`, icon: <Cpu size={20} />, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
      { label: 'Dominant Supplier', value: overviewData.dominantSupplier, icon: <Award size={20} />, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
      { label: 'Most Diverse System', value: overviewData.mostDiverseSystem, icon: <Target size={20} />, color: 'text-pink-600', bg: 'bg-pink-50', border: 'border-pink-100' },
      { label: 'Concentration Index', value: `${overviewData.supplierConcentrationIndex}%`, icon: <Activity size={20} />, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-100' },
    ];

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {kpis.map((kpi, idx) => (
            <div key={idx} className={`${kpi.bg} ${kpi.border} border rounded-xl p-4 hover:shadow-md transition-shadow`}>
              <div className={`${kpi.color} mb-2`}>{kpi.icon}</div>
              <p className="text-[11px] font-medium text-slate-500 leading-tight">{kpi.label}</p>
              <p className={`text-lg font-bold ${kpi.color} mt-1 truncate`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-700 mb-3">Platform Summary</h3>
            <div className="space-y-3">
              {[
                { label: 'Taxonomy Nodes', value: overviewData.totalTaxonomyNodes, width: '85%' },
                { label: 'System Layers', value: overviewData.totalLayers, width: '60%' },
                { label: 'Product-Layer Links', value: overviewData.totalProductOptions, width: '75%' },
                { label: 'Products in Systems', value: overviewData.uniqueProductsInSystems, width: '45%' },
              ].map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">{item.label}</span>
                    <span className="font-semibold text-slate-700">{item.value}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all" style={{ width: item.width }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {filters && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Data Distribution</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <p className="text-xs text-blue-600 font-medium">Suppliers</p>
                  <p className="text-2xl font-bold text-blue-700">{filters.suppliers?.length || 0}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                  <p className="text-xs text-emerald-600 font-medium">Systems</p>
                  <p className="text-2xl font-bold text-emerald-700">{filters.systems?.length || 0}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                  <p className="text-xs text-amber-600 font-medium">Sectors</p>
                  <p className="text-2xl font-bold text-amber-700">{filters.sectors?.length || 0}</p>
                </div>
                <div className="bg-violet-50 rounded-lg p-3 border border-violet-100">
                  <p className="text-xs text-violet-600 font-medium">Tax. Branches</p>
                  <p className="text-2xl font-bold text-violet-700">{filters.taxonomyBranches?.length || 0}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {categoryDistribution.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-700">Category Distribution</h3>
                <p className="text-xs text-slate-400 mt-0.5">Products distributed across top-level taxonomy branches</p>
              </div>
              <ChartExportBar chartId="category-dist-pie" csvData={categoryDistribution} csvFilename="category-distribution" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div id="category-dist-pie" style={{ height: 320 }}>
                <ResponsivePie
                  data={categoryDistribution}
                  margin={{ top: 30, right: 80, bottom: 30, left: 80 }}
                  innerRadius={0.5}
                  padAngle={1}
                  cornerRadius={4}
                  activeOuterRadiusOffset={8}
                  colors={{ scheme: 'paired' }}
                  borderWidth={1}
                  borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
                  arcLinkLabelsSkipAngle={10}
                  arcLinkLabelsTextColor="#334155"
                  arcLinkLabelsThickness={2}
                  arcLinkLabelsColor={{ from: 'color' }}
                  arcLabelsSkipAngle={10}
                  arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
                  theme={nivoTheme}
                />
              </div>
              <div className="flex flex-col justify-center space-y-2">
                {categoryDistribution.map((cat, i) => (
                  <div key={cat.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ['#a6cee3','#1f78b4','#b2df8a','#33a02c','#fb9a99','#e31a1c','#fdbf6f','#ff7f00','#cab2d6','#6a3d9a','#ffff99','#b15928'][i % 12] }} />
                    <span className="text-xs font-medium text-slate-700 flex-1 truncate">{cat.label}</span>
                    <span className="text-xs font-bold text-slate-600">{cat.value}</span>
                    <span className="text-[10px] text-slate-400">({products.length > 0 ? Math.round((cat.value / products.length) * 100) : 0}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderProductIntelligence = () => {
    if (!productData) return <LoadingState />;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-700">Product Utilization by Supplier</h3>
              <ChartExportBar chartId="product-util-chart" csvData={productData.productUtilBySupplier} csvFilename="product-utilization" />
            </div>
            <div id="product-util-chart" style={{ height: 350 }}>
              {productData.productUtilBySupplier?.length > 0 ? (
                <ResponsiveBar
                  data={productData.productUtilBySupplier}
                  keys={productData.supplierKeys || []}
                  indexBy="product"
                  margin={{ top: 10, right: 130, bottom: 60, left: 60 }}
                  padding={0.3}
                  groupMode="stacked"
                  colors={CHART_COLORS.categorical}
                  axisBottom={{ tickSize: 0, tickPadding: 5, tickRotation: -35 }}
                  axisLeft={{ tickSize: 0, tickPadding: 8, legend: 'System Count', legendPosition: 'middle', legendOffset: -45 }}
                  legends={[{
                    dataFrom: 'keys', anchor: 'bottom-right', direction: 'column',
                    translateX: 120, itemWidth: 100, itemHeight: 18, itemTextColor: '#64748b',
                    symbolSize: 10, symbolShape: 'circle',
                  }]}
                  theme={nivoTheme as any}
                  animate={true}
                />
              ) : (
                <EmptyState message="No product utilization data yet" icon={<Package size={36} className="opacity-30" />} />
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-700">Supplier Dependency</h3>
              <ChartExportBar chartId="supplier-dep-chart" csvData={productData.supplierDependency} csvFilename="supplier-dependency" />
            </div>
            <div id="supplier-dep-chart" style={{ height: 350 }}>
              {productData.supplierDependency?.length > 0 ? (
                <ResponsivePie
                  data={productData.supplierDependency}
                  margin={{ top: 20, right: 20, bottom: 60, left: 20 }}
                  innerRadius={0.55}
                  padAngle={2}
                  cornerRadius={4}
                  colors={['#ef4444', '#f59e0b', '#22c55e']}
                  borderWidth={1}
                  borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
                  arcLinkLabelsSkipAngle={10}
                  arcLinkLabelsTextColor="#64748b"
                  arcLinkLabelsColor={{ from: 'color' }}
                  arcLabelsSkipAngle={10}
                  arcLabelsTextColor="#ffffff"
                  legends={[{
                    anchor: 'bottom', direction: 'row', translateY: 50,
                    itemWidth: 90, itemHeight: 18, symbolSize: 10, symbolShape: 'circle',
                    itemTextColor: '#64748b',
                  }]}
                  theme={nivoTheme as any}
                />
              ) : (
                <EmptyState message="No dependency data" icon={<Shield size={36} className="opacity-30" />} />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSystemIntelligence = () => {
    if (!systemData) return <LoadingState />;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-700">System Supplier Variants</h3>
              <ChartExportBar chartId="sys-variants-chart" csvData={systemData.systemVariants} csvFilename="system-variants" />
            </div>
            <div id="sys-variants-chart" style={{ height: 320 }}>
              {systemData.systemVariants?.length > 0 ? (
                <ResponsiveBar
                  data={systemData.systemVariants}
                  keys={['variants', 'supplierCount', 'productCount']}
                  indexBy="name"
                  margin={{ top: 10, right: 130, bottom: 60, left: 50 }}
                  padding={0.3}
                  groupMode="grouped"
                  colors={['#3b82f6', '#10b981', '#f59e0b']}
                  axisBottom={{ tickSize: 0, tickPadding: 5, tickRotation: -30 }}
                  axisLeft={{ tickSize: 0, tickPadding: 8 }}
                  legends={[{
                    dataFrom: 'keys', anchor: 'bottom-right', direction: 'column',
                    translateX: 120, itemWidth: 110, itemHeight: 18, symbolSize: 10, symbolShape: 'circle',
                    itemTextColor: '#64748b',
                  }]}
                  theme={nivoTheme as any}
                  animate={true}
                />
              ) : (
                <EmptyState message="No system data available" />
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-700">Complexity vs Supplier Diversity</h3>
              <ChartExportBar chartId="complexity-scatter" csvData={systemData.complexityScatter?.flatMap((s: any) => s.data?.map((d: any) => ({ group: s.id, x: d.x, y: d.y })) || [])} csvFilename="complexity-scatter" />
            </div>
            <div id="complexity-scatter" style={{ height: 320 }}>
              {systemData.complexityScatter?.[0]?.data?.length > 0 ? (
                <ResponsiveScatterPlot
                  data={systemData.complexityScatter}
                  margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
                  xScale={{ type: 'linear', min: 0, max: 'auto' }}
                  yScale={{ type: 'linear', min: 0, max: 'auto' }}
                  axisBottom={{ tickSize: 0, tickPadding: 8, legend: 'Layer Count', legendPosition: 'middle', legendOffset: 45 }}
                  axisLeft={{ tickSize: 0, tickPadding: 8, legend: 'Supplier Count', legendPosition: 'middle', legendOffset: -45 }}
                  colors={['#3b82f6']}
                  nodeSize={12}
                  theme={nivoTheme as any}
                  animate={true}
                  tooltip={({ node }) => (
                    <div className="bg-white px-3 py-2 rounded-lg shadow-lg border text-xs">
                      <strong>{(node.data as any).name}</strong>
                      <div className="text-slate-500 mt-1">Layers: {node.data.x} | Suppliers: {node.data.y}</div>
                    </div>
                  )}
                />
              ) : (
                <EmptyState message="No complexity data" />
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-700">Layer Supplier Flexibility</h3>
            <ChartExportBar chartId="layer-flex-chart" csvData={systemData.layerFlexibility} csvFilename="layer-flexibility" />
          </div>
          <div id="layer-flex-chart" style={{ height: 300 }}>
            {systemData.layerFlexibility?.length > 0 ? (
              <ResponsiveBar
                data={systemData.layerFlexibility}
                keys={systemData.layerFlexKeys || []}
                indexBy="layerType"
                margin={{ top: 10, right: 140, bottom: 50, left: 80 }}
                padding={0.3}
                layout="horizontal"
                groupMode="stacked"
                colors={CHART_COLORS.categorical}
                axisBottom={{ tickSize: 0, tickPadding: 5 }}
                axisLeft={{ tickSize: 0, tickPadding: 8 }}
                legends={[{
                  dataFrom: 'keys', anchor: 'bottom-right', direction: 'column',
                  translateX: 130, itemWidth: 120, itemHeight: 18, symbolSize: 10, symbolShape: 'circle',
                  itemTextColor: '#64748b',
                }]}
                theme={nivoTheme as any}
                animate={true}
              />
            ) : (
              <EmptyState message="No layer flexibility data" />
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSupplierHeatmap = () => {
    const heatmapModes = [
      { value: 'supplier-system', label: 'Supplier ↔ System' },
      { value: 'supplier-layer', label: 'Supplier ↔ Layer Type' },
      { value: 'supplier-sector', label: 'Supplier ↔ Sector' },
      { value: 'supplier-taxonomy', label: 'Supplier ↔ Taxonomy' },
      { value: 'supplier-stockcode', label: 'Supplier ↔ Stock Code' },
      { value: 'supplier-complexity', label: 'Supplier ↔ Complexity' },
    ];

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-700">Supplier Comparison Intelligence</h3>
              <p className="text-xs text-slate-400 mt-0.5">Select matrix axes to compare suppliers across different dimensions</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={heatmapMode}
                onChange={(e) => handleHeatmapModeChange(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                {heatmapModes.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <ChartExportBar chartId="supplier-heatmap" csvData={heatmapData} csvFilename={`supplier-${heatmapMode}`} isHeatmap={true} />
            </div>
          </div>
          <div id="supplier-heatmap" style={{ height: Math.max(300, (heatmapData.length || 1) * 50 + 80) }}>
            {loading ? (
              <LoadingState />
            ) : heatmapData.length > 0 ? (
              <ResponsiveHeatMap
                data={heatmapData}
                margin={{ top: 10, right: 20, bottom: 70, left: 140 }}
                axisTop={null}
                axisBottom={{ tickSize: 0, tickPadding: 5, tickRotation: -35 }}
                axisLeft={{ tickSize: 0, tickPadding: 8 }}
                colors={{ type: 'sequential', scheme: 'blues' }}
                emptyColor="#f8fafc"
                borderWidth={1}
                borderColor="#e2e8f0"
                labelTextColor={{ from: 'color', modifiers: [['darker', 3]] }}
                theme={nivoTheme as any}
                animate={true}
                hoverTarget="cell"
                tooltip={({ cell }) => (
                  <div className="bg-white px-3 py-2 rounded-lg shadow-lg border text-xs">
                    <div className="font-semibold">{cell.serieId} → {cell.data.x}</div>
                    <div className="text-slate-500 mt-1">Value: <strong className="text-blue-600">{cell.data.y}</strong></div>
                  </div>
                )}
              />
            ) : (
              <EmptyState
                message={`No data for ${heatmapModes.find(m => m.value === heatmapMode)?.label || 'this view'}`}
                icon={<Grid3X3 size={40} className="opacity-30" />}
              />
            )}
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-4">
          <h4 className="text-xs font-bold text-blue-700 mb-2">Matrix Guide</h4>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {heatmapModes.map(m => (
              <button
                key={m.value}
                onClick={() => handleHeatmapModeChange(m.value)}
                className={`text-left text-[11px] px-3 py-2 rounded-lg border transition-all ${
                  heatmapMode === m.value
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderTaxonomySupplier = () => {
    if (!taxonomyData) return <LoadingState />;

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-700">Branch Supplier Distribution</h3>
            <ChartExportBar chartId="branch-dist-chart" csvData={taxonomyData.branchDistribution} csvFilename="branch-distribution" />
          </div>
          <div id="branch-dist-chart" style={{ height: 320 }}>
            {taxonomyData.branchDistribution?.length > 0 ? (
              <ResponsiveBar
                data={taxonomyData.branchDistribution}
                keys={taxonomyData.branchKeys || []}
                indexBy="branch"
                margin={{ top: 10, right: 140, bottom: 60, left: 80 }}
                padding={0.3}
                groupMode="stacked"
                colors={CHART_COLORS.categorical}
                axisBottom={{ tickSize: 0, tickPadding: 5, tickRotation: -30 }}
                axisLeft={{ tickSize: 0, tickPadding: 8, legend: 'Product Count', legendPosition: 'middle', legendOffset: -55 }}
                legends={[{
                  dataFrom: 'keys', anchor: 'bottom-right', direction: 'column',
                  translateX: 130, itemWidth: 120, itemHeight: 18, symbolSize: 10, symbolShape: 'circle',
                  itemTextColor: '#64748b',
                }]}
                theme={nivoTheme as any}
                animate={true}
              />
            ) : (
              <EmptyState message="No taxonomy data" icon={<GitBranch size={36} className="opacity-30" />} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-700">Supplier Specialization Map</h3>
              <ChartExportBar chartId="treemap-chart" csvData={taxonomyData.branchDistribution} csvFilename="supplier-treemap" />
            </div>
            <div id="treemap-chart" style={{ height: 350 }}>
              {taxonomyData.treemapData?.children?.length > 0 ? (
                <ResponsiveTreeMap
                  data={taxonomyData.treemapData}
                  identity="name"
                  value="value"
                  margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                  labelSkipSize={30}
                  labelTextColor={{ from: 'color', modifiers: [['darker', 2.5]] }}
                  parentLabelTextColor={{ from: 'color', modifiers: [['darker', 3]] }}
                  colors={CHART_COLORS.categorical}
                  borderWidth={2}
                  borderColor={{ from: 'color', modifiers: [['darker', 0.3]] }}
                  theme={nivoTheme as any}
                  animate={true}
                />
              ) : (
                <EmptyState message="No supplier specialization data" />
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-700">Stock Code vs Supplier</h3>
              <ChartExportBar chartId="stockcode-heatmap" csvData={taxonomyData.stockCodeHeatmap} csvFilename="stockcode-supplier" isHeatmap={true} />
            </div>
            <div id="stockcode-heatmap" style={{ height: 350 }}>
              {taxonomyData.stockCodeHeatmap?.length > 0 ? (
                <ResponsiveHeatMap
                  data={taxonomyData.stockCodeHeatmap}
                  margin={{ top: 10, right: 20, bottom: 60, left: 100 }}
                  axisTop={null}
                  axisBottom={{ tickSize: 0, tickPadding: 5, tickRotation: -30 }}
                  axisLeft={{ tickSize: 0, tickPadding: 8 }}
                  colors={{ type: 'sequential', scheme: 'purples' }}
                  emptyColor="#f8fafc"
                  borderWidth={1}
                  borderColor="#e2e8f0"
                  labelTextColor={{ from: 'color', modifiers: [['darker', 3]] }}
                  theme={nivoTheme as any}
                  animate={true}
                />
              ) : (
                <EmptyState message="No stock code data" />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCoverage = () => {
    if (!coverageData) return <LoadingState />;

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-700">Supplier Technical Depth Score</h3>
              <p className="text-xs text-slate-400 mt-0.5">Radar comparison of supplier capabilities across 6 dimensions (top 5 suppliers)</p>
            </div>
            <ChartExportBar chartId="radar-chart" csvData={coverageData?.radarData} csvFilename="coverage-radar" />
          </div>
          <div id="radar-chart" style={{ height: 450 }}>
            {coverageData.radarData?.length > 0 && coverageData.supplierKeys?.length > 0 ? (
              <ResponsiveRadar
                data={coverageData.radarData}
                keys={coverageData.supplierKeys}
                indexBy="dimension"
                maxValue={100}
                margin={{ top: 40, right: 80, bottom: 40, left: 80 }}
                curve="linearClosed"
                borderWidth={2}
                borderColor={{ from: 'color' }}
                gridLevels={5}
                gridShape="circular"
                gridLabelOffset={20}
                dotSize={8}
                dotColor={{ theme: 'background' }}
                dotBorderWidth={2}
                dotBorderColor={{ from: 'color' }}
                colors={CHART_COLORS.categorical}
                fillOpacity={0.15}
                blendMode="normal"
                legends={[{
                  anchor: 'top-left', direction: 'column',
                  translateX: -50, translateY: -30,
                  itemWidth: 100, itemHeight: 18, symbolSize: 10, symbolShape: 'circle',
                  itemTextColor: '#64748b',
                }]}
                theme={nivoTheme as any}
                animate={true}
              />
            ) : (
              <EmptyState message="No coverage data - add suppliers with products to see radar" icon={<Radar size={40} className="opacity-30" />} />
            )}
          </div>
        </div>

        {coverageData.supplierKeys?.length > 0 && (
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 p-4">
            <h4 className="text-xs font-bold text-indigo-700 mb-2">Dimension Guide</h4>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-[11px] text-slate-600">
              <div><strong>Sector Coverage:</strong> % of sectors reached</div>
              <div><strong>Layer Coverage:</strong> % of layer types served</div>
              <div><strong>System Complexity:</strong> Presence in complex (3+ layer) systems</div>
              <div><strong>Taxonomy Depth:</strong> How deep in taxonomy products go</div>
              <div><strong>Product Variety:</strong> Share of total product catalog</div>
              <div><strong>System Reusability:</strong> % of systems using supplier products</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderBenchmark = () => {
    if (!benchmarkData) return <LoadingState />;

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-700">Competitive System Benchmark</h3>
              <p className="text-xs text-slate-400 mt-0.5">Compare same system across different suppliers</p>
            </div>
            {filters?.systems && (
              <select
                value={selectedBenchmarkSystem}
                onChange={(e) => handleBenchmarkSystemChange(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="">All Systems Overview</option>
                {filters.systems.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          {selectedBenchmarkSystem && benchmarkData.radarData ? (
            <div>
              <div className="mb-3 px-2">
                <span className="text-xs font-semibold text-slate-600">Analyzing: </span>
                <span className="text-xs text-blue-600 font-bold">{benchmarkData.system}</span>
                {benchmarkData.supplierKeys?.length > 0 && (
                  <span className="text-xs text-slate-400 ml-2">({benchmarkData.supplierKeys.length} suppliers)</span>
                )}
              </div>
              <div id="benchmark-radar" style={{ height: 400 }}>
                {benchmarkData.supplierKeys?.length > 0 ? (
                  <ResponsiveRadar
                    data={benchmarkData.radarData}
                    keys={benchmarkData.supplierKeys}
                    indexBy="dimension"
                    maxValue={100}
                    margin={{ top: 40, right: 80, bottom: 40, left: 80 }}
                    curve="linearClosed"
                    borderWidth={2}
                    borderColor={{ from: 'color' }}
                    gridLevels={5}
                    gridShape="circular"
                    gridLabelOffset={20}
                    dotSize={8}
                    dotColor={{ theme: 'background' }}
                    dotBorderWidth={2}
                    dotBorderColor={{ from: 'color' }}
                    colors={CHART_COLORS.categorical}
                    fillOpacity={0.2}
                    legends={[{
                      anchor: 'top-left', direction: 'column',
                      translateX: -50, translateY: -30,
                      itemWidth: 100, itemHeight: 18, symbolSize: 10, symbolShape: 'circle',
                      itemTextColor: '#64748b',
                    }]}
                    theme={nivoTheme as any}
                    animate={true}
                  />
                ) : (
                  <EmptyState message="No supplier data for this system" />
                )}
              </div>
            </div>
          ) : (
            <div>
              {benchmarkData.systems?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-3 font-semibold text-slate-600">System</th>
                        <th className="text-center py-2 px-3 font-semibold text-slate-600">Layers</th>
                        <th className="text-center py-2 px-3 font-semibold text-slate-600">Products</th>
                        <th className="text-center py-2 px-3 font-semibold text-slate-600">Suppliers</th>
                        <th className="text-center py-2 px-3 font-semibold text-slate-600">Defaults</th>
                        <th className="text-center py-2 px-3 font-semibold text-slate-600">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {benchmarkData.systems.map((sys: any) => (
                        <tr key={sys.systemId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 px-3 font-medium text-slate-700">{sys.name}</td>
                          <td className="text-center py-2 px-3 text-slate-500">{sys.layerCount}</td>
                          <td className="text-center py-2 px-3 text-slate-500">{sys.productCount}</td>
                          <td className="text-center py-2 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              sys.supplierCount > 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {sys.supplierCount}
                            </span>
                          </td>
                          <td className="text-center py-2 px-3 text-slate-500">{sys.defaultProducts}</td>
                          <td className="text-center py-2 px-3">
                            <button
                              onClick={() => handleBenchmarkSystemChange(sys.systemId)}
                              className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-[10px] font-medium hover:bg-blue-100"
                            >
                              Analyze
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState message="No systems to benchmark" />
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderUsageDensity = () => {
    if (!products || products.length === 0) {
      return <EmptyState message="No product data available for the Usage Density matrix" />;
    }
    return (
      <div className="space-y-4">
        <ProductUsageHeatmap
          products={products}
          treeNodes={treeNodes}
          suppliers={suppliersProp}
          customFields={customFields}
          currentUser={currentUser}
          usageAreas={usageAreas}
          onProductUpdate={onProductUpdate}
          onProductDelete={onProductDelete}
          onAddFieldDefinition={onAddFieldDefinition}
          onAddTreeNode={onAddTreeNode}
        />
      </div>
    );
  };

  const renderActiveTab = () => {
    if (loading && !overviewData && !productData && !systemData && !taxonomyData && !coverageData && !benchmarkData) {
      return <LoadingState />;
    }
    switch (activeTab) {
      case 'overview': return renderOverview();
      case 'product': return renderProductIntelligence();
      case 'system': return renderSystemIntelligence();
      case 'supplier-heatmap': return renderSupplierHeatmap();
      case 'taxonomy': return renderTaxonomySupplier();
      case 'coverage': return renderCoverage();
      case 'benchmark': return renderBenchmark();
      case 'usage-density': return renderUsageDensity();
      default: return renderOverview();
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Technical Intelligence</h1>
          <p className="text-xs text-slate-400 mt-0.5">Multi-Supplier Intelligence & Comparison Layer</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              activeFilterCount > 0
                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            <Filter size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-blue-600 text-white rounded-full font-bold">{activeFilterCount}</span>
            )}
          </button>
          <button
            onClick={() => loadTabData(activeTab)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="px-6 py-3 border-b border-slate-200 bg-gradient-to-r from-blue-50/50 to-slate-50">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Supplier</label>
              <select
                value={activeFilters.supplier || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setActiveFilters(prev => ({ ...prev, supplier: val || undefined }));
                }}
                className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white focus:ring-1 focus:ring-blue-400 focus:border-blue-400 min-w-[140px]"
              >
                <option value="">All Suppliers</option>
                {filters?.suppliers?.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Sector</label>
              <select
                value={activeFilters.sector || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setActiveFilters(prev => ({ ...prev, sector: val || undefined }));
                }}
                className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white focus:ring-1 focus:ring-blue-400 focus:border-blue-400 min-w-[140px]"
              >
                <option value="">All Sectors</option>
                {filters?.sectors?.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Branch</label>
              <select
                value={activeFilters.taxonomy || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setActiveFilters(prev => ({ ...prev, taxonomy: val || undefined }));
                }}
                className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white focus:ring-1 focus:ring-blue-400 focus:border-blue-400 min-w-[140px]"
              >
                <option value="">All Branches</option>
                {filters?.taxonomyNodes?.map((n: any) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={() => setActiveFilters({})}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-500 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
              >
                <X size={12} />
                Clear All
              </button>
            )}
            <button
              onClick={() => loadTabData(activeTab)}
              className="flex items-center gap-1 px-3 py-1 text-[10px] font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 px-6 py-2 border-b border-slate-100 bg-slate-50 overflow-x-auto">
        {TAB_CONFIG.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-6 mt-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-600">
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {renderActiveTab()}
      </div>
    </div>
  );
};

const TechnicalIntelligenceDashboardWithBoundary: React.FC<TechnicalIntelligenceDashboardProps> = (props) => (
  <DashboardErrorBoundary>
    <TechnicalIntelligenceDashboard {...props} />
  </DashboardErrorBoundary>
);

export default TechnicalIntelligenceDashboardWithBoundary;
