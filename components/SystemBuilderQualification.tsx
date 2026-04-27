// =============================================================================
// SystemBuilderQualification — Product Qualification tab
// =============================================================================
// New tab inside System Builder for tagging products with qualification
// metadata (substrate / humidity / duty / finish + system-ready flag).
// Powered by the Phase 1 backend endpoints under /api/qualification-*.
//
// Design constraints (per spec):
// - All state is local — no global store changes.
// - No existing API routes are modified. The existing /api/products endpoint
//   does not support a `search` query param, so search/taxonomy filtering is
//   performed client-side after a single fetch.
// - Dropdowns are strictly closed-list (vocabulary values only, no free text).
// - Each row saves independently and shows its own dirty/saved indicator.
// =============================================================================

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ShieldCheck, Search, CheckCircle2, AlertCircle, Loader2,
  Save, X, ChevronDown, ChevronUp, Filter, Info, Sparkles, Wand2,
  RefreshCw, ArrowUpDown,
} from 'lucide-react';
import { Product, TreeNode } from '../types';
import ProductDetailsModal from './ProductDetailsModal';

const API_BASE = '/api';

// Match anything related to PU, Epoxy, Polyurea, or Acrylic — case-insensitive
const SYSTEM_RELEVANT_KEYWORDS = ['pu', 'epoxy', 'polyurea', 'acrylic'];

// ---------- Types ----------
interface VocabItem {
  id: number;
  vocabType: string;
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}
// VocabMap now also tracks the new `layer_position` vocabulary that drives
// the conditional row layout (Fix 2).
type VocabMap = Record<'substrate' | 'humidity' | 'duty' | 'finish' | 'layer_position', VocabItem[]>;

interface QualificationTag {
  id?: number;
  productId: string;
  substrateTypes: string[] | null;
  humidityTolerance: string | null;
  dutyRating: string | null;
  finishType: string | null;
  layerPosition: string | null;
  isSystemReady: boolean;
  qualifiedAt?: string | null;
  qualifiedBy?: string | null;
}

interface RowState {
  // Current (possibly unsaved) values shown in the row
  layerPosition: string; // Drives conditional UI for the rest of the row
  substrateTypes: string[];
  humidityTolerance: string;
  dutyRating: string;
  finishType: string;
  isSystemReady: boolean;
  // Whether a saved tag already exists on the server
  exists: boolean;
  // True when the row has unsaved local edits
  dirty: boolean;
  // Per-row state flags
  saving: boolean;
  savedFlash: boolean;
  error: string | null;
}

type StatusFilter = 'all' | 'ready' | 'unqualified';
// Sort key applied to the main qualification table (Fix 4)
type MainSortKey = 'name' | 'taxonomy' | 'confidence' | 'ready';
// Quick filter pill states for the main table
type MainQuickFilter = 'none' | 'needs_layer' | 'missing_substrate' | 'missing_duty' | 'missing_finish';

// ---------- Auto-Qualification types ----------
type Confidence = 'high' | 'medium' | 'low' | 'none';

interface AutoInferRow {
  product_id: string;
  product_name: string;
  taxonomy_path: string;
  suggested: {
    substrate_types: string[];
    humidity_tolerance: string | null;
    duty_rating: string | null;
    finish_type: string | null;
    layer_position: string | null;
  };
  confidence: { substrate: Confidence; humidity: Confidence; duty: Confidence; finish: Confidence; layer_position: Confidence; overall: Confidence };
  sources: { substrate: string; humidity: string; duty: string; finish: string; layer_position: string };
  already_qualified: boolean;
  // UI-only state — editable values + selection checkbox
  edited: {
    substrate_types: string[];
    humidity_tolerance: string;
    duty_rating: string;
    finish_type: string;
    layer_position: string;
  };
  included: boolean;
}

type ReviewTab = 'high' | 'review' | 'none';
// Sort key applied to the modal table (Fix 3)
type ModalSortKey = 'name' | 'taxonomy' | 'confidence' | 'layer_position';
type SortDir = 'asc' | 'desc';
type ModalSubstrateFilter = 'all' | 'has' | 'none';
type ModalConfidenceFilter = 'all' | 'high' | 'medium' | 'low' | 'none';

// -----------------------------------------------------------------------------
// Layer-Position helpers (Fix 2 conditional UI rules)
// -----------------------------------------------------------------------------
// Per spec, certain layer positions completely change which other fields are
// editable, hidden, or fixed to a single value. Centralising the logic here
// keeps the row markup readable and the modal/table behaviour consistent.

// Finish is hidden completely for primers.
const isFinishHidden = (lp: string): boolean => lp === 'primer';

// Humidity tolerance is irrelevant for layers that don't sit directly on the
// substrate — base coats, intermediate coats and topcoats are applied on top
// of another coat, so they never face the substrate's moisture. Primers and
// standalone coats DO touch the substrate, so humidity stays editable.
const isHumidityHidden = (lp: string): boolean =>
  lp === 'base_coat' || lp === 'intermediate' || lp === 'topcoat';

// Substrate becomes a fixed read-only pill (or 2-option choice for topcoat).
const isSubstrateFixed = (lp: string): boolean =>
  lp === 'base_coat' || lp === 'intermediate' || lp === 'topcoat';

// Default fixed substrate value when no manual override has been set.
const defaultFixedSubstrate = (lp: string): string => {
  if (lp === 'base_coat' || lp === 'intermediate') return 'Over Primer';
  if (lp === 'topcoat') return 'Over Base Coat';
  return '';
};

// For topcoats the user may toggle between "Over Primer" and "Over Base Coat".
// For base_coat / intermediate the value is forced to "Over Primer".
// Returns the substrate array we should persist for a given row.
const computeFixedSubstrate = (lp: string, current: string[]): string[] => {
  if (lp === 'base_coat' || lp === 'intermediate') return ['Over Primer'];
  if (lp === 'topcoat') {
    const cur = current[0];
    if (cur === 'Over Primer' || cur === 'Over Base Coat') return [cur];
    return ['Over Base Coat'];
  }
  return current;
};

// Map an InferenceResult.confidence per-row → row's RowState confidence dot.
const overallToTone = (c: Confidence): { dot: string; label: string; pill: string } => {
  switch (c) {
    case 'high':   return { dot: 'bg-emerald-500', label: 'High',   pill: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    case 'medium': return { dot: 'bg-amber-500',   label: 'Medium', pill: 'bg-amber-100 text-amber-700 border-amber-200' };
    case 'low':    return { dot: 'bg-rose-500',    label: 'Low',    pill: 'bg-rose-100 text-rose-700 border-rose-200' };
    default:       return { dot: 'bg-slate-300',   label: '—',      pill: 'bg-slate-100 text-slate-500 border-slate-200' };
  }
};

// Pretty-format a `source` string ("taxonomy:PW" / "name:steel" / …) into a
// small coloured badge so users can see WHY a value was suggested.
const SourceBadge: React.FC<{ source: string }> = ({ source }) => {
  if (!source) return null;
  const [kind, value] = source.split(':');
  const tone =
    kind === 'taxonomy'    ? 'bg-blue-50 text-blue-700 border-blue-200'   :
    kind === 'name'        ? 'bg-amber-50 text-amber-700 border-amber-200' :
    kind === 'description' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                             'bg-slate-50 text-slate-500 border-slate-200';
  return (
    <span className={`inline-block mt-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wide border rounded ${tone}`} title={source}>
      {kind}{value ? `: ${value.slice(0, 18)}` : ''}
    </span>
  );
};

interface Props {
  products: Product[];
  treeNodes: TreeNode[];
  onProductUpdate?: (p: Product) => void;
  onProductEdit?: (p: Product) => void;
}

// ---------- Helpers ----------
const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem('auth_token');
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
};

const emptyRow = (): RowState => ({
  layerPosition: '',
  substrateTypes: [],
  humidityTolerance: '',
  dutyRating: '',
  finishType: '',
  isSystemReady: false,
  exists: false,
  dirty: false,
  saving: false,
  savedFlash: false,
  error: null,
});

const rowFromTag = (tag: QualificationTag): RowState => ({
  layerPosition: tag.layerPosition ?? '',
  substrateTypes: tag.substrateTypes ?? [],
  humidityTolerance: tag.humidityTolerance ?? '',
  dutyRating: tag.dutyRating ?? '',
  finishType: tag.finishType ?? '',
  isSystemReady: !!tag.isSystemReady,
  exists: true,
  dirty: false,
  saving: false,
  savedFlash: false,
  error: null,
});

const hasAnyTagData = (r: RowState | undefined): boolean =>
  !!r && (
    !!r.layerPosition ||
    r.substrateTypes.length > 0 ||
    !!r.humidityTolerance ||
    !!r.dutyRating ||
    !!r.finishType ||
    r.isSystemReady
  );

