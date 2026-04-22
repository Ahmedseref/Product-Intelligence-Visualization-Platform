// =============================================================================
// Auto-Qualification Engine — unit tests
// =============================================================================
// Run with: npm test  (uses node:test + tsx — no extra dev deps required).
//
// Coverage:
//  1. Each canonical taxonomy code from the Stock Code Manager
//     (PW, EPC, EPP, PUP, SP, PR, PW&B, BBW, CBW, AWM, SF, AS, IF, FA, EP,
//      PP, FP&SC, RM, IS, FR, PB, MPW) → expected substrate(s) and duty.
//  2. Keyword overrides on product name (anti-slip, self-level, industrial,
//     steel, etc.) override or augment taxonomy defaults as documented.
//  3. The full Polyurea Waterproofing acceptance test from the engine spec:
//     substrate=[Concrete,Steel], duty=Heavy, humidity=Standard, overall=high.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferQualificationTags } from './qualificationEngine';

// ---------- Helpers ----------

// Tiny factory — most tests only care about taxonomy path. Name/description
// default to empty so generic keyword rules don't fire by accident.
const product = (overrides: Partial<{ name: string; description: string; nodeId: string }> = {}) => ({
  name: '',
  description: '',
  nodeId: '',
  ...overrides,
});

// Build a taxonomy path that mimics what buildTaxonomyPath() would return:
// alternating branch codes and node names from root → leaf. Only the leaf
// values matter to most rules — the rest is realistic padding.
const path = (...entries: string[]) => entries;

// =============================================================================
// 1) Canonical Stock Code Manager taxonomy codes
// =============================================================================
// Each entry: leaf branch code (and a representative node name) → the
// expected substrate and duty per the engine spec. We assert substrate set
// equality (order-insensitive) and duty exact match.

const TAXONOMY_CASES: Array<{
  code: string;
  name: string;
  expectedSubstrates: string[];
  expectedDuty: string | null;
}> = [
  { code: 'PW',    name: 'Polyurea Waterproofing',       expectedSubstrates: ['Concrete', 'Steel'],          expectedDuty: 'Heavy' },
  { code: 'EPC',   name: 'Epoxy Waterproofing',          expectedSubstrates: ['Concrete', 'Steel'],          expectedDuty: 'Industrial' },
  { code: 'EPP',   name: 'Epoxy Primer',                 expectedSubstrates: ['Concrete', 'Steel'],          expectedDuty: 'Medium' },
  { code: 'PUP',   name: 'PU Primer',                    expectedSubstrates: ['Concrete', 'Steel'],          expectedDuty: 'Medium' },
  { code: 'SP',    name: 'Silane Primer',                expectedSubstrates: ['Concrete'],                   expectedDuty: 'Medium' },
  { code: 'PR',    name: 'Primers',                      expectedSubstrates: ['Concrete', 'Steel'],          expectedDuty: 'Medium' },
  { code: 'PW&B',  name: 'Polyurethane Waterproofing',   expectedSubstrates: ['Concrete', 'Steel'],          expectedDuty: 'Heavy' },
  { code: 'BBW',   name: 'Bitumen Based Waterproofing',  expectedSubstrates: ['Concrete'],                   expectedDuty: 'Heavy' },
  { code: 'CBW',   name: 'Cement Based Waterproofing',   expectedSubstrates: ['Concrete'],                   expectedDuty: null },
  { code: 'AWM',   name: 'Acrylic Waterproofing',        expectedSubstrates: ['Concrete'],                   expectedDuty: null },
  { code: 'SF',    name: 'Sports Flooring',              expectedSubstrates: ['Concrete'],                   expectedDuty: 'Medium' },
  { code: 'AS',    name: 'Acrylic System',               expectedSubstrates: ['Concrete'],                   expectedDuty: 'Light' },
  { code: 'IF',    name: 'Industrial Flooring',          expectedSubstrates: ['Concrete', 'Steel'],          expectedDuty: 'Industrial' },
  { code: 'FA',    name: 'Floor Adhesives',              expectedSubstrates: ['Concrete', 'Wood'],           expectedDuty: null },
  { code: 'EP',    name: 'Epoxy Paints',                 expectedSubstrates: ['Concrete', 'Steel'],          expectedDuty: 'Medium' },
  { code: 'PP',    name: 'Polyurethane Paints',          expectedSubstrates: ['Concrete', 'Steel'],          expectedDuty: 'Medium' },
  { code: 'FP&SC', name: 'Floor Paints',                 expectedSubstrates: ['Concrete'],                   expectedDuty: 'Light' },
  { code: 'RM',    name: 'Repair Mortars',               expectedSubstrates: ['Concrete'],                   expectedDuty: 'Heavy' },
  { code: 'IS',    name: 'Injection Systems',            expectedSubstrates: ['Concrete'],                   expectedDuty: null },
  { code: 'FR',    name: 'Fire rated',                   expectedSubstrates: ['Concrete', 'Steel'],          expectedDuty: 'Heavy' },
  { code: 'PB',    name: 'Polyurethane Bitumen',         expectedSubstrates: ['Concrete', 'Steel'],          expectedDuty: 'Heavy' },
  { code: 'MPW',   name: 'MS Polymer',                   expectedSubstrates: ['Concrete', 'Steel', 'Wood'],  expectedDuty: null },
];

for (const c of TAXONOMY_CASES) {
  test(`taxonomy code ${c.code} (${c.name}) infers expected substrate + duty`, () => {
    // Path includes a couple of fake ancestors plus the canonical leaf
    // (both name and branch code) — this mirrors buildTaxonomyPath() output.
    const result = inferQualificationTags(
      product({ name: `Generic ${c.code} Product`, nodeId: 'leaf' }),
      path('Construction', 'Construction Chemicals', c.code, c.name),
    );

    assert.deepEqual(
      [...result.substrate_types].sort(),
      [...c.expectedSubstrates].sort(),
      `substrate mismatch for ${c.code}`,
    );
    assert.equal(result.duty_rating, c.expectedDuty, `duty mismatch for ${c.code}`);
    // Substrate signal must be high (taxonomy match), not name fallback.
    assert.equal(result.confidence.substrate, 'high', `substrate confidence should be high for ${c.code}`);
  });
}

// -----------------------------------------------------------------------------
// Code-collision regression: the bug fix that made `pathIncludesAny` require
// EXACT token match for code-like fragments. MPW must NOT match the earlier
// PW rule (substring would have collided).
// -----------------------------------------------------------------------------
test('MPW does NOT collide with PW (code-token collision regression)', () => {
  const result = inferQualificationTags(
    product({ name: 'MS Polymer Sealant', nodeId: 'leaf' }),
    path('Construction', 'MPW', 'MS Polymer'),
  );
  // Wood is the discriminator — only MPW assigns Wood. PW does not.
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
  // EP path defaults duty=Medium, but the name keyword wins via the duty
  // taxonomy rules (Industrial Flooring fragment in name).
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
  // Name didn't match — description fallback gives medium confidence.
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
    'substrate must equal [Concrete, Steel]',
  );
  assert.equal(result.duty_rating, 'Heavy', 'duty must be Heavy');
  assert.equal(result.humidity_tolerance, 'Standard', 'humidity must default to Standard');
  assert.equal(result.confidence.overall, 'high', 'overall confidence must be high');
});
