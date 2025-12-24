
import React, { useState } from 'react';
import { Product, User, CustomField } from '../types';
import { CATEGORIES, SECTORS, CURRENCIES, UNITS, ICONS } from '../constants';

interface ProductFormProps {
  onSubmit: (p: Product) => void;
  onCancel: () => void;
  currentUser: User;
  customFields: CustomField[];
}

const ProductForm: React.FC<ProductFormProps> = ({ onSubmit, onCancel, currentUser, customFields }) => {
  const [formData, setFormData] = useState<Partial<Product>>({
    id: `PRD-${Math.floor(1000 + Math.random() * 9000)}`,
    name: '',
    supplier: '',
    category: CATEGORIES[0],
    sector: SECTORS[0],
    subSectors: [],
    manufacturer: '',
    manufacturingLocation: '',
    description: '',
    imageUrl: `https://picsum.photos/seed/${Math.random()}/400/300`,
    price: 0,
    currency: CURRENCIES[0],
    unit: UNITS[0],
    moq: 1,
    leadTime: 30,
    packagingType: '',
    certifications: [],
    shelfLife: '',
    storageConditions: '',
    customFields: [],
    dateAdded: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    createdBy: currentUser.name,
    history: []
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.supplier) return alert("Missing required fields");
    onSubmit(formData as Product);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <div>
             <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Register New Product</h2>
             <p className="text-sm text-slate-400">Fill in the details to create a new indexed record.</p>
          </div>
          <div className="flex gap-3">
             <button type="button" onClick={onCancel} className="px-6 py-2 border border-slate-200 text-slate-500 rounded-xl font-bold hover:bg-slate-50 transition-all">Cancel</button>
             <button type="submit" className="px-8 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all">Save Product Card</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
               <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span> Basic Identification
               </h3>
               
               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Product Name*</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="e.g. Ultra-Resistant Polymer"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Supplier Name*</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="Supplier legal name"
                      value={formData.supplier}
                      onChange={e => setFormData({...formData, supplier: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Sector</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                      value={formData.sector}
                      onChange={e => setFormData({...formData, sector: e.target.value})}
                    >
                      {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                      value={formData.category}
                      onChange={e => setFormData({...formData, category: e.target.value})}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
               </div>

               <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Rich Product Description</label>
                  <textarea 
                    rows={4}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                    placeholder="Provide technical specs, usage context, and selling points..."
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
               </div>
            </div>

            {/* Pricing & Logistics */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
               <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span> Commercial & Logistics
               </h3>

               <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Unit Price</label>
                    <input 
                      type="number" step="0.01"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                      value={formData.price}
                      onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Currency</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                      value={formData.currency}
                      onChange={e => setFormData({...formData, currency: e.target.value})}
                    >
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Unit</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                      value={formData.unit}
                      onChange={e => setFormData({...formData, unit: e.target.value})}
                    >
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">MOQ</label>
                    <input 
                      type="number"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                      value={formData.moq}
                      onChange={e => setFormData({...formData, moq: parseInt(e.target.value) || 1})}
                    />
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Lead Time (Days)</label>
                    <input 
                      type="number"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                      value={formData.leadTime}
                      onChange={e => setFormData({...formData, leadTime: parseInt(e.target.value) || 0})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Packaging Type</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                      placeholder="e.g. Vacuum Sealed"
                      value={formData.packagingType}
                      onChange={e => setFormData({...formData, packagingType: e.target.value})}
                    />
                  </div>
               </div>
            </div>
          </div>

          {/* Sidebar / Extra */}
          <div className="space-y-6">
             <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Image Preview</h3>
                <div className="aspect-video w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
                  {formData.imageUrl ? (
                    <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-slate-300">No Image Selected</div>
                  )}
                </div>
                <button type="button" className="w-full py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all">Upload New Image</button>
             </div>

             <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Manufacturing</h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Company Name</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none"
                      value={formData.manufacturer}
                      onChange={e => setFormData({...formData, manufacturer: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Location (City, Country)</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none"
                      placeholder="e.g. Tokyo, Japan"
                      value={formData.manufacturingLocation}
                      onChange={e => setFormData({...formData, manufacturingLocation: e.target.value})}
                    />
                  </div>
                </div>
             </div>

             <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Compliance</h3>
                  <button type="button" className="text-blue-600 text-xs font-bold">+ Add</button>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Shelf Life</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none"
                      value={formData.shelfLife}
                      onChange={e => setFormData({...formData, shelfLife: e.target.value})}
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                   {['ISO 9001', 'REACH', 'RoHS'].map(cert => (
                      <span key={cert} className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded border border-slate-200">{cert}</span>
                   ))}
                </div>
             </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;
