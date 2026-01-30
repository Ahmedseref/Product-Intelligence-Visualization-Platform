import React, { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface NivoChartWrapperProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  height?: number | string;
  className?: string;
}

export const nivoTheme = {
  background: 'transparent',
  textColor: '#334155',
  fontSize: 12,
  axis: {
    domain: {
      line: {
        stroke: '#e2e8f0',
        strokeWidth: 1,
      },
    },
    legend: {
      text: {
        fontSize: 12,
        fontWeight: 600,
        fill: '#475569',
      },
    },
    ticks: {
      line: {
        stroke: '#e2e8f0',
        strokeWidth: 1,
      },
      text: {
        fontSize: 11,
        fill: '#64748b',
      },
    },
  },
  grid: {
    line: {
      stroke: '#f1f5f9',
      strokeWidth: 1,
    },
  },
  legends: {
    title: {
      text: {
        fontSize: 12,
        fontWeight: 600,
        fill: '#334155',
      },
    },
    text: {
      fontSize: 11,
      fill: '#64748b',
    },
  },
  annotations: {
    text: {
      fontSize: 13,
      fill: '#334155',
      outlineWidth: 2,
      outlineColor: '#ffffff',
      outlineOpacity: 1,
    },
    link: {
      stroke: '#94a3b8',
      strokeWidth: 1,
      outlineWidth: 2,
      outlineColor: '#ffffff',
      outlineOpacity: 1,
    },
    outline: {
      stroke: '#94a3b8',
      strokeWidth: 2,
      outlineWidth: 2,
      outlineColor: '#ffffff',
      outlineOpacity: 1,
    },
    symbol: {
      fill: '#475569',
      outlineWidth: 2,
      outlineColor: '#ffffff',
      outlineOpacity: 1,
    },
  },
  tooltip: {
    container: {
      background: '#ffffff',
      color: '#334155',
      fontSize: 12,
      borderRadius: '8px',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
      padding: '12px 16px',
    },
  },
};

export const CHART_COLORS = {
  primary: ['#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a'],
  categorical: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#ec4899', '#14b8a6', '#f97316', '#84cc16'],
  sequential: {
    blue: ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af'],
    green: ['#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534'],
    amber: ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e'],
  },
  heatmap: ['#f0f9ff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985'],
  diverging: ['#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fef2f2', '#f0fdf4', '#bbf7d0', '#86efac', '#4ade80', '#22c55e'],
};

const NivoChartWrapper: React.FC<NivoChartWrapperProps> = ({
  children,
  title,
  subtitle,
  isLoading = false,
  isEmpty = false,
  emptyMessage = 'No data available',
  height = 400,
  className = '',
}) => {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>
      {(title || subtitle) && (
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          {title && <h3 className="text-lg font-bold text-slate-800">{title}</h3>}
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
      )}
      <div className="p-6" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-sm text-slate-400">Loading chart data...</p>
            </div>
          </div>
        ) : isEmpty ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-slate-500 font-medium">{emptyMessage}</p>
              <p className="text-sm text-slate-400 mt-1">Add more data to see visualizations</p>
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export default NivoChartWrapper;
