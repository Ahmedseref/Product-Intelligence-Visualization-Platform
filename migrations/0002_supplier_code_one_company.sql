-- Database-level guard for shared supplier codes.
--
-- Supplier codes are shared within a company (same normalized name) but must
-- never be shared across different companies. A plain UNIQUE constraint cannot
-- express this, so we use an exclusion constraint: two rows conflict when
-- their supplier_code is equal (=) AND their normalized company name differs
-- (<>). This makes concurrent inserts race-safe — if two requests generate the
-- same fresh code for different companies, exactly one insert succeeds and the
-- other fails with an exclusion violation (SQLSTATE 23P01) and is retried by
-- the application with a newly resolved code.
--
-- Normalization here (trim, collapse whitespace, lowercase) mirrors
-- shared/companyNormalization.ts.
--
-- Idempotent: safe to re-run.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_supplier_code_one_company;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_supplier_code_one_company
  EXCLUDE USING gist (
    supplier_code WITH =,
    (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) WITH <>
  )
  WHERE (supplier_code IS NOT NULL AND btrim(supplier_code) <> '');
