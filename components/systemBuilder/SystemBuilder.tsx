import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SystemData, SystemFull, SystemLayer, SystemProductOption, Product, Sector, CustomField, TreeNode, Supplier, User } from '../../types';
import { systemsApi, primerLibraryApi } from '../../client/api';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import ProductDetailsModal from '../ProductDetailsModal';
import ProductForm from '../ProductForm';
import { parseSearchQuery, matchesAdvancedSearch } from '../../shared/searchUtils';
import { 
  Plus, Search, ChevronRight, ChevronDown, GripVertical, Trash2, Edit, Save, X, Info, 
  Download, Upload, Layers, Package, Star, StarOff, MoreVertical, Copy, 
  History, Eye, FileJson, FileSpreadsheet, ChevronUp, AlertCircle, Check,
  BarChart3, FileUp, ShieldCheck, AlertTriangle, Sparkles, ArrowRight, ArrowLeft,
  Library
} from 'lucide-react';
import SystemDashboard from './SystemDashboard';
import SystemBuilderQualification from '../SystemBuilderQualification';
import SystemBuilderPreview from '../SystemBuilderPreview';
import PrimerLibrary from './PrimerLibrary';
import { PrimerLibraryEntry } from '../../types';
import {
  isHardExcluded as engineIsHardExcluded,
  scoreProduct as engineScoreProduct,
  computeMatchLabel,
  type ProductTags,
  type MatchLabel,
  type LayerPosition as EngineLayerPosition,
} from '../../shared/compatibilityEngine';

interface SystemBuilderProps {
  products: Product[];
  onProductUpdate: (p: Product) => void;
  customFields: CustomField[];
  treeNodes: TreeNode[];
  suppliers: Supplier[];
  usageAreas: string[];
  units: string[];
  colors: any[];
  currentUser: User;
  onAddFieldDefinition: (field: CustomField) => void;
  onAddTreeNode: (node: TreeNode) => void;
  onProductEdit?: (p: Product) => void;
}

type TabMode = 'builder' | 'analytics' | 'qualification' | 'preview' | 'library';

// ── Adaptive primer helpers ──
// A layer is "primer-position" when its name contains "primer" (case-
// insensitive) — same heuristic the qualification engine and Build-Up
// Preview already use throughout the System Builder. The toggle and the
// adaptive slot panel are only shown for these layers; everywhere else
// layerMode is forced to 'fixed'.
const isPrimerLayer = (layerName: string | null | undefined): boolean => {
  if (!layerName) return false;
  return /\bprimer\b/i.test(layerName);
};

// Infer the system's material/system type for the adaptive resolve filter.
// Maps the system name + description to one of Epoxy / PU / Polyurea /
// Acrylic. Returns null when nothing matches so the resolve call doesn't
// constrain by type.
const inferSystemType = (system: { name?: string | null; description?: string | null } | null | undefined): string | null => {
  if (!system) return null;
  const hay = `${system.name || ''} ${system.description || ''}`.toLowerCase();
  if (/\bpolyurea\b/.test(hay)) return 'Polyurea';
  if (/\bepoxy\b/.test(hay)) return 'Epoxy';
  if (/\bacrylic\b/.test(hay)) return 'Acrylic';
  if (/\b(pu|polyurethane)\b/.test(hay)) return 'PU';
  return null;
};

// Map a product's taxonomy haystack (path + name, already lower-cased) to the
// material family it belongs to. Used by the layer product search to hard-
// exclude products that are exclusively in an incompatible chemistry family.
// Returns null when the product is unclassifiable — those products fall
// through to the scoring tier instead of being hard-excluded.
//
// Bitumen / cement waterproofing branches are standalone systems on their
// own and should be excluded from every typed system (Epoxy / PU / Polyurea /
// Acrylic) — they only appear when the system itself is generic / other.
type SystemFamily = 'Epoxy' | 'PU' | 'Polyurea' | 'Acrylic' | 'BitumenCement';
// Branch-code → family mapping per the user's taxonomy spec. Codes are
// matched as whole tokens against the lower-cased taxonomy + name + supplier
// haystack. Order matters: Polyurea (PW) is checked first so it isn't
// swallowed by the PU regex, and Bitumen/Cement (BBW/CBW/PB) is checked
// before Epoxy in case any taxonomy node accidentally co-mentions them.
//
//   Epoxy           → EPC, EP, EPP, IF              + 'epoxy'/'epox' keyword
//   PU (polyurethane)→ PUP, PP, PW&B, PF            + 'pu'/'polyurethane'
//   Polyurea        → PW                            + 'polyurea'
//   Acrylic         → AWM, AS, FP&SC                + 'acrylic'
//   Bitumen/Cement  → BBW, CBW, PB                  + 'bitumen'/'bituminous'/'cement'
//
// "PW&B" / "FP&SC" use a literal ampersand which we match defensively as
// either `&` or the URL-encoded `%26` (very unlikely in display strings but
// cheap). We also accept "pwb" / "fpsc" run-together because some imports
// strip the ampersand. All matches use \b word boundaries so a code never
// matches inside a larger word ("EPC" must not match "decoupling").
const inferProductFamily = (haystack: string): SystemFamily | null => {
  const h = haystack.toLowerCase();
  // --- Polyurea first (most specific; PW code + 'polyurea' keyword) ---
  if (/\bpolyurea\b/.test(h)) return 'Polyurea';
  if (/\bpw\b/.test(h)) return 'Polyurea';
  // --- Bitumen / Cement (must beat keyword-overlap with epoxy/PU primers) ---
  if (/\b(bitumen|bituminous|cement(?:itious)?)\b/.test(h)) return 'BitumenCement';
  if (/\b(bbw|cbw|pb)\b/.test(h)) return 'BitumenCement';
  // --- Acrylic (AWM / AS / FP&SC codes + 'acrylic' keyword) ---
  // NOTE: bare "AS" is intentionally excluded — it's a common English word
  // that creates too many false positives in product names. AWM / FP&SC are
  // distinctive enough to carry the mapping.
  if (/\bacrylic\b/.test(h)) return 'Acrylic';
  if (/\b(awm|fp&sc|fpsc)\b/.test(h)) return 'Acrylic';
  // --- Epoxy (EPC / EP / EPP / IF codes + 'epoxy' keyword) ---
  // NOTE: bare "IF" is intentionally excluded — it's a common English word.
  // "EP" is kept because it's not a real word and is a strong epoxy marker.
  if (/\b(epoxy|epox)\b/.test(h)) return 'Epoxy';
  if (/\b(epc|ep|epp)\b/.test(h)) return 'Epoxy';
  // --- PU last (PUP / PP / PW&B / PF codes + 'pu' / 'polyurethane') ---
  if (/\b(pu|polyurethane)\b/.test(h)) return 'PU';
  if (/\b(pup|pp|pw&b|pwb|pf)\b/.test(h)) return 'PU';
  return null;
};

// QualTag is the shape of a qualification-tag row used throughout this
// component. Aliased to the shared engine's ProductTags so the engine can
// consume it without translation. Score + match-label computation also
// delegate to the engine — see shared/compatibilityEngine.ts.
type QualTag = ProductTags;

// Backwards-compat wrapper around the engine's positional API so the
// existing call sites in layerSearchResult continue to type-check without
// being rewritten. Both arities are equivalent.
const scoreProduct = (
  tag: QualTag | undefined,
  productFamily: SystemFamily | null,
  layerPosition: string | null,
  systemType: string | null,
  systemSubstrates: string[],
  systemHumidity: string | null,
  systemDuty: string | null,
): number => engineScoreProduct(tag, {
  systemType,
  systemSubstrates,
  systemHumidity,
  systemDuty,
  activeLayerPosition: (layerPosition as EngineLayerPosition | null) ?? null,
  productFamily,
});

// Normalize the (possibly-legacy) systemSubstrate value into a guaranteed
// array of strings. Handles three on-the-wire shapes:
//   • null / undefined        → []
//   • a string (legacy row)   → [s]   (one element)
//   • an array of strings     → as-is (filters out empties)
// Callers can treat the result as the canonical substrate list everywhere.
const substratesAsArray = (v: string[] | string | null | undefined): string[] => {
  if (v == null) return [];
  if (Array.isArray(v)) return v.filter(s => typeof s === 'string' && s.length > 0);
  if (typeof v === 'string') return v.length > 0 ? [v] : [];
  return [];
};

// ----------------------------------------------------------------------------
// SpecNumberInput
// Compact uncontrolled-feeling numeric cell used by the installable-spec rows
// (system thickness range + per-layer consumption / DFT / recoat). It
// keeps a local string draft so partial typing like "1." or "" doesn't fire
// premature saves, then commits on blur or Enter. The draft is re-synced from
// the prop via useEffect so a parent refresh (loadFullSystem) overwrites stale
// in-flight edits cleanly. Empty input is treated as `null` (clears the value).
// Returning early when nothing changed keeps the network quiet on plain focus
// in/out without any edits.
// ----------------------------------------------------------------------------
interface SpecNumberInputProps {
  value: number | null | undefined;
  onSave: (next: number | null) => void;
  placeholder?: string;
  className?: string;
  step?: string;
  ariaLabel?: string;
  testId?: string;
  disabled?: boolean;
}
const SpecNumberInput: React.FC<SpecNumberInputProps> = React.memo(({
  value, onSave, placeholder, className, step, ariaLabel, testId, disabled,
}) => {
  const initial = value == null ? '' : String(value);
  const [draft, setDraft] = React.useState<string>(initial);
  // Escape sets this flag so the immediately-following blur does NOT commit.
  // We need a ref (not state) because the blur handler reads it synchronously
  // in the same tick the Escape keydown fires, before any re-render. The flag
  // is cleared inside the blur handler so subsequent normal blurs still save.
  const skipNextCommitRef = React.useRef<boolean>(false);
  // Re-sync the draft when the persisted value changes (parent reloaded). We
  // only overwrite when the parent's value differs from what we currently show
  // so that mid-edit refreshes don't yank the cursor out of the field.
  React.useEffect(() => {
    const next = value == null ? '' : String(value);
    setDraft(prev => (prev === next ? prev : next));
  }, [value]);
  const commit = React.useCallback(() => {
    const trimmed = draft.trim();
    const nextNumeric: number | null = trimmed === '' ? null : Number(trimmed);
    // Reject non-numeric garbage by snapping the draft back to the persisted value.
    if (nextNumeric !== null && !Number.isFinite(nextNumeric)) {
      setDraft(value == null ? '' : String(value));
      return;
    }
    // No-op when the value didn't actually change (avoids needless network).
    const persisted: number | null = value == null ? null : value;
    if (nextNumeric === persisted) return;
    onSave(nextNumeric);
  }, [draft, value, onSave]);
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step ?? 'any'}
      value={draft}
      placeholder={placeholder ?? '—'}
      aria-label={ariaLabel}
      data-testid={testId}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        // Honour the discard flag set by Escape — and clear it regardless so
        // the *next* blur (a normal one) still commits. Without this guard
        // the closure-captured `draft` inside `commit` is the pre-Escape edit
        // (setDraft is async), so Escape would silently save the abandoned
        // value.
        if (skipNextCommitRef.current) {
          skipNextCommitRef.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          // Discard local edits and snap back to persisted value. Mark the
          // imminent blur as a "skip commit" so the discard isn't immediately
          // re-saved by the onBlur handler reading stale draft state.
          skipNextCommitRef.current = true;
          setDraft(value == null ? '' : String(value));
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={className ?? 'w-16 px-1.5 py-0.5 text-[11px] text-right border border-slate-200 rounded bg-white focus:ring-1 focus:ring-indigo-400 outline-none disabled:bg-slate-50 disabled:text-slate-400'}
    />
  );
});
SpecNumberInput.displayName = 'SpecNumberInput';

