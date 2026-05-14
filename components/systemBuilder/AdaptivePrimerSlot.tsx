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
  // Persists changes to the parent layer (default primer pin).
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
        if (onResolved) onResolved(res || []);
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

  const paramsSet = !!systemSubstrate && !!systemHumidity;

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
            Set system substrate and humidity parameters above to preview which primers will resolve.
          </div>
        ) : resolved.length === 0 ? (
          <div className="text-xs text-amber-700 px-2 py-2 bg-amber-50 border border-amber-200 rounded flex items-center gap-1.5">
            <AlertTriangle size={12} /> No primers in library match these conditions — add primers to the Primer Library tab.
          </div>
        ) : (
          <div className="space-y-1.5">
            {resolved.map(p => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded border transition-colors ${defaultPrimerLibraryId === p.primerId ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}
              >
                {defaultPrimerLibraryId === p.primerId && (
                  <Star size={12} className="text-amber-500 flex-shrink-0" fill="currentColor" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-700 truncate">{p.productName || p.productId}</div>
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

      {/* Default primer pin */}
      {resolved.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] font-semibold text-slate-600 uppercase mb-1.5">Default primer</div>
          <select
            value={defaultPrimerLibraryId || ''}
            onChange={(e) => onSetDefault(e.target.value || null)}
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
            data-testid="adaptive-default-primer-select"
          >
            <option value="">No default — all matching primers are alternatives</option>
            {resolved.map(p => (
              <option key={p.primerId} value={p.primerId}>
                {p.productName || p.productId} ({p.primerId})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Coverage summary */}
      {allActive.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-slate-600 uppercase mb-1.5">Coverage</div>
          {coverage.covered.length > 0 && (
            <div className="text-[11px] text-slate-600 flex items-start gap-1.5 mb-1">
              <Check size={11} className="text-emerald-600 mt-0.5 flex-shrink-0" />
              <span>
                <span className="font-medium">Covered:</span>{' '}
                {coverage.covered.slice(0, 6).map(c => `${c.substrate}/${c.humidity}`).join(' · ')}
                {coverage.covered.length > 6 && ` (+${coverage.covered.length - 6} more)`}
              </span>
            </div>
          )}
          {coverage.gaps.length > 0 && (
            <div className="text-[11px] text-amber-700 flex items-start gap-1.5">
              <AlertTriangle size={11} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <span>
                <span className="font-medium">No primer found for:</span>{' '}
                {coverage.gaps.slice(0, 6).map(c => `${c.substrate}/${c.humidity}`).join(' · ')}
                {coverage.gaps.length > 6 && ` (+${coverage.gaps.length - 6} more)`}
                {' — add to Primer Library'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdaptivePrimerSlot;
