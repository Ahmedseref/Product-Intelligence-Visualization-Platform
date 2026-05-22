// =============================================================================
// SystemBuilderPreview.tsx
// -----------------------------------------------------------------------------
// Read-only "catalog" tab for the System Builder. Renders a card grid of every
// system in the database; clicking a card opens a PPG-style technical preview
// modal that shows a coloured cross-section build-up on the left and the
// per-layer product details on the right.
//
// Design choices worth noting:
//
// 1. Layer-position colours are defined in a single LAYER_COLORS map so the
//    card-grid colour strip and the modal cross-section stay perfectly in
//    sync. Adding a new position is a one-line change.
//
// 2. The component fetches qualification tags ONCE in bulk (GET
//    /api/qualification-tags) on mount and stores them in a Map keyed by
//    productId. Opening many modals therefore costs zero extra network
//    requests and the spec's N+1 concern is avoided structurally rather than
//    fixed reactively.
//
// 3. Material chemistry is inferred per system from the products already
//    chosen across all its layers — same heuristic the System Builder uses
//    in its smart filter — so the card badge is always consistent with what
//    the user actually built.
//
// 4. The "is_final_layer" badge in the spec doesn't exist as a column in
//    this codebase. We derive it: the layer with the highest orderSequence
//    in a system is treated as the final layer. This avoids a destructive
//    schema change while still surfacing the visual cue.
//
// 5. The modal uses a min-height wrapper instead of position:fixed (per the
//    spec). It still acts like a modal because the parent component only
//    renders this wrapper when a system is selected and we render a
//    full-page overlay element with z-index above the rest of the app.
//
// 6. "Export spec sheet" is implemented as a client-side .txt download
//    rather than a sendPrompt() call. The codebase has no LLM bridge, so a
//    self-contained, immediately-useful artefact is the right call.
//
// 7. The inline preview_note editor debounces 600 ms before saving via
//    PATCH (well, PUT — the existing route is PUT, the spec said PATCH but
//    we follow the actual API).
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, X, Search, Edit3, Download, AlertCircle, Star, Layers, Check, GitCompare, Filter, FileDown, Loader2, Sparkles } from 'lucide-react';
import { SystemAIFillPanel, AiFillButton, type AiFillResult } from './SystemAIFill';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { systemsApi, primerLibraryApi } from '../client/api';
import type { PrimerLibraryEntry } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';

// We don't import API_BASE / getAuthHeaders from client/api.ts because they
// aren't exported from there (kept module-private). Re-declare them locally
// — same convention used by SystemBuilderQualification.tsx.
const API_BASE = '/api';
function authHeaders(): HeadersInit {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------------------------------------------------------------------------
// Types — kept loose because the API hasn't been TypeScript-formalised here.
// ---------------------------------------------------------------------------

type SystemRow = {
  systemId: string;
  name: string;
  description?: string | null;
  status?: string | null;
  systemSubstrate?: string | null;
  systemHumidity?: string | null;
  systemDuty?: string | null;
  previewNote?: string | null;
  // Free-form "where this system is typically used" — stored newline-joined
  // in systems.typical_uses. Read+split into sentences for display, edited
  // via AI Fill (the UI doesn't expose a freeform text editor for it yet).
  typicalUses?: string | null;
  // Installable-spec total dry-film thickness range (millimetres). Both
  // sides nullable so legacy systems and partially-spec'd systems remain
  // valid; the cross-section formatter uses fmtSpecRange to render only
  // what's set.
  totalThicknessMinMm?: number | null;
  totalThicknessMaxMm?: number | null;
};

type ProductOption = {
  optionId: string;
  layerId: string;
  productId: string;
  isDefault?: boolean | null;
  benefit?: string | null;
  productName?: string | null;
  productStockCode?: string | null;
  productSupplier?: string | null;
};

type LayerRow = {
  layerId: string;
  systemId: string;
  layerName: string;
  orderSequence: number;
  layerSubstrateOverride?: string | null;
  notes?: string | null;
  productOptions: ProductOption[];
  // Per-layer installable-spec values. All independently optional so
  // partially-spec'd layers render only the fields that are set; the
  // formatter helpers (fmtSpec / fmtSpecRange) gracefully handle nulls.
  consumptionRateKgM2?: number | null;
  dftMicrons?: number | null;
  recoatMinHours?: number | null;
  recoatMaxHours?: number | null;
  // Per-layer marketing/technical content for the System Preview cards.
  // Populated either by the user or by the System AI Fill flow.
  previewDescription?: string | null;
  previewProperties?: string[] | null;
  // Adaptive primer mode: when 'adaptive', the layer renders a primer
  // resolved from the Primer Library against the system parameters
  // instead of a fixed productOptions list.
  layerMode?: 'fixed' | 'adaptive' | null;
  defaultPrimerLibraryId?: string | null;
};

type FullSystem = SystemRow & { layers: LayerRow[] };

type QualificationTag = {
  productId: string;
  substrateTypes?: string[] | null;
  humidityTolerance?: string | null;
  dutyRating?: string | null;
  finishType?: string | null;
  layerPosition?: string | null;
  isSystemReady?: boolean | null;
};

// ---------------------------------------------------------------------------
// Layer-position visual mapping. Centralised here so the card colour strip
// and the modal cross-section both look the same.
// ---------------------------------------------------------------------------
const LAYER_COLORS: Record<string, { fill: string; accent: string; text: string; label: string }> = {
  primer:       { fill: '#FAEEDA', accent: '#BA7517', text: '#633806', label: 'Primer'       },
  base_coat:    { fill: '#E6F1FB', accent: '#378ADD', text: '#0C447C', label: 'Base coat'    },
  intermediate: { fill: '#F1EFE8', accent: '#888780', text: '#444441', label: 'Intermediate' },
  topcoat:      { fill: '#EAF3DE', accent: '#639922', text: '#27500A', label: 'Topcoat'      },
  standalone:   { fill: '#F1EFE8', accent: '#888780', text: '#444441', label: 'Standalone'   },
  unknown:      { fill: '#F1EFE8', accent: '#D3D1C7', text: '#888780', label: 'Layer'        },
};

// ---------------------------------------------------------------------------
// Installable-spec value formatters.
//   - fmtSpec returns "<value><suffix>" for a single non-null number; returns
//     `null` (NOT a dash) when the value is missing so callers can decide
//     whether to render a placeholder or skip the field entirely. We strip
//     trailing zeros from decimals so 0.30 → "0.3" but 0 → "0" (kept).
//   - fmtSpecRange returns "min–max suffix" when both sides are present, a
//     single value with a "≤" / "≥" prefix when only one side is set, or
//     `null` when both are missing.
// ---------------------------------------------------------------------------
function fmtSpecNumber(n: number): string {
  // Six significant digits is more precision than any coatings spec needs;
  // toFixed(2) would lose 0.05 kg/m² primer values. Number(...) round-trip
  // strips trailing zeros while keeping the canonical short form.
  return String(Number(n.toPrecision(6)));
}
function fmtSpec(value: number | null | undefined, suffix: string): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${fmtSpecNumber(value)}${suffix ? ' ' + suffix : ''}`;
}
function fmtSpecRange(min: number | null | undefined, max: number | null | undefined, suffix: string): string | null {
  const hasMin = min != null && Number.isFinite(min);
  const hasMax = max != null && Number.isFinite(max);
  if (!hasMin && !hasMax) return null;
  const tail = suffix ? ' ' + suffix : '';
  if (hasMin && hasMax) {
    if (min === max) return `${fmtSpecNumber(min)}${tail}`;
    return `${fmtSpecNumber(min)}–${fmtSpecNumber(max)}${tail}`;
  }
  if (hasMin) return `≥ ${fmtSpecNumber(min!)}${tail}`;
  return `≤ ${fmtSpecNumber(max!)}${tail}`;
}
// Build a compact, human-friendly spec summary for a layer row. Returns
// `null` when the layer has no spec values at all so callers can skip the
// rendering entirely. Order matches the natural reading order on a
// technical data sheet: how-much / how-thick / when-to-recoat.
type LayerSpecLike = {
  consumptionRateKgM2?: number | null;
  dftMicrons?: number | null;
  recoatMinHours?: number | null;
  recoatMaxHours?: number | null;
};
function buildLayerSpecSummary(l: LayerSpecLike): string | null {
  const parts: string[] = [];
  const consumption = fmtSpec(l.consumptionRateKgM2, 'kg/m²');
  if (consumption) parts.push(consumption);
  const dft = fmtSpec(l.dftMicrons, 'μm DFT');
  if (dft) parts.push(dft);
  const recoat = fmtSpecRange(l.recoatMinHours, l.recoatMaxHours, 'h recoat');
  if (recoat) parts.push(recoat);
  return parts.length ? parts.join(' · ') : null;
}

// ---------------------------------------------------------------------------
// Material chemistry detection. Same regex set used by the System Builder's
// smart filter, duplicated here intentionally so this component can stand
// on its own without depending on the (large) SystemBuilder file.
// ---------------------------------------------------------------------------
const MATERIAL_KEYWORDS: Record<'epoxy' | 'pu' | 'polyurea' | 'acrylic', { rx: RegExp; label: string; color: string }> = {
  epoxy:    { rx: /\b(epoxy|epoks(?:i|y))\b/i,                 label: 'Epoxy',    color: 'bg-blue-100 text-blue-700 border-blue-200'         },
  pu:       { rx: /\b(pu|polyurethane|poliuretan)\b/i,         label: 'PU',       color: 'bg-amber-100 text-amber-700 border-amber-200'      },
  polyurea: { rx: /\b(polyurea|poliurea)\b/i,                  label: 'Polyurea', color: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200' },
  acrylic:  { rx: /\b(acrylic|akrilik)\b/i,                    label: 'Acrylic',  color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

// ---------------------------------------------------------------------------
// Layer name → position. Same heuristic the System Builder uses, kept in
// sync intentionally. Returns null when the name doesn't pattern-match (so
// callers can fall back to "unknown" colour).
// ---------------------------------------------------------------------------
function inferLayerPositionFromSlotName(slotName: string): keyof typeof LAYER_COLORS | null {
  const n = (slotName || '').toLowerCase().trim();
  if (!n) return null;
  if (/\bprimer\b/.test(n)) return 'primer';
  if (/\b(top|finish|finisher|sealer|seal)\s*coat\b/.test(n) || /\btopcoat\b/.test(n)) return 'topcoat';
  if (/\bintermediate\b/.test(n)) return 'intermediate';
  if (/\b(base|body|build)\s*coat\b/.test(n) || /\bbasecoat\b/.test(n)) return 'base_coat';
  // Generic "<material> coat" shorthands (Polyurea Coat, Epoxy Coat, ...).
  if (/\b(polyurea|epoxy|epoks(?:i|y)|pu|polyurethane|acrylic|akrilik)\s+coat\b/.test(n)) return 'base_coat';
  if (/\bstandalone\b|\bself[-\s]?leveling\b|\bself[-\s]?levelling\b/.test(n)) return 'standalone';
  return null;
}

// ---------------------------------------------------------------------------
// Detect the dominant material for a system from the supplier/name/desc of
// its products. Returns null when nothing matches or there's a tie.
// ---------------------------------------------------------------------------
function inferSystemMaterial(layers: LayerRow[]): keyof typeof MATERIAL_KEYWORDS | null {
  const haystacks: string[] = [];
  for (const l of layers) for (const o of l.productOptions) {
    haystacks.push([o.productName || '', o.productSupplier || ''].join(' '));
  }
  if (haystacks.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const h of haystacks) {
    for (const [key, m] of Object.entries(MATERIAL_KEYWORDS)) {
      if (m.rx.test(h)) {
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  // Tie at the top → undecided.
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0] as keyof typeof MATERIAL_KEYWORDS;
}

// ---------------------------------------------------------------------------
// Reusable: pretty colour pill for a tag value (substrate / duty / finish).
// ---------------------------------------------------------------------------
// Typed as React.FC so JSX's automatic `key` attribute is accepted by
// callers that render a TagPill inside a `.map()`.
const TagPill: React.FC<{ children: React.ReactNode; tone?: 'slate' | 'green' | 'amber' | 'rose' }> = ({ children, tone = 'slate' }) => {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    rose:  'bg-rose-100 text-rose-700 border-rose-200',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${tones[tone]}`}>
      {children}
    </span>
  );
};

