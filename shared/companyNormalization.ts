/**
 * Normalizes a company name for duplicate-detection and shared-code lookup.
 * Rules: Unicode NFC → trim → collapse internal whitespace → lowercase.
 *
 * This function is intentionally pure (no DB dependency) so it can be
 * imported by both server-side code and browser components.
 */
export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
