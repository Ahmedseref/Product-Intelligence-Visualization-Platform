// ─────────────────────────────────────────────────────────────────────────────
// Compatibility Engine
// Single source of truth for "is this product/primer compatible with this
// system context, and how well does it match?" used by:
//   1. SystemBuilder.tsx → layer product picker (qualified/unqualified split)
//   2. SystemBuilder.tsx → Quick Setup wizard, Step 2 (primer pick)
//   3. SystemBuilder.tsx → Quick Setup wizard, Step 3 (per-layer pickers)
//   4. server/primerLibraryRoutes.ts → /api/primer-library/resolve
//
// All rules are purely (tags + ctx) → result; no DOM, no React, no DB access.
// That keeps it trivially testable and reusable from both client and server.
// ─────────────────────────────────────────────────────────────────────────────

export type LayerPosition = 'primer' | 'base_coat' | 'intermediate' | 'topcoat' | 'standalone';
export type SystemFamily = 'Epoxy' | 'PU' | 'Polyurea' | 'Acrylic' | 'BitumenCement';

export interface ProductTags {
  substrateTypes?: string[] | null;
  humidityTolerance?: string | null;
  dutyRating?: string | null;
  isSystemReady?: boolean | null;
  layerPosition?: string | null;
}

export interface CompatibilityContext {
  systemType?: string | null;          // 'Epoxy' / 'PU' / 'Polyurea' / 'Acrylic' / null
  systemSubstrates?: string[];         // [] = "any substrate"
  systemHumidity?: string | null;
  systemDuty?: string | null;
  activeLayerPosition?: LayerPosition | null;
  productFamily?: SystemFamily | null; // taxonomy-derived; only available on the client
}

// Humidity vocab in increasing-moisture order. Products outside ±1 step of
// the system's humidity setting are hard-excluded. The order list is the
// union of the canonical vocab and the legacy short labels so a row tagged
// with either spelling resolves to the same index.
export const HUMIDITY_ORDER: string[] = [
  'Dry (0-4%)',
  'Slightly Damp (4-6%)',
  'Damp (6-8%)',
  'Wet (>8%)',
  'Moisture-Tolerant',
  'Damp-Surface',
  'Underwater',
];

// Duty rating, ascending. A product whose dutyRating index is BELOW the
// system's index is hard-excluded (a Light product can't serve a Heavy
// system). Overspec is always allowed.
export const DUTY_ORDER: string[] = ['Light', 'Medium', 'Heavy', 'Industrial'];

export type ExclusionReason =
  | 'bitumenInTypedSystem'
  | 'family'
  | 'substrate'
  | 'position'
  | 'humidity'
  | 'duty';

export interface ExclusionResult {
  excluded: boolean;
  reason?: ExclusionReason;
}

/**
 * Returns whether `tag` is hard-excluded by `ctx`. Untagged products
 * (tag === undefined) are never hard-excluded by this function — callers
 * route them to the "unqualified" bucket instead.
 */
