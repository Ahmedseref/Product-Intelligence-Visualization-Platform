import * as schema from '@shared/schema';
import { getTableColumns, getTableName, sql } from 'drizzle-orm';

// Parent-first order. Backup history and login credentials are intentionally
// excluded: restoring business data must not roll back accounts or sessions.
export const backupTables = {
  treeNodes: schema.treeNodes,
  suppliers: schema.suppliers,
  masterProducts: schema.masterProducts,
  products: schema.products,
  supplierProducts: schema.supplierProducts,
  customFieldDefinitions: schema.customFieldDefinitions,
  colors: schema.colors,
  sectors: schema.sectors,
  systems: schema.systems,
  systemLayers: schema.systemLayers,
  primerLibrary: schema.primerLibrary,
  systemProductOptions: schema.systemProductOptions,
  systemHistory: schema.systemHistory,
  attachments: schema.attachments,
  stockCodeHistory: schema.stockCodeHistory,
  documents: schema.documents,
  customers: schema.customers,
  customerFields: schema.customerFields,
  proformaSettings: schema.proformaSettings,
  proformas: schema.proformas,
  proformaItems: schema.proformaItems,
  proformaFinancials: schema.proformaFinancials,
  qualificationVocabularies: schema.qualificationVocabularies,
  productQualificationTags: schema.productQualificationTags,
  appSettings: schema.appSettings,
};
export type BackupTableKey = keyof typeof backupTables;
export interface BackupData {
  version: string;
  createdAt: string;
  data: Partial<Record<BackupTableKey, Record<string, any>[]>>;
}
const legacyKeys = ['products', 'suppliers', 'treeNodes', 'customFieldDefinitions', 'appSettings'];
export const BACKUP_VERSION = '2.0.0';

export function validateBackupData(value: unknown): asserts value is BackupData {
  const payload = value as BackupData;
  if (!payload || !['1.0.0', BACKUP_VERSION].includes(payload.version)
      || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)
      || !Number.isFinite(Date.parse(payload.createdAt))) {
    throw new Error('Unsupported or invalid backup format');
  }
  const required = payload.version === BACKUP_VERSION ? Object.keys(backupTables) : legacyKeys;
  for (const key of required) {
    if (!Array.isArray(payload.data[key as BackupTableKey])) throw new Error(`Missing backup collection: ${key}`);
  }
  for (const [key, rows] of Object.entries(payload.data)) {
    if (!Object.hasOwn(backupTables, key) || !Array.isArray(rows)) throw new Error(`Invalid backup collection: ${key}`);
    const columns = getTableColumns(backupTables[key as BackupTableKey]);
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Invalid row in ${key}`);
      for (const [field, item] of Object.entries(row)) {
        const column = columns[field];
        if (!column) throw new Error(`Unknown field ${key}.${field}`);
        if (column.dataType === 'date' && item != null && !Number.isFinite(new Date(item as string).getTime())) {
          throw new Error(`Invalid date ${key}.${field}`);
        }
      }
    }
  }
}

export function backupCounts(payload: BackupData): Record<string, number> {
  return Object.fromEntries(Object.entries(payload.data).map(([key, rows]) => [key, rows!.length]));
}

/** Operates on a caller-owned repeatable-read transaction. */
export async function collectBackupData(tx: any): Promise<BackupData> {
  const data: BackupData['data'] = {};
  for (const [key, table] of Object.entries(backupTables)) {
    const rows = await tx.select().from(table);
    data[key as BackupTableKey] = key === 'appSettings'
      ? rows.filter((row: any) => row.key !== 'browser_backup_restore_epoch')
      : rows;
  }
  return { version: BACKUP_VERSION, createdAt: new Date().toISOString(), data };
}

/** Caller owns atomicity. A legacy backup touches only collections it contains. */
export async function restoreBackupData(tx: any, payload: BackupData): Promise<void> {
  validateBackupData(payload);
  const entries = Object.entries(backupTables).filter(([key]) => Object.hasOwn(payload.data, key));
  // Readers can continue, but concurrent writes cannot interleave with replacement.
  for (const [, table] of entries) await tx.execute(sql`LOCK TABLE ${table} IN EXCLUSIVE MODE`);
  for (const [, table] of [...entries].reverse()) await tx.delete(table);
  for (const [key, table] of entries) {
    const columns = getTableColumns(table);
    const rows = payload.data[key as BackupTableKey]!;
    // Stay below PostgreSQL's parameter limit even on large product datasets.
    const batchSize = Math.max(1, Math.floor(30000 / Object.keys(columns).length));
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize).map(row =>
        Object.fromEntries(Object.entries(row).map(([field, value]) => [
          field, columns[field].dataType === 'date' && value != null ? new Date(value) : value,
        ])));
      await tx.insert(table).values(batch);
    }
    // Explicit IDs must not leave the next generated ID behind restored rows.
    // Never rewind: sequence changes survive transaction rollbacks, and a later
    // restore failure must not cause ID collisions against the original rows.
    const name = getTableName(table);
    await tx.execute(sql`
      SELECT setval(pg_get_serial_sequence(${name}, 'id'),
        GREATEST(COALESCE((SELECT MAX(id) FROM ${table}), 0),
          COALESCE(pg_sequence_last_value(pg_get_serial_sequence(${name}, 'id')::regclass), 0), 1),
        true)
      WHERE pg_get_serial_sequence(${name}, 'id') IS NOT NULL
    `);
  }
}
