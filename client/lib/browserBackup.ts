import { api } from '../api';
import { BROWSER_BACKUP_KEYS, type BrowserBackupState } from '../../shared/browserBackup';

const EPOCH_STORAGE_KEY = 'browser-backup-epoch';
let inFlight: Promise<void> | null = null;
let lastSaved = '';

function readState(): BrowserBackupState {
  return Object.fromEntries(BROWSER_BACKUP_KEYS.map(key => [key, localStorage.getItem(key)]));
}

function applyState(state: BrowserBackupState | null) {
  for (const key of BROWSER_BACKUP_KEYS) {
    const next = state?.[key] ?? null;
    if (next === null) localStorage.removeItem(key);
    else localStorage.setItem(key, next);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: next }));
  }
  window.dispatchEvent(new Event('backup-restored'));
}

async function performSync() {
  const remote = await api.getBrowserBackup();
  const previousEpoch = localStorage.getItem(EPOCH_STORAGE_KEY) ?? '';
  if (remote.epoch !== previousEpoch) {
    // A server restore is authoritative, including deliberately empty notes.
    applyState(remote.state);
    lastSaved = '';
  } else if (remote.state && BROWSER_BACKUP_KEYS.every(key => localStorage.getItem(key) === null)) {
    applyState(remote.state);
  }
  localStorage.setItem(EPOCH_STORAGE_KEY, remote.epoch);
  const state = readState();
  const serialized = JSON.stringify(state);
  if (serialized !== lastSaved) {
    await api.saveBrowserBackup(state, remote.epoch);
    lastSaved = serialized;
  }
}

/** Used by automatic sync and flushed before a manual backup is created. */
export async function syncBrowserBackup(): Promise<void> {
  if (inFlight) await inFlight;
  inFlight = performSync();
  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}