const SystemBuilder: React.FC<SystemBuilderProps> = ({ products, onProductUpdate, customFields, treeNodes, suppliers, usageAreas, units, colors, currentUser, onAddFieldDefinition, onAddTreeNode, onProductEdit }) => {
  const [activeTab, setActiveTab] = useState<TabMode>('builder');
  const [systems, setSystems] = useState<SystemData[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [fullSystem, setFullSystem] = useState<SystemFull | null>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreateSystem, setShowCreateSystem] = useState(false);
  // Phase 4: Quick Setup wizard state. Only used for the NEW system flow —
  // never opened when editing an existing system.
  const [quickSetupOpen, setQuickSetupOpen] = useState(false);
  const [quickStep, setQuickStep] = useState<1 | 2 | 3>(1);
  const [quickBusy, setQuickBusy] = useState(false);
  type QuickLayerSlot = { name: string; productId: string | null };
  type QuickSetup = {
    name: string;
    materialType: 'epoxy' | 'pu' | 'polyurea' | 'acrylic' | 'generic';
    // Multi-select — products can list several substrate types, so the wizard
    // mirrors that. Empty array means "any substrate" for the Step 4 filter.
    substrate: string[];
    humidity: string;
    duty: string;
    // Step 2: the system's primer(s) are picked first and on their own. The
    // pool is filtered only by the Step 1 parameters (substrate / humidity /
    // duty) — never by material type, because using e.g. an Epoxy primer under
    // a PU base + topcoat is a common, valid technique. Multiple primers can
    // be selected when several products match (e.g. a bonding primer + a
    // moisture-tolerant primer used together).
    primerProductIds: string[];
    // Step 3 layers: the post-primer layers (base coat, topcoat, etc). Primers
    // are intentionally NOT in this list — they live in primerProductIds. On
    // Create, each selected primer is prepended as its own layer in the order
    // it was picked.
    layers: QuickLayerSlot[];
  };
  // Skeletons exclude "Primer" — primer is picked separately in Step 2 and is
  // always prepended as layer #1 on Create. These define only the post-primer
  // layer suggestions for Step 3.
  const QUICK_SKELETONS: Record<QuickSetup['materialType'], string[]> = {
    epoxy: ['Base Coat', 'Topcoat'],
    pu: ['Body Coat', 'Topcoat'],
    polyurea: ['Polyurea Coat'],
    acrylic: ['Acrylic Coat', 'Sealer'],
    generic: ['Main Coat'],
  };

  // Map a layer-skeleton slot name (e.g. "Primer", "Base Coat", "Topcoat",
  // "Sealer", "Body Coat") to the canonical layer_position value used by the
  // qualification engine. This is what makes Step 3 actually filter different
  // products into different layer slots: each layer infers its own position
  // and only products tagged for that position are suggested.
  //
  // Returns null when the slot name doesn't clearly map to one of the five
  // canonical values — in that case Step 3 falls back to no per-layer
  // filtering for that slot (better to show too many than to show zero).
  const inferLayerPositionFromSlotName = (slotName: string): string | null => {
    const n = (slotName || '').toLowerCase().trim();
    if (!n) return null;
    if (/\bprimer\b|\bbond(?:ing)?\b/.test(n)) return 'primer';
    if (/\btop\s*coat\b|\bsealer\b|\bfinish\b|\bclear\s*coat\b/.test(n)) return 'topcoat';
    if (/\bintermediate\b|\bbuild\s*coat\b/.test(n)) return 'intermediate';
    if (/\bbase\s*coat\b|\bbody\s*coat\b|\bscratch\s*coat\b|\bself.?level/.test(n)) return 'base_coat';
    // Material-named generic coat slots like "Polyurea Coat", "Epoxy Coat",
    // "PU Coat", "Acrylic Coat" — these sit above the primer the user picks
    // in Step 2, so they're effectively base coats. Mirrors the engine's
    // smart "coat-without-position-qualifier → base_coat" rule and keeps
    // the layer pill visible so the user understands the filtering.
    if (/\b(polyurea|epoxy|pu|polyurethane|acrylic)\s+coat\b/.test(n)) return 'base_coat';
    return null;
  };

  // Material-type → keyword regex map. Used by Step 3 of the wizard to make
  // sure that when the user picks the "PU" skeleton in Step 2, only
  // PU/Polyurethane products show up under each layer slot — never an Epoxy
  // primer. Keywords are matched against the product's full taxonomy path
  // (sector > category > subcategory > group names) AND the product name.
  // 'generic' intentionally has no filter so it serves as the "any material"
  // escape hatch.
  //
  // 'pu' must be word-boundary-matched (\bpu\b) so it doesn't accidentally
  // match the middle of unrelated words like "Pump" or "Pure".
  const MATERIAL_KEYWORDS: Record<QuickSetup['materialType'], RegExp | null> = {
    epoxy: /\bepoxy\b|\bepox\b/i,
    pu: /\bpu\b|\bpolyurethane\b/i,
    polyurea: /\bpolyurea\b/i,
    acrylic: /\bacrylic\b/i,
    generic: null,
  };
  const [quickSetup, setQuickSetup] = useState<QuickSetup>({
    name: '',
    materialType: 'epoxy',
    substrate: [],
    humidity: '',
    duty: '',
    primerProductIds: [],
    layers: QUICK_SKELETONS.epoxy.map(n => ({ name: n, productId: null })),
  });
  // Map the wizard's lowercase materialType to canonical system-type labels.
  // Used as the engine's `systemType` context value in Step 3 so a PU-
  // skeleton wizard surfaces only PU/Polyurethane products in each slot.
  // 'generic' returns null so the engine doesn't filter by material at all.
  const QUICK_MATERIAL_TO_SYSTEM_TYPE: Record<QuickSetup['materialType'], string | null> = {
    epoxy: 'Epoxy', pu: 'PU', polyurea: 'Polyurea', acrylic: 'Acrylic', generic: null,
  };
  const [showAddLayer, setShowAddLayer] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [editingLayer, setEditingLayer] = useState<string | null>(null);
  const [editingOption, setEditingOption] = useState<string | null>(null);
  const [newSystemForm, setNewSystemForm] = useState({ name: '', description: '', typicalUses: '', sectorMapping: [] as string[] });
  const [sectorInput, setSectorInput] = useState('');
  const [newLayerForm, setNewLayerForm] = useState({ layerName: '', notes: '' });
  const [productSearch, setProductSearch] = useState('');
  const [editLayerForm, setEditLayerForm] = useState({ layerName: '', notes: '' });
  const [editBenefit, setEditBenefit] = useState('');
  const [draggedLayerIdx, setDraggedLayerIdx] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [duplicatingSystemId, setDuplicatingSystemId] = useState<string | null>(null);
  const [editingSystemId, setEditingSystemId] = useState<string | null>(null);
  const [editSystemForm, setEditSystemForm] = useState({ name: '', description: '', typicalUses: '', sectorMapping: [] as string[] });
  const [editSectorInput, setEditSectorInput] = useState('');

  // ---------- Phase 3: parameter-aware filtering state ----------
  // Vocab options for the substrate / humidity / duty dropdowns. Loaded once.
  const [vocab, setVocab] = useState<{ substrate: { value: string; label: string }[]; humidity: { value: string; label: string }[]; duty: { value: string; label: string }[] }>({ substrate: [], humidity: [], duty: [] });
  // Map of productId -> qualification tag for system-ready products. Used to
  // filter the layer product search by substrate / humidity / duty.
  const [tagsByProduct, setTagsByProduct] = useState<Record<string, { substrateTypes?: string[] | null; humidityTolerance?: string | null; dutyRating?: string | null; isSystemReady?: boolean | null; layerPosition?: string | null }>>({});
  // Whether the parameter header is expanded (true by default for visibility).
  const [paramHeaderOpen, setParamHeaderOpen] = useState(true);
  // Tracks per-system-session in-flight save state for the parameter header.
  const [savingParams, setSavingParams] = useState(false);
  // Per-product-search session toggle to bypass the smart filter and show all products.
  const [showAllProductsInSearch, setShowAllProductsInSearch] = useState(false);
  // Tracks which sector chip's substrate override editor is open (sector name or null).
  const [editingSectorOverride, setEditingSectorOverride] = useState<string | null>(null);
  // When more than one sector has a substrate override, the user can pick one
  // as the "active" sector context for the next product search.
  const [activeSectorContext, setActiveSectorContext] = useState<string | null>(null);

  useEscapeKey(showHistory ? () => setShowHistory(false) : null);
  useEscapeKey(detailsProduct ? () => setDetailsProduct(null) : null);

  // Build a one-time map of "productId -> lowercased searchable string"
  // composed of the product's full taxonomy path plus its own name. The
  // wizard's Step 3 material-type filter (epoxy / pu / polyurea / acrylic)
  // matches against this string with a word-boundary regex, so that picking
  // "PU" only suggests products living under a PU/Polyurethane node or whose
  // own name contains the keyword. Re-computed only when products or the
  // taxonomy actually change.
  const productMaterialPath = useMemo(() => {
    const nodeById = new Map<string, TreeNode>();
    for (const n of treeNodes) nodeById.set(n.id, n);
    const result: Record<string, string> = {};
    for (const p of products) {
      const parts: string[] = [];
      let cur: TreeNode | undefined = nodeById.get(p.nodeId);
      // Defensive depth guard against accidental cycles in the taxonomy.
      let depth = 0;
      while (cur && depth < 50) {
        parts.push(cur.name);
        cur = cur.parentId ? nodeById.get(cur.parentId) : undefined;
        depth++;
      }
      // Include the product name + supplier so a brand-named product like
      // "EpoFloor 200" still matches even if its taxonomy node is generic.
      parts.push(p.name || '', p.supplier || '');
      result[p.id] = parts.join(' ').toLowerCase();
    }
    return result;
  }, [products, treeNodes]);

  // Load qualification vocabularies (substrate / humidity / duty). We re-fetch
  // whenever the selected system changes so we always run in an authenticated
  // context — the initial mount can fire before the user has logged in, and a
  // single failed fetch must not leave the dropdowns permanently empty.
  useEffect(() => {
    let cancelled = false;
    // Skip the no-auth pre-login mount so we don't pollute logs; the effect
    // will re-run as soon as a system is opened.
    if (!localStorage.getItem('auth_token') && !selectedSystemId) return;
    (async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch('/api/qualification-vocabularies', { headers });
        if (!res.ok) return;
        // Backend returns a grouped object keyed by vocabType, e.g.
        //   { substrate: [{ value, label, ... }], humidity: [...], duty: [...], finish: [...] }
        // Each entry already has value + label fields we need.
        const grouped: Record<string, Array<{ value: string; label: string; isActive?: boolean | null }>> = await res.json();
        if (cancelled) return;
        const pickActive = (arr?: Array<{ value: string; label: string; isActive?: boolean | null }>) =>
          (arr || []).filter(o => o.isActive !== false).map(o => ({ value: o.value, label: o.label }));
        setVocab({
          substrate: pickActive(grouped.substrate),
          humidity: pickActive(grouped.humidity),
          duty: pickActive(grouped.duty),
        });
      } catch (err) {
        console.error('Failed to load qualification vocabularies:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSystemId]);

  // Set of product IDs that exist in the Primer Library (active rows only).
  // Used by the Fixed-mode product picker to restrict the pool to library
  // primers when the active slot is a primer slot — that way the user's
  // curated Primer Library acts as the authoritative source for primer
  // selection in BOTH adaptive and fixed modes. Empty Set means "library
  // not loaded yet" — picker falls back to the full pool to avoid
  // accidentally hiding everything during the initial load race.
  const [primerLibraryProductIds, setPrimerLibraryProductIds] = useState<Set<string>>(new Set());
  // Authoritative tags from the Primer Library, keyed by productId. For the
  // primer slot, we prefer these over product_qualification_tags so the
  // smart-filter humidity/duty rules use the user-curated values from the
  // library rather than potentially-stale qualification rows.
  const [primerLibraryTagsByProduct, setPrimerLibraryTagsByProduct] = useState<Record<string, { humidityTolerance?: string | null; dutyRating?: string | null; substrateTypes?: string[] | null; layerPosition?: string | null }>>({});
  const refreshPrimerLibrary = useCallback(async () => {
    try {
      const rows: PrimerLibraryEntry[] = await primerLibraryApi.list();
      const active = (rows || []).filter(r => r.isActive);
      setPrimerLibraryProductIds(new Set(active.map(r => r.productId)));
      const tagMap: Record<string, { humidityTolerance?: string | null; dutyRating?: string | null; substrateTypes?: string[] | null; layerPosition?: string | null }> = {};
      for (const r of active) {
        tagMap[r.productId] = {
          humidityTolerance: (r as any).humidityTolerance ?? null,
          dutyRating: (r as any).dutyRating ?? null,
          substrateTypes: (r as any).compatibleSubstrates ?? null,
          layerPosition: (r as any).layerPosition ?? 'primer',
        };
      }
      setPrimerLibraryTagsByProduct(tagMap);
    } catch (err) {
      console.error('Failed to load primer library:', err);
    }
  }, []);

  // Load qualification tags for all system-ready products so the smart filter
  // can run client-side. Re-fetched whenever the selected system changes OR
  // the Quick Setup wizard opens — so a product that was just tagged in the
  // Qualification tab is immediately visible in the wizard's primer / per-layer
  // pickers without a hard refresh.
  const refreshQualificationTags = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/qualification-tags', { headers });
      if (!res.ok) return;
      const rows: Array<{ productId: string; substrateTypes?: string[] | null; humidityTolerance?: string | null; dutyRating?: string | null; isSystemReady?: boolean | null; layerPosition?: string | null }> = await res.json();
      const map: Record<string, typeof rows[number]> = {};
      for (const r of rows) map[r.productId] = r;
      setTagsByProduct(map);
    } catch (err) {
      console.error('Failed to load qualification tags:', err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await Promise.all([refreshQualificationTags(), refreshPrimerLibrary()]);
    })();
    return () => { cancelled = true; };
  }, [selectedSystemId, refreshQualificationTags, refreshPrimerLibrary]);

  // Compute the effective substrate list to filter by, given precedence:
  //   layerSubstrateOverride > activeSectorContext override > systemSubstrate
  // Returns an array of substrate strings. Empty array = "no substrate
  // constraint" (any product passes the substrate hard exclusion).
  //
  // Layer + sector overrides are single-string values today (the override
  // pickers don't multi-select); we wrap them in a one-element array so
  // every downstream consumer can treat the result as a list.
  const getEffectiveSubstrate = useCallback((layerOverride?: string | null): string[] => {
    if (layerOverride) return [layerOverride];
    const overrides = (fullSystem?.sectorOverrides || {}) as Record<string, { substrateOverride?: string | null }>;
    if (activeSectorContext && overrides[activeSectorContext]?.substrateOverride) {
      return [overrides[activeSectorContext]!.substrateOverride!];
    }
    const overrideSectors = Object.entries(overrides).filter(([_, v]) => v && v.substrateOverride);
    if (!activeSectorContext && overrideSectors.length === 1) {
      const only = overrideSectors[0][1] as { substrateOverride?: string | null };
      if (only.substrateOverride) return [only.substrateOverride];
    }
    return substratesAsArray(fullSystem?.systemSubstrate as string[] | string | null | undefined);
  }, [fullSystem, activeSectorContext]);

  const loadSystems = useCallback(async () => {
    try {
      const data = await systemsApi.getSystems();
      setSystems(data);
    } catch (err) {
      console.error('Failed to load systems:', err);
    }
  }, []);

  const loadSectors = useCallback(async () => {
    try {
      const data = await systemsApi.getSectors();
      setSectors(data);
    } catch (err) {
      console.error('Failed to load sectors:', err);
    }
  }, []);

  const loadFullSystem = useCallback(async (systemId: string) => {
    setLoading(true);
    try {
      const data = await systemsApi.getSystemFull(systemId);
      setFullSystem(data);
    } catch (err) {
      console.error('Failed to load full system:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSystems();
    loadSectors();
  }, [loadSystems, loadSectors]);

  useEffect(() => {
    if (selectedSystemId) {
      loadFullSystem(selectedSystemId);
    } else {
      setFullSystem(null);
    }
  }, [selectedSystemId, loadFullSystem]);

  const handleAddSector = () => {
    const trimmed = sectorInput.trim();
    if (trimmed && !newSystemForm.sectorMapping.includes(trimmed)) {
      setNewSystemForm({ ...newSystemForm, sectorMapping: [...newSystemForm.sectorMapping, trimmed] });
    }
    setSectorInput('');
  };

  const handleRemoveSector = (sector: string) => {
    setNewSystemForm({ ...newSystemForm, sectorMapping: newSystemForm.sectorMapping.filter(s => s !== sector) });
  };

  const handleCreateSystem = async () => {
    if (!newSystemForm.name.trim()) return;
    try {
      await systemsApi.createSystem(newSystemForm);
      setNewSystemForm({ name: '', description: '', typicalUses: '', sectorMapping: [] });
      setSectorInput('');
      setShowCreateSystem(false);
      await loadSystems();
    } catch (err) {
      console.error('Failed to create system:', err);
    }
  };

  const handleDeleteSystem = async (systemId: string) => {
    if (!confirm('Delete this system and all its layers?')) return;
    try {
      await systemsApi.deleteSystem(systemId);
      if (selectedSystemId === systemId) {
        setSelectedSystemId(null);
        setFullSystem(null);
      }
      await loadSystems();
    } catch (err) {
      console.error('Failed to delete system:', err);
    }
  };

  const handleStartEditSystem = (sys: SystemData) => {
    setEditingSystemId(sys.systemId);
    setEditSystemForm({
      name: sys.name,
      description: sys.description || '',
      typicalUses: (sys as any).typicalUses || '',
      sectorMapping: sys.sectorMapping || [],
    });
    setEditSectorInput('');
    // Cancel create form if open
    setShowCreateSystem(false);
  };

  const handleAddEditSector = () => {
    const trimmed = editSectorInput.trim();
    if (trimmed && !editSystemForm.sectorMapping.includes(trimmed)) {
      setEditSystemForm({ ...editSystemForm, sectorMapping: [...editSystemForm.sectorMapping, trimmed] });
    }
    setEditSectorInput('');
  };

  const handleRemoveEditSector = (sector: string) => {
    setEditSystemForm({ ...editSystemForm, sectorMapping: editSystemForm.sectorMapping.filter(s => s !== sector) });
  };

  const handleSaveSystemEdit = async () => {
    if (!editingSystemId || !editSystemForm.name.trim()) return;
    try {
      await systemsApi.updateSystem(editingSystemId, {
        name: editSystemForm.name.trim(),
        description: editSystemForm.description,
        typicalUses: editSystemForm.typicalUses,
        sectorMapping: editSystemForm.sectorMapping,
      });
      setEditingSystemId(null);
      await loadSystems();
      // Refresh full system data if the edited system is currently open
      if (selectedSystemId === editingSystemId) {
        await loadFullSystem(editingSystemId);
      }
    } catch (err) {
      console.error('Failed to update system:', err);
      alert('Failed to update the system. Please try again.');
    }
  };

  const handleDuplicateSystem = async (systemId: string, originalName: string) => {
    // Guard against repeated clicks creating multiple copies
    if (duplicatingSystemId) return;
    setDuplicatingSystemId(systemId);

    let newSystemId: string | null = null;
    try {
      // Fetch the full source system (with layers and product options)
      const source = await systemsApi.getSystemFull(systemId);

      // Create the new system with " (Copy)" suffix
      const newSystem = await systemsApi.createSystem({
        name: `${originalName} (Copy)`,
        description: source.description || '',
        typicalUses: source.typicalUses || '',
        sectorMapping: source.sectorMapping || [],
      });
      newSystemId = newSystem.systemId;

      // Carry over the system-level installable-spec totals so the duplicate
      // genuinely matches the source (otherwise duplicating loses thickness).
      // updateSystem accepts nullable numbers; passing the source values
      // through unchanged also covers the "both null" case as a no-op patch.
      if (source.totalThicknessMinMm != null || source.totalThicknessMaxMm != null) {
        await systemsApi.updateSystem(newSystem.systemId, {
          totalThicknessMinMm: source.totalThicknessMinMm ?? null,
          totalThicknessMaxMm: source.totalThicknessMaxMm ?? null,
        });
      }

      // Recreate every layer and its product options preserving order.
      // We pass orderSequence explicitly so the duplicate keeps the same
      // visual order as the source (server defaults this to 0, which would
      // collapse all layers into the same position otherwise).
      const layers = source.layers || [];
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        const newLayer = await systemsApi.createLayer({
          systemId: newSystem.systemId,
          layerName: layer.layerName,
          notes: layer.notes || '',
          orderSequence: layer.orderSequence ?? i,
        });

        // Copy the per-layer installable-spec values into the duplicate. We
        // update rather than pass on create because createLayer's typed
        // signature is intentionally narrow; a follow-up updateLayer is the
        // single shared write path for all spec fields and keeps the API
        // surface tight. Skipped entirely when the source layer has nothing
        // spec'd to avoid a noop network round-trip.
        const hasSpec =
          layer.consumptionRateKgM2 != null ||
          layer.dftMicrons != null ||
          layer.recoatMinHours != null ||
          layer.recoatMaxHours != null;
        if (hasSpec) {
          await systemsApi.updateLayer(newLayer.layerId, {
            consumptionRateKgM2: layer.consumptionRateKgM2 ?? null,
            dftMicrons: layer.dftMicrons ?? null,
            recoatMinHours: layer.recoatMinHours ?? null,
            recoatMaxHours: layer.recoatMaxHours ?? null,
          });
        }

        for (const opt of layer.productOptions || []) {
          await systemsApi.addProductOption({
            layerId: newLayer.layerId,
            productId: opt.productId,
            benefit: opt.benefit || '',
            isDefault: opt.isDefault || false,
          });
        }
      }

      await loadSystems();
      setSelectedSystemId(newSystem.systemId);
    } catch (err) {
      console.error('Failed to duplicate system:', err);
      // Best-effort cleanup so we don't leave a half-built duplicate behind
      if (newSystemId) {
        try {
          await systemsApi.deleteSystem(newSystemId);
        } catch (cleanupErr) {
          console.error('Failed to clean up partial duplicate:', cleanupErr);
        }
      }
      alert('Failed to duplicate the system. Please try again.');
    } finally {
      setDuplicatingSystemId(null);
    }
  };

  const handleAddLayer = async () => {
    if (!selectedSystemId || !newLayerForm.layerName.trim()) return;
    try {
      const orderSequence = fullSystem?.layers?.length || 0;
      await systemsApi.createLayer({
        systemId: selectedSystemId,
        layerName: newLayerForm.layerName,
        orderSequence,
        notes: newLayerForm.notes,
      });
      setNewLayerForm({ layerName: '', notes: '' });
      setShowAddLayer(false);
      await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to add layer:', err);
    }
  };

  const handleUpdateLayer = async (layerId: string) => {
    try {
      await systemsApi.updateLayer(layerId, editLayerForm);
      setEditingLayer(null);
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to update layer:', err);
    }
  };

  const handleDeleteLayer = async (layerId: string) => {
    if (!confirm('Delete this layer and all its product assignments?')) return;
    try {
      await systemsApi.deleteLayer(layerId);
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to delete layer:', err);
    }
  };

  const handleAddProductToLayer = async (layerId: string, productId: string) => {
    try {
      await systemsApi.addProductOption({ layerId, productId, benefit: '', isDefault: false });
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to add product:', err);
    }
  };

  const handleAddSelectedProductsToLayer = async (layerId: string) => {
    if (selectedProductIds.length === 0) return;
    try {
      for (const productId of selectedProductIds) {
        await systemsApi.addProductOption({ layerId, productId, benefit: '', isDefault: false });
      }
      setSelectedProductIds([]);
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to add selected products:', err);
    }
  };

  // Toggle a product's default flag for its layer. Enforces the rule that
  // only ONE product per layer may be marked default at a time:
  //   - If we're pinning (current === false), unset every other option in
  //     the same layer first, then set this one true, then write the chosen
  //     productId back to the layer's defaultProductId column for direct
  //     querying without joining through system_product_options.
  //   - If we're unpinning (current === true), just clear this option and
  //     null out the layer's defaultProductId.
  const handleToggleDefault = async (optionId: string, current: boolean) => {
    try {
      const layer = fullSystem?.layers.find(l => l.productOptions.some(o => o.optionId === optionId));
      const target = layer?.productOptions.find(o => o.optionId === optionId);
      if (!current && layer) {
        // Unset every other already-default option in this layer in parallel.
        const others = layer.productOptions.filter(o => o.optionId !== optionId && o.isDefault);
        await Promise.all(others.map(o => systemsApi.updateProductOption(o.optionId, { isDefault: false })));
        await systemsApi.updateProductOption(optionId, { isDefault: true });
        if (target) await systemsApi.updateLayer(layer.layerId, { defaultProductId: target.productId });
      } else {
        await systemsApi.updateProductOption(optionId, { isDefault: false });
        if (layer) await systemsApi.updateLayer(layer.layerId, { defaultProductId: null });
      }
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to toggle default:', err);
    }
  };

  // Save the system-level parameter header values (substrate / humidity /
  // duty / total thickness range). All fields are nullable — pass null to
  // clear an individual field.
  const handleSaveSystemParams = async (patch: {
    // Array of substrate vocabulary values. Pass null (or empty array) to
    // clear; pass an array to set / replace the current selection.
    systemSubstrate?: string[] | null;
    systemHumidity?: string | null;
    systemDuty?: string | null;
    totalThicknessMinMm?: number | null;
    totalThicknessMaxMm?: number | null;
  }) => {
    if (!selectedSystemId) return;
    setSavingParams(true);
    try {
      await systemsApi.updateSystem(selectedSystemId, patch);
      await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to save system parameters:', err);
    } finally {
      setSavingParams(false);
    }
  };

  // Save one or more installable-spec fields on a single layer. Mirrors
  // the system-params handler: optimistic-free, refresh-after-save so the
  // displayed values are always the server's truth. Nulls clear the field.
  const handleSaveLayerSpec = async (
    layerId: string,
    patch: Partial<{
      consumptionRateKgM2: number | null;
      dftMicrons: number | null;
      recoatMinHours: number | null;
      recoatMaxHours: number | null;
    }>
  ) => {
    if (!selectedSystemId) return;
    try {
      await systemsApi.updateLayer(layerId, patch);
      await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to save layer spec:', err);
    }
  };

  // ---------- Phase 4: conflict detection (display-only) ----------
  // Compute the list of qualification conflicts for a given product against
  // the active system parameters. Returns one of:
  //   { kind: 'unqualified' }                  → product has no qualification tag
  //   { kind: 'conflicts', messages: string[] }→ one or more parameter mismatches
  //   { kind: 'ok' }                           → product is qualified and matches
  // When the system has zero parameters configured, every product is treated as
  // 'ok' (nothing to conflict against) so legacy systems show no warning chrome.
  type ConflictReport = { kind: 'unqualified' } | { kind: 'conflicts'; messages: string[] } | { kind: 'ok' };
  const getProductConflicts = useCallback((productId: string, layer?: { layerSubstrateOverride?: string | null }): ConflictReport => {
    // Inline computation of "any param set" — avoids forward reference to the
    // memoized systemHasAnyParams which is declared later in the component.
    const hasParams = !!(fullSystem && (
      substratesAsArray(fullSystem.systemSubstrate as string[] | string | null | undefined).length > 0 ||
      fullSystem.systemHumidity || fullSystem.systemDuty ||
      Object.values((fullSystem.sectorOverrides || {}) as Record<string, { substrateOverride?: string | null }>).some(o => o?.substrateOverride) ||
      fullSystem.layers.some(l => l.layerSubstrateOverride)
    ));
    if (!fullSystem || !hasParams) return { kind: 'ok' };
    const tag = tagsByProduct[productId];
    if (!tag) return { kind: 'unqualified' };
    if (!tag.isSystemReady) return { kind: 'unqualified' };
    const messages: string[] = [];
    const expectedSubstrates = getEffectiveSubstrate(layer?.layerSubstrateOverride);
    if (expectedSubstrates.length > 0) {
      const subs = tag.substrateTypes || [];
      // ANY-overlap rule (Problem 2): a product passes if its substrate list
      // shares at least one value with the system's substrate list. Products
      // with no substrate tag are not flagged as a conflict here — they're
      // flagged as 'unqualified' upstream when no tag exists at all.
      const overlap = subs.filter(s => expectedSubstrates.includes(s));
      if (subs.length > 0 && overlap.length === 0) {
        const have = subs.join(', ');
        const want = expectedSubstrates.join(' / ');
        messages.push(`Substrate mismatch: product is for ${have}, system is configured for ${want}`);
      }
    }
    // Humidity / duty: a system-required parameter that the product does not
    // declare (or declares differently) is treated as a mismatch — a missing
    // tag value is just as suspect as a wrong one.
    if (fullSystem.systemHumidity && tag.humidityTolerance !== fullSystem.systemHumidity) {
      messages.push(`Humidity mismatch: product rated for ${tag.humidityTolerance || '—'}, system requires ${fullSystem.systemHumidity}`);
    }
    if (fullSystem.systemDuty && tag.dutyRating !== fullSystem.systemDuty) {
      messages.push(`Duty mismatch: product rated ${tag.dutyRating || '—'}, system requires ${fullSystem.systemDuty}`);
    }
    return messages.length ? { kind: 'conflicts', messages } : { kind: 'ok' };
  }, [fullSystem, tagsByProduct, getEffectiveSubstrate]);

  // ---------- Phase 4: system health summary ----------
  // Aggregate conflict and qualification stats across every layer and product.
  // Used by the right-side preview panel and the legend below the layer list.
  // All computation is purely client-side — no API calls.
  const systemHealth = React.useMemo(() => {
    if (!fullSystem) return { conflictCount: 0, unqualifiedCount: 0, totalProducts: 0, defaultCoverage: 0, totalLayers: 0, firstConflictLayerId: null as string | null, status: 'green' as 'green' | 'amber' | 'red' };
    let conflictCount = 0;
    let unqualifiedCount = 0;
    let totalProducts = 0;
    let firstConflictLayerId: string | null = null;
    for (const layer of fullSystem.layers) {
      for (const opt of layer.productOptions) {
        totalProducts++;
        const c = getProductConflicts(opt.productId, layer);
        if (c.kind === 'conflicts') {
          conflictCount++;
          if (!firstConflictLayerId) firstConflictLayerId = layer.layerId;
        } else if (c.kind === 'unqualified') {
          unqualifiedCount++;
        }
      }
    }
    // A layer counts toward "default coverage" when at least one of its
    // productOptions is flagged isDefault.
    const defaultCoverage = fullSystem.layers.filter(l =>
      l.productOptions.some(o => o.isDefault)
    ).length;
    const status: 'green' | 'amber' | 'red' = conflictCount > 0 ? 'red' : (unqualifiedCount > 0 ? 'amber' : 'green');
    return { conflictCount, unqualifiedCount, totalProducts, defaultCoverage, totalLayers: fullSystem.layers.length, firstConflictLayerId, status, adaptivePrimerLayers: 0, adaptivePrimerGaps: 0 };
  }, [fullSystem, getProductConflicts]);

  // For the build-up preview: per-layer aggregates of substrate compatibility,
  // duty agreement, and system-ready ratio. Returns null when no qualification
  // data exists for any product in the layer (so the panel stays clean).
  const getLayerTechnicalSummary = useCallback((layer: { productOptions: Array<{ productId: string }> }) => {
    const tagged = layer.productOptions.map(o => tagsByProduct[o.productId]).filter(Boolean) as Array<NonNullable<typeof tagsByProduct[string]>>;
    if (tagged.length === 0) return null;
    const substrates = Array.from(new Set(tagged.flatMap(t => t.substrateTypes || []))).filter(Boolean);
    const duties = Array.from(new Set(tagged.map(t => t.dutyRating).filter(Boolean) as string[]));
    const dutyDisplay = duties.length === 0 ? null : (duties.length === 1 ? duties[0] : 'Mixed');
    const ready = tagged.filter(t => t.isSystemReady).length;
    return { substrates, dutyDisplay, ready, total: layer.productOptions.length };
  }, [tagsByProduct]);

  // Save / clear an individual sector's substrate override on the system's
  // sectorOverrides JSONB map. Passing null removes the entry entirely.
  const handleSaveSectorOverride = async (sectorName: string, substrate: string | null) => {
    if (!selectedSystemId || !fullSystem) return;
    const next = { ...(fullSystem.sectorOverrides || {}) } as Record<string, { substrateOverride?: string | null }>;
    if (substrate) next[sectorName] = { ...(next[sectorName] || {}), substrateOverride: substrate };
    else delete next[sectorName];
    try {
      await systemsApi.updateSystem(selectedSystemId, { sectorOverrides: next });
      await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to save sector override:', err);
    }
  };

  const handleUpdateBenefit = async (optionId: string) => {
    try {
      await systemsApi.updateProductOption(optionId, { benefit: editBenefit });
      setEditingOption(null);
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to update benefit:', err);
    }
  };

  const handleRemoveProduct = async (optionId: string) => {
    try {
      // If we're removing the layer's currently-pinned default, also clear
      // system_layers.defaultProductId so the column doesn't point at a
      // dangling product. Without this, layer.defaultProductId becomes stale.
      const layer = fullSystem?.layers.find(l => l.productOptions.some(o => o.optionId === optionId));
      const target = layer?.productOptions.find(o => o.optionId === optionId);
      const wasDefault = !!(target && target.isDefault);
      await systemsApi.removeProductOption(optionId);
      if (wasDefault && layer) {
        await systemsApi.updateLayer(layer.layerId, { defaultProductId: null });
      }
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to remove product:', err);
    }
  };

  const handleLayerDragStart = (idx: number) => {
    setDraggedLayerIdx(idx);
  };

  const handleLayerDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedLayerIdx === null || draggedLayerIdx === idx) return;
  };

  const handleLayerDrop = async (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggedLayerIdx === null || !fullSystem || !selectedSystemId) return;
    const layers = [...fullSystem.layers];
    const [moved] = layers.splice(draggedLayerIdx, 1);
    layers.splice(targetIdx, 0, moved);
    const layerOrder = layers.map((l) => l.layerId);
    try {
      await systemsApi.reorderLayers(selectedSystemId, layerOrder);
      await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to reorder layers:', err);
    }
    setDraggedLayerIdx(null);
  };

  const handleExport = async (format: 'json' | 'csv') => {
    if (!selectedSystemId) return;
    try {
      const result = await systemsApi.exportSystem(selectedSystemId, format);
      if (format === 'csv' && result instanceof Blob) {
        const url = URL.createObjectURL(result);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fullSystem?.name?.replace(/\s+/g, '_') || 'system'}_spec.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fullSystem?.name?.replace(/\s+/g, '_') || 'system'}_spec.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to export:', err);
    }
    setShowExportMenu(false);
  };

  const handleSnapshot = async () => {
    if (!selectedSystemId) return;
    try {
      await systemsApi.createSnapshot(selectedSystemId, { description: 'Manual snapshot' });
      alert('Version snapshot created successfully');
    } catch (err) {
      console.error('Failed to create snapshot:', err);
    }
  };

  const loadHistory = async () => {
    if (!selectedSystemId) return;
    try {
      const data = await systemsApi.getHistory(selectedSystemId);
      setHistoryEntries(data);
      setShowHistory(true);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const handleUpdateSystemStatus = async (status: string) => {
    if (!selectedSystemId) return;
    try {
      await systemsApi.updateSystem(selectedSystemId, { status });
      await loadSystems();
      if (selectedSystemId) await loadFullSystem(selectedSystemId);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const filteredSystems = systems.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ---------- Phase 3: smart slot filtering ----------
  // Determine whether the parent system has any qualification parameters set
  // (system-level OR sector-level OR layer-level). If none, the product
  // search is the legacy unfiltered behavior — full backward compatibility.
  const systemHasAnyParams = !!(
    fullSystem && (
      substratesAsArray(fullSystem.systemSubstrate as string[] | string | null | undefined).length > 0 ||
      fullSystem.systemHumidity ||
      fullSystem.systemDuty ||
      Object.values((fullSystem.sectorOverrides || {}) as Record<string, { substrateOverride?: string | null }>).some(o => o?.substrateOverride) ||
      // Layer-level overrides also count — even if no system/sector param exists,
      // a layer with its own substrate override is enough to activate filtering
      // for that specific layer's product search.
      fullSystem.layers.some(l => l.layerSubstrateOverride)
    )
  );

  // For the currently-open layer search (showAddProduct holds its layerId),
  // compute the effective filter constraints we'll apply against tagsByProduct.
  // Returns null when no smart filter applies for any reason.
  const activeLayer = showAddProduct ? fullSystem?.layers.find(l => l.layerId === showAddProduct) : null;
  const effectiveSubstrate = activeLayer ? getEffectiveSubstrate(activeLayer.layerSubstrateOverride) : null;

  // Infer the active layer's position (primer / base_coat / intermediate /
  // topcoat / standalone) from its name so the alternatives picker can refuse
  // to suggest a Primer product in a Base Coat slot, etc. Same heuristic the
  // wizard uses on slot names — keeps behaviour consistent.
  const activeLayerPos = activeLayer ? inferLayerPositionFromSlotName(activeLayer.layerName) : null;
  const activeLayerPosLabel = activeLayerPos
    ? activeLayerPos === 'base_coat'    ? 'Base Coat'
      : activeLayerPos === 'topcoat'    ? 'Topcoat'
      : activeLayerPos === 'primer'     ? 'Primer'
      : activeLayerPos === 'intermediate' ? 'Intermediate'
      : 'Standalone'
    : null;

  // Infer the system's material chemistry (epoxy / pu / polyurea / acrylic)
  // from products already chosen across all layers. We never persist
  // materialType on the system, so the most reliable source of truth is the
  // chemistry of products the user has already accepted. If every chosen
  // product matches the same material keyword, we lock the alternatives
  // picker to that material — preventing a PU coat from showing up in an
  // Epoxy system. When the system has no products yet (or mixes chemistries)
  // we leave the material filter off.
  const activeMaterialRegex = React.useMemo(() => {
    if (!fullSystem) return null;
    const ids = new Set<string>();
    for (const l of fullSystem.layers) for (const o of l.productOptions) ids.add(o.productId);
    if (ids.size === 0) return null;
    const matched: Array<keyof typeof MATERIAL_KEYWORDS> = [];
    for (const id of ids) {
      const haystack = productMaterialPath[id] || '';
      let foundAny = false;
      for (const [mat, rx] of Object.entries(MATERIAL_KEYWORDS) as Array<[keyof typeof MATERIAL_KEYWORDS, RegExp | null]>) {
        if (rx && rx.test(haystack)) { matched.push(mat); foundAny = true; break; }
      }
      // Any unclassifiable product → bail out: don't risk over-filtering.
      if (!foundAny) return null;
    }
    const uniq = Array.from(new Set(matched));
    return uniq.length === 1 ? MATERIAL_KEYWORDS[uniq[0]] : null;
  }, [fullSystem, productMaterialPath]);
  // The material name we actually locked to (for the banner). Recomputed
  // alongside the regex.
  const activeMaterialLabel = React.useMemo(() => {
    if (!activeMaterialRegex) return null;
    for (const [mat, rx] of Object.entries(MATERIAL_KEYWORDS) as Array<[keyof typeof MATERIAL_KEYWORDS, RegExp | null]>) {
      if (rx === activeMaterialRegex) {
        return mat === 'pu' ? 'PU/Polyurethane' : mat[0].toUpperCase() + mat.slice(1);
      }
    }
    return null;
  }, [activeMaterialRegex]);

  // The smart filter is now active whenever a layer is open and the user
  // hasn't opted out — we no longer require a system-level parameter,
  // because layer-position alone (e.g. "no primers in a base coat slot") is
  // a useful filter on its own.
  const smartFilterActive = !showAllProductsInSearch && !!showAddProduct;
  const filterSummary = smartFilterActive ? [
    activeLayerPosLabel ? `layer: ${activeLayerPosLabel}` : null,
    activeMaterialLabel ? `material: ${activeMaterialLabel}` : null,
    effectiveSubstrate.length > 0 ? `substrate: ${effectiveSubstrate.join(' / ')}` : null,
    fullSystem?.systemHumidity ? `humidity: ${fullSystem.systemHumidity}` : null,
    fullSystem?.systemDuty ? `duty: ${fullSystem.systemDuty}` : null,
  ].filter(Boolean).join(' · ') : '';

  // Layer product search — fully rewritten to (a) apply hard exclusions
  // based on system type / substrate / layer position, (b) split products
  // into qualified vs unqualified buckets (so we can show a divider in the
  // UI), and (c) score+sort qualified products by match quality. The
  // "Show all" toggle bypasses hard exclusions entirely (Problem 4 spec)
  // but keeps the qualified/unqualified split so the divider behaviour
  // stays consistent.
  //
  // Returns: { qualified, unqualified, scores } where `scores` is a map of
  // productId → { score, label } for the qualified tier so the row
  // renderer can show the dot without re-computing.
  const layerSearchResult = (() => {
    type ScoreEntry = { score: number; label: MatchLabel | null };
    const empty: { qualified: typeof products; unqualified: typeof products; scores: Record<string, ScoreEntry> } =
      { qualified: products, unqualified: [], scores: {} };

    // Step 0: Primer Library source restriction.
    // When the active slot is a primer slot, the user wants the picker to
    // source from their curated Primer Library rather than the entire
    // product catalogue. We treat the library as the authoritative list
    // of "what counts as a primer". Bypassed when the library hasn't
    // loaded yet, the user has "Show all" enabled, or the slot isn't a
    // primer slot.
    let pool = products;
    const sourceFromPrimerLibrary =
      activeLayerPos === 'primer' &&
      primerLibraryProductIds.size > 0 &&
      !showAllProductsInSearch;
    if (sourceFromPrimerLibrary) {
      pool = pool.filter(p => primerLibraryProductIds.has(p.id));
    }

    // Step 1: text search filter (applies in both modes).
    if (productSearch) {
      const parsed = parseSearchQuery(productSearch);
      pool = pool.filter((p) => {
        const searchableText = [p.name || '', p.stockCode || '', p.supplier || '', p.description || ''].join(' ');
        return matchesAdvancedSearch(searchableText, parsed);
      });
    }

    // When no layer is open at all, just return the text-filtered pool
    // (preserves legacy behaviour for any future caller that reads this
    // without a layer context).
    if (!showAddProduct) return { ...empty, qualified: pool };

    // System context for scoring + hard exclusions.
    const systemType = inferSystemType(fullSystem);
    const sysSubstrates = effectiveSubstrate;     // already a string[]
    const sysHumidity = fullSystem?.systemHumidity || null;
    const sysDuty = fullSystem?.systemDuty || null;
    const showAll = showAllProductsInSearch;

    // Helper: should we hard-exclude this product? Untagged products are
    // never hard-excluded — they go to the unqualified bucket instead
    // (per the spec, untagged products fall through to the scoring tier).
    // All actual rules live in the shared compatibility engine so the
    // server-side primer-library resolver and the two Quick Setup wizard
    // pickers stay in lock-step with this picker.
    const isHardExcluded = (p: typeof products[number]): boolean => {
      if (showAll) return false;
      // For the primer slot, the Primer Library entry is the source of
      // truth for humidity/duty/substrates — fall back to the general
      // qualification tag only when no library row exists for this product.
      const libTag = activeLayerPos === 'primer' ? primerLibraryTagsByProduct[p.id] : undefined;
      const baseTag = tagsByProduct[p.id];
      const tag = libTag
        ? { ...(baseTag || {}), ...libTag, isSystemReady: true }
        : baseTag;
      const haystack = productMaterialPath[p.id] || '';
      const productFamily = inferProductFamily(haystack);
      return engineIsHardExcluded(tag, {
        systemType,
        systemSubstrates: sysSubstrates,
        systemHumidity: sysHumidity,
        systemDuty: sysDuty,
        activeLayerPosition: (activeLayerPos as EngineLayerPosition | null) ?? null,
        productFamily,
      }).excluded;
    };

    // Step 2: split + hard-exclude.
    const qualified: typeof products = [];
    const unqualified: typeof products = [];
    // Resolve effective tag for a product: Primer-Library row wins for the
    // primer slot (authoritative curated data), otherwise fall back to the
    // shared product_qualification_tags row.
    const effectiveTagFor = (pid: string) => {
      const libTag = activeLayerPos === 'primer' ? primerLibraryTagsByProduct[pid] : undefined;
      const baseTag = tagsByProduct[pid];
      return libTag
        ? { ...(baseTag || {}), ...libTag, isSystemReady: true }
        : baseTag;
    };
    for (const p of pool) {
      const tag = effectiveTagFor(p.id);
      const isReady = !!tag?.isSystemReady;
      if (isReady) {
        if (!isHardExcluded(p)) qualified.push(p);
        // Tagged-but-excluded products are dropped entirely when smart
        // filter is on — the user opts in via "Show all" to see them.
      } else {
        unqualified.push(p);
      }
    }

    // Step 3: score + sort the qualified tier. Untagged / unqualified
    // products are intentionally not scored — they live in their own
    // bucket below the divider.
    const scores: Record<string, ScoreEntry> = {};
    for (const p of qualified) {
      const tag = effectiveTagFor(p.id);
      const haystack = productMaterialPath[p.id] || '';
      const productFamily = inferProductFamily(haystack);
      const score = scoreProduct(tag, productFamily, activeLayerPos, systemType, sysSubstrates, sysHumidity, sysDuty);
      const label = computeMatchLabel(score, !!tag?.isSystemReady);
      scores[p.id] = { score, label };
    }
    qualified.sort((a, b) => {
      const sa = scores[a.id]?.score ?? 0;
      const sb = scores[b.id]?.score ?? 0;
      if (sa !== sb) return sb - sa;
      return (a.name || '').localeCompare(b.name || '');
    });

    // Sort the unqualified bucket alphabetically — no score available.
    unqualified.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return { qualified, unqualified, scores };
  })();
  // Back-compat alias used by the "N matches" count + empty-state below.
  // Counts only the qualified tier so the header reflects what's above the
  // divider — unqualified products are surfaced separately.
  const filteredProducts = layerSearchResult.qualified;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-100 text-emerald-700';
      case 'draft': return 'bg-amber-100 text-amber-700';
      case 'archived': return 'bg-slate-100 text-slate-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  if (activeTab === 'analytics') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
          <div>
            <h1 className="text-xl font-bold text-slate-800">System Builder</h1>
            <div className="flex items-center gap-1 mt-2">
              <button onClick={() => setActiveTab('qualification')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center gap-1.5"><ShieldCheck size={14} />Product Qualification</button>
              <button onClick={() => setActiveTab('builder')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500">Builder</button>
              <button className="px-3 py-1 text-sm rounded-lg bg-blue-100 text-blue-700 font-medium">Analytics</button>
              <button onClick={() => setActiveTab('preview')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center gap-1.5"><Eye size={14} />System Preview</button>
              <button onClick={() => setActiveTab('library')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center gap-1.5"><Library size={14} />Primer Library</button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <SystemDashboard products={products} />
        </div>
      </div>
    );
  }

  if (activeTab === 'qualification') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
          <div>
            <h1 className="text-xl font-bold text-slate-800">System Builder</h1>
            <div className="flex items-center gap-1 mt-2">
              <button className="px-3 py-1 text-sm rounded-lg bg-blue-100 text-blue-700 font-medium inline-flex items-center gap-1.5"><ShieldCheck size={14} />Product Qualification</button>
              <button onClick={() => setActiveTab('builder')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500">Builder</button>
              <button onClick={() => setActiveTab('analytics')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500">Analytics</button>
              <button onClick={() => setActiveTab('preview')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center gap-1.5"><Eye size={14} />System Preview</button>
              <button onClick={() => setActiveTab('library')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center gap-1.5"><Library size={14} />Primer Library</button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-slate-50">
          <SystemBuilderQualification products={products} treeNodes={treeNodes} onProductUpdate={onProductUpdate} onProductEdit={onProductEdit} />
        </div>
      </div>
    );
  }

  // System Preview tab — read-only catalog grid + per-system modal preview.
  // Rendered before the default Builder block. Switching back to Builder
  // (via the modal's "Edit in Builder" button) selects the right system.
  if (activeTab === 'preview') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
          <div>
            <h1 className="text-xl font-bold text-slate-800">System Builder</h1>
            <div className="flex items-center gap-1 mt-2">
              <button onClick={() => setActiveTab('qualification')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center gap-1.5"><ShieldCheck size={14} />Product Qualification</button>
              <button onClick={() => setActiveTab('builder')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500">Builder</button>
              <button onClick={() => setActiveTab('analytics')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500">Analytics</button>
              <button className="px-3 py-1 text-sm rounded-lg bg-blue-100 text-blue-700 font-medium inline-flex items-center gap-1.5"><Eye size={14} />System Preview</button>
              <button onClick={() => setActiveTab('library')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center gap-1.5"><Library size={14} />Primer Library</button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <SystemBuilderPreview
            onEditInBuilder={(systemId) => {
              setSelectedSystemId(systemId);
              setActiveTab('builder');
            }}
          />
        </div>
      </div>
    );
  }

  // Primer Library tab — standalone editor for the shared primer library
  // that adaptive primer slots resolve against. Reachable from every other
  // tab via the Library button in the nav row.
  if (activeTab === 'library') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
          <div>
            <h1 className="text-xl font-bold text-slate-800">System Builder</h1>
            <div className="flex items-center gap-1 mt-2">
              <button onClick={() => setActiveTab('qualification')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center gap-1.5"><ShieldCheck size={14} />Product Qualification</button>
              <button onClick={() => setActiveTab('builder')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500">Builder</button>
              <button onClick={() => setActiveTab('analytics')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500">Analytics</button>
              <button onClick={() => setActiveTab('preview')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center gap-1.5"><Eye size={14} />System Preview</button>
              <button className="px-3 py-1 text-sm rounded-lg bg-blue-100 text-blue-700 font-medium inline-flex items-center gap-1.5"><Library size={14} />Primer Library</button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-slate-50">
          <PrimerLibrary products={products} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-slate-800">System Builder</h1>
          <div className="flex items-center gap-1 mt-2">
            <button onClick={() => setActiveTab('qualification')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center gap-1.5"><ShieldCheck size={14} />Product Qualification</button>
            <button className="px-3 py-1 text-sm rounded-lg bg-blue-100 text-blue-700 font-medium">Builder</button>
            <button onClick={() => setActiveTab('analytics')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500">Analytics</button>
            <button onClick={() => setActiveTab('preview')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center gap-1.5"><Eye size={14} />System Preview</button>
            <button onClick={() => setActiveTab('library')} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center gap-1.5"><Library size={14} />Primer Library</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedSystemId && (
            <>
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <Download size={14} /> Export
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 w-40">
                    <button onClick={() => handleExport('json')} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                      <FileJson size={14} /> JSON
                    </button>
                    <button onClick={() => handleExport('csv')} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                      <FileSpreadsheet size={14} /> CSV
                    </button>
                  </div>
                )}
              </div>
              <button onClick={handleSnapshot} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
                <Copy size={14} /> Snapshot
              </button>
              <button onClick={loadHistory} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
                <History size={14} /> History
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* LEFT PANEL - System List */}
        <div className="w-72 border-r border-slate-200 bg-slate-50 flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search systems..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <button
                onClick={() => {
                  // Phase 4: open Quick Setup wizard. Reset to a fresh state so
                  // it always starts on Step 1 with the default skeleton.
                  setQuickSetup({ name: '', materialType: 'epoxy', substrate: [], humidity: '', duty: '', primerProductIds: [], layers: QUICK_SKELETONS.epoxy.map(n => ({ name: n, productId: null })) });
                  setQuickStep(1);
                  setQuickSetupOpen(true);
                  // Pull the latest qualification tags so any product the user
                  // just tagged (e.g. set Layer Position = Primer) shows up
                  // immediately in Step 2 / Step 4 without a hard refresh.
                  refreshQualificationTags();
                }}
                className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                title="Quick Setup wizard (parameter-based new system)"
              >
                <Sparkles size={16} />
              </button>
              <button
                onClick={() => setShowCreateSystem(true)}
                className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title="Create New System"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {editingSystemId && (
            <div className="p-3 border-b border-slate-200 bg-amber-50">
              <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-2">Edit System</div>
              <input
                type="text"
                placeholder="System name"
                value={editSystemForm.name}
                onChange={(e) => setEditSystemForm({ ...editSystemForm, name: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:ring-2 focus:ring-amber-500 outline-none"
                autoFocus
              />
              <textarea
                placeholder="Description (optional)"
                value={editSystemForm.description}
                onChange={(e) => setEditSystemForm({ ...editSystemForm, description: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                rows={2}
              />
              <input
                type="text"
                placeholder="Typical uses (optional)"
                value={editSystemForm.typicalUses}
                onChange={(e) => setEditSystemForm({ ...editSystemForm, typicalUses: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:ring-2 focus:ring-amber-500 outline-none"
              />
              <div className="mb-2">
                <div className="flex items-center gap-1 mb-1">
                  <input
                    type="text"
                    placeholder="Add sector (e.g. Flooring, Roofing)"
                    value={editSectorInput}
                    onChange={(e) => setEditSectorInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddEditSector(); } }}
                    className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                  <button type="button" onClick={handleAddEditSector} className="px-2 py-1.5 text-sm bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300">
                    <Plus size={14} />
                  </button>
                </div>
                {editSystemForm.sectorMapping.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {editSystemForm.sectorMapping.map(sec => (
                      <span key={sec} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                        {sec}
                        <button onClick={() => handleRemoveEditSector(sec)} className="hover:text-red-500"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveSystemEdit} className="flex-1 px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700">Save</button>
                <button onClick={() => setEditingSystemId(null)} className="px-3 py-1.5 text-sm bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300">Cancel</button>
              </div>
            </div>
          )}

          {showCreateSystem && (
            <div className="p-3 border-b border-slate-200 bg-blue-50">
              <input
                type="text"
                placeholder="System name"
                value={newSystemForm.name}
                onChange={(e) => setNewSystemForm({ ...newSystemForm, name: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:ring-2 focus:ring-blue-500 outline-none"
                autoFocus
              />
              <textarea
                placeholder="Description (optional)"
                value={newSystemForm.description}
                onChange={(e) => setNewSystemForm({ ...newSystemForm, description: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                rows={2}
              />
              <input
                type="text"
                placeholder="Typical uses (optional)"
                value={newSystemForm.typicalUses}
                onChange={(e) => setNewSystemForm({ ...newSystemForm, typicalUses: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <div className="mb-2">
                <div className="flex items-center gap-1 mb-1">
                  <input
                    type="text"
                    placeholder="Add sector (e.g. Flooring, Roofing)"
                    value={sectorInput}
                    onChange={(e) => setSectorInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSector(); } }}
                    className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button type="button" onClick={handleAddSector} className="px-2 py-1.5 text-sm bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300">
                    <Plus size={14} />
                  </button>
                </div>
                {newSystemForm.sectorMapping.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {newSystemForm.sectorMapping.map(sec => (
                      <span key={sec} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                        {sec}
                        <button onClick={() => handleRemoveSector(sec)} className="hover:text-red-500"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreateSystem} className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
                <button onClick={() => setShowCreateSystem(false)} className="px-3 py-1.5 text-sm bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300">Cancel</button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {filteredSystems.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-sm">
                {searchTerm ? 'No systems match your search' : 'No systems yet. Create your first system to get started.'}
              </div>
            )}
            {filteredSystems.map((sys) => (
              <div
                key={sys.systemId}
                onClick={() => setSelectedSystemId(sys.systemId)}
                className={`group px-3 py-2.5 border-b border-slate-100 cursor-pointer transition-colors ${
                  selectedSystemId === sys.systemId ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-slate-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-700 truncate">{sys.name}</span>
                    </div>
                    {sys.description && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate pl-5">{sys.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 pl-5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getStatusColor(sys.status)}`}>
                        {sys.status}
                      </span>
                      <span className="text-[10px] text-slate-400">v{sys.version}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStartEditSystem(sys); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded transition-all"
                      title="Edit system details"
                    >
                      <Edit size={13} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDuplicateSystem(sys.systemId, sys.name); }}
                      disabled={duplicatingSystemId !== null}
                      className={`p-1 rounded transition-all ${
                        duplicatingSystemId === sys.systemId
                          ? 'opacity-100 text-blue-500'
                          : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500 hover:bg-blue-50'
                      } ${duplicatingSystemId && duplicatingSystemId !== sys.systemId ? 'cursor-not-allowed' : ''}`}
                      title={duplicatingSystemId === sys.systemId ? 'Duplicating…' : 'Duplicate this system'}
                    >
                      {duplicatingSystemId === sys.systemId ? (
                        <div className="w-[13px] h-[13px] border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSystem(sys.systemId); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                      title="Delete this system"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER PANEL - Layer Editor */}
        <div className="flex-1 overflow-y-auto bg-white">
          {!selectedSystemId ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Layers size={48} className="mb-3 opacity-50" />
              <p className="text-lg font-medium">Select a System</p>
              <p className="text-sm mt-1">Choose a system from the left panel or create a new one</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          ) : fullSystem ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{fullSystem.name}</h2>
                  {fullSystem.description && <p className="text-sm text-slate-500 mt-0.5">{fullSystem.description}</p>}
                  {fullSystem.typicalUses && <p className="text-xs text-slate-400 mt-0.5">Uses: {fullSystem.typicalUses}</p>}
                  {(() => {
                    const mapping = fullSystem.sectorMapping as string[] | undefined;
                    const overrides = (fullSystem.sectorOverrides || {}) as Record<string, { substrateOverride?: string | null }>;
                    return Array.isArray(mapping) && mapping.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {mapping.map(sec => {
                          const override = overrides[sec]?.substrateOverride || null;
                          const isOpen = editingSectorOverride === sec;
                          return (
                          <span key={sec} className="relative inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-indigo-50 text-indigo-600 rounded-full font-medium">
                            {sec}
                            {override && (
                              <span className="px-1 py-0.5 text-[9px] bg-indigo-200 text-indigo-800 rounded" title={`Substrate override: ${override}`}>{override}</span>
                            )}
                            {/* Toggle the per-sector substrate override editor */}
                            <button
                              onClick={() => setEditingSectorOverride(isOpen ? null : sec)}
                              className="hover:text-indigo-900"
                              title="Set sector substrate override"
                            ><Edit size={8} /></button>
                            <button
                              onClick={() => {
                                const updated = mapping.filter(s => s !== sec);
                                // Also strip any override entry for the removed sector to keep state clean
                                const cleaned = { ...overrides };
                                delete cleaned[sec];
                                systemsApi.updateSystem(selectedSystemId!, { sectorMapping: updated, sectorOverrides: cleaned }).then(() => loadFullSystem(selectedSystemId!));
                              }}
                              className="hover:text-red-500"
                            ><X size={8} /></button>
                            {isOpen && (
                              <span className="absolute z-20 top-full left-0 mt-1 p-2 bg-white border border-slate-200 rounded-lg shadow-lg flex flex-col gap-1 min-w-[160px]" onClick={(e) => e.stopPropagation()}>
                                <span className="text-[10px] text-slate-500 font-semibold">Substrate override</span>
                                <select
                                  value={override || ''}
                                  onChange={(e) => {
                                    const v = e.target.value || null;
                                    handleSaveSectorOverride(sec, v);
                                    setEditingSectorOverride(null);
                                  }}
                                  className="text-[11px] border border-slate-200 rounded px-1.5 py-1 focus:ring-1 focus:ring-indigo-400 outline-none"
                                >
                                  <option value="">— None (use system) —</option>
                                  {vocab.substrate.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              </span>
                            )}
                          </span>
                          );
                        })}
                        <button
                          onClick={() => {
                            const newSec = prompt('Add sector:');
                            if (newSec?.trim()) {
                              const updated = [...mapping, newSec.trim()];
                              systemsApi.updateSystem(selectedSystemId!, { sectorMapping: updated }).then(() => loadFullSystem(selectedSystemId!));
                            }
                          }}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200"
                        ><Plus size={8} /> Sector</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          const newSec = prompt('Add sector (e.g. Flooring, Roofing):');
                          if (newSec?.trim()) {
                            systemsApi.updateSystem(selectedSystemId!, { sectorMapping: [newSec.trim()] }).then(() => loadFullSystem(selectedSystemId!));
                          }
                        }}
                        className="inline-flex items-center gap-0.5 mt-1 px-2 py-0.5 text-[10px] bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200"
                      ><Plus size={8} /> Add Sector</button>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={fullSystem.status}
                    onChange={(e) => handleUpdateSystemStatus(e.target.value)}
                    className="text-sm border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                  <button
                    onClick={() => setShowAddLayer(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus size={14} /> Add Layer
                  </button>
                </div>
              </div>

              {showAddLayer && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Layer name (e.g., Primer, Base Coat, Top Coat)"
                      value={newLayerForm.layerName}
                      onChange={(e) => setNewLayerForm({ ...newLayerForm, layerName: e.target.value })}
                      className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      autoFocus
                    />
                  </div>
                  <textarea
                    placeholder="Notes (optional)"
                    value={newLayerForm.notes}
                    onChange={(e) => setNewLayerForm({ ...newLayerForm, notes: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddLayer} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add Layer</button>
                    <button onClick={() => setShowAddLayer(false)} className="px-3 py-1.5 text-sm bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300">Cancel</button>
                  </div>
                </div>
              )}

              {/* ---------- Phase 3: System Parameter Header ---------- */}
              {/* Collapsible bar that lets the user pick system-wide qualification
                   defaults. When any parameter is set, the layer product search is
                   automatically narrowed to qualified, system-ready products. */}
              <div className="mb-4 border border-slate-200 rounded-xl bg-slate-50 overflow-hidden" data-testid="system-parameter-header">
                <button
                  type="button"
                  onClick={() => setParamHeaderOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-indigo-500" />
                    System Parameters
                    {systemHasAnyParams && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-indigo-100 text-indigo-700 rounded">smart filter on</span>
                    )}
                    {savingParams && <span className="text-[10px] text-slate-400">saving…</span>}
                  </span>
                  {paramHeaderOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} /> }
                </button>
                {paramHeaderOpen && (
                  <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                        Substrate
                        <span className="ml-1 text-slate-400 normal-case font-normal">(multi-select)</span>
                      </label>
                      {/* Multi-select substrate pill picker — toggling a pill
                          adds / removes the value from the system's substrate
                          array. ANY-overlap rule downstream means picking
                          multiple substrates widens the qualified product
                          pool rather than narrowing it. Empty selection =
                          "Any substrate" (no constraint). */}
                      <div className="flex flex-wrap gap-1" data-testid="system-substrate-select">
                        {vocab.substrate.map(o => {
                          const current = substratesAsArray(fullSystem.systemSubstrate as string[] | string | null | undefined);
                          const active = current.includes(o.value);
                          return (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => {
                                const next = active
                                  ? current.filter(v => v !== o.value)
                                  : [...current, o.value];
                                handleSaveSystemParams({ systemSubstrate: next.length > 0 ? next : null });
                              }}
                              aria-pressed={active}
                              data-testid={`system-substrate-pill-${o.value}`}
                              className={`px-2 py-1 text-xs rounded-lg border transition-colors ${
                                active
                                  ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'
                              }`}
                            >
                              {o.label}
                            </button>
                          );
                        })}
                        {substratesAsArray(fullSystem.systemSubstrate as string[] | string | null | undefined).length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleSaveSystemParams({ systemSubstrate: null })}
                            className="px-2 py-1 text-xs rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                            title="Clear all substrates"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Humidity tolerance</label>
                      <select
                        value={fullSystem.systemHumidity || ''}
                        onChange={(e) => handleSaveSystemParams({ systemHumidity: e.target.value || null })}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        data-testid="system-humidity-select"
                      >
                        <option value="">— Any —</option>
                        {vocab.humidity.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Duty rating</label>
                      <select
                        value={fullSystem.systemDuty || ''}
                        onChange={(e) => handleSaveSystemParams({ systemDuty: e.target.value || null })}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        data-testid="system-duty-select"
                      >
                        <option value="">— Any —</option>
                        {vocab.duty.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    {/* ---------- Installable spec: total dry-film thickness ---------- */}
                    {/* Sits on its own full-width row beneath the qualification
                        triple. Two compact numeric inputs let the spec carry
                        an "X – Y mm" build-up range; either side is optional
                        so a single-coat system can carry just min, and a
                        target-thickness system can leave one side blank. */}
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                        Total dry-film thickness
                        <span className="ml-1 text-slate-400 normal-case font-normal">(mm, optional)</span>
                      </label>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <SpecNumberInput
                          value={fullSystem.totalThicknessMinMm}
                          onSave={(v) => handleSaveSystemParams({ totalThicknessMinMm: v })}
                          ariaLabel="Total dry-film thickness minimum (mm)"
                          testId="system-total-thickness-min"
                          className="w-20 px-2 py-1 text-sm text-right border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <span className="text-slate-400">–</span>
                        <SpecNumberInput
                          value={fullSystem.totalThicknessMaxMm}
                          onSave={(v) => handleSaveSystemParams({ totalThicknessMaxMm: v })}
                          ariaLabel="Total dry-film thickness maximum (mm)"
                          testId="system-total-thickness-max"
                          className="w-20 px-2 py-1 text-sm text-right border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <span className="text-slate-500">mm total</span>
                      </div>
                    </div>
                    {/* Active sector context picker — only shown when more than
                        one sector has a substrate override defined, since
                        otherwise getEffectiveSubstrate auto-resolves it. */}
                    {(() => {
                      const overrides = (fullSystem.sectorOverrides || {}) as Record<string, { substrateOverride?: string | null }>;
                      const overrideSectors = Object.entries(overrides).filter(([_, v]) => v?.substrateOverride);
                      if (overrideSectors.length < 2) return null;
                      return (
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Active sector context (for product search)</label>
                          <select
                            value={activeSectorContext || ''}
                            onChange={(e) => setActiveSectorContext(e.target.value || null)}
                            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            <option value="">— Use system substrate —</option>
                            {overrideSectors.map(([sec, v]) => (
                              <option key={sec} value={sec}>{sec} ({v.substrateOverride})</option>
                            ))}
                          </select>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {fullSystem.layers.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Layers size={36} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No layers yet. Add your first layer to start building the system.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {fullSystem.layers.map((layer, idx) => {
                    const layerColors = [
                      { border: 'border-blue-200', borderHover: 'hover:border-blue-300', bg: 'bg-blue-50/40', headerBg: 'bg-blue-50', badgeBg: 'bg-blue-500', badgeText: 'text-white', accent: 'border-blue-100', countBg: 'bg-blue-100/60', countText: 'text-blue-600', leftBar: 'bg-blue-500' },
                      { border: 'border-amber-200', borderHover: 'hover:border-amber-300', bg: 'bg-amber-50/40', headerBg: 'bg-amber-50', badgeBg: 'bg-amber-500', badgeText: 'text-white', accent: 'border-amber-100', countBg: 'bg-amber-100/60', countText: 'text-amber-600', leftBar: 'bg-amber-500' },
                      { border: 'border-emerald-200', borderHover: 'hover:border-emerald-300', bg: 'bg-emerald-50/40', headerBg: 'bg-emerald-50', badgeBg: 'bg-emerald-500', badgeText: 'text-white', accent: 'border-emerald-100', countBg: 'bg-emerald-100/60', countText: 'text-emerald-600', leftBar: 'bg-emerald-500' },
                      { border: 'border-purple-200', borderHover: 'hover:border-purple-300', bg: 'bg-purple-50/40', headerBg: 'bg-purple-50', badgeBg: 'bg-purple-500', badgeText: 'text-white', accent: 'border-purple-100', countBg: 'bg-purple-100/60', countText: 'text-purple-600', leftBar: 'bg-purple-500' },
                      { border: 'border-pink-200', borderHover: 'hover:border-pink-300', bg: 'bg-pink-50/40', headerBg: 'bg-pink-50', badgeBg: 'bg-pink-500', badgeText: 'text-white', accent: 'border-pink-100', countBg: 'bg-pink-100/60', countText: 'text-pink-600', leftBar: 'bg-pink-500' },
                      { border: 'border-cyan-200', borderHover: 'hover:border-cyan-300', bg: 'bg-cyan-50/40', headerBg: 'bg-cyan-50', badgeBg: 'bg-cyan-500', badgeText: 'text-white', accent: 'border-cyan-100', countBg: 'bg-cyan-100/60', countText: 'text-cyan-600', leftBar: 'bg-cyan-500' },
                    ];
                    const lc = layerColors[idx % layerColors.length];
                    return (
                    <div
                      key={layer.layerId}
                      data-layer-id={layer.layerId}
                      draggable={showAddProduct !== layer.layerId}
                      onDragStart={() => handleLayerDragStart(idx)}
                      onDragOver={(e) => handleLayerDragOver(e, idx)}
                      onDrop={(e) => handleLayerDrop(e, idx)}
                      onDragEnd={() => setDraggedLayerIdx(null)}
                      className={`border rounded-xl transition-all overflow-hidden ${
                        draggedLayerIdx === idx ? 'opacity-50 border-blue-300 bg-blue-50' : `${lc.border} ${lc.bg} ${lc.borderHover}`
                      }`}
                    >
                      <div className={`flex items-center gap-2 px-3 py-2 ${lc.headerBg} rounded-t-xl border-b ${lc.accent} relative`}>
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${lc.leftBar} rounded-tl-xl`} />
                        <GripVertical size={14} className="text-slate-300 cursor-grab flex-shrink-0 ml-1" />
                        <div className={`w-6 h-6 rounded-full ${lc.badgeBg} ${lc.badgeText} flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                          {idx + 1}
                        </div>
                        {editingLayer === layer.layerId ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={editLayerForm.layerName}
                              onChange={(e) => setEditLayerForm({ ...editLayerForm, layerName: e.target.value })}
                              className="flex-1 px-2 py-1 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <button onClick={() => handleUpdateLayer(layer.layerId)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                              <Check size={14} />
                            </button>
                            <button onClick={() => setEditingLayer(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="flex-1 text-sm font-semibold text-slate-700">{layer.layerName}</span>
                            {layer.notes && <span className="text-xs text-slate-400 truncate max-w-[200px]">{layer.notes}</span>}
                            <span className={`text-xs ${lc.countText} ${lc.countBg} px-2 py-0.5 rounded-full font-medium`}>
                              {layer.productOptions.length} product{layer.productOptions.length !== 1 ? 's' : ''}
                            </span>
                            <button
                              onClick={() => {
                                setEditingLayer(layer.layerId);
                                setEditLayerForm({ layerName: layer.layerName, notes: layer.notes || '' });
                              }}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            >
                              <Edit size={13} />
                            </button>
                            <button
                              onClick={() => {
                                const next = showAddProduct === layer.layerId ? null : layer.layerId;
                                setShowAddProduct(next);
                                // Reset the smart-filter override on every search-session
                                // change so the toggle is genuinely per-session and never
                                // leaks across layers.
                                setShowAllProductsInSearch(false);
                                setSelectedProductIds([]);
                                setProductSearch('');
                              }}
                              className="p-1 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                              title="Add product to layer"
                            >
                              <Plus size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteLayer(layer.layerId)}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>

                      {/* ---------- Installable spec strip ----------
                          Always-visible compact row of four numeric fields:
                          consumption (kg/m²), DFT (μm), and recoat min/max
                          (hrs). They sit directly under the layer header so
                          the spec is impossible to miss when reviewing a
                          layer; absence of values shows as a placeholder dash
                          so an unspec'd layer reads as "needs values" rather
                          than as a regression. Keyboard-accessible via labels
                          + aria-labels on each input. */}
                      <div
                        className="px-3 py-1.5 bg-slate-50/60 border-b border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500"
                        data-testid={`layer-spec-strip-${layer.layerId}`}
                      >
                        <span className="font-semibold text-slate-400 uppercase tracking-wide text-[10px]">Spec</span>
                        <label className="flex items-center gap-1">
                          <span className="text-slate-500">Consumption</span>
                          <SpecNumberInput
                            value={layer.consumptionRateKgM2}
                            onSave={(v) => handleSaveLayerSpec(layer.layerId, { consumptionRateKgM2: v })}
                            ariaLabel={`Consumption rate (kg/m²) for layer ${layer.layerName}`}
                            testId={`layer-consumption-${layer.layerId}`}
                          />
                          <span className="text-slate-400">kg/m²</span>
                        </label>
                        <label className="flex items-center gap-1">
                          <span className="text-slate-500">DFT</span>
                          <SpecNumberInput
                            value={layer.dftMicrons}
                            onSave={(v) => handleSaveLayerSpec(layer.layerId, { dftMicrons: v })}
                            ariaLabel={`Dry film thickness (μm) for layer ${layer.layerName}`}
                            testId={`layer-dft-${layer.layerId}`}
                          />
                          <span className="text-slate-400">μm</span>
                        </label>
                        <label className="flex items-center gap-1">
                          <span className="text-slate-500">Recoat</span>
                          <SpecNumberInput
                            value={layer.recoatMinHours}
                            onSave={(v) => handleSaveLayerSpec(layer.layerId, { recoatMinHours: v })}
                            ariaLabel={`Recoat minimum (hours) for layer ${layer.layerName}`}
                            testId={`layer-recoat-min-${layer.layerId}`}
                          />
                          <span className="text-slate-400">–</span>
                          <SpecNumberInput
                            value={layer.recoatMaxHours}
                            onSave={(v) => handleSaveLayerSpec(layer.layerId, { recoatMaxHours: v })}
                            ariaLabel={`Recoat maximum (hours) for layer ${layer.layerName}`}
                            testId={`layer-recoat-max-${layer.layerId}`}
                          />
                          <span className="text-slate-400">hrs</span>
                        </label>
                      </div>

                      {showAddProduct === layer.layerId && (
                        <div className="px-3 py-2 bg-white border-b border-slate-100 border-l-4 border-l-green-400">
                          {/* Smart filter banner — visible whenever the search panel is open
                              so the user can always see what's being filtered AND has a way
                              to opt out via "Show all". The filter itself activates on layer
                              open (layer-position alone is a useful filter even without
                              system-level params). */}
                          <div className={`mb-2 flex items-center justify-between gap-2 px-2 py-1 rounded-lg border text-[11px] ${smartFilterActive ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                            <span className="flex items-center gap-1.5 truncate">
                              <ShieldCheck size={12} />
                              {smartFilterActive
                                ? <>Smart filter on — {filterSummary || 'system-ready only'}</>
                                : <>Smart filter off — showing all products</>}
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowAllProductsInSearch(v => !v)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white border border-current hover:opacity-80"
                            >
                              {smartFilterActive ? 'Show all' : 'Apply filter'}
                            </button>
                          </div>
                          {/* Per-layer substrate override picker. Empty = inherit from sector/system. */}
                          {systemHasAnyParams && vocab.substrate.length > 0 && (
                            <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                              <span>Layer substrate:</span>
                              <select
                                value={layer.layerSubstrateOverride || ''}
                                onChange={(e) => systemsApi.updateLayer(layer.layerId, { layerSubstrateOverride: e.target.value || null }).then(() => loadFullSystem(selectedSystemId!))}
                                className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:ring-1 focus:ring-indigo-400 outline-none"
                              >
                                <option value="">— Inherit —</option>
                                {vocab.substrate.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </div>
                          )}
                          <div className="relative mb-2">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Search products... (use +include -exclude)"
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                              autoFocus
                            />
                          </div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-slate-500">
                              {selectedProductIds.length > 0
                                ? `${selectedProductIds.length} selected`
                                : (() => {
                                    // Count qualified + unqualified separately so the
                                    // header reflects the new divider layout below.
                                    const q = layerSearchResult.qualified.length;
                                    const u = layerSearchResult.unqualified.length;
                                    if (u === 0) return `${q} match${q === 1 ? '' : 'es'}`;
                                    return `${q} qualified · ${u} unqualified`;
                                  })()}
                            </div>
                            <button
                              onClick={() => handleAddSelectedProductsToLayer(layer.layerId)}
                              disabled={selectedProductIds.length === 0}
                              className="px-2 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Add Selected
                            </button>
                          </div>
                          <div className="max-h-72 overflow-y-auto space-y-0.5 pr-0.5">
                            {/* Render a single product row. Extracted as an
                                inline IIFE so we can re-use it for both the
                                qualified and unqualified sections below
                                without copy-paste. `unqualified=true` renders
                                the row in muted style and skips the match
                                quality dot — those rows live below the
                                divider as "not yet tagged". */}
                            {(() => {
                              const renderRow = (prod: typeof products[number], unqualified: boolean) => {
                                const alreadyAdded = layer.productOptions.some((o) => o.productId === prod.id);
                                const isSelected = selectedProductIds.includes(prod.id);
                                const matchLabel = unqualified ? null : (layerSearchResult.scores[prod.id]?.label || null);
                                return (
                                  <div
                                    key={prod.id}
                                    className={`flex items-start gap-2.5 px-2.5 py-2 rounded-lg border cursor-pointer transition-all ${
                                      alreadyAdded
                                        ? 'bg-slate-50 border-slate-200 opacity-60 cursor-default'
                                        : isSelected
                                        ? 'bg-green-50 border-green-300 shadow-sm'
                                        : unqualified
                                        ? 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
                                        : 'bg-white border-transparent hover:bg-green-50/60 hover:border-green-200'
                                    }`}
                                    onClick={() => {
                                      if (alreadyAdded) return;
                                      setSelectedProductIds(prev =>
                                        prev.includes(prod.id)
                                          ? prev.filter(id => id !== prod.id)
                                          : [...prev, prod.id]
                                      );
                                    }}
                                  >
                                    {/* Checkbox */}
                                    <div className="flex-shrink-0 mt-0.5">
                                      {alreadyAdded ? (
                                        <div className="w-4 h-4 rounded bg-slate-200 flex items-center justify-center">
                                          <Check size={10} className="text-slate-400" />
                                        </div>
                                      ) : (
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          readOnly
                                          className="w-4 h-4 accent-green-600 rounded"
                                        />
                                      )}
                                    </div>

                                    {/* Main content */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        {/* Match-quality dot — only shown for
                                            qualified rows that earned a label.
                                            Tooltip surfaces the label text
                                            without taking horizontal room. */}
                                        {matchLabel && (
                                          <span
                                            className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${matchLabel.dotClass}`}
                                            title={matchLabel.label}
                                            aria-label={matchLabel.label}
                                            data-testid={`match-dot-${prod.id}`}
                                          />
                                        )}
                                        <span className={`text-sm font-medium truncate ${
                                          alreadyAdded ? 'text-slate-500'
                                            : unqualified ? 'text-slate-500'
                                            : 'text-slate-800'
                                        }`}>
                                          {prod.name}
                                        </span>
                                        {alreadyAdded && (
                                          <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded-full">
                                            In layer
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                        {prod.stockCode && (
                                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                            {prod.stockCode}
                                          </span>
                                        )}
                                        {prod.supplier && (
                                          <span className="text-[10px] text-slate-400 truncate">{prod.supplier}</span>
                                        )}
                                      </div>
                                      {prod.description && (
                                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 italic">
                                          {prod.description}
                                        </p>
                                      )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDetailsProduct(prod);
                                        }}
                                        className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors"
                                        title="View product details"
                                      >
                                        <Info size={14} />
                                      </button>
                                      {!alreadyAdded && (
                                        <div className={`p-1 rounded transition-colors ${isSelected ? 'text-green-600' : 'text-slate-300'}`}>
                                          <Plus size={13} />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              };
                              // Cap each tier separately so the divider always
                              // shows when unqualified products exist — even
                              // when qualified results are pushing the 50-row
                              // soft cap.
                              const qualifiedSlice = layerSearchResult.qualified.slice(0, 50);
                              const unqualifiedSlice = layerSearchResult.unqualified.slice(0, 50);
                              const showDivider = unqualifiedSlice.length > 0;
                              return (
                                <>
                                  {qualifiedSlice.map(p => renderRow(p, false))}
                                  {showDivider && (
                                    <div
                                      className="flex items-center gap-2 my-2 px-1 select-none"
                                      data-testid="unqualified-divider"
                                    >
                                      <div className="flex-1 h-px bg-slate-200" />
                                      <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
                                        Unqualified products — not yet tagged
                                      </span>
                                      <div className="flex-1 h-px bg-slate-200" />
                                    </div>
                                  )}
                                  {unqualifiedSlice.map(p => renderRow(p, true))}
                                  {qualifiedSlice.length === 0 && unqualifiedSlice.length === 0 && (
                                    <div className="py-6 text-center text-sm text-slate-400">
                                      No products match your search
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      <div className="divide-y divide-indigo-50/50 px-2 py-1.5 space-y-0.5">
                        {layer.productOptions.map((opt) => {
                          const fullProd = products.find(p => p.id === opt.productId);
                          return (
                            <div
                              key={opt.optionId}
                              className={`flex items-start gap-2.5 px-2.5 py-2 rounded-lg border transition-all group/opt ${
                                opt.isDefault
                                  ? 'bg-amber-50/40 border-amber-200'
                                  : 'bg-indigo-50/20 border-transparent hover:bg-indigo-50/50 hover:border-indigo-100'
                              }`}
                            >
                              {/* Star toggle */}
                              <button
                                onClick={() => handleToggleDefault(opt.optionId, opt.isDefault)}
                                className={`flex-shrink-0 mt-0.5 p-0.5 rounded transition-colors ${
                                  opt.isDefault ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50'
                                }`}
                                title={opt.isDefault ? 'Default product — click to unset' : 'Set as default'}
                              >
                                {opt.isDefault ? <Star size={14} fill="currentColor" /> : <StarOff size={14} />}
                              </button>

                              {/* Main content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium text-slate-800 truncate">
                                    {opt.productName || opt.productId}
                                  </span>
                                  {opt.isDefault && (
                                    <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded-full">
                                      Default
                                    </span>
                                  )}
                                  {/* Phase 4: conflict / unqualified indicators (display only). */}
                                  {(() => {
                                    const c = getProductConflicts(opt.productId, layer);
                                    if (c.kind === 'unqualified') {
                                      return <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full" title="Product has not been qualified yet (no system-ready tag).">Unqualified</span>;
                                    }
                                    if (c.kind === 'conflicts') {
                                      return (
                                        <span className="flex-shrink-0 inline-flex items-center" title={c.messages.join('\n')} data-testid={`conflict-${opt.optionId}`}>
                                          <AlertTriangle size={13} className="text-amber-500" />
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {opt.productStockCode && (
                                    <span className="text-[10px] font-mono text-indigo-400 bg-indigo-50 px-1.5 py-0.5 rounded">
                                      {opt.productStockCode}
                                    </span>
                                  )}
                                  {opt.productSupplier && (
                                    <span className="text-[10px] text-slate-400 truncate">{opt.productSupplier}</span>
                                  )}
                                </div>
                                {(fullProd?.description || opt.benefit) && (
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {fullProd?.description && (
                                      <p className="text-[11px] text-slate-400 line-clamp-1 italic">{fullProd.description}</p>
                                    )}
                                  </div>
                                )}
                                {/* Benefit editor */}
                                {editingOption === opt.optionId ? (
                                  <div className="flex items-center gap-1 mt-1">
                                    <input
                                      type="text"
                                      value={editBenefit}
                                      onChange={(e) => setEditBenefit(e.target.value)}
                                      placeholder="Product benefit..."
                                      className="flex-1 px-2 py-0.5 text-xs border border-indigo-200 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                                      autoFocus
                                    />
                                    <button onClick={() => handleUpdateBenefit(opt.optionId)} className="p-0.5 text-green-600 hover:bg-green-50 rounded">
                                      <Check size={12} />
                                    </button>
                                    <button onClick={() => setEditingOption(null)} className="p-0.5 text-slate-400 hover:bg-slate-100 rounded">
                                      <X size={12} />
                                    </button>
                                  </div>
                                ) : opt.benefit ? (
                                  <div className="mt-1 flex items-center gap-1">
                                    <span className="text-[11px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                      {opt.benefit}
                                    </span>
                                  </div>
                                ) : null}
                              </div>

                              {/* Action buttons */}
                              <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                                <button
                                  onClick={() => setDetailsProduct(fullProd ?? {
                                    id: opt.productId,
                                    name: opt.productName || opt.productId,
                                    stockCode: opt.productStockCode || '',
                                    supplier: opt.productSupplier || '',
                                  } as Product)}
                                  className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors"
                                  title="View product details"
                                >
                                  <Info size={14} />
                                </button>
                                {editingOption !== opt.optionId && (
                                  <button
                                    onClick={() => { setEditingOption(opt.optionId); setEditBenefit(opt.benefit || ''); }}
                                    className="opacity-0 group-hover/opt:opacity-100 p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-all"
                                    title="Edit benefit"
                                  >
                                    <Edit size={13} />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleRemoveProduct(opt.optionId)}
                                  className="opacity-0 group-hover/opt:opacity-100 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                                  title="Remove from layer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {layer.productOptions.length === 0 && (
                          <div className="py-4 text-center text-xs text-slate-400">
                            No products assigned to this layer yet
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                  {/* Phase 4: warning legend — only shown when at least one warning exists in this system. */}
                  {(systemHealth.conflictCount > 0 || systemHealth.unqualifiedCount > 0) && (
                    <div className="mt-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-500">Legend:</span>
                      {systemHealth.conflictCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <AlertTriangle size={12} className="text-amber-500" />
                          Parameter mismatch — hover the icon for details
                        </span>
                      )}
                      {systemHealth.unqualifiedCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-semibold">Unqualified</span>
                          Product has no system-ready qualification tag
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* RIGHT PANEL - Preview & Summary */}
        <div className="w-80 border-l border-slate-200 bg-slate-50 flex flex-col flex-shrink-0 overflow-y-auto">
          {fullSystem ? (
            <div className="p-4">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">System Summary</h3>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <div className="text-2xl font-bold text-blue-600">{fullSystem.layers.length}</div>
                  <div className="text-xs text-slate-500">Layers</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <div className="text-2xl font-bold text-emerald-600">
                    {fullSystem.layers.reduce((sum, l) => sum + l.productOptions.length, 0)}
                  </div>
                  <div className="text-xs text-slate-500">Products</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <div className="text-2xl font-bold text-amber-600">
                    {fullSystem.layers.reduce((sum, l) => sum + l.productOptions.filter((o) => o.isDefault).length, 0)}
                  </div>
                  <div className="text-xs text-slate-500">Defaults</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <div className="text-2xl font-bold text-slate-600">v{fullSystem.version}</div>
                  <div className="text-xs text-slate-500">Version</div>
                </div>
              </div>

              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Build-Up Preview</h3>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {fullSystem.layers.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">Add layers to see the build-up preview</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {fullSystem.layers.map((layer, idx) => {
                      const defaultProducts = layer.productOptions.filter((o) => o.isDefault);
                      const colorScale = ['bg-blue-500', 'bg-amber-500', 'bg-emerald-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500'];
                      const layerColor = colorScale[idx % colorScale.length];
                      // Phase 4: per-layer technical summary derived from
                      // qualification tags (substrate compat, duty agreement,
                      // system-ready ratio). Null when no products are tagged.
                      const tech = getLayerTechnicalSummary(layer);
                      return (
                        <div key={layer.layerId} className="relative" data-layer-id={layer.layerId}>
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${layerColor}`} />
                          <div className="pl-4 pr-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full ${layerColor} text-white flex items-center justify-center text-[10px] font-bold`}>
                                {idx + 1}
                              </span>
                              <span className="text-xs font-semibold text-slate-700">{layer.layerName}</span>
                            </div>
                            {defaultProducts.length > 0 ? (
                              <div className="ml-7 mt-1 space-y-0.5">
                                {defaultProducts.map((dp) => (
                                  <div key={dp.optionId} className="text-[11px] text-slate-500 flex items-center gap-1">
                                    <Star size={8} className="text-amber-500" fill="currentColor" />
                                    {dp.productName || dp.productId}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="ml-7 mt-1 text-[11px] text-slate-400 italic">
                                {layer.productOptions.length > 0 ? `${layer.productOptions.length} option(s), no default set` : 'No products assigned'}
                              </div>
                            )}
                            {/* Phase 4: technical detail block — only shown when at least one product in the layer is tagged */}
                            {tech && (
                              <div className="ml-7 mt-1.5 flex flex-wrap gap-1">
                                {tech.substrates.length > 0 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600" title="Combined substrate compatibility across all tagged products in this layer">
                                    Substrate: {tech.substrates.slice(0, 3).join(', ')}{tech.substrates.length > 3 ? '…' : ''}
                                  </span>
                                )}
                                {tech.dutyDisplay && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${tech.dutyDisplay === 'Mixed' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`} title={tech.dutyDisplay === 'Mixed' ? 'Products in this layer disagree on duty rating' : `All products agree on ${tech.dutyDisplay} duty`}>
                                    Duty: {tech.dutyDisplay}
                                  </span>
                                )}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${tech.ready === tech.total ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {tech.ready}/{tech.total} qualified
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Phase 4: System Health summary card */}
              {fullSystem.layers.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">System Health</h3>
                  <div className={`rounded-xl border p-3 ${systemHealth.status === 'red' ? 'bg-red-50 border-red-200' : systemHealth.status === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {systemHealth.status === 'green' ? <Check size={14} className="text-emerald-600" /> : systemHealth.status === 'amber' ? <AlertCircle size={14} className="text-amber-600" /> : <AlertTriangle size={14} className="text-red-600" />}
                      <span className={`text-xs font-semibold ${systemHealth.status === 'red' ? 'text-red-700' : systemHealth.status === 'amber' ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {systemHealth.status === 'green' ? 'All products qualified & matching' : systemHealth.status === 'amber' ? 'Some unqualified products' : 'Conflicts detected'}
                      </span>
                    </div>
                    {systemHealth.conflictCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!systemHealth.firstConflictLayerId) return;
                          // Scroll the originating layer in the centre panel into view
                          const el = document.querySelector(`[data-layer-id="${systemHealth.firstConflictLayerId}"]`);
                          if (el && 'scrollIntoView' in el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                        className="text-[11px] text-red-700 hover:underline block mb-1"
                      >
                        {systemHealth.conflictCount} conflict{systemHealth.conflictCount === 1 ? '' : 's'} detected — jump to first
                      </button>
                    )}
                    {systemHealth.unqualifiedCount > 0 && (
                      <div className="text-[11px] text-amber-700 mb-1">
                        {systemHealth.unqualifiedCount} unqualified product{systemHealth.unqualifiedCount === 1 ? '' : 's'}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-600">
                      {systemHealth.defaultCoverage} of {systemHealth.totalLayers} layer{systemHealth.totalLayers === 1 ? '' : 's'} have a default set
                    </div>
                  </div>
                </div>
              )}

              {fullSystem.typicalUses && (
                <div className="mt-4">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">Typical Uses</h3>
                  <p className="text-xs text-slate-600 bg-white rounded-lg border border-slate-200 p-3">{fullSystem.typicalUses}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6">
              <Eye size={36} className="mb-2 opacity-50" />
              <p className="text-sm text-center">Select a system to view its summary and build-up preview</p>
            </div>
          )}
        </div>
      </div>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[600px] max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">Version History</h3>
              <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {historyEntries.length === 0 ? (
                <p className="text-center text-slate-400 py-6">No version history yet. Create a snapshot to start tracking changes.</p>
              ) : (
                <div className="space-y-3">
                  {historyEntries.map((entry) => (
                    <div key={entry.id} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700">Version {entry.version}</span>
                        <span className="text-xs text-slate-400">{new Date(entry.createdAt).toLocaleString()}</span>
                      </div>
                      {entry.changeDescription && <p className="text-xs text-slate-500 mt-1">{entry.changeDescription}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {detailsProduct && (
        <ProductDetailsModal
          product={detailsProduct}
          onClose={() => setDetailsProduct(null)}
          onUpdate={(updatedProduct) => {
            onProductUpdate(updatedProduct);
            setDetailsProduct(updatedProduct);
          }}
          onEdit={(p) => {
            setDetailsProduct(null);
            setEditingProduct(p);
          }}
          treeNodes={treeNodes}
        />
      )}

      {/* Phase 4: Quick Setup wizard modal — only ever opened via the Sparkles button (new systems only). */}
      {quickSetupOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-blue-50">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-800">Quick Setup — New System</h3>
              </div>
              <button onClick={() => setQuickSetupOpen(false)} className="p-1 hover:bg-white/60 rounded-lg" disabled={quickBusy}>
                <X size={18} />
              </button>
            </div>
            {/* Step pills — 3 steps: Parameters (incl. material + layer skeleton) → Primer → Pick Products.
                Material type used to live on its own Step 3 between Primer and
                Pick Products, but it doesn't influence the primer pool, so we
                merged it into Step 1 alongside substrate / humidity / duty.
                That cuts a click and keeps related parameters together. */}
            <div className="px-5 py-2 flex items-center gap-2 border-b border-slate-100 bg-slate-50">
              {[1, 2, 3].map(s => (
                <div key={s} className={`flex items-center gap-1.5 text-xs font-medium ${quickStep >= s ? 'text-indigo-700' : 'text-slate-400'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${quickStep >= s ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{s}</span>
                  {s === 1 ? 'Parameters & Layers' : s === 2 ? 'Primer' : 'Pick Products'}
                  {s < 3 && <ChevronRight size={12} className="text-slate-300" />}
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {/* STEP 1 — system parameters. No data is written here. */}
              {quickStep === 1 && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">System name *</label>
                    <input type="text" value={quickSetup.name} onChange={(e) => setQuickSetup({ ...quickSetup, name: e.target.value })} placeholder="e.g. Concrete Floor Heavy-Duty Epoxy" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" autoFocus />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Substrate
                        {quickSetup.substrate.length > 0 && (
                          <span className="ml-1 text-[10px] font-normal text-slate-400">({quickSetup.substrate.length} selected)</span>
                        )}
                      </label>
                      {/* Multi-select pills — products can carry several
                          substrate types, so picking more than one widens the
                          Step 3 product filter (matches ANY of the chosen). */}
                      <div className="border border-slate-200 rounded-lg p-1.5 bg-white max-h-28 overflow-y-auto flex flex-wrap gap-1">
                        {vocab.substrate.length === 0 ? (
                          <span className="text-[11px] text-slate-400 italic px-1">No substrates configured</span>
                        ) : vocab.substrate.map(v => {
                          const selected = quickSetup.substrate.includes(v.value);
                          return (
                            <button
                              key={v.value}
                              type="button"
                              onClick={() => {
                                const next = selected
                                  ? quickSetup.substrate.filter(s => s !== v.value)
                                  : [...quickSetup.substrate, v.value];
                                setQuickSetup({ ...quickSetup, substrate: next });
                              }}
                              className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                                selected
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                              }`}
                            >
                              {v.label}
                            </button>
                          );
                        })}
                      </div>
                      {quickSetup.substrate.length === 0 && (
                        <p className="mt-1 text-[10px] text-slate-400">— any —</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Humidity</label>
                      <select value={quickSetup.humidity} onChange={(e) => setQuickSetup({ ...quickSetup, humidity: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg">
                        <option value="">— any —</option>
                        {vocab.humidity.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Duty</label>
                      <select value={quickSetup.duty} onChange={(e) => setQuickSetup({ ...quickSetup, duty: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg">
                        <option value="">— any —</option>
                        {vocab.duty.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">These parameters power the primer pool in Step 2, the per-layer product suggestions in Step 3, and the conflict detection after creation.</p>

                  {/* Material type + post-primer layer skeleton (was Step 3 — merged here).
                      Material type doesn't affect the primer pool (cross-material
                      primers are valid), but it DOES seed the post-primer layer
                      names and filter Step 3's product suggestions, so it lives
                      with the rest of the system parameters. */}
                  <div className="pt-3 border-t border-slate-100">
                    <label className="block text-xs font-semibold text-slate-600 mb-2">Material type — sets the suggested layer skeleton and filters Step 3 product suggestions</label>
                    <div className="grid grid-cols-5 gap-2">
                      {(Object.keys(QUICK_SKELETONS) as Array<QuickSetup['materialType']>).map(mt => (
                        <button key={mt} type="button" onClick={() => setQuickSetup({ ...quickSetup, materialType: mt, layers: QUICK_SKELETONS[mt].map(n => ({ name: n, productId: null })) })} className={`px-3 py-2 text-xs font-medium rounded-lg border ${quickSetup.materialType === mt ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                          {mt === 'pu' ? 'PU' : mt[0].toUpperCase() + mt.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-slate-600">Suggested layers (rename or remove as needed)</label>
                      <button type="button" onClick={() => setQuickSetup({ ...quickSetup, layers: [...quickSetup.layers, { name: 'New Layer', productId: null }] })} className="text-xs text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1">
                        <Plus size={12} /> Add layer
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {quickSetup.layers.map((slot, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {/* Slot index labels are offset by 1 to leave room
                              for the Primer layer that's picked in Step 2 —
                              regardless of fixed/adaptive mode, picking any
                              primer means the first post-primer layer is #2. */}
                          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                            {i + 2}
                          </span>
                          <input type="text" value={slot.name} onChange={(e) => { const ls = [...quickSetup.layers]; ls[i] = { ...ls[i], name: e.target.value }; setQuickSetup({ ...quickSetup, layers: ls }); }} className="flex-1 px-2 py-1 text-sm border border-slate-200 rounded" />
                          <button type="button" onClick={() => setQuickSetup({ ...quickSetup, layers: quickSetup.layers.filter((_, j) => j !== i) })} className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={13} /></button>
                        </div>
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">Layer #1 will be the Primer you pick in Step 2 (or skipped if you pick none).</p>
                  </div>
                </div>
              )}

              {/* STEP 2 — pick the system's primer FIRST and on its own.
                  Filter pool: system-ready products that match the Step 1
                  parameters (substrate / humidity / duty) AND that look like a
                  primer — either tagged as layer_position='primer' in
                  qualification, OR (legacy fallback) their taxonomy path /
                  product name contains the word "primer" / "bonding".
                  Material type is intentionally NOT applied here — using e.g.
                  an Epoxy primer under a PU base + topcoat is a common,
                  perfectly valid technique, so we keep this step open. */}
              {quickStep === 2 && (() => {
                // Quick Setup Step 2 — primer candidates. Mirrors the main
                // layer picker: Primer-Library row is the authoritative tag
                // source for humidity/duty/substrate (falling back to
                // qualification tags), and exclusion uses the shared
                // compatibility engine so wildcard ("Moisture-Tolerant"),
                // dash normalization, and strict-bucket rules stay in
                // lock-step with the main builder and the server resolver.
                const primerCandidates = products.filter(p => {
                  const baseTag = tagsByProduct[p.id];
                  const libTag = primerLibraryTagsByProduct[p.id];
                  const t = libTag
                    ? { ...(baseTag || {}), ...libTag, isSystemReady: true }
                    : baseTag;
                  if (!t || !t.isSystemReady) return false;
                  const haystack = productMaterialPath[p.id] || '';
                  const excluded = engineIsHardExcluded(t, {
                    systemType: QUICK_MATERIAL_TO_SYSTEM_TYPE[quickSetup.materialType] ?? null,
                    systemSubstrates: quickSetup.substrate,
                    systemHumidity: quickSetup.humidity || null,
                    systemDuty: quickSetup.duty || null,
                    activeLayerPosition: 'primer',
                    productFamily: inferProductFamily(haystack),
                  }).excluded;
                  if (excluded) return false;
                  // "Looks like a primer" check (still needed because the
                  // engine doesn't filter by primer-ness on its own — it
                  // assumes the caller already restricted the pool).
                  if (t.layerPosition === 'primer') return true;
                  if (!t.layerPosition) {
                    if (/\bprimer\b|\bbond(?:ing)?\b/.test(haystack)) return true;
                  }
                  return false;
                });
                // Preserve the order in which the user picked each primer —
                // that's the order they'll be persisted as separate layers.
                const selectedPrimers = quickSetup.primerProductIds
                  .map(id => products.find(p => p.id === id))
                  .filter((p): p is NonNullable<typeof p> => !!p);
                const togglePrimer = (id: string) => {
                  const cur = quickSetup.primerProductIds;
                  setQuickSetup({
                    ...quickSetup,
                    primerProductIds: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id],
                  });
                };
                return (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-500">
                      Pick one or more primers for this system. The list below is filtered by the parameters from Step&nbsp;1 — only system-ready products that look like primers (tagged or named) are shown. If you pick several, they all live on the <strong>same primer layer</strong> as alternatives — the first one you tick is the default, the others are swap-in options.
                    </p>
                    <div className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">1</span>
                          <span className="text-sm font-semibold text-slate-700">Primer{selectedPrimers.length > 1 ? 's' : ''}</span>
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-50 text-indigo-600 border border-indigo-100">Primer</span>
                          {selectedPrimers.length > 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                              {selectedPrimers.length} selected
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">{primerCandidates.length} match{primerCandidates.length === 1 ? '' : 'es'}</span>
                      </div>
                      {primerCandidates.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">
                          No system-ready primers match these parameters. You can skip this step — the system will be created without a primer layer.
                        </p>
                      ) : (
                        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded">
                          {primerCandidates.slice(0, 200).map(p => {
                            const checked = quickSetup.primerProductIds.includes(p.id);
                            const order = checked ? quickSetup.primerProductIds.indexOf(p.id) + 1 : null;
                            return (
                              <label
                                key={p.id}
                                className={`flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-slate-50 ${checked ? 'bg-indigo-50/40' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePrimer(p.id)}
                                  className="w-3.5 h-3.5 accent-indigo-600"
                                />
                                {/* Pick order badge — makes it obvious which
                                    primer becomes layer #1 vs #2 vs #3 etc. */}
                                {order !== null && (
                                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                    {order}
                                  </span>
                                )}
                                <span className="flex-1 truncate text-slate-700">{p.name}</span>
                                {p.stockCode && (
                                  <span className="text-[11px] text-slate-400 flex-shrink-0">{p.stockCode}</span>
                                )}
                              </label>
                            );
                          })}
                          {primerCandidates.length > 200 && (
                            <p className="px-2 py-1 text-[11px] text-slate-400 italic bg-slate-50">
                              Showing first 200 matches — narrow Step&nbsp;1 parameters to refine.
                            </p>
                          )}
                        </div>
                      )}
                      {selectedPrimers.length > 0 && (
                        <p className="mt-2 text-[11px] text-emerald-700">
                          {selectedPrimers.length === 1
                            ? <>Will be saved as the <strong>Primer</strong> layer with <strong>{selectedPrimers[0].name}</strong> as the default.</>
                            : <>Will be saved as a single <strong>Primer</strong> layer with {selectedPrimers.length} alternatives — default: <strong>{selectedPrimers[0].name}</strong>; alternatives: {selectedPrimers.slice(1).map(p => p.name).join(', ')}.</>}
                        </p>
                      )}
                      {selectedPrimers.length === 0 && primerCandidates.length > 0 && (
                        <p className="mt-2 text-[11px] text-slate-400">
                          Tip: leave all unchecked to skip the primer entirely.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* (Old Step 3 "Material & Layers" was merged into Step 1 —
                  material type + the editable layer skeleton now sit with
                  the rest of the system parameters.) */}

              {/* STEP 3 (was Step 4) — for each post-primer layer slot, list products that match BOTH:
                    - the system-wide parameters from Step 1 (substrate / humidity / duty / material type), AND
                    - the layer position inferred from the slot name (also Step 1).
                  Products that haven't been qualified for a layer position
                  yet are still shown (legacy fallback) so the user is never
                  blocked by un-tagged products. */}
              {quickStep === 3 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">
                    Pick a default product for each layer (optional). Products are filtered by the parameters from Step 1 <em>and</em> the layer position inferred from each slot name
                    {quickSetup.materialType !== 'generic' && (
                      <> — only <strong>{quickSetup.materialType === 'pu' ? 'PU/Polyurethane' : quickSetup.materialType[0].toUpperCase() + quickSetup.materialType.slice(1)}</strong> products (matched by taxonomy or name) are shown.</>
                    )}
                  </p>
                  {quickSetup.layers.map((slot, i) => {
                    // Infer this slot's layer position from its name. Null = no
                    // per-slot filter (slot name is custom or ambiguous).
                    const slotPos = inferLayerPositionFromSlotName(slot.name);
                    // Pretty label for the inferred-position pill.
                    const slotPosLabel = slotPos
                      ? slotPos === 'base_coat' ? 'Base Coat'
                        : slotPos === 'topcoat' ? 'Topcoat'
                        : slotPos === 'primer' ? 'Primer'
                        : slotPos === 'intermediate' ? 'Intermediate'
                        : 'Standalone'
                      : null;
                    // Material-type filter source: the wizard's lowercase
                    // materialType → canonical system family. Passed into
                    // the engine's `systemType` context so wrong-chemistry
                    // products are excluded uniformly across every picker
                    // (this wizard, Step 2, and the layer picker in the
                    // main editor).
                    const sysTypeForEngine = QUICK_MATERIAL_TO_SYSTEM_TYPE[quickSetup.materialType];
                    // Filter products that are system-ready AND pass the
                    // shared compatibility engine. The engine subsumes the
                    // legacy substrate carve-out, layer-position rule, and
                    // humidity/duty checks — the only wizard-specific
                    // pre-filter remaining is "must be system-ready", which
                    // keeps un-tagged products out of the Step 3 dropdowns
                    // (they're still reachable via the main editor with
                    // Show-All).
                    const matches = products.filter(p => {
                      const t = tagsByProduct[p.id];
                      if (!t || !t.isSystemReady) return false;
                      const haystack = productMaterialPath[p.id] || '';
                      const productFamily = inferProductFamily(haystack);
                      return !engineIsHardExcluded(t, {
                        systemType: sysTypeForEngine,
                        systemSubstrates: quickSetup.substrate,
                        systemHumidity: quickSetup.humidity || null,
                        systemDuty: quickSetup.duty || null,
                        activeLayerPosition: (slotPos as EngineLayerPosition | null) ?? null,
                        productFamily,
                      }).excluded;
                    });
                    return (
                      <div key={i} className="border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                            <span className="text-sm font-semibold text-slate-700">{slot.name}</span>
                            {slotPosLabel && (
                              <span
                                className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-50 text-indigo-600 border border-indigo-100"
                                title={`Filtering for products tagged as "${slotPosLabel}" in qualification`}
                              >
                                {slotPosLabel}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400">{matches.length} match{matches.length === 1 ? '' : 'es'}</span>
                        </div>
                        {matches.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">
                            No system-ready products match {slotPosLabel ? `the "${slotPosLabel}" layer with` : ''} these parameters. The layer will be created empty.
                          </p>
                        ) : (
                          <select value={slot.productId || ''} onChange={(e) => { const ls = [...quickSetup.layers]; ls[i] = { ...ls[i], productId: e.target.value || null }; setQuickSetup({ ...quickSetup, layers: ls }); }} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded">
                            <option value="">— skip (leave layer empty) —</option>
                            {matches.slice(0, 50).map(p => <option key={p.id} value={p.id}>{p.name}{p.stockCode ? ` · ${p.stockCode}` : ''}</option>)}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer — Back / Next / Create. Only the Create button (Step 3) writes to the DB. */}
            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
              <button onClick={() => setQuickSetupOpen(false)} className="text-xs text-slate-500 hover:text-slate-700" disabled={quickBusy}>Cancel & use empty editor</button>
              <div className="flex items-center gap-2">
                {quickStep > 1 && (
                  <button
                    onClick={() => setQuickStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : 1))}
                    className="px-3 py-1.5 text-sm bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 inline-flex items-center gap-1"
                    disabled={quickBusy}
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                )}
                {quickStep < 3 ? (
                  <button
                    onClick={() => setQuickStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : 3))}
                    disabled={quickStep === 1 && !quickSetup.name.trim()}
                    className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 inline-flex items-center gap-1"
                  >
                    Next <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      // Step 4 — actually persist. Sequence:
                      //   1. POST /api/systems          (with parameter header pre-filled)
                      //   2. POST /api/system-layers    (one call per layer slot)
                      //   3. POST /api/system-product-options (only for slots with a chosen productId)
                      // Each call is independent; on partial failure the user
                      // can edit the resulting (partial) system in the regular editor.
                      if (quickBusy) return;
                      setQuickBusy(true);
                      try {
                        const created = await systemsApi.createSystem({
                          name: quickSetup.name.trim(),
                          // The system header now carries an ARRAY of
                          // substrates, so we persist the wizard's full
                          // multi-selection verbatim. Empty selection → null
                          // ("any substrate"). The downstream filter applies
                          // ANY-overlap, so persisting the multi-selection
                          // matches the wizard's Step 3 product narrowing.
                          systemSubstrate: quickSetup.substrate.length > 0 ? quickSetup.substrate : null,
                          systemHumidity: quickSetup.humidity || null,
                          systemDuty: quickSetup.duty || null,
                        } as any);
                        const newId = (created as any).systemId || (created as any).id;
                        // Layer #1 is a SINGLE "Primer" layer. Every primer
                        // the user ticked in Step 2 is added as an alternative
                        // product option on that one layer — they're
                        // alternatives for the same slot, not separate layers.
                        // The first one ticked becomes the default; the rest
                        // are non-default alternatives the user can swap to.
                        let layerOrder = 1;
                        if (quickSetup.primerProductIds.length > 0) {
                          const primerLayer = await systemsApi.createLayer({ systemId: newId, layerName: 'Primer', orderSequence: layerOrder++ });
                          const primerLayerId = (primerLayer as any).layerId || (primerLayer as any).id;
                          for (let i = 0; i < quickSetup.primerProductIds.length; i++) {
                            await systemsApi.addProductOption({
                              layerId: primerLayerId,
                              productId: quickSetup.primerProductIds[i],
                              isDefault: i === 0,
                            });
                          }
                        }
                        // Then the post-primer layers from Step 3, each as
                        // their own layer with an optional default product.
                        for (const slot of quickSetup.layers) {
                          const layer = await systemsApi.createLayer({ systemId: newId, layerName: slot.name, orderSequence: layerOrder++ });
                          const layerId = (layer as any).layerId || (layer as any).id;
                          if (slot.productId) {
                            await systemsApi.addProductOption({ layerId, productId: slot.productId, isDefault: true });
                          }
                        }
                        await loadSystems();
                        setSelectedSystemId(newId);
                        setQuickSetupOpen(false);
                      } catch (err) {
                        console.error('Quick Setup creation failed:', err);
                        alert('Quick Setup failed — see console for details. Any layers already created will be available in the system list.');
                      } finally {
                        setQuickBusy(false);
                      }
                    }}
                    disabled={quickBusy || !quickSetup.name.trim()}
                    className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1"
                  >
                    {quickBusy ? 'Creating…' : <>Create System <Check size={14} /></>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {editingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <ProductForm
              initialProduct={editingProduct}
              mode="edit"
              onSubmit={(updatedProduct) => {
                onProductUpdate(updatedProduct);
                setEditingProduct(null);
              }}
              onCancel={() => setEditingProduct(null)}
              currentUser={currentUser}
              customFields={customFields}
              treeNodes={treeNodes}
              suppliers={suppliers}
              usageAreas={usageAreas}
              units={units}
              colors={colors}
              onAddFieldDefinition={onAddFieldDefinition}
              onAddTreeNode={onAddTreeNode}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemBuilder;
