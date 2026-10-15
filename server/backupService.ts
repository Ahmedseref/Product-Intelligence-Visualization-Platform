import { db } from "./db";
import { backups, appSettings } from "@shared/schema";
import { backupCounts, backupTables, collectBackupData, restoreBackupData, validateBackupData, type BackupData } from "./backupData";
export type { BackupData } from "./backupData";
import { eq, desc, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { gzipSync, gunzipSync } from "zlib";

export type TriggerType = "AUTO" | "MANUAL" | "SYSTEM";

export interface BackupSummary {
  id: number;
  versionNumber: number;
  createdAt: Date | null;
  triggerType: string;
  description: string | null;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  entityCounts: Record<string, number>;
}

export interface RestorePreview {
  entityCounts: Record<string, number>;
  formatVersion: string;
  preservedCollections: string[];
  limitations: string[];
}
const BACKUP_SETTINGS_KEY = "backup_settings";

let maxBackups = 50;
let autoBackupIntervalHours = 6;
let scheduledBackupTimer: NodeJS.Timeout | null = null;

export interface BackupSettings {
  maxBackups: number;
  autoBackupIntervalHours: number;
}

async function loadSettingsFromDb(): Promise<void> {
  try {
    const [setting] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, BACKUP_SETTINGS_KEY));
    
    if (setting && setting.value) {
      const savedSettings = setting.value as BackupSettings;
      if (savedSettings.maxBackups) maxBackups = savedSettings.maxBackups;
      if (savedSettings.autoBackupIntervalHours) autoBackupIntervalHours = savedSettings.autoBackupIntervalHours;
      console.log(`[Backup] Loaded settings: maxBackups=${maxBackups}, interval=${autoBackupIntervalHours}h`);
    }
  } catch (error) {
    console.error("[Backup] Failed to load settings, using defaults:", error);
  }
}

async function saveSettingsToDb(): Promise<void> {
  try {
    const settingsValue = { maxBackups, autoBackupIntervalHours };
    const existing = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, BACKUP_SETTINGS_KEY));
    
    if (existing.length > 0) {
      await db
        .update(appSettings)
        .set({ value: settingsValue, updatedAt: new Date() })
        .where(eq(appSettings.key, BACKUP_SETTINGS_KEY));
    } else {
      await db.insert(appSettings).values({
        key: BACKUP_SETTINGS_KEY,
        value: settingsValue,
      });
    }
  } catch (error) {
    console.error("[Backup] Failed to save settings:", error);
  }
}

export function getBackupSettings(): BackupSettings {
  return { maxBackups, autoBackupIntervalHours };
}

export async function updateBackupSettings(settings: Partial<BackupSettings>): Promise<BackupSettings> {
  let maxBackupsChanged = false;
  if (settings.maxBackups !== undefined && settings.maxBackups >= 5 && settings.maxBackups <= 100) {
    if (settings.maxBackups !== maxBackups) {
      maxBackups = settings.maxBackups;
      maxBackupsChanged = true;
    }
  }
  if (settings.autoBackupIntervalHours !== undefined && settings.autoBackupIntervalHours >= 1 && settings.autoBackupIntervalHours <= 24) {
    autoBackupIntervalHours = settings.autoBackupIntervalHours;
    restartScheduledBackups();
  }
  await saveSettingsToDb();
  
  if (maxBackupsChanged) {
    await cleanupOldBackups();
  }
  
  return getBackupSettings();
}

function restartScheduledBackups(): void {
  if (scheduledBackupTimer) {
    clearInterval(scheduledBackupTimer);
    scheduledBackupTimer = null;
  }
  const intervalMs = autoBackupIntervalHours * 60 * 60 * 1000;
  scheduledBackupTimer = setInterval(runScheduledBackup, intervalMs);
  console.log(`[Backup] Scheduled backups updated (every ${autoBackupIntervalHours} hours)`);
}

export async function initializeBackupService(): Promise<void> {
  await loadSettingsFromDb();
}

