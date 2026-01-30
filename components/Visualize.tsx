import React, { useState, useMemo } from 'react';
import { Product, ChartType, AggregationMethod, Supplier, SupplierProduct, TreeNode, CustomField, User } from '../types';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsivePie } from '@nivo/pie';
import { ResponsiveLine } from '@nivo/line';
import { ICONS } from '../constants';
import ProductUsageHeatmap from './visualizations/ProductUsageHeatmap';
import NivoChartWrapper, { nivoTheme, CHART_COLORS } from './charts/NivoChartWrapper';
import { BarChart3, Grid3X3 } from 'lucide-react';

interface VisualizeProps {
  products: Product[];
  suppliers: Supplier[];
  supplierProducts: SupplierProduct[];
  treeNodes?: TreeNode[];
  customFields?: CustomField[];
  currentUser?: User;
  onProductUpdate?: (product: Product) => void;
  onProductDelete?: (productId: string) => void;
  onAddFieldDefinition?: (field: CustomField) => void;
  onAddTreeNode?: (node: TreeNode) => void;
}

const Visualize: React.FC<VisualizeProps> = ({ 
  products, 
  suppliers = [], 
  supplierProducts = [], 
  treeNodes = [], 
  customFields = [],
  currentUser,
  onProductUpdate,
  onProductDelete,
  onAddFieldDefinition,
  onAddTreeNode
}) => {
  const [activeTab, setActiveTab] = useState<'charts' | 'heatmap'>('charts');
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

  const barData = useMemo(() => {
    return chartData.map(d => ({
      id: d.name,
      label: d.name,
      value: d.value
    }));
  }, [chartData]);

  const pieData = useMemo(() => {
    return chartData.map((d, i) => ({
      id: d.name,
      label: d.name,
      value: d.value,
      color: CHART_COLORS.categorical[i % CHART_COLORS.categorical.length]
    }));
  }, [chartData]);

  const lineData = useMemo(() => {
    return [{
      id: `${agg.toUpperCase()} of ${yAxis}`,
      color: '#3b82f6',
      data: chartData.map(d => ({
        x: d.name,
        y: d.value
      }))
    }];
  }, [chartData, agg, yAxis]);

  const renderChart = () => {
    if (chartData.length === 0) {
      return (
        <div className="h-full flex items-center justify-center text-slate-400">
          No data available. Add products to see visualizations.
        </div>
      );
    }

    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveBar
            data={barData}
            keys={['value']}
            indexBy="id"
            margin={{ top: 20, right: 30, bottom: 60, left: 60 }}
            padding={0.3}
            valueScale={{ type: 'linear' }}
            indexScale={{ type: 'band', round: true }}
            colors={CHART_COLORS.primary}
            borderRadius={6}
            borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: -30,
              legend: xAxis,
              legendPosition: 'middle',
              legendOffset: 50,
              truncateTickAt: 15
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: `${agg.toUpperCase()} of ${yAxis}`,
              legendPosition: 'middle',
              legendOffset: -50
            }}
            labelSkipWidth={12}
            labelSkipHeight={12}
            labelTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
            animate={true}
            motionConfig="gentle"
            theme={nivoTheme}
          />
        );
      case 'line':
      case 'area':
        return (
          <ResponsiveLine
            data={lineData}
            margin={{ top: 20, right: 30, bottom: 60, left: 60 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 'auto', max: 'auto', stacked: false, reverse: false }}
            curve="monotoneX"
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: -30,
              legend: xAxis,
              legendOffset: 50,
              legendPosition: 'middle',
              truncateTickAt: 15
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: `${agg.toUpperCase()} of ${yAxis}`,
              legendOffset: -50,
              legendPosition: 'middle'
            }}
            colors={CHART_COLORS.primary}
            lineWidth={3}
            pointSize={10}
            pointColor={{ theme: 'background' }}
            pointBorderWidth={2}
            pointBorderColor={{ from: 'serieColor' }}
            enableArea={chartType === 'area'}
            areaOpacity={0.2}
            useMesh={true}
            animate={true}
            motionConfig="gentle"
            theme={nivoTheme}
          />
        );
      case 'pie':
        return (
          <ResponsivePie
            data={pieData}
            margin={{ top: 40, right: 80, bottom: 80, left: 80 }}
            innerRadius={0.5}
            padAngle={2}
            cornerRadius={4}
            activeOuterRadiusOffset={8}
            colors={CHART_COLORS.categorical}
            borderWidth={1}
            borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
            arcLinkLabelsSkipAngle={10}
            arcLinkLabelsTextColor="#334155"
            arcLinkLabelsThickness={2}
            arcLinkLabelsColor={{ from: 'color' }}
            arcLabelsSkipAngle={10}
            arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
            legends={[
              {
                anchor: 'bottom',
                direction: 'row',
                justify: false,
                translateX: 0,
                translateY: 56,
                itemsSpacing: 0,
                itemWidth: 100,
                itemHeight: 18,
                itemTextColor: '#64748b',
                itemDirection: 'left-to-right',
                itemOpacity: 1,
                symbolSize: 12,
                symbolShape: 'circle'
              }
            ]}
            animate={true}
            motionConfig="gentle"
            theme={nivoTheme}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] gap-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-slate-800">Data Visualization</h2>
        <div className="flex bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('charts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'charts'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Analytics Charts
          </button>
          <button
            onClick={() => setActiveTab('heatmap')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'heatmap'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Grid3X3 className="w-4 h-4" />
            Usage Density Matrix
          </button>
        </div>
      </div>

      {activeTab === 'heatmap' && (
        <ProductUsageHeatmap
          products={products}
          treeNodes={treeNodes}
          suppliers={suppliers}
          customFields={customFields}
          currentUser={currentUser}
          onProductUpdate={onProductUpdate}
          onProductDelete={onProductDelete}
          onAddFieldDefinition={onAddFieldDefinition}
          onAddTreeNode={onAddTreeNode}
        />
      )}

      {activeTab === 'charts' && (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 flex-1 overflow-hidden">
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

        <div className="md:col-span-3 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Visual Insights</h2>
              <p className="text-sm text-slate-400">Analyzing <span className="text-blue-600 font-bold">{agg.toUpperCase()} {yAxis}</span> grouped by <span className="text-blue-600 font-bold">{xAxis}</span></p>
            </div>
          </div>

          <div className="flex-1 w-full min-h-[400px]">
            {renderChart()}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default Visualize;
