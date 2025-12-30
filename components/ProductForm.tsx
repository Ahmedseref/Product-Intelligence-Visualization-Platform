
import React, { useState } from 'react';
import { Product, User, CustomField, TreeNode } from '../types';
import { CURRENCIES, UNITS, ICONS } from '../constants';

interface ProductFormProps {
  onSubmit: (p: Product) => void;
  onCancel: () => void;
  currentUser: User;
  customFields: CustomField[];
  treeNodes: TreeNode[];
  onAddFieldDefinition: (field: CustomField) => void;
}

const ProductForm: React.FC<ProductFormProps> = ({ onSubmit, onCancel, currentUser, customFields, treeNodes, onAddFieldDefinition }) => {
  const [showNewFieldModal, setShowNewFieldModal] = useState(false);
  const [newFieldDef, setNewFieldDef] = useState<Partial<CustomField>>({ label: '', type: 'text' });
  
  const [formData, setFormData] = useState<Partial<Product>>({
    id: `PRD-${Math.floor(1000 + Math.random() * 9000)}`,
    name: '',
    supplier: '',
    nodeId: treeNodes[0]?.id || '',
    category: 'Raw Materials', // Kept for logic compat
    sector: 'Industrial', // Kept for logic compat
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

  const handleCustomFieldChange = (fieldId: string, value: any) => {
    const existing = formData.customFields || [];
    const index = existing.findIndex(f => f.fieldId === fieldId);
    
    if (index >= 0) {
      const updated = [...existing];
      updated[index] = { fieldId, value };
      setFormData({ ...formData, customFields: updated });
    } else {
      setFormData({ ...formData, customFields: [...existing, { fieldId, value }] });
    }
  };

  const addNewFieldDefinition = () => {
    if (!newFieldDef.label) return;
    const id = newFieldDef.label.toLowerCase().replace(/\s+/g, '_');
    onAddFieldDefinition({
      id,
      label: newFieldDef.label,
      type: newFieldDef.type as any,
    });
    setNewFieldDef({ label: '', type: 'text' });
    setShowNewFieldModal(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.supplier || !formData.nodeId) return alert("Missing required fields");
    
    // Sync flat fields from tree for compatibility
    const node = treeNodes.find(n => n.id === formData.nodeId);
    let sector = 'Unknown';
    let current = node;
    while(current) {
        if(current.type === 'sector') {
            sector = current.name;
            break;
        }
        current = treeNodes.find(n => n.id === current?.parentId);
    }

    const submission = {
        ...formData,
        sector,
        category: node?.name || 'Uncategorized'
    };

    onSubmit(submission as Product);
  };

  const getFullNodePathString = (id: string) => {
    const path: string[] = [];
    let current = treeNodes.find(n => n.id === id);
    while (current) {
      path.unshift(current.name);
      current = treeNodes.find(n => n.id === current?.parentId);
    }
    return path.join(' > ');
  };

  return (
    <div className="max-w-5xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <div>
             <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Register New Product</h2>
             <p className="text-sm text-slate-400">Assign to the taxonomy tree and define technical specs.</p>
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
                <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span> Taxonomy & Identity
               </h3>
               
               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product Name*</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="e.g. Ultra-Resistant Polymer"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Supplier Name*</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="Supplier legal name"
                      value={formData.supplier}
                      onChange={e => setFormData({...formData, supplier: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Taxonomy Placement (Tree Node)*</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.nodeId}
                      onChange={e => setFormData({...formData, nodeId: e.target.value})}
                      required
                    >
                      <option value="">Select a category...</option>
                      {treeNodes.map(node => (
                        <option key={node.id} value={node.id}>
                          {node.type.toUpperCase()}: {getFullNodePathString(node.id)}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1 italic">Assigning to a leaf node provides best visualization accuracy.</p>
                  </div>
               </div>

               <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rich Product Description</label>
                  <textarea 
                    rows={4}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                    placeholder="Provide technical specs, usage context, and selling points..."
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
               </div>
            </div>

            {/* Custom Attributes Section */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
               <div className="flex items-center justify-between">
                 <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-purple-500 rounded-full"></span> Technical Attributes
                 </h3>
                 <button 
                  type="button" 
                  onClick={() => setShowNewFieldModal(true)}
                  className="text-xs font-bold bg-purple-50 text-purple-600 px-3 py-1 rounded-full hover:bg-purple-100 transition-all flex items-center gap-1"
                 >
                   {ICONS.Add} New Field
                 </button>
               </div>

               {customFields.length === 0 ? (
                 <div className="text-center py-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                   <p className="text-sm text-slate-400">No custom technical fields defined.</p>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                   {customFields.map((field) => (
                     <div key={field.id} className="space-y-1">
                       <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{field.label}</label>
                       <input 
                         type={field.type === 'number' || field.type === 'currency' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                         className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                         placeholder={`Enter ${field.label.toLowerCase()}...`}
                         value={formData.customFields?.find(f => f.fieldId === field.id)?.value || ''}
                         onChange={e => handleCustomFieldChange(field.id, e.target.value)}
                       />
                     </div>
                   ))}
                 </div>
               )}
            </div>

            {/* Commercials */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
               <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span> Commercial & Logistics
               </h3>

               <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unit Price</label>
                    <input 
                      type="number" step="0.01"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                      value={formData.price}
                      onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Currency</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                      value={formData.currency}
                      onChange={e => setFormData({...formData, currency: e.target.value})}
                    >
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unit</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                      value={formData.unit}
                      onChange={e => setFormData({...formData, unit: e.target.value})}
                    >
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">MOQ</label>
                    <input 
                      type="number"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                      value={formData.moq}
                      onChange={e => setFormData({...formData, moq: parseInt(e.target.value) || 1})}
                    />
                  </div>
               </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
             <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Image Asset</h3>
                <div className="aspect-video w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center relative group">
                  {formData.imageUrl ? (
                    <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-slate-300">No Asset</div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button type="button" className="p-2 bg-white rounded-full text-blue-600 shadow-lg">
                      {ICONS.Edit}
                    </button>
                  </div>
                </div>
                <button type="button" className="w-full py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all">Upload New Image</button>
             </div>

             <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Manufacturing</h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fabricator / Manufacturer</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none"
                      value={formData.manufacturer}
                      onChange={e => setFormData({...formData, manufacturer: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Origin</label>
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
          </div>
        </div>
      </form>

      {/* New Field Modal */}
      {showNewFieldModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Define New Technical Field</h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Field Label</label>
                <input 
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none"
                  placeholder="e.g. Molecular Weight"
                  value={newFieldDef.label}
                  onChange={e => setNewFieldDef({...newFieldDef, label: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Type</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none"
                  value={newFieldDef.type}
                  onChange={e => setNewFieldDef({...newFieldDef, type: e.target.value as any})}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="currency">Currency</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                 <button 
                  onClick={() => setShowNewFieldModal(false)}
                  className="flex-1 py-2 bg-slate-50 text-slate-500 rounded-xl font-bold hover:bg-slate-100"
                 >
                   Cancel
                 </button>
                 <button 
                  onClick={addNewFieldDefinition}
                  className="flex-1 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700"
                 >
                   Confirm
                 </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductForm;
