
import React, { useState, useMemo } from 'react';
import { Product, ChartType, AggregationMethod, Supplier, SupplierProduct } from '../types';
import { 
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, ScatterChart, Scatter, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell 
} from 'recharts';
import { ICONS } from '../constants';

interface VisualizeProps {
  products: Product[];
  suppliers: Supplier[];
  supplierProducts: SupplierProduct[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#ec4899'];

const Visualize: React.FC<VisualizeProps> = ({ products, suppliers = [], supplierProducts = [] }) => {
  const [activeTab, setActiveTab] = useState<'charts'>('charts');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xAxis, setXAxis] = useState<string>('supplier');
  const [yAxis, setYAxis] = useState<string>('price');
  const [agg, setAgg] = useState<AggregationMethod>('avg');

  const chartData = useMemo(() => {
    const groups: Record<string, number[]> = {};
    
    products.forEach(p => {
      const key = (p as any)[xAxis] || 'Unknown';
      const val = (p as any)[yAxis] || 0;
      if (!groups[key]) groups[key] = [];
      groups[key].push(val);
    });

    return Object.entries(groups).map(([name, values]) => {
      let value = 0;
      if (agg === 'sum') value = values.reduce((a, b) => a + b, 0);
      else if (agg === 'avg') value = values.reduce((a, b) => a + b, 0) / values.length;
      else if (agg === 'max') value = Math.max(...values);
      else if (agg === 'min') value = Math.min(...values);
      else if (agg === 'count') value = values.length;

      return { name, value: parseFloat(value.toFixed(2)) };
    });
  }, [products, xAxis, yAxis, agg]);

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 20, right: 30, left: 20, bottom: 20 }
    };

    switch (chartType) {
      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }} />
            <Legend />
            <Bar dataKey="value" name={`${agg.toUpperCase()} of ${yAxis}`} fill="#3b82f6" radius={[6, 6, 0, 0]} />
          </BarChart>
        );
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }} />
            <Legend />
            <Line type="monotone" dataKey="value" name={`${agg.toUpperCase()} of ${yAxis}`} stroke="#3b82f6" strokeWidth={3} dot={{ r: 6, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} />
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip />
            <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
          </AreaChart>
        );
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={120}
              paddingAngle={5}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] gap-6">
      <div className="flex items-center gap-4 mb-2">
        <h2 className="text-xl font-bold text-slate-800">Analytics Charts</h2>
      </div>

      {activeTab === 'charts' && (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 flex-1 overflow-hidden">
        {/* Controls */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-8 flex flex-col">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-600 rounded-full"></span> Chart Configuration
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Chart Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['bar', 'line', 'pie', 'area'] as ChartType[]).map(type => (
                    <button 
                      key={type}
                      onClick={() => setChartType(type)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold capitalize transition-all border ${chartType === type ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Dimension (X-Axis)</label>
                <select 
                  value={xAxis}
                  onChange={e => setXAxis(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
                >
                  <option value="supplier">Supplier</option>
                  <option value="category">Category</option>
                  <option value="sector">Sector</option>
                  <option value="manufacturingLocation">Manufacturing Country</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Metric (Y-Axis)</label>
                <select 
                  value={yAxis}
                  onChange={e => setYAxis(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
                >
                  <option value="price">Price</option>
                  <option value="moq">MOQ</option>
                  <option value="leadTime">Lead Time</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Aggregation</label>
                <div className="flex flex-wrap gap-2">
                  {(['sum', 'avg', 'min', 'max', 'count'] as AggregationMethod[]).map(method => (
                    <button 
                      key={method}
                      onClick={() => setAgg(method)}
                      className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tighter transition-all ${agg === method ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto">
            <button className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
              {ICONS.Download} Export Analysis
            </button>
          </div>
        </div>

        {/* Display */}
        <div className="md:col-span-3 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Visual Insights</h2>
              <p className="text-sm text-slate-400">Analyzing <span className="text-blue-600 font-bold">{agg.toUpperCase()} {yAxis}</span> grouped by <span className="text-blue-600 font-bold">{xAxis}</span></p>
            </div>
            <div className="flex gap-2">
              <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
              </button>
            </div>
          </div>

          <div className="flex-1 w-full min-h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              {renderChart() || <div className="h-full flex items-center justify-center text-slate-300">Select parameters to generate chart</div>}
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default Visualize;
