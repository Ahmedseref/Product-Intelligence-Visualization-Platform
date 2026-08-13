// Coordinates the app's initial data load with the idempotent background
// seed call so that:
//  - the local-database read starts immediately and is NEVER blocked by
//    seeding or any other external work, and
//  - a fresh/empty database is reconciled deterministically: when the seed
//    endpoint reports that it actually inserted rows, the read is re-run so
//    the client does not sit on an incomplete first snapshot waiting for an
//    unrelated refresh cycle.

export const SEEDED_MESSAGE = "Database seeded successfully";

export interface LoadWithSeedOptions {
  /** Mutable flag shared across calls; prevents re-firing the seed request on every refresh. */
  seededRef: { current: boolean };
  /** Idempotent server seed call. Resolves with the server's message. */
  seed: () => Promise<{ message: string }>;
  /** Reads all datasets from the local database and commits them to state. */
  fetchAll: () => Promise<void>;
  /** Optional hook for observing background seed errors (non-fatal). */
  onSeedError?: (err: unknown) => void;
}

/**
 * Runs `fetchAll` immediately. On the first invocation, also fires `seed` in
 * the background; if the server reports it actually seeded the database,
 * `fetchAll` is re-run afterwards so the freshly inserted rows are picked up.
 *
 * The returned promise settles with the immediate `fetchAll` — callers are
 * never blocked on seeding. Background seed failures reset the seeded flag so
 * a later load attempt can retry.
 */
export async function loadWithSeedReconciliation(opts: LoadWithSeedOptions): Promise<void> {
  const { seededRef, seed, fetchAll, onSeedError } = opts;

  if (!seededRef.current) {
    seededRef.current = true;
    seed()
      .then((result) => {
        if (result && result.message === SEEDED_MESSAGE) {
          // The database was empty and has just been seeded — re-read so the
          // UI reconciles without waiting for an unrelated refresh.
          return fetchAll();
        }
      })
      .catch((err) => {
        // Allow a retry on the next load attempt.
        seededRef.current = false;
        onSeedError?.(err);
      });
  }

  await fetchAll();
}
