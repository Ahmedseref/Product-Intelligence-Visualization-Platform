// Explicit allowlist: never back up tokens, credentials, or arbitrary storage.
export const BROWSER_BACKUP_KEYS = ['floating-notes-widget', 'supplierManager_savedView'] as const;
export type BrowserBackupState = Partial<Record<typeof BROWSER_BACKUP_KEYS[number], string | null>>;

export function validateBrowserBackup(value: unknown): asserts value is BrowserBackupState {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(value).length > 64000) throw new Error('Invalid browser backup (maximum 64 KB)');
  for (const [key, data] of Object.entries(value)) {
    if (!(BROWSER_BACKUP_KEYS as readonly string[]).includes(key) || (data !== null && typeof data !== 'string')) {
      throw new Error('Unsupported browser backup entry');
    }
    if (data !== null) JSON.parse(data);
  }
}
