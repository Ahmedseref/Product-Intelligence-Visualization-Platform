// ─────────────────────────────────────────────────────────────────────────────
// PrimerLibrary
// Standalone library tab for the System Builder. Lets the user define
// primers (each tied to a product) tagged with the substrate(s), humidity,
// and system type(s) they serve. Adaptive primer slots in system layers
// resolve their actual product from these entries at spec time.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Library, Plus, Search, X, Edit, Trash2, Save, Check, AlertCircle, Layers, Star,
} from 'lucide-react';
import { Product, PrimerLibraryEntry, PrimerGroup, QualificationTag } from '../../types';
import { primerLibraryApi, primerGroupsApi } from '../../client/api';

// Closed list — these are the four families the library cares about. They're
// not in qualification_vocabularies because they're library-specific.
const SYSTEM_TYPES = ['Epoxy', 'PU', 'Polyurea', 'Acrylic'] as const;

// Colour map for humidity pills. Mirrors the qualification colour scheme so
// the same pill in two different surfaces always looks the same.
function humidityPillClass(value: string | null): string {
  if (!value) return 'bg-slate-100 text-slate-500';
  const v = value.toLowerCase();
  if (v.includes('dry') || v.includes('standard') || v.includes('0–4') || v.includes('0-4')) {
    return 'bg-slate-100 text-slate-700';
  }
  if (v.includes('slightly') || v.includes('moisture') || v.includes('4–6') || v.includes('4-6')) {
    return 'bg-blue-100 text-blue-700';
  }
  if (v.includes('damp') || v.includes('6–8') || v.includes('6-8')) {
    return 'bg-amber-100 text-amber-700';
  }
  if (v.includes('wet') || v.includes('underwater') || v.includes('>8')) {
    return 'bg-teal-100 text-teal-700';
  }
  return 'bg-slate-100 text-slate-500';
}

interface VocabOption { value: string; label: string }

interface PrimerLibraryProps {
  products: Product[];
}

interface FormState {
  productId: string;
  productSearch: string;
  compatibleSubstrates: string[];
  humidityTolerance: string;
  dutyRating: string;
  compatibleSystemTypes: string[];
  notes: string;
}

const EMPTY_FORM: FormState = {
  productId: '',
  productSearch: '',
  compatibleSubstrates: [],
  humidityTolerance: '',
  dutyRating: '',
  compatibleSystemTypes: [],
  notes: '',
};

