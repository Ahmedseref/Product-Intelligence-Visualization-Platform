import { useEffect, useState } from 'react';
import { syncBrowserBackup } from '../../client/lib/browserBackup';

/** Mounted only in the authenticated app, so no credentials enter snapshots. */
export default function BrowserBackupSync() {
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    const sync = async () => {
      if (busy) return;
      busy = true;
      try {
        await syncBrowserBackup();
        if (!cancelled) setError('');
      } catch {
        if (!cancelled) setError('Notes and saved contact views are not synchronized for backup. Changes remain in this browser; retrying automatically.');
      } finally { busy = false; }
    };
    void sync();
    const interval = window.setInterval(sync, 10000);
    window.addEventListener('browser-backup-changed', sync);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('browser-backup-changed', sync);
    };
  }, []);
  return error ? <div role="alert" className="fixed bottom-3 left-3 z-[110] max-w-sm rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 shadow-lg">{error}</div> : null;
}
