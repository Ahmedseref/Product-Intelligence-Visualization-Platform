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
import AdaptivePrimerSlot from './AdaptivePrimerSlot';
import { PrimerLibraryEntry } from '../../types';

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
  // Map of layerId → resolved primer entries reported back by each
  // AdaptivePrimerSlot. Used by Build-Up Preview and System Health to show
  // the live "→ <resolved primer>" hint and detect coverage gaps without
  // re-fetching from the right panel.
  const [resolvedPrimersByLayer, setResolvedPrimersByLayer] = useState<Record<string, PrimerLibraryEntry[]>>({});
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
  const [quickStep, setQuickStep] = useState<1 | 2 | 3 | 4>(1);
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
    // Phase 5 — Primer Library link. When useAdaptivePrimer is true, the
    // wizard creates the primer layer in **adaptive** mode (layerMode='adaptive')
    // and the actual products are resolved at render time from the Primer
    // Library based on the system's substrate/humidity/material type. The
    // per-product picker (primerProductIds) is hidden in that mode.
    // adaptivePrimerLibraryId optionally pins one library entry as the default.
    useAdaptivePrimer: boolean;
    adaptivePrimerLibraryId: string | null;
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
    useAdaptivePrimer: false,
    adaptivePrimerLibraryId: null,
    layers: QUICK_SKELETONS.epoxy.map(n => ({ name: n, productId: null })),
  });
  // (forward-declared so the Step 2 effect below can reference it via closure)
  // Phase 5 — live preview of which Primer Library entries match the Step 1
  // parameters. Refreshed whenever the user enters Step 2 (or those parameters
  // change while on Step 2) so the adaptive panel always reflects the current
  // intent. Empty array means "no library matches" → adaptive toggle is hidden.
  const [quickPrimerMatches, setQuickPrimerMatches] = useState<Array<{
    primerId: string; productId: string; productName: string; supplier: string | null;
    compatibleSubstrates: string[]; humidityTolerance: string; compatibleSystemTypes: string[];
  }>>([]);
  // Map the wizard's lowercase materialType to the Primer Library's canonical
  // system-type labels. Returns null for 'generic' so the resolve call doesn't
  // filter by system type at all (any-material primers all qualify).
  const QUICK_MATERIAL_TO_SYSTEM_TYPE: Record<QuickSetup['materialType'], string | null> = {
    epoxy: 'Epoxy', pu: 'PU', polyurea: 'Polyurea', acrylic: 'Acrylic', generic: null,
  };
  // Phase 5 — whenever the user enters Step 2 (or the Step 1 parameters
  // change while still on Step 2), re-resolve which Primer Library entries
  // would qualify. Substrate is passed only when exactly one was selected —
  // multi-substrate systems use an "any substrate" resolve so the user still
  // sees a meaningful preview.
  useEffect(() => {
    if (!quickSetupOpen || quickStep !== 2) return;
    let cancelled = false;
    const sub = quickSetup.substrate.length === 1 ? quickSetup.substrate[0] : null;
    const sysType = QUICK_MATERIAL_TO_SYSTEM_TYPE[quickSetup.materialType];
    primerLibraryApi.resolve({ substrate: sub, humidity: quickSetup.humidity || null, systemType: sysType })
      .then((rows) => { if (!cancelled) setQuickPrimerMatches(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setQuickPrimerMatches([]); });
    return () => { cancelled = true; };
  }, [quickSetupOpen, quickStep, quickSetup.substrate, quickSetup.humidity, quickSetup.materialType]);
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
      await refreshQualificationTags();
    })();
    return () => { cancelled = true; };
  }, [selectedSystemId, refreshQualificationTags]);

  // Compute the effective substrate to filter by, given precedence:
  //   layerSubstrateOverride > activeSectorContext override > systemSubstrate
  // Returns null when no substrate constraint should be applied.
  const getEffectiveSubstrate = useCallback((layerOverride?: string | null): string | null => {
    if (layerOverride) return layerOverride;
    const overrides = (fullSystem?.sectorOverrides || {}) as Record<string, { substrateOverride?: string | null }>;
    if (activeSectorContext && overrides[activeSectorContext]?.substrateOverride) {
      return overrides[activeSectorContext]!.substrateOverride!;
    }
    // If exactly one sector has an override defined and no explicit context
    // was chosen, use it automatically — it's almost certainly what the user
    // wants when there's only one possibility.
    const overrideSectors = Object.entries(overrides).filter(([_, v]) => v && v.substrateOverride);
    if (!activeSectorContext && overrideSectors.length === 1) {
      const only = overrideSectors[0][1] as { substrateOverride?: string | null };
      if (only.substrateOverride) return only.substrateOverride;
    }
    return fullSystem?.systemSubstrate || null;
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

  // Reset the resolved primer cache whenever the active system or its
  // parameters change. Without this the System Health gap stat and the
  // Build-Up Preview can briefly show resolved primers from the previous
  // system/params (false-green) until each AdaptivePrimerSlot's async
  // resolve returns and overwrites its slot. Keyed by id+substrate+humidity
  // so any header change forces a parameter-driven re-resolve from scratch.
  useEffect(() => {
    setResolvedPrimersByLayer({});
  }, [fullSystem?.id, fullSystem?.systemSubstrate, fullSystem?.systemHumidity]);

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
        // Carry over adaptive primer slot config so duplicates serve the
        // same conditions out of the box. Falls into the same updateLayer
        // batch as the spec values to keep this to one network call.
        const hasAdaptive = layer.layerMode === 'adaptive' || layer.defaultPrimerLibraryId;
        if (hasSpec || hasAdaptive) {
          await systemsApi.updateLayer(newLayer.layerId, {
            consumptionRateKgM2: layer.consumptionRateKgM2 ?? null,
            dftMicrons: layer.dftMicrons ?? null,
            recoatMinHours: layer.recoatMinHours ?? null,
            recoatMaxHours: layer.recoatMaxHours ?? null,
            layerMode: (layer.layerMode === 'adaptive' ? 'adaptive' : 'fixed'),
            defaultPrimerLibraryId: layer.defaultPrimerLibraryId ?? null,
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
    systemSubstrate?: string | null;
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
      fullSystem.systemSubstrate || fullSystem.systemHumidity || fullSystem.systemDuty ||
      Object.values((fullSystem.sectorOverrides || {}) as Record<string, { substrateOverride?: string | null }>).some(o => o?.substrateOverride) ||
      fullSystem.layers.some(l => l.layerSubstrateOverride)
    ));
    if (!fullSystem || !hasParams) return { kind: 'ok' };
    const tag = tagsByProduct[productId];
    if (!tag) return { kind: 'unqualified' };
    if (!tag.isSystemReady) return { kind: 'unqualified' };
    const messages: string[] = [];
    const expectedSubstrate = getEffectiveSubstrate(layer?.layerSubstrateOverride);
    if (expectedSubstrate) {
      const subs = tag.substrateTypes || [];
      if (!subs.includes(expectedSubstrate)) {
        const have = subs.length ? subs.join(', ') : '—';
        messages.push(`Substrate mismatch: product is for ${have}, system is configured for ${expectedSubstrate}`);
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
    const defaultCoverage = fullSystem.layers.filter(l => l.productOptions.some(o => o.isDefault)).length;
    // Adaptive primer gap check — for every primer-position layer in
    // adaptive mode, look up the resolved entries reported back by the
    // child AdaptivePrimerSlot. A layer with zero resolved entries is a
    // gap (the library has no primer for the system's parameters), which
    // promotes the overall status to at least amber.
    const adaptivePrimerLayers = fullSystem.layers.filter(l => l.layerMode === 'adaptive');
    const adaptivePrimerGaps = adaptivePrimerLayers.filter(l => (resolvedPrimersByLayer[l.layerId]?.length ?? 0) === 0).length;
    const baseStatus: 'green' | 'amber' | 'red' = conflictCount > 0 ? 'red' : (unqualifiedCount > 0 ? 'amber' : 'green');
    const status: 'green' | 'amber' | 'red' = adaptivePrimerGaps > 0 && baseStatus === 'green' ? 'amber' : baseStatus;
    return { conflictCount, unqualifiedCount, totalProducts, defaultCoverage, totalLayers: fullSystem.layers.length, firstConflictLayerId, status, adaptivePrimerLayers: adaptivePrimerLayers.length, adaptivePrimerGaps };
  }, [fullSystem, getProductConflicts, resolvedPrimersByLayer]);

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
      fullSystem.systemSubstrate ||
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
    effectiveSubstrate ? `substrate: ${effectiveSubstrate}` : null,
    fullSystem?.systemHumidity ? `humidity: ${fullSystem.systemHumidity}` : null,
    fullSystem?.systemDuty ? `duty: ${fullSystem.systemDuty}` : null,
  ].filter(Boolean).join(' · ') : '';

  const filteredProducts = (() => {
    // Step 1: text search filter (existing behavior)
    let pool = products;
    if (productSearch) {
      const parsed = parseSearchQuery(productSearch);
      pool = pool.filter((p) => {
        const searchableText = [p.name || '', p.stockCode || '', p.supplier || '', p.description || ''].join(' ');
        return matchesAdvancedSearch(searchableText, parsed);
      });
    }
    // Step 2: smart qualification filter (only when an open layer exists and
    // the user hasn't opted out via "Show all").
    if (!smartFilterActive) return pool;
    return pool.filter((p) => {
      const tag = tagsByProduct[p.id];
      if (!tag || !tag.isSystemReady) return false;
      // Layer-position filter — refuse to suggest a Primer product in a
      // Base Coat slot, etc. 'standalone' products are versatile so they
      // always pass; products without a layer_position tag are also kept
      // (legacy fallback so users aren't blocked by un-tagged data).
      if (activeLayerPos && tag.layerPosition && tag.layerPosition !== activeLayerPos && tag.layerPosition !== 'standalone') return false;
      // Substrate filter — same layer-aware logic as the wizard's Step 4:
      // products whose substrate is purely 'Over Primer'/'Over Base Coat'
      // are layered products and shouldn't be filtered against the system's
      // structural substrate (which only describes what the SYSTEM sits on).
      if (effectiveSubstrate) {
        const subs = tag.substrateTypes || [];
        const layeredOnly = subs.length > 0 && subs.every(s => s === 'Over Primer' || s === 'Over Base Coat');
        const layeredPos = tag.layerPosition === 'base_coat' || tag.layerPosition === 'intermediate' || tag.layerPosition === 'topcoat';
        const layeredSlot = activeLayerPos === 'base_coat' || activeLayerPos === 'intermediate' || activeLayerPos === 'topcoat';
        const isLayered = layeredOnly && (layeredPos || layeredSlot);
        if (!isLayered && !subs.includes(effectiveSubstrate)) return false;
      }
      if (fullSystem?.systemHumidity && tag.humidityTolerance !== fullSystem.systemHumidity) return false;
      if (fullSystem?.systemDuty && tag.dutyRating !== fullSystem.systemDuty) return false;
      // Material-chemistry filter — once the system has any chosen products
      // and they all share a single material, lock alternatives to that
      // chemistry.
      if (activeMaterialRegex) {
        const haystack = productMaterialPath[p.id] || '';
        if (!activeMaterialRegex.test(haystack)) return false;
      }
      return true;
    });
  })();

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
                  setQuickSetup({ name: '', materialType: 'epoxy', substrate: [], humidity: '', duty: '', primerProductIds: [], useAdaptivePrimer: false, adaptivePrimerLibraryId: null, layers: QUICK_SKELETONS.epoxy.map(n => ({ name: n, productId: null })) });
                  setQuickPrimerMatches([]);
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
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Substrate</label>
                      <select
                        value={fullSystem.systemSubstrate || ''}
                        onChange={(e) => handleSaveSystemParams({ systemSubstrate: e.target.value || null })}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        data-testid="system-substrate-select"
                      >
                        <option value="">— Any —</option>
                        {vocab.substrate.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
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

                      {/* ── Adaptive primer toggle ──
                          Only rendered for primer-position layers (name
                          contains "primer"). Switching to "Adaptive" hides
                          the manual product picker + product list below
                          and renders the AdaptivePrimerSlot panel which
                          resolves products from the Primer Library based
                          on the system's parameters. */}
                      {/* Always show the toggle when a layer is *currently*
                          adaptive, even if its name no longer matches the
                          primer regex — otherwise renaming a layer could
                          strand it in adaptive mode with no UI to switch
                          back to fixed and no product editing controls. */}
                      {(isPrimerLayer(layer.layerName) || layer.layerMode === 'adaptive') && (
                        <div className="px-3 py-1.5 bg-indigo-50/40 border-b border-indigo-100 flex items-center gap-2 text-[11px]">
                          <Library size={12} className="text-indigo-600" />
                          <span className="font-semibold text-indigo-700 uppercase tracking-wide text-[10px]">Primer mode</span>
                          <div className="inline-flex rounded-md overflow-hidden border border-indigo-200" data-testid={`primer-mode-toggle-${layer.layerId}`}>
                            <button
                              type="button"
                              onClick={() => systemsApi.updateLayer(layer.layerId, { layerMode: 'fixed', defaultPrimerLibraryId: null }).then(() => loadFullSystem(selectedSystemId!))}
                              className={`px-2 py-0.5 text-[11px] font-medium ${(layer.layerMode || 'fixed') === 'fixed' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-indigo-50'}`}
                            >
                              Fixed
                            </button>
                            <button
                              type="button"
                              onClick={() => systemsApi.updateLayer(layer.layerId, { layerMode: 'adaptive' }).then(() => loadFullSystem(selectedSystemId!))}
                              className={`px-2 py-0.5 text-[11px] font-medium ${layer.layerMode === 'adaptive' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-indigo-50'}`}
                            >
                              Adaptive
                            </button>
                          </div>
                          <span className="text-[10px] text-slate-500 italic">
                            {layer.layerMode === 'adaptive'
                              ? 'Product resolved from Primer Library at spec time'
                              : 'Manual product assignment'}
                          </span>
                        </div>
                      )}

                      {/* Adaptive primer slot panel — replaces the manual
                          product UI below when this layer is in adaptive
                          mode. The slot's resolve list is parameter-driven
                          and updates live as the system header changes. */}
                      {layer.layerMode === 'adaptive' && (
                        <AdaptivePrimerSlot
                          systemSubstrate={fullSystem.systemSubstrate}
                          systemHumidity={fullSystem.systemHumidity}
                          systemType={inferSystemType(fullSystem)}
                          defaultPrimerLibraryId={layer.defaultPrimerLibraryId ?? null}
                          onSetDefault={(primerId) =>
                            systemsApi
                              .updateLayer(layer.layerId, { defaultPrimerLibraryId: primerId })
                              .then(() => loadFullSystem(selectedSystemId!))
                          }
                          onResolved={(entries) => setResolvedPrimersByLayer(prev => ({ ...prev, [layer.layerId]: entries }))}
                        />
                      )}

                      {showAddProduct === layer.layerId && layer.layerMode !== 'adaptive' && (
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
                              {selectedProductIds.length > 0 ? `${selectedProductIds.length} selected` : `${filteredProducts.length} match${filteredProducts.length === 1 ? '' : 'es'}`}
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
                            {filteredProducts.slice(0, 50).map((prod) => {
                              const alreadyAdded = layer.productOptions.some((o) => o.productId === prod.id);
                              const isSelected = selectedProductIds.includes(prod.id);
                              return (
                                <div
                                  key={prod.id}
                                  className={`flex items-start gap-2.5 px-2.5 py-2 rounded-lg border cursor-pointer transition-all ${
                                    alreadyAdded
                                      ? 'bg-slate-50 border-slate-200 opacity-60 cursor-default'
                                      : isSelected
                                      ? 'bg-green-50 border-green-300 shadow-sm'
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
                                      <span className={`text-sm font-medium truncate ${alreadyAdded ? 'text-slate-500' : 'text-slate-800'}`}>
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
                            })}
                            {filteredProducts.length === 0 && (
                              <div className="py-6 text-center text-sm text-slate-400">
                                No products match your search
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {layer.layerMode !== 'adaptive' && (
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
                      )}
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
                            {/* Adaptive primer layers render their resolved
                                library entries instead of the manual product
                                options. The pinned default (if set) is
                                surfaced first; otherwise we show the count
                                of resolved alternatives. A red "no primer"
                                line fires when the library covers no primer
                                for the current parameters. */}
                            {layer.layerMode === 'adaptive' ? (
                              (() => {
                                const resolved = resolvedPrimersByLayer[layer.layerId] || [];
                                const pinned = layer.defaultPrimerLibraryId
                                  ? resolved.find(r => r.primerId === layer.defaultPrimerLibraryId)
                                  : null;
                                if (resolved.length === 0) {
                                  return (
                                    <div className="ml-7 mt-1 text-[11px] text-amber-700 flex items-center gap-1">
                                      <AlertTriangle size={9} className="text-amber-600" />
                                      Adaptive — no primer in library matches the system parameters
                                    </div>
                                  );
                                }
                                return (
                                  <div className="ml-7 mt-1 space-y-0.5">
                                    <div className="text-[11px] text-indigo-700 flex items-center gap-1">
                                      <Library size={9} className="text-indigo-600" />
                                      {pinned ? (
                                        <>
                                          <Star size={8} className="text-amber-500" fill="currentColor" />
                                          {pinned.productName || pinned.productId}
                                        </>
                                      ) : (
                                        <>Adaptive · {resolved.length} primer{resolved.length === 1 ? '' : 's'} resolve</>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()
                            ) : defaultProducts.length > 0 ? (
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
                    {systemHealth.adaptivePrimerLayers > 0 && (
                      <div className={`text-[11px] mt-1 ${systemHealth.adaptivePrimerGaps > 0 ? 'text-amber-700' : 'text-slate-600'}`}>
                        {systemHealth.adaptivePrimerGaps > 0
                          ? `${systemHealth.adaptivePrimerGaps} adaptive primer layer${systemHealth.adaptivePrimerGaps === 1 ? '' : 's'} unresolved — add primers to the library`
                          : `${systemHealth.adaptivePrimerLayers} adaptive primer layer${systemHealth.adaptivePrimerLayers === 1 ? '' : 's'} resolved`}
                      </div>
                    )}
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
            {/* Step pills — 4 steps now: Parameters → Primer → Material & Layers → Pick Products */}
            <div className="px-5 py-2 flex items-center gap-2 border-b border-slate-100 bg-slate-50">
              {[1, 2, 3, 4].map(s => (
                <div key={s} className={`flex items-center gap-1.5 text-xs font-medium ${quickStep >= s ? 'text-indigo-700' : 'text-slate-400'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${quickStep >= s ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{s}</span>
                  {s === 1 ? 'Parameters' : s === 2 ? 'Primer' : s === 3 ? 'Material & Layers' : 'Pick Products'}
                  {s < 4 && <ChevronRight size={12} className="text-slate-300" />}
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
                  <p className="text-[11px] text-slate-500">These parameters power the primer pool in Step 2, the per-layer product suggestions in Step 4, and the conflict detection after creation.</p>
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
                const primerCandidates = products.filter(p => {
                  const t = tagsByProduct[p.id];
                  if (!t || !t.isSystemReady) return false;
                  if (quickSetup.substrate.length > 0 && !(t.substrateTypes || []).some(s => quickSetup.substrate.includes(s))) return false;
                  if (quickSetup.humidity && t.humidityTolerance && t.humidityTolerance !== quickSetup.humidity) return false;
                  if (quickSetup.duty && t.dutyRating && t.dutyRating !== quickSetup.duty) return false;
                  // "Looks like a primer" check.
                  if (t.layerPosition === 'primer') return true;
                  if (!t.layerPosition) {
                    const haystack = productMaterialPath[p.id] || '';
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
                const adaptiveAvailable = quickPrimerMatches.length > 0;
                return (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-500">
                      Pick one or more primers for this system. The list below is filtered by the parameters from Step&nbsp;1 — only system-ready products that look like primers (tagged or named) are shown. If you pick several, they all live on the <strong>same primer layer</strong> as alternatives — the first one you tick is the default, the others are swap-in options.
                    </p>
                    {/* Phase 5 — Primer Library link. Show an "Adaptive (from
                        Primer Library)" panel above the manual product list
                        whenever any library entries match the Step 1 parameters.
                        Toggling it on creates the primer layer in adaptive mode
                        on Save — the per-product picker is hidden in that mode
                        because the adaptive layer resolves products live. */}
                    {adaptiveAvailable && (
                      <div className={`border rounded-lg p-3 ${quickSetup.useAdaptivePrimer ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={quickSetup.useAdaptivePrimer}
                            onChange={(e) => setQuickSetup({
                              ...quickSetup,
                              useAdaptivePrimer: e.target.checked,
                              // When switching to adaptive mode, clear the manual
                              // primer picks so they don't sneak into the saved
                              // layer alongside the adaptive resolution.
                              primerProductIds: e.target.checked ? [] : quickSetup.primerProductIds,
                              adaptivePrimerLibraryId: e.target.checked ? quickSetup.adaptivePrimerLibraryId : null,
                            })}
                            className="mt-0.5 w-3.5 h-3.5 accent-amber-600"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-slate-800">Use adaptive primer (from Primer Library)</span>
                              <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-700 border border-amber-200">{quickPrimerMatches.length} match{quickPrimerMatches.length === 1 ? '' : 'es'}</span>
                              <span className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-50 text-indigo-700 border border-indigo-100">recommended</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Resolves primers live from the Primer Library based on the system's substrate, humidity and material type. New products added to the library later automatically appear in this slot — no manual edit needed.
                            </p>
                          </div>
                        </label>
                        {quickSetup.useAdaptivePrimer && (
                          <div className="mt-3 space-y-2">
                            <div className="max-h-48 overflow-y-auto divide-y divide-amber-100 border border-amber-100 rounded bg-white">
                              {quickPrimerMatches.map((m) => {
                                const isDefault = quickSetup.adaptivePrimerLibraryId === m.primerId;
                                return (
                                  <label key={m.primerId} className={`flex items-start gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-amber-50/40 ${isDefault ? 'bg-amber-50/60' : ''}`}>
                                    <input
                                      type="radio"
                                      name="quick-adaptive-default"
                                      checked={isDefault}
                                      onChange={() => setQuickSetup({ ...quickSetup, adaptivePrimerLibraryId: m.primerId })}
                                      className="mt-1 accent-amber-600"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-slate-800 font-medium truncate">{m.productName}</span>
                                        {m.supplier && <span className="text-[11px] text-slate-400">· {m.supplier}</span>}
                                        {isDefault && <span className="px-1.5 py-0.5 text-[9px] rounded bg-emerald-50 text-emerald-700 border border-emerald-100">default</span>}
                                      </div>
                                      <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                        {(m.compatibleSubstrates || []).slice(0, 4).map(s => (
                                          <span key={s} className="px-1.5 py-0.5 text-[9px] rounded bg-slate-100 text-slate-600">{s}</span>
                                        ))}
                                        {m.humidityTolerance && <span className="px-1.5 py-0.5 text-[9px] rounded bg-blue-50 text-blue-700">H: {m.humidityTolerance}</span>}
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                            <p className="text-[11px] text-amber-700">
                              {quickSetup.adaptivePrimerLibraryId
                                ? <>Default pinned. The other matches stay available as swap-in alternatives.</>
                                : <>Pick a default (optional). If left unset, the first resolved entry will be used by default.</>}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Manual per-product picker — hidden when adaptive mode
                        is on, because the two modes are mutually exclusive on
                        the same layer. */}
                    {!quickSetup.useAdaptivePrimer && (
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
                    )}
                    {/* Footnote when adaptive mode is on — explains where the
                        manual product picker went so the user isn't confused. */}
                    {quickSetup.useAdaptivePrimer && (
                      <p className="text-[11px] text-slate-500 italic">
                        Manual product picker is hidden while adaptive mode is on. To pick specific primer products instead, untick the adaptive option above.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* STEP 3 — pick the material type → seeds the post-primer layer
                  skeleton. The user can rename, remove, or add layers freely.
                  The primer is shown above as a read-only reminder so the user
                  always sees the full layer order. */}
              {quickStep === 3 && (
                <div className="space-y-3">
                  {/* Read-only primer reminder. All selected primers live on
                      ONE Primer layer as alternatives, so we render them
                      grouped under a single layer #1 row — the first one is
                      flagged as the default. */}
                  {quickSetup.useAdaptivePrimer && (
                    <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1.5 text-[11px] text-amber-800">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-[9px] font-bold">1</span>
                        <span className="font-semibold">Primer layer · Adaptive (Primer Library)</span>
                        <span className="ml-auto text-amber-600">{quickPrimerMatches.length} resolved match{quickPrimerMatches.length === 1 ? '' : 'es'} (set in Step 2 — go back to change)</span>
                      </div>
                    </div>
                  )}
                  {!quickSetup.useAdaptivePrimer && quickSetup.primerProductIds.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-[11px] text-slate-500">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[9px] font-bold">1</span>
                        <span className="font-semibold text-slate-700">Primer layer</span>
                        <span className="text-slate-400">·</span>
                        <span>{quickSetup.primerProductIds.length} {quickSetup.primerProductIds.length === 1 ? 'product' : 'alternatives'}</span>
                        <span className="ml-auto text-slate-400">(set in Step 2 — go back to change)</span>
                      </div>
                      <ul className="ml-6 space-y-0.5">
                        {quickSetup.primerProductIds.map((id, i) => {
                          const sel = products.find(p => p.id === id);
                          return (
                            <li key={id} className="flex items-center gap-2">
                              <span className="text-slate-400">•</span>
                              <span className="text-slate-700">{sel?.name || '—'}</span>
                              {i === 0 && (
                                <span className="px-1.5 py-0.5 text-[9px] rounded bg-emerald-50 text-emerald-700 border border-emerald-100">default</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-2">Material type — sets the suggested layer skeleton</label>
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
                          {/* Slot index labels are offset by the number of
                              selected primers — those occupy the first slots,
                              so e.g. with 2 primers the first post-primer
                              layer is shown as #3. */}
                          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                            {i + 1 + quickSetup.primerProductIds.length}
                          </span>
                          <input type="text" value={slot.name} onChange={(e) => { const ls = [...quickSetup.layers]; ls[i] = { ...ls[i], name: e.target.value }; setQuickSetup({ ...quickSetup, layers: ls }); }} className="flex-1 px-2 py-1 text-sm border border-slate-200 rounded" />
                          <button type="button" onClick={() => setQuickSetup({ ...quickSetup, layers: quickSetup.layers.filter((_, j) => j !== i) })} className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={13} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4 — for each post-primer layer slot, list products that match BOTH:
                    - the system-wide parameters from Step 1 (substrate / humidity / duty), AND
                    - the layer position inferred from the slot name in Step 3, AND
                    - the material type chosen in Step 3.
                  Products that haven't been qualified for a layer position
                  yet are still shown (legacy fallback) so the user is never
                  blocked by un-tagged products. */}
              {quickStep === 4 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">
                    Pick a default product for each layer (optional). Products are filtered by the parameters from Step 1 <em>and</em> the layer position inferred from each slot name in Step 3
                    {quickSetup.materialType !== 'generic' && (
                      <> — only <strong>{quickSetup.materialType === 'pu' ? 'PU/Polyurethane' : quickSetup.materialType[0].toUpperCase() + quickSetup.materialType.slice(1)}</strong> products (matched by taxonomy or name) are shown.</>
                    )}
                  </p>
                  {quickSetup.layers.map((slot, i) => {
                    // Infer this slot's layer position from its name. Null = no
                    // per-slot filter (slot name is custom or ambiguous).
                    const slotPos = inferLayerPositionFromSlotName(slot.name);
                    // Material-type filter — applied uniformly across all slots
                    // so picking PU never lets an Epoxy primer through.
                    const materialRegex = MATERIAL_KEYWORDS[quickSetup.materialType];
                    // Pretty label for the inferred-position pill.
                    const slotPosLabel = slotPos
                      ? slotPos === 'base_coat' ? 'Base Coat'
                        : slotPos === 'topcoat' ? 'Topcoat'
                        : slotPos === 'primer' ? 'Primer'
                        : slotPos === 'intermediate' ? 'Intermediate'
                        : 'Standalone'
                      : null;
                    // Filter products that are system-ready and match the chosen parameters.
                    const matches = products.filter(p => {
                      const t = tagsByProduct[p.id];
                      if (!t || !t.isSystemReady) return false;
                      // Substrate filter — the user's Step 1 substrate (e.g.
                      // Concrete) describes what the SYSTEM sits on, which
                      // really only constrains substrate-touching products
                      // (primers and standalone). Layered products (base
                      // coats / intermediates / topcoats) are always tagged
                      // with internal substrates like 'Over Primer' / 'Over
                      // Base Coat' — they sit on the primer the user picks
                      // in Step 2, not on Concrete. So a product whose
                      // substrate list is purely layered should always pass
                      // the user's substrate filter; only products with at
                      // least one "real" substrate need to match.
                      if (quickSetup.substrate.length > 0) {
                        const subs = t.substrateTypes || [];
                        const layeredOnly = subs.length > 0 && subs.every(s => s === 'Over Primer' || s === 'Over Base Coat');
                        // Belt-and-braces: only treat the product as "layered"
                        // for substrate-bypass purposes when its layer_position
                        // also confirms it (or the slot itself does). Prevents
                        // a mis-tagged primer with substrate=['Over Primer']
                        // from sneaking through the substrate gate.
                        const layeredPos = t.layerPosition === 'base_coat' || t.layerPosition === 'intermediate' || t.layerPosition === 'topcoat';
                        const layeredSlot = slotPos === 'base_coat' || slotPos === 'intermediate' || slotPos === 'topcoat';
                        if (!(layeredOnly && (layeredPos || layeredSlot))
                            && !subs.some(s => quickSetup.substrate.includes(s))) return false;
                      }
                      if (quickSetup.humidity && t.humidityTolerance && t.humidityTolerance !== quickSetup.humidity) return false;
                      if (quickSetup.duty && t.dutyRating && t.dutyRating !== quickSetup.duty) return false;
                      // Per-layer filter — only enforced when both the slot name
                      // mapped to a known position AND the product was actually
                      // tagged with one. 'standalone' products are versatile
                      // enough to fit any slot, so they always pass.
                      if (slotPos && t.layerPosition && t.layerPosition !== slotPos && t.layerPosition !== 'standalone') return false;
                      // Material-type filter — keeps the suggestions chemistry-
                      // correct. Picking PU must never surface Epoxy primers,
                      // and vice versa. Match against the precomputed
                      // taxonomy-path-plus-name string.
                      if (materialRegex) {
                        const haystack = productMaterialPath[p.id] || '';
                        if (!materialRegex.test(haystack)) return false;
                      }
                      return true;
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

            {/* Footer — Back / Next / Create. Only the Create button (Step 4) writes to the DB. */}
            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
              <button onClick={() => setQuickSetupOpen(false)} className="text-xs text-slate-500 hover:text-slate-700" disabled={quickBusy}>Cancel & use empty editor</button>
              <div className="flex items-center gap-2">
                {quickStep > 1 && (
                  <button
                    onClick={() => setQuickStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : 1))}
                    className="px-3 py-1.5 text-sm bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 inline-flex items-center gap-1"
                    disabled={quickBusy}
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                )}
                {quickStep < 4 ? (
                  <button
                    onClick={() => setQuickStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : 4))}
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
                          // The system header carries a single substrate.
                          // If the user selected exactly one, persist it.
                          // If they selected multiple, leave it null — the wizard
                          // already used the multi-selection to filter Step 3
                          // products, and the user can refine the system header
                          // afterwards in the regular editor.
                          systemSubstrate: quickSetup.substrate.length === 1 ? quickSetup.substrate[0] : null,
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
                        // Phase 5 — when adaptive mode is on, create the
                        // primer layer in 'adaptive' mode and skip product
                        // options entirely. The layer resolves its products
                        // live from the Primer Library at render time, with
                        // adaptivePrimerLibraryId as the optional pinned
                        // default. Otherwise fall back to the legacy fixed
                        // mode where each picked product becomes an option.
                        if (quickSetup.useAdaptivePrimer) {
                          const primerLayer = await systemsApi.createLayer({ systemId: newId, layerName: 'Primer', orderSequence: layerOrder++ });
                          const primerLayerId = (primerLayer as any).layerId || (primerLayer as any).id;
                          await systemsApi.updateLayer(primerLayerId, {
                            layerMode: 'adaptive',
                            defaultPrimerLibraryId: quickSetup.adaptivePrimerLibraryId,
                          });
                        } else if (quickSetup.primerProductIds.length > 0) {
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
