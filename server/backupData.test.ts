import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { is, getTableName, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@shared/schema';
import { db, pool } from './db';
import { backupCounts, backupTables, collectBackupData, restoreBackupData, validateBackupData, type BackupData } from './backupData';
import { validateBrowserBackup } from '@shared/browserBackup';
import { decodeBackupExport } from './backupService';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

after(async () => { await pool.end(); });

test('every business table is covered, accounts and recursive backup history excluded', () => {
  const tables = Object.entries(schema).filter(([, value]) => is(value, PgTable))
    .map(([key]) => key).filter(key => !['users', 'backups'].includes(key)).sort();
  assert.deepEqual(Object.keys(backupTables).sort(), tables);
});

test('legacy backups preserve missing feature collections rather than invent empty arrays', () => {
  const legacy: BackupData = {
    version: '1.0.0', createdAt: new Date().toISOString(),
    data: { products: [], suppliers: [], treeNodes: [], customFieldDefinitions: [], appSettings: [] },
  };
  validateBackupData(legacy);
  assert.equal(Object.hasOwn(backupCounts(legacy), 'proformas'), false);
  assert.throws(() => validateBackupData({ ...legacy, version: '99.0.0' }), /invalid backup format/);
  assert.throws(() => validateBackupData({ ...legacy, version: '2.0.0' }), /Missing backup collection/);
  assert.throws(() => validateBackupData({ ...legacy, data: { ...legacy.data, users: [] } }), /Invalid backup collection/);
  assert.throws(() => validateBackupData({
    ...legacy, data: { ...legacy.data, suppliers: [{ updatedAt: 'not a date' }] },
  }), /Invalid date/);
});

test('browser snapshots allow advanced notes and saved views but reject credentials', () => {
  validateBrowserBackup({
    'floating-notes-widget': JSON.stringify({ notes: [{ text: '**Call**', references: [{ type: 'invoice', id: 'PI1' }] }] }),
    supplierManager_savedView: null,
  });
  assert.throws(() => validateBrowserBackup({ token: 'never store' }), /Unsupported/);
  assert.throws(() => validateBrowserBackup({ 'floating-notes-widget': 'broken json' }));
  assert.throws(() => validateBrowserBackup({ 'floating-notes-widget': 'x'.repeat(65000) }), /64 KB/);
});

test('backup imports verify integrity before storing or restoring anything', () => {
  const data: BackupData = {
    version: '1.0.0', createdAt: new Date().toISOString(),
    data: { products: [], suppliers: [], treeNodes: [], customFieldDefinitions: [], appSettings: [] },
  };
  const checksum = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const encode = (payload: unknown) => gzipSync(JSON.stringify(payload));
  assert.deepEqual(decodeBackupExport(encode({ metadata: { checksum }, data })).data, data);
  assert.throws(() => decodeBackupExport(encode({ metadata: { checksum: 'bad' }, data })), /checksum/);
  assert.throws(() => decodeBackupExport(encode({ metadata: {}, data })), /checksum/);
  assert.throws(() => decodeBackupExport(Buffer.from('not gzip')));
});

test('all collections round-trip safely in temporary tables, preserving IDs, Unicode, links and nested JSON', async () => {
  const rollback = new Error('rollback isolated backup test');
  await assert.rejects(db.transaction(async tx => {
    // Session-local shadow tables: no live business rows are modified.
    for (const table of Object.values(backupTables)) {
      const name = getTableName(table);
      await tx.execute(sql.raw(`CREATE TEMP TABLE "${name}" (LIKE public."${name}" INCLUDING ALL) ON COMMIT DROP`));
      await tx.execute(sql.raw(`CREATE TEMP SEQUENCE "${name}_backup_test_seq"`));
      await tx.execute(sql.raw(`ALTER TABLE pg_temp."${name}" ALTER COLUMN id SET DEFAULT nextval('pg_temp.${name}_backup_test_seq')`));
      await tx.execute(sql.raw(`ALTER SEQUENCE pg_temp."${name}_backup_test_seq" OWNED BY pg_temp."${name}".id`));
    }
    await tx.insert(schema.suppliers).values({
      id: 81, supplierId: 'BACKUP-TEST', name: 'Café Company', supplierCode: 'CAF',
      notionLastEditedTime: new Date('2026-01-02T03:04:05Z'),
      notionRawProperties: { Notes: { rich_text: [{ plain_text: 'Keep me' }] } },
    });
    await tx.insert(schema.customers).values({ id: 90, name: 'Backup customer' });
    await tx.insert(schema.systems).values({ id: 91, systemId: 'SYS-BACKUP', name: 'Backup system' });
    await tx.insert(schema.appSettings).values({
      id: 95, key: 'browser_backup:test', value: {
        'floating-notes-widget': JSON.stringify({
          notes: [{ id: 'n1', text: '**Follow up**', references: [{ type: 'supplier', id: 'BACKUP-TEST', label: 'Café', href: '#suppliers?noteSupplier=BACKUP-TEST' }] }],
        }),
        supplierManager_savedView: JSON.stringify({ searchQuery: 'Café', hiddenColumns: ['country'] }),
      },
    });
    const snapshot = await collectBackupData(tx);
    // Simulate the actual JSON export/import boundary, including date strings.
    const decoded = JSON.parse(JSON.stringify(snapshot)) as BackupData;
    validateBackupData(decoded);
    assert.equal(backupCounts(decoded).customers, 1);
    await tx.delete(schema.customers);
    await restoreBackupData(tx, decoded);
    const restored = await collectBackupData(tx);
    assert.deepEqual(JSON.parse(JSON.stringify(restored.data)), decoded.data);
    const [next] = await tx.insert(schema.appSettings).values({ key: 'next-row', value: {} }).returning();
    assert.equal(next.id, 96, 'serial IDs advance past restored IDs');
    // Restore v1: modern data must remain present.
    await restoreBackupData(tx, {
      version: '1.0.0', createdAt: new Date().toISOString(),
      data: { products: [], suppliers: [], treeNodes: [], customFieldDefinitions: [], appSettings: [] },
    });
    assert.equal((await tx.select().from(schema.customers)).length, 1);
    assert.equal((await tx.select().from(schema.systems)).length, 1);
    throw rollback;
  }), error => error === rollback);
});
