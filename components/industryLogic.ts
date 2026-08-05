/**
 * Pure functions that power the IndustryAnalysis view.
 * Extracted here so they can be imported by both the component and tests
 * without requiring a React / DOM environment.
 */
import type { Supplier } from '../types';
import { getIndustryTags } from './industryUtils';

/** Lower-cases and strips surrounding whitespace. */
export const normalizeTag = (value?: string): string => value?.trim().toLowerCase() ?? '';

/**
 * Returns every supplier whose industryMainActivities comma-list contains
 * an exact (case-insensitive) match for `industryTag`.
 * Partial tag names (e.g. "BioTech") do NOT match a search for "Tech".
 */
export function filterByIndustryTag(suppliers: Supplier[], industryTag: string): Supplier[] {
  const selected = normalizeTag(industryTag);
  if (!selected) return [];
  return suppliers.filter((s) =>
    getIndustryTags(s.industryMainActivities).some((tag) => normalizeTag(tag) === selected),
  );
}

/**
 * Returns `[contactType, count]` pairs sorted descending.
 * Blank / absent contactType is bucketed as "Unclassified".
 */
export function computeTypeCounts(suppliers: Supplier[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const s of suppliers) {
    const type = s.contactType?.trim() || 'Unclassified';
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Returns `[country, count]` pairs, sorted descending, capped at 8 entries.
 * Blank / absent country is bucketed as "Unknown country".
 */
export function computeCountryCounts(suppliers: Supplier[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const s of suppliers) {
    const country = s.country?.trim() || 'Unknown country';
    counts.set(country, (counts.get(country) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
}

/** Scalar summary metrics shown in the four stat cards. */
export function computeScalars(suppliers: Supplier[]) {
  return {
    activeCount: suppliers.filter((s) => s.isActive).length,
    withEmailCount: suppliers.filter((s) => Boolean(s.contactEmail)).length,
    withWebsiteCount: suppliers.filter((s) => Boolean(s.website)).length,
    uniqueCountries: new Set(suppliers.map((s) => s.country).filter(Boolean)).size,
  };
}
