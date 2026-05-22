// Review panel for AI-generated system descriptions / recommendations / warnings.
//
// Slides in BELOW the modal content (does not replace anything).
// Shows current vs proposed side-by-side with per-section actions:
//   - "Use this" replaces the current value in the panel state (the parent
//      decides when to commit + save).
//   - "Edit" makes the proposed field editable inline.
//   - "Apply all" commits every proposed field to the parent.
//   - "Discard" closes the panel without committing anything.
//
// The panel itself is purely presentational — it never calls the API. The
// parent component owns both the fetch (so it can drive the "AI Fill all
// systems" batch flow) and the save (so saves stay tied to the existing
// debounced previewNote handler).

import { useState } from 'react';
import { Sparkles, X, Pencil, Check } from 'lucide-react';

// Per-layer "Description & key properties" content shown on the System
// Preview cards (Sika/PPG-style). Used in both directions:
//   - AiFillResult.layerEnhancements: what the model proposes, keyed by
//     layerId so the parent can fan out PUT /api/system-layers/:id calls.
//   - AiFillCurrent.layerEnhancements: what is currently persisted on
//     each layer, so the review panel can show current vs proposed.
export type LayerEnhancement = {
  description: string;
  properties: string[];
};
// Display metadata attached to each layer row in the review panel so we
// can render a meaningful label (e.g. "③ Topcoat — POLEPOX PU TP 600")
// without needing to look the layer up by ID. Built by the parent from
// the current open system's layers.
export type LayerMeta = {
  layerId: string;
  order: number;
  layerName: string;
  productName: string | null;
};

export type AiFillResult = {
  description: string;
  recommendation: string;
  warnings: string[];
  // One sentence per array entry — rendered as a bulleted list in both the
  // review panel and the modal body. Persisted to systems.typical_uses as
  // newline-joined text.
  usageAreas: string[];
  // Per-layer card content keyed by `layerId`. May contain entries for
  // any subset of the system's layers (the server only returns entries
  // it could ground in real data).
  layerEnhancements: Record<string, LayerEnhancement>;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasoning: string;
};

export type AiFillCurrent = {
  description: string;
  recommendation: string;
  warnings: string[];
  usageAreas: string[];
  // Current per-layer card content, keyed by layerId. Same shape as the
  // proposal so the review panel can diff them side-by-side.
  layerEnhancements: Record<string, LayerEnhancement>;
};

const CONFIDENCE_COLORS: Record<AiFillResult['confidence'], string> = {
  HIGH: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-200',
  LOW: 'bg-rose-100 text-rose-700 border-rose-200',
};

