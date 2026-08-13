import fs from "fs";
import path from "path";
import { pool } from "./db";

/**
 * Minimal SQL migration runner.
 *
 * Applies every `migrations/*.sql` file in filename order, exactly once per
 * database, tracked in a `schema_migrations` table. Runs are serialized with
 * a Postgres advisory lock so concurrent server instances cannot double-apply.
 *
 * Invoked automatically during server startup (see server/index.ts) and
 * available manually via `npm run db:migrate`.
 */
export async function runMigrations(): Promise<{ applied: string[] }> {
  const dir = path.resolve(process.cwd(), "migrations");
  if (!fs.existsSync(dir)) return { applied: [] };

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) return { applied: [] };

  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query("SELECT pg_advisory_lock(hashtext('schema_migrations'))");
    try {
      for (const file of files) {
        const { rows } = await client.query(
          "SELECT 1 FROM schema_migrations WHERE name = $1",
          [file],
        );
        if (rows.length > 0) continue;

        const sqlText = fs.readFileSync(path.join(dir, file), "utf8");
        await client.query("BEGIN");
        try {
          await client.query(sqlText);
          await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
          await client.query("COMMIT");
          applied.push(file);
          console.log(`[Migrations] Applied ${file}`);
        } catch (error) {
          await client.query("ROLLBACK");
          throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('schema_migrations'))");
    }
  } finally {
    client.release();
  }
  return { applied };
}
