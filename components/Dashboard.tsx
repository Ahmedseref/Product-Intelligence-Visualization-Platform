import React, { useMemo } from 'react';
import { Product } from '../types';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsivePie } from '@nivo/pie';
import { ResponsiveLine } from '@nivo/line';
import { nivoTheme, CHART_COLORS } from './charts/NivoChartWrapper';
import { ICONS } from '../constants';

interface DashboardProps {
  products: Product[];
}

const Dashboard: React.FC<DashboardProps> = ({ products }) => {
  const stats = useMemo(() => {
    const totalValue = products.reduce((acc, p) => acc + p.price, 0);
    const avgLeadTime = products.reduce((acc, p) => acc + p.leadTime, 0) / (products.length || 1);
    const suppliers = new Set(products.map(p => p.supplier)).size;
    
    const catData = products.reduce((acc: any[], p) => {
      const existing = acc.find(item => item.id === p.category);
      if (existing) existing.value += 1;
      else acc.push({ id: p.category || 'Uncategorized', label: p.category || 'Uncategorized', value: 1 });
      return acc;
    }, []);

    const priceRange = products.map(p => ({ 
      x: p.name.substring(0, 12), 
      y: p.price 
    }));

    const lineData = [{
      id: 'price',
      color: '#3b82f6',
      data: priceRange.slice(0, 10)
    }];

    return { totalValue, avgLeadTime, suppliers, catData, lineData };
  }, [products]);

  const kpis = [
    { label: 'Total Products', value: products.length, icon: ICONS.Inventory, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Active Suppliers', value: stats.suppliers, icon: ICONS.Location, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: 'Avg Lead Time', value: `${stats.avgLeadTime.toFixed(1)} Days`, icon: ICONS.Logistics, color: 'text-amber-600', bg: 'bg-amber-100' },
    { label: 'Total Base Value', value: `$${stats.totalValue.toLocaleString()}`, icon: ICONS.Price, color: 'text-purple-600', bg: 'bg-purple-100' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg ${kpi.bg} ${kpi.color}`}>
                {kpi.icon}
              </div>
              <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded-full">+12% vs LY</span>
            </div>
            <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-1">{kpi.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            {ICONS.Visualize} Category Distribution
          </h3>
          <div style={{ height: 280 }}>
            {stats.catData.length > 0 ? (
              <ResponsivePie
                data={stats.catData}
                margin={{ top: 20, right: 20, bottom: 40, left: 20 }}
                innerRadius={0.6}
                padAngle={2}
                cornerRadius={4}
                activeOuterRadiusOffset={8}
                colors={CHART_COLORS.categorical}
                borderWidth={1}
                borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
                enableArcLinkLabels={false}
                arcLabelsSkipAngle={20}
                arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2.5]] }}
                legends={[
                  {
                    anchor: 'bottom',
                    direction: 'row',
                    justify: false,
                    translateY: 36,
                    itemsSpacing: 4,
                    itemWidth: 80,
                    itemHeight: 14,
                    itemTextColor: '#64748b',
                    itemDirection: 'left-to-right',
                    itemOpacity: 1,
                    symbolSize: 10,
                    symbolShape: 'circle'
                  }
                ]}
                animate={true}
                motionConfig="gentle"
                theme={nivoTheme}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                No category data available
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              {ICONS.Price} Price Distribution
            </h3>
            <select className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1 outline-none">
              <option>Last 30 Days</option>
              <option>Last Quarter</option>
            </select>
          </div>
          <div style={{ height: 280 }}>
            {stats.lineData[0].data.length > 0 ? (
              <ResponsiveLine
                data={stats.lineData}
                margin={{ top: 20, right: 20, bottom: 50, left: 50 }}
                xScale={{ type: 'point' }}
                yScale={{ type: 'linear', min: 'auto', max: 'auto', stacked: false, reverse: false }}
                curve="monotoneX"
                axisTop={null}
                axisRight={null}
                axisBottom={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: -30,
                  truncateTickAt: 10
                }}
                axisLeft={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: 0,
                  format: (value) => `$${value}`
                }}
                colors={['#3b82f6']}
                lineWidth={3}
                pointSize={8}
                pointColor={{ theme: 'background' }}
                pointBorderWidth={2}
                pointBorderColor={{ from: 'serieColor' }}
                enableArea={true}
                areaOpacity={0.15}
                useMesh={true}
                animate={true}
                motionConfig="gentle"
                theme={nivoTheme}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                No price data available
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Recent Changes</h3>
          <button className="text-xs text-blue-600 font-semibold hover:underline">View All History</button>
        </div>
        <div className="divide-y divide-slate-100">
          {products.slice(0, 5).map((p, i) => (
            <div key={i} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                {ICONS.History}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  <span className="font-bold text-blue-600">{p.createdBy}</span> updated <span className="font-bold">{p.name}</span>
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{new Date(p.lastUpdated).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">Version {p.history.length + 1}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
