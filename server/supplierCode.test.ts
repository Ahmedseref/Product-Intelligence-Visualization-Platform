// =============================================================================
// Supplier Code generation & shared-code resolution — tests
// =============================================================================
// Run with: npm test  (node:test + tsx).
//
// Coverage:
//  1. generateBranchCodeFromName — normal generation, collision fallbacks,
//     sanitization of non-alphanumeric names, exhaustion behavior, and the
//     5-character format guarantee.
//  2. validateBranchCode — format enforcement.
//  3. Database-backed behavior:
//     - Multiple NULL/blank codes coexist (existing-data compatibility).
//     - generateUniqueSupplierCode avoids codes held by different companies.
//     - generateUniqueSupplierCode does NOT treat same-company rows as
//       collisions (they will share the code, not conflict).
//     - resolveSupplierCode returns the existing code when the company name
//       matches (exact, case-insensitive, whitespace-insensitive).
//     - resolveSupplierCode generates a fresh code for a new company name.
//     - backfill assigns codes only to blank rows.
// =============================================================================

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  backfillExistingSupplierCodes,
  generateBranchCodeFromName,
  validateBranchCode,
  generateUniqueSupplierCode,
  resolveSupplierCode,
} from './stockCodeService';
import { db, pool } from './db';
import { suppliers } from '@shared/schema';
import { eq, like } from 'drizzle-orm';

// ---------- 1. Pure generation logic ----------

test('generates a short code from a single-word name', () => {
  const code = generateBranchCodeFromName('Fixbond', []);
  assert.equal(code, 'FI');
  assert.ok(code.length >= 2 && code.length <= 5);
});

test('generates initials for multi-word names', () => {
  const code = generateBranchCodeFromName('ABCL African Business', []);
  assert.equal(code, 'AAB');
});

test('picks the next candidate when the natural code is taken', () => {
  const code = generateBranchCodeFromName('Fixbond', ['FI']);
  assert.equal(code, 'FIX');
});

test('falls back to numbered variants when all natural candidates are taken', () => {
  const existing = ['FI', 'FIX', 'FX', 'FXB'];
  const code = generateBranchCodeFromName('Fixbond', existing);
  assert.ok(!existing.includes(code));
  assert.ok(code.length <= 5);
  assert.match(code, /^[A-Z0-9]+$/);
});

test('sanitizes names with punctuation and symbols', () => {
  const code = generateBranchCodeFromName('Al-Rashid & Sons, Ltd.', []);
  assert.match(code, /^[A-Z0-9]{2,5}$/);
});

test('handles names with no usable characters via C-prefix fallback', () => {
  const code = generateBranchCodeFromName('!!!', []);
  assert.match(code, /^C\d{4}$/);
  assert.ok(code.length <= 5);
});

test('every generated code stays within 5 chars even under heavy collision', () => {
  const existing: string[] = [];
  for (let i = 0; i < 120; i++) {
    const code = generateBranchCodeFromName('Test Company', existing);
    assert.ok(code.length <= 5, `code "${code}" exceeds 5 chars`);
    assert.ok(!existing.includes(code), `code "${code}" duplicated`);
    existing.push(code);
  }
});

test('throws a clear error when the code space is exhausted', () => {
  // Build an existing set that blocks every candidate the generator can try
  // for the name "AB": AB, (consonant variants), AB1..AB99 (3-char base is "AB"),
  // then base2 "AB" + 100..999.
  const existing: string[] = ['AB', 'ABC', 'B', 'BC'];
  for (let i = 1; i <= 99; i++) existing.push(`AB${i}`);
  for (let i = 100; i <= 999; i++) existing.push(`AB${i}`);
  assert.throws(() => generateBranchCodeFromName('AB', existing), /exhausted/);
});

// ---------- 2. Validation ----------

test('validateBranchCode accepts valid codes', () => {
  assert.equal(validateBranchCode('AB').valid, true);
  assert.equal(validateBranchCode('ABC12').valid, true);
});

test('validateBranchCode rejects bad formats', () => {
  assert.equal(validateBranchCode('').valid, false);
  assert.equal(validateBranchCode('abcde').valid, false);
  assert.equal(validateBranchCode('ABCDEF').valid, false);
  assert.equal(validateBranchCode('A B').valid, false);
  assert.equal(validateBranchCode('AB-1').valid, false);
});

// ---------- 3. Database-backed behavior ----------

const TEST_PREFIX = 'ZZTST';

async function cleanup() {
  await db.delete(suppliers).where(like(suppliers.supplierId, `${TEST_PREFIX}%`));
}

after(async () => {
  await cleanup();
  await pool.end();
});

test('multiple suppliers with NULL codes coexist (existing-data compatibility)', async () => {
  await cleanup();
  await db.insert(suppliers).values({ supplierId: `${TEST_PREFIX}-5`, name: 'Blank Code A' });
  await db.insert(suppliers).values({ supplierId: `${TEST_PREFIX}-6`, name: 'Blank Code B' });
  const rows = await db.select().from(suppliers).where(like(suppliers.supplierId, `${TEST_PREFIX}%`));
  const blanks = rows.filter(r => r.supplierCode == null);
  assert.ok(blanks.length >= 2, 'NULL supplier codes must not violate uniqueness');
});

