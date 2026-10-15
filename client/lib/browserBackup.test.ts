import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../api';
import { syncBrowserBackup } from './browserBackup';

test('browser backup migrates legacy notes, applies restored notes and empty states, and surfaces failures', async () => {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  const originalStorageEvent = globalThis.StorageEvent;
  const get = api.getBrowserBackup;
  const save = api.saveBrowserBackup;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'StorageEvent', { configurable: true, value: class extends Event {
    constructor(type: string, init: object) { super(type); Object.assign(this, init); }
  } });
  try {
    const notes = JSON.stringify({ notes: [{ id: 'old', text: '**Keep** [link](https://example.com)' }] });
    storage.set('floating-notes-widget', notes);
    let remote: Awaited<ReturnType<typeof api.getBrowserBackup>> = { epoch: '', state: null };
    const writes: unknown[] = [];
    api.getBrowserBackup = async () => remote;
    api.saveBrowserBackup = async (state, epoch) => { writes.push({ state, epoch }); };
    await syncBrowserBackup();
    assert.equal((writes[0] as any).state['floating-notes-widget'], notes);
    const restored = JSON.stringify({ notes: [{ id: 'restored', text: 'From backup' }] });
    remote = { epoch: 'restored-1', state: { 'floating-notes-widget': restored } };
    await syncBrowserBackup();
    assert.equal(storage.get('floating-notes-widget'), restored);
    remote = { epoch: 'restored-2', state: null };
    await syncBrowserBackup();
    assert.equal(storage.has('floating-notes-widget'), false, 'empty restored data must remove newer notes');
    storage.set('floating-notes-widget', notes);
    api.getBrowserBackup = async () => { throw new Error('offline'); };
    await assert.rejects(syncBrowserBackup(), /offline/);
    assert.equal(storage.get('floating-notes-widget'), notes, 'sync failure must keep local data');
  } finally {
    api.getBrowserBackup = get;
    api.saveBrowserBackup = save;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
    Object.defineProperty(globalThis, 'StorageEvent', { configurable: true, value: originalStorageEvent });
  }
});
