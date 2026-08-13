import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadWithSeedReconciliation, SEEDED_MESSAGE } from './initialLoad';

// Simulates the server datastore + seed endpoint. The "database" starts in a
// configurable state; fetchAll snapshots whatever rows exist at call time.
function makeHarness(opts: { blankDb: boolean; seedDelayMs?: number; seedFails?: boolean }) {
  const state = {
    rows: opts.blankDb ? ([] as string[]) : ['existing-1', 'existing-2'],
    fetchSnapshots: [] as string[][],
    seedCalls: 0,
    fetchStarted: 0,
  };

  const seed = async (): Promise<{ message: string }> => {
    state.seedCalls += 1;
    if (opts.seedFails) throw new Error('seed unavailable');
    // Emulate the many sequential inserts taking real time.
    await new Promise((r) => setTimeout(r, opts.seedDelayMs ?? 20));
    if (state.rows.length === 0) {
      state.rows = ['seed-1', 'seed-2', 'seed-3'];
      return { message: SEEDED_MESSAGE };
    }
    return { message: 'Database already seeded' };
  };

  const fetchAll = async (): Promise<void> => {
    state.fetchStarted += 1;
    // Reads are fast — they can easily beat the seed inserts on a blank DB.
    await new Promise((r) => setTimeout(r, 1));
    state.fetchSnapshots.push([...state.rows]);
  };

  return { state, seed, fetchAll };
}

const flushBackground = () => new Promise((r) => setTimeout(r, 60));

describe('loadWithSeedReconciliation', () => {
  test('blank database: initial read is not blocked, and data populates after seed without an external refresh', async () => {
    const { state, seed, fetchAll } = makeHarness({ blankDb: true, seedDelayMs: 20 });
    const seededRef = { current: false };

    const start = Date.now();
    await loadWithSeedReconciliation({ seededRef, seed, fetchAll });
    const elapsed = Date.now() - start;

    // The awaited load must not wait for the 20ms seed.
    assert.ok(elapsed < 15, `initial load waited on seed (${elapsed}ms)`);
    // First snapshot raced the seed and may be empty — that is allowed.
    assert.equal(state.fetchSnapshots.length, 1);

    // After the background seed completes, a reconciling re-fetch must have
    // run on its own — no refresh-state poll, no manual action.
    await flushBackground();
    assert.equal(state.seedCalls, 1);
    assert.equal(state.fetchSnapshots.length, 2, 'expected an automatic post-seed re-fetch');
    assert.deepEqual(state.fetchSnapshots[1], ['seed-1', 'seed-2', 'seed-3']);
  });

  test('already-seeded database: exactly one fetch, no redundant re-fetch', async () => {
    const { state, seed, fetchAll } = makeHarness({ blankDb: false });
    const seededRef = { current: false };

    await loadWithSeedReconciliation({ seededRef, seed, fetchAll });
    await flushBackground();

    assert.equal(state.seedCalls, 1);
    assert.equal(state.fetchSnapshots.length, 1, 'no re-fetch expected when nothing was seeded');
    assert.deepEqual(state.fetchSnapshots[0], ['existing-1', 'existing-2']);
  });

  test('subsequent refresh cycles never re-fire the seed call', async () => {
    const { state, seed, fetchAll } = makeHarness({ blankDb: false });
    const seededRef = { current: false };

    await loadWithSeedReconciliation({ seededRef, seed, fetchAll });
    await flushBackground();
    await loadWithSeedReconciliation({ seededRef, seed, fetchAll });
    await loadWithSeedReconciliation({ seededRef, seed, fetchAll });

    assert.equal(state.seedCalls, 1);
    assert.equal(state.fetchSnapshots.length, 3);
  });

  test('seed failure is non-fatal, local data still loads, and seed retries on next load', async () => {
    const { state, seed, fetchAll } = makeHarness({ blankDb: false, seedFails: true });
    const seededRef = { current: false };
    let seedErrors = 0;

    await loadWithSeedReconciliation({
      seededRef, seed, fetchAll,
      onSeedError: () => { seedErrors += 1; },
    });
    await flushBackground();

    assert.equal(state.fetchSnapshots.length, 1, 'local read must succeed despite seed failure');
    assert.equal(seedErrors, 1);
    assert.equal(seededRef.current, false, 'failed seed must be retryable');

    await loadWithSeedReconciliation({
      seededRef, seed, fetchAll,
      onSeedError: () => { seedErrors += 1; },
    });
    await flushBackground();
    assert.equal(state.seedCalls, 2, 'seed retried after earlier failure');
  });
});