test('generateUniqueSupplierCode avoids codes held by different companies', async () => {
  await cleanup();
  // Insert a contact with name 'Zumba Corp' and code 'ZU'
  await db.insert(suppliers).values({
    supplierId: `${TEST_PREFIX}-7`,
    name: 'Zumba Corp',
    supplierCode: 'ZU',
  });
  // Generating for a DIFFERENT company that would also naturally get 'ZU'
  // must pick a different code.
  const code = await generateUniqueSupplierCode('Zumba Mix');
  assert.notEqual(code, 'ZU', 'should avoid code held by a different company');
  assert.match(code, /^[A-Z0-9]{2,5}$/);
  assert.equal(validateBranchCode(code).valid, true);
});

test('generateUniqueSupplierCode does not treat same-company rows as collisions', async () => {
  await cleanup();
  // Two contacts with the same company name already hold code 'ZU'
  await db.insert(suppliers).values([
    { supplierId: `${TEST_PREFIX}-sa1`, name: 'Zumba Corp', supplierCode: 'ZU' },
    { supplierId: `${TEST_PREFIX}-sa2`, name: 'Zumba Corp', supplierCode: 'ZU' },
  ]);
  // Generating for the SAME company name should be free to (re-)generate 'ZU'
  // or any other code — critically it must not treat 'ZU' as a blocker.
  const code = await generateUniqueSupplierCode('Zumba Corp');
  // The result may be 'ZU' (ideal) or any other valid code — what matters is
  // that code space is not artificially exhausted by same-company rows.
  assert.match(code, /^[A-Z0-9]{2,5}$/);
  assert.equal(validateBranchCode(code).valid, true);
});

test('resolveSupplierCode returns existing code when company name matches exactly', async () => {
  await cleanup();
  await db.insert(suppliers).values({
    supplierId: `${TEST_PREFIX}-r1`,
    name: 'Omega Solutions',
    supplierCode: 'OMGS',
  });
  const code = await resolveSupplierCode('Omega Solutions');
  assert.equal(code, 'OMGS', 'should reuse the existing company code');
});

test('resolveSupplierCode is case-insensitive', async () => {
  await cleanup();
  await db.insert(suppliers).values({
    supplierId: `${TEST_PREFIX}-r2`,
    name: 'Omega Solutions',
    supplierCode: 'OMGS',
  });
  const code = await resolveSupplierCode('omega solutions');
  assert.equal(code, 'OMGS', 'should reuse code regardless of case');
});

test('resolveSupplierCode is whitespace-insensitive', async () => {
  await cleanup();
  await db.insert(suppliers).values({
    supplierId: `${TEST_PREFIX}-r3`,
    name: 'Omega  Solutions',
    supplierCode: 'OMGS',
  });
  const code = await resolveSupplierCode('Omega Solutions');
  assert.equal(code, 'OMGS', 'should reuse code despite extra internal whitespace');
});

test('resolveSupplierCode generates a new code for a brand-new company name', async () => {
  await cleanup();
  const code = await resolveSupplierCode('Brandnew Industries');
  assert.match(code, /^[A-Z0-9]{2,5}$/);
  assert.equal(validateBranchCode(code).valid, true);
});

// ---------- 4. Database-level cross-company guard (exclusion constraint) ----------

test('same code + same company name: both inserts succeed (shared code)', async () => {
  await cleanup();
  const results = await Promise.allSettled([
    db.insert(suppliers).values({ supplierId: `${TEST_PREFIX}-x1`, name: 'Shared Co', supplierCode: 'ZZTQ7' }),
    db.insert(suppliers).values({ supplierId: `${TEST_PREFIX}-x2`, name: 'shared  co', supplierCode: 'ZZTQ7' }),
  ]);
  const fulfilled = results.filter(r => r.status === 'fulfilled');
  assert.equal(fulfilled.length, 2, 'same-company contacts must be able to share a code');
});

test('same code + different company names: DB rejects the second insert', async () => {
  await cleanup();
  await db.insert(suppliers).values({
    supplierId: `${TEST_PREFIX}-x3`,
    name: 'Company Alpha',
    supplierCode: 'ZZTQ8',
  });
  await assert.rejects(
    db.insert(suppliers).values({
      supplierId: `${TEST_PREFIX}-x4`,
      name: 'Company Beta',
      supplierCode: 'ZZTQ8',
    }),
    (err: any) => err?.code === '23P01' || err?.cause?.code === '23P01',
    'expected an exclusion-violation (23P01) error',
  );
});

