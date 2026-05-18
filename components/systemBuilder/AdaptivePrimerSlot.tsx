// ─────────────────────────────────────────────────────────────────────────────
// AdaptivePrimerSlot
// Replaces the manual product assignment area inside a primer-position
// system layer when layerMode === 'adaptive'. Shows a live preview of which
// primers from the Primer Library will resolve for the current system
// parameters (substrate / humidity / system type), lets the user pin one as
// the recommended default, and surfaces gaps for substrate+humidity combos
// the library does not yet cover.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { Library, Star, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { PrimerLibraryEntry } from '../../types';
import { primerLibraryApi } from '../../client/api';

interface AdaptivePrimerSlotProps {
  // The system's currently selected substrate (from the parameter header).
  // Null when the user has not chosen one yet — in that case we show the
  // "set parameters first" prompt instead of resolving anything.
  systemSubstrate: string | null | undefined;
  systemHumidity: string | null | undefined;
  // The system's duty rating from the parameter header. Forwarded to the
  // resolve filter so a Heavy-duty system doesn't surface Light-only
  // primers. Pass null to skip the duty filter.
  systemDuty?: string | null | undefined;
  // Inferred material/system type for the adaptive resolve filter
  // (Epoxy / PU / Polyurea / Acrylic). Pass null to skip the type filter.
  systemType: string | null;
  // Pinned default primer id (primer_library.primerId). Optional.
  defaultPrimerLibraryId: string | null | undefined;
  // Persists the pinned default primer to the parent layer.
  onSetDefault: (primerId: string | null) => void | Promise<void>;
  // External counter that the parent bumps when a primer was added/edited
  // in the library tab in another window — drives a refresh.
  refreshKey?: number;
  // Reports the resolved entries upward so the Build-Up Preview /
  // System Health summary on the right side panel can render gap warnings
  // and the "→ <primer>" line. Called whenever the resolve list changes.
  onResolved?: (entries: PrimerLibraryEntry[]) => void;
}

