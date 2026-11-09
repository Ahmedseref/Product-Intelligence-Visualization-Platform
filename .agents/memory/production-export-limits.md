---
name: Large production exports
description: Avoid query-output, notebook-memory, and per-block I/O limits when exporting published business data.
---

For large read-only production exports, fetch bounded chunks and immediately save each chunk to ignored generated-output storage. Keep only control metadata in the persistent notebook. Verify that every chunk has the same whole-dataset digest, then verify the assembled payload before delivering it.

**Why:** A multi-megabyte query result can fail at the query tool's output limit. Retaining the complete base64 export together with callback responses can exceed the notebook's 32 MiB memory limit and reset its state. A single execution block can also exceed its 3 MB file-operation budget even when individual chunks are modest.

**How to apply:** Use small execution blocks (two roughly 350 KB chunks per block worked), persist progress to disk, and avoid logging raw contact/business data. Use a fixed export timestamp and stable row ordering so repeated read-only SELECTs have comparable whole-dataset digests. If data changes between chunks, discard the inconsistent export and retry; do not silently combine different snapshots. Verify app-format checksums and test SQL imports in temporary tables, never against live data.
