// =============================================================================
// Auto-Qualification Engine — unit tests
// =============================================================================
// Run with: npm test  (uses node:test + tsx — no extra dev deps required).
//
// Coverage:
//  1. Canonical taxonomy codes are sourced LIVE from the Stock Code Manager
//     (tree_nodes.branch_code) so any branch the user adds is automatically
//     exercised. For each code we assert:
//       - if the engine has a rule for it (EXPECTED_MAPPINGS below) →
//         substrate/duty match the expected values.
//       - otherwise → the engine returns a well-formed result without
//         throwing, and the test logs a friendly hint so devs can add a rule.
//  2. Keyword overrides on product name (anti-slip, self-level, industrial,
//     steel, etc.) override or augment taxonomy defaults as documented.
//  3. The full Polyurea Waterproofing acceptance test from the engine spec:
//     substrate=[Concrete,Steel], duty=Heavy, humidity=Standard, overall=high.
// =============================================================================

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { inferQualificationTags } from './qualificationEngine';

// ---------- Helpers ----------

const product = (overrides: Partial<{ name: string; description: string; nodeId: string }> = {}) => ({
  name: '',
  description: '',
  nodeId: '',
  ...overrides,
});

const path = (...entries: string[]) => entries;

// =============================================================================
// 1) Canonical Stock Code Manager codes — sourced LIVE from tree_nodes
// =============================================================================
//
// EXPECTED_MAPPINGS captures what the engine SHOULD output for each well-known
// branch code per the engine spec. The list of codes to test is built at
// runtime from tree_nodes.branch_code, so when a new branch is added in the
// Stock Code Manager UI, the test automatically exercises it. Newly-added
// codes that have no expected mapping yet are tested for "no crash" only and
// printed as a hint, signalling that the engine may need a new rule.

interface ExpectedMapping {
  substrates: string[];
  duty: string | null;
}

const EXPECTED_MAPPINGS: Record<string, ExpectedMapping> = {
  PW:    { substrates: ['Concrete', 'Steel'],          duty: 'Heavy' },
  EPC:   { substrates: ['Concrete', 'Steel'],          duty: 'Industrial' },
  EPP:   { substrates: ['Concrete', 'Steel'],          duty: 'Medium' },
  PUP:   { substrates: ['Concrete', 'Steel'],          duty: 'Medium' },
  SP:    { substrates: ['Concrete'],                   duty: 'Medium' },
  PR:    { substrates: ['Concrete', 'Steel'],          duty: 'Medium' },
  'PW&B':{ substrates: ['Concrete', 'Steel'],          duty: 'Heavy' },
  BBW:   { substrates: ['Concrete'],                   duty: 'Heavy' },
  CBW:   { substrates: ['Concrete'],                   duty: null },
  AWM:   { substrates: ['Concrete'],                   duty: null },
  SF:    { substrates: ['Concrete'],                   duty: 'Medium' },
  AS:    { substrates: ['Concrete'],                   duty: 'Light' },
  IF:    { substrates: ['Concrete', 'Steel'],          duty: 'Industrial' },
  FA:    { substrates: ['Concrete', 'Wood'],           duty: null },
  EP:    { substrates: ['Concrete', 'Steel'],          duty: 'Medium' },
  PP:    { substrates: ['Concrete', 'Steel'],          duty: 'Medium' },
  'FP&SC':{ substrates: ['Concrete'],                  duty: 'Light' },
  RM:    { substrates: ['Concrete'],                   duty: 'Heavy' },
  IS:    { substrates: ['Concrete'],                   duty: null },
  FR:    { substrates: ['Concrete', 'Steel'],          duty: 'Heavy' },
  PB:    { substrates: ['Concrete', 'Steel'],          duty: 'Heavy' },
  MPW:   { substrates: ['Concrete', 'Steel', 'Wood'],  duty: null },
};

// Live-loaded list of { code, name } pairs from tree_nodes. Populated by
// the `before` hook below. If the DB is unavailable (CI without
// DATABASE_URL) the dynamic block falls back to EXPECTED_MAPPINGS keys so
// the spec is still exercised.
type LiveCode = { code: string; name: string };
let liveCodes: LiveCode[] = [];
let dbPool: import('pg').Pool | null = null;

