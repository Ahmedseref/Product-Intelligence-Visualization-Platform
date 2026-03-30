import React, { useState, useEffect } from 'react';
import { Save, Building2, Phone, Mail, CreditCard, Truck, FileText, Landmark, Image } from 'lucide-react';
import { api } from '../../client/api';
import { ProformaSettingsData } from '../../types';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY', 'AED', 'SAR', 'CNY', 'JPY'];

const ProformaSettingsSection: React.FC = () => {
  const [settings, setSettings] = useState<ProformaSettingsData>({
    companyName: '',
    companyLogo: '',
    address: '',
    phone: '',
    email: '',
    defaultCurrency: 'USD',
    paymentTerms: '',
    deliveryTerms: '',
    notes: '',
    bankDetails: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProformaSettings().then((data) => {
      if (data && data.id) setSettings(data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleChange = (field: keyof ProformaSettingsData, value: string) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveProformaSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error('Failed to save proforma settings', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-slate-400 text-sm">Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Company Identity */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Company Identity</h3>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Company Name</label>
            <input
              type="text"
              value={settings.companyName || ''}
              onChange={e => handleChange('companyName', e.target.value)}
              placeholder="Acme Corporation"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5" /> Company Logo URL
            </label>
            <input
              type="text"
              value={settings.companyLogo || ''}
              onChange={e => handleChange('companyLogo', e.target.value)}
              placeholder="https://yourcompany.com/logo.png"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Address</label>
            <textarea
              value={settings.address || ''}
              onChange={e => handleChange('address', e.target.value)}
              placeholder="123 Main Street, City, Country"
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> Phone
            </label>
            <input
              type="text"
              value={settings.phone || ''}
              onChange={e => handleChange('phone', e.target.value)}
              placeholder="+1 555 000 0000"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> Email
            </label>
            <input
              type="email"
              value={settings.email || ''}
              onChange={e => handleChange('email', e.target.value)}
              placeholder="sales@yourcompany.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        </div>
      </div>

      {/* Invoice Defaults */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Invoice Defaults</h3>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Default Currency</label>
            <select
              value={settings.defaultCurrency || 'USD'}
              onChange={e => handleChange('defaultCurrency', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" /> Delivery Terms (Incoterms)
            </label>
            <input
              type="text"
              value={settings.deliveryTerms || ''}
              onChange={e => handleChange('deliveryTerms', e.target.value)}
              placeholder="EXW, FOB, CIF…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Payment Terms</label>
            <input
              type="text"
              value={settings.paymentTerms || ''}
              onChange={e => handleChange('paymentTerms', e.target.value)}
              placeholder="30% advance, 70% before shipment"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        </div>
      </div>

      {/* Bank Details */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Landmark className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Bank Details</h3>
        </div>
        <div className="p-6">
          <textarea
            value={settings.bankDetails || ''}
            onChange={e => handleChange('bankDetails', e.target.value)}
            placeholder="Bank Name: XYZ Bank&#10;Account Name: Acme Corporation&#10;IBAN: XX00 0000 0000 0000&#10;SWIFT: XYZBUS33"
            rows={4}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none font-mono"
          />
        </div>
      </div>

      {/* Notes / Footer */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Default Notes / Footer</h3>
        </div>
        <div className="p-6">
          <textarea
            value={settings.notes || ''}
            onChange={e => handleChange('notes', e.target.value)}
            placeholder="Prices are valid for 30 days. All goods are subject to our standard terms and conditions."
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          } disabled:opacity-60`}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

export default ProformaSettingsSection;
