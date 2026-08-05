import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, Building2, Globe2, Mail, MapPin, Search, Users, UserRound,
} from 'lucide-react';
import { Supplier } from '../types';
import { getIndustryTagStyle } from './industryUtils';
import {
  filterByIndustryTag,
  computeTypeCounts,
  computeCountryCounts,
  computeScalars,
  normalizeTag,
} from './industryLogic';

interface IndustryAnalysisProps {
  suppliers: Supplier[];
  industryTag?: string;
  onBackToContacts: () => void;
}

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

const IndustryPill: React.FC<{ tag: string }> = ({ tag }) => (
  <span
    style={getIndustryTagStyle(tag)}
    className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold"
  >
    {tag}
  </span>
);

const BarRow: React.FC<{ label: string; value: number; total: number; color?: string }> = ({
  label,
  value,
  total,
  color = 'bg-blue-500',
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="truncate text-slate-600">{label}</span>
      <span className="font-semibold text-slate-800">{formatNumber(value)}</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${total ? Math.max((value / total) * 100, value > 0 ? 3 : 0) : 0}%` }}
      />
    </div>
  </div>
);

const IndustryAnalysis: React.FC<IndustryAnalysisProps> = ({
  suppliers,
  industryTag,
  onBackToContacts,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const selectedTag = industryTag?.trim() || '';

  const matchingSuppliers = useMemo(
    () => filterByIndustryTag(suppliers, selectedTag),
    [suppliers, selectedTag],
  );

  const visibleSuppliers = useMemo(() => {
    const query = normalizeTag(searchQuery);
    if (!query) return matchingSuppliers;
    return matchingSuppliers.filter((supplier) => [
      supplier.name,
      supplier.contactName,
      supplier.contactEmail,
      supplier.country,
      supplier.contactType,
    ].some((value) => normalizeTag(value).includes(query)));
  }, [matchingSuppliers, searchQuery]);

  const typeCounts = useMemo(() => computeTypeCounts(matchingSuppliers), [matchingSuppliers]);

  const countryCounts = useMemo(() => computeCountryCounts(matchingSuppliers), [matchingSuppliers]);

  const { activeCount, withEmailCount, withWebsiteCount, uniqueCountries } = useMemo(
    () => computeScalars(matchingSuppliers),
    [matchingSuppliers],
  );

  return (
    <div className="min-h-full bg-slate-50 -m-6 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={onBackToContacts}
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600"
            >
              <ArrowLeft size={16} /> Back to Contact Network
            </button>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-600 p-3 text-white shadow-sm">
                <Building2 size={24} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Industry analysis</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-900">{selectedTag || 'Industry overview'}</h1>
                <p className="mt-1 text-sm text-slate-500">
                  A comparison of contacts already available in Contact Network
                </p>
              </div>
            </div>
          </div>
          {selectedTag && <IndustryPill tag={selectedTag} />}
        </div>

        {!selectedTag ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">
            <h2 className="font-semibold">No industry selected</h2>
            <p className="mt-1 text-sm">Open this tool by clicking an industry tag in Contact Network.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Matching contacts', value: matchingSuppliers.length, icon: Users, iconClass: 'text-blue-600', backgroundClass: 'bg-blue-50' },
                { label: 'Active contacts', value: activeCount, icon: UserRound, iconClass: 'text-emerald-600', backgroundClass: 'bg-emerald-50' },
                { label: 'Countries represented', value: uniqueCountries, icon: Globe2, iconClass: 'text-violet-600', backgroundClass: 'bg-violet-50' },
                { label: 'Contacts with email', value: withEmailCount, icon: Mail, iconClass: 'text-amber-600', backgroundClass: 'bg-amber-50' },
              ].map(({ label, value, icon: Icon, iconClass, backgroundClass }) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className={`mb-4 inline-flex rounded-lg p-2 ${iconClass} ${backgroundClass}`}>
                    <Icon size={18} />
                  </div>
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-1 text-3xl font-bold text-slate-900">{formatNumber(value)}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-900">Contact type comparison</h2>
                    <p className="mt-1 text-xs text-slate-500">How this industry is distributed</p>
                  </div>
                  <Users size={18} className="text-slate-400" />
                </div>
                <div className="space-y-4">
                  {typeCounts.length ? typeCounts.map(([type, count]) => (
                    <BarRow key={type} label={type} value={count} total={matchingSuppliers.length} color="bg-blue-500" />
                  )) : <p className="text-sm text-slate-400">No contact type data available.</p>}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-900">Geographic comparison</h2>
                    <p className="mt-1 text-xs text-slate-500">Top countries by contact count</p>
                  </div>
                  <MapPin size={18} className="text-slate-400" />
                </div>
                <div className="space-y-4">
                  {countryCounts.length ? countryCounts.map(([country, count]) => (
                    <BarRow key={country} label={country} value={count} total={matchingSuppliers.length} color="bg-violet-500" />
                  )) : <p className="text-sm text-slate-400">No country data available.</p>}
                </div>
              </section>
            </div>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
                <div>
                  <h2 className="font-semibold text-slate-900">Matching contacts</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatNumber(visibleSuppliers.length)} of {formatNumber(matchingSuppliers.length)} contacts shown
                    {' · '}{formatNumber(withWebsiteCount)} with website
                  </p>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search matching contacts..."
                    className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Company', 'Contact', 'Type', 'Country', 'Status'].map((heading) => (
                        <th key={heading} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {visibleSuppliers.map((supplier) => (
                      <tr key={supplier.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-5 py-4">
                          <div className="font-medium text-slate-900">{supplier.name}</div>
                          {supplier.website && (
                            <a href={supplier.website} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                              <Globe2 size={12} /> Website
                            </a>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-sm text-slate-800">{supplier.contactName || '—'}</div>
                          {supplier.contactEmail && <div className="mt-1 text-xs text-slate-500">{supplier.contactEmail}</div>}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{supplier.contactType || 'Unclassified'}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{supplier.country || 'Unknown'}</td>
                        <td className="whitespace-nowrap px-5 py-4">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${supplier.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {supplier.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {visibleSuppliers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-400">
                          No matching contacts found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default IndustryAnalysis;