// =============================================================================
// Industry Analysis — unit tests
// =============================================================================
// Run with: npm test  (uses node:test + tsx — no extra dev deps required)
//
// All tests call REAL production exports:
//   - components/industryLogic.ts  (filterByIndustryTag, computeTypeCounts,
//                                    computeCountryCounts, computeScalars)
//   - components/industryUtils.ts  (getIndustryTags)
//   - routingUtils.ts              (parseHashState, HASH_TO_VIEW)
//
// Coverage:
//  1. getIndustryTags — comma splitting, trimming, deduplication
//  2. filterByIndustryTag — case-insensitive exact tag matching; no partial hits
//  3. computeTypeCounts — Supplier, Customer, Relationship, blank → Unclassified
//  4. computeCountryCounts — sorted desc, capped at 8, blank → "Unknown country"
//  5. computeScalars — activeCount, withEmailCount, withWebsiteCount, uniqueCountries
//  6. Update-then-recompute regression — edited tags/fields are reflected on next call
//  7. parseHashState — extracts view + industry; does NOT call api.notionPull
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Real production imports ──────────────────────────────────────────────────
import { getIndustryTags } from './industryUtils.js';
import {
  filterByIndustryTag,
  computeTypeCounts,
  computeCountryCounts,
  computeScalars,
} from './industryLogic.js';
import { parseHashState, HASH_TO_VIEW } from '../routingUtils.js';

// ---------------------------------------------------------------------------
// Supplier fixture — minimal shape matching types.ts Supplier
// ---------------------------------------------------------------------------
function makeSupplier(
  overrides: Partial<{
    id: string;
    name: string;
    industryMainActivities: string;
    contactType: string;
    country: string;
    isActive: boolean;
    contactEmail: string;
    website: string;
    createdAt: string;
    updatedAt: string;
  }>,
) {
  return {
    id: 's0',
    name: 'Unnamed',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

const SAMPLE = [
  // exact "Tech" — active, has email + website
  makeSupplier({ id: 's1', name: 'Alpha Corp', industryMainActivities: 'Tech, Finance', contactType: 'Supplier',      country: 'Germany', isActive: true,  contactEmail: 'a@alpha.com', website: 'https://alpha.com' }),
  // uppercase variant — active, has email, no website
  makeSupplier({ id: 's2', name: 'Beta Ltd',   industryMainActivities: 'TECH',           contactType: 'Customer',      country: 'France',  isActive: true,  contactEmail: 'b@beta.com',  website: undefined }),
  // mixed case + spaces — inactive, no email, no website
  makeSupplier({ id: 's3', name: 'Gamma Inc',  industryMainActivities: '  tEcH  ,Logistics', contactType: 'Relationship', country: 'Germany', isActive: false, contactEmail: undefined,     website: undefined }),
  // "BioTech" must NOT match "Tech"
  makeSupplier({ id: 's4', name: 'Delta Bio',  industryMainActivities: 'BioTech',        contactType: 'Supplier',      country: 'Spain',   isActive: true,  contactEmail: 'd@delta.com', website: 'https://delta.com' }),
  // "Tech Solutions" (multi-word) must NOT match "Tech"
  makeSupplier({ id: 's5', name: 'Epsilon',    industryMainActivities: 'Tech Solutions', contactType: 'Customer',      country: 'Spain',   isActive: false, contactEmail: undefined,     website: undefined }),
  // blank contactType → Unclassified — active, has email + website
  makeSupplier({ id: 's6', name: 'Zeta SA',    industryMainActivities: 'Tech',           contactType: '',              country: 'Italy',   isActive: true,  contactEmail: 'z@zeta.com',  website: 'https://zeta.com' }),
  // no country — inactive, no email
  makeSupplier({ id: 's7', name: 'Eta GmbH',   industryMainActivities: 'Tech',           contactType: 'Supplier',      country: undefined, isActive: false, contactEmail: undefined,     website: undefined }),
  // Finance only — not a Tech contact
  makeSupplier({ id: 's8', name: 'Theta Fin',  industryMainActivities: 'Finance',        contactType: 'Supplier',      country: 'France',  isActive: true,  contactEmail: 'f@theta.com', website: undefined }),
];

// =============================================================================
// 1) getIndustryTags (industryUtils.ts)
// =============================================================================

test('getIndustryTags: returns [] for undefined', () => {
  assert.deepEqual(getIndustryTags(undefined), []);
});

test('getIndustryTags: returns [] for empty string', () => {
  assert.deepEqual(getIndustryTags(''), []);
});

test('getIndustryTags: single tag with no comma', () => {
  assert.deepEqual(getIndustryTags('Technology'), ['Technology']);
});

test('getIndustryTags: splits on comma and trims whitespace', () => {
  assert.deepEqual(getIndustryTags('  Tech , Finance , Logistics  '), ['Tech', 'Finance', 'Logistics']);
});

test('getIndustryTags: deduplicates repeated tags', () => {
  assert.deepEqual(getIndustryTags('Tech,Tech,Finance'), ['Tech', 'Finance']);
});

test('getIndustryTags: skips empty entries from double commas', () => {
  const tags = getIndustryTags('Tech,,Finance');
  assert.ok(!tags.includes(''), 'empty string must not be a tag');
  assert.deepEqual(tags, ['Tech', 'Finance']);
});

// =============================================================================
// 2) filterByIndustryTag (industryLogic.ts) — exact, case-insensitive
// =============================================================================

test('filterByIndustryTag: matches exact tag case-insensitively (s1, s2, s3, s6, s7)', () => {
  const matches = filterByIndustryTag(SAMPLE, 'tech');
  assert.deepEqual(
    matches.map((s) => s.id).sort(),
    ['s1', 's2', 's3', 's6', 's7'],
    `Expected [s1,s2,s3,s6,s7] but got [${matches.map(s => s.id).join(',')}]`,
  );
});

test('filterByIndustryTag: does NOT match "BioTech" (s4) when searching for "tech"', () => {
  const matches = filterByIndustryTag(SAMPLE, 'tech');
  assert.ok(!matches.some((s) => s.id === 's4'), 'BioTech must not match exact "tech" search');
});

test('filterByIndustryTag: does NOT match "Tech Solutions" (s5) when searching for "tech"', () => {
  const matches = filterByIndustryTag(SAMPLE, 'tech');
  assert.ok(!matches.some((s) => s.id === 's5'), '"Tech Solutions" must not match exact "tech" search');
});

test('filterByIndustryTag: search for "BioTech" matches only s4', () => {
  const matches = filterByIndustryTag(SAMPLE, 'BioTech');
  assert.deepEqual(matches.map((s) => s.id), ['s4']);
});

test('filterByIndustryTag: empty industryTag returns no contacts', () => {
  assert.equal(filterByIndustryTag(SAMPLE, '').length, 0);
});

test('filterByIndustryTag: industryTag with surrounding spaces is normalized correctly', () => {
  const matches = filterByIndustryTag(SAMPLE, '  tech  ');
  assert.deepEqual(matches.map((s) => s.id).sort(), ['s1', 's2', 's3', 's6', 's7']);
});

test('filterByIndustryTag: tag that exists on no contact returns []', () => {
  assert.equal(filterByIndustryTag(SAMPLE, 'Aerospace').length, 0);
});

test('filterByIndustryTag: Finance tag matches only s1 and s8', () => {
  const matches = filterByIndustryTag(SAMPLE, 'Finance');
  assert.deepEqual(matches.map((s) => s.id).sort(), ['s1', 's8']);
});

// =============================================================================
// 3) computeTypeCounts (industryLogic.ts)
// =============================================================================

const TECH_MATCHES = filterByIndustryTag(SAMPLE, 'tech');  // [s1,s2,s3,s6,s7]

test('computeTypeCounts: Supplier count in Tech set is 2 (s1, s7)', () => {
  const counts = new Map(computeTypeCounts(TECH_MATCHES));
  assert.equal(counts.get('Supplier'), 2);
});

test('computeTypeCounts: Customer count in Tech set is 1 (s2)', () => {
  const counts = new Map(computeTypeCounts(TECH_MATCHES));
  assert.equal(counts.get('Customer'), 1);
});

test('computeTypeCounts: Relationship count in Tech set is 1 (s3)', () => {
  const counts = new Map(computeTypeCounts(TECH_MATCHES));
  assert.equal(counts.get('Relationship'), 1);
});

test('computeTypeCounts: blank contactType appears as "Unclassified" (s6)', () => {
  const counts = new Map(computeTypeCounts(TECH_MATCHES));
  assert.equal(counts.get('Unclassified'), 1, 'blank contactType must produce Unclassified');
  assert.ok(!counts.has(''), '"" key must not appear');
});

test('computeTypeCounts: sum of all type counts equals matchingSuppliers.length', () => {
  const counts = computeTypeCounts(TECH_MATCHES);
  const total = counts.reduce((acc, [, n]) => acc + n, 0);
  assert.equal(total, TECH_MATCHES.length);
});

test('computeTypeCounts: result is sorted descending by count', () => {
  const counts = computeTypeCounts(TECH_MATCHES);
  for (let i = 1; i < counts.length; i++) {
    assert.ok(counts[i - 1][1] >= counts[i][1], `entries not sorted at index ${i}`);
  }
});

// =============================================================================
// 4) computeCountryCounts (industryLogic.ts)
// =============================================================================

test('computeCountryCounts: blank/undefined country is bucketed as "Unknown country" (s7)', () => {
  const rows = computeCountryCounts(TECH_MATCHES);
  const unknown = rows.find(([c]) => c === 'Unknown country');
  assert.ok(unknown, '"Unknown country" bucket must exist');
  assert.equal(unknown![1], 1, 'exactly 1 contact has no country in Tech set');
});

test('computeCountryCounts: Germany appears with count 2 (s1, s3)', () => {
  const rows = computeCountryCounts(TECH_MATCHES);
  const germany = rows.find(([c]) => c === 'Germany');
  assert.ok(germany, 'Germany must appear');
  assert.equal(germany![1], 2);
});

test('computeCountryCounts: sorted descending by count', () => {
  const rows = computeCountryCounts(TECH_MATCHES);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1][1] >= rows[i][1], `not sorted at index ${i}`);
  }
});