before(async () => {
  if (!process.env.DATABASE_URL) {
    console.log('[qualificationEngine.test] DATABASE_URL not set — using EXPECTED_MAPPINGS keys as canonical list.');
    liveCodes = Object.keys(EXPECTED_MAPPINGS).map(code => ({ code, name: code }));
    return;
  }
  try {
    // Lazy import so a missing DB doesn't crash module load.
    const { db, pool } = await import('./db');
    const { treeNodes } = await import('@shared/schema');
    dbPool = pool;
    const rows = await db
      .select({ code: treeNodes.branchCode, name: treeNodes.name })
      .from(treeNodes);
    liveCodes = rows
      .filter((r): r is { code: string; name: string } => !!r.code)
      .map(r => ({ code: r.code, name: r.name }));
    if (liveCodes.length === 0) {
      console.log('[qualificationEngine.test] tree_nodes has no branch codes — falling back to EXPECTED_MAPPINGS keys.');
      liveCodes = Object.keys(EXPECTED_MAPPINGS).map(code => ({ code, name: code }));
    } else {
      console.log(`[qualificationEngine.test] Loaded ${liveCodes.length} branch codes from Stock Code Manager.`);
    }
  } catch (err) {
    console.log(`[qualificationEngine.test] DB unavailable (${(err as Error).message}) — using EXPECTED_MAPPINGS keys.`);
    liveCodes = Object.keys(EXPECTED_MAPPINGS).map(code => ({ code, name: code }));
  }
});

after(async () => {
  // Release the DB pool so the test process exits cleanly.
  if (dbPool) await dbPool.end().catch(() => {});
});

// One umbrella test that fans out subtests per live branch code. Using a
// single top-level test with t.test() keeps the dynamic codes grouped and
// guarantees the `before` hook runs first.
test('Stock Code Manager branch codes drive engine inference', async (t) => {
  // If liveCodes is empty here something went wrong in `before`.
  assert.ok(liveCodes.length > 0, 'no canonical codes available to test');

  for (const { code, name } of liveCodes) {
    await t.test(`code "${code}" (${name})`, () => {
      const result = inferQualificationTags(
        product({ name: `Generic ${code} Product`, nodeId: 'leaf' }),
        // Path mimics buildTaxonomyPath() output — both name and code present.
        path('Construction', 'Construction Chemicals', code, name),
      );

      // Universal sanity checks — these must hold for every code, even
      // brand-new ones the engine hasn't been taught yet.
      assert.ok(Array.isArray(result.substrate_types), 'substrate_types must be an array');
      assert.ok(typeof result.confidence.overall === 'string', 'overall confidence must be present');

      const expected = EXPECTED_MAPPINGS[code];
      if (!expected) {
        // New code — nothing to assert beyond "engine didn't crash".
        // Surface a hint so a developer adds a rule when they see this.
        console.log(`  ↳ no engine rule for "${code}" yet — engine returned substrates=${JSON.stringify(result.substrate_types)} duty=${result.duty_rating}`);
        return;
      }

      // Known code — assert spec compliance.
      assert.deepEqual(
        [...result.substrate_types].sort(),
        [...expected.substrates].sort(),
        `substrate mismatch for ${code}`,
      );
      assert.equal(result.duty_rating, expected.duty, `duty mismatch for ${code}`);
      assert.equal(
        result.confidence.substrate,
        'high',
        `substrate confidence should be high (taxonomy match) for ${code}`,
      );
    });
  }
});

// -----------------------------------------------------------------------------
// Code-collision regression: MPW must NOT match the earlier PW rule via
// substring matching. This is independent of the live-codes loop because we
// want to lock in the bug fix forever, even if MPW is removed from the DB.
// -----------------------------------------------------------------------------
test('MPW does NOT collide with PW (code-token collision regression)', () => {
  const result = inferQualificationTags(
    product({ name: 'MS Polymer Sealant', nodeId: 'leaf' }),
    path('Construction', 'MPW', 'MS Polymer'),
  );
  assert.ok(
    result.substrate_types.includes('Wood'),
    `expected Wood in substrate (MPW rule). Got: ${JSON.stringify(result.substrate_types)}`,
  );
  assert.deepEqual(
    [...result.substrate_types].sort(),
    ['Concrete', 'Steel', 'Wood'],
  );
});

