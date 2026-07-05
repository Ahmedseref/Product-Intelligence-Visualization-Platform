---
name: Notion sync fixed field mapping
description: Why new Notion properties don't automatically show up in the app, and where the mapping lives.
---

The Notion → app sync (`server/notionSync.ts`, function `notionPageToSupplier`) reads a **fixed, hardcoded list** of Notion property names and maps each to a specific typed column on the `suppliers` table. It is not a dynamic/schema-less sync.

**Why:** the app needs typed columns to support sorting, filtering, and structured display — a raw dynamic property bag can't power that UI cleanly. As a safety net, the full raw property payload is also stored verbatim in `notionRawProperties` (jsonb) so no data is silently lost even when unmapped.

**How to apply:**
- If a user adds a new property in Notion, it will land in `notionRawProperties` but will NOT appear in the table, filters, or the card-details peek modal until a developer adds an explicit mapping (schema column in `shared/schema.ts`, getter in `notionPageToSupplier`, and UI wiring in `components/SupplierManager.tsx`).
- Some Notion properties are formula/rollup-derived duplicates of other data — e.g. a Notion property named "Date" (type `last_edited_time`) was found to be exactly identical to the page's own `last_edited_time` (already captured as `notionLastEditedTime`). Before adding a new schema column for a "missing" property, check whether it's really just a duplicate of data already synced under a different name.
- Fields with genuinely empty values in the app (e.g. an "Updates" text property showing blank) are often just empty in the source Notion database itself, not a sync bug — verify by querying `notionRawProperties` directly before assuming a mapping is broken.