const PrimerLibrary: React.FC<PrimerLibraryProps> = ({ products }) => {
  const [entries, setEntries] = useState<PrimerLibraryEntry[]>([]);
  const [vocab, setVocab] = useState<{ substrate: VocabOption[]; humidity: VocabOption[]; duty: VocabOption[] }>({ substrate: [], humidity: [], duty: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter / search state
  const [search, setSearch] = useState('');
  const [filterSubstrate, setFilterSubstrate] = useState<string>('');
  const [filterHumidity, setFilterHumidity] = useState<string>('');
  const [filterDuty, setFilterDuty] = useState<string>('');
  const [filterSystemType, setFilterSystemType] = useState<string>('');

  // Add / edit form state. `editingId` is null when creating, an entry id
  // when editing. The form panel is rendered inline beneath the toolbar.
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Qualification-tagged primers ("source of truth" for products the user
  // has already marked as primers in Product Qualification). We surface
  // those that are NOT yet in the library as a one-click import section
  // so the two systems stay linked instead of asking the user to retype
  // substrate/humidity that was already captured upstream.
  const [qualPrimerTags, setQualPrimerTags] = useState<QualificationTag[]>([]);

  // ── Groups state ──
  // Named bundles of primer_library entries. Created/edited inline here;
  // consumed by the System Builder's adaptive primer slot as one-click pins.
  const [groups, setGroups] = useState<PrimerGroup[]>([]);
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [groupForm, setGroupForm] = useState<{
    name: string;
    description: string;
    primerLibraryIds: string[];
    defaultPrimerLibraryId: string;
  }>({ name: '', description: '', primerLibraryIds: [], defaultPrimerLibraryId: '' });
  const [groupMemberSearch, setGroupMemberSearch] = useState('');
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  const refreshGroups = useCallback(async () => {
    try {
      const rows: PrimerGroup[] = await primerGroupsApi.list();
      setGroups(rows);
    } catch (e: any) {
      // Non-fatal — groups section just stays empty.
      console.error('Failed to load primer groups:', e);
    }
  }, []);
  useEffect(() => { refreshGroups(); }, [refreshGroups]);

  // ── Load entries + vocab on mount ──
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: PrimerLibraryEntry[] = await primerLibraryApi.list();
      setEntries(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load primer library');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch qualification tags once and keep only the ones whose layer
  // position is "primer". The list endpoint already filters to
  // is_system_ready = true, which matches what the System Builder cares
  // about. Failures are non-fatal — the Suggested panel just hides.
  const refreshQualTags = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/qualification-tags', { headers });
      if (!res.ok) return;
      const rows: QualificationTag[] = await res.json();
      setQualPrimerTags(rows.filter(r => (r.layerPosition || '').toLowerCase() === 'primer'));
    } catch (e) {
      console.error('Failed to load qualification tags for primer suggestions:', e);
    }
  }, []);
  useEffect(() => { refreshQualTags(); }, [refreshQualTags]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch('/api/qualification-vocabularies', { headers });
        if (!res.ok) return;
        const grouped: Record<string, Array<{ value: string; label: string; isActive?: boolean | null }>> = await res.json();
        if (cancelled) return;
        const pickActive = (arr?: Array<{ value: string; label: string; isActive?: boolean | null }>) =>
          (arr || []).filter(o => o.isActive !== false).map(o => ({ value: o.value, label: o.label }));
        setVocab({
          substrate: pickActive(grouped.substrate),
          humidity: pickActive(grouped.humidity),
          duty: pickActive(grouped.duty),
        });
      } catch (e) {
        console.error('Failed to load vocabularies:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Client-side filtering (the API also supports filters but we filter
  // client-side here so the search updates live without a network round-trip). ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filterSubstrate && !(e.compatibleSubstrates || []).includes(filterSubstrate)) return false;
      if (filterHumidity && e.humidityTolerance !== filterHumidity) return false;
      if (filterDuty && e.dutyRating !== filterDuty) return false;
      if (filterSystemType && !(e.compatibleSystemTypes || []).includes(filterSystemType)) return false;
      if (q) {
        const hay = `${e.productName || ''} ${e.supplier || ''} ${e.primerId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, filterSubstrate, filterHumidity, filterDuty, filterSystemType]);

  // Tags whose product isn't yet represented in the library — these are
  // the candidates surfaced in the "Suggested from Product Qualification"
  // panel so the user can promote them with one click. We compare on
  // productId because the library uniqueness rule is per-product.
  const suggestedFromQual = useMemo(() => {
    const inLibrary = new Set(entries.map(e => e.productId));
    return qualPrimerTags.filter(t => !inLibrary.has(t.productId));
  }, [qualPrimerTags, entries]);

  // ── Form helpers ──
  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  // Open the create form pre-filled from a qualification tag so the user
  // only has to confirm the system type(s) and save. We carry over the
  // substrate list + humidity verbatim. The form remains in "create" mode
  // (editingId stays null) so save flows through primerLibraryApi.create.
  const openCreateFromTag = (tag: QualificationTag) => {
    const product = products.find(p => p.id === tag.productId);
    setEditingId(null);
    setForm({
      productId: tag.productId,
      productSearch: product?.name || tag.productId,
      compatibleSubstrates: tag.substrateTypes || [],
      humidityTolerance: tag.humidityTolerance || '',
      dutyRating: tag.dutyRating || '',
      compatibleSystemTypes: [],
      notes: 'Imported from Product Qualification',
    });
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (entry: PrimerLibraryEntry) => {
    setEditingId(entry.id);
    setForm({
      productId: entry.productId,
      productSearch: entry.productName || '',
      compatibleSubstrates: entry.compatibleSubstrates || [],
      humidityTolerance: entry.humidityTolerance || '',
      dutyRating: entry.dutyRating || '',
      compatibleSystemTypes: entry.compatibleSystemTypes || [],
      notes: entry.notes || '',
    });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const validate = (): string | null => {
    if (!form.productId) return 'Select a product';
    if (form.compatibleSubstrates.length === 0) return 'Pick at least one substrate';
    if (!form.humidityTolerance) return 'Set humidity tolerance';
    if (form.compatibleSystemTypes.length === 0) return 'Pick at least one system type';
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { setFormError(err); return; }
    setSaving(true);
    setFormError(null);
    try {
      if (editingId == null) {
        await primerLibraryApi.create({
          productId: form.productId,
          compatibleSubstrates: form.compatibleSubstrates,
          humidityTolerance: form.humidityTolerance,
          dutyRating: form.dutyRating || null,
          compatibleSystemTypes: form.compatibleSystemTypes,
          notes: form.notes || null,
        });
      } else {
        await primerLibraryApi.update(editingId, {
          productId: form.productId,
          compatibleSubstrates: form.compatibleSubstrates,
          humidityTolerance: form.humidityTolerance,
          dutyRating: form.dutyRating || null,
          compatibleSystemTypes: form.compatibleSystemTypes,
          notes: form.notes || null,
        });
      }
      await refresh();
      // Re-pull qualification tags so any newly imported primer drops
      // off the suggestion list immediately after save.
      await refreshQualTags();
      closeForm();
    } catch (e: any) {
      setFormError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Group form helpers ──
  const openCreateGroup = () => {
    setEditingGroupId(null);
    setGroupForm({ name: '', description: '', primerLibraryIds: [], defaultPrimerLibraryId: '' });
    setGroupMemberSearch('');
    setGroupError(null);
    setGroupFormOpen(true);
  };
  const openEditGroup = (g: PrimerGroup) => {
    setEditingGroupId(g.id);
    setGroupForm({
      name: g.name,
      description: g.description || '',
      primerLibraryIds: g.primerLibraryIds || [],
      defaultPrimerLibraryId: g.defaultPrimerLibraryId || '',
    });
    setGroupMemberSearch('');
    setGroupError(null);
    setGroupFormOpen(true);
  };
  const closeGroupForm = () => {
    setGroupFormOpen(false);
    setEditingGroupId(null);
    setGroupError(null);
  };
  const toggleGroupMember = (primerId: string) => {
    setGroupForm(f => {
      const has = f.primerLibraryIds.includes(primerId);
      const next = has ? f.primerLibraryIds.filter(x => x !== primerId) : [...f.primerLibraryIds, primerId];
      // If we removed the current default, clear it.
      const nextDefault = !next.includes(f.defaultPrimerLibraryId) ? '' : f.defaultPrimerLibraryId;
      return { ...f, primerLibraryIds: next, defaultPrimerLibraryId: nextDefault };
    });
  };
  const handleSaveGroup = async () => {
    const name = groupForm.name.trim();
    if (!name) { setGroupError('Name is required'); return; }
    if (groupForm.primerLibraryIds.length === 0) { setGroupError('Add at least one primer'); return; }
    setGroupSaving(true);
    setGroupError(null);
    try {
      const payload = {
        name,
        description: groupForm.description.trim() || null,
        primerLibraryIds: groupForm.primerLibraryIds,
        defaultPrimerLibraryId: groupForm.defaultPrimerLibraryId || null,
      };
      if (editingGroupId == null) await primerGroupsApi.create(payload);
      else await primerGroupsApi.update(editingGroupId, payload);
      await refreshGroups();
      closeGroupForm();
    } catch (e: any) {
      setGroupError(e?.message || 'Save failed');
    } finally {
      setGroupSaving(false);
    }
  };
  const handleDeleteGroup = async (g: PrimerGroup) => {
    if (!confirm(`Delete group "${g.name}"? Layers already pinned to its primer will keep that pin.`)) return;
    try {
      await primerGroupsApi.deactivate(g.id);
      await refreshGroups();
    } catch (e: any) {
      alert(e?.message || 'Failed to delete group');
    }
  };

  // Members shown in the group form's picker — entries optionally filtered
  // by the small inline search; we also surface already-selected members
  // even if they don't match the search so the user always sees what they
  // already added.
  const groupMemberOptions = useMemo(() => {
    const q = groupMemberSearch.trim().toLowerCase();
    return entries.filter(e => {
      if (groupForm.primerLibraryIds.includes(e.primerId)) return true;
      if (!q) return true;
      const hay = `${e.productName || ''} ${e.supplier || ''} ${e.primerId}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, groupMemberSearch, groupForm.primerLibraryIds]);

  const handleDeactivate = async (entry: PrimerLibraryEntry) => {
    if (!confirm(`Deactivate "${entry.productName || entry.primerId}"? It can be re-added later if needed.`)) return;
    try {
      await primerLibraryApi.deactivate(entry.id);
      await refresh();
    } catch (e: any) {
      alert(e?.message || 'Failed to deactivate');
    }
  };

  // Product autocomplete results — filtered by name / supplier / stock code.
  // Capped to 12 to keep the dropdown manageable for large catalogs.
  const productMatches = useMemo(() => {
    const q = form.productSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(p => {
        const hay = `${p.name || ''} ${p.supplier || ''} ${p.stockCode || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [products, form.productSearch]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Library size={22} className="text-indigo-600" />
          <h2 className="text-xl font-bold text-slate-800">Primer Library</h2>
          <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium" data-testid="primer-count-badge">
            {entries.length} primer{entries.length === 1 ? '' : 's'} defined
          </span>
        </div>
        <button
          onClick={openCreateForm}
          className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 inline-flex items-center gap-1.5"
          data-testid="add-primer-button"
        >
          <Plus size={14} /> Add primer
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by product or supplier"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
            data-testid="primer-search"
          />
        </div>
        <select
          value={filterSubstrate}
          onChange={(e) => setFilterSubstrate(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          data-testid="filter-substrate"
        >
          <option value="">All substrates</option>
          {vocab.substrate.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={filterHumidity}
          onChange={(e) => setFilterHumidity(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          data-testid="filter-humidity"
        >
          <option value="">All humidity</option>
          {vocab.humidity.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={filterDuty}
          onChange={(e) => setFilterDuty(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          data-testid="filter-duty"
        >
          <option value="">All duty</option>
          {vocab.duty.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={filterSystemType}
          onChange={(e) => setFilterSystemType(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          data-testid="filter-system-type"
        >
          <option value="">All system types</option>
          {SYSTEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Groups — named bundles of primers reusable across systems. The
          adaptive primer slot in the System Builder consumes these as a
          single dropdown that pins the group's default member as the
          layer's default. All maintenance lives here so the slot itself
          stays minimal. Collapsed by default once any groups exist. */}
      <details className="mb-4 border border-indigo-200 bg-indigo-50/30 rounded-xl" open={groups.length === 0 || groupFormOpen} data-testid="primer-groups-section">
        <summary className="px-3 py-2 cursor-pointer select-none flex items-center gap-2 text-sm font-semibold text-indigo-800">
          <Layers size={14} className="text-indigo-600" />
          Primer groups
          <span className="text-[11px] font-normal text-indigo-600/80">
            {groups.length} group{groups.length === 1 ? '' : 's'} · reusable across systems
          </span>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); openCreateGroup(); }}
            className="ml-auto px-2 py-1 bg-indigo-600 text-white text-[11px] font-medium rounded hover:bg-indigo-700 inline-flex items-center gap-1"
            data-testid="add-primer-group-button"
          >
            <Plus size={11} /> New group
          </button>
        </summary>

        <div className="px-3 pb-3 space-y-2">
          {/* Existing groups list */}
          {groups.length === 0 && !groupFormOpen && (
            <div className="text-xs text-slate-500 italic px-2 py-3">
              No groups yet. Create a group to bundle several primers together (e.g. "Damp Concrete Pack") and reuse it from any system's adaptive primer slot.
            </div>
          )}
          {groups.map(g => {
            const memberRows = (g.primerLibraryIds || [])
              .map(pid => entries.find(e => e.primerId === pid))
              .filter((x): x is PrimerLibraryEntry => !!x);
            return (
              <div key={g.id} className="bg-white border border-slate-200 rounded-lg p-2.5" data-testid={`primer-group-${g.groupId}`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400">{g.groupId}</span>
                      <span className="text-sm font-semibold text-slate-700 truncate">{g.name}</span>
                      <span className="text-[11px] text-slate-400">· {(g.primerLibraryIds || []).length} member{(g.primerLibraryIds || []).length === 1 ? '' : 's'}</span>
                    </div>
                    {g.description && (
                      <div className="text-[11px] text-slate-500 mt-0.5">{g.description}</div>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {memberRows.map(m => {
                        const isDefault = g.defaultPrimerLibraryId === m.primerId;
                        return (
                          <span
                            key={m.primerId}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 ${isDefault ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-700'}`}
                            title={isDefault ? 'Default — pinned when this group is applied' : undefined}
                          >
                            {isDefault && <Star size={9} fill="currentColor" />}
                            {m.productName || m.primerId}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditGroup(g)}
                      className="p-1 text-slate-400 hover:text-indigo-600"
                      title="Edit group"
                      data-testid={`edit-primer-group-${g.groupId}`}
                    >
                      <Edit size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(g)}
                      className="p-1 text-slate-400 hover:text-red-600"
                      title="Delete group"
                      data-testid={`delete-primer-group-${g.groupId}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Inline group form */}
          {groupFormOpen && (
            <div className="bg-white border border-indigo-300 rounded-lg p-3" data-testid="primer-group-form">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-800">
                  {editingGroupId == null ? 'New primer group' : 'Edit primer group'}
                </h4>
                <button onClick={closeGroupForm} className="p-1 hover:bg-slate-100 rounded text-slate-400">
                  <X size={14} />
                </button>
              </div>

              {groupError && (
                <div className="mb-2 px-2 py-1.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex items-center gap-1.5">
                  <AlertCircle size={12} /> {groupError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
                  <input
                    type="text"
                    value={groupForm.name}
                    onChange={(e) => setGroupForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Damp Concrete Pack"
                    className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    data-testid="group-name-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                  <input
                    type="text"
                    value={groupForm.description}
                    onChange={(e) => setGroupForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Optional context"
                    className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    data-testid="group-description-input"
                  />
                </div>
              </div>

              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-600">Members ({groupForm.primerLibraryIds.length} selected)</label>
                  <input
                    type="text"
                    value={groupMemberSearch}
                    onChange={(e) => setGroupMemberSearch(e.target.value)}
                    placeholder="Filter primers"
                    className="text-[11px] border border-slate-200 rounded px-2 py-0.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none w-44"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded bg-slate-50 p-1.5 space-y-1">
                  {groupMemberOptions.length === 0 ? (
                    <div className="text-[11px] text-slate-400 italic px-2 py-2">No primers match that filter.</div>
                  ) : groupMemberOptions.map(m => {
                    const checked = groupForm.primerLibraryIds.includes(m.primerId);
                    return (
                      <label
                        key={m.primerId}
                        className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-[11px] ${checked ? 'bg-indigo-50' : 'bg-white hover:bg-slate-100'} border border-slate-200`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleGroupMember(m.primerId)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                          data-testid={`group-member-${m.primerId}`}
                        />
                        <span className="font-mono text-slate-400">{m.primerId}</span>
                        <span className="font-medium text-slate-700 truncate flex-1">{m.productName || m.productId}</span>
                        {m.supplier && <span className="text-slate-400 truncate">{m.supplier}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              {groupForm.primerLibraryIds.length > 0 && (
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Default primer (pinned when this group is applied)
                  </label>
                  <select
                    value={groupForm.defaultPrimerLibraryId}
                    onChange={(e) => setGroupForm(f => ({ ...f, defaultPrimerLibraryId: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    data-testid="group-default-select"
                  >
                    <option value="">No default — applying the group leaves the slot's pin empty</option>
                    {groupForm.primerLibraryIds.map(pid => {
                      const m = entries.find(e => e.primerId === pid);
                      return (
                        <option key={pid} value={pid}>
                          {m?.productName || pid} ({pid})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={closeGroupForm}
                  className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveGroup}
                  disabled={groupSaving}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 inline-flex items-center gap-1.5"
                  data-testid="save-primer-group-button"
                >
                  <Save size={14} /> {groupSaving ? 'Saving…' : (editingGroupId == null ? 'Create group' : 'Save changes')}
                </button>
              </div>
            </div>
          )}
        </div>
      </details>

      {/* Suggested from Product Qualification — surfaces qualified primer
          products that aren't yet in the library, so the user can keep
          the two systems linked with a single click. Hidden when there
          are no candidates, so it doesn't add noise once everything has
          been promoted. */}
      {suggestedFromQual.length > 0 && (
        <div
          className="mb-4 border border-amber-200 bg-amber-50/40 rounded-xl p-3"
          data-testid="primer-qual-suggestions"
        >
          <div className="flex items-center gap-2 mb-2">
            <Check size={14} className="text-amber-700" />
            <h3 className="text-sm font-semibold text-amber-900">
              Suggested from Product Qualification
            </h3>
            <span className="text-[11px] text-amber-700">
              {suggestedFromQual.length} product{suggestedFromQual.length === 1 ? '' : 's'} tagged as primer · not yet in library
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {suggestedFromQual.map(tag => {
              const product = products.find(p => p.id === tag.productId);
              return (
                <div
                  key={tag.id}
                  className="flex items-start justify-between gap-2 px-3 py-2 bg-white border border-amber-200 rounded-lg"
                  data-testid={`primer-suggestion-${tag.productId}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-700 truncate" title={product?.name || tag.productId}>
                      {product?.name || tag.productId}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {product?.supplier || '—'}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(tag.substrateTypes || []).slice(0, 3).map(s => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded-full">{s}</span>
                      ))}
                      {tag.humidityTolerance && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${humidityPillClass(tag.humidityTolerance)}`}>
                          {tag.humidityTolerance}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => openCreateFromTag(tag)}
                    className="shrink-0 px-2 py-1 bg-amber-600 text-white text-[11px] font-medium rounded hover:bg-amber-700 inline-flex items-center gap-1"
                    title="Pre-fill the add form with this product's qualification data"
                    data-testid={`add-suggestion-${tag.productId}`}
                  >
                    <Plus size={11} /> Add to library
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Inline form panel */}
      {formOpen && (
        <div className="mb-4 border border-indigo-200 bg-indigo-50/30 rounded-xl p-4" data-testid="primer-form">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">
              {editingId == null ? 'Add new primer' : 'Edit primer'}
            </h3>
            <button onClick={closeForm} className="p-1 hover:bg-white rounded-lg text-slate-400">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Product picker */}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Product *</label>
              {form.productId ? (
                <div className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200 rounded-lg">
                  <div>
                    <div className="text-sm font-medium text-slate-700">{form.productSearch}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{form.productId}</div>
                  </div>
                  <button
                    onClick={() => setForm(f => ({ ...f, productId: '', productSearch: '' }))}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={form.productSearch}
                    onChange={(e) => setForm(f => ({ ...f, productSearch: e.target.value }))}
                    placeholder="Search products by name, supplier, or code"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    autoFocus
                    data-testid="product-search-input"
                  />
                  {productMatches.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
                      {productMatches.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, productId: p.id, productSearch: p.name || p.id }))}
                          className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 border-b border-slate-100 last:border-0"
                        >
                          <div className="text-sm text-slate-700">{p.name}</div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2">
                            {p.stockCode && <span className="font-mono">{p.stockCode}</span>}
                            {p.supplier && <span>· {p.supplier}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Substrates (multi) */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Compatible substrates *</label>
              <div className="flex flex-wrap gap-1.5">
                {vocab.substrate.map(o => {
                  const active = form.compatibleSubstrates.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setForm(f => ({
                        ...f,
                        compatibleSubstrates: active
                          ? f.compatibleSubstrates.filter(v => v !== o.value)
                          : [...f.compatibleSubstrates, o.value],
                      }))}
                      className={`text-xs px-2 py-1 rounded-full border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-400'}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Humidity (single) */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Humidity tolerance *</label>
              <select
                value={form.humidityTolerance}
                onChange={(e) => setForm(f => ({ ...f, humidityTolerance: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">— Select —</option>
                {vocab.humidity.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Duty (single, optional). Duty mirrors the Product Qualification
                "duty" vocabulary so a primer's rating lines up with the
                duty filter on the adaptive resolve. Left optional because
                some primers are duty-agnostic — the resolve treats null
                dutyRating as "universal" so omitting it is non-destructive. */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Duty</label>
              <select
                value={form.dutyRating}
                onChange={(e) => setForm(f => ({ ...f, dutyRating: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                data-testid="form-duty"
              >
                <option value="">— Any —</option>
                {vocab.duty.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* System types (multi checkbox) */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Compatible system types *</label>
              <div className="flex flex-wrap gap-3">
                {SYSTEM_TYPES.map(t => {
                  const active = form.compatibleSystemTypes.includes(t);
                  return (
                    <label key={t} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => setForm(f => ({
                          ...f,
                          compatibleSystemTypes: active
                            ? f.compatibleSystemTypes.filter(v => v !== t)
                            : [...f.compatibleSystemTypes, t],
                        }))}
                        className="accent-indigo-600"
                      />
                      {t}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Requires 24h cure before overcoat"
                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          {formError && (
            <div className="mt-3 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-1.5">
              <AlertCircle size={12} /> {formError}
            </div>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeForm}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-white rounded-lg"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1.5"
              data-testid="save-primer-button"
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs uppercase text-slate-500">
              <th className="px-3 py-2 font-semibold">Product</th>
              <th className="px-3 py-2 font-semibold">Supplier</th>
              <th className="px-3 py-2 font-semibold">Substrates</th>
              <th className="px-3 py-2 font-semibold">Humidity</th>
              <th className="px-3 py-2 font-semibold">Duty</th>
              <th className="px-3 py-2 font-semibold">System Types</th>
              <th className="px-3 py-2 font-semibold">Notes</th>
              <th className="px-3 py-2 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                {entries.length === 0 ? 'No primers yet — add one to get started.' : 'No primers match your filters.'}
              </td></tr>
            )}
            {filtered.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50/60" data-testid={`primer-row-${e.primerId}`}>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-700">{e.productName || e.productId}</div>
                  <div className="text-[11px] text-slate-400 font-mono">{e.primerId}</div>
                </td>
                <td className="px-3 py-2 text-slate-600">{e.supplier || '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(e.compatibleSubstrates || []).map(s => (
                      <span key={s} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded-full">{s}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {e.humidityTolerance ? (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${humidityPillClass(e.humidityTolerance)}`}>
                      {e.humidityTolerance}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-2">
                  {e.dutyRating ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700">
                      {e.dutyRating}
                    </span>
                  ) : <span className="text-[10px] text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(e.compatibleSystemTypes || []).map(t => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">{t}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500" title={e.notes || ''}>
                  <div className="truncate max-w-[200px]">{e.notes || '—'}</div>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => openEditForm(e)}
                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title="Edit"
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    onClick={() => handleDeactivate(e)}
                    className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded ml-1"
                    title="Deactivate"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PrimerLibrary;
