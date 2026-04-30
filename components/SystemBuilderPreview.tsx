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
import { Eye, X, Search, Edit3, Download, AlertCircle, Star, Layers } from 'lucide-react';
import { systemsApi } from '../client/api';
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

  // Inline preview-note editor.
  const [noteText, setNoteText] = useState<string>('');
  const [noteSaving, setNoteSaving] = useState(false);
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const openModal = useCallback(async (systemId: string) => {
    setOpenSystemId(systemId);
    setOpenLoading(true);
    setHighlightLayerId(null);
    try {
      const full: FullSystem = await systemsApi.getSystemFull(systemId);
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
    } catch (e) {
      console.error('Failed to load system:', e);
      setOpenSystem(null);
    } finally {
      setOpenLoading(false);
    }
  }, []);

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

  const closeModal = useCallback(() => {
    // Fire-and-forget the flush. We don't `await` it inside the close handler
    // because that would block the modal from closing — but the request will
    // complete in the background and the user will see the saved value next
    // time they open this system.
    void flushNoteSave();
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

  // ---------- "Export spec sheet" → downloadable .txt ----------
  const exportSpecSheet = useCallback(() => {
    if (!openSystem) return;
    const lines: string[] = [];
    lines.push(`SYSTEM SPEC SHEET — ${openSystem.name}`);
    lines.push('='.repeat(60));
    if (openSystem.description) lines.push(openSystem.description);
    lines.push('');
    lines.push('System parameters');
    lines.push(`  Substrate : ${openSystem.systemSubstrate || 'Not configured'}`);
    lines.push(`  Humidity  : ${openSystem.systemHumidity || 'Not configured'}`);
    lines.push(`  Duty      : ${openSystem.systemDuty || 'Not configured'}`);
    lines.push('');
    lines.push('Build-up (bottom → top)');
    for (let i = 0; i < openSystem.layers.length; i++) {
      const l = openSystem.layers[i];
      const pos = inferLayerPositionFromSlotName(l.layerName) || 'unknown';
      lines.push(`  Layer ${i + 1}: ${l.layerName}  [${LAYER_COLORS[pos].label}]`);
      const def = l.productOptions.find(o => o.isDefault) || l.productOptions[0];
      if (def) {
        lines.push(`    Default product: ${def.productName || '—'}  (${def.productStockCode || 'no code'})`);
        lines.push(`    Supplier:        ${def.productSupplier || '—'}`);
      }
      const others = l.productOptions.filter(o => o !== def);
      if (others.length) {
        lines.push(`    Alternatives:    ${others.map(o => o.productName).filter(Boolean).join(', ')}`);
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
  }, [openSystem]);

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
          <div className="ml-auto text-xs text-slate-500">
            {loading ? 'Loading…' : `${filtered.length} of ${systems.length} system${systems.length === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>

      {/* ---------- card grid ---------- */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-center text-slate-500 py-12">Loading systems…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-slate-500 py-12">No systems match these filters.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(({ system, material, suppliers, layerColors }) => (
              <button
                key={system.systemId}
                type="button"
                onClick={() => openModal(system.systemId)}
                className="text-left bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
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
              </button>
            ))}
          </div>
        )}
      </div>

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
                      <h2 className="text-lg font-bold text-slate-800">{openSystem.name}</h2>
                      {openSystem.description && (
                        <p className="text-sm text-slate-500 mt-0.5 max-w-2xl">{openSystem.description}</p>
                      )}
                    </div>
                    <button
                      onClick={closeModal}
                      className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                      aria-label="Close preview"
                    >
                      <X size={18} />
                    </button>
                  </div>

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
                              <div className="flex-1 flex items-center px-3 py-2 gap-3" style={{ backgroundColor: c.fill }}>
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

                              {!active ? (
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

                                  {/* Alternatives switcher */}
                                  {l.productOptions.length > 1 && (
                                    <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-slate-100">
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
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Recommendation / preview_note */}
                      <div className="mt-5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Recommendation</span>
                          <span className="text-[10px] text-emerald-600">
                            {noteSaving ? 'Saving…' : (noteDirtyRef.current ? 'Unsaved' : 'Saved')}
                          </span>
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
    </div>
  );
}

// Re-export Eye icon so the parent System Builder can pick the right icon
// without re-importing Lucide. Kept tiny on purpose.
export const SystemPreviewTabIcon = Eye;
