import { db } from "./db";
import { backups, products, suppliers, treeNodes, customFieldDefinitions, appSettings } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { gzipSync, gunzipSync } from "zlib";

export type TriggerType = "AUTO" | "MANUAL" | "SYSTEM";

export interface BackupData {
  version: string;
  createdAt: string;
  data: {
    products: any[];
    suppliers: any[];
    treeNodes: any[];
    customFieldDefinitions: any[];
    appSettings: any[];
  };
}

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
  products: number;
  suppliers: number;
  treeNodes: number;
  customFieldDefinitions: number;
  appSettings: number;
}

const BACKUP_VERSION = "1.0.0";
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
  const decompressed = gunzipSync(buffer);
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
  const [allProducts, allSuppliers, allTreeNodes, allCustomFields, allSettings] =
    await Promise.all([
      db.select().from(products),
      db.select().from(suppliers),
      db.select().from(treeNodes),
      db.select().from(customFieldDefinitions),
      db.select().from(appSettings),
    ]);

  const backupData: BackupData = {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    data: {
      products: allProducts,
      suppliers: allSuppliers,
      treeNodes: allTreeNodes,
      customFieldDefinitions: allCustomFields,
      appSettings: allSettings,
    },
  };

  const jsonString = JSON.stringify(backupData);
  const originalSize = Buffer.byteLength(jsonString, "utf-8");
  const compressedData = compressData(jsonString);
  const compressedSize = Buffer.byteLength(compressedData, "utf-8");
  const checksum = computeChecksum(jsonString);

  const versionNumber = await getNextVersionNumber();

  const entityCounts: Record<string, number> = {
    products: allProducts.length,
    suppliers: allSuppliers.length,
    treeNodes: allTreeNodes.length,
    customFieldDefinitions: allCustomFields.length,
    appSettings: allSettings.length,
  };

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

  return JSON.parse(jsonString) as BackupData;
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
    products: backupData.data.products.length,
    suppliers: backupData.data.suppliers.length,
    treeNodes: backupData.data.treeNodes.length,
    customFieldDefinitions: backupData.data.customFieldDefinitions.length,
    appSettings: backupData.data.appSettings.length,
  };
}

export async function restoreBackup(id: number): Promise<{ success: boolean; message: string }> {
  const backupData = await getBackupById(id);
  if (!backupData) throw new Error("Backup not found");

  await createBackup("SYSTEM", `Pre-restore safety backup (restoring from v${id})`);

  try {
    await db.transaction(async (tx) => {
      await tx.delete(products);
      await tx.delete(suppliers);
      await tx.delete(treeNodes);
      await tx.delete(customFieldDefinitions);
      await tx.delete(appSettings);

      if (backupData.data.treeNodes.length > 0) {
        await tx.insert(treeNodes).values(
          backupData.data.treeNodes.map((n: any) => ({
            ...n,
            createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
            updatedAt: n.updatedAt ? new Date(n.updatedAt) : new Date(),
          }))
        );
      }

      if (backupData.data.suppliers.length > 0) {
        await tx.insert(suppliers).values(
          backupData.data.suppliers.map((s: any) => ({
            ...s,
            createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
            updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date(),
          }))
        );
      }

      if (backupData.data.products.length > 0) {
        await tx.insert(products).values(
          backupData.data.products.map((p: any) => ({
            ...p,
            dateAdded: p.dateAdded ? new Date(p.dateAdded) : new Date(),
            lastUpdated: p.lastUpdated ? new Date(p.lastUpdated) : new Date(),
          }))
        );
      }

      if (backupData.data.customFieldDefinitions.length > 0) {
        await tx.insert(customFieldDefinitions).values(
          backupData.data.customFieldDefinitions.map((c: any) => ({
            ...c,
            createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
          }))
        );
      }

      if (backupData.data.appSettings.length > 0) {
        await tx.insert(appSettings).values(
          backupData.data.appSettings.map((a: any) => ({
            ...a,
            updatedAt: a.updatedAt ? new Date(a.updatedAt) : new Date(),
          }))
        );
      }
    });

    return { success: true, message: "Restore completed successfully" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error during restore";
    return { success: false, message: `Restore failed: ${message}` };
  }
}

export async function importBackup(
  fileBuffer: Buffer
): Promise<{ success: boolean; backupId?: number; message: string }> {
  try {
    const decompressed = gunzipSync(fileBuffer);
    const importData = JSON.parse(decompressed.toString("utf-8"));

    if (!importData.metadata || !importData.data) {
      throw new Error("Invalid backup file format");
    }

    const backupData = importData.data as BackupData;
    const jsonString = JSON.stringify(backupData);
    const computedChecksum = computeChecksum(jsonString);

    if (importData.metadata.checksum && importData.metadata.checksum !== computedChecksum) {
      throw new Error("Imported backup checksum mismatch");
    }

    const originalSize = Buffer.byteLength(jsonString, "utf-8");
    const compressedData = compressData(jsonString);
    const compressedSize = Buffer.byteLength(compressedData, "utf-8");

    const versionNumber = await getNextVersionNumber();

    const entityCounts: Record<string, number> = {
      products: backupData.data.products.length,
      suppliers: backupData.data.suppliers.length,
      treeNodes: backupData.data.treeNodes.length,
      customFieldDefinitions: backupData.data.customFieldDefinitions.length,
      appSettings: backupData.data.appSettings.length,
    };

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