export function isHardExcluded(
  tag: ProductTags | undefined,
  ctx: CompatibilityContext,
): ExclusionResult {
  const {
    systemType,
    systemSubstrates = [],
    systemHumidity,
    systemDuty,
    activeLayerPosition,
    productFamily,
  } = ctx;

  // 1. Bitumen / cement products never belong in a typed (Epoxy/PU/…) system.
  if (productFamily === 'BitumenCement' && systemType) {
    return { excluded: true, reason: 'bitumenInTypedSystem' };
  }

  // 2. Family mismatch — only hard-excluded when both a tag AND a
  //    taxonomy family exist and they disagree with the system type.
  if (systemType && tag && productFamily && productFamily !== (systemType as SystemFamily)) {
    return { excluded: true, reason: 'family' };
  }

  // 3. Substrate ANY-overlap (with layered carve-out).
  //    Layered coats (base/intermediate/topcoat) tagged exclusively with
  //    'Over Primer' / 'Over Base Coat' should NOT be filtered against
  //    the system's structural substrate — they sit on top of the primer
  //    the user picked, not on Concrete itself.
  if (systemSubstrates.length > 0 && tag?.substrateTypes && tag.substrateTypes.length > 0) {
    const subs = tag.substrateTypes;
    const layeredOnly = subs.every(s => s === 'Over Primer' || s === 'Over Base Coat');
    const layeredSlot =
      activeLayerPosition === 'base_coat' ||
      activeLayerPosition === 'intermediate' ||
      activeLayerPosition === 'topcoat';
    const layeredPos =
      tag.layerPosition === 'base_coat' ||
      tag.layerPosition === 'intermediate' ||
      tag.layerPosition === 'topcoat';
    const isLayered = layeredOnly && (layeredPos || layeredSlot);
    if (!isLayered) {
      const overlap = subs.filter(s => systemSubstrates.includes(s)).length;
      if (overlap === 0) return { excluded: true, reason: 'substrate' };
    }
  }

  // 4. Layer position. Primer slot is the strictest — anything tagged with
  //    a non-primer layer_position (including 'standalone') is excluded.
  //    For other slots, the opposite ends of the stack are excluded
  //    (no primers in a topcoat slot, no topcoats in a base-coat slot).
  if (activeLayerPosition && tag?.layerPosition) {
    const pp = tag.layerPosition;
    if (activeLayerPosition === 'primer') {
      if (pp !== 'primer') return { excluded: true, reason: 'position' };
    } else if (activeLayerPosition === 'base_coat') {
      if (pp === 'primer' || pp === 'topcoat') return { excluded: true, reason: 'position' };
    } else if (activeLayerPosition === 'intermediate') {
      if (pp === 'primer' || pp === 'topcoat') return { excluded: true, reason: 'position' };
    } else if (activeLayerPosition === 'topcoat') {
      if (pp === 'primer' || pp === 'base_coat') return { excluded: true, reason: 'position' };
    }
  }

  // 5. Humidity — asymmetric ±1-step tolerance. Avoids brittle boundary
  //    mismatches between e.g. "Damp (6-8%)" and "Wet (>8%)" while still
  //    rejecting clearly-incompatible pairs like "Dry only" in "Underwater".
  if (tag?.humidityTolerance && systemHumidity) {
    const pi = HUMIDITY_ORDER.indexOf(tag.humidityTolerance);
    const si = HUMIDITY_ORDER.indexOf(systemHumidity);
    if (pi !== -1 && si !== -1 && Math.abs(pi - si) > 1) {
      return { excluded: true, reason: 'humidity' };
    }
  }

  // 6. Duty — underspec only. A Light product cannot serve a Heavy system.
  //    Overspec (Heavy product in a Medium system) is fine.
  if (tag?.dutyRating && systemDuty) {
    const pi = DUTY_ORDER.indexOf(tag.dutyRating);
    const si = DUTY_ORDER.indexOf(systemDuty);
    if (pi !== -1 && si !== -1 && pi < si) {
      return { excluded: true, reason: 'duty' };
    }
  }

  return { excluded: false };
}

/**
 * Score (0..N) for ranking qualified products. Higher = better match.
 * Untagged products score 0.
 */
export function scoreProduct(
  tag: ProductTags | undefined,
  ctx: CompatibilityContext,
): number {
  const {
    systemType,
    systemSubstrates = [],
    systemHumidity,
    systemDuty,
    activeLayerPosition,
    productFamily,
  } = ctx;
  let score = 0;
  if (tag?.layerPosition && activeLayerPosition && tag.layerPosition === activeLayerPosition) score += 4;
  else if (tag?.layerPosition === 'standalone') score += 2;
  if (systemType && productFamily) {
    const k: SystemFamily | null =
      systemType === 'Epoxy' ? 'Epoxy'
      : systemType === 'PU' ? 'PU'
      : systemType === 'Polyurea' ? 'Polyurea'
      : systemType === 'Acrylic' ? 'Acrylic'
      : null;
    if (k && productFamily === k) score += 3;
  }
  if (systemSubstrates.length > 0 && tag?.substrateTypes && tag.substrateTypes.length > 0) {
    const overlap = tag.substrateTypes.filter(s => systemSubstrates.includes(s)).length;
    score += overlap * 2;
  }
  if (systemHumidity && tag?.humidityTolerance === systemHumidity) score += 2;
  if (tag?.isSystemReady === true) score += 3;
  if (systemDuty && tag?.dutyRating === systemDuty) score += 1;
  return score;
}

export interface MatchLabel { label: string; dotClass: string; }
export function computeMatchLabel(score: number, isSystemReady: boolean): MatchLabel | null {
  if (score >= 10) return { label: 'Best match', dotClass: 'bg-emerald-500' };
  if (score >= 6) return { label: 'Good match', dotClass: 'bg-blue-500' };
  if (score >= 3) return { label: 'Partial match', dotClass: 'bg-amber-500' };
  if (isSystemReady) return { label: 'Qualified', dotClass: 'bg-slate-400' };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — translate the various row shapes into ProductTags so the engine
// above can stay shape-agnostic.
// ─────────────────────────────────────────────────────────────────────────────

export interface PrimerLibraryRow {
  compatibleSubstrates?: string[] | null;
  compatibleSystemTypes?: string[] | null;
  humidityTolerance?: string | null;
  dutyRating?: string | null;
  layerPosition?: string | null;
}

/** Primer Library rows are always primers; map plural fields → ProductTags. */
export function primerLibraryRowToTags(r: PrimerLibraryRow): ProductTags {
  return {
    substrateTypes: r.compatibleSubstrates ?? null,
    humidityTolerance: r.humidityTolerance ?? null,
    dutyRating: r.dutyRating ?? null,
    isSystemReady: true,
    layerPosition: r.layerPosition ?? 'primer',
  };
}
