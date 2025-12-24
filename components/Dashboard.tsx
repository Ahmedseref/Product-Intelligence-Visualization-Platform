
import React, { useMemo } from 'react';
import { Product } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area 
} from 'recharts';
import { ICONS } from '../constants';

interface DashboardProps {
  products: Product[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1'];

const Dashboard: React.FC<DashboardProps> = ({ products }) => {
  const stats = useMemo(() => {
    const totalValue = products.reduce((acc, p) => acc + p.price, 0);
    const avgLeadTime = products.reduce((acc, p) => acc + p.leadTime, 0) / (products.length || 1);
    const suppliers = new Set(products.map(p => p.supplier)).size;
    
    // Group by category
    const catData = products.reduce((acc: any[], p) => {
      const existing = acc.find(item => item.name === p.category);
      if (existing) existing.value += 1;
      else acc.push({ name: p.category, value: 1 });
      return acc;
    }, []);

    // Price distribution data (mocking spread for line)
    const priceRange = products.map(p => ({ name: p.name.substring(0, 10), price: p.price }));

    return { totalValue, avgLeadTime, suppliers, catData, priceRange };
  }, [products]);

  const kpis = [
    { label: 'Total Products', value: products.length, icon: ICONS.Inventory, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Active Suppliers', value: stats.suppliers, icon: ICONS.Location, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: 'Avg Lead Time', value: `${stats.avgLeadTime.toFixed(1)} Days`, icon: ICONS.Logistics, color: 'text-amber-600', bg: 'bg-amber-100' },
    { label: 'Total Base Value', value: `$${stats.totalValue.toLocaleString()}`, icon: ICONS.Price, color: 'text-purple-600', bg: 'bg-purple-100' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
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
        {/* Category Breakdown */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-[400px]">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            {ICONS.Visualize} Category Distribution
          </h3>
          <ResponsiveContainer width="100%" height="80%">
            <PieChart>
              <Pie
                data={stats.catData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {stats.catData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 justify-center">
             {stats.catData.map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  {item.name}
                </div>
             ))}
          </div>
        </div>

        {/* Pricing Trends */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-[400px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              {ICONS.Price} Price Distribution
            </h3>
            <select className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1 outline-none">
              <option>Last 30 Days</option>
              <option>Last Quarter</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height="85%">
            <AreaChart data={stats.priceRange}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
              <Area type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity Mock */}
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
