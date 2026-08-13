// Applies all pending SQL migrations from ./migrations against DATABASE_URL.
// Usage: npm run db:migrate
import "dotenv/config";
import { runMigrations } from "../server/migrate";
import { pool } from "../server/db";

runMigrations()
  .then(({ applied }) => {
    if (applied.length === 0) {
      console.log("[Migrations] Database is up to date — nothing to apply.");
    } else {
      console.log(`[Migrations] Applied ${applied.length} migration(s): ${applied.join(", ")}`);
    }
  })
  .catch((error) => {
    console.error("[Migrations] Failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