// =============================================================================
// 2) Keyword override tests
// =============================================================================

test('keyword "anti-slip" in product name → Anti-Slip finish', () => {
  const result = inferQualificationTags(
    product({ name: 'EpoxyMax Anti-Slip Top Coat', nodeId: 'leaf' }),
    path('EP', 'Epoxy Paints'),
  );
  assert.equal(result.finish_type, 'Anti-Slip');
  assert.equal(result.confidence.finish, 'high');
});

test('keyword "self-level" in product name → Smooth finish (high confidence)', () => {
  const result = inferQualificationTags(
    product({ name: 'EpoxyMax Self-Level Floor', nodeId: 'leaf' }),
    path('IF', 'Industrial Flooring'),
  );
  assert.equal(result.finish_type, 'Smooth');
  assert.equal(result.confidence.finish, 'high');
});

test('standalone " SL " token in name → Smooth finish', () => {
  const result = inferQualificationTags(
    product({ name: 'EpoxyMax SL 100', nodeId: 'leaf' }),
    path('EP', 'Epoxy Paints'),
  );
  assert.equal(result.finish_type, 'Smooth');
});

test('keyword "industrial" in name → Industrial duty (overrides medium taxonomy)', () => {
  const result = inferQualificationTags(
    product({ name: 'Industrial Heavy Duty Coating', nodeId: 'leaf' }),
    path('Generic'),
  );
  assert.equal(result.duty_rating, 'Industrial');
});

test('keyword "steel" in name (no taxonomy match) → adds Steel substrate', () => {
  const result = inferQualificationTags(
    product({ name: 'Galvanized Steel Primer', nodeId: 'leaf' }),
    path('Generic'),
  );
  assert.ok(result.substrate_types.includes('Steel'));
  assert.equal(result.confidence.substrate, 'medium');
});

test('humidity keyword "submerged" → Underwater (high confidence)', () => {
  const result = inferQualificationTags(
    product({ name: 'WaterTank Submerged Coating', nodeId: 'leaf' }),
    path('Generic'),
  );
  assert.equal(result.humidity_tolerance, 'Underwater');
  assert.equal(result.confidence.humidity, 'high');
});

test('humidity keyword "moisture tolerant" in description → Moisture-Tolerant (medium)', () => {
  const result = inferQualificationTags(
    product({ name: 'Generic Coating', description: 'A moisture tolerant primer for damp surfaces.', nodeId: 'leaf' }),
    path('Generic'),
  );
  assert.equal(result.humidity_tolerance, 'Moisture-Tolerant');
  assert.equal(result.confidence.humidity, 'medium');
});

test('no humidity signal at all → defaults to Standard (low)', () => {
  const result = inferQualificationTags(
    product({ name: 'Plain Coating', nodeId: 'leaf' }),
    path('Generic'),
  );
  assert.equal(result.humidity_tolerance, 'Standard');
  assert.equal(result.confidence.humidity, 'low');
});

// =============================================================================
// 3) Polyurea Waterproofing acceptance test (verbatim from engine spec)
// =============================================================================

test('SPEC: Polyurea Waterproofing → substrate=[Concrete,Steel], duty=Heavy, humidity=Standard, overall=high', () => {
  const result = inferQualificationTags(
    product({ name: 'PolyureaSeal HD', nodeId: 'pw-leaf' }),
    path('Construction', 'Construction Chemicals', 'Waterproofing', 'PW', 'Polyurea Waterproofing'),
  );

  assert.deepEqual(
    [...result.substrate_types].sort(),
    ['Concrete', 'Steel'],
  );
  assert.equal(result.duty_rating, 'Heavy');
  assert.equal(result.humidity_tolerance, 'Standard');
  assert.equal(result.confidence.overall, 'high');
});