export function SystemAIFillPanel(props: {
  current: AiFillCurrent;
  proposed: AiFillResult;
  onApply: (next: AiFillCurrent) => void;
  onDiscard: () => void;
  systemName?: string;
  // Ordered list of layers in the open system, used to label per-layer
  // review rows. The order here drives the rendering order so the panel
  // matches the preview card sequence (Primer → Body → Topcoat).
  layers?: LayerMeta[];
}) {
  const { current, proposed, onApply, onDiscard, systemName, layers = [] } = props;

  // Local editable copy of the proposed values so "Use this" / inline edits
  // mutate this scratch state, then "Apply all" / per-section apply pushes
  // the relevant slice up to the parent.
  const [draft, setDraft] = useState<AiFillCurrent>({
    description: proposed.description || '',
    recommendation: proposed.recommendation || '',
    warnings: [...(proposed.warnings || [])],
    usageAreas: [...(proposed.usageAreas || [])],
    // Shallow-clone each layer enhancement so inline edits below don't
    // accidentally mutate the immutable `proposed` reference.
    layerEnhancements: Object.fromEntries(
      Object.entries(proposed.layerEnhancements || {}).map(([k, v]) => [
        k,
        { description: v.description || '', properties: [...(v.properties || [])] },
      ]),
    ),
  });
  const [editing, setEditing] = useState<{ description: boolean; recommendation: boolean; warnings: boolean; usageAreas: boolean }>({
    description: false,
    recommendation: false,
    warnings: false,
    usageAreas: false,
  });
  // Per-layer inline-edit toggles, keyed by layerId. Independent of the
  // top-level `editing` object so toggling one layer doesn't collapse
  // others.
  const [layerEditing, setLayerEditing] = useState<Record<string, boolean>>({});

  // Per-section "Use this" — copies the draft for that field up into the
  // current values (which the parent persists). The other fields keep their
  // current values untouched so users can adopt the AI output piecemeal.
  const useField = (field: keyof AiFillCurrent) => {
    onApply({
      ...current,
      [field]: draft[field],
    });
  };

  const applyAll = () => {
    onApply({ ...draft });
  };

  return (
    <div className="border-t border-violet-200 bg-gradient-to-b from-violet-50/60 to-white">
      {/* ---- header ---- */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-violet-100">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-violet-600" />
          <span className="text-sm font-semibold text-violet-900">
            AI suggestions{systemName ? ` — ${systemName}` : ''}
          </span>
          <span
            className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${CONFIDENCE_COLORS[proposed.confidence]}`}
          >
            {proposed.confidence} confidence
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={applyAll}
            className="px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 inline-flex items-center gap-1.5"
          >
            <Check size={13} /> Apply all
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1"
          >
            <X size={13} /> Discard
          </button>
        </div>
      </div>

      {/* ---- reasoning ---- */}
      {proposed.reasoning && (
        <div className="px-6 pt-3 text-xs italic text-slate-500">
          <span className="font-semibold not-italic text-slate-600">Why: </span>
          {proposed.reasoning}
        </div>
      )}

      {/* ---- side-by-side review ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 text-sm">
        {/* DESCRIPTION */}
        <ReviewBlock
          label="Description"
          currentValue={current.description || '(empty)'}
          proposed={draft.description}
          editing={editing.description}
          onEditToggle={() => setEditing((e) => ({ ...e, description: !e.description }))}
          onProposedChange={(v) => setDraft((d) => ({ ...d, description: v }))}
          onUseThis={() => useField('description')}
        />
        {/* RECOMMENDATION */}
        <ReviewBlock
          label="Recommendation"
          currentValue={current.recommendation || '(empty)'}
          proposed={draft.recommendation}
          editing={editing.recommendation}
          onEditToggle={() => setEditing((e) => ({ ...e, recommendation: !e.recommendation }))}
          onProposedChange={(v) => setDraft((d) => ({ ...d, recommendation: v }))}
          onUseThis={() => useField('recommendation')}
        />
        {/* USAGE AREAS (full width) — one sentence per line. Rendered
            unconditionally so the slot is always visible, even when the
            AI returned nothing (e.g. older proposals before the field
            was added). Empty proposed shows "(none)" on both sides. */}
        {true && (
          <div className="md:col-span-2">
            <ReviewBlock
              label="Usage areas"
              currentValue={current.usageAreas.length > 0 ? current.usageAreas.map((u) => `• ${u}`).join('\n') : '(none)'}
              proposed={draft.usageAreas.map((u) => `• ${u}`).join('\n')}
              editing={editing.usageAreas}
              onEditToggle={() => setEditing((e) => ({ ...e, usageAreas: !e.usageAreas }))}
              onProposedChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  usageAreas: v
                    .split('\n')
                    .map((line) => line.replace(/^[•\-\*]\s*/, '').trim())
                    .filter(Boolean),
                }))
              }
              onUseThis={() => useField('usageAreas')}
            />
          </div>
        )}
        {/* PER-LAYER CARD CONTENT (full width) — one collapsible row
            per layer the model returned an enhancement for. Each row
            shows the layer label + a side-by-side current/proposed
            view for the description and the properties bullet list.
            Inline edits mutate the draft; "Use this layer" copies just
            this row's draft up into `current.layerEnhancements`. */}
        {layers.length > 0 && (
          (() => {
            // Rows to render = every layer in the system that EITHER has
            // a proposed enhancement OR already has saved content. This
            // way the panel surfaces both new suggestions and any
            // existing layer copy the user might want to discard.
            const rows = layers.filter(
              (lm) => draft.layerEnhancements[lm.layerId] || current.layerEnhancements[lm.layerId],
            );
            if (rows.length === 0) return null;
            return (
              <div className="md:col-span-2 space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                  Layer cards — description &amp; properties
                </div>
                {rows.map((lm) => {
                  const cur = current.layerEnhancements[lm.layerId] || { description: '', properties: [] };
                  const prop = draft.layerEnhancements[lm.layerId] || { description: '', properties: [] };
                  const isEditing = !!layerEditing[lm.layerId];
                  const label = `${lm.order}. ${lm.layerName}${lm.productName ? ` — ${lm.productName}` : ''}`;
                  const fmtProps = (arr: string[]) => arr.map((p) => `• ${p}`).join('\n');
                  const updateDraft = (next: LayerEnhancement) => {
                    setDraft((d) => ({
                      ...d,
                      layerEnhancements: { ...d.layerEnhancements, [lm.layerId]: next },
                    }));
                  };
                  return (
                    <div key={lm.layerId} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700 truncate">{label}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setLayerEditing((e) => ({ ...e, [lm.layerId]: !e[lm.layerId] }))}
                            className="px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-200 rounded inline-flex items-center gap-1"
                            title={isEditing ? 'Stop editing' : 'Edit'}
                          >
                            <Pencil size={10} /> {isEditing ? 'Done' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onApply({
                                ...current,
                                layerEnhancements: { ...current.layerEnhancements, [lm.layerId]: prop },
                              })
                            }
                            className="px-2 py-0.5 text-[10px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded"
                          >
                            Use this layer
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 text-[11px] font-semibold uppercase tracking-wide bg-slate-50/60 border-b border-slate-100">
                        <div className="px-3 py-1.5 text-slate-500">Current</div>
                        <div className="px-3 py-1.5 text-violet-700 border-l border-slate-200">AI proposed</div>
                      </div>
                      <div className="grid grid-cols-2 min-h-[80px]">
                        {/* Current side: read-only diff target. Joins
                            properties as bullets so it visually mirrors
                            how the preview card itself renders them. */}
                        <div className="px-3 py-2 text-xs space-y-1.5 text-slate-600">
                          {cur.description
                            ? <p className="whitespace-pre-wrap font-sans">{cur.description}</p>
                            : <p className="italic text-slate-400">(no description)</p>}
                          {cur.properties.length > 0 ? (
                            <pre className="whitespace-pre-wrap font-sans">{fmtProps(cur.properties)}</pre>
                          ) : (
                            <p className="italic text-slate-400">(no properties)</p>
                          )}
                        </div>
                        {/* Proposed side: editable when isEditing, read-
                            only otherwise. Description + bullets share
                            the same single textarea (one block per
                            line, split back on blur via the same
                            "strip leading bullet" rule the usageAreas
                            block uses for symmetry). */}
                        <div className="px-3 py-2 border-l border-slate-100">
                          {isEditing ? (
                            <div className="space-y-1.5">
                              <textarea
                                value={prop.description}
                                onChange={(e) => updateDraft({ ...prop, description: e.target.value })}
                                rows={Math.max(2, Math.min(5, prop.description.split('\n').length + 1))}
                                placeholder="Headline — short technical paragraph"
                                className="w-full text-xs bg-violet-50/40 border border-violet-200 rounded p-1.5 focus:ring-1 focus:ring-violet-400 outline-none font-sans"
                              />
                              <textarea
                                value={fmtProps(prop.properties)}
                                onChange={(e) =>
                                  updateDraft({
                                    ...prop,
                                    properties: e.target.value
                                      .split('\n')
                                      .map((l) => l.replace(/^[•\-\*]\s*/, '').trim())
                                      .filter(Boolean),
                                  })
                                }
                                rows={Math.max(3, Math.min(8, prop.properties.length + 1))}
                                placeholder="• one bullet per line"
                                className="w-full text-xs bg-violet-50/40 border border-violet-200 rounded p-1.5 focus:ring-1 focus:ring-violet-400 outline-none font-sans"
                              />
                            </div>
                          ) : (
                            <div className="text-xs space-y-1.5 text-slate-800">
                              {prop.description
                                ? <p className="whitespace-pre-wrap font-sans">{prop.description}</p>
                                : <p className="italic text-slate-400">(no description)</p>}
                              {prop.properties.length > 0 ? (
                                <pre className="whitespace-pre-wrap font-sans">{fmtProps(prop.properties)}</pre>
                              ) : (
                                <p className="italic text-slate-400">(no properties)</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}

        {/* WARNINGS (full width when present) */}
        {(draft.warnings.length > 0 || current.warnings.length > 0) && (
          <div className="md:col-span-2">
            <ReviewBlock
              label="Warnings"
              currentValue={current.warnings.length > 0 ? current.warnings.map((w) => `• ${w}`).join('\n') : '(none)'}
              proposed={draft.warnings.map((w) => `• ${w}`).join('\n')}
              editing={editing.warnings}
              onEditToggle={() => setEditing((e) => ({ ...e, warnings: !e.warnings }))}
              onProposedChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  warnings: v
                    .split('\n')
                    .map((line) => line.replace(/^[•\-\*]\s*/, '').trim())
                    .filter(Boolean),
                }))
              }
              onUseThis={() => useField('warnings')}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: a single 2-column review block (current vs proposed + actions).
// ─────────────────────────────────────────────────────────────────────────────
function ReviewBlock(props: {
  label: string;
  currentValue: string;
  proposed: string;
  editing: boolean;
  onEditToggle: () => void;
  onProposedChange: (v: string) => void;
  onUseThis: () => void;
}) {
  const { label, currentValue, proposed, editing, onEditToggle, onProposedChange, onUseThis } = props;
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="grid grid-cols-2 text-[11px] font-semibold uppercase tracking-wide bg-slate-50 border-b border-slate-200">
        <div className="px-3 py-2 text-slate-500">Current — {label}</div>
        <div className="px-3 py-2 text-violet-700 border-l border-slate-200 flex items-center justify-between">
          <span>AI proposed</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onEditToggle}
              className="px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-200 rounded inline-flex items-center gap-1"
              title={editing ? 'Stop editing' : 'Edit'}
            >
              <Pencil size={10} /> {editing ? 'Done' : 'Edit'}
            </button>
            <button
              type="button"
              onClick={onUseThis}
              className="px-2 py-0.5 text-[10px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded"
            >
              Use this
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 min-h-[80px]">
        <pre className="px-3 py-2 text-xs whitespace-pre-wrap font-sans text-slate-600">{currentValue}</pre>
        <div className="px-3 py-2 border-l border-slate-100">
          {editing ? (
            <textarea
              value={proposed}
              onChange={(e) => onProposedChange(e.target.value)}
              rows={Math.max(3, Math.min(8, proposed.split('\n').length + 1))}
              className="w-full text-xs bg-violet-50/40 border border-violet-200 rounded p-1.5 focus:ring-1 focus:ring-violet-400 outline-none font-sans"
            />
          ) : (
            <pre className="text-xs whitespace-pre-wrap font-sans text-slate-800">{proposed || '(empty)'}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small "✦ AI Fill" button used in the modal header + textarea corner.
// ─────────────────────────────────────────────────────────────────────────────
export function AiFillButton(props: {
  onClick: () => void;
  loading?: boolean;
  size?: 'sm' | 'md';
  label?: string;
  variant?: 'solid' | 'ghost';
  title?: string;
}) {
  const { onClick, loading, size = 'md', label = 'AI Fill', variant = 'solid', title } = props;
  const px = size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';
  const cls =
    variant === 'solid'
      ? 'bg-violet-600 text-white hover:bg-violet-700'
      : 'text-violet-700 hover:bg-violet-100 border border-violet-200';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={title || label}
      className={`inline-flex items-center gap-1.5 font-semibold rounded-lg disabled:opacity-60 disabled:cursor-not-allowed ${px} ${cls}`}
    >
      <Sparkles size={size === 'sm' ? 11 : 13} className={loading ? 'animate-pulse' : ''} />
      {loading ? 'Thinking…' : label}
    </button>
  );
}