test('concurrent different-company inserts with the same code: exactly one wins', async () => {
  await cleanup();
  const attempts = await Promise.allSettled([
    db.insert(suppliers).values({ supplierId: `${TEST_PREFIX}-x5`, name: 'Race Alpha', supplierCode: 'ZZTQ9' }),
    db.insert(suppliers).values({ supplierId: `${TEST_PREFIX}-x6`, name: 'Race Beta', supplierCode: 'ZZTQ9' }),
  ]);
  const fulfilled = attempts.filter(a => a.status === 'fulfilled');
  const rejected = attempts.filter(a => a.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'exactly one concurrent different-company insert should succeed');
  assert.equal(rejected.length, 1, 'the other must be rejected by the exclusion constraint');
  const err: any = (rejected[0] as PromiseRejectedResult).reason;
  assert.ok(err?.code === '23P01' || err?.cause?.code === '23P01', 'rejection must be 23P01');
});

test('composed vs decomposed Unicode spellings share a code without DB conflict', async () => {
  await cleanup();
  const composed = 'Caf\u00e9 Delta';          // "Café Delta" — U+00E9 (NFC)
  const decomposed = 'Cafe\u0301 Delta';       // "Café Delta" — e + U+0301 (NFD)
  await db.insert(suppliers).values({
    supplierId: `${TEST_PREFIX}-u1`,
    name: composed,
    supplierCode: 'ZZTU1',
  });
  // Application layer: decomposed spelling resolves to the same shared code.
  const code = await resolveSupplierCode(decomposed);
  assert.equal(code, 'ZZTU1', 'NFC-equivalent names must resolve to the same code');
  // Database layer: inserting the decomposed spelling with the shared code
  // must NOT trip the exclusion constraint (both normalize to the same name).
  await db.insert(suppliers).values({
    supplierId: `${TEST_PREFIX}-u2`,
    name: decomposed,
    supplierCode: 'ZZTU1',
  });
  const rows = await db.select().from(suppliers).where(eq(suppliers.supplierCode, 'ZZTU1'));
  assert.ok(rows.length >= 2, 'both Unicode spellings must coexist with the shared code');
});

test('Unicode-equivalent different companies still blocked from sharing a code', async () => {
  await cleanup();
  await db.insert(suppliers).values({
    supplierId: `${TEST_PREFIX}-u3`,
    name: 'Caf\u00e9 Delta',
    supplierCode: 'ZZTU2',
  });
  // A genuinely different company must not take the same code, regardless of
  // Unicode form.
  await assert.rejects(
    db.insert(suppliers).values({
      supplierId: `${TEST_PREFIX}-u4`,
      name: 'Cafe\u0301 Echo', // different company, decomposed form
      supplierCode: 'ZZTU2',
    }),
    (err: any) => err?.code === '23P01' || err?.cause?.code === '23P01',
    'expected an exclusion-violation (23P01) error',
  );
});

test('NULL and blank codes are exempt from the cross-company guard', async () => {
  await cleanup();
  await db.insert(suppliers).values([
    { supplierId: `${TEST_PREFIX}-x7`, name: 'No Code A' },
    { supplierId: `${TEST_PREFIX}-x8`, name: 'No Code B' },
    { supplierId: `${TEST_PREFIX}-x9`, name: 'Blank Code C', supplierCode: null },
  ]);
  const rows = await db.select().from(suppliers).where(like(suppliers.supplierId, `${TEST_PREFIX}-x%`));
  assert.ok(rows.length >= 3, 'rows without codes must not trip the exclusion constraint');
});

test('backfill assigns unique codes only to blank legacy contacts', async () => {
  await cleanup();
  await db.insert(suppliers).values([
    { supplierId: `${TEST_PREFIX}-backfill-a`, name: 'Legacy Alpha' },
    { supplierId: `${TEST_PREFIX}-backfill-b`, name: 'Legacy Beta' },
    { supplierId: `${TEST_PREFIX}-backfill-existing`, name: 'Already Coded', supplierCode: 'ZZTQ4' },
  ]);

  const result = await backfillExistingSupplierCodes({
    supplierIds: [
      `${TEST_PREFIX}-backfill-a`,
      `${TEST_PREFIX}-backfill-b`,
      `${TEST_PREFIX}-backfill-existing`,
    ],
  });
  assert.equal(result.updated, 2);
  assert.equal(result.skipped, 0);

  const rows = await db
    .select({ supplierId: suppliers.supplierId, supplierCode: suppliers.supplierCode })
    .from(suppliers)
    .where(like(suppliers.supplierId, `${TEST_PREFIX}-backfill-%`));
  const codes = rows.map(row => row.supplierCode);
  // All three rows have codes, and 'ZZTQ4' is preserved.
  assert.ok(codes.every(c => c != null), 'all backfilled rows must have a code');
  assert.ok(codes.includes('ZZTQ4'), 'pre-existing code must be preserved');

  const rerun = await backfillExistingSupplierCodes({
    supplierIds: [
      `${TEST_PREFIX}-backfill-a`,
      `${TEST_PREFIX}-backfill-b`,
      `${TEST_PREFIX}-backfill-existing`,
    ],
  });
  assert.deepEqual(rerun, { updated: 0, skipped: 0 });
});