function computeChecksum(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function compressData(jsonString: string): string {
  const compressed = gzipSync(Buffer.from(jsonString, "utf-8"), { level: 9 });
  return compressed.toString("base64");
}

function decompressData(base64Data: string): string {
  const buffer = Buffer.from(base64Data, "base64");
  const decompressed = gunzipSync(buffer, { maxOutputLength: 100 * 1024 * 1024 });
  return decompressed.toString("utf-8");
}

async function getNextVersionNumber(): Promise<number> {
  const result = await db
    .select({ maxVersion: sql<number>`COALESCE(MAX(version_number), 0)` })
    .from(backups);
  return (result[0]?.maxVersion || 0) + 1;
}

async function cleanupOldBackups(): Promise<void> {
  const allBackups = await db
    .select({ id: backups.id })
    .from(backups)
    .orderBy(desc(backups.versionNumber));

  if (allBackups.length > maxBackups) {
    const toDelete = allBackups.slice(maxBackups);
    for (const backup of toDelete) {
      await db.delete(backups).where(eq(backups.id, backup.id));
    }
  }
}

export async function createBackup(
  triggerType: TriggerType,
  description?: string
): Promise<BackupSummary> {
  const backupData = await db.transaction(async tx => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    return collectBackupData(tx);
  });

  const jsonString = JSON.stringify(backupData);
  const originalSize = Buffer.byteLength(jsonString, "utf-8");
  if (originalSize > 100 * 1024 * 1024) throw new Error("Backup exceeds the 100 MB uncompressed limit");
  const compressedData = compressData(jsonString);
  const compressedSize = Buffer.byteLength(compressedData, "utf-8");
  const checksum = computeChecksum(jsonString);

  const versionNumber = await getNextVersionNumber();

  const entityCounts = backupCounts(backupData);

  const [inserted] = await db
    .insert(backups)
    .values({
      versionNumber,
      triggerType,
      description: description || `${triggerType} backup`,
      compressedData,
      originalSize,
      compressedSize,
      checksum,
      entityCounts,
    })
    .returning();

  await cleanupOldBackups();

  return {
    id: inserted.id,
    versionNumber: inserted.versionNumber,
    createdAt: inserted.createdAt,
    triggerType: inserted.triggerType,
    description: inserted.description,
    originalSize: inserted.originalSize,
    compressedSize: inserted.compressedSize,
    compressionRatio: Math.round((1 - compressedSize / originalSize) * 100),
    entityCounts,
  };
}

export async function listBackups(): Promise<BackupSummary[]> {
  const allBackups = await db
    .select({
      id: backups.id,
      versionNumber: backups.versionNumber,
      createdAt: backups.createdAt,
      triggerType: backups.triggerType,
      description: backups.description,
      originalSize: backups.originalSize,
      compressedSize: backups.compressedSize,
      entityCounts: backups.entityCounts,
    })
    .from(backups)
    .orderBy(desc(backups.versionNumber));

  return allBackups.map((b) => ({
    ...b,
    compressionRatio: Math.round((1 - b.compressedSize / b.originalSize) * 100),
    entityCounts: (b.entityCounts as Record<string, number>) || {},
  }));
}

export async function getBackupById(id: number): Promise<BackupData | null> {
  const [backup] = await db.select().from(backups).where(eq(backups.id, id));
  if (!backup) return null;

  const jsonString = decompressData(backup.compressedData);
  const storedChecksum = backup.checksum;
  const computedChecksum = computeChecksum(jsonString);

  if (storedChecksum !== computedChecksum) {
    throw new Error("Backup integrity check failed: checksum mismatch");
  }

  const data = JSON.parse(jsonString);
  validateBackupData(data);
  return data;
}

export async function exportBackup(id: number): Promise<{ filename: string; data: Buffer }> {
  const [backup] = await db.select().from(backups).where(eq(backups.id, id));
  if (!backup) throw new Error("Backup not found");

  const jsonString = decompressData(backup.compressedData);
  const computedChecksum = computeChecksum(jsonString);

  if (backup.checksum !== computedChecksum) {
    throw new Error("Backup integrity check failed");
  }

  const exportData = {
    metadata: {
      versionNumber: backup.versionNumber,
      createdAt: backup.createdAt,
      triggerType: backup.triggerType,
      description: backup.description,
      checksum: backup.checksum,
    },
    data: JSON.parse(jsonString),
  };

  const exportBuffer = gzipSync(Buffer.from(JSON.stringify(exportData), "utf-8"), { level: 9 });
  const filename = `backup_v${backup.versionNumber}_${new Date().toISOString().split("T")[0]}.backup`;

  return { filename, data: exportBuffer };
}

