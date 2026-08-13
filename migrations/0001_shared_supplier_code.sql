-- Shared supplier codes: contacts belonging to the same company share one
-- supplier code, so supplier_code can no longer be globally unique.
--
-- 1. Drop the unique constraint (or unique index, depending on how the
--    schema was originally created).
-- 2. Add a plain non-unique index to keep code lookups fast.
--
-- Idempotent: safe to run on databases where the change was already applied.

ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_supplier_code_unique;
DROP INDEX IF EXISTS suppliers_supplier_code_unique;
CREATE INDEX IF NOT EXISTS idx_suppliers_supplier_code ON suppliers (supplier_code);
