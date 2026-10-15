import { db } from './db';
import { appSettings } from '@shared/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { validateBrowserBackup, type BrowserBackupState } from '@shared/browserBackup';

const keyFor = (userId: string) => `browser_backup:${userId}`;
const EPOCH_KEY = 'browser_backup_restore_epoch';

export async function getBrowserBackup(userId: string) {
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, [keyFor(userId), EPOCH_KEY]));
  return {
    state: (rows.find(r => r.key === keyFor(userId))?.value ?? null) as BrowserBackupState | null,
    epoch: (rows.find(r => r.key === EPOCH_KEY)?.value ?? '') as string,
  };
}

export async function saveBrowserBackup(userId: string, value: unknown, epoch: unknown) {
  validateBrowserBackup(value);
  return db.transaction(async tx => {
    // Serialize with restore's settings deletion so a stale open tab cannot
    // overwrite restored notes between checking the epoch and saving.
    await tx.execute(sql`LOCK TABLE app_settings IN SHARE ROW EXCLUSIVE MODE`);
    const [marker] = await tx.select().from(appSettings).where(eq(appSettings.key, EPOCH_KEY));
    if ((marker?.value ?? '') !== epoch) return false;
    await tx.insert(appSettings).values({ key: keyFor(userId), value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
    return true;
  });
}