const AdaptivePrimerSlot: React.FC<AdaptivePrimerSlotProps> = ({
  systemSubstrate, systemHumidity, systemDuty, systemType,
  defaultPrimerLibraryId, onSetDefault, refreshKey, onResolved,
}) => {
  const [resolved, setResolved] = useState<PrimerLibraryEntry[]>([]);
  const [allActive, setAllActive] = useState<PrimerLibraryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-resolve whenever any parameter changes. If substrate or humidity is
  // missing we still fetch ALL active primers so the coverage summary below
  // can compute gaps; the "resolved for this system" preview is what gets
  // hidden in that case.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      primerLibraryApi.resolve({
        substrate: systemSubstrate || undefined,
        humidity: systemHumidity || undefined,
        duty: systemDuty || undefined,
        systemType: systemType || undefined,
      }),
      // Coverage list must use the same duty rule as resolve, otherwise the
      // gap summary can claim coverage from primers that are excluded for
      // the current systemDuty. (Null duty = universal, mirroring resolve.)
      primerLibraryApi.list({ systemType: systemType || undefined })
        .then((rows: PrimerLibraryEntry[]) =>
          systemDuty
            ? (rows || []).filter(p => !p.dutyRating || p.dutyRating === systemDuty)
            : (rows || [])
        ),
    ])
      .then(([res, all]) => {
        if (cancelled) return;
        setResolved(res || []);
        setAllActive(all || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load primers');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemSubstrate, systemHumidity, systemDuty, systemType, refreshKey]);

  // Coverage summary — for every (substrate, humidity) combination across
  // all active library primers (filtered by systemType when given), check
  // if there's at least one primer covering it. Primers without a humidity
  // value are treated as universal for that substrate.
  const coverage = useMemo(() => {
    const substrates = new Set<string>();
    const humidities = new Set<string>();
    for (const p of allActive) {
      for (const s of p.compatibleSubstrates || []) substrates.add(s);
      if (p.humidityTolerance) humidities.add(p.humidityTolerance);
    }
    const covered: Array<{ substrate: string; humidity: string }> = [];
    const gaps: Array<{ substrate: string; humidity: string }> = [];
    for (const s of substrates) {
      for (const h of humidities) {
        const has = allActive.some(p =>
          (p.compatibleSubstrates || []).includes(s) &&
          (!p.humidityTolerance || p.humidityTolerance === h)
        );
        (has ? covered : gaps).push({ substrate: s, humidity: h });
      }
    }
    return { covered, gaps };
  }, [allActive]);

  // Humidity is optional in the system header ("— Any —" = null). When the
  // user leaves it blank we still want to preview every primer for the
  // chosen substrate rather than blocking with the "set parameters" prompt.
  // Substrate is the only hard gate.
  const paramsSet = !!systemSubstrate;

  // Report the resolved list upward so the layer header badge and the
  // system summary product count reflect what the user actually sees here.
  useEffect(() => {
    if (onResolved) onResolved(resolved);
    // We deliberately exclude onResolved from deps to avoid re-firing
    // when the parent's callback identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  return (
    <div className="px-3 py-3 bg-indigo-50/30 border-b border-indigo-100" data-testid="adaptive-primer-slot">
      <div className="flex items-center gap-2 mb-2">
        <Library size={14} className="text-indigo-600" />
        <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">
          Adaptive primer slot
        </span>
        {loading && <Loader2 size={12} className="animate-spin text-indigo-400" />}
      </div>

      {error && (
        <div className="mb-2 px-2 py-1.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
          {error}
        </div>
      )}

      {/* Resolved preview */}
      <div className="mb-3">
        <div className="text-[11px] font-semibold text-slate-600 uppercase mb-1.5">
          Primers that will resolve for this system
        </div>
        {!paramsSet ? (
          <div className="text-xs text-slate-500 italic px-2 py-2 bg-white/70 rounded border border-dashed border-slate-300">
            Pick a substrate in System Parameters above to preview which primers will resolve.
          </div>
        ) : resolved.length === 0 ? (
          <div className="text-xs text-amber-700 px-2 py-2 bg-amber-50 border border-amber-200 rounded flex items-center gap-1.5">
            <AlertTriangle size={12} />
            No primers in library match these conditions — add primers to the Primer Library tab.
          </div>
        ) : (
          <div className="space-y-1.5">
            {resolved.map(p => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded border transition-colors cursor-pointer ${defaultPrimerLibraryId === p.primerId ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200 hover:border-indigo-300'}`}
                onClick={() => onSetDefault(defaultPrimerLibraryId === p.primerId ? null : p.primerId)}
                title={defaultPrimerLibraryId === p.primerId ? 'Click to unpin as default' : 'Click to pin as default for this layer'}
                data-testid={`adaptive-primer-row-${p.primerId}`}
              >
                {defaultPrimerLibraryId === p.primerId ? (
                  <Star size={12} className="text-amber-500 flex-shrink-0" fill="currentColor" />
                ) : (
                  <Star size={12} className="text-slate-300 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-700 truncate">{p.productName || p.productId}</div>
                  {p.productDescription && (
                    <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2" title={p.productDescription}>
                      {p.productDescription}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span className="font-mono">{p.primerId}</span>
                    {p.supplier && <span>· {p.supplier}</span>}
                    {(p.compatibleSubstrates || []).slice(0, 3).map(s => (
                      <span key={s} className="px-1 py-0.5 bg-slate-100 rounded">{s}</span>
                    ))}
                    {p.humidityTolerance && (
                      <span className="px-1 py-0.5 bg-blue-50 text-blue-700 rounded">{p.humidityTolerance}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Library coverage summary — informational only. Tells the user
          which substrate/humidity combos their *whole library* covers
          (not this specific layer), so they can spot gaps to fill in
          before specifying systems for those conditions. Collapsed by
          default to reduce noise. */}
      {allActive.length > 0 && (
        <details className="mt-3 group">
          <summary className="text-[11px] font-semibold text-slate-600 uppercase cursor-pointer hover:text-slate-800 select-none">
            Library coverage <span className="text-[10px] font-normal text-slate-400 normal-case">(across your whole Primer Library — not this layer)</span>
          </summary>
          <div className="mt-1.5">
            {coverage.covered.length > 0 && (
              <div className="text-[11px] text-slate-600 flex items-start gap-1.5 mb-1">
                <Check size={11} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                <span>
                  <span className="font-medium">Library can handle:</span>{' '}
                  {coverage.covered.slice(0, 6).map(c => `${c.substrate}/${c.humidity}`).join(' · ')}
                  {coverage.covered.length > 6 && ` (+${coverage.covered.length - 6} more)`}
                </span>
              </div>
            )}
            {coverage.gaps.length > 0 && (
              <div className="text-[11px] text-amber-700 flex items-start gap-1.5">
                <AlertTriangle size={11} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <span>
                  <span className="font-medium">Library is missing primers for:</span>{' '}
                  {coverage.gaps.slice(0, 6).map(c => `${c.substrate}/${c.humidity}`).join(' · ')}
                  {coverage.gaps.length > 6 && ` (+${coverage.gaps.length - 6} more)`}
                  {' — add them to the Primer Library tab.'}
                </span>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
};

export default AdaptivePrimerSlot;
