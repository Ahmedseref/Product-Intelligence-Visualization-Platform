// ─────────────────────────────────────────────────────────────────────────────
// AdaptivePrimerSlot
// Replaces the manual product assignment area inside a primer-position
// system layer when layerMode === 'adaptive'. Shows a live preview of which
// primers from the Primer Library will resolve for the current system
// parameters (substrate / humidity / system type), lets the user pin one as
// the recommended default, and surfaces gaps for substrate+humidity combos
// the library does not yet cover.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Library, Star, AlertTriangle, Check, Loader2, Layers } from 'lucide-react';
import { PrimerLibraryEntry, PrimerGroup } from '../../types';
import { primerLibraryApi, primerGroupsApi } from '../../client/api';

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

  // Primer groups — named bundles of library primers. Created and managed
  // entirely in the Primer Library tab; here we only consume them as a
  // one-click pin. Reload whenever the parent bumps refreshKey so a group
  // edited in another tab shows up immediately.
  const [groups, setGroups] = useState<PrimerGroup[]>([]);
  const refreshGroups = useCallback(async () => {
    try {
      const rows = await primerGroupsApi.list();
      setGroups(Array.isArray(rows) ? rows : []);
    } catch {
      // Non-fatal — the group selector simply hides if unreachable.
    }
  }, []);
  useEffect(() => { refreshGroups(); }, [refreshGroups, refreshKey]);

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

  // Humidity is optional in the system header ("— Any —" = null). When the
  // user leaves it blank we still want to preview every primer for the
  // chosen substrate rather than blocking with the "set parameters" prompt.
  // Substrate is the only hard gate.
  const paramsSet = !!systemSubstrate;

  // Apply a group to this layer. We constrain the pinned primer to one
  // that's actually in the currently resolved list for the system's
  // parameters, so the user never ends up with a default they can't see
  // in the dropdown below. Order of preference:
  //   1) the group's chosen default, if it resolves
  //   2) the first group member that resolves
  //   3) null with a visible note ("no group member resolves for this system")
  const [groupApplyNote, setGroupApplyNote] = useState<string | null>(null);
  const handleApplyGroup = async (groupId: string) => {
    setGroupApplyNote(null);
    if (!groupId) return;
    const g = groups.find(x => x.groupId === groupId);
    if (!g) return;
    const resolvedIds = new Set(resolved.map(r => r.primerId));
    const members = g.primerLibraryIds || [];
    let pin: string | null = null;
    if (g.defaultPrimerLibraryId && resolvedIds.has(g.defaultPrimerLibraryId)) {
      pin = g.defaultPrimerLibraryId;
    } else {
      pin = members.find(m => resolvedIds.has(m)) || null;
    }
    if (pin) {
      await onSetDefault(pin);
      if (g.defaultPrimerLibraryId && pin !== g.defaultPrimerLibraryId) {
        setGroupApplyNote(`Group default isn't compatible with this system's conditions — pinned the next matching member instead.`);
      }
    } else {
      setGroupApplyNote(`No primers in "${g.name}" match this system's substrate / humidity / duty.`);
    }
  };

  // The currently pinned default's group, if any — purely for showing
  // "(from group: …)" in the dropdown so the user knows where it came from.
  const sourceGroup = useMemo(() => {
    if (!defaultPrimerLibraryId) return null;
    return groups.find(g =>
      g.defaultPrimerLibraryId === defaultPrimerLibraryId
      || (g.primerLibraryIds || []).includes(defaultPrimerLibraryId)
    ) || null;
  }, [groups, defaultPrimerLibraryId]);

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

      {/* Default primer pin + optional one-click group selector. Groups are
          built and maintained in the Primer Library tab; here they're a
          single dropdown that snaps the default to a group's preferred
          primer. Hidden when no groups exist so the slot stays minimal. */}
      {resolved.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Layers size={11} className="text-indigo-500" />
            <div className="text-[11px] font-semibold text-slate-600 uppercase">Default group</div>
          </div>
          {/* Adaptive mode is intentionally group-first: individual primers
              are picked by the group's resolution at spec time, so the
              user only ever chooses a GROUP here. The currently-pinned
              primer's group (if any) is selected, and switching groups
              dispatches handleApplyGroup which re-pins to the new
              group's default within the resolved set. */}
          <select
            value={sourceGroup?.groupId || ''}
            onChange={(e) => {
              const next = e.target.value;
              if (!next) onSetDefault(null);
              else handleApplyGroup(next);
            }}
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
            data-testid="adaptive-default-group-select"
          >
            <option value="">No default — all matching primers are alternatives</option>
            {groups.length === 0 && (
              <option value="" disabled>No groups yet — create one in Primer Library</option>
            )}
            {groups.map(g => (
              <option key={g.groupId} value={g.groupId}>
                {g.name} ({(g.primerLibraryIds || []).length})
              </option>
            ))}
          </select>
          {sourceGroup && defaultPrimerLibraryId && (
            <div className="text-[10px] text-slate-400 mt-1">
              For this system's parameters, this group resolves to{' '}
              <span className="font-medium text-indigo-600">
                {resolved.find(p => p.primerId === defaultPrimerLibraryId)?.productName || defaultPrimerLibraryId}
              </span>
              {' '}— if that's not what you want, edit the group's members in the Primer Library tab.
            </div>
          )}
          {groupApplyNote && (
            <div className="text-[10px] text-amber-700 mt-1" data-testid="adaptive-primer-group-note">
              {groupApplyNote}
            </div>
          )}
        </div>
      )}

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
