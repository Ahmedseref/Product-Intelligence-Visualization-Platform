
import React, { useState } from 'react';
import { Product, HistoryEntry } from '../types';
import { ICONS } from '../constants';

interface ProductDetailsModalProps {
  product: Product;
  onClose: () => void;
  onUpdate: (p: Product) => void;
}

const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({ product, onClose, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'custom'>('details');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
             <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200">
                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
             </div>
             <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl font-bold text-slate-900">{product.name}</h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 uppercase tracking-tighter">
                    {product.id}
                  </span>
                </div>
                <p className="text-sm text-slate-500">Supplier: <span className="font-semibold text-slate-700">{product.supplier}</span></p>
             </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 border-b border-slate-100">
          <button 
            onClick={() => setActiveTab('details')}
            className={`px-4 py-3 text-sm font-semibold transition-all border-b-2 ${activeTab === 'details' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Product Details
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-sm font-semibold transition-all border-b-2 ${activeTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Audit History ({product.history.length})
          </button>
          <button 
             onClick={() => setActiveTab('custom')}
             className={`px-4 py-3 text-sm font-semibold transition-all border-b-2 ${activeTab === 'custom' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Dynamic Fields
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'details' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    {ICONS.Details} Core Specifications
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between border-b border-slate-50 pb-2">
                      <span className="text-sm text-slate-500">Sector</span>
                      <span className="text-sm font-semibold text-slate-800">{product.sector}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-50 pb-2">
                      <span className="text-sm text-slate-500">Category</span>
                      <span className="text-sm font-semibold text-slate-800">{product.category}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-50 pb-2">
                      <span className="text-sm text-slate-500">Manufacturer</span>
                      <span className="text-sm font-semibold text-slate-800">{product.manufacturer}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-50 pb-2">
                      <span className="text-sm text-slate-500">Origin</span>
                      <span className="text-sm font-semibold text-slate-800">{product.manufacturingLocation}</span>
                    </div>
                  </div>
                </section>

                <section>
                   <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    {ICONS.Price} Commercials
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100">
                      <p className="text-[10px] font-bold text-blue-500 uppercase">Unit Price</p>
                      <p className="text-lg font-bold text-blue-900">{product.currency} {product.price}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">MOQ</p>
                      <p className="text-lg font-bold text-slate-800">{product.moq} {product.unit}</p>
                    </div>
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                <section>
                   <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    {ICONS.Logistics} Logistics & Compliance
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between border-b border-slate-50 pb-2">
                      <span className="text-sm text-slate-500">Lead Time</span>
                      <span className="text-sm font-semibold text-slate-800">{product.leadTime} Days</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-50 pb-2">
                      <span className="text-sm text-slate-500">Shelf Life</span>
                      <span className="text-sm font-semibold text-slate-800">{product.shelfLife}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-50 pb-2">
                      <span className="text-sm text-slate-500">Packaging</span>
                      <span className="text-sm font-semibold text-slate-800">{product.packagingType}</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    Certifications
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {product.certifications.map((cert, i) => (
                      <span key={i} className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100">
                        {cert}
                      </span>
                    ))}
                  </div>
                </section>

                <section>
                   <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Description</h3>
                   <p className="text-sm text-slate-600 leading-relaxed italic border-l-4 border-slate-200 pl-4">
                    "{product.description}"
                   </p>
                </section>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="relative">
              {product.history.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center mx-auto text-slate-400 mb-4">
                    {ICONS.History}
                  </div>
                  <p className="text-slate-500 font-medium">No version history found for this product.</p>
                </div>
              ) : (
                <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:w-0.5 before:bg-slate-200">
                  {product.history.map((entry) => (
                    <div key={entry.id} className="relative pl-12">
                      <div className="absolute left-0 top-1 w-10 h-10 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center z-10">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-bold text-slate-900">{entry.userName}</p>
                          <span className="text-xs text-slate-500">{new Date(entry.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="space-y-2">
                          {/* Cast Object.entries to correct type to fix property 'old' and 'new' access on unknown type */}
                          {(Object.entries(entry.changes) as [string, { old: any; new: any }][]).map(([field, change], idx) => (
                            <div key={idx} className="flex items-center gap-3 text-xs">
                              <span className="font-bold text-slate-600 capitalize min-w-[100px]">{field}:</span>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded line-through decoration-red-400 opacity-60">{String(change.old)}</span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-bold">{String(change.new)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                   {/* Created date at bottom */}
                   <div className="relative pl-12">
                      <div className="absolute left-0 top-1 w-10 h-10 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center z-10">
                        <div className="w-3 h-3 bg-slate-300 rounded-full"></div>
                      </div>
                      <div className="bg-white p-4">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Product Created</p>
                        <p className="text-xs text-slate-500 mt-1">{new Date(product.dateAdded).toLocaleString()} by {product.createdBy}</p>
                      </div>
                   </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'custom' && (
             <div className="grid grid-cols-2 gap-4">
                {product.customFields.length === 0 ? (
                   <div className="col-span-2 text-center py-20 bg-slate-50 rounded-2xl">
                      <p className="text-slate-400 italic">No custom attributes defined for this record.</p>
                   </div>
                ) : (
                  product.customFields.map((field, idx) => (
                    <div key={idx} className="p-4 bg-white border border-slate-200 rounded-xl">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">{field.fieldId}</p>
                      <p className="text-sm font-semibold text-slate-900">{String(field.value)}</p>
                    </div>
                  ))
                )}
             </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
          <p className="text-xs text-slate-400">Last synced: Just now</p>
          <div className="flex items-center gap-3">
            <button className="px-6 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 shadow-lg shadow-slate-900/10 transition-all flex items-center gap-2">
              {ICONS.Edit} Edit Product
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailsModal;
