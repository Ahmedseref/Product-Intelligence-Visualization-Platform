import React, { useState, useRef, useEffect } from 'react';
import { Product, CustomField, TreeNode } from '../types';
import { ICONS, CURRENCIES, UNITS } from '../constants';
import ProductDetailsModal from './ProductDetailsModal';
import { Check, X } from 'lucide-react';

interface ProductListProps {
  products: Product[];
  onUpdate: (p: Product) => void;
  onDelete: (id: string) => void;
  customFields: CustomField[];
  treeNodes: TreeNode[];
}

interface EditingCell {
  productId: string;
  field: string;
}

const ProductList: React.FC<ProductListProps> = ({ products, onUpdate, onDelete, customFields, treeNodes }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sortField, setSortField] = useState<keyof Product>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const handleSort = (field: keyof Product) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getProductPathString = (nodeId: string) => {
    const path: string[] = [];
    let current = treeNodes.find(n => n.id === nodeId);
    while (current) {
      path.unshift(current.name);
      current = treeNodes.find(n => n.id === current?.parentId);
    }
    return path.join(' > ');
  };

  const startEditing = (product: Product, field: string, currentValue: string | number) => {
    setEditingCell({ productId: product.id, field });
    setEditValue(String(currentValue));
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveEdit = (product: Product) => {
    if (!editingCell) return;
    
    const updatedProduct = { ...product };
    const field = editingCell.field;
    
    switch (field) {
      case 'name':
        updatedProduct.name = editValue;
        break;
      case 'supplier':
        updatedProduct.supplier = editValue;
        break;
      case 'price':
        updatedProduct.price = parseFloat(editValue) || 0;
        break;
      case 'moq':
        updatedProduct.moq = parseInt(editValue) || 1;
        break;
      case 'leadTime':
        updatedProduct.leadTime = parseInt(editValue) || 0;
        break;
      case 'manufacturer':
        updatedProduct.manufacturer = editValue;
        break;
    }
    
    updatedProduct.lastUpdated = new Date().toISOString();
    onUpdate(updatedProduct);
    cancelEditing();
  };

  const handleKeyDown = (e: React.KeyboardEvent, product: Product) => {
    if (e.key === 'Enter') {
      saveEdit(product);
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  const sortedProducts = [...products].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    }
    return 0;
  });

  const isEditing = (productId: string, field: string) => 
    editingCell?.productId === productId && editingCell?.field === field;

  const renderEditableCell = (product: Product, field: string, displayValue: React.ReactNode, rawValue: string | number, className?: string) => {
    if (isEditing(product.id, field)) {
      return (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <input
            ref={inputRef}
            type={typeof rawValue === 'number' ? 'number' : 'text'}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => handleKeyDown(e, product)}
            onBlur={() => saveEdit(product)}
            className="w-full px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button 
            onClick={() => saveEdit(product)}
            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
          >
            <Check size={14} />
          </button>
          <button 
            onClick={cancelEditing}
            className="p-1 text-red-600 hover:bg-red-50 rounded"
          >
            <X size={14} />
          </button>
        </div>
      );
    }
    
    return (
      <div 
        className={`cursor-text hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 rounded px-1 py-0.5 transition-all ${className || ''}`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEditing(product, field, rawValue);
        }}
        title="Double-click to edit"
      >
        {displayValue}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all">
            {ICONS.Filter} Filter
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all">
            {ICONS.Download} Export CSV
          </button>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">Double-click cells to edit</span>
          <p className="text-sm text-slate-500 font-medium">{products.length} Products</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer" onClick={() => handleSort('id')}>
                  ID {sortField === 'id' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer" onClick={() => handleSort('name')}>
                  Product {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Hierarchy Path
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer" onClick={() => handleSort('price')}>
                  Pricing {sortField === 'price' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer" onClick={() => handleSort('leadTime')}>
                  Lead Time {sortField === 'leadTime' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedProducts.map((p) => (
                <tr 
                  key={p.id} 
                  className="group hover:bg-blue-50/30 transition-colors cursor-pointer"
                  onClick={() => !editingCell && setSelectedProduct(p)}
                >
                  <td className="px-6 py-4 text-xs font-mono font-bold text-blue-600">{p.id}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={p.imageUrl} alt={p.name} className="w-10 h-10 rounded-lg object-cover bg-slate-100 border border-slate-200 flex-shrink-0" />
                      <div className="min-w-0">
                        {renderEditableCell(
                          p, 
                          'name', 
                          <span className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors block truncate">{p.name}</span>,
                          p.name
                        )}
                        {renderEditableCell(
                          p,
                          'supplier',
                          <span className="text-[10px] text-slate-500 truncate block">{p.supplier}</span>,
                          p.supplier
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-medium text-slate-400 block max-w-[200px] truncate" title={getProductPathString(p.nodeId)}>
                      {getProductPathString(p.nodeId) || 'Uncategorized'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      {renderEditableCell(
                        p,
                        'price',
                        <div className="text-sm font-bold text-slate-900">{p.currency} {p.price.toLocaleString()}</div>,
                        p.price
                      )}
                      {renderEditableCell(
                        p,
                        'moq',
                        <div className="text-[10px] text-slate-400">Min. {p.moq} {p.unit}</div>,
                        p.moq
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {renderEditableCell(
                      p,
                      'leadTime',
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${p.leadTime > 30 ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                        <span className="text-xs text-slate-600">{p.leadTime}d</span>
                      </div>,
                      p.leadTime
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                      <button 
                        onClick={() => setSelectedProduct(p)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="View details"
                      >
                        {ICONS.Edit}
                      </button>
                      <button 
                        onClick={() => onDelete(p.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete product"
                      >
                        {ICONS.Trash}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center">
                        {ICONS.Inventory}
                      </div>
                      <p className="text-sm font-medium">No products found for this category or search.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProduct && (
        <ProductDetailsModal 
          product={selectedProduct} 
          onClose={() => setSelectedProduct(null)} 
          onUpdate={onUpdate}
          treeNodes={treeNodes}
        />
      )}
    </div>
  );
};

export default ProductList;
