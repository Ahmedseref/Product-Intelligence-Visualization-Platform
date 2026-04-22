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

import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, Search, CheckCircle2, AlertCircle, Loader2,
  Save, X, ChevronDown, Filter, Info, Sparkles, Wand2,
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
type VocabMap = Record<'substrate' | 'humidity' | 'duty' | 'finish', VocabItem[]>;

interface QualificationTag {
  id?: number;
  productId: string;
  substrateTypes: string[] | null;
  humidityTolerance: string | null;
  dutyRating: string | null;
  finishType: string | null;
  isSystemReady: boolean;
  qualifiedAt?: string | null;
  qualifiedBy?: string | null;
}

interface RowState {
  // Current (possibly unsaved) values shown in the row
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
  };
  confidence: { substrate: Confidence; humidity: Confidence; duty: Confidence; finish: Confidence; overall: Confidence };
  sources: { substrate: string; humidity: string; duty: string; finish: string };
  already_qualified: boolean;
  // UI-only state — editable values + selection checkbox
  edited: {
    substrate_types: string[];
    humidity_tolerance: string;
    duty_rating: string;
    finish_type: string;
  };
  included: boolean;
}

type ReviewTab = 'high' | 'review' | 'none';

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
        className="w-full min-h-[32px] px-2 py-1 text-xs border border-slate-200 rounded-md bg-white text-left flex items-center justify-between gap-1 hover:border-slate-300 disabled:bg-slate-50 disabled:cursor-not-allowed"
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
    className="w-full h-[32px] px-2 text-xs border border-slate-200 rounded-md bg-white hover:border-slate-300 disabled:bg-slate-50 disabled:cursor-not-allowed"
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