// ---------- Multi-select dropdown (closed list) ----------
const MultiSelect: React.FC<{
  options: VocabItem[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}> = ({ options, value, onChange, disabled, placeholder = 'Select…' }) => {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter(x => x !== v));
    else onChange([...value, v]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full min-h-[26px] px-1.5 py-0.5 text-[11px] border border-slate-200 rounded-md bg-white text-left flex items-center justify-between gap-1 hover:border-slate-300 disabled:bg-slate-50 disabled:cursor-not-allowed"
      >
        <span className="truncate text-slate-700">
          {value.length === 0 ? <span className="text-slate-400">{placeholder}</span> : value.join(', ')}
        </span>
        <ChevronDown size={12} className="text-slate-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
          {options.map(opt => (
            <label
              key={opt.id}
              className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={value.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="rounded text-blue-600"
              />
              <span className="text-slate-700">{opt.label}</span>
            </label>
          ))}
          {options.length === 0 && (
            <div className="px-2 py-2 text-xs text-slate-400">No options</div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------- Single-select (closed list) ----------
const SingleSelect: React.FC<{
  options: VocabItem[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}> = ({ options, value, onChange, disabled, placeholder = 'Select…' }) => (
  <select
    value={value}
    disabled={disabled}
    onChange={e => onChange(e.target.value)}
    className="w-full h-[26px] px-1.5 text-[11px] border border-slate-200 rounded-md bg-white hover:border-slate-300 disabled:bg-slate-50 disabled:cursor-not-allowed"
  >
    <option value="">{placeholder}</option>
    {options.map(opt => (
      <option key={opt.id} value={opt.value}>{opt.label}</option>
    ))}
  </select>
);

// ---------- Toggle ----------
const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
      checked ? 'bg-emerald-500' : 'bg-slate-300'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span
      className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transform transition-transform ${
        checked ? 'translate-x-[18px]' : 'translate-x-0.5'
      }`}
    />
  </button>
);

// ---------- Stat card ----------
const StatCard: React.FC<{
  label: string;
  value: number | string;
  tone: 'slate' | 'emerald' | 'amber' | 'rose';
  icon: React.ReactNode;
}> = ({ label, value, tone, icon }) => {
  const tones = {
    slate: 'border-slate-200 text-slate-700',
    emerald: 'border-emerald-200 text-emerald-700 bg-emerald-50/40',
    amber: 'border-amber-200 text-amber-700 bg-amber-50/40',
    rose: 'border-rose-200 text-rose-700 bg-rose-50/40',
  };
  return (
    <div className={`flex-1 p-4 bg-white border rounded-lg ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs uppercase tracking-wide font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
};

// =============================================================================
// Resizable column helpers — used by both the modal and main qualification
// tables. Widths are persisted per-table in localStorage so the user's layout
// survives reloads. Drag handles live in the right edge of every header cell.
// =============================================================================

type ColWidths = Record<string, number>;

function useColumnWidths(storageKey: string, defaults: ColWidths) {
  const [widths, setWidths] = useState<ColWidths>(() => {
    if (typeof window === 'undefined') return defaults;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return { ...defaults, ...parsed };
      }
    } catch { /* ignore corrupt storage */ }
    return defaults;
  });
  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(widths)); } catch { /* quota — ignore */ }
  }, [storageKey, widths]);
  const reset = useCallback(() => setWidths(defaults), [defaults, storageKey]);
  return { widths, setWidths, reset };
}

// A small drag handle to drop into the right edge of any <th>. The parent
// <th> must have `position: relative` and a numeric `width`/`minWidth` set.
const ResizeHandle: React.FC<{
  colKey: string;
  currentWidth: number;
  setWidths: React.Dispatch<React.SetStateAction<ColWidths>>;
  minWidth?: number;
}> = ({ colKey, currentWidth, setWidths, minWidth = 60 }) => {
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // don't trigger sort handlers on the parent <th>
    const startX = e.clientX;
    const startW = currentWidth;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(minWidth, startW + (ev.clientX - startX));
      setWidths(prev => ({ ...prev, [colKey]: next }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [colKey, currentWidth, minWidth, setWidths]);
  return (
    <span
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-blue-400/50 active:bg-blue-500/70 transition-colors z-10"
      title="Drag to resize column"
    />
  );
};

// =============================================================================
// ReviewModal — Auto-Qualification Review modal (Fix 3)
// =============================================================================
// Extracted to its own component so the local filter / sort / quick-pill state
// stays self-contained and doesn't pollute the main table's namespace.
// All filtering, sorting and selection happens client-side over the rows the
// engine already returned — no extra API calls.
// =============================================================================

interface ReviewModalProps {
  state: { rows: AutoInferRow[]; tab: ReviewTab };
  setState: React.Dispatch<React.SetStateAction<{ rows: AutoInferRow[]; tab: ReviewTab } | null>>;
  vocab: VocabMap | null;
  systemRelevantNodes: Array<{ node: TreeNode; path: string; count: number }>;
  batchSaving: boolean;
  saveBatch: (rowsToSave: AutoInferRow[], markReady: boolean) => Promise<void>;
}

const ReviewModal: React.FC<ReviewModalProps> = ({ state, setState, vocab, systemRelevantNodes, batchSaving, saveBatch }) => {
  const all = state.rows;
  const skipped = all.filter(r => r.already_qualified);
  const eligible = all.filter(r => !r.already_qualified);
  const high = eligible.filter(r => r.confidence.overall === 'high');
  const review = eligible.filter(r => r.confidence.overall === 'medium' || r.confidence.overall === 'low');
  const none = eligible.filter(r => r.confidence.overall === 'none');
  const tabs: Array<{ key: ReviewTab; label: string; rows: AutoInferRow[] }> = [
    { key: 'high',   label: `High confidence (${high.length})`, rows: high },
    { key: 'review', label: `Needs review (${review.length})`, rows: review },
    { key: 'none',   label: `Could not infer (${none.length})`, rows: none },
  ];
  const tabRows = tabs.find(t => t.key === state.tab)!.rows;

  // ---- Local Fix 3 state ----
  const [searchTerm, setSearchTerm] = useState('');
  const [taxonomyFilter, setTaxonomyFilter] = useState(''); // matches tax path substring
  const [substrateFilter, setSubstrateFilter] = useState<ModalSubstrateFilter>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<ModalConfidenceFilter>('all');
  const [layerFilter, setLayerFilter] = useState<string>(''); // '' = all
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [highOnly, setHighOnly] = useState(false);
  const [needsLayerOnly, setNeedsLayerOnly] = useState(false);
  const [sortKey, setSortKey] = useState<ModalSortKey>('confidence');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Resizable column widths for the modal table — persisted per-table.
  const { widths: colW, setWidths: setColW } = useColumnWidths(
    'qualification.modal.colWidths.v1',
    { product: 220, taxonomy: 200, layer: 120, substrate: 150, humidity: 110, duty: 110, finish: 110, conf: 70 },
  );

  // Reset selection-only filters when switching tabs so users always see rows.
  useEffect(() => {
    // Switching tabs shouldn't necessarily clear filters — keep them sticky.
  }, [state.tab]);

  const updateModalRow = (productId: string, patch: Partial<AutoInferRow['edited']> & { included?: boolean }) => {
    setState(prev => prev ? {
      ...prev,
      rows: prev.rows.map(r => {
        if (r.product_id !== productId) return r;
        const nextEdited = { ...r.edited };
        if ('substrate_types' in patch)    nextEdited.substrate_types    = patch.substrate_types!;
        if ('humidity_tolerance' in patch) nextEdited.humidity_tolerance = patch.humidity_tolerance!;
        if ('duty_rating' in patch)        nextEdited.duty_rating        = patch.duty_rating!;
        if ('finish_type' in patch)        nextEdited.finish_type        = patch.finish_type!;
        if ('layer_position' in patch) {
          nextEdited.layer_position = patch.layer_position!;
          // Apply Fix 2 conditional reshape locally so the modal preview stays consistent.
          const lp = nextEdited.layer_position;
          if (isSubstrateFixed(lp)) nextEdited.substrate_types = computeFixedSubstrate(lp, nextEdited.substrate_types);
          else if (lp === 'primer' || lp === 'standalone')
            nextEdited.substrate_types = nextEdited.substrate_types.filter(s => s !== 'Over Primer' && s !== 'Over Base Coat');
          if (isFinishHidden(lp)) nextEdited.finish_type = '';
          if (isHumidityHidden(lp)) nextEdited.humidity_tolerance = '';
        }
        return { ...r, edited: nextEdited, included: patch.included ?? r.included };
      }),
    } : prev);
  };

  // Apply filter bar + quick filters to the current tab's rows.
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return tabRows.filter(r => {
      if (term && !r.product_name.toLowerCase().includes(term)) return false;
      if (taxonomyFilter && !r.taxonomy_path.toLowerCase().includes(taxonomyFilter.toLowerCase())) return false;
      if (substrateFilter === 'has' && r.edited.substrate_types.length === 0) return false;
      if (substrateFilter === 'none' && r.edited.substrate_types.length > 0) return false;
      if (confidenceFilter !== 'all' && r.confidence.overall !== confidenceFilter) return false;
      if (layerFilter && (r.edited.layer_position || '') !== layerFilter) return false;
      if (highOnly && r.confidence.overall !== 'high') return false;
      if (needsLayerOnly && !!r.edited.layer_position) return false;
      if (unresolvedOnly) {
        const lp = r.edited.layer_position;
        const finishOk = isFinishHidden(lp) || !!r.edited.finish_type;
        const humidityOk = isHumidityHidden(lp) || !!r.edited.humidity_tolerance;
        const subOk = r.edited.substrate_types.length > 0;
        const allFilled = subOk && humidityOk && !!r.edited.duty_rating && finishOk && !!lp;
        if (allFilled) return false;
      }
      return true;
    });
  }, [tabRows, searchTerm, taxonomyFilter, substrateFilter, confidenceFilter, layerFilter, highOnly, needsLayerOnly, unresolvedOnly]);

  // Sort the filtered list by the user's chosen key.
  const visible = useMemo(() => {
    const confRank: Record<string, number> = { high: 4, medium: 3, low: 2, none: 1 };
    const arr = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':           cmp = a.product_name.localeCompare(b.product_name); break;
        case 'taxonomy':       cmp = (a.taxonomy_path || '').localeCompare(b.taxonomy_path || ''); break;
        case 'confidence':     cmp = (confRank[a.confidence.overall] || 0) - (confRank[b.confidence.overall] || 0); break;
        case 'layer_position': cmp = (a.edited.layer_position || '~').localeCompare(b.edited.layer_position || '~'); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Bulk select-all for the currently visible (filtered) rows only.
  const allVisibleIncluded = visible.length > 0 && visible.every(r => r.included);
  const visibleSelectedCount = visible.filter(r => r.included).length;
  const filtersActive = !!(searchTerm || taxonomyFilter || substrateFilter !== 'all' || confidenceFilter !== 'all' || layerFilter || highOnly || needsLayerOnly || unresolvedOnly);

  const clearAllFilters = () => {
    setSearchTerm('');
    setTaxonomyFilter('');
    setSubstrateFilter('all');
    setConfidenceFilter('all');
    setLayerFilter('');
    setHighOnly(false);
    setNeedsLayerOnly(false);
    setUnresolvedOnly(false);
  };

  const toggleSort = (k: ModalSortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };
  const sortIndicator = (k: ModalSortKey) => sortKey !== k ? '' : (sortDir === 'asc' ? ' ↑' : ' ↓');

  const includedCount = all.filter(r => r.included && !r.already_qualified).length;
  const includedHighCount = high.filter(r => r.included).length;

  return (
    <div className="absolute inset-0 z-50 bg-slate-900/50 flex items-start justify-center overflow-y-auto"
         style={{ minHeight: '100vh' }}>
      <div className="bg-white rounded-lg shadow-2xl my-8 mx-4 w-[min(1100px,95vw)] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200">
          <Sparkles size={18} className="text-indigo-600" />
          <div className="flex-1">
            <div className="text-base font-semibold text-slate-800">Auto-Qualification Review</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {all.length} analysed · {high.length} high confidence · {review.length + none.length} need review · {skipped.length} already qualified (skipped)
            </div>
          </div>
          <button onClick={() => setState(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-5">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setState(prev => prev ? { ...prev, tab: t.key } : prev)}
              className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${
                state.tab === t.key
                  ? 'border-indigo-600 text-indigo-700 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Fix 3: Filter bar + quick filter buttons */}
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/60 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search product…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <select
              value={taxonomyFilter}
              onChange={e => setTaxonomyFilter(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
              title="Taxonomy path filter"
            >
              <option value="">All taxonomies</option>
              {systemRelevantNodes.map(({ node, path, count }) => (
                <option key={node.id} value={path}>{path} ({count})</option>
              ))}
            </select>
            <select
              value={substrateFilter}
              onChange={e => setSubstrateFilter(e.target.value as ModalSubstrateFilter)}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
            >
              <option value="all">Substrate: all</option>
              <option value="has">Has substrate</option>
              <option value="none">No substrate</option>
            </select>
            <select
              value={confidenceFilter}
              onChange={e => setConfidenceFilter(e.target.value as ModalConfidenceFilter)}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
            >
              <option value="all">Confidence: all</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="none">None</option>
            </select>
            <select
              value={layerFilter}
              onChange={e => setLayerFilter(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
              title="Layer Position filter"
            >
              <option value="">Layer: all</option>
              {(vocab?.layer_position || []).map(o => (
                <option key={o.id} value={o.value}>{o.label}</option>
              ))}
            </select>
            {filtersActive && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 underline"
              >
                Clear all filters
              </button>
            )}
          </div>

          {/* Quick filter buttons (left) + visibility / selection counter (right) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Quick:</span>
            {([
              { key: 'unresolved', label: 'Unresolved only', value: unresolvedOnly, set: setUnresolvedOnly },
              { key: 'highonly',   label: 'High confidence only', value: highOnly, set: setHighOnly },
              { key: 'needslayer', label: 'Needs layer position', value: needsLayerOnly, set: setNeedsLayerOnly },
            ] as const).map(b => (
              <button
                key={b.key}
                type="button"
                onClick={() => b.set(!b.value)}
                className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                  b.value
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {b.label}
              </button>
            ))}
            <div className="ml-auto text-[11px] text-slate-500">
              <span className="font-medium text-slate-700">{visibleSelectedCount} of {visible.length} visible selected</span>
              {filtersActive && (
                <span className="ml-2 text-indigo-600">
                  · Showing {visible.length} of {tabRows.length} {state.tab === 'high' ? 'high-confidence' : state.tab === 'review' ? 'review' : 'no-inference'} products · filters active
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Body — table */}
        <div className="flex-1 overflow-auto">
          {visible.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              {filtersActive ? 'No products match the active filters.' : 'No products in this group.'}
            </div>
          ) : (
            <table className="text-xs" style={{ tableLayout: 'fixed', width: 28 + colW.product + colW.taxonomy + colW.layer + colW.substrate + colW.humidity + colW.duty + colW.finish + colW.conf }}>
              <colgroup>
                <col style={{ width: 28 }} />
                <col style={{ width: colW.product }} />
                <col style={{ width: colW.taxonomy }} />
                <col style={{ width: colW.layer }} />
                <col style={{ width: colW.substrate }} />
                <col style={{ width: colW.humidity }} />
                <col style={{ width: colW.duty }} />
                <col style={{ width: colW.finish }} />
                <col style={{ width: colW.conf }} />
              </colgroup>
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left">
                    <input
                      type="checkbox"
                      checked={allVisibleIncluded}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setState(prev => prev ? {
                          ...prev,
                          rows: prev.rows.map(r => visible.some(v => v.product_id === r.product_id) ? { ...r, included: checked } : r),
                        } : prev);
                      }}
                      title="Select only the currently visible (filtered) rows"
                    />
                  </th>
                  <th className="relative px-2 py-1.5 text-left cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('name')}>
                    Product{sortIndicator('name')}
                    <ResizeHandle colKey="product" currentWidth={colW.product} setWidths={setColW} />
                  </th>
                  <th className="relative px-2 py-1.5 text-left cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('taxonomy')}>
                    Taxonomy{sortIndicator('taxonomy')}
                    <ResizeHandle colKey="taxonomy" currentWidth={colW.taxonomy} setWidths={setColW} />
                  </th>
                  {/* Fix 2: Layer Position is the FIRST data column in the modal too */}
                  <th className="relative px-2 py-1.5 text-left cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('layer_position')}>
                    Layer{sortIndicator('layer_position')}
                    <ResizeHandle colKey="layer" currentWidth={colW.layer} setWidths={setColW} />
                  </th>
                  <th className="relative px-2 py-1.5 text-left">
                    Substrate
                    <ResizeHandle colKey="substrate" currentWidth={colW.substrate} setWidths={setColW} />
                  </th>
                  <th className="relative px-2 py-1.5 text-left">
                    Humidity
                    <ResizeHandle colKey="humidity" currentWidth={colW.humidity} setWidths={setColW} />
                  </th>
                  <th className="relative px-2 py-1.5 text-left">
                    Duty
                    <ResizeHandle colKey="duty" currentWidth={colW.duty} setWidths={setColW} />
                  </th>
                  <th className="relative px-2 py-1.5 text-left">
                    Finish
                    <ResizeHandle colKey="finish" currentWidth={colW.finish} setWidths={setColW} />
                  </th>
                  <th className="relative px-2 py-1.5 text-center cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('confidence')}>
                    Conf.{sortIndicator('confidence')}
                    <ResizeHandle colKey="conf" currentWidth={colW.conf} setWidths={setColW} minWidth={50} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => {
                  const overall = overallToTone(r.confidence.overall);
                  const lp = r.edited.layer_position;
                  return (
                    <tr key={r.product_id} className="border-b border-slate-100 align-top">
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={r.included}
                          onChange={(e) => updateModalRow(r.product_id, { included: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium text-slate-700 text-[11px]">{r.product_name}</div>
                        <div className="text-[10px] text-slate-400">{r.product_id}</div>
                      </td>
                      <td className="px-2 py-1.5 text-[11px] text-slate-500 max-w-[200px]">
                        <div className="whitespace-normal break-words leading-tight">{r.taxonomy_path || '—'}</div>
                      </td>
                      {/* Layer Position editor */}
                      <td className="px-2 py-1.5">
                        <select
                          value={lp}
                          onChange={e => updateModalRow(r.product_id, { layer_position: e.target.value })}
                          className="w-full h-[26px] px-1.5 text-[11px] border border-slate-200 rounded-md bg-white"
                        >
                          <option value="">—</option>
                          {(vocab?.layer_position || []).map(o => (
                            <option key={o.id} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <SourceBadge source={r.sources.layer_position} />
                      </td>
                      {/* Substrate — conditional per Fix 2 */}
                      <td className="px-2 py-1.5">
                        {(lp === 'base_coat' || lp === 'intermediate') ? (
                          <span className="inline-block px-1.5 py-0.5 text-[10px] rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-medium">
                            Over Primer
                          </span>
                        ) : lp === 'topcoat' ? (
                          <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[10px]">
                            {(['Over Base Coat', 'Over Primer'] as const).map(opt => {
                              const cur = r.edited.substrate_types[0] === 'Over Primer' ? 'Over Primer' : 'Over Base Coat';
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => updateModalRow(r.product_id, { substrate_types: [opt] })}
                                  className={`px-1.5 py-0.5 ${cur === opt ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                                  title={opt}
                                >{opt === 'Over Base Coat' ? 'Base' : 'Primer'}</button>
                              );
                            })}
                          </div>
                        ) : (
                          <MultiSelect
                            options={vocab?.substrate.filter(o => o.value !== 'Over Primer' && o.value !== 'Over Base Coat') || []}
                            value={r.edited.substrate_types}
                            onChange={v => updateModalRow(r.product_id, { substrate_types: v })}
                          />
                        )}
                        <SourceBadge source={r.sources.substrate} />
                      </td>
                      <td className="px-2 py-1.5">
                        {isHumidityHidden(lp) ? (
                          <span
                            className="inline-block px-1.5 py-0.5 text-[10px] text-slate-400 italic"
                            title="Humidity tolerance only applies to layers that touch the substrate (primer / standalone)"
                          >N/A</span>
                        ) : (
                          <>
                            <SingleSelect
                              options={vocab?.humidity || []}
                              value={r.edited.humidity_tolerance}
                              onChange={v => updateModalRow(r.product_id, { humidity_tolerance: v })}
                            />
                            <SourceBadge source={r.sources.humidity} />
                          </>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <SingleSelect
                          options={vocab?.duty || []}
                          value={r.edited.duty_rating}
                          onChange={v => updateModalRow(r.product_id, { duty_rating: v })}
                        />
                        <SourceBadge source={r.sources.duty} />
                      </td>
                      <td className="px-2 py-1.5">
                        {isFinishHidden(lp) ? (
                          <span className="inline-block px-1.5 py-0.5 text-[10px] text-slate-400 italic">N/A</span>
                        ) : (
                          <div className={lp === 'topcoat' && !r.edited.finish_type ? 'ring-1 ring-amber-300 rounded-md' : ''}>
                            <SingleSelect
                              options={vocab?.finish || []}
                              value={r.edited.finish_type}
                              onChange={v => updateModalRow(r.product_id, { finish_type: v })}
                              placeholder={lp === 'topcoat' ? 'Required…' : '—'}
                            />
                          </div>
                        )}
                        <SourceBadge source={r.sources.finish} />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium border rounded-full ${overall.pill}`}>
                          {overall.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <div className="text-xs text-slate-500">
            Save High confidence will mark {includedHighCount} products as System-Ready.
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setState(null)}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={() => saveBatch(high.filter(r => r.included), true)}
              disabled={batchSaving || includedHighCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
            >
              {batchSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Save high confidence ({includedHighCount})
            </button>
            <button
              onClick={() => saveBatch(all.filter(r => r.included && !r.already_qualified), false)}
              disabled={batchSaving || includedCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {batchSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save selected ({includedCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Main component ----------
const SystemBuilderQualification: React.FC<Props> = ({ products, treeNodes, onProductUpdate, onProductEdit }) => {
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [vocab, setVocab] = useState<VocabMap | null>(null);
  // Map of productId -> RowState. Includes both fetched and locally-edited rows.
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [loadingTags, setLoadingTags] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Live taxonomy nodes — initialised from prop but refetched on mount and on
  // visibilitychange so the dropdown never goes stale (Fix 1).
  const [liveTreeNodes, setLiveTreeNodes] = useState<TreeNode[]>(treeNodes);
  const [refreshingNodes, setRefreshingNodes] = useState(false);
  const [taxonomyJustRefreshed, setTaxonomyJustRefreshed] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [nodeFilter, setNodeFilter] = useState<string>(''); // '' = all
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // Fix 4: extra filters / sort / quick pills for the main table
  const [layerFilter, setLayerFilter] = useState<string>(''); // '' = all
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | Confidence>('all');
  const [mainSortKey, setMainSortKey] = useState<MainSortKey>('name');
  const [mainSortDir, setMainSortDir] = useState<SortDir>('asc');
  const [mainQuickFilter, setMainQuickFilter] = useState<MainQuickFilter>('none');

  // Resizable column widths for the main qualification table — persisted.
  const { widths: mainColW, setWidths: setMainColW } = useColumnWidths(
    'qualification.main.colWidths.v1',
    {
      product:   200,
      taxonomy:  200,
      layer:     120,
      substrate: 140,
      humidity:  110,
      duty:      110,
      finish:    110,
      conf:      70,
      ready:     55,
      actions:   120,
    },
  );

  // Selected product IDs (for bulk actions)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // -------- Auto-Qualification Engine state --------
  const [autoInferring, setAutoInferring] = useState(false);
  const [autoInferError, setAutoInferError] = useState<string | null>(null);
  const [reviewModal, setReviewModal] = useState<{ rows: AutoInferRow[]; tab: ReviewTab } | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  // Per-row inference confidence captured when an Auto-fill is applied — used
  // to colour the table's "Confidence" column. Persists in component state
  // until the row is saved or the page reloads.
  const [rowConfidence, setRowConfidence] = useState<Record<string, Confidence>>({});
  // New-product toast (driven by `pending_qualification_suggestion` storage key)
  const [newProductToast, setNewProductToast] = useState<{ productId: string; productName: string } | null>(null);

  // -------------------------------------------------------------------------
  // Initial load: vocabulary + all product tags (in parallel batches).
  // We fetch every product's tag once on mount so the summary stats and the
  // table are accurate. Individual product fetches use the existing
  // GET /api/qualification-tags/:productId endpoint.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingTags(true);
        setLoadError(null);

        const vocabRes = await fetch(`${API_BASE}/qualification-vocabularies`, {
          headers: authHeaders(),
        });
        if (!vocabRes.ok) throw new Error('Failed to load vocabularies');
        const vocabData: VocabMap = await vocabRes.json();
        if (cancelled) return;
        setVocab({
          substrate: vocabData.substrate || [],
          humidity: vocabData.humidity || [],
          duty: vocabData.duty || [],
          finish: vocabData.finish || [],
          // layer_position is the new vocab driving Fix 2 conditional UI.
          layer_position: (vocabData as any).layer_position || [],
        });

        // Load tags in batches of 20 to avoid spamming the server with
        // hundreds of parallel requests for large inventories.
        const batchSize = 20;
        const next: Record<string, RowState> = {};
        for (let i = 0; i < products.length; i += batchSize) {
          if (cancelled) return;
          const slice = products.slice(i, i + batchSize);
          const results = await Promise.all(
            slice.map(p =>
              fetch(`${API_BASE}/qualification-tags/${encodeURIComponent(p.id)}`, {
                headers: authHeaders(),
              })
                .then(r => (r.ok ? r.json() : null))
                .catch(() => null)
            )
          );
          slice.forEach((p, idx) => {
            const tag = results[idx] as QualificationTag | null;
            next[p.id] = tag ? rowFromTag(tag) : emptyRow();
          });
        }
        if (cancelled) return;
        setRows(next);
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load qualification data');
      } finally {
        if (!cancelled) setLoadingTags(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  // -------------------------------------------------------------------------
  // Fix 1 — Live taxonomy refresh
  // -------------------------------------------------------------------------
  // Refetch GET /api/tree-nodes on demand. Triggered on mount, on
  // visibilitychange (tab focus), and via a manual refresh button so the
  // dropdown never shows stale data after the taxonomy is edited elsewhere.
  const refetchTreeNodes = useCallback(async (silent = false) => {
    if (!silent) setRefreshingNodes(true);
    try {
      const res = await fetch(`${API_BASE}/tree-nodes`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Tree nodes fetch failed (${res.status})`);
      // Backend returns DB rows: { id (serial), nodeId (string), parentId, name, ... }
      // Frontend TreeNode expects `id` to be the business `nodeId` string (matches
      // App.tsx). Without this mapping, dropdown filters and full-path lookup
      // mismatch product.nodeId references and break taxonomy resolution.
      const raw: any[] = await res.json();
      const fresh: TreeNode[] = (Array.isArray(raw) ? raw : []).map((n: any) => ({
        id: n.nodeId,
        name: n.name,
        type: n.type as any,
        parentId: n.parentId,
        description: n.description || undefined,
        metadata: n.metadata as any,
        branchCode: n.branchCode || undefined,
      }));
      setLiveTreeNodes(fresh);
      if (!silent) {
        setTaxonomyJustRefreshed(true);
        setTimeout(() => setTaxonomyJustRefreshed(false), 1200);
      }
    } catch (err) {
      // Non-fatal — keep the existing taxonomy in state.
      console.warn('Could not refresh taxonomy nodes:', err);
    } finally {
      if (!silent) setRefreshingNodes(false);
    }
  }, []);

  useEffect(() => {
    // Mount-time refresh (component remounts when the tab becomes active in
    // SystemBuilder), plus visibilitychange covers when the user toggles back
    // to this browser tab.
    refetchTreeNodes(true);
    const onVis = () => { if (!document.hidden) refetchTreeNodes(true); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refetchTreeNodes]);

  // Keep liveTreeNodes in sync if the parent's prop changes (e.g. user just
  // edited the tree in another tab and we get fresh props).
  useEffect(() => {
    setLiveTreeNodes(treeNodes);
  }, [treeNodes]);

  // Build a quick lookup of nodeId -> path string for display
  const nodePath = useMemo(() => {
    const byId = new Map<string, TreeNode>(liveTreeNodes.map(n => [n.id, n] as const));
    const cache = new Map<string, string>();
    const compute = (id: string | undefined): string => {
      if (!id) return '—';
      if (cache.has(id)) return cache.get(id)!;
      const parts: string[] = [];
      let cur = byId.get(id);
      const seen = new Set<string>();
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        parts.unshift(cur.name);
        cur = (cur as any).parentId ? byId.get((cur as any).parentId) : undefined;
      }
      const out = parts.join(' › ') || '—';
      cache.set(id, out);
      return out;
    };
    return compute;
  }, [liveTreeNodes]);

  // Per-node product count, derived from the products list.
  const productCountByNode = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      if (!p.nodeId) continue;
      m.set(p.nodeId, (m.get(p.nodeId) || 0) + 1);
    }
    return m;
  }, [products]);

  // -------------------------------------------------------------------------
  // Derived: taxonomy nodes for the dropdown.
  // Sorted alphabetically by their FULL path (Fix 1) so users can scan the
  // dropdown in a stable, hierarchical order. We include every node that
  // either (a) directly holds at least one product, OR (b) matches one of
  // the system-relevant chemistry keywords. This ensures the dropdown
  // always reflects the user's real taxonomy and never appears empty just
  // because their categories aren't named after chemistry families.
  // -------------------------------------------------------------------------
  const systemRelevantNodes = useMemo(() => {
    return liveTreeNodes
      .filter(n => {
        const lower = n.name.toLowerCase();
        const matchesKeyword = SYSTEM_RELEVANT_KEYWORDS.some(k => lower.includes(k));
        const hasProducts = (productCountByNode.get(n.id) || 0) > 0;
        return matchesKeyword || hasProducts;
      })
      .map(n => ({ node: n, path: nodePath(n.id), count: productCountByNode.get(n.id) || 0 }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [liveTreeNodes, nodePath, productCountByNode]);

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------
  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const base = products.filter(p => {
      if (term) {
        const matches =
          p.name.toLowerCase().includes(term) ||
          p.id.toLowerCase().includes(term);
        if (!matches) return false;
      }
      if (nodeFilter && p.nodeId !== nodeFilter) return false;
      const r = rows[p.id];
      if (statusFilter !== 'all') {
        if (statusFilter === 'ready' && !(r && r.isSystemReady)) return false;
        if (statusFilter === 'unqualified' && hasAnyTagData(r)) return false;
      }
      // Fix 4: Layer-position filter
      if (layerFilter && (r?.layerPosition || '') !== layerFilter) return false;
      // Fix 4: Confidence filter (uses captured rowConfidence, fallback 'manual'→'none')
      if (confidenceFilter !== 'all') {
        const c = rowConfidence[p.id];
        if (!c || c !== confidenceFilter) return false;
      }
      // Fix 4: Quick filter pills
      if (mainQuickFilter !== 'none') {
        if (mainQuickFilter === 'needs_layer' && !!r?.layerPosition) return false;
        if (mainQuickFilter === 'missing_substrate' && (r?.substrateTypes.length ?? 0) > 0) return false;
        if (mainQuickFilter === 'missing_duty' && !!r?.dutyRating) return false;
        if (mainQuickFilter === 'missing_finish') {
          // For primers Finish is hidden — never count those rows as "missing finish"
          if (r && isFinishHidden(r.layerPosition)) return false;
          if (!!r?.finishType) return false;
        }
      }
      return true;
    });

    // Fix 4 — sort the filtered result. Confidence ranks high→low so a
    // descending sort places "high" first; "manual" / no-inference is treated
    // as the lowest rank so it sinks to the bottom.
    const confRank: Record<string, number> = { high: 4, medium: 3, low: 2, none: 1 };
    const score = (id: string) => confRank[rowConfidence[id] || ''] || 0;
    const sorted = [...base].sort((a, b) => {
      let cmp = 0;
      switch (mainSortKey) {
        case 'name':       cmp = a.name.localeCompare(b.name); break;
        case 'taxonomy':   cmp = nodePath(a.nodeId).localeCompare(nodePath(b.nodeId)); break;
        case 'confidence': cmp = score(b.id) - score(a.id); break;
        case 'ready': {
          const ar = rows[a.id]?.isSystemReady ? 1 : 0;
          const br = rows[b.id]?.isSystemReady ? 1 : 0;
          cmp = br - ar;
          break;
        }
      }
      return mainSortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [products, searchTerm, nodeFilter, statusFilter, layerFilter, confidenceFilter, mainQuickFilter, rows, rowConfidence, nodePath, mainSortKey, mainSortDir]);

  // True whenever any main-table filter narrows the visible set. Drives the
  // smart Auto-qualify button — when filters are active the primary action
  // targets the visible subset instead of all products.
  const mainFiltersActive =
    !!searchTerm ||
    !!nodeFilter ||
    statusFilter !== 'all' ||
    !!layerFilter ||
    confidenceFilter !== 'all' ||
    mainQuickFilter !== 'none';

  // -------------------------------------------------------------------------
  // Summary stats — global (across ALL products, not just filtered).
  // -------------------------------------------------------------------------
  const stats = useMemo(() => {
    let ready = 0, incomplete = 0, unqualified = 0;
    for (const p of products) {
      const r = rows[p.id];
      if (!r || !hasAnyTagData(r)) unqualified++;
      else if (r.isSystemReady) ready++;
      else incomplete++;
    }
    return { total: products.length, ready, incomplete, unqualified };
  }, [products, rows]);

  // -------------------------------------------------------------------------
  // Fix 4 — Quick-pill counts (across ALL products so the badge stays stable
  // regardless of the active text/dropdown filters).
  // -------------------------------------------------------------------------
  const quickCounts = useMemo(() => {
    let needsLayer = 0, missingSub = 0, missingDuty = 0, missingFinish = 0;
    for (const p of products) {
      const r = rows[p.id];
      if (!r?.layerPosition) needsLayer++;
      if (!r || r.substrateTypes.length === 0) missingSub++;
      if (!r?.dutyRating) missingDuty++;
      if (!(r && isFinishHidden(r.layerPosition)) && !r?.finishType) missingFinish++;
    }
    return { needsLayer, missingSub, missingDuty, missingFinish };
  }, [products, rows]);

  // -------------------------------------------------------------------------
  // Row mutations
  // -------------------------------------------------------------------------
  const updateRow = (productId: string, patch: Partial<RowState>) => {
    setRows(prev => {
      const cur = prev[productId] || emptyRow();
      const next: RowState = { ...cur, ...patch, dirty: true, savedFlash: false, error: null };

      // Fix 2: when Layer Position changes, immediately reshape derived
      // fields so the row is internally consistent (and so the user never
      // has a chance to save a Finish on a Primer, etc.).
      if ('layerPosition' in patch && patch.layerPosition !== cur.layerPosition) {
        const lp = next.layerPosition;
        if (isSubstrateFixed(lp)) {
          next.substrateTypes = computeFixedSubstrate(lp, cur.substrateTypes);
        } else if (lp === 'primer' || lp === 'standalone') {
          // Switching FROM a fixed-substrate layer back to a structural layer:
          // drop any "Over Primer" / "Over Base Coat" leftover that no longer
          // belongs to a structural substrate vocabulary.
          next.substrateTypes = cur.substrateTypes.filter(s => s !== 'Over Primer' && s !== 'Over Base Coat');
        }
        if (isFinishHidden(lp)) {
          next.finishType = '';
        }
        if (isHumidityHidden(lp)) {
          next.humidityTolerance = '';
        }
      }
      return { ...prev, [productId]: next };
    });
  };

  const saveRow = async (productId: string): Promise<boolean> => {
    const r = rows[productId];
    if (!r) return false;
    setRows(prev => ({ ...prev, [productId]: { ...prev[productId], saving: true, error: null } }));
    try {
      // Apply Fix 2 conditional rules at save-time too: when a layer position
      // forces a fixed substrate or hides Finish, ensure we never persist a
      // stale value that the UI was hiding from the user.
      const lp = r.layerPosition;
      const substratePersist = isSubstrateFixed(lp)
        ? computeFixedSubstrate(lp, r.substrateTypes)
        : (r.substrateTypes.length > 0 ? r.substrateTypes : null);
      const finishPersist = isFinishHidden(lp) ? null : (r.finishType || null);
      const humidityPersist = isHumidityHidden(lp) ? null : (r.humidityTolerance || null);

      const body = {
        productId,
        layerPosition: lp || null,
        substrateTypes: substratePersist,
        humidityTolerance: humidityPersist,
        dutyRating: r.dutyRating || null,
        finishType: finishPersist,
        isSystemReady: r.isSystemReady,
      };
      // POST upserts — works for both new and existing tags.
      const res = await fetch(`${API_BASE}/qualification-tags`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const saved: QualificationTag = await res.json();

      setRows(prev => ({
        ...prev,
        [productId]: { ...rowFromTag(saved), savedFlash: true },
      }));
      // Clear the flash after 1.5 s
      setTimeout(() => {
        setRows(prev => prev[productId]
          ? { ...prev, [productId]: { ...prev[productId], savedFlash: false } }
          : prev);
      }, 1500);
      return true;
    } catch (err) {
      console.error(err);
      setRows(prev => ({
        ...prev,
        [productId]: {
          ...prev[productId],
          saving: false,
          error: err instanceof Error ? err.message : 'Save failed',
        },
      }));
      return false;
    }
  };

  // -------------------------------------------------------------------------
  // Selection / bulk actions
  // -------------------------------------------------------------------------
  const toggleSelect = (productId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredProducts.map(p => p.id);
    const allSelected = visibleIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach(id => next.delete(id));
      else visibleIds.forEach(id => next.add(id));
      return next;
    });
  };

  const selectedCount = selected.size;
  const selectedReadyCount = useMemo(() => {
    let count = 0;
    selected.forEach(id => {
      if (rows[id]?.isSystemReady) count++;
    });
    return count;
  }, [selected, rows]);

  const handleBulkSave = async () => {
    if (selected.size === 0 || bulkSaving) return;
    setBulkSaving(true);
    const ids: string[] = Array.from(selected);
    // Save sequentially in small batches to avoid overwhelming the API.
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      await saveRow(id);
    }
    setBulkSaving(false);
  };

  // -------------------------------------------------------------------------
  // Auto-Qualification Engine — bulk inference handlers
  // -------------------------------------------------------------------------
  const buildEditedFromSuggestion = (s: AutoInferRow['suggested']): AutoInferRow['edited'] => ({
    substrate_types: s.substrate_types || [],
    humidity_tolerance: s.humidity_tolerance || '',
    duty_rating: s.duty_rating || '',
    finish_type: s.finish_type || '',
    layer_position: s.layer_position || '',
  });

  const runAutoInfer = async (productIds: string[]) => {
    if (autoInferring) return;
    setAutoInferring(true);
    setAutoInferError(null);
    try {
      const res = await fetch(`${API_BASE}/qualification-tags/auto-infer`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ productIds }),
      });
      if (!res.ok) throw new Error(`Auto-infer failed (${res.status})`);
      const data: { results: Omit<AutoInferRow, 'edited' | 'included'>[] } = await res.json();
      const rowsOut: AutoInferRow[] = data.results.map(r => ({
        ...r,
        edited: buildEditedFromSuggestion(r.suggested),
        // Default selection: include unless already qualified.
        included: !r.already_qualified,
      }));
      setReviewModal({ rows: rowsOut, tab: 'high' });
    } catch (err) {
      console.error(err);
      setAutoInferError(err instanceof Error ? err.message : 'Auto-infer failed');
    } finally {
      setAutoInferring(false);
    }
  };

  // Apply suggested values for a SINGLE product into its row in the table.
  const autoFillRow = async (productId: string) => {
    setRows(prev => prev[productId] ? { ...prev, [productId]: { ...prev[productId], saving: true, error: null } } : prev);
    try {
      const res = await fetch(`${API_BASE}/qualification-tags/auto-infer`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ productIds: [productId] }),
      });
      if (!res.ok) throw new Error(`Auto-fill failed (${res.status})`);
      const data: { results: AutoInferRow[] } = await res.json();
      const r = data.results[0];
      if (!r) throw new Error('No result returned');
      // Apply Fix 2 conditional rules to the suggested values too — if the
      // suggested layer position implies humidity is N/A or finish is hidden,
      // never seed those fields with stale guesses.
      const suggestedLp = r.suggested.layer_position || '';
      setRows(prev => ({
        ...prev,
        [productId]: {
          ...(prev[productId] || emptyRow()),
          layerPosition: suggestedLp,
          substrateTypes: r.suggested.substrate_types || [],
          humidityTolerance: isHumidityHidden(suggestedLp) ? '' : (r.suggested.humidity_tolerance || ''),
          dutyRating: r.suggested.duty_rating || '',
          finishType: isFinishHidden(suggestedLp) ? '' : (r.suggested.finish_type || ''),
          dirty: true,
          saving: false,
          savedFlash: false,
          error: null,
        },
      }));
      setRowConfidence(prev => ({ ...prev, [productId]: r.confidence.overall }));
    } catch (err) {
      console.error(err);
      setRows(prev => prev[productId]
        ? { ...prev, [productId]: { ...prev[productId], saving: false, error: err instanceof Error ? err.message : 'Auto-fill failed' } }
        : prev);
    }
  };

  // Save a subset of the modal rows via the batch endpoint, then reflect the
  // result back into the table's local row state.
  const saveBatch = async (rowsToSave: AutoInferRow[], markReady: boolean) => {
    if (rowsToSave.length === 0 || batchSaving) return;
    setBatchSaving(true);
    try {
      const payload = rowsToSave.map(r => {
        // Apply Fix 2 conditional rules: never persist a Finish for primers,
        // and force the substrate value when the layer position dictates it.
        const lp = r.edited.layer_position || '';
        const substrate = isSubstrateFixed(lp)
          ? computeFixedSubstrate(lp, r.edited.substrate_types)
          : r.edited.substrate_types;
        const finish = isFinishHidden(lp) ? null : (r.edited.finish_type || null);
        const humidity = isHumidityHidden(lp) ? null : (r.edited.humidity_tolerance || null);
        return {
          product_id: r.product_id,
          layer_position: lp || null,
          substrate_types: substrate,
          humidity_tolerance: humidity,
          duty_rating: r.edited.duty_rating || null,
          finish_type: finish,
          is_system_ready: markReady,
        };
      });
      const res = await fetch(`${API_BASE}/qualification-tags/auto-save-batch`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ tags: payload }),
      });
      if (!res.ok) throw new Error(`Batch save failed (${res.status})`);
      // Reflect saved values into the table immediately. We re-derive substrate
      // and finish from the same `payload` we just sent so the local row state
      // exactly mirrors what was persisted (Fix 2: conditional reshape applied
      // — fixed substrate pills, primer-finish nulled — and layerPosition is
      // preserved so the row keeps rendering in conditional mode).
      setRows(prev => {
        const next = { ...prev };
        const conf: Record<string, Confidence> = { ...rowConfidence };
        rowsToSave.forEach((r, idx) => {
          const sent = payload[idx];
          next[r.product_id] = {
            layerPosition: sent.layer_position || '',
            substrateTypes: sent.substrate_types,
            humidityTolerance: sent.humidity_tolerance || '',
            dutyRating: sent.duty_rating || '',
            finishType: sent.finish_type || '',
            isSystemReady: markReady,
            exists: true,
            dirty: false,
            saving: false,
            savedFlash: true,
            error: null,
          };
          conf[r.product_id] = rowsToSave[idx].confidence.overall;
        });
        setRowConfidence(conf);
        return next;
      });
      setReviewModal(null);
    } catch (err) {
      console.error(err);
      setAutoInferError(err instanceof Error ? err.message : 'Batch save failed');
    } finally {
      setBatchSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // New-product toast: any other component can stash a suggestion under
  // localStorage['pending_qualification_suggestion'] when POST /api/products
  // returns `qualification_suggestions`. This effect picks it up.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const check = () => {
      try {
        const raw = localStorage.getItem('pending_qualification_suggestion');
        if (!raw) return;
        const parsed = JSON.parse(raw) as { productId: string; productName: string };
        if (parsed?.productId) setNewProductToast(parsed);
      } catch {
        // ignore
      }
    };
    check();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pending_qualification_suggestion') check();
    };
    const onFocus = () => check();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const handleToastReview = () => {
    if (!newProductToast) return;
    setSearchTerm(newProductToast.productId);
    autoFillRow(newProductToast.productId);
    localStorage.removeItem('pending_qualification_suggestion');
    setNewProductToast(null);
  };

  const handleBulkMarkReady = () => {
    setRows(prev => {
      const next = { ...prev };
      selected.forEach(id => {
        const cur = next[id] || emptyRow();
        next[id] = { ...cur, isSystemReady: true, dirty: true, savedFlash: false, error: null };
      });
      return next;
    });
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (loadError) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700">
          <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Could not load qualification data</div>
            <div className="text-sm mt-1">{loadError}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Section D — Summary stats */}
      <div className="flex gap-3">
        <StatCard
          label="Total products"
          value={stats.total}
          tone="slate"
          icon={<ShieldCheck size={14} />}
        />
        <StatCard
          label="System-ready"
          value={stats.ready}
          tone="emerald"
          icon={<CheckCircle2 size={14} />}
        />
        <StatCard
          label="Incomplete tags"
          value={stats.incomplete}
          tone="amber"
          icon={<AlertCircle size={14} />}
        />
        <StatCard
          label="Unqualified"
          value={stats.unqualified}
          tone="rose"
          icon={<X size={14} />}
        />
      </div>

      {/* New-product toast — surfaced when another component stashes a
          `pending_qualification_suggestion` payload in localStorage. */}
      {newProductToast && (
        <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <Sparkles size={16} className="text-indigo-600 flex-shrink-0" />
          <div className="text-sm text-indigo-800 flex-1">
            <span className="font-semibold">New product added</span> — qualification suggestions ready for{' '}
            <span className="font-medium">{newProductToast.productName || newProductToast.productId}</span>.
          </div>
          <button
            onClick={handleToastReview}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Review now →
          </button>
          <button
            onClick={() => { localStorage.removeItem('pending_qualification_suggestion'); setNewProductToast(null); }}
            className="p-1 text-indigo-500 hover:bg-indigo-100 rounded"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Auto-Qualification Engine bar — smart primary button: when filters are
          active it targets the visible subset; otherwise it targets all products.
          Secondary "all" button only appears when filters narrow the set. */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-gradient-to-r from-indigo-50 via-blue-50 to-emerald-50 border border-indigo-200 rounded-lg">
        <Sparkles size={16} className="text-indigo-600 flex-shrink-0" />
        <button
          onClick={() =>
            runAutoInfer(mainFiltersActive ? filteredProducts.map(p => p.id) : [])
          }
          disabled={
            autoInferring || (mainFiltersActive && filteredProducts.length === 0)
          }
          title={
            mainFiltersActive
              ? `Run on the ${filteredProducts.length} product(s) currently shown by your filters`
              : `Run on all ${products.length} products`
          }
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {autoInferring ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          {mainFiltersActive
            ? `Auto-qualify filtered (${filteredProducts.length})`
            : `Auto-qualify all products (${products.length})`}
        </button>
        {mainFiltersActive && (
          <button
            onClick={() => runAutoInfer([])}
            disabled={autoInferring}
            title={`Ignore filters and run on all ${products.length} products`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-indigo-300 text-indigo-700 rounded-md hover:bg-indigo-100 disabled:opacity-50"
          >
            <Wand2 size={14} />
            Run on all {products.length} instead
          </button>
        )}
        <div className="text-xs text-slate-600 flex items-center gap-1.5 ml-auto">
          <Info size={12} />
          {mainFiltersActive
            ? 'Primary button follows your active filters — only visible products will be processed'
            : 'Engine uses product name, description, and taxonomy path — review suggestions before saving'}
        </div>
        {autoInferError && (
          <div className="w-full text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
            {autoInferError}
          </div>
        )}
      </div>

      {/* Section A — Search & filter bar (Fix 1: live taxonomy + path + counts; Fix 4: layer/conf filters + sort + quick pills) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by product name or code…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Fix 1: taxonomy dropdown shows full path + per-node product count;
              refresh button forces a refetch from the server. */}
          <div className="flex items-center gap-1.5">
            <Filter size={14} className="text-slate-400" />
            <select
              value={nodeFilter}
              onChange={e => setNodeFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-blue-500 outline-none min-w-[260px]"
              title="Taxonomy filter — shows full taxonomy path and product count per node"
            >
              <option value="">All taxonomy nodes</option>
              {systemRelevantNodes.map(({ node, path, count }) => (
                <option key={node.id} value={node.id}>
                  {path} ({count})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => refetchTreeNodes(false)}
              disabled={refreshingNodes}
              title="Refresh taxonomy from server"
              className={`p-1.5 rounded-md border ${
                taxonomyJustRefreshed
                  ? 'border-emerald-300 text-emerald-600 bg-emerald-50'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              } disabled:opacity-50`}
            >
              <RefreshCw size={14} className={refreshingNodes ? 'animate-spin' : ''} />
            </button>
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="all">All products</option>
            <option value="ready">System-ready only</option>
            <option value="unqualified">Not yet qualified</option>
          </select>

          {/* Fix 4: layer-position + confidence filters */}
          <select
            value={layerFilter}
            onChange={e => setLayerFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            title="Filter by Layer Position"
          >
            <option value="">All layer positions</option>
            {(vocab?.layer_position || []).map(o => (
              <option key={o.id} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={confidenceFilter}
            onChange={e => setConfidenceFilter(e.target.value as 'all' | Confidence)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            title="Filter by overall inference confidence"
          >
            <option value="all">All confidence</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="none">None</option>
          </select>

          {/* Fix 4: sort */}
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <ArrowUpDown size={12} />
            <span>Sort:</span>
            <select
              value={mainSortKey}
              onChange={e => setMainSortKey(e.target.value as MainSortKey)}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
            >
              <option value="name">Product name</option>
              <option value="taxonomy">Taxonomy</option>
              <option value="confidence">Confidence</option>
              <option value="ready">System-ready</option>
            </select>
            <button
              type="button"
              onClick={() => setMainSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white hover:bg-slate-50"
              title={`Direction: ${mainSortDir === 'asc' ? 'ascending' : 'descending'}`}
            >
              {mainSortDir === 'asc' ? '↑ A→Z' : '↓ Z→A'}
            </button>
          </div>

          <div className="text-xs text-slate-500 ml-auto whitespace-nowrap">
            Showing {filteredProducts.length} of {products.length}
          </div>
        </div>

        {/* Fix 4: Quick filter pills with live counts */}
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">Quick filters:</span>
          {([
            { key: 'needs_layer',       label: 'Needs layer position', count: quickCounts.needsLayer },
            { key: 'missing_substrate', label: 'Missing substrate',    count: quickCounts.missingSub },
            { key: 'missing_duty',      label: 'Missing duty',         count: quickCounts.missingDuty },
            { key: 'missing_finish',    label: 'Missing finish',       count: quickCounts.missingFinish },
          ] as Array<{ key: MainQuickFilter; label: string; count: number }>).map(pill => {
            const active = mainQuickFilter === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => setMainQuickFilter(active ? 'none' : pill.key)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {pill.label} <span className={`ml-1 ${active ? 'text-indigo-100' : 'text-slate-400'}`}>({pill.count})</span>
              </button>
            );
          })}
          {mainQuickFilter !== 'none' && (
            <button
              type="button"
              onClick={() => setMainQuickFilter('none')}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              Clear quick filter
            </button>
          )}
        </div>
      </div>

      {/* Section C — Bulk action bar (only when rows are selected) */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm text-blue-800">
            <span className="font-semibold">{selectedCount}</span> selected
            <span className="text-blue-600"> · {selectedReadyCount} already system-ready</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleBulkMarkReady}
              disabled={bulkSaving}
              className="px-3 py-1.5 text-sm bg-white border border-blue-300 text-blue-700 rounded-md hover:bg-blue-100 disabled:opacity-50"
            >
              Mark all selected as System-Ready
            </button>
            <button
              onClick={handleBulkSave}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {bulkSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Selected
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-2 py-1.5 text-sm text-blue-700 hover:bg-blue-100 rounded-md"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Section B — Bulk qualification table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loadingTags && (
          <div className="flex items-center gap-2 p-4 text-sm text-slate-500 border-b border-slate-100">
            <Loader2 size={14} className="animate-spin" />
            Loading qualification tags…
          </div>
        )}
        <div className="overflow-x-auto">
          <table
            className="text-xs"
            style={{
              tableLayout: 'fixed',
              width:
                28 + mainColW.product + mainColW.taxonomy + mainColW.layer +
                mainColW.substrate + mainColW.humidity + mainColW.duty +
                mainColW.finish + mainColW.conf + mainColW.ready + mainColW.actions,
            }}
          >
            <colgroup>
              <col style={{ width: 28 }} />
              <col style={{ width: mainColW.product }} />
              <col style={{ width: mainColW.taxonomy }} />
              <col style={{ width: mainColW.layer }} />
              <col style={{ width: mainColW.substrate }} />
              <col style={{ width: mainColW.humidity }} />
              <col style={{ width: mainColW.duty }} />
              <col style={{ width: mainColW.finish }} />
              <col style={{ width: mainColW.conf }} />
              <col style={{ width: mainColW.ready }} />
              <col style={{ width: mainColW.actions }} />
            </colgroup>
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-2 py-1.5 text-left">
                  <input
                    type="checkbox"
                    checked={
                      filteredProducts.length > 0 &&
                      filteredProducts.every(p => selected.has(p.id))
                    }
                    onChange={toggleSelectAllVisible}
                    className="rounded text-blue-600"
                  />
                </th>
                <th className="relative px-2 py-1.5 text-left">
                  Product
                  <ResizeHandle colKey="product" currentWidth={mainColW.product} setWidths={setMainColW} />
                </th>
                <th className="relative px-2 py-1.5 text-left">
                  Taxonomy
                  <ResizeHandle colKey="taxonomy" currentWidth={mainColW.taxonomy} setWidths={setMainColW} />
                </th>
                {/* Fix 2: Layer Position is the FIRST qualification column — it
                    drives the conditional rendering of every column to its right. */}
                <th className="relative px-2 py-1.5 text-left">
                  Layer
                  <ResizeHandle colKey="layer" currentWidth={mainColW.layer} setWidths={setMainColW} />
                </th>
                <th className="relative px-2 py-1.5 text-left">
                  Substrate
                  <ResizeHandle colKey="substrate" currentWidth={mainColW.substrate} setWidths={setMainColW} />
                </th>
                <th className="relative px-2 py-1.5 text-left">
                  Humidity
                  <ResizeHandle colKey="humidity" currentWidth={mainColW.humidity} setWidths={setMainColW} />
                </th>
                <th className="relative px-2 py-1.5 text-left">
                  Duty
                  <ResizeHandle colKey="duty" currentWidth={mainColW.duty} setWidths={setMainColW} />
                </th>
                <th className="relative px-2 py-1.5 text-left">
                  Finish
                  <ResizeHandle colKey="finish" currentWidth={mainColW.finish} setWidths={setMainColW} />
                </th>
                <th className="relative px-2 py-1.5 text-center" title="Auto-inference confidence (grey = manually set)">
                  Conf.
                  <ResizeHandle colKey="conf" currentWidth={mainColW.conf} setWidths={setMainColW} minWidth={50} />
                </th>
                <th className="relative px-2 py-1.5 text-center">
                  Ready
                  <ResizeHandle colKey="ready" currentWidth={mainColW.ready} setWidths={setMainColW} minWidth={45} />
                </th>
                <th className="relative px-2 py-1.5 text-right">
                  Actions
                  <ResizeHandle colKey="actions" currentWidth={mainColW.actions} setWidths={setMainColW} minWidth={90} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 && !loadingTags && (
                <tr key="__empty__">
                  <td colSpan={11} className="px-2 py-6 text-center text-slate-400 text-xs">
                    No products match the current filters.
                  </td>
                </tr>
              )}
              {filteredProducts.map(p => {
                const r = rows[p.id] || emptyRow();
                const isSelected = selected.has(p.id);
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-slate-100 hover:bg-slate-50/50 ${
                      isSelected ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <td className="px-2 py-1.5 align-top">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p.id)}
                        className="rounded text-blue-600 mt-1"
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <div className="flex items-start gap-1.5">
                        {/* Dirty / saved indicators */}
                        {r.dirty && (
                          <span
                            title="Unsaved changes"
                            className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"
                          />
                        )}
                        {r.savedFlash && (
                          <CheckCircle2
                            size={12}
                            className="mt-0.5 text-emerald-500 flex-shrink-0"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div
                            className="flex items-center gap-1"
                            title={p.description || 'No description available'}
                          >
                            <span className="font-medium text-slate-700 truncate text-xs">{p.name}</span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setDetailProduct(p); }}
                              className="flex-shrink-0 text-slate-400 hover:text-blue-600 transition-colors"
                              title="View product details"
                              aria-label={`View details for ${p.name}`}
                            >
                              <Info size={12} />
                            </button>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {p.id}
                            {p.supplier ? ` · ${p.supplier}` : ''}
                          </div>
                          {r.error && (
                            <div className="text-[10px] text-rose-600 mt-0.5">{r.error}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-top text-[11px] text-slate-500 min-w-[160px] max-w-[220px]" title={nodePath(p.nodeId)}>
                      <div className="whitespace-normal break-words leading-tight">
                        {nodePath(p.nodeId)}
                      </div>
                    </td>

                    {/* Fix 2: Layer Position single-select (FIRST data column).
                        When empty, show a subtle hint underneath the dropdown
                        instead of a hard validation message. */}
                    <td className="px-2 py-1.5 align-top">
                      <SingleSelect
                        options={vocab?.layer_position || []}
                        value={r.layerPosition}
                        onChange={v => updateRow(p.id, { layerPosition: v })}
                        disabled={r.saving}
                        placeholder="—"
                      />
                      {!r.layerPosition && (
                        <div className="text-[9px] text-slate-400 mt-0.5">
                          Set first
                        </div>
                      )}
                    </td>

                    {/* Substrate — three modes:
                        a) base_coat / intermediate → forced "Over Primer" pill
                        b) topcoat → 2-option pill toggle (Over Base Coat / Over Primer)
                        c) primer / standalone / null → standard MultiSelect */}
                    <td className="px-2 py-1.5 align-top">
                      {(() => {
                        const lp = r.layerPosition;
                        if (lp === 'base_coat' || lp === 'intermediate') {
                          return (
                            <span className="inline-block px-1.5 py-0.5 text-[10px] rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-medium">
                              Over Primer
                            </span>
                          );
                        }
                        if (lp === 'topcoat') {
                          const cur = r.substrateTypes[0] === 'Over Primer' ? 'Over Primer' : 'Over Base Coat';
                          return (
                            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[10px]">
                              {(['Over Base Coat', 'Over Primer'] as const).map(opt => (
                                <button
                                  key={opt}
                                  type="button"
                                  disabled={r.saving}
                                  onClick={() => updateRow(p.id, { substrateTypes: [opt] })}
                                  className={`px-1.5 py-0.5 ${cur === opt ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                                  title={opt}
                                >
                                  {opt === 'Over Base Coat' ? 'Base' : 'Primer'}
                                </button>
                              ))}
                            </div>
                          );
                        }
                        return (
                          <MultiSelect
                            options={vocab?.substrate.filter(o => o.value !== 'Over Primer' && o.value !== 'Over Base Coat') || []}
                            value={r.substrateTypes}
                            onChange={v => updateRow(p.id, { substrateTypes: v })}
                            disabled={r.saving}
                          />
                        );
                      })()}
                    </td>
                    {/* Humidity — N/A for layers that don't touch the substrate
                        (base coats, intermediate coats, topcoats). Same conditional
                        pattern as Finish for primers. */}
                    <td className="px-2 py-1.5 align-top">
                      {isHumidityHidden(r.layerPosition) ? (
                        <span
                          className="inline-block px-1.5 py-0.5 text-[10px] text-slate-400 italic"
                          title="Humidity tolerance only applies to layers that touch the substrate (primer / standalone)"
                        >N/A</span>
                      ) : (
                        <SingleSelect
                          options={vocab?.humidity || []}
                          value={r.humidityTolerance}
                          onChange={v => updateRow(p.id, { humidityTolerance: v })}
                          disabled={r.saving}
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <SingleSelect
                        options={vocab?.duty || []}
                        value={r.dutyRating}
                        onChange={v => updateRow(p.id, { dutyRating: v })}
                        disabled={r.saving}
                      />
                    </td>
                    {/* Finish — hidden (rendered as N/A placeholder) for primers
                        per Fix 2 spec; required-style outline for topcoats. */}
                    <td className="px-2 py-1.5 align-top">
                      {isFinishHidden(r.layerPosition) ? (
                        <span className="inline-block px-1.5 py-0.5 text-[10px] text-slate-400 italic">N/A</span>
                      ) : (
                        <div className={r.layerPosition === 'topcoat' && !r.finishType ? 'ring-1 ring-amber-300 rounded-md' : ''}
                             title={r.layerPosition === 'topcoat' ? 'Required for topcoats' : undefined}>
                          <SingleSelect
                            options={vocab?.finish || []}
                            value={r.finishType}
                            onChange={v => updateRow(p.id, { finishType: v })}
                            disabled={r.saving}
                            placeholder={r.layerPosition === 'topcoat' ? 'Required…' : '—'}
                          />
                        </div>
                      )}
                    </td>
                    {/* Confidence — auto-inference confidence dot. Grey = manually set
                        (we never recorded an inference for this row). */}
                    <td className="px-3 py-2 align-top text-center">
                      {(() => {
                        // Confidence dot decision tree:
                        //  - No inference recorded for this row → grey (manually set or empty)
                        //  - Inference recorded with overall='none' → red (engine couldn't resolve)
                        //  - Otherwise → green/amber/red per overallToTone
                        const c = rowConfidence[p.id];
                        if (!c) {
                          const dot = hasAnyTagData(r) ? 'bg-slate-400' : 'bg-slate-200';
                          const label = hasAnyTagData(r) ? 'Manual' : '—';
                          return (
                            <div className="flex items-center justify-center gap-1.5" title={label}>
                              <span className={`inline-block w-2.5 h-2.5 rounded-full ${dot}`} />
                              <span className="text-[11px] text-slate-500">{label}</span>
                            </div>
                          );
                        }
                        // Engine produced a verdict — red dot for 'none' so review queues stand out.
                        const tone = c === 'none'
                          ? { dot: 'bg-rose-500', label: 'None' }
                          : { dot: overallToTone(c).dot, label: overallToTone(c).label };
                        return (
                          <div className="flex items-center justify-center gap-1.5" title={tone.label}>
                            <span className={`inline-block w-2.5 h-2.5 rounded-full ${tone.dot}`} />
                            <span className="text-[11px] text-slate-500">{tone.label}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 align-top text-center">
                      <div className="flex justify-center pt-0.5">
                        <Toggle
                          checked={r.isSystemReady}
                          onChange={v => updateRow(p.id, { isSystemReady: v })}
                          disabled={r.saving}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-top text-right">
                      <div className="inline-flex items-center gap-0.5 justify-end">
                        <button
                          onClick={() => autoFillRow(p.id)}
                          disabled={r.saving}
                          title="Auto-fill from product name, description and taxonomy"
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                        >
                          <Sparkles size={10} />
                          Auto
                        </button>
                        <button
                          onClick={() => saveRow(p.id)}
                          disabled={r.saving || !r.dirty}
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-md ${
                            r.dirty && !r.saving
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          {r.saving ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <Save size={10} />
                          )}
                          Save
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auto-Qualification Review Modal — uses min-height wrapper instead of
          position:fixed (per design rules). Backdrop covers viewport.
          Fix 3: filter bar + sortable column headers + quick filter buttons +
          visible-aware select-all + "X of Y visible selected" counter. */}
      {reviewModal && (
        <ReviewModal
          state={reviewModal}
          setState={setReviewModal}
          vocab={vocab}
          systemRelevantNodes={systemRelevantNodes}
          batchSaving={batchSaving}
          saveBatch={saveBatch}
        />
      )}

      {detailProduct && (
        <ProductDetailsModal
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onUpdate={(updated) => {
            onProductUpdate?.(updated);
            setDetailProduct(updated);
          }}
          onEdit={(p) => {
            setDetailProduct(null);
            onProductEdit?.(p);
          }}
          treeNodes={treeNodes}
        />
      )}
    </div>
  );
};

export default SystemBuilderQualification;
