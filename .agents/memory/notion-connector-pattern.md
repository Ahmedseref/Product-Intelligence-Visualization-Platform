---
name: Notion connector integration pattern
description: How to call the Notion REST API through Replit's connector proxy for server-side sync jobs.
---

When integrating with a user's Notion workspace via the Replit Notion connector (`@replit/connectors-sdk`):

- Always construct a fresh `new ReplitConnectors()` instance per call/request and never cache the client or its token — the connector handles OAuth refresh transparently, and caching breaks that.
- Use `connectors.proxy("notion", path, init)` to hit raw Notion REST endpoints (e.g. `/v1/databases/{id}/query`, `/v1/pages`, `/v1/pages/{id}`) rather than instantiating the official `@notionhq/client` SDK directly — the proxy injects the correct auth headers.
- Notion requires the user to explicitly share a specific database with the integration from within Notion's UI (per-database sharing) — this can't be granted programmatically. Ask the user to do this before a first sync.
- Database IDs found via `/v1/search` are stable; safe to hardcode once resolved for a single fixed-database integration scope.
- For bidirectional sync with conflict resolution, track both `notionLastEditedTime` (from Notion's `last_edited_time`) and an app-side `appLastEditedTime` (bumped on every local write) — compare the two timestamps to decide which side wins per record, rather than a single global "last synced" timestamp.

**Why:** the Notion connector is a fresh, less-documented integration path in this codebase (first connector-based server module), and the token-caching and per-database-sharing gotchas are easy to miss and cause silent auth failures.

**How to apply:** any time you add server-side sync against a user's Notion workspace through the Replit connector.

- When adding newly-mapped columns to an already-synced table (e.g. expanding field coverage after the initial sync shipped), a normal `pullFromNotion()` run will skip already-synced pages because the conflict check compares `notionLastEditedTime` to the locally stored value, which hasn't changed — so the new columns stay empty for existing rows. Run a one-off backfill (temporarily export the internal page-fetch + mapping functions, iterate all existing linked rows, and `UPDATE` just the new columns directly) instead of relying on the regular sync loop to populate them.

**How to apply (backfill):** any time you extend field mapping on an already-populated Notion (or similar) sync integration and need existing rows to pick up the new columns immediately rather than waiting for their next real edit in the source system.
