import { backfillExistingSupplierCodes } from "../server/stockCodeService";
import { pool } from "../server/db";

try {
  const result = await backfillExistingSupplierCodes();
  console.log(`Supplier code backfill complete: ${result.updated} updated, ${result.skipped} skipped.`);
} finally {
  await pool.end();
}