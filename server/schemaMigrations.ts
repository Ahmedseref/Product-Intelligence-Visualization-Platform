// ─────────────────────────────────────────────────────────────────────────────
// Startup schema migrations
// ─────────────────────────────────────────────────────────────────────────────
// Runs idempotent SQL fixups on boot to handle schema drifts that
// drizzle-kit push cannot apply automatically — typically type changes
// that require a USING clause (e.g. text → jsonb conversions).
//
// Each migration must:
//   1. Inspect the live schema first (information_schema) and bail out
//      cleanly when the target shape is already present, so re-running on
//      an already-migrated database is a no-op.
//   2. Use a safe USING clause that preserves existing data.
//   3. Log clearly so deploy logs show what (if anything) ran.
//
// Add new migrations to the bottom of `runStartupMigrations`.
// ─────────────────────────────────────────────────────────────────────────────
import { sql } from "drizzle-orm";
import { db } from "./db";

// systems.system_substrate started life as a plain text column holding a
// single substrate label, then was widened to jsonb (string[]) when systems
// gained multi-substrate support. drizzle-kit push refuses to convert text
// → jsonb automatically because Postgres needs an explicit cast, which
// causes the production republish migration to fail. This converts in
// place, wrapping any non-empty existing scalar value as a one-element
// jsonb array and mapping NULL / empty string to NULL.
async function migrateSystemSubstrateToJsonb(): Promise<void> {
  const result = await db.execute(sql`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_name = 'systems' AND column_name = 'system_substrate'
  `);
  const rows = (result as unknown as { rows: Array<{ data_type: string }> }).rows
    ?? (result as unknown as Array<{ data_type: string }>);
  const dataType = rows?.[0]?.data_type;

  if (!dataType) {
    // Column missing — nothing to migrate (table may not exist yet on a
    // fresh database; drizzle-kit push will create it as jsonb directly).
    return;
  }
  if (dataType === "jsonb") {
    // Already migrated. No-op.
    return;
  }

  console.log(
    `[SchemaMigrations] Converting systems.system_substrate from "${dataType}" → jsonb…`,
  );
  await db.execute(sql`
    ALTER TABLE systems
    ALTER COLUMN system_substrate TYPE jsonb
    USING CASE
      WHEN system_substrate IS NULL OR system_substrate = '' THEN NULL
      ELSE to_jsonb(ARRAY[system_substrate])
    END
  `);
  console.log(
    `[SchemaMigrations] systems.system_substrate is now jsonb (existing values wrapped as single-element arrays).`,
  );
}

// Public entry point — called from server/index.ts during boot. Failures
// here are logged but not fatal, so a transient DB hiccup during startup
// doesn't crash-loop the server. The next boot will retry.
export async function runStartupMigrations(): Promise<void> {
  try {
    await migrateSystemSubstrateToJsonb();
  } catch (err) {
    console.error("[SchemaMigrations] Migration failed:", err);
  }
}
