/**
 * Pure routing helpers shared between App.tsx and tests.
 * No side-effects; no imports from React or the browser.
 */
import type { ViewMode } from './types';

export const HASH_TO_VIEW: Record<string, ViewMode> = {
  '#intelligence': 'technical-intelligence',
  '#inventory': 'inventory',
  '#add-product': 'add-product',
  '#taxonomy': 'taxonomy-manager',
  '#suppliers': 'suppliers',
  '#industry-analysis': 'industry-analysis',
  '#system-builder': 'system-builder',
  '#document-memory': 'document-memory',
  '#settings': 'settings',
  '#proforma': 'proforma',
};

export const VIEW_TO_HASH: Record<ViewMode, string> = Object.fromEntries(
  Object.entries(HASH_TO_VIEW).map(([h, v]) => [v, h]),
) as Record<ViewMode, string>;

/**
 * Parses a URL hash string (e.g. "#industry-analysis?industry=Tech") into a
 * view name and an optional industry tag. This is a *pure* function — it
 * reads no global state and makes no network calls.
 */
export function parseHashState(hash: string): { view: ViewMode; industry?: string } {
  const [hashPath, query] = hash.split('?');
  const view: ViewMode = HASH_TO_VIEW[hashPath] ?? 'technical-intelligence';
  const industry =
    view === 'suppliers' || view === 'industry-analysis'
      ? new URLSearchParams(query ?? '').get('industry') ?? undefined
      : undefined;
  return { view, industry };
}