export async function getRestorePreview(id: number): Promise<RestorePreview> {
  const backupData = await getBackupById(id);
  if (!backupData) throw new Error("Backup not found");

  return {
    entityCounts: backupCounts(backupData),
    formatVersion: backupData.version,
    preservedCollections: Object.keys(backupTables).filter(key => !Object.hasOwn(backupData.data, key)),
    limitations: [
      "Uploaded files and external URLs are referenced, not copied; keep their storage available.",
      "Login accounts, sessions, credentials, database schema, and backup history are not replaced.",
      "Notes and saved contact views are included once synchronized from a signed-in browser.",
    ],
  };
}

export async function restoreBackup(id: number): Promise<{ success: boolean; message: string }> {
  const backupData = await getBackupById(id);
  if (!backupData) throw new Error("Backup not found");

  await createBackup("SYSTEM", `Pre-restore safety backup (restoring from v${id})`);

  try {
    await db.transaction(async (tx) => {
      await restoreBackupData(tx, backupData);
      // Not included in snapshots: it marks a restore operation, not user data.
      await tx.insert(appSettings).values({
        key: "browser_backup_restore_epoch", value: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: appSettings.key, set: { value: new Date().toISOString(), updatedAt: new Date() },
      });
    });

    await loadSettingsFromDb();
    if (scheduledBackupTimer) restartScheduledBackups();
    return { success: true, message: "Restore completed successfully" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error during restore";
    return { success: false, message: `Restore failed: ${message}` };
  }
}

export function decodeBackupExport(fileBuffer: Buffer): { metadata: Record<string, any>; data: BackupData } {
  const decoded = JSON.parse(gunzipSync(fileBuffer, { maxOutputLength: 100 * 1024 * 1024 }).toString('utf-8'));
  if (!decoded.metadata || !decoded.data) throw new Error('Invalid backup file format');
  validateBackupData(decoded.data);
  const checksum = computeChecksum(JSON.stringify(decoded.data));
  if (typeof decoded.metadata.checksum !== 'string' || decoded.metadata.checksum !== checksum) {
    throw new Error('Imported backup checksum mismatch');
  }
  return decoded;
}

export async function importBackup(
  fileBuffer: Buffer
): Promise<{ success: boolean; backupId?: number; message: string }> {
  try {
    const importData = decodeBackupExport(fileBuffer);
    const backupData = importData.data;
    const jsonString = JSON.stringify(backupData);
    const computedChecksum = computeChecksum(jsonString);

    const originalSize = Buffer.byteLength(jsonString, "utf-8");
    const compressedData = compressData(jsonString);
    const compressedSize = Buffer.byteLength(compressedData, "utf-8");

    const versionNumber = await getNextVersionNumber();

    const entityCounts = backupCounts(backupData);

    const [inserted] = await db
      .insert(backups)
      .values({
        versionNumber,
        triggerType: "MANUAL",
        description: `Imported backup (original v${importData.metadata.versionNumber || "unknown"})`,
        compressedData,
        originalSize,
        compressedSize,
        checksum: computedChecksum,
        entityCounts,
      })
      .returning();

    return {
      success: true,
      backupId: inserted.id,
      message: `Backup imported successfully as version ${versionNumber}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error during import";
    return { success: false, message: `Import failed: ${message}` };
  }
}

export async function deleteBackup(id: number): Promise<void> {
  await db.delete(backups).where(eq(backups.id, id));
}

export async function triggerAutoBackup(reason: string): Promise<BackupSummary> {
  return createBackup("AUTO", reason);
}

async function runScheduledBackup(): Promise<void> {
  try {
    console.log("[Backup] Running scheduled backup...");
    await createBackup("AUTO", "Scheduled periodic backup");
    console.log("[Backup] Scheduled backup completed successfully");
  } catch (error) {
    console.error("[Backup] Scheduled backup failed:", error);
  }
}

export function startScheduledBackups(): void {
  if (scheduledBackupTimer) {
    clearInterval(scheduledBackupTimer);
  }
  
  const intervalMs = autoBackupIntervalHours * 60 * 60 * 1000;
  scheduledBackupTimer = setInterval(runScheduledBackup, intervalMs);
  console.log(`[Backup] Scheduled backups enabled (every ${autoBackupIntervalHours} hours)`);
}

export function stopScheduledBackups(): void {
  if (scheduledBackupTimer) {
    clearInterval(scheduledBackupTimer);
    scheduledBackupTimer = null;
    console.log("[Backup] Scheduled backups disabled");
  }
}