// Small XML/HTML escape used by the PDF export's hidden DOM builder.
function escapeHtml(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// ---------------------------------------------------------------------------
// Bulk fetch helper.
// ---------------------------------------------------------------------------
async function fetchAllQualificationTags(): Promise<Record<string, QualificationTag>> {
  const res = await fetch(`${API_BASE}/qualification-tags`, { headers: authHeaders() });
  if (!res.ok) return {};
  const rows: QualificationTag[] = await res.json();
  const map: Record<string, QualificationTag> = {};
  for (const r of rows) if (r.productId) map[r.productId] = r;
  return map;
}

// ===========================================================================
// Main component
// ===========================================================================
interface Props {
  // Lets the parent (SystemBuilder) switch to the Builder tab and select the
  // system the user wants to edit.
  onEditInBuilder: (systemId: string) => void;
}

export default function SystemBuilderPreview({ onEditInBuilder }: Props) {
  const [systems, setSystems] = useState<SystemRow[]>([]);
  const [systemLayersBySys, setSystemLayersBySys] = useState<Record<string, LayerRow[]>>({});
  const [tagsByProduct, setTagsByProduct] = useState<Record<string, QualificationTag>>({});
  const [loading, setLoading] = useState(true);

  // Filters (all client-side)
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<'all' | keyof typeof MATERIAL_KEYWORDS>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'draft'>('all');
  const [filterSubstrate, setFilterSubstrate] = useState<string>('all');

  // Modal state
  const [openSystemId, setOpenSystemId] = useState<string | null>(null);
  const [openSystem, setOpenSystem] = useState<FullSystem | null>(null);
  const [openLoading, setOpenLoading] = useState(false);
  const [highlightLayerId, setHighlightLayerId] = useState<string | null>(null);
  // For the "alternatives" pill switcher: which optionId is active per layer.
  const [activeOptionByLayer, setActiveOptionByLayer] = useState<Record<string, string>>({});
  // For adaptive primer layers in the open system: layerId → resolved
  // PrimerLibraryEntry list. Populated once when the modal opens by
  // calling primerLibraryApi.resolve for each adaptive primer layer.
  const [resolvedPrimersByLayer, setResolvedPrimersByLayer] = useState<Record<string, PrimerLibraryEntry[]>>({});

  // Inline preview-note editor.
  const [noteText, setNoteText] = useState<string>('');
  const [noteSaving, setNoteSaving] = useState(false);
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inline usage-areas editor — newline-separated sentences, debounced
  // autosave to systems.typical_uses (mirrors the preview-note pattern).
  const [usesText, setUsesText] = useState<string>('');
  const [usesSaving, setUsesSaving] = useState(false);
  const usesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- AI Fill state ----------
  // Per-system proposal currently under review in the modal. `null` means
  // no proposal has been generated (or it was discarded). When set, the
  // SystemAIFillPanel slides in below the modal body.
  const [aiProposal, setAiProposal] = useState<AiFillResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // ---------- AI Fill all systems batch state ----------
  // The batch generates proposals sequentially (one HTTP request at a time,
  // with a 3s gap between requests to respect upstream rate limits). Results
  // are queued and reviewed one-by-one — clicking on a queued system opens
  // its modal pre-populated with the proposal.
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; current: string | null }>({ done: 0, total: 0, current: null });
  const [batchQueue, setBatchQueue] = useState<Record<string, AiFillResult>>({});
  const [batchErrors, setBatchErrors] = useState<Record<string, string>>({});
  const batchCancelRef = useRef(false);

  // ---------- "Make default" inline action state ----------
  // Per-layer in-flight set — multiple layers can be saving in parallel
  // without trampling each other's loading indicator. A request-token map
  // lets the rollback path ignore stale responses if a newer request for
  // the same layer has already been issued.
  const [makingDefaultLayers, setMakingDefaultLayers] = useState<Set<string>>(() => new Set());
  const [makeDefaultErrors, setMakeDefaultErrors] = useState<Record<string, string>>({});
  const makeDefaultTokens = useRef<Record<string, number>>({});

  // ---------- Compare basket + comparison modal state ----------
  // We cap the basket at 2 systems intentionally — visually a 2-up layout
  // is the only one that fits inside the modal width without compromise.
  const COMPARE_MAX = 2;
  const [compareIds, setCompareIds] = useState<string[]>([]);
  // Brief inline hint when the user tries to add a third selection — used
  // instead of silently replacing oldest (which felt random per architect
  // feedback). Cleared automatically after 2.5s.
  const [compareHint, setCompareHint] = useState<string | null>(null);
  const compareHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareSystems, setCompareSystems] = useState<[FullSystem | null, FullSystem | null]>([null, null]);
  // Monotonic request id — only the latest in-flight openCompareModal call
  // is allowed to commit its result, so closing/re-opening with a different
  // selection can't be overwritten by a stale earlier response.
  const compareRequestRef = useRef<number>(0);

  // ---------- Catalog Export panel state ----------
  // The panel sits between the filter bar and the card grid. When `scope`
  // is 'selected', card clicks toggle export selection instead of opening
  // the preview modal — see openModal() guard below.
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [exportScope, setExportScope] = useState<'active' | 'draft' | 'all' | 'selected'>('active');
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<string>>(() => new Set());
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const exportToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exportOpts, setExportOpts] = useState({
    includeCover: true,
    includeCrossSection: true,
    includeParameters: true,
    includeProducts: true,
    includeAlternatives: true,
    includeRecommendations: true,
    includePrimerChart: true,
    hideStockCodes: false,
    hideSuppliers: false,
    hideStatus: false,
    format: 'docx' as 'docx' | 'pdf',
  });
  // Hidden offscreen container we render printable system summaries into
  // while building the PDF (html2canvas needs real DOM, not detached nodes).
  const pdfStageRef = useRef<HTMLDivElement | null>(null);

  // ---------- initial load ----------
  // We pre-fetch the full system payloads for every system so the cards can
  // show colour strips, supplier list and material badge without per-card
  // network waits. To keep this from melting under large catalogs we:
  //   - cap concurrency at 5 in-flight requests at a time
  //   - check a `cancelled` flag after every fetch so we don't update state
  //     after the component unmounts (e.g. when the user switches tabs)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [sysList, tagMap] = await Promise.all([
          systemsApi.getSystems() as Promise<SystemRow[]>,
          fetchAllQualificationTags(),
        ]);
        if (cancelled) return;
        setSystems(sysList);
        setTagsByProduct(tagMap);

        // Bounded-parallelism fetch loop. Five concurrent requests keep the
        // server responsive while still hydrating ~50-system catalogs in a
        // second or two.
        const layersMap: Record<string, LayerRow[]> = {};
        const POOL = 5;
        let cursor = 0;
        const worker = async () => {
          while (!cancelled && cursor < sysList.length) {
            const i = cursor++;
            const sys = sysList[i];
            try {
              const full = await systemsApi.getSystemFull(sys.systemId);
              if (cancelled) return;
              if (full && Array.isArray(full.layers)) {
                layersMap[sys.systemId] = [...full.layers].sort((a, b) => (a.orderSequence ?? 0) - (b.orderSequence ?? 0));
              }
            } catch { /* leave that system out — card will just have no strip */ }
          }
        };
        await Promise.all(Array.from({ length: Math.min(POOL, sysList.length) }, () => worker()));
        if (cancelled) return;
        setSystemLayersBySys(layersMap);
      } catch (e) {
        console.error('SystemBuilderPreview load failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---------- derived: per-system aggregates used by the cards ----------
  const cardData = useMemo(() => {
    return systems.map(sys => {
      const layers = systemLayersBySys[sys.systemId] || [];
      const material = inferSystemMaterial(layers);
      const suppliers = Array.from(new Set(
        layers.flatMap(l => l.productOptions.map(o => (o.productSupplier || '').trim()).filter(Boolean))
      ));
      // Each card colour strip slot is derived from the layer's name.
      const layerColors = layers.map(l => {
        const pos = inferLayerPositionFromSlotName(l.layerName) || 'unknown';
        return LAYER_COLORS[pos];
      });
      return { system: sys, layers, material, suppliers, layerColors };
    });
  }, [systems, systemLayersBySys]);

  // ---------- substrate filter dropdown options ----------
  const substrateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of systems) if (s.systemSubstrate) set.add(s.systemSubstrate);
    return Array.from(set).sort();
  }, [systems]);

  // ---------- filter pipeline ----------
  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return cardData.filter(({ system, material }) => {
      if (q && !(system.name || '').toLowerCase().includes(q)) return false;
      if (filterType !== 'all' && material !== filterType) return false;
      if (filterStatus !== 'all') {
        const s = (system.status || 'draft').toLowerCase();
        if (s !== filterStatus) return false;
      }
      if (filterSubstrate !== 'all' && (system.systemSubstrate || '') !== filterSubstrate) return false;
      return true;
    });
  }, [cardData, searchText, filterType, filterStatus, filterSubstrate]);

  // ---------- open modal: fetch full + initialise local state ----------
  // openTokenRef is a monotonically-incrementing token used to detect
  // out-of-order responses when the user opens a different system before
  // the previous fetch completes. Each invocation captures its own token
  // and bails out before mutating modal state if a newer call has begun.
  const openTokenRef = useRef(0);
  const openModal = useCallback(async (systemId: string) => {
    const token = ++openTokenRef.current;
    setOpenSystemId(systemId);
    setOpenLoading(true);
    setHighlightLayerId(null);
    // Clear any stale primer resolutions from the previous open so the
    // adaptive cards never briefly show data from another system.
    setResolvedPrimersByLayer({});
    try {
      const full: FullSystem = await systemsApi.getSystemFull(systemId);
      if (token !== openTokenRef.current) return;
      // Sort layers ascending so the cross-section can render bottom→top.
      full.layers = [...full.layers].sort((a, b) => (a.orderSequence ?? 0) - (b.orderSequence ?? 0));
      setOpenSystem(full);
      // Default each layer to its default product option (or the first one).
      const initActive: Record<string, string> = {};
      for (const l of full.layers) {
        const def = l.productOptions.find(o => o.isDefault) || l.productOptions[0];
        if (def) initActive[l.layerId] = def.optionId;
      }
      setActiveOptionByLayer(initActive);
      setNoteText(full.previewNote || '');
      // Initialise the usage-areas editor from the loaded system. The
      // last-saved ref tracks what's on the server so the dirty flag
      // flips only on real user input.
      setUsesText(full.typicalUses || '');
      usesDirtyRef.current = false;
      usesLastSavedRef.current = full.typicalUses || '';
      // If a batch run has already produced a proposal for this system,
      // surface it immediately when the user opens the modal.
      setAiError(null);
      setAiProposal(batchQueue[systemId] || null);

      // Resolve adaptive-primer layers against the library so the modal
      // and the spec-sheet export both have the parameter-driven product
      // list ready before the user sees the cards. Failures fall back to
      // an empty resolution so the UI degrades gracefully ("no primer
      // matches the system parameters") instead of breaking the modal.
      const adaptiveLayers = full.layers.filter(l => l.layerMode === 'adaptive' && /\bprimer\b/i.test(l.layerName));
      if (adaptiveLayers.length > 0) {
        const sysType = (() => {
          const text = `${full.name} ${full.description || ''}`.toLowerCase();
          if (text.includes('polyurea')) return 'Polyurea';
          if (text.includes('epoxy')) return 'Epoxy';
          if (text.includes('acrylic')) return 'Acrylic';
          if (/\bpu\b|polyurethane/.test(text)) return 'PU';
          return null;
        })();
        const resolutions = await Promise.all(adaptiveLayers.map(l =>
          primerLibraryApi.resolve({
            substrate: full.systemSubstrate || undefined,
            humidity: full.systemHumidity || undefined,
            systemType: sysType || undefined,
          }).then(list => [l.layerId, list] as const).catch(() => [l.layerId, [] as PrimerLibraryEntry[]] as const)
        ));
        if (token !== openTokenRef.current) return;
        setResolvedPrimersByLayer(Object.fromEntries(resolutions));
      } else {
        setResolvedPrimersByLayer({});
      }
    } catch (e) {
      console.error('Failed to load system:', e);
      if (token === openTokenRef.current) setOpenSystem(null);
    } finally {
      if (token === openTokenRef.current) setOpenLoading(false);
    }
  }, [batchQueue]);

  // We track the note's "dirty" state so the UI can show "Unsaved" while the
  // user is typing within the debounce window, and the close handlers can
  // flush a pending save synchronously instead of dropping it on the floor.
  // Stored as a ref because the close path runs synchronously and can't
  // depend on a setState round-trip.
  const noteDirtyRef = useRef(false);
  const noteLastSavedRef = useRef<string>('');

  // Flush any pending debounced note save NOW (await the network round-trip).
  // Used by both close paths so typing-then-immediately-closing doesn't drop
  // the user's text.
  const flushNoteSave = useCallback(async () => {
    if (noteSaveTimer.current) { clearTimeout(noteSaveTimer.current); noteSaveTimer.current = null; }
    if (!noteDirtyRef.current || !openSystem) return;
    const v = noteText;
    setNoteSaving(true);
    try {
      await systemsApi.updateSystem(openSystem.systemId, { previewNote: v });
      noteDirtyRef.current = false;
      noteLastSavedRef.current = v;
      // Mirror the saved value into both the cached system list and the
      // currently-open system, so a follow-up Export Spec Sheet (which reads
      // openSystem.previewNote) sees the latest text.
      setSystems(prev => prev.map(s => s.systemId === openSystem.systemId ? { ...s, previewNote: v } : s));
      setOpenSystem(prev => prev ? { ...prev, previewNote: v } : prev);
    } catch (e) {
      console.error('preview_note save failed:', e);
    } finally {
      setNoteSaving(false);
    }
  }, [openSystem, noteText]);

  // ---------- AI Fill handlers ----------
  // Fetches a proposal for the currently-open system. Never auto-saves —
  // the SystemAIFillPanel surfaces the response for review and the parent
  // owns the apply/save step (so saves stay tied to the debounced
  // previewNote flow).
  const runAiFill = useCallback(async (systemId: string) => {
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await systemsApi.aiFillSystem(systemId);
      // Always cache into the batch queue keyed by systemId — even if the
      // user has since opened a different system, the cached proposal still
      // belongs to its system and we want it available when re-opened.
      setBatchQueue(prev => ({ ...prev, [systemId]: result }));
      // ONLY surface the proposal in the open modal if it still belongs to
      // the currently-open system. Without this guard, a slow A request
      // followed by opening B would pop A's proposal inside B's modal.
      setOpenSystemId(currentOpenId => {
        if (currentOpenId === systemId) setAiProposal(result);
        return currentOpenId;
      });
    } catch (e: any) {
      console.error('AI fill failed:', e);
      // Same guard for errors — only show the error banner in the matching
      // open modal, otherwise the error would persist into an unrelated one.
      setOpenSystemId(currentOpenId => {
        if (currentOpenId === systemId) setAiError(e?.message || 'Failed to generate AI suggestions');
        return currentOpenId;
      });
    } finally {
      setAiLoading(false);
    }
  }, []);

  // Apply an AI proposal (or partial proposal) to the currently-open system:
  //   - description is persisted directly via PUT /api/systems/:id
  //   - recommendation + warnings are folded into the previewNote (warnings
  //     get a trailing "⚠ Warnings:" block) and pushed through the standard
  //     debounced save path so the saved-state UI stays consistent.
  const applyAiFill = useCallback(async (next: {
    description: string;
    recommendation: string;
    warnings: string[];
    usageAreas: string[];
    // Per-layer card content keyed by layerId. Anything present here that
    // differs from the layer's current saved value is fanned out to
    // PUT /api/system-layers/:id in parallel after the main system PUT.
    layerEnhancements: Record<string, { description: string; properties: string[] }>;
  }) => {
    if (!openSystem) return;
    // Pin the systemId at call time so any modal switch mid-await won't
    // cause us to commit this AI proposal into an unrelated system's
    // state. Each post-await `set...` is gated on this id matching the
    // currently-open system.
    const targetId = openSystem.systemId;

    // Compose recommendation + warnings into the previewNote up-front so
    // we can persist it directly (instead of relying on the debounced
    // flushNoteSave closure, which would race against this state update).
    const composed = [
      next.recommendation.trim(),
      next.warnings.length > 0 ? `⚠ Warnings:\n${next.warnings.map(w => `• ${w}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n');

    // Usage areas: newline-join into the existing systems.typical_uses
    // column so we don't need a schema migration. Splitting back happens
    // on render (see openSystem.typicalUses → bullets in modal body).
    const composedUses = (next.usageAreas || []).map(u => u.trim()).filter(Boolean).join('\n');

    const descChanged = next.description !== (openSystem.description || '');
    const noteChanged = composed !== noteText;
    const usesChanged = composedUses !== (openSystem.typicalUses || '');

    // Build a single PUT payload so description + previewNote + typicalUses
    // land in one round-trip — all share the /api/systems/:id endpoint.
    const payload: Record<string, string> = {};
    if (descChanged) payload.description = next.description;
    if (noteChanged) payload.previewNote = composed;
    if (usesChanged) payload.typicalUses = composedUses;

    if (Object.keys(payload).length > 0) {
      // Cancel any debounced previewNote save in flight so it doesn't
      // race with this explicit save and overwrite us with stale text.
      if (noteSaveTimer.current) { clearTimeout(noteSaveTimer.current); noteSaveTimer.current = null; }
      setNoteSaving(true);
      try {
        await systemsApi.updateSystem(targetId, payload);
        // Mark the local note clean — we just persisted the composed value.
        if (noteChanged) {
          noteDirtyRef.current = false;
          noteLastSavedRef.current = composed;
        }
        // Update the cached systems list unconditionally (it's keyed by id
        // and the row still belongs to this system regardless of which
        // modal is currently open).
        setSystems(prev => prev.map(s => s.systemId === targetId
          ? { ...s,
              ...(descChanged ? { description: next.description } : {}),
              ...(noteChanged ? { previewNote: composed } : {}),
              ...(usesChanged ? { typicalUses: composedUses } : {}) }
          : s));
        // Only mutate openSystem / noteText if the same system is still
        // open — guards against modal-switch races.
        setOpenSystem(prev => (prev && prev.systemId === targetId)
          ? { ...prev,
              ...(descChanged ? { description: next.description } : {}),
              ...(noteChanged ? { previewNote: composed } : {}),
              ...(usesChanged ? { typicalUses: composedUses } : {}) }
          : prev);
        setOpenSystemId(currentId => {
          if (currentId === targetId) {
            if (noteChanged) setNoteText(composed);
            // Mirror the saved usage areas into the inline editor so the
            // textarea reflects what was just persisted (and clears the
            // dirty flag, otherwise the next debounce flush would re-PUT
            // the same value).
            if (usesChanged) {
              setUsesText(composedUses);
              usesDirtyRef.current = false;
              usesLastSavedRef.current = composedUses;
            }
          }
          return currentId;
        });
      } catch (e) {
        console.error('Failed to apply AI fill:', e);
      } finally {
        setNoteSaving(false);
      }
    }

    // ── Fan out per-layer enhancements ──
    // Diff each proposed layer enhancement against the layer's current
    // saved value; only PUT the changed ones. All requests fire in
    // parallel — order doesn't matter, each layer is independent and
    // the server already has refreshState invalidation per call.
    //
    // Uses Promise.allSettled so a single layer failure doesn't lose the
    // sibling saves. We then ONLY apply local state for fulfilled saves
    // and surface a banner listing the failed layers. The proposal +
    // queue entry are kept around when any layer failed so the user can
    // retry without losing the AI output.
    const layerPlan: { layerId: string; layerName: string; patch: { previewDescription: string; previewProperties: string[] } }[] = [];
    for (const layer of openSystem.layers) {
      const incoming = next.layerEnhancements?.[layer.layerId];
      if (!incoming) continue;
      const incDesc = (incoming.description || '').trim();
      const incProps = (incoming.properties || []).map(p => p.trim()).filter(Boolean);
      const curDesc = (layer.previewDescription || '').trim();
      const curProps = (layer.previewProperties || []).map(p => (p || '').trim()).filter(Boolean);
      const descChanged2 = incDesc !== curDesc;
      const propsChanged =
        incProps.length !== curProps.length ||
        incProps.some((p, i) => p !== curProps[i]);
      if (!descChanged2 && !propsChanged) continue;
      layerPlan.push({
        layerId: layer.layerId,
        layerName: layer.layerName,
        patch: { previewDescription: incDesc, previewProperties: incProps },
      });
    }
    let anyLayerFailed = false;
    if (layerPlan.length > 0) {
      const results = await Promise.allSettled(
        layerPlan.map(p => systemsApi.updateLayer(p.layerId, p.patch)),
      );
      const succeeded: Record<string, { previewDescription: string; previewProperties: string[] }> = {};
      const failedNames: string[] = [];
      results.forEach((r, i) => {
        const item = layerPlan[i];
        if (r.status === 'fulfilled') {
          succeeded[item.layerId] = item.patch;
        } else {
          anyLayerFailed = true;
          failedNames.push(item.layerName);
          console.error(`Failed to save layer enhancement for ${item.layerId}:`, r.reason);
        }
      });
      // Reflect only the fulfilled saves in the in-memory openSystem so
      // the preview cards never display values we haven't actually
      // persisted. Modal-switch race guard mirrors the description/note
      // save above.
      if (Object.keys(succeeded).length > 0) {
        setOpenSystem(prev => {
          if (!prev || prev.systemId !== targetId) return prev;
          return {
            ...prev,
            layers: prev.layers.map(l => succeeded[l.layerId]
              ? { ...l, previewDescription: succeeded[l.layerId].previewDescription, previewProperties: succeeded[l.layerId].previewProperties }
              : l),
          };
        });
      }
      // Surface partial failures through the existing aiError banner so
      // the user knows which layers need a retry. The proposal stays
      // visible (see below) so they can click "Use this layer" again.
      if (anyLayerFailed) {
        setOpenSystemId(currentId => {
          if (currentId === targetId) {
            setAiError(`Failed to save AI suggestions for: ${failedNames.join(', ')}. Other changes were saved.`);
          }
          return currentId;
        });
      }
    }

    // Clear the proposal + queue entry only when EVERY layer save
    // succeeded — otherwise the user would lose the AI output for the
    // failed rows. The system-level fields (description / note / uses)
    // were already persisted above, so partial success is fine.
    if (!anyLayerFailed) {
      setBatchQueue(prev => {
        const { [targetId]: _drop, ...rest } = prev;
        return rest;
      });
      setOpenSystemId(currentId => {
        if (currentId === targetId) setAiProposal(null);
        return currentId;
      });
    }
  }, [openSystem, noteText]);

  // ---------- AI Fill all systems (batch) ----------
  // Sequentially generate proposals for all filtered systems. A 3s gap
  // between requests keeps us well clear of the upstream rate limit.
  const runBatchAiFill = useCallback(async () => {
    if (batchRunning) {
      batchCancelRef.current = true;
      return;
    }
    const targets = filtered.map(c => c.system);
    if (targets.length === 0) return;
    batchCancelRef.current = false;
    setBatchRunning(true);
    setBatchErrors({});
    setBatchProgress({ done: 0, total: targets.length, current: null });
    for (let i = 0; i < targets.length; i++) {
      if (batchCancelRef.current) break;
      const sys = targets[i];
      setBatchProgress({ done: i, total: targets.length, current: sys.name });
      try {
        const result = await systemsApi.aiFillSystem(sys.systemId);
        setBatchQueue(prev => ({ ...prev, [sys.systemId]: result }));
      } catch (e: any) {
        setBatchErrors(prev => ({ ...prev, [sys.systemId]: e?.message || 'failed' }));
      }
      setBatchProgress({ done: i + 1, total: targets.length, current: sys.name });
      if (i < targets.length - 1 && !batchCancelRef.current) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    setBatchRunning(false);
    setBatchProgress(prev => ({ ...prev, current: null }));
  }, [batchRunning, filtered]);

  const closeModal = useCallback(() => {
    // Fire-and-forget the flush. We don't `await` it inside the close handler
    // because that would block the modal from closing — but the request will
    // complete in the background and the user will see the saved value next
    // time they open this system.
    void flushNoteSave();
    void flushUsesSave();
    // Clear any in-flight AI panel state so re-opening another system starts
    // fresh. The batch queue is intentionally kept around so the user can
    // continue reviewing other proposals.
    setAiProposal(null);
    setAiError(null);
    setOpenSystemId(null);
    setOpenSystem(null);
    setHighlightLayerId(null);
  }, [flushNoteSave]);

  // Wire Escape key to the modal — only fires while a system is open.
  useEscapeKey(openSystemId ? closeModal : null);

  // ---------- preview_note debounced autosave ----------
  const onNoteChange = useCallback((v: string) => {
    setNoteText(v);
    noteDirtyRef.current = (v !== noteLastSavedRef.current);
    if (!openSystem) return;
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);
    noteSaveTimer.current = setTimeout(async () => {
      setNoteSaving(true);
      try {
        await systemsApi.updateSystem(openSystem.systemId, { previewNote: v });
        noteDirtyRef.current = (v !== noteText); // still dirty if user typed more during the round-trip
        noteLastSavedRef.current = v;
        setSystems(prev => prev.map(s => s.systemId === openSystem.systemId ? { ...s, previewNote: v } : s));
        setOpenSystem(prev => prev ? { ...prev, previewNote: v } : prev);
      } catch (e) {
        console.error('preview_note save failed:', e);
      } finally {
        setNoteSaving(false);
      }
    }, 600);
  }, [openSystem, noteText]);

  // ---------- typical_uses (Usage Areas) debounced autosave ----------
  // Mirrors the preview_note pattern: a dirty ref + last-saved ref so the
  // close path can flush a pending save, and a debounce timer so the
  // server isn't hammered while the user is typing.
  const usesDirtyRef = useRef(false);
  const usesLastSavedRef = useRef<string>('');

  const flushUsesSave = useCallback(async () => {
    if (usesSaveTimer.current) { clearTimeout(usesSaveTimer.current); usesSaveTimer.current = null; }
    if (!usesDirtyRef.current || !openSystem) return;
    const v = usesText;
    setUsesSaving(true);
    try {
      await systemsApi.updateSystem(openSystem.systemId, { typicalUses: v });
      usesDirtyRef.current = false;
      usesLastSavedRef.current = v;
      setSystems(prev => prev.map(s => s.systemId === openSystem.systemId ? { ...s, typicalUses: v } : s));
      setOpenSystem(prev => prev ? { ...prev, typicalUses: v } : prev);
    } catch (e) {
      console.error('typical_uses save failed:', e);
    } finally {
      setUsesSaving(false);
    }
  }, [openSystem, usesText]);

  const onUsesChange = useCallback((v: string) => {
    setUsesText(v);
    usesDirtyRef.current = (v !== usesLastSavedRef.current);
    if (!openSystem) return;
    if (usesSaveTimer.current) clearTimeout(usesSaveTimer.current);
    usesSaveTimer.current = setTimeout(async () => {
      setUsesSaving(true);
      try {
        await systemsApi.updateSystem(openSystem.systemId, { typicalUses: v });
        usesDirtyRef.current = (v !== usesText);
        usesLastSavedRef.current = v;
        setSystems(prev => prev.map(s => s.systemId === openSystem.systemId ? { ...s, typicalUses: v } : s));
        setOpenSystem(prev => prev ? { ...prev, typicalUses: v } : prev);
      } catch (e) {
        console.error('typical_uses save failed:', e);
      } finally {
        setUsesSaving(false);
      }
    }, 600);
  }, [openSystem, usesText]);

  // ---------- "Make default" inline action ----------
  // Promotes the currently-active alternative to the layer's default product
  // by writing through PUT /api/system-layers/:id. The implementation is
  // hardened against the concurrency cases architect review flagged:
  //
  //   • Per-layer in-flight tracking (`makingDefaultLayers` Set) so two
  //     layers can save in parallel without each finally-block clearing
  //     the other's spinner.
  //   • Per-layer request token (`makeDefaultTokens` ref) so a stale
  //     response from a superseded request can't roll back a newer one.
  //     Only the response whose token still matches `tokens[layerId]` is
  //     allowed to commit a rollback or clear the in-flight flag.
  //   • Surgical snapshot — we only snapshot the affected layer's
  //     productOptions, not the whole openSystem / cache. That way the
  //     rollback can never undo unrelated state writes (preview-note
  //     saves, other layer updates, etc.) that landed during the round-trip.
  const makeDefault = useCallback(async (layerId: string, newDefaultProductId: string) => {
    if (!openSystem) return;
    // Bump the token for this layer; this request "owns" that value until
    // a newer request supersedes it.
    const myToken = (makeDefaultTokens.current[layerId] || 0) + 1;
    makeDefaultTokens.current[layerId] = myToken;

    // Surgical snapshot of just this layer's productOptions.
    const targetLayer = openSystem.layers.find(l => l.layerId === layerId);
    if (!targetLayer) return;
    const prevOptions = targetLayer.productOptions;
    const flippedOptions = prevOptions.map(o => ({
      ...o,
      isDefault: o.productId === newDefaultProductId,
    }));

    // Apply optimistic flip via functional updates — keeps us correct even
    // when other state changes have landed since this callback was created.
    const applyOptions = (newOptions: ProductOption[]) => {
      setOpenSystem(prev => prev ? {
        ...prev,
        layers: prev.layers.map(l => l.layerId === layerId ? { ...l, productOptions: newOptions } : l),
      } : prev);
      setSystemLayersBySys(prev => {
        const cached = prev[openSystem.systemId];
        if (!cached) return prev;
        return {
          ...prev,
          [openSystem.systemId]: cached.map(l => l.layerId === layerId ? { ...l, productOptions: newOptions } : l),
        };
      });
    };

    applyOptions(flippedOptions);
    setMakeDefaultErrors(prev => { const { [layerId]: _, ...rest } = prev; return rest; });
    setMakingDefaultLayers(prev => { const next = new Set(prev); next.add(layerId); return next; });
    try {
      await systemsApi.updateLayer(layerId, { defaultProductId: newDefaultProductId });
      // Only mark this layer as "done" if no newer request has superseded us.
      if (makeDefaultTokens.current[layerId] === myToken) {
        setMakingDefaultLayers(prev => { const next = new Set(prev); next.delete(layerId); return next; });
      }
    } catch (e: any) {
      // Stale response — a newer request is already in flight, let it
      // decide the final state. Don't roll back its optimistic update.
      if (makeDefaultTokens.current[layerId] !== myToken) return;
      // Rollback only the affected layer's options.
      applyOptions(prevOptions);
      setMakeDefaultErrors(prev => ({ ...prev, [layerId]: e?.message || 'Failed to set default' }));
      setMakingDefaultLayers(prev => { const next = new Set(prev); next.delete(layerId); return next; });
    }
  }, [openSystem]);

  // ---------- Compare basket helpers ----------
  // Brief inline hint helper — used when the user tries to add a third
  // system. We intentionally do NOT replace oldest silently (architect
  // feedback: feels random to the user); instead we refuse and explain.
  const flashCompareHint = useCallback((msg: string) => {
    setCompareHint(msg);
    if (compareHintTimer.current) clearTimeout(compareHintTimer.current);
    compareHintTimer.current = setTimeout(() => setCompareHint(null), 2500);
  }, []);

  const toggleCompare = useCallback((systemId: string, e?: React.SyntheticEvent) => {
    // Stop propagation (mouse AND keyboard) so toggling the checkbox doesn't
    // also fire the card's onClick/onKeyDown (which would open the single-
    // system preview modal). Architect flagged that mouse-only stop wasn't
    // enough because the parent now handles Enter/Space too.
    e?.stopPropagation();
    setCompareIds(prev => {
      if (prev.includes(systemId)) return prev.filter(id => id !== systemId);
      if (prev.length >= COMPARE_MAX) {
        flashCompareHint(`Compare is limited to ${COMPARE_MAX} systems — clear one first.`);
        return prev;
      }
      return [...prev, systemId];
    });
  }, [flashCompareHint]);

  const clearCompare = useCallback(() => setCompareIds([]), []);

  const openCompareModal = useCallback(async () => {
    if (compareIds.length !== 2) return;
    // Bump the request id; only the response from the latest call may
    // commit. Earlier responses bail out at every check below.
    const myRequest = ++compareRequestRef.current;
    const [idA, idB] = compareIds;
    setCompareOpen(true);
    setCompareLoading(true);
    setCompareSystems([null, null]);
    try {
      const [a, b] = await Promise.all([
        systemsApi.getSystemFull(idA),
        systemsApi.getSystemFull(idB),
      ]);
      // Stale response → drop it. The latest request will commit its own.
      if (compareRequestRef.current !== myRequest) return;
      // Sort layers ascending so the cross-section can render bottom→top.
      const sortLayers = (s: FullSystem) => ({
        ...s,
        layers: [...s.layers].sort((x, y) => (x.orderSequence ?? 0) - (y.orderSequence ?? 0)),
      });
      setCompareSystems([sortLayers(a), sortLayers(b)]);
    } catch (err) {
      if (compareRequestRef.current !== myRequest) return;
      console.error('Compare load failed:', err);
    } finally {
      if (compareRequestRef.current === myRequest) {
        setCompareLoading(false);
      }
    }
  }, [compareIds]);

  const closeCompareModal = useCallback(() => {
    // Invalidate any in-flight load so its response can't sneak in after
    // we close — bumping the ref makes every active request "stale".
    compareRequestRef.current++;
    setCompareOpen(false);
    setCompareSystems([null, null]);
    setCompareLoading(false);
  }, []);

  // Wire Escape to whichever modal is currently open. The single-preview
  // modal already binds Escape via its own useEscapeKey call; the compare
  // modal uses its own binding so the two can coexist independently.
  useEscapeKey(compareOpen ? closeCompareModal : null);

  // Cleanup all pending timers on unmount so they can't fire setState on
  // an unmounted component (works in React 18, but it's still leak-y).
  useEffect(() => () => {
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);
    if (usesSaveTimer.current) clearTimeout(usesSaveTimer.current);
    if (compareHintTimer.current) clearTimeout(compareHintTimer.current);
    if (exportToastTimer.current) clearTimeout(exportToastTimer.current);
  }, []);

  // True when any non-default filter is active — drives the empty state's
  // "Clear filters" affordance.
  const hasActiveFilters = useMemo(
    () => searchText.trim() !== '' || filterType !== 'all' || filterStatus !== 'all' || filterSubstrate !== 'all',
    [searchText, filterType, filterStatus, filterSubstrate],
  );
  const clearFilters = useCallback(() => {
    setSearchText('');
    setFilterType('all');
    setFilterStatus('all');
    setFilterSubstrate('all');
  }, []);

  // ---------- "Export spec sheet" → downloadable .txt ----------
  const exportSpecSheet = useCallback(() => {
    if (!openSystem) return;
    const lines: string[] = [];
    lines.push(`SYSTEM SPEC SHEET — ${openSystem.name}`);
    lines.push('='.repeat(60));
    if (openSystem.description) lines.push(openSystem.description);
    lines.push('');
    lines.push('System parameters');
    lines.push(`  Substrate       : ${openSystem.systemSubstrate || 'Not configured'}`);
    lines.push(`  Humidity        : ${openSystem.systemHumidity || 'Not configured'}`);
    lines.push(`  Duty            : ${openSystem.systemDuty || 'Not configured'}`);
    // Installable-spec total build-up thickness — labelled "Not configured"
    // when both bounds are null so the section reads consistently with the
    // qualification fields above.
    {
      const total = fmtSpecRange(openSystem.totalThicknessMinMm, openSystem.totalThicknessMaxMm, 'mm');
      lines.push(`  Total thickness : ${total || 'Not configured'}`);
    }
    lines.push('');
    lines.push('Build-up (bottom → top)');
    for (let i = 0; i < openSystem.layers.length; i++) {
      const l = openSystem.layers[i];
      const pos = inferLayerPositionFromSlotName(l.layerName) || 'unknown';
      lines.push(`  Layer ${i + 1}: ${l.layerName}  [${LAYER_COLORS[pos].label}]`);
      // Adaptive primer layers print the resolved library entries instead
      // of the (empty) productOptions list. The pinned default leads, and
      // every other resolved entry is listed under "Adaptive options" so a
      // contractor reading the spec sheet can see the full per-condition
      // catalog at a glance.
      if (l.layerMode === 'adaptive' && /\bprimer\b/i.test(l.layerName)) {
        const resolved = resolvedPrimersByLayer[l.layerId] || [];
        if (resolved.length === 0) {
          lines.push('    [ADAPTIVE PRIMER]  No library match for the current system parameters');
        } else {
          const pinned = l.defaultPrimerLibraryId
            ? resolved.find(r => r.primerId === l.defaultPrimerLibraryId)
            : null;
          const lead = pinned || resolved[0];
          lines.push(`    [ADAPTIVE PRIMER]  Default: ${lead.productName || '—'}  (${lead.primerId})`);
          lines.push(`    Supplier:        ${lead.supplier || '—'}`);
          const rest = resolved.filter(r => r.primerId !== lead.primerId);
          if (rest.length) {
            lines.push(`    Adaptive options:`);
            for (const r of rest) {
              lines.push(`      - ${r.productName || '—'}  (${r.primerId})  · supplier: ${r.supplier || '—'}`);
            }
          }
        }
      } else {
        const def = l.productOptions.find(o => o.isDefault) || l.productOptions[0];
        if (def) {
          lines.push(`    Default product: ${def.productName || '—'}  (${def.productStockCode || 'no code'})`);
          lines.push(`    Supplier:        ${def.productSupplier || '—'}`);
        }
      }
      // Installable-spec values per layer. Each is independently optional;
      // we emit only the lines that have a value so the spec sheet stays
      // readable for partially-spec'd systems instead of carrying a wall
      // of dashes. fmtSpec / fmtSpecRange return null when missing.
      const consumption = fmtSpec(l.consumptionRateKgM2, 'kg/m²');
      const dft = fmtSpec(l.dftMicrons, 'μm');
      const recoat = fmtSpecRange(l.recoatMinHours, l.recoatMaxHours, 'hrs');
      if (consumption) lines.push(`    Consumption:     ${consumption}`);
      if (dft)         lines.push(`    Dry film (DFT):  ${dft}`);
      if (recoat)      lines.push(`    Recoat window:   ${recoat}`);
      if (!(l.layerMode === 'adaptive' && /\bprimer\b/i.test(l.layerName))) {
        const def = l.productOptions.find(o => o.isDefault) || l.productOptions[0];
        const others = l.productOptions.filter(o => o !== def);
        if (others.length) {
          lines.push(`    Alternatives:    ${others.map(o => o.productName).filter(Boolean).join(', ')}`);
        }
      }
    }
    // Usage areas — newline-joined in systems.typical_uses; emit as a
    // bulleted block so the .txt mirrors the modal display.
    {
      const uses = (openSystem.typicalUses || '')
        .split('\n').map(s => s.trim()).filter(Boolean);
      if (uses.length > 0) {
        lines.push('');
        lines.push('Usage areas');
        for (const u of uses) lines.push(`  • ${u}`);
      }
    }
    if (openSystem.previewNote) {
      lines.push('');
      lines.push('Recommendation');
      lines.push('  ' + openSystem.previewNote);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${openSystem.name.replace(/[^\w\-. ]+/g, '_')}_spec.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [openSystem, resolvedPrimersByLayer]);

  // ---------- Catalog Export handlers ----------
  // Resolve the final list of systemIds to export from the current scope.
  // For 'active' / 'draft' we filter the unfiltered systems list (catalog
  // scope is independent of the filter bar so the user can search and still
  // export "all active" without being constrained by the search query).
  const computeExportSystemIds = useCallback((): string[] => {
    if (exportScope === 'selected') return Array.from(exportSelectedIds);
    if (exportScope === 'all') return systems.map(s => s.systemId);
    return systems
      .filter(s => (s.status || 'draft').toLowerCase() === exportScope)
      .map(s => s.systemId);
  }, [exportScope, exportSelectedIds, systems]);

  const showExportToast = useCallback((msg: string) => {
    setExportToast(msg);
    if (exportToastTimer.current) clearTimeout(exportToastTimer.current);
    exportToastTimer.current = setTimeout(() => setExportToast(null), 4000);
  }, []);

  // PDF format: render a hidden printable summary for each system into a
  // staging div, html2canvas each system block, then assemble with jsPDF.
  // We rely on already-hydrated systemLayersBySys so no extra requests fire.
  const generatePdfClientSide = useCallback(async (systemIds: string[]) => {
    const stage = pdfStageRef.current;
    if (!stage) throw new Error('PDF staging container not mounted');
    const today = new Date().toISOString().split('T')[0];
    const blocks: HTMLDivElement[] = [];
    stage.innerHTML = '';
    try {
    for (const sid of systemIds) {
      const sys = systems.find(s => s.systemId === sid);
      if (!sys) continue;
      const layers = systemLayersBySys[sid] || [];
      const block = document.createElement('div');
      block.style.cssText = 'width:800px;background:#fff;padding:32px;font-family:Helvetica,Arial,sans-serif;color:#0f172a;box-sizing:border-box;';
      const isActiveStatus = (sys.status || 'draft').toLowerCase() === 'active';
      const statusBadge = exportOpts.hideStatus ? '' :
        `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;margin-left:8px;background:${isActiveStatus ? '#d1fae5' : '#fef3c7'};color:${isActiveStatus ? '#065f46' : '#92400e'}">${isActiveStatus ? 'ACTIVE' : 'DRAFT'}</span>`;
      const layerRows = [...layers].reverse().map(l => {
        const pos = inferLayerPositionFromSlotName(l.layerName) || 'unknown';
        const c = LAYER_COLORS[pos];
        const def = l.productOptions.find(o => o.isDefault) || l.productOptions[0];
        const meta: string[] = [];
        if (def) {
          if (!exportOpts.hideSuppliers && def.productSupplier) meta.push(def.productSupplier);
          if (!exportOpts.hideStockCodes && def.productStockCode) meta.push(def.productStockCode);
        }
        const alts = (def && exportOpts.includeAlternatives)
          ? l.productOptions.filter(o => o !== def).map(o => o.productName).filter(Boolean).join(', ')
          : '';
        return `<div style="background:${c.fill};border-left:6px solid ${c.accent};padding:10px 14px;margin-bottom:6px;border-radius:6px">
          <div style="font-size:11px;font-weight:700;color:${c.text};letter-spacing:0.5px;text-transform:uppercase">${c.label} · ${escapeHtml(l.layerName)}</div>
          ${def ? `<div style="font-size:14px;font-weight:600;margin-top:4px">${escapeHtml(def.productName || def.productId)}</div>` : '<div style="font-size:13px;font-style:italic;color:#64748b;margin-top:4px">No products assigned</div>'}
          ${meta.length ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${meta.map(escapeHtml).join(' · ')}</div>` : ''}
          ${alts ? `<div style="font-size:11px;color:#475569;margin-top:4px"><b>Alternatives:</b> ${escapeHtml(alts)}</div>` : ''}
        </div>`;
      }).join('');
      const params = exportOpts.includeParameters ? `
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
          <tr><td style="padding:4px 8px;color:#64748b;width:40%">Substrate</td><td style="padding:4px 8px;font-weight:500">${escapeHtml(sys.systemSubstrate || 'Not configured')}</td></tr>
          <tr><td style="padding:4px 8px;color:#64748b">Humidity</td><td style="padding:4px 8px;font-weight:500">${escapeHtml(sys.systemHumidity || 'Not configured')}</td></tr>
          <tr><td style="padding:4px 8px;color:#64748b">Duty</td><td style="padding:4px 8px;font-weight:500">${escapeHtml(sys.systemDuty || 'Not configured')}</td></tr>
        </table>` : '';
      const recBox = (exportOpts.includeRecommendations && sys.previewNote)
        ? `<div style="margin-top:16px;background:#eaf3de;border:1px solid #bbf7d0;border-radius:6px;padding:12px"><div style="font-size:11px;font-weight:700;color:#27500a;letter-spacing:0.5px">RECOMMENDATION</div><div style="font-size:13px;color:#27500a;margin-top:4px">${escapeHtml(sys.previewNote)}</div></div>`
        : '';
      block.innerHTML = `
        <div style="font-size:22px;font-weight:700;margin-bottom:4px">${escapeHtml(sys.name)}${statusBadge}</div>
        ${sys.description ? `<div style="font-size:13px;color:#475569;font-style:italic;margin-bottom:12px">${escapeHtml(sys.description)}</div>` : '<div style="height:8px"></div>'}
        ${exportOpts.includeParameters ? `<div style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px">System parameters</div>${params}` : ''}
        ${exportOpts.includeProducts ? `<div style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-top:16px;margin-bottom:8px">Build-up (top → bottom)</div>${layerRows}` : ''}
        ${recBox}
      `;
      stage.appendChild(block);
      blocks.push(block);
    }
    // Wait a tick so the DOM lays out.
    await new Promise(r => setTimeout(r, 30));
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    for (let i = 0; i < blocks.length; i++) {
      const canvas = await html2canvas(blocks[i], { scale: 2, backgroundColor: '#ffffff', logging: false });
      const imgData = canvas.toDataURL('image/png');
      const imgW = pageW - 40;
      const imgH = (canvas.height * imgW) / canvas.width;
      let y = 20;
      let remaining = imgH;
      // Slice the image across pages if it exceeds one page.
      if (imgH <= pageH - 40) {
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 20, y, imgW, imgH);
      } else {
        let sliceY = 0;
        let first = true;
        while (remaining > 0) {
          if (!first || i > 0) pdf.addPage();
          first = false;
          const slice = Math.min(pageH - 40, remaining);
          // Use addImage with negative y to shift the image upward for slicing.
          pdf.addImage(imgData, 'PNG', 20, 20 - sliceY, imgW, imgH);
          remaining -= slice;
          sliceY += slice;
        }
      }
    }
    pdf.save(`systems-catalog-${today}.pdf`);
    } finally {
      // Always clear the offscreen staging container so failed/successful
      // runs leave no orphan DOM behind across retries.
      stage.innerHTML = '';
    }
  }, [systems, systemLayersBySys, exportOpts]);

  const runExportCatalog = useCallback(async () => {
    setExportError(null);
    const ids = computeExportSystemIds();
    if (!ids.length) {
      setExportError(exportScope === 'selected'
        ? 'Select at least one system from the cards below.'
        : 'No systems match this scope.');
      return;
    }
    setExportBusy(true);
    try {
      if (exportOpts.format === 'pdf') {
        await generatePdfClientSide(ids);
        showExportToast(`Catalog exported — ${ids.length} system${ids.length === 1 ? '' : 's'} (PDF)`);
      } else {
        const res = await fetch(`${API_BASE}/systems/export-catalog`, {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemIds: ids, options: exportOpts }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `Server returned ${res.status}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `systems-catalog-${new Date().toISOString().split('T')[0]}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showExportToast(`Catalog exported — ${ids.length} system${ids.length === 1 ? '' : 's'} (Word)`);
      }
    } catch (e: any) {
      console.error('Catalog export failed:', e);
      setExportError(e?.message || 'Export failed');
    } finally {
      setExportBusy(false);
    }
  }, [computeExportSystemIds, exportOpts, exportScope, generatePdfClientSide, showExportToast]);

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* ---------- filter bar ---------- */}
      <div className="px-6 py-4 bg-white border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Search systems by name..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-400 outline-none"
            />
          </div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as any)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="all">All types</option>
            {(Object.keys(MATERIAL_KEYWORDS) as Array<keyof typeof MATERIAL_KEYWORDS>).map(k => (
              <option key={k} value={k}>{MATERIAL_KEYWORDS[k].label}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as any)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
          </select>
          <select
            value={filterSubstrate}
            onChange={e => setFilterSubstrate(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="all">All substrates</option>
            {substrateOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-xs text-slate-500">
              {loading ? 'Loading…' : `${filtered.length} of ${systems.length} system${systems.length === 1 ? '' : 's'}`}
            </div>
            {/* AI Fill all systems — sequential batch. While running the
                button doubles as a Cancel control. Queued (already-fetched
                but not-yet-applied) proposals are surfaced as a small badge
                so the user knows there's review work pending. */}
            <button
              type="button"
              onClick={runBatchAiFill}
              disabled={!batchRunning && filtered.length === 0}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                batchRunning
                  ? 'bg-rose-600 border-rose-600 text-white hover:bg-rose-700'
                  : 'bg-violet-600 border-violet-600 text-white hover:bg-violet-700'
              }`}
              title={batchRunning ? 'Cancel batch AI fill' : `Generate AI proposals for all ${filtered.length} filtered systems`}
            >
              {batchRunning ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Cancel ({batchProgress.done}/{batchProgress.total})
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  AI Fill all
                  {Object.keys(batchQueue).length > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white text-violet-700 text-[10px] font-bold">
                      {Object.keys(batchQueue).length}
                    </span>
                  )}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setExportPanelOpen(v => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                exportPanelOpen
                  ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-700'
              }`}
              aria-expanded={exportPanelOpen}
              aria-controls="export-catalog-panel"
              title="Export systems as Word or PDF catalog"
            >
              <Download size={14} />
              Export catalog
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Export catalog inline panel ---------- */}
      {exportPanelOpen && (
        <div
          id="export-catalog-panel"
          className="px-6 py-4 bg-indigo-50/40 border-b border-indigo-100"
          style={{ minHeight: 0 }}
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <FileDown size={16} className="text-indigo-600" /> Generate catalog
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Build a professional, editable document of selected systems with cross-sections, parameters, and products.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExportPanelOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
                aria-label="Close export panel"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-sm">
              {/* Scope */}
              <div>
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Systems to include</div>
                {([
                  ['active', 'Active only'],
                  ['draft', 'Draft only'],
                  ['all', 'All systems'],
                  ['selected', 'Selected systems'],
                ] as const).map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="radio"
                      name="export-scope"
                      checked={exportScope === val}
                      onChange={() => setExportScope(val)}
                      className="text-indigo-600 focus:ring-indigo-400"
                    />
                    <span className="text-slate-700">{label}</span>
                  </label>
                ))}
                {exportScope === 'selected' && (
                  <div className="mt-2 text-xs text-slate-500">
                    {exportSelectedIds.size === 0
                      ? 'Click cards below to select.'
                      : `${exportSelectedIds.size} selected · `}
                    {exportSelectedIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setExportSelectedIds(new Set())}
                        className="text-indigo-600 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                    {' · '}
                    <button
                      type="button"
                      onClick={() => setExportSelectedIds(new Set(filtered.map(f => f.system.systemId)))}
                      className="text-indigo-600 hover:underline"
                    >
                      Select all visible ({filtered.length})
                    </button>
                  </div>
                )}
              </div>

              {/* Sections */}
              <div>
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Sections to include</div>
                {([
                  ['includeCover', 'Cover page + table of contents'],
                  ['includeCrossSection', 'Cross-section diagram'],
                  ['includeParameters', 'System parameters table'],
                  ['includeProducts', 'Layer product cards'],
                  ['includeAlternatives', 'Alternative products'],
                  ['includeRecommendations', 'Recommendations / notes'],
                  ['includePrimerChart', 'Primer coverage chart (appendix)'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 py-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(exportOpts as any)[key]}
                      onChange={e => setExportOpts(o => ({ ...o, [key]: e.target.checked }))}
                      className="text-indigo-600 rounded focus:ring-indigo-400"
                    />
                    <span className="text-slate-700">{label}</span>
                  </label>
                ))}
              </div>

              {/* Visibility + Format */}
              <div>
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Customer-facing options</div>
                {([
                  ['hideStockCodes', 'Hide stock codes'],
                  ['hideSuppliers', 'Hide supplier names'],
                  ['hideStatus', 'Hide status badges'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 py-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(exportOpts as any)[key]}
                      onChange={e => setExportOpts(o => ({ ...o, [key]: e.target.checked }))}
                      className="text-indigo-600 rounded focus:ring-indigo-400"
                    />
                    <span className="text-slate-700">{label}</span>
                  </label>
                ))}
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mt-3 mb-2">Format</div>
                <label className="flex items-center gap-2 py-0.5 cursor-pointer">
                  <input type="radio" name="export-fmt" checked={exportOpts.format === 'docx'}
                    onChange={() => setExportOpts(o => ({ ...o, format: 'docx' }))} />
                  <span className="text-slate-700">Word (.docx) — editable</span>
                </label>
                <label className="flex items-center gap-2 py-0.5 cursor-pointer">
                  <input type="radio" name="export-fmt" checked={exportOpts.format === 'pdf'}
                    onChange={() => setExportOpts(o => ({ ...o, format: 'pdf' }))} />
                  <span className="text-slate-700">PDF</span>
                </label>
              </div>
            </div>

            {exportError && (
              <div className="mt-4 flex items-start gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
                <AlertCircle size={14} className="mt-0.5 shrink-0" /> {exportError}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
              {exportBusy && (
                <span className="text-xs text-slate-500 italic">Generating catalog… this may take a few seconds</span>
              )}
              <button
                type="button"
                onClick={runExportCatalog}
                disabled={exportBusy}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
              >
                {exportBusy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                Generate catalog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export-success toast */}
      {exportToast && (
        <div className="fixed top-4 right-4 z-[60] bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-2">
          <Check size={14} /> {exportToast}
        </div>
      )}

      {/* Hidden staging container for PDF rendering (offscreen, not display:none
          because html2canvas needs real layout). */}
      <div
        ref={pdfStageRef}
        aria-hidden="true"
        style={{ position: 'fixed', left: '-10000px', top: 0, width: 0, height: 0, overflow: 'hidden' }}
      />


      {/* ---------- card grid ---------- */}
      {/* The padding-bottom buys space for the floating compare bar so the
          last row of cards is never hidden behind it. */}
      <div className="flex-1 overflow-y-auto p-6 pb-24">
        {loading ? (
          <div className="text-center text-slate-500 py-12">Loading systems…</div>
        ) : filtered.length === 0 ? (
          // ---------- empty / zero-state ----------
          // Two flavours: "no systems exist at all" vs "filters yielded nothing".
          // The latter gets a Clear filters CTA so the user can recover in
          // one click instead of hunting through four selectors.
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              {hasActiveFilters
                ? <Filter size={22} className="text-slate-400" />
                : <Layers size={22} className="text-slate-400" />}
            </div>
            <h3 className="text-base font-semibold text-slate-700 mb-1">
              {hasActiveFilters ? 'No systems match these filters' : 'No systems yet'}
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mb-4">
              {hasActiveFilters
                ? 'Try widening the criteria — change the type, status, or substrate, or clear the search box.'
                : 'Create your first system in the Builder tab to see it here.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                <X size={14} /> Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(({ system, material, suppliers, layerColors }) => {
              const isInCompare = compareIds.includes(system.systemId);
              const isExportSelectMode = exportPanelOpen && exportScope === 'selected';
              const isExportSelected = exportSelectedIds.has(system.systemId);
              // In export selection mode, the card's primary click toggles
              // export selection instead of opening the preview modal so the
              // user can rapidly pick multiple systems without round-tripping
              // through a separate checkbox row.
              const onCardActivate = () => {
                if (isExportSelectMode) {
                  setExportSelectedIds(prev => {
                    const next = new Set(prev);
                    if (next.has(system.systemId)) next.delete(system.systemId);
                    else next.add(system.systemId);
                    return next;
                  });
                } else {
                  openModal(system.systemId);
                }
              };
              return (
                // Card is a <div> (not <button>) so the nested compare
                // checkbox can be its own real <button> without nesting
                // interactive elements (which would be invalid HTML).
                <div
                  key={system.systemId}
                  role="button"
                  tabIndex={0}
                  onClick={onCardActivate}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardActivate(); } }}
                  className={`relative text-left bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${
                    isExportSelected
                      ? 'border-emerald-500 ring-2 ring-emerald-200'
                      : isInCompare
                        ? 'border-indigo-400 ring-2 ring-indigo-200'
                        : 'border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {isExportSelectMode && (
                    <div
                      className={`absolute top-2 left-2 w-5 h-5 rounded border flex items-center justify-center ${
                        isExportSelected ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-transparent'
                      }`}
                      aria-hidden="true"
                    >
                      <Check size={12} />
                    </div>
                  )}
                  {/* Compare toggle — top-right corner. We stop propagation
                      on BOTH click and keyDown so activating it via Space/
                      Enter doesn't bubble up to the parent card and open
                      the preview. aria-pressed gives assistive tech the
                      correct toggle semantics. */}
                  <button
                    type="button"
                    aria-pressed={isInCompare}
                    onClick={(e) => toggleCompare(system.systemId, e)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
                    className={`absolute top-2 right-2 w-6 h-6 rounded border flex items-center justify-center transition-all ${
                      isInCompare
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-slate-300 text-transparent hover:border-indigo-400 hover:text-slate-300'
                    }`}
                    aria-label={isInCompare ? 'Remove from compare' : 'Add to compare'}
                    title={isInCompare ? 'Selected for compare — click to remove' : 'Add to compare'}
                  >
                    <Check size={14} />
                  </button>

                  <div className="flex items-start justify-between gap-2 mb-2 pr-8">
                    <div className="flex items-center gap-2 flex-wrap">
                      {material ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${MATERIAL_KEYWORDS[material].color}`}>
                          {MATERIAL_KEYWORDS[material].label}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-slate-100 text-slate-600 border-slate-200">Mixed</span>
                      )}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        (system.status || 'draft').toLowerCase() === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {(system.status || 'draft').toLowerCase() === 'active' ? 'Active' : 'Draft'}
                      </span>
                    </div>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800 line-clamp-2 mb-1" title={system.name}>{system.name}</h3>
                  <div className="text-[11px] text-slate-500 mb-2">
                    {system.systemSubstrate || system.systemDuty
                      ? `${system.systemSubstrate || '—'} · ${system.systemDuty || '—'}`
                      : <span className="italic">Not configured</span>}
                  </div>
                  {suppliers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {suppliers.slice(0, 4).map(sup => (
                        <span key={sup} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{sup}</span>
                      ))}
                      {suppliers.length > 4 && <span className="text-[10px] text-slate-400">+{suppliers.length - 4}</span>}
                    </div>
                  )}
                  {/* Layer colour strip — one rectangle per layer, bottom→top order. */}
                  {layerColors.length > 0 ? (
                    <div className="flex h-2 gap-0.5 rounded overflow-hidden">
                      {layerColors.map((c, i) => (
                        <div key={i} className="flex-1" style={{ backgroundColor: c.accent }} title={c.label} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400 italic">No layers</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------- floating compare bar ---------- */}
      {/* Pinned to the bottom of the viewport whenever there's at least one
          system selected for compare, OR when we're showing a transient
          hint (e.g. user clicked a third card). The hint sits above the bar
          so it's still visible when the basket is full. */}
      {(compareIds.length > 0 || compareHint) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2">
          {compareHint && (
            <div
              role="status"
              className="text-xs bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1.5 rounded-lg shadow"
            >
              {compareHint}
            </div>
          )}
          {compareIds.length > 0 && (
            <div className="bg-slate-900 text-white shadow-2xl rounded-full pl-4 pr-2 py-2 flex items-center gap-3">
              <GitCompare size={16} className="text-indigo-300" />
              <span className="text-sm">
                {compareIds.length} of {COMPARE_MAX} selected
              </span>
              <button
                type="button"
                onClick={openCompareModal}
                disabled={compareIds.length !== COMPARE_MAX}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  compareIds.length === COMPARE_MAX
                    ? 'bg-indigo-500 hover:bg-indigo-400 text-white'
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
              >
                Compare
              </button>
              <button
                type="button"
                onClick={clearCompare}
                className="p-1 text-slate-400 hover:text-white"
                aria-label="Clear compare selection"
                title="Clear selection"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL — min-height wrapper (per spec, not position:fixed)            */}
      {/* =================================================================== */}
      {openSystemId && (
        <div
          className="fixed inset-0 z-50 bg-black/40 overflow-y-auto"
          onClick={closeModal}
        >
          <div className="min-h-screen flex items-start justify-center py-8 px-4">
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl"
              onClick={e => e.stopPropagation()}
              style={{ minHeight: '60vh' }}
              role="dialog"
              aria-modal="true"
              aria-label={openSystem ? `${openSystem.name} preview` : 'System preview'}
            >
              {openLoading || !openSystem ? (
                <div className="p-12 text-center text-slate-500">Loading…</div>
              ) : (
                <>
                  {/* ---- modal header ---- */}
                  <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        {openSystem.name}
                        {aiProposal && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                            Unsaved AI changes
                          </span>
                        )}
                      </h2>
                      {openSystem.description && (
                        <p className="text-sm text-slate-500 mt-0.5 max-w-2xl">{openSystem.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <AiFillButton
                        onClick={() => runAiFill(openSystem.systemId)}
                        loading={aiLoading}
                        title="Generate AI description, recommendation, and warnings"
                      />
                      <button
                        onClick={closeModal}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                        aria-label="Close preview"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                  {aiError && (
                    <div className="px-6 py-2 text-xs text-rose-700 bg-rose-50 border-b border-rose-200">
                      AI fill failed: {aiError}
                    </div>
                  )}

                  {/* ---- modal body: 2 columns ---- */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                    {/* ============ LEFT: cross-section ============ */}
                    <div className="p-6 border-r border-slate-100 bg-slate-50">
                      {(() => {
                        const suppliers = Array.from(new Set(
                          openSystem.layers.flatMap(l => l.productOptions.map(o => (o.productSupplier || '').trim()).filter(Boolean))
                        ));
                        return suppliers.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mb-4">
                            {suppliers.map(s => (
                              <span key={s} className="text-[10px] px-2 py-0.5 bg-white border border-slate-200 text-slate-600 rounded-full">{s}</span>
                            ))}
                          </div>
                        ) : null;
                      })()}

                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Build-up</h3>
                      <div className="space-y-1">
                        {/* Render top→bottom: highest orderSequence first. */}
                        {[...openSystem.layers].reverse().map((l, idx) => {
                          const realIdx = openSystem.layers.length - 1 - idx;
                          const pos = inferLayerPositionFromSlotName(l.layerName) || 'unknown';
                          const c = LAYER_COLORS[pos];
                          // "Final layer" = highest orderSequence (top of stack).
                          const isFinal = realIdx === openSystem.layers.length - 1;
                          const highlighted = highlightLayerId === l.layerId;
                          return (
                            <button
                              key={l.layerId}
                              type="button"
                              onClick={() => setHighlightLayerId(l.layerId)}
                              className={`w-full text-left flex items-stretch rounded-md overflow-hidden border transition-all ${
                                highlighted ? 'ring-2 ring-indigo-400 border-indigo-300' : 'border-transparent'
                              }`}
                              style={{ minHeight: 36 }}
                              title={`Click to highlight layer ${realIdx + 1}`}
                            >
                              <div style={{ width: 4, backgroundColor: c.accent }} />
                              <div className="flex-1 flex flex-col px-3 py-2" style={{ backgroundColor: c.fill }}>
                                <div className="flex items-center gap-3">
                                  <span
                                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white"
                                    style={{ backgroundColor: c.accent }}
                                  >
                                    {realIdx + 1}
                                  </span>
                                  <span className="text-sm font-medium" style={{ color: c.text }}>{l.layerName}</span>
                                  <span className="text-[10px] uppercase tracking-wider" style={{ color: c.text, opacity: 0.7 }}>
                                    {c.label}
                                  </span>
                                  {isFinal && (
                                    <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                                      final
                                    </span>
                                  )}
                                </div>
                                {/* Installable-spec summary line. Only rendered
                                    when at least one of consumption/DFT/recoat
                                    is set so an unspec'd legacy system still
                                    shows the same compact bar as before. The
                                    monospace tabular figures keep the values
                                    aligned across stacked layers. */}
                                {(() => {
                                  const summary = buildLayerSpecSummary(l);
                                  if (!summary) return null;
                                  return (
                                    <div
                                      className="mt-1 ml-9 text-[10px] font-mono tabular-nums truncate"
                                      style={{ color: c.text, opacity: 0.75 }}
                                    >
                                      {summary}
                                    </div>
                                  );
                                })()}
                              </div>
                            </button>
                          );
                        })}
                        {/* Structural substrate footer */}
                        <div className="flex items-center justify-center px-3 py-2 mt-1 border-2 border-dashed border-slate-300 rounded-md text-[11px] text-slate-500 bg-white">
                          <Layers size={12} className="mr-1.5" />
                          Structural substrate: <span className="ml-1 font-medium">{openSystem.systemSubstrate || 'Not configured'}</span>
                        </div>
                      </div>

                      {/* System parameters table */}
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-6 mb-2">System parameters</h3>
                      <table className="w-full text-xs">
                        <tbody>
                          {[
                            ['Substrate',          openSystem.systemSubstrate],
                            ['Humidity',           openSystem.systemHumidity],
                            ['Duty',               openSystem.systemDuty],
                            ['Finish',             // Aggregate: any layer's default product's finish tag.
                              (() => {
                                const finishes = new Set<string>();
                                for (const l of openSystem.layers) {
                                  const def = l.productOptions.find(o => o.isDefault) || l.productOptions[0];
                                  if (def) {
                                    const t = tagsByProduct[def.productId];
                                    if (t?.finishType) finishes.add(t.finishType);
                                  }
                                }
                                return finishes.size ? Array.from(finishes).join(', ') : null;
                              })()],
                            ['Topcoat required',
                              openSystem.layers.some(l => inferLayerPositionFromSlotName(l.layerName) === 'topcoat') ? 'Yes' : 'No'],
                            // Installable-spec total build-up thickness range.
                            // Rendered through the same fmt helper used by the
                            // cross-section bars so the formatting (and the
                            // "≥" / "≤" handling for one-sided ranges) is
                            // shared in a single place.
                            ['Total thickness',
                              fmtSpecRange(openSystem.totalThicknessMinMm, openSystem.totalThicknessMaxMm, 'mm')],
                          ].map(([k, v]) => (
                            <tr key={k as string} className="border-b border-slate-200 last:border-b-0">
                              <td className="py-1.5 text-slate-500 w-1/3">{k}</td>
                              <td className="py-1.5 text-slate-800">
                                {v ? v : <span className="italic text-slate-400">Not configured</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* ============ RIGHT: per-layer product cards ============ */}
                    <div className="p-6">
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Layer products</h3>
                      <div className="space-y-3">
                        {[...openSystem.layers].reverse().map((l, idx) => {
                          const realIdx = openSystem.layers.length - 1 - idx;
                          const pos = inferLayerPositionFromSlotName(l.layerName) || 'unknown';
                          const c = LAYER_COLORS[pos];
                          const activeId = activeOptionByLayer[l.layerId];
                          const active = l.productOptions.find(o => o.optionId === activeId)
                                       || l.productOptions.find(o => o.isDefault)
                                       || l.productOptions[0];
                          const def = l.productOptions.find(o => o.isDefault) || l.productOptions[0];
                          const tag = active ? tagsByProduct[active.productId] : null;
                          const highlighted = highlightLayerId === l.layerId;
                          return (
                            <div
                              key={l.layerId}
                              className={`border rounded-xl p-3 transition-all ${
                                highlighted ? 'ring-2 ring-indigo-400 border-indigo-300' : 'border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span
                                  className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white"
                                  style={{ backgroundColor: c.accent }}
                                >
                                  {realIdx + 1}
                                </span>
                                <span className="text-sm font-semibold text-slate-700">{l.layerName}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: c.fill, color: c.text }}>
                                  {c.label}
                                </span>
                              </div>

                              {/* Adaptive primer layer: render the resolved
                                  Primer Library list rather than the manual
                                  productOptions, since adaptive layers don't
                                  have any products attached. The pinned
                                  default is starred; if the system params
                                  have no library match we show the friendly
                                  "no primer matches" line. */}
                              {l.layerMode === 'adaptive' && /\bprimer\b/i.test(l.layerName) ? (
                                (() => {
                                  const resolved = resolvedPrimersByLayer[l.layerId] || [];
                                  if (resolved.length === 0) {
                                    return (
                                      <div className="text-xs text-amber-700 italic flex items-center gap-1.5" data-testid={`preview-adaptive-empty-${l.layerId}`}>
                                        <AlertCircle size={12} /> Adaptive primer — no library match for the current parameters
                                      </div>
                                    );
                                  }
                                  const pinned = l.defaultPrimerLibraryId
                                    ? resolved.find(r => r.primerId === l.defaultPrimerLibraryId)
                                    : null;
                                  const lead = pinned || resolved[0];
                                  const others = resolved.filter(r => r.primerId !== lead.primerId);
                                  return (
                                    <div data-testid={`preview-adaptive-${l.layerId}`}>
                                      <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                                        {pinned && <Star size={12} className="text-amber-500 fill-amber-500" />}
                                        {lead.productName || lead.primerId}
                                        <span className="ml-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                          Adaptive
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-slate-500 mt-0.5">
                                        {lead.supplier || '—'}
                                        <span className="ml-2 text-slate-400">
                                          Resolved from Primer Library · {resolved.length} match{resolved.length === 1 ? '' : 'es'}
                                        </span>
                                      </div>
                                      {others.length > 0 && (
                                        <div className="mt-2 text-[11px] text-slate-500">
                                          <span className="text-slate-400">Alt: </span>
                                          {others.slice(0, 3).map(r => r.productName || r.primerId).join(', ')}
                                          {others.length > 3 && ` +${others.length - 3} more`}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()
                              ) : !active ? (
                                <div className="text-xs text-slate-400 italic flex items-center gap-1.5">
                                  <AlertCircle size={12} /> No product assigned
                                </div>
                              ) : (
                                <>
                                  <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                                    {active.optionId === def?.optionId && <Star size={12} className="text-amber-500 fill-amber-500" />}
                                    {active.productName || '—'}
                                  </div>
                                  <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                    <span>{active.productSupplier || '—'}</span>
                                    {active.productStockCode && (
                                      <span className="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded">
                                        {active.productStockCode}
                                      </span>
                                    )}
                                  </div>

                                  {/* Qualification tags */}
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {tag ? (
                                      <>
                                        {(tag.substrateTypes || []).slice(0, 4).map(s => (
                                          <TagPill key={'sub-' + s} tone="slate">{s}</TagPill>
                                        ))}
                                        {tag.dutyRating && <TagPill tone="amber">{tag.dutyRating}</TagPill>}
                                        {tag.finishType && <TagPill tone="green">{tag.finishType}</TagPill>}
                                      </>
                                    ) : (
                                      <TagPill tone="slate">Unqualified</TagPill>
                                    )}
                                  </div>

                                  {/* Installable-spec mini-table. Only rendered
                                      when the layer carries at least one of the
                                      four spec values. Two-column grid keeps
                                      labels right-aligned and values monospaced
                                      so multiple stacked layer cards line up
                                      visually. */}
                                  {(() => {
                                    const consumption = fmtSpec(l.consumptionRateKgM2, 'kg/m²');
                                    const dft = fmtSpec(l.dftMicrons, 'μm');
                                    const recoat = fmtSpecRange(l.recoatMinHours, l.recoatMaxHours, 'h');
                                    if (!consumption && !dft && !recoat) return null;
                                    return (
                                      <dl className="mt-3 pt-2 border-t border-slate-100 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                                        {consumption && (<>
                                          <dt className="text-slate-400">Consumption</dt>
                                          <dd className="text-slate-700 font-mono tabular-nums">{consumption}</dd>
                                        </>)}
                                        {dft && (<>
                                          <dt className="text-slate-400">DFT</dt>
                                          <dd className="text-slate-700 font-mono tabular-nums">{dft}</dd>
                                        </>)}
                                        {recoat && (<>
                                          <dt className="text-slate-400">Recoat</dt>
                                          <dd className="text-slate-700 font-mono tabular-nums">{recoat}</dd>
                                        </>)}
                                      </dl>
                                    );
                                  })()}

                                  {/* ── Per-layer "Description & key properties" ──
                                      Mirrors the Sika / PPG technical-catalog
                                      layer block (headline + paragraph + bullet
                                      list of properties). Either field is
                                      optional so partially-filled layers still
                                      render cleanly. Populated either by the
                                      user (future inline editor) or by the
                                      System AI Fill flow.
                                      The whole section is hidden when both
                                      fields are empty so cards without
                                      enhanced copy stay compact. */}
                                  {(() => {
                                    const desc = (l.previewDescription || '').trim();
                                    const props = (l.previewProperties || []).filter(p => typeof p === 'string' && p.trim().length > 0);
                                    if (!desc && props.length === 0) return null;
                                    return (
                                      <div
                                        className="mt-3 pt-3 border-t border-slate-100"
                                        data-testid={`preview-layer-enhancement-${l.layerId}`}
                                      >
                                        {desc && (
                                          <p className="text-[12px] leading-snug text-slate-700 whitespace-pre-line">
                                            {desc}
                                          </p>
                                        )}
                                        {props.length > 0 && (
                                          <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-600 list-disc list-inside marker:text-slate-400">
                                            {props.map((p, i) => (
                                              <li key={`prop-${l.layerId}-${i}`}>{p}</li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {/* Alternatives switcher */}
                                  {l.productOptions.length > 1 && (
                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                      <div className="flex flex-wrap gap-1">
                                        {l.productOptions.map(o => {
                                          const isActive = o.optionId === active.optionId;
                                          return (
                                            <button
                                              key={o.optionId}
                                              type="button"
                                              onClick={() => setActiveOptionByLayer(prev => ({ ...prev, [l.layerId]: o.optionId }))}
                                              className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                                                isActive
                                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                              }`}
                                              title={o.productName || ''}
                                            >
                                              {o.isDefault && <Star size={9} className={`inline mr-1 ${isActive ? 'fill-white' : 'fill-amber-500 text-amber-500'}`} />}
                                              {o.productName || 'Unnamed'}
                                            </button>
                                          );
                                        })}
                                      </div>

                                      {/* "Make default" — only shown when the active alternative
                                          isn't already the default. Writes through updateLayer
                                          and optimistically flips the star. Each layer has its
                                          own in-flight + error state so multiple layers can be
                                          saving in parallel without interfering. */}
                                      {active.optionId !== def?.optionId && (() => {
                                        const isSaving = makingDefaultLayers.has(l.layerId);
                                        const layerError = makeDefaultErrors[l.layerId];
                                        return (
                                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                                            <button
                                              type="button"
                                              disabled={isSaving}
                                              onClick={() => makeDefault(l.layerId, active.productId)}
                                              className={`text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-full border transition-colors ${
                                                isSaving
                                                  ? 'bg-amber-50 text-amber-500 border-amber-200 cursor-wait'
                                                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                              }`}
                                              title="Promote this product to the layer's default"
                                            >
                                              <Star size={10} className={isSaving ? '' : 'fill-amber-500 text-amber-500'} />
                                              {isSaving ? 'Saving…' : 'Make default'}
                                            </button>
                                            {layerError && (
                                              <span className="text-[10px] text-rose-600 inline-flex items-center gap-1">
                                                <AlertCircle size={10} /> {layerError}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Usage areas — editable textarea, one sentence per
                          line. Debounced autosave to systems.typical_uses
                          (mirrors Recommendation). The AI button overwrites
                          via the AI Fill review panel. */}
                      <div className="mt-5 p-3 bg-sky-50 border border-sky-200 rounded-xl">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-sky-700 uppercase tracking-wide">Usage areas</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-sky-600">
                              {usesSaving ? 'Saving…' : (usesDirtyRef.current ? 'Unsaved' : 'Saved')}
                            </span>
                            <AiFillButton
                              onClick={() => runAiFill(openSystem.systemId)}
                              loading={aiLoading}
                              size="sm"
                              variant="ghost"
                              label="AI"
                              title="Generate AI usage areas"
                            />
                          </div>
                        </div>
                        <textarea
                          value={usesText}
                          onChange={(e) => onUsesChange(e.target.value)}
                          placeholder={'List typical use cases — one sentence per line.\nFor example:\nSuitable for warehouse floors with forklift traffic.\nIdeal for food production areas requiring chemical resistance.'}
                          rows={4}
                          className="w-full bg-white border border-sky-200 rounded-md p-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-300 resize-y"
                        />
                      </div>

                      {/* Recommendation / preview_note */}
                      <div className="mt-5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Recommendation</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-emerald-600">
                              {noteSaving ? 'Saving…' : (noteDirtyRef.current ? 'Unsaved' : 'Saved')}
                            </span>
                            <AiFillButton
                              onClick={() => runAiFill(openSystem.systemId)}
                              loading={aiLoading}
                              size="sm"
                              variant="ghost"
                              label="AI"
                              title="Generate AI recommendation"
                            />
                          </div>
                        </div>
                        <textarea
                          value={noteText}
                          onChange={e => onNoteChange(e.target.value)}
                          placeholder="Add a recommendation for this system…"
                          rows={3}
                          className="w-full text-sm bg-white border border-emerald-200 rounded-lg p-2 focus:ring-1 focus:ring-emerald-400 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ---- AI Fill review panel (slides in below body) ---- */}
                  {aiProposal && (
                    <SystemAIFillPanel
                      systemName={openSystem.name}
                      // Pass each layer's current saved enhancement +
                      // display metadata so the panel can diff per
                      // layer and label rows like the preview cards
                      // (order, layer name, default product name).
                      layers={openSystem.layers.map(l => ({
                        layerId: l.layerId,
                        order: (l.orderSequence ?? 0) + 1,
                        layerName: l.layerName,
                        productName: (l.productOptions.find(o => o.isDefault) || l.productOptions[0])?.productName || null,
                      }))}
                      current={{
                        description: openSystem.description || '',
                        recommendation: noteText,
                        warnings: [],
                        // Read from the inline editor state so the review
                        // panel's "Current" column reflects unsaved edits
                        // (matches how recommendation uses noteText).
                        usageAreas: usesText
                          .split('\n')
                          .map(s => s.trim())
                          .filter(Boolean),
                        // Snapshot of each layer's currently-saved card
                        // content so the panel can render current vs
                        // proposed for the layer rows.
                        layerEnhancements: Object.fromEntries(
                          openSystem.layers
                            .filter(l => (l.previewDescription || '').trim() || (l.previewProperties || []).length > 0)
                            .map(l => [l.layerId, {
                              description: l.previewDescription || '',
                              properties: (l.previewProperties || []).filter(p => typeof p === 'string' && p.trim().length > 0),
                            }]),
                        ),
                      }}
                      proposed={aiProposal}
                      onApply={applyAiFill}
                      onDiscard={() => {
                        setAiProposal(null);
                        setBatchQueue(prev => {
                          const { [openSystem.systemId]: _drop, ...rest } = prev;
                          return rest;
                        });
                      }}
                    />
                  )}

                  {/* ---- modal action bar ---- */}
                  <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                    <button
                      type="button"
                      onClick={exportSpecSheet}
                      className="px-3 py-1.5 text-sm bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 inline-flex items-center gap-1.5"
                    >
                      <Download size={14} /> Export spec sheet
                    </button>
                    <button
                      type="button"
                      onClick={() => { onEditInBuilder(openSystem.systemId); closeModal(); }}
                      className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 inline-flex items-center gap-1.5"
                    >
                      <Edit3 size={14} /> Edit in Builder
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* COMPARE MODAL — side-by-side view of two systems                     */}
      {/* =================================================================== */}
      {/*
        Layout reuses the same LAYER_COLORS and inferLayerPositionFromSlotName
        helpers as the single-preview modal so the cross-section bars look
        identical. The middle "delta" table highlights rows whose values
        differ between A and B with an amber ring + "≠" badge — that's the
        whole point of the compare view, so it's visually loud.
      */}
      {compareOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 overflow-y-auto"
          onClick={closeCompareModal}
        >
          <div className="min-h-screen flex items-start justify-center py-8 px-4">
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl"
              onClick={e => e.stopPropagation()}
              style={{ minHeight: '60vh' }}
              role="dialog"
              aria-modal="true"
              aria-label="Compare systems"
            >
              {compareLoading || !compareSystems[0] || !compareSystems[1] ? (
                <div className="p-12 text-center text-slate-500">Loading both systems…</div>
              ) : (() => {
                // Extracted into an IIFE so we can compute the delta map
                // once and reuse it in the parameter table without re-running
                // the comparisons in render.
                const [A, B] = compareSystems as [FullSystem, FullSystem];
                const finishOf = (s: FullSystem) => {
                  const finishes = new Set<string>();
                  for (const l of s.layers) {
                    const def = l.productOptions.find(o => o.isDefault) || l.productOptions[0];
                    if (def) {
                      const t = tagsByProduct[def.productId];
                      if (t?.finishType) finishes.add(t.finishType);
                    }
                  }
                  return finishes.size ? Array.from(finishes).join(', ') : '';
                };
                const topcoatOf = (s: FullSystem) =>
                  s.layers.some(l => inferLayerPositionFromSlotName(l.layerName) === 'topcoat') ? 'Yes' : 'No';

                // Each row: [label, value-A, value-B]. Empty values render as
                // dashes; differing values render with the delta badge.
                const rows: Array<[string, string, string]> = [
                  ['Substrate',       (A.systemSubstrate || '').trim(), (B.systemSubstrate || '').trim()],
                  ['Humidity',        (A.systemHumidity  || '').trim(), (B.systemHumidity  || '').trim()],
                  ['Duty',            (A.systemDuty      || '').trim(), (B.systemDuty      || '').trim()],
                  ['Finish',          finishOf(A),                       finishOf(B)],
                  ['Topcoat required', topcoatOf(A),                     topcoatOf(B)],
                  ['Layer count',     String(A.layers.length),           String(B.layers.length)],
                  // Installable-spec total thickness goes through the same
                  // fmt helper as everywhere else; empty string when neither
                  // bound is set so the existing "Not configured" placeholder
                  // and the differs-only highlighting both still work.
                  ['Total thickness',
                    fmtSpecRange(A.totalThicknessMinMm, A.totalThicknessMaxMm, 'mm') || '',
                    fmtSpecRange(B.totalThicknessMinMm, B.totalThicknessMaxMm, 'mm') || ''],
                ];

                // Render a single side's cross-section (top→bottom) — used
                // twice below.
                const renderCrossSection = (s: FullSystem) => (
                  <div className="space-y-1">
                    {[...s.layers].reverse().map((l, idx) => {
                      const realIdx = s.layers.length - 1 - idx;
                      const pos = inferLayerPositionFromSlotName(l.layerName) || 'unknown';
                      const c = LAYER_COLORS[pos];
                      const isFinal = realIdx === s.layers.length - 1;
                      return (
                        <div
                          key={l.layerId}
                          className="flex items-stretch rounded-md overflow-hidden border border-transparent"
                          style={{ minHeight: 32 }}
                        >
                          <div style={{ width: 4, backgroundColor: c.accent }} />
                          <div className="flex-1 flex flex-col px-3 py-1.5" style={{ backgroundColor: c.fill }}>
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white"
                                style={{ backgroundColor: c.accent }}
                              >
                                {realIdx + 1}
                              </span>
                              <span className="text-xs font-medium truncate" style={{ color: c.text }}>{l.layerName}</span>
                              {isFinal && (
                                <span className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                                  final
                                </span>
                              )}
                            </div>
                            {/* Compare-modal compact spec line — same source
                                helper as the single-preview bar so both views
                                read identically. Skipped when the layer has
                                no spec values to keep the side-by-side height
                                tight. */}
                            {(() => {
                              const summary = buildLayerSpecSummary(l);
                              if (!summary) return null;
                              return (
                                <div
                                  className="mt-0.5 ml-7 text-[9px] font-mono tabular-nums truncate"
                                  style={{ color: c.text, opacity: 0.7 }}
                                >
                                  {summary}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-center px-3 py-1.5 mt-1 border-2 border-dashed border-slate-300 rounded-md text-[10px] text-slate-500 bg-white">
                      <Layers size={11} className="mr-1.5" />
                      {s.systemSubstrate || 'Not configured'}
                    </div>
                  </div>
                );

                // Per-layer default-product summary list — kept compact so
                // both columns fit at standard modal width.
                const renderLayerSummary = (s: FullSystem) => (
                  <ul className="space-y-1.5">
                    {[...s.layers].reverse().map(l => {
                      const def = l.productOptions.find(o => o.isDefault) || l.productOptions[0];
                      const pos = inferLayerPositionFromSlotName(l.layerName) || 'unknown';
                      const c = LAYER_COLORS[pos];
                      return (
                        <li key={l.layerId} className="flex items-start gap-2 text-xs">
                          <span className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: c.accent }} />
                          <div className="min-w-0">
                            <div className="text-slate-700 font-medium truncate">{l.layerName}</div>
                            <div className="text-slate-500 truncate">{def?.productName || <span className="italic">No product</span>}</div>
                            {/* Per-layer installable-spec summary in the
                                compare layer-summary list. Hidden when the
                                layer has nothing spec'd, so legacy systems
                                don't gain an empty grey line. */}
                            {(() => {
                              const summary = buildLayerSpecSummary(l);
                              if (!summary) return null;
                              return (
                                <div className="text-[10px] text-slate-400 font-mono tabular-nums truncate mt-0.5">
                                  {summary}
                                </div>
                              );
                            })()}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                );

                return (
                  <>
                    {/* ---- compare-modal header ---- */}
                    <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <GitCompare size={18} className="text-indigo-600" />
                        <h2 className="text-lg font-bold text-slate-800">Compare systems</h2>
                      </div>
                      <button
                        onClick={closeCompareModal}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                        aria-label="Close compare"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {/* ---- two-column system header strip ---- */}
                    <div className="grid grid-cols-2 gap-0 border-b border-slate-200">
                      {[A, B].map((s, i) => (
                        <div key={s.systemId} className={`p-4 ${i === 0 ? 'border-r border-slate-200 bg-slate-50' : 'bg-white'}`}>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                            System {i === 0 ? 'A' : 'B'}
                          </div>
                          <h3 className="text-sm font-semibold text-slate-800">{s.name}</h3>
                          {s.description && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{s.description}</p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* ---- cross-sections side-by-side ---- */}
                    <div className="grid grid-cols-2 gap-0">
                      {[A, B].map((s, i) => (
                        <div key={s.systemId} className={`p-5 ${i === 0 ? 'border-r border-slate-100 bg-slate-50' : 'bg-white'}`}>
                          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Build-up</h4>
                          {renderCrossSection(s)}
                        </div>
                      ))}
                    </div>

                    {/* ---- parameter delta table ---- */}
                    <div className="px-6 py-5 border-t border-slate-200">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Parameters</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-slate-400 border-b border-slate-200">
                              <th className="py-2 font-medium w-1/4">Parameter</th>
                              <th className="py-2 font-medium">{A.name}</th>
                              <th className="py-2 font-medium">{B.name}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(([label, a, b]) => {
                              // We only flag a row as "different" when both
                              // sides have a value AND those values differ.
                              // Comparing missing-vs-present would create
                              // noisy false-positives when one system simply
                              // hasn't been fully configured yet.
                              const differs = a !== '' && b !== '' && a.toLowerCase() !== b.toLowerCase();
                              return (
                                <tr
                                  key={label}
                                  className={`border-b border-slate-100 last:border-b-0 ${
                                    differs ? 'bg-amber-50' : ''
                                  }`}
                                >
                                  <td className="py-2 text-slate-500">{label}</td>
                                  <td className={`py-2 ${differs ? 'text-amber-800 font-medium' : 'text-slate-800'}`}>
                                    {a || <span className="italic text-slate-400">Not configured</span>}
                                  </td>
                                  <td className={`py-2 ${differs ? 'text-amber-800 font-medium' : 'text-slate-800'}`}>
                                    <div className="flex items-center gap-2">
                                      <span>{b || <span className="italic text-slate-400">Not configured</span>}</span>
                                      {differs && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">≠</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* ---- per-layer default-product summary, side-by-side ---- */}
                    <div className="grid grid-cols-2 gap-0 border-t border-slate-200">
                      {[A, B].map((s, i) => (
                        <div key={s.systemId} className={`p-5 ${i === 0 ? 'border-r border-slate-100 bg-slate-50' : 'bg-white'}`}>
                          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Layer products</h4>
                          {renderLayerSummary(s)}
                        </div>
                      ))}
                    </div>

                    {/* ---- compare-modal action bar ---- */}
                    <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                      <button
                        type="button"
                        onClick={closeCompareModal}
                        className="px-3 py-1.5 text-sm bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100"
                      >
                        Close
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export Eye icon so the parent System Builder can pick the right icon
// without re-importing Lucide. Kept tiny on purpose.
export const SystemPreviewTabIcon = Eye;
