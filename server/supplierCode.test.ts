// =============================================================================
// Supplier Code generation & uniqueness — tests (Task: auto-generated codes)
// =============================================================================
// Run with: npm test  (node:test + tsx).
//
// Coverage:
//  1. generateBranchCodeFromName — normal generation, collision fallbacks,
//     sanitization of non-alphanumeric names, exhaustion behavior, and the
//     5-character format guarantee.
//  2. validateBranchCode — format enforcement.
//  3. Database-backed uniqueness — the suppliers.supplier_code unique
//     constraint rejects duplicate codes (including concurrent inserts),
//     while multiple NULL/blank codes coexist fine (existing-data compat).
//  4. generateUniqueSupplierCode — generates against live DB values and
//     never returns a code already in use.
// =============================================================================

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateBranchCodeFromName, validateBranchCode, generateUniqueSupplierCode } from './stockCodeService';
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

// ---------- 3 & 4. Database-backed behavior ----------

const TEST_PREFIX = 'ZZTST';

async function cleanup() {
  await db.delete(suppliers).where(like(suppliers.supplierId, `${TEST_PREFIX}%`));
}

after(async () => {
  await cleanup();
  await pool.end();
});

test('unique constraint rejects duplicate supplier codes', async () => {
  await cleanup();
  await db.insert(suppliers).values({
    supplierId: `${TEST_PREFIX}-1`,
    name: 'Unique Test One',
    supplierCode: 'ZZTQ1',
  });
  await assert.rejects(
    db.insert(suppliers).values({
      supplierId: `${TEST_PREFIX}-2`,
      name: 'Unique Test Two',
      supplierCode: 'ZZTQ1',
    }),
    (err: any) => err?.code === '23505' || err?.cause?.code === '23505',
    'expected a unique-violation (23505) error',
  );
});

test('concurrent inserts with the same code: exactly one wins', async () => {
  const attempts = await Promise.allSettled([
    db.insert(suppliers).values({ supplierId: `${TEST_PREFIX}-3`, name: 'Race A', supplierCode: 'ZZTQ2' }),
    db.insert(suppliers).values({ supplierId: `${TEST_PREFIX}-4`, name: 'Race B', supplierCode: 'ZZTQ2' }),
  ]);
  const fulfilled = attempts.filter(a => a.status === 'fulfilled');
  const rejected = attempts.filter(a => a.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'exactly one concurrent insert should succeed');
  assert.equal(rejected.length, 1, 'exactly one concurrent insert should fail');
});

test('multiple suppliers with NULL codes coexist (existing-data compatibility)', async () => {
  await db.insert(suppliers).values({ supplierId: `${TEST_PREFIX}-5`, name: 'Blank Code A' });
  await db.insert(suppliers).values({ supplierId: `${TEST_PREFIX}-6`, name: 'Blank Code B' });
  const rows = await db.select().from(suppliers).where(like(suppliers.supplierId, `${TEST_PREFIX}%`));
  const blanks = rows.filter(r => r.supplierCode == null);
  assert.ok(blanks.length >= 2, 'NULL supplier codes must not violate uniqueness');
});

test('generateUniqueSupplierCode avoids codes already in the database', async () => {
  // 'ZZTQ3' seed: insert a supplier whose natural code would collide
  await db.insert(suppliers).values({
    supplierId: `${TEST_PREFIX}-7`,
    name: 'Zumba Corp',
    supplierCode: 'ZU',
  });
  const code = await generateUniqueSupplierCode('Zumba Corp');
  assert.notEqual(code, 'ZU');
  assert.match(code, /^[A-Z0-9]{2,5}$/);
  const validation = validateBranchCode(code);
  assert.equal(validation.valid, true);
});
