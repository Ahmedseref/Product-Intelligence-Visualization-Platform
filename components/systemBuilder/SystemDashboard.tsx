import React, { useState, useEffect, useCallback } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { SystemStats, SystemData, Product } from '../../types';
import { systemsApi } from '../../client/api';
import { BarChart3, RefreshCw, TrendingUp, Layers, Package, Grid3X3 } from 'lucide-react';

interface SystemDashboardProps {
  products: Product[];
}

type HeatmapAxisMode = 'product-system' | 'product-sector' | 'layer-product' | 'system-layer';

const SystemDashboard: React.FC<SystemDashboardProps> = ({ products }) => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [systems, setSystems] = useState<SystemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapAxisMode>('product-system');
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [heatmapKeys, setHeatmapKeys] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, systemsData] = await Promise.all([
        systemsApi.getStats(),
        systemsApi.getSystems(),
      ]);
      setStats(statsData);
      setSystems(systemsData);
      buildHeatmapData(statsData, systemsData, heatmapMode);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const buildHeatmapData = (statsData: SystemStats, systemsData: SystemData[], mode: HeatmapAxisMode) => {
    if (mode === 'product-system' && statsData.productSystemMatrix?.length > 0) {
      const systemNames = [...new Set(statsData.productSystemMatrix.map(m => m.systemName))];
      const productIds = [...new Set(statsData.productSystemMatrix.map(m => m.productId))];
      const data = productIds.slice(0, 15).map(pId => {
        const prod = products.find(p => p.id === pId);
        const row: any = { id: prod?.name || pId };
        systemNames.forEach(sName => {
          const entry = statsData.productSystemMatrix.find(m => m.productId === pId && m.systemName === sName);
          row[sName] = entry ? entry.count : 0;
        });
        return row;
      });
      setHeatmapData(data);
      setHeatmapKeys(systemNames);
    } else if (mode === 'layer-product' && statsData.layerProductMatrix?.length > 0) {
      const layerNames = [...new Set(statsData.layerProductMatrix.map(m => m.layerName))];
      const productIds = [...new Set(statsData.layerProductMatrix.map(m => m.productId))];
      const data = layerNames.slice(0, 15).map(lName => {
        const row: any = { id: lName };
        productIds.slice(0, 15).forEach(pId => {
          const prod = products.find(p => p.id === pId);
          const entry = statsData.layerProductMatrix.find(m => m.layerName === lName && m.productId === pId);
          row[prod?.name || pId] = entry ? entry.count : 0;
        });
        return row;
      });
      const keys = productIds.slice(0, 15).map(pId => {
        const prod = products.find(p => p.id === pId);
        return prod?.name || pId;
      });
      setHeatmapData(data);
      setHeatmapKeys(keys);
    } else if (mode === 'system-layer' && statsData.systemLayerMatrix?.length > 0) {
      const systemNames = [...new Set(statsData.systemLayerMatrix.map(m => m.systemName))];
      const layerNames = [...new Set(statsData.systemLayerMatrix.map(m => m.layerName))];
      const data = systemNames.slice(0, 15).map(sName => {
        const row: any = { id: sName };
        layerNames.forEach(lName => {
          const entry = statsData.systemLayerMatrix.find(m => m.systemName === sName && m.layerName === lName);
          row[lName] = entry ? entry.productCount : 0;
        });
        return row;
      });
      setHeatmapData(data);
      setHeatmapKeys(layerNames);
    } else if (mode === 'product-sector') {
      const productIds = Object.keys(statsData.productUtilization);
      const sectorNames = systemsData.flatMap(s => {
        const mapping = s.sectorMapping as string[];
        return Array.isArray(mapping) ? mapping : [];
      });
      const uniqueSectors = [...new Set(sectorNames)];
      if (uniqueSectors.length > 0) {
        const data = productIds.slice(0, 15).map(pId => {
          const prod = products.find(p => p.id === pId);
          const row: any = { id: prod?.name || pId };
          uniqueSectors.forEach(sec => { row[sec] = 0; });
          for (const entry of statsData.productSystemMatrix) {
            if (entry.productId === pId) {
              const sys = systemsData.find(s => s.systemId === entry.systemId);
              const mapping = sys?.sectorMapping as string[];
              if (Array.isArray(mapping)) {
                mapping.forEach(sec => { row[sec] = (row[sec] || 0) + entry.count; });
              }
            }
          }
          return row;
        });
        setHeatmapData(data);
        setHeatmapKeys(uniqueSectors);
      } else {
        setHeatmapData([]);
        setHeatmapKeys([]);
      }
    } else {
      setHeatmapData([]);
      setHeatmapKeys([]);
    }
  };

  useEffect(() => {
    if (stats && systems.length > 0) {
      buildHeatmapData(stats, systems, heatmapMode);
    }
  }, [heatmapMode, stats, systems]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-slate-400">
        <BarChart3 size={48} className="mx-auto mb-3 opacity-50" />
        <p>No system data available. Create your first system to see analytics.</p>
      </div>
    );
  }

  const utilizationData = Object.entries(stats.productUtilization)
    .map(([productId, count]) => {
      const prod = products.find(p => p.id === productId);
      return { product: prod?.name || productId, count: Number(count) };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const complexityData = stats.systemComplexity
    .sort((a, b) => b.optionCount - a.optionCount)
    .slice(0, 15)
    .map(s => ({ system: s.name, layers: s.layerCount, products: s.optionCount }));

  const distributionData = Object.entries(stats.layerDistribution).map(([type, count]) => ({
    type,
    count: Number(count),
  }));

  const nivoTheme = {
    text: { fontSize: 11, fill: '#64748b' },
    axis: {
      ticks: { text: { fontSize: 10, fill: '#94a3b8' } },
      legend: { text: { fontSize: 12, fill: '#64748b', fontWeight: 600 } },
    },
    grid: { line: { stroke: '#e2e8f0', strokeWidth: 1 } },
    tooltip: {
      container: {
        background: '#1e293b',
        color: '#f8fafc',
        fontSize: 12,
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      },
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">System Analytics</h2>
        <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <Layers size={16} />
            </div>
            <span className="text-sm text-slate-500">Total Systems</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">{stats.totalSystems}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
            <span className="text-sm text-slate-500">Total Layers</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">{stats.totalLayers}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <Package size={16} />
            </div>
            <span className="text-sm text-slate-500">Product Options</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">{stats.totalOptions}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
              <Grid3X3 size={16} />
            </div>
            <span className="text-sm text-slate-500">Sectors</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">{stats.totalSectors}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {utilizationData.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Product Utilization Frequency</h3>
            <div style={{ height: 300 }}>
              <ResponsiveBar
                data={utilizationData}
                keys={['count']}
                indexBy="product"
                layout="horizontal"
                margin={{ top: 10, right: 20, bottom: 40, left: 140 }}
                padding={0.3}
                colors={['#3b82f6']}
                borderRadius={4}
                axisBottom={{ tickSize: 0, tickPadding: 5, legend: 'Times Used in Layers', legendPosition: 'middle', legendOffset: 32 }}
                axisLeft={{ tickSize: 0, tickPadding: 8 }}
                labelSkipWidth={20}
                labelTextColor="#ffffff"
                theme={nivoTheme as any}
                animate={true}
              />
            </div>
          </div>
        )}

        {complexityData.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-700 mb-4">System Complexity</h3>
            <div style={{ height: 300 }}>
              <ResponsiveBar
                data={complexityData}
                keys={['layers', 'products']}
                indexBy="system"
                layout="vertical"
                groupMode="grouped"
                margin={{ top: 10, right: 20, bottom: 60, left: 50 }}
                padding={0.3}
                colors={['#3b82f6', '#10b981']}
                borderRadius={4}
                axisBottom={{ tickSize: 0, tickPadding: 5, tickRotation: -30 }}
                axisLeft={{ tickSize: 0, tickPadding: 5, legend: 'Count', legendPosition: 'middle', legendOffset: -40 }}
                labelSkipWidth={16}
                labelTextColor="#ffffff"
                legends={[
                  {
                    dataFrom: 'keys',
                    anchor: 'top-right',
                    direction: 'row',
                    translateY: -10,
                    itemWidth: 80,
                    itemHeight: 20,
                    symbolSize: 10,
                    symbolShape: 'circle',
                  },
                ]}
                theme={nivoTheme as any}
                animate={true}
              />
            </div>
          </div>
        )}

        {distributionData.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Layer Type Distribution</h3>
            <div style={{ height: 300 }}>
              <ResponsiveBar
                data={distributionData}
                keys={['count']}
                indexBy="type"
                layout="vertical"
                margin={{ top: 10, right: 20, bottom: 40, left: 50 }}
                padding={0.3}
                colors={['#8b5cf6', '#f59e0b', '#3b82f6', '#6b7280']}
                colorBy="indexValue"
                borderRadius={4}
                axisBottom={{ tickSize: 0, tickPadding: 8 }}
                axisLeft={{ tickSize: 0, tickPadding: 5, legend: 'Count', legendPosition: 'middle', legendOffset: -40 }}
                labelSkipWidth={20}
                labelTextColor="#ffffff"
                theme={nivoTheme as any}
                animate={true}
              />
            </div>
          </div>
        )}

        {heatmapData.length > 0 && heatmapKeys.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-700">Product Matrix Heatmap</h3>
              <select
                value={heatmapMode}
                onChange={(e) => setHeatmapMode(e.target.value as HeatmapAxisMode)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="product-system">Product → System</option>
                <option value="product-sector">Product → Sector</option>
                <option value="layer-product">Layer → Product</option>
                <option value="system-layer">System → Layer</option>
              </select>
            </div>
            <div style={{ height: 300 }}>
              <ResponsiveHeatMap
                data={heatmapData}
                margin={{ top: 10, right: 20, bottom: 60, left: 120 }}
                axisTop={null}
                axisBottom={{ tickSize: 0, tickPadding: 5, tickRotation: -30 }}
                axisLeft={{ tickSize: 0, tickPadding: 8 }}
                colors={{ type: 'sequential', scheme: 'blues' }}
                emptyColor="#f1f5f9"
                borderWidth={1}
                borderColor="#e2e8f0"
                labelTextColor={{ from: 'color', modifiers: [['darker', 3]] }}
                theme={nivoTheme as any}
                animate={true}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemDashboard;
