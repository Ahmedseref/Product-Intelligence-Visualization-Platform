-- Align the DB-level cross-company guard with the application's name
-- normalization contract (shared/companyNormalization.ts):
--   Unicode NFC → trim → collapse whitespace → lowercase.
--
-- Migration 0002 omitted the NFC step, so composed vs decomposed Unicode
-- spellings of the same company name were treated as *different* companies by
-- the constraint while the application resolved them to the same shared code
-- — producing an unresolvable 23P01 conflict. Recreate the constraint with
-- normalize(..., NFC) so both layers agree.
--
-- Idempotent and migration-safe for databases where 0002 already ran.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_supplier_code_one_company;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_supplier_code_one_company
  EXCLUDE USING gist (
    supplier_code WITH =,
    (lower(btrim(regexp_replace(normalize(name, NFC), '\s+', ' ', 'g')))) WITH <>
  )
  WHERE (supplier_code IS NOT NULL AND btrim(supplier_code) <> '');