test('computeCountryCounts: result is capped at 8 entries', () => {
  const many = Array.from({ length: 10 }, (_, i) =>
    makeSupplier({ id: `x${i}`, industryMainActivities: 'WidgetMfg', country: `Country${i}` }),
  );
  const rows = computeCountryCounts(many);
  assert.ok(rows.length <= 8, `expected ≤8 entries, got ${rows.length}`);
});

// =============================================================================
// 5) computeScalars (industryLogic.ts)
// =============================================================================

test('computeScalars: activeCount in Tech set is 3 (s1, s2, s6)', () => {
  const { activeCount } = computeScalars(TECH_MATCHES);
  assert.equal(activeCount, 3);
});

test('computeScalars: withEmailCount in Tech set is 3 (s1, s2, s6)', () => {
  const { withEmailCount } = computeScalars(TECH_MATCHES);
  assert.equal(withEmailCount, 3);
});

test('computeScalars: withWebsiteCount in Tech set is 2 (s1, s6)', () => {
  const { withWebsiteCount } = computeScalars(TECH_MATCHES);
  assert.equal(withWebsiteCount, 2);
});

test('computeScalars: uniqueCountries in Tech set is 3 (Germany, France, Italy)', () => {
  const { uniqueCountries } = computeScalars(TECH_MATCHES);
  // s7 has undefined country → excluded from unique set
  assert.equal(uniqueCountries, 3);
});

// =============================================================================
// 6) Update-then-recompute regression
//    Simulates what happens in App.tsx when a contact's tags/fields are edited
//    and the updated suppliers array is passed back to the analysis functions.
// =============================================================================

test('regression: adding a new industry tag to a supplier is reflected on next compute', () => {
  const before = filterByIndustryTag(SAMPLE, 'aerospace');
  assert.equal(before.length, 0, 'no aerospace contacts initially');

  // Simulate the App's handleUpdateSupplier: create updated array
  const updated = SAMPLE.map((s) =>
    s.id === 's4'
      ? { ...s, industryMainActivities: 'BioTech, Aerospace' }
      : s,
  );

  const after = filterByIndustryTag(updated, 'aerospace');
  assert.equal(after.length, 1, 'aerospace must appear after tag is added');
  assert.equal(after[0].id, 's4');
});

test('regression: removing a tag from a supplier removes them from the analysis', () => {
  const before = filterByIndustryTag(SAMPLE, 'tech');
  const beforeIds = before.map((s) => s.id).sort();
  assert.ok(beforeIds.includes('s1'), 's1 must be in Tech set initially');

  // Remove "Tech" from s1 — simulates a user editing the contact's tags
  const updated = SAMPLE.map((s) =>
    s.id === 's1' ? { ...s, industryMainActivities: 'Finance' } : s,
  );

  const after = filterByIndustryTag(updated, 'tech');
  assert.ok(!after.some((s) => s.id === 's1'), 's1 must leave Tech set after tag removal');
  assert.equal(after.length, before.length - 1);
});

