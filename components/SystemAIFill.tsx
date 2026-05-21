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

export type AiFillResult = {
  description: string;
  recommendation: string;
  warnings: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasoning: string;
};

export type AiFillCurrent = {
  description: string;
  recommendation: string;
  warnings: string[];
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
}) {
  const { current, proposed, onApply, onDiscard, systemName } = props;

  // Local editable copy of the proposed values so "Use this" / inline edits
  // mutate this scratch state, then "Apply all" / per-section apply pushes
  // the relevant slice up to the parent.
  const [draft, setDraft] = useState<AiFillCurrent>({
    description: proposed.description || '',
    recommendation: proposed.recommendation || '',
    warnings: [...(proposed.warnings || [])],
  });
  const [editing, setEditing] = useState<{ description: boolean; recommendation: boolean; warnings: boolean }>({
    description: false,
    recommendation: false,
    warnings: false,
  });

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