// ---------- Main component ----------
const SystemBuilderQualification: React.FC<Props> = ({ products, treeNodes, onProductUpdate, onProductEdit }) => {
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [vocab, setVocab] = useState<VocabMap | null>(null);
  // Map of productId -> RowState. Includes both fetched and locally-edited rows.
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [loadingTags, setLoadingTags] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [nodeFilter, setNodeFilter] = useState<string>(''); // '' = all
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

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
  // Derived: system-relevant taxonomy nodes for the dropdown.
  // -------------------------------------------------------------------------
  const systemRelevantNodes = useMemo(() => {
    return treeNodes
      .filter(n => {
        const lower = n.name.toLowerCase();
        return SYSTEM_RELEVANT_KEYWORDS.some(k => lower.includes(k));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [treeNodes]);

  // Build a quick lookup of nodeId -> path string for display
  const nodePath = useMemo(() => {
    const byId = new Map<string, TreeNode>(treeNodes.map(n => [n.id, n] as const));
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
  }, [treeNodes]);

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------
  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return products.filter(p => {
      if (term) {
        const matches =
          p.name.toLowerCase().includes(term) ||
          p.id.toLowerCase().includes(term);
        if (!matches) return false;
      }
      if (nodeFilter && p.nodeId !== nodeFilter) return false;
      if (statusFilter !== 'all') {
        const r = rows[p.id];
        if (statusFilter === 'ready' && !(r && r.isSystemReady)) return false;
        if (statusFilter === 'unqualified' && hasAnyTagData(r)) return false;
      }
      return true;
    });
  }, [products, searchTerm, nodeFilter, statusFilter, rows]);

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
  // Row mutations
  // -------------------------------------------------------------------------
  const updateRow = (productId: string, patch: Partial<RowState>) => {
    setRows(prev => {
      const cur = prev[productId] || emptyRow();
      return {
        ...prev,
        [productId]: { ...cur, ...patch, dirty: true, savedFlash: false, error: null },
      };
    });
  };

  const saveRow = async (productId: string): Promise<boolean> => {
    const r = rows[productId];
    if (!r) return false;
    setRows(prev => ({ ...prev, [productId]: { ...prev[productId], saving: true, error: null } }));
    try {
      const body = {
        productId,
        substrateTypes: r.substrateTypes.length > 0 ? r.substrateTypes : null,
        humidityTolerance: r.humidityTolerance || null,
        dutyRating: r.dutyRating || null,
        finishType: r.finishType || null,
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
      setRows(prev => ({
        ...prev,
        [productId]: {
          ...(prev[productId] || emptyRow()),
          substrateTypes: r.suggested.substrate_types || [],
          humidityTolerance: r.suggested.humidity_tolerance || '',
          dutyRating: r.suggested.duty_rating || '',
          finishType: r.suggested.finish_type || '',
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
      const payload = rowsToSave.map(r => ({
        product_id: r.product_id,
        substrate_types: r.edited.substrate_types,
        humidity_tolerance: r.edited.humidity_tolerance || null,
        duty_rating: r.edited.duty_rating || null,
        finish_type: r.edited.finish_type || null,
        is_system_ready: markReady,
      }));
      const res = await fetch(`${API_BASE}/qualification-tags/auto-save-batch`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ tags: payload }),
      });
      if (!res.ok) throw new Error(`Batch save failed (${res.status})`);
      // Reflect saved values into the table immediately.
      setRows(prev => {
        const next = { ...prev };
        const conf: Record<string, Confidence> = { ...rowConfidence };
        rowsToSave.forEach((r, idx) => {
          next[r.product_id] = {
            substrateTypes: r.edited.substrate_types,
            humidityTolerance: r.edited.humidity_tolerance,
            dutyRating: r.edited.duty_rating,
            finishType: r.edited.finish_type,
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

      {/* Auto-Qualification Engine bar */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-gradient-to-r from-indigo-50 via-blue-50 to-emerald-50 border border-indigo-200 rounded-lg">
        <Sparkles size={16} className="text-indigo-600 flex-shrink-0" />
        <button
          onClick={() => runAutoInfer([])}
          disabled={autoInferring}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {autoInferring ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          Auto-qualify all products
        </button>
        <button
          onClick={() => runAutoInfer(filteredProducts.map(p => p.id))}
          disabled={autoInferring || filteredProducts.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-indigo-300 text-indigo-700 rounded-md hover:bg-indigo-100 disabled:opacity-50"
        >
          <Wand2 size={14} />
          Auto-qualify filtered ({filteredProducts.length})
        </button>
        <div className="text-xs text-slate-600 flex items-center gap-1.5 ml-auto">
          <Info size={12} />
          Engine uses product name, description, and taxonomy path — review suggestions before saving
        </div>
        {autoInferError && (
          <div className="w-full text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
            {autoInferError}
          </div>
        )}
      </div>

      {/* Section A — Search & filter bar */}
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
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <select
            value={nodeFilter}
            onChange={e => setNodeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            title="Taxonomy filter (PU, Epoxy, Polyurea, Acrylic branches)"
          >
            <option value="">All taxonomy nodes</option>
            {systemRelevantNodes.map(n => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
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
        <div className="text-xs text-slate-500 ml-auto">
          Showing {filteredProducts.length} of {products.length}
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
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left w-8">
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
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-left">Taxonomy</th>
                <th className="px-3 py-2 text-left w-[180px]">Substrate</th>
                <th className="px-3 py-2 text-left w-[140px]">Humidity</th>
                <th className="px-3 py-2 text-left w-[130px]">Duty</th>
                <th className="px-3 py-2 text-left w-[130px]">Finish</th>
                <th className="px-3 py-2 text-center w-[90px]" title="Auto-inference confidence (grey = manually set)">Confidence</th>
                <th className="px-3 py-2 text-center w-[80px]">Ready</th>
                <th className="px-3 py-2 text-right w-[150px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 && !loadingTags && (
                <tr key="__empty__">
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-400 text-sm">
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
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p.id)}
                        className="rounded text-blue-600 mt-1"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-start gap-2">
                        {/* Dirty / saved indicators */}
                        {r.dirty && (
                          <span
                            title="Unsaved changes"
                            className="mt-1.5 inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"
                          />
                        )}
                        {r.savedFlash && (
                          <CheckCircle2
                            size={14}
                            className="mt-0.5 text-emerald-500 flex-shrink-0"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div
                            className="flex items-center gap-1.5"
                            title={p.description || 'No description available'}
                          >
                            <span className="font-medium text-slate-700 truncate">{p.name}</span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setDetailProduct(p); }}
                              className="flex-shrink-0 text-slate-400 hover:text-blue-600 transition-colors"
                              title="View product details"
                              aria-label={`View details for ${p.name}`}
                            >
                              <Info size={14} />
                            </button>
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {p.id}
                            {p.supplier ? ` · ${p.supplier}` : ''}
                          </div>
                          {r.error && (
                            <div className="text-xs text-rose-600 mt-1">{r.error}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-slate-500 min-w-[260px]" title={nodePath(p.nodeId)}>
                      <div className="whitespace-normal break-words leading-snug">
                        {nodePath(p.nodeId)}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <MultiSelect
                        options={vocab?.substrate || []}
                        value={r.substrateTypes}
                        onChange={v => updateRow(p.id, { substrateTypes: v })}
                        disabled={r.saving}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <SingleSelect
                        options={vocab?.humidity || []}
                        value={r.humidityTolerance}
                        onChange={v => updateRow(p.id, { humidityTolerance: v })}
                        disabled={r.saving}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <SingleSelect
                        options={vocab?.duty || []}
                        value={r.dutyRating}
                        onChange={v => updateRow(p.id, { dutyRating: v })}
                        disabled={r.saving}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <SingleSelect
                        options={vocab?.finish || []}
                        value={r.finishType}
                        onChange={v => updateRow(p.id, { finishType: v })}
                        disabled={r.saving}
                      />
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
                    <td className="px-3 py-2 align-top text-right">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <button
                          onClick={() => autoFillRow(p.id)}
                          disabled={r.saving}
                          title="Auto-fill from product name, description and taxonomy"
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                        >
                          <Sparkles size={12} />
                          Auto
                        </button>
                        <button
                          onClick={() => saveRow(p.id)}
                          disabled={r.saving || !r.dirty}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md ${
                            r.dirty && !r.saving
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          {r.saving ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Save size={12} />
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
          position:fixed (per design rules). Backdrop covers viewport. */}
      {reviewModal && (() => {
        const all = reviewModal.rows;
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
        const visible = tabs.find(t => t.key === reviewModal.tab)!.rows;

        const updateModalRow = (productId: string, patch: Partial<AutoInferRow['edited']> & { included?: boolean }) => {
          setReviewModal(prev => prev ? {
            ...prev,
            rows: prev.rows.map(r => r.product_id !== productId ? r : ({
              ...r,
              edited: { ...r.edited, ...('substrate_types' in patch ? { substrate_types: patch.substrate_types! } : {}),
                                     ...('humidity_tolerance' in patch ? { humidity_tolerance: patch.humidity_tolerance! } : {}),
                                     ...('duty_rating' in patch ? { duty_rating: patch.duty_rating! } : {}),
                                     ...('finish_type' in patch ? { finish_type: patch.finish_type! } : {}) },
              included: patch.included ?? r.included,
            })),
          } : prev);
        };

        return (
          <div className="absolute inset-0 z-50 bg-slate-900/50 flex items-start justify-center overflow-y-auto"
               style={{ minHeight: '100vh' }}>
            <div className="bg-white rounded-lg shadow-2xl my-8 mx-4 w-[min(1200px,95vw)] max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200">
                <Sparkles size={18} className="text-indigo-600" />
                <div className="flex-1">
                  <div className="text-base font-semibold text-slate-800">Auto-Qualification Review</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {all.length} analysed · {high.length} high confidence · {review.length + none.length} need review · {skipped.length} already qualified (skipped)
                  </div>
                </div>
                <button onClick={() => setReviewModal(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded">
                  <X size={16} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200 px-5">
                {tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setReviewModal(prev => prev ? { ...prev, tab: t.key } : prev)}
                    className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${
                      reviewModal.tab === t.key
                        ? 'border-indigo-600 text-indigo-700 font-semibold'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Body — table */}
              <div className="flex-1 overflow-auto">
                {visible.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-sm">No products in this group.</div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left w-8">
                          <input
                            type="checkbox"
                            checked={visible.every(r => r.included)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setReviewModal(prev => prev ? {
                                ...prev,
                                rows: prev.rows.map(r => visible.some(v => v.product_id === r.product_id) ? { ...r, included: checked } : r),
                              } : prev);
                            }}
                          />
                        </th>
                        <th className="px-3 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-left">Taxonomy</th>
                        <th className="px-3 py-2 text-left w-[200px]">Substrate</th>
                        <th className="px-3 py-2 text-left w-[160px]">Humidity</th>
                        <th className="px-3 py-2 text-left w-[160px]">Duty</th>
                        <th className="px-3 py-2 text-left w-[160px]">Finish</th>
                        <th className="px-3 py-2 text-center w-[90px]">Overall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(r => {
                        const overall = overallToTone(r.confidence.overall);
                        return (
                          <tr key={r.product_id} className="border-b border-slate-100 align-top">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={r.included}
                                onChange={(e) => updateModalRow(r.product_id, { included: e.target.checked })}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-700 text-xs">{r.product_name}</div>
                              <div className="text-[11px] text-slate-400">{r.product_id}</div>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-500 max-w-[260px]">
                              <div className="whitespace-normal break-words leading-snug">{r.taxonomy_path || '—'}</div>
                            </td>
                            <td className="px-3 py-2">
                              <MultiSelect
                                options={vocab?.substrate || []}
                                value={r.edited.substrate_types}
                                onChange={v => updateModalRow(r.product_id, { substrate_types: v })}
                              />
                              <SourceBadge source={r.sources.substrate} />
                            </td>
                            <td className="px-3 py-2">
                              <SingleSelect
                                options={vocab?.humidity || []}
                                value={r.edited.humidity_tolerance}
                                onChange={v => updateModalRow(r.product_id, { humidity_tolerance: v })}
                              />
                              <SourceBadge source={r.sources.humidity} />
                            </td>
                            <td className="px-3 py-2">
                              <SingleSelect
                                options={vocab?.duty || []}
                                value={r.edited.duty_rating}
                                onChange={v => updateModalRow(r.product_id, { duty_rating: v })}
                              />
                              <SourceBadge source={r.sources.duty} />
                            </td>
                            <td className="px-3 py-2">
                              <SingleSelect
                                options={vocab?.finish || []}
                                value={r.edited.finish_type}
                                onChange={v => updateModalRow(r.product_id, { finish_type: v })}
                              />
                              <SourceBadge source={r.sources.finish} />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-block px-2 py-0.5 text-[11px] font-medium border rounded-full ${overall.pill}`}>
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
                  Save High confidence will mark {high.filter(r => r.included).length} products as System-Ready.
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => setReviewModal(null)}
                    className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => saveBatch(high.filter(r => r.included), true)}
                    disabled={batchSaving || high.filter(r => r.included).length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {batchSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Save high confidence ({high.filter(r => r.included).length})
                  </button>
                  <button
                    onClick={() => saveBatch(all.filter(r => r.included && !r.already_qualified), false)}
                    disabled={batchSaving || all.filter(r => r.included && !r.already_qualified).length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {batchSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save selected ({all.filter(r => r.included && !r.already_qualified).length})
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