test('regression: changing contactType of a contact updates type counts immediately', () => {
  const matchesBefore = filterByIndustryTag(SAMPLE, 'tech');
  const countsBefore = new Map(computeTypeCounts(matchesBefore));
  const suppliersBefore = countsBefore.get('Supplier') ?? 0;

  // Promote s3 from Relationship to Supplier
  const updated = SAMPLE.map((s) =>
    s.id === 's3' ? { ...s, contactType: 'Supplier' } : s,
  );
  const matchesAfter = filterByIndustryTag(updated, 'tech');
  const countsAfter = new Map(computeTypeCounts(matchesAfter));

  assert.equal(countsAfter.get('Supplier'), suppliersBefore + 1, 'Supplier count must increase by 1');
  assert.ok(!countsAfter.has('Relationship'), 'Relationship bucket must disappear when s3 is re-typed');
});

test('regression: setting a contact inactive decrements activeCount immediately', () => {
  const before = computeScalars(filterByIndustryTag(SAMPLE, 'tech'));

  // Deactivate s2
  const updated = SAMPLE.map((s) =>
    s.id === 's2' ? { ...s, isActive: false } : s,
  );
  const after = computeScalars(filterByIndustryTag(updated, 'tech'));

  assert.equal(after.activeCount, before.activeCount - 1);
});

test('regression: adding an email to a contact increments withEmailCount', () => {
  const before = computeScalars(filterByIndustryTag(SAMPLE, 'tech'));

  // s3 has no email — give it one
  const updated = SAMPLE.map((s) =>
    s.id === 's3' ? { ...s, contactEmail: 'g@gamma.com' } : s,
  );
  const after = computeScalars(filterByIndustryTag(updated, 'tech'));

  assert.equal(after.withEmailCount, before.withEmailCount + 1);
});

// =============================================================================
// 7) parseHashState (routingUtils.ts) — no Notion pull on navigation
// =============================================================================

test('HASH_TO_VIEW: #industry-analysis maps to "industry-analysis"', () => {
  assert.equal(HASH_TO_VIEW['#industry-analysis'], 'industry-analysis');
});

test('parseHashState: correctly parses #industry-analysis with a tag', () => {
  const state = parseHashState('#industry-analysis?industry=Tech');
  assert.equal(state.view, 'industry-analysis');
  assert.equal(state.industry, 'Tech');
});

test('parseHashState: URL-encoded tag is decoded correctly', () => {
  const state = parseHashState('#industry-analysis?industry=Raw+Material+Supplier');
  assert.equal(state.view, 'industry-analysis');
  assert.equal(state.industry, 'Raw Material Supplier');
});

test('parseHashState: no industry param → industry is undefined', () => {
  const state = parseHashState('#industry-analysis');
  assert.equal(state.view, 'industry-analysis');
  assert.equal(state.industry, undefined);
});

test('parseHashState: unknown hash defaults to technical-intelligence', () => {
  const state = parseHashState('#unknown-route');
  assert.equal(state.view, 'technical-intelligence');
  assert.equal(state.industry, undefined);
});

test('parseHashState: does NOT call api.notionPull (pure function — no network calls)', () => {
  // parseHashState is a pure function imported from routingUtils.ts.
  // We verify it never invokes notionPull by replacing the global fetch with a
  // spy; any outbound HTTP call during parsing would be caught here.
  const originalFetch = global.fetch;
  let fetchCalled = false;
  // @ts-ignore — spy injection
  global.fetch = (..._args: unknown[]) => { fetchCalled = true; return Promise.resolve(new Response()); };

  try {
    const state = parseHashState('#industry-analysis?industry=Tech');
    assert.equal(fetchCalled, false, 'parseHashState must not make any network calls (notionPull calls fetch)');
    assert.equal(state.view, 'industry-analysis');
  } finally {
    global.fetch = originalFetch;
  }
});

test('parseHashState: suppliers hash with industry param returns both fields', () => {
  // Suppliers view also reads the industry param (used when navigating back)
  const state = parseHashState('#suppliers?industry=Finance');
  assert.equal(state.view, 'suppliers');
  assert.equal(state.industry, 'Finance');
});

test('parseHashState: non-analysis view does not populate industry field', () => {
  const inventoryState = parseHashState('#inventory?industry=Tech');
  assert.equal(inventoryState.view, 'inventory');
  assert.equal(inventoryState.industry, undefined, 'inventory view must not expose the industry param');
});
