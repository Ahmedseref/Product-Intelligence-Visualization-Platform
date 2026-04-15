export interface ParsedSearch {
  includeTerms: string[];
  excludeTerms: string[];
  normalTerms: string[];
}

export function parseSearchQuery(query: string): ParsedSearch {
  const includeTerms: string[] = [];
  const excludeTerms: string[] = [];
  const normalTerms: string[] = [];

  const tokens = query.match(/[+-]?\S+/g) || [];

  for (const token of tokens) {
    if (token.startsWith('+') && token.length > 1) {
      includeTerms.push(token.slice(1).toLowerCase());
    } else if (token.startsWith('-') && token.length > 1) {
      excludeTerms.push(token.slice(1).toLowerCase());
    } else {
      normalTerms.push(token.toLowerCase());
    }
  }

  return { includeTerms, excludeTerms, normalTerms };
}

export function matchesAdvancedSearch(searchableText: string, parsed: ParsedSearch): boolean {
  const text = searchableText.toLowerCase();

  for (const term of parsed.excludeTerms) {
    if (text.includes(term)) return false;
  }

  for (const term of parsed.includeTerms) {
    if (!text.includes(term)) return false;
  }

  if (parsed.normalTerms.length > 0) {
    const matchesAnyNormal = parsed.normalTerms.some(term => text.includes(term));
    if (!matchesAnyNormal) return false;
  }

  return true;
}
