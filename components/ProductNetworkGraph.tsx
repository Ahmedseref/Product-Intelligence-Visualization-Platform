import React, { useMemo, useState } from 'react';
import { MasterProduct, Supplier, SupplierProduct } from '../types';
import { Package, Building2, Link2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface ProductNetworkGraphProps {
  masterProducts: MasterProduct[];
  suppliers: Supplier[];
  supplierProducts: SupplierProduct[];
}

interface NodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ProductNetworkGraph: React.FC<ProductNetworkGraphProps> = ({
  masterProducts = [],
  suppliers = [],
  supplierProducts = [],
}) => {
  const [selectedMasterProduct, setSelectedMasterProduct] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const activeSupplierProducts = useMemo(() => {
    if (!selectedMasterProduct) return supplierProducts;
    return supplierProducts.filter(sp => sp.masterProductId === selectedMasterProduct);
  }, [supplierProducts, selectedMasterProduct]);

  const relevantSuppliers = useMemo(() => {
    const supplierIds = new Set(activeSupplierProducts.map(sp => sp.supplierId));
    return suppliers.filter(s => supplierIds.has(s.id));
  }, [suppliers, activeSupplierProducts]);

  const relevantMasterProducts = useMemo(() => {
    if (selectedMasterProduct) {
      return masterProducts.filter(mp => mp.id === selectedMasterProduct);
    }
    const mpIds = new Set(supplierProducts.map(sp => sp.masterProductId));
    return masterProducts.filter(mp => mpIds.has(mp.id));
  }, [masterProducts, supplierProducts, selectedMasterProduct]);

  const nodeWidth = 180;
  const nodeHeight = 80;
  const masterY = 50;
  const supplierY = 250;
  const svgWidth = Math.max(800, (relevantMasterProducts.length + 1) * 220);
  const svgHeight = 400;

  const masterPositions = useMemo(() => {
    const positions: Record<string, NodePosition> = {};
    const totalWidth = relevantMasterProducts.length * (nodeWidth + 40);
    const startX = (svgWidth - totalWidth) / 2 + 20;
    
    relevantMasterProducts.forEach((mp, index) => {
      positions[mp.id] = {
        x: startX + index * (nodeWidth + 40),
        y: masterY,
        width: nodeWidth,
        height: nodeHeight,
      };
    });
    return positions;
  }, [relevantMasterProducts, svgWidth]);

  const supplierPositions = useMemo(() => {
    const positions: Record<string, NodePosition> = {};
    const totalWidth = relevantSuppliers.length * (nodeWidth + 40);
    const startX = (svgWidth - totalWidth) / 2 + 20;
    
    relevantSuppliers.forEach((s, index) => {
      positions[s.id] = {
        x: startX + index * (nodeWidth + 40),
        y: supplierY,
        width: nodeWidth,
        height: nodeHeight,
      };
    });
    return positions;
  }, [relevantSuppliers, svgWidth]);

  const links = useMemo(() => {
    return activeSupplierProducts.map(sp => {
      const masterPos = masterPositions[sp.masterProductId];
      const supplierPos = supplierPositions[sp.supplierId];
      
      if (!masterPos || !supplierPos) return null;

      return {
        id: sp.id,
        from: {
          x: masterPos.x + masterPos.width / 2,
          y: masterPos.y + masterPos.height,
        },
        to: {
          x: supplierPos.x + supplierPos.width / 2,
          y: supplierPos.y,
        },
        supplierProduct: sp,
      };
    }).filter(Boolean);
  }, [activeSupplierProducts, masterPositions, supplierPositions]);

  const getSupplierName = (supplierId: string) => {
    return suppliers.find(s => s.id === supplierId)?.name || supplierId;
  };

  const getMasterProductName = (mpId: string) => {
    return masterProducts.find(mp => mp.id === mpId)?.name || mpId;
  };

  if (masterProducts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-800 mb-2">No Master Products</h3>
        <p className="text-sm text-slate-500">Add master products to see the network visualization.</p>
      </div>
    );
  }

  if (supplierProducts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8">
        <div className="text-center mb-6">
          <Link2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-800 mb-2">No Supplier Products Yet</h3>
          <p className="text-sm text-slate-500 mb-6">
            Create supplier products to link master products with suppliers and see the network.
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-8">
          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Package size={16} className="text-blue-500" /> Master Products ({masterProducts.length})
            </h4>
            <div className="space-y-2">
              {masterProducts.slice(0, 5).map(mp => (
                <div key={mp.id} className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm text-slate-700">{mp.name}</span>
                  <span className="text-xs text-slate-400 ml-auto">{mp.id}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Building2 size={16} className="text-emerald-500" /> Suppliers ({suppliers.length})
            </h4>
            <div className="space-y-2">
              {suppliers.slice(0, 5).map(s => (
                <div key={s.id} className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                  <span className="text-sm text-slate-700">{s.name}</span>
                  <span className="text-xs text-slate-400 ml-auto">{s.id}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Link2 size={20} className="text-blue-500" />
            Product Supply Network
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Master products at top, linked to supplier variants below
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <select
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
            value={selectedMasterProduct || ''}
            onChange={e => setSelectedMasterProduct(e.target.value || null)}
          >
            <option value="">All Master Products</option>
            {masterProducts.map(mp => (
              <option key={mp.id} value={mp.id}>{mp.name}</option>
            ))}
          </select>
          
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
              className="p-1.5 hover:bg-white rounded transition-colors"
              title="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-xs font-medium text-slate-600 px-2">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(2, z + 0.1))}
              className="p-1.5 hover:bg-white rounded transition-colors"
              title="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1.5 hover:bg-white rounded transition-colors"
              title="Reset zoom"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: '500px' }}>
        <svg
          width={svgWidth * zoom}
          height={svgHeight * zoom}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="block"
        >
          <defs>
            <linearGradient id="linkGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.6" />
            </linearGradient>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.1"/>
            </filter>
          </defs>

          {links.map(link => link && (
            <g key={link.id}>
              <path
                d={`M ${link.from.x} ${link.from.y} 
                    C ${link.from.x} ${(link.from.y + link.to.y) / 2},
                      ${link.to.x} ${(link.from.y + link.to.y) / 2},
                      ${link.to.x} ${link.to.y}`}
                fill="none"
                stroke={hoveredNode === link.supplierProduct.masterProductId || hoveredNode === link.supplierProduct.supplierId 
                  ? '#3b82f6' 
                  : 'url(#linkGradient)'}
                strokeWidth={hoveredNode === link.supplierProduct.masterProductId || hoveredNode === link.supplierProduct.supplierId ? 3 : 2}
                className="transition-all duration-200"
              />
              <circle cx={link.to.x} cy={link.to.y - 5} r="4" fill="#10b981" />
            </g>
          ))}

          {relevantMasterProducts.map(mp => {
            const pos = masterPositions[mp.id];
            if (!pos) return null;
            
            const isHovered = hoveredNode === mp.id;
            const linkedCount = activeSupplierProducts.filter(sp => sp.masterProductId === mp.id).length;
            
            return (
              <g 
                key={mp.id}
                onMouseEnter={() => setHoveredNode(mp.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => setSelectedMasterProduct(selectedMasterProduct === mp.id ? null : mp.id)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={pos.width}
                  height={pos.height}
                  rx="12"
                  fill={isHovered ? '#dbeafe' : '#eff6ff'}
                  stroke={isHovered ? '#3b82f6' : '#bfdbfe'}
                  strokeWidth={isHovered ? 2 : 1}
                  filter="url(#shadow)"
                  className="transition-all duration-200"
                />
                <foreignObject x={pos.x} y={pos.y} width={pos.width} height={pos.height}>
                  <div className="h-full flex flex-col items-center justify-center p-2">
                    <Package size={20} className="text-blue-500 mb-1" />
                    <p className="text-xs font-bold text-slate-800 text-center truncate w-full px-2">
                      {mp.name}
                    </p>
                    <p className="text-[10px] text-slate-500">{mp.id}</p>
                    <span className="mt-1 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {linkedCount} supplier{linkedCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {relevantSuppliers.map(supplier => {
            const pos = supplierPositions[supplier.id];
            if (!pos) return null;
            
            const isHovered = hoveredNode === supplier.id;
            const linkedProducts = activeSupplierProducts.filter(sp => sp.supplierId === supplier.id);
            
            return (
              <g 
                key={supplier.id}
                onMouseEnter={() => setHoveredNode(supplier.id)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={pos.width}
                  height={pos.height}
                  rx="12"
                  fill={isHovered ? '#d1fae5' : '#ecfdf5'}
                  stroke={isHovered ? '#10b981' : '#a7f3d0'}
                  strokeWidth={isHovered ? 2 : 1}
                  filter="url(#shadow)"
                  className="transition-all duration-200"
                />
                <foreignObject x={pos.x} y={pos.y} width={pos.width} height={pos.height}>
                  <div className="h-full flex flex-col items-center justify-center p-2">
                    <Building2 size={20} className="text-emerald-500 mb-1" />
                    <p className="text-xs font-bold text-slate-800 text-center truncate w-full px-2">
                      {supplier.name}
                    </p>
                    <p className="text-[10px] text-slate-500">{supplier.id}</p>
                    {linkedProducts.length > 0 && (
                      <span className="mt-1 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                        {linkedProducts.length} product{linkedProducts.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </foreignObject>
              </g>
            );
          })}

          <text x="20" y="35" className="text-xs font-bold" fill="#64748b">MASTER PRODUCTS</text>
          <text x="20" y={supplierY - 15} className="text-xs font-bold" fill="#64748b">SUPPLIERS</text>
        </svg>
      </div>

      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="flex items-center gap-6 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></div>
            <span>Master Product ({relevantMasterProducts.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></div>
            <span>Supplier ({relevantSuppliers.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500"></div>
            <span>Supply Link ({links.length})</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductNetworkGraph;
