// ─────────────────────────────────────────────────────────────────────────────
// Primer Groups API
// Named bundles of primer_library entries. Created and managed from the
// Primer Library tab. The system's adaptive primer slot consumes them as
// one-click "use this set" pins — picking a group sets the layer's
// default_primer_library_id to the group's default member.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { db } from "./db";
import { primerGroups, primerLibrary } from "@shared/schema";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { authMiddleware, requirePasswordChange } from "./authRoutes";
import { refreshState } from "./refreshState";

async function nextGroupId(): Promise<string> {
  const result = await db.execute(sql`
    SELECT COALESCE(
      MAX(CAST(REGEXP_REPLACE(group_id, '[^0-9]', '', 'g') AS INTEGER)),
      0
    ) AS max_id
    FROM primer_groups
    WHERE group_id ~ '^PG-[0-9]+$'
  `);
  const row = (result as any).rows?.[0] || (result as any)[0] || { max_id: 0 };
  const next = (Number(row.max_id) || 0) + 1;
  return `PG-${String(next).padStart(4, "0")}`;
}

// Validate a list of primerLibrary.primerId values: every member must
// exist and still be active. Returns an error string on failure, null on ok.
async function validateMembers(ids: string[]): Promise<string | null> {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const rows = await db
    .select({ primerId: primerLibrary.primerId })
    .from(primerLibrary)
    .where(and(inArray(primerLibrary.primerId, ids), eq(primerLibrary.isActive, true)));
  const found = new Set(rows.map(r => r.primerId));
  const missing = ids.filter(id => !found.has(id));
  if (missing.length) return `Unknown or inactive primer(s): ${missing.join(", ")}`;
  return null;
}

export function registerPrimerGroupRoutes(app: Express): void {
  app.use("/api/primer-groups", authMiddleware, requirePasswordChange);

  // GET /api/primer-groups — list active groups, newest first.
  app.get("/api/primer-groups", async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(primerGroups)
        .where(eq(primerGroups.isActive, true))
        .orderBy(desc(primerGroups.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("Error fetching primer groups:", err);
      res.status(500).json({ error: "Failed to fetch primer groups" });
    }
  });

  // POST /api/primer-groups — create. Members optional; default optional
  // but if provided must be one of the listed members.
  app.post("/api/primer-groups", async (req, res) => {
    try {
      const { name, description, primerLibraryIds, defaultPrimerLibraryId } = req.body || {};
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name is required" });
      }
      const members = Array.isArray(primerLibraryIds)
        ? primerLibraryIds.filter((x: any) => typeof x === "string")
        : [];
      if (members.length === 0) {
        return res.status(400).json({ error: "A group must contain at least one primer" });
      }
      const memberErr = await validateMembers(members);
      if (memberErr) return res.status(400).json({ error: memberErr });
      if (defaultPrimerLibraryId && !members.includes(defaultPrimerLibraryId)) {
        return res.status(400).json({ error: "defaultPrimerLibraryId must be one of the group's members" });
      }

      const groupId = await nextGroupId();
      const [created] = await db
        .insert(primerGroups)
        .values({
          groupId,
          name: name.trim(),
          description: description ?? null,
          primerLibraryIds: members,
          defaultPrimerLibraryId: defaultPrimerLibraryId ?? null,
          isActive: true,
        })
        .returning();
      refreshState.trigger();
      res.status(201).json(created);
    } catch (err) {
      console.error("Error creating primer group:", err);
      res.status(500).json({ error: "Failed to create primer group" });
    }
  });

  // PATCH /api/primer-groups/:id — partial update with the same checks.
  app.patch("/api/primer-groups/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

      const [existing] = await db.select().from(primerGroups).where(eq(primerGroups.id, id));
      if (!existing) return res.status(404).json({ error: "Not found" });

      const patch: Record<string, any> = {};
      if ("name" in req.body) patch.name = String(req.body.name).trim();
      if ("description" in req.body) patch.description = req.body.description ?? null;
      if ("primerLibraryIds" in req.body) {
        patch.primerLibraryIds = Array.isArray(req.body.primerLibraryIds)
          ? req.body.primerLibraryIds.filter((x: any) => typeof x === "string")
          : [];
      }
      if ("defaultPrimerLibraryId" in req.body) {
        patch.defaultPrimerLibraryId = req.body.defaultPrimerLibraryId ?? null;
      }

      const finalMembers: string[] = patch.primerLibraryIds ?? existing.primerLibraryIds ?? [];
      if (finalMembers.length === 0) {
        return res.status(400).json({ error: "A group must contain at least one primer" });
      }
      const memberErr = await validateMembers(finalMembers);
      if (memberErr) return res.status(400).json({ error: memberErr });

      const finalDefault: string | null =
        "defaultPrimerLibraryId" in patch ? patch.defaultPrimerLibraryId : existing.defaultPrimerLibraryId;
      if (finalDefault && !finalMembers.includes(finalDefault)) {
        // Silently clear stale default if the member was removed.
        patch.defaultPrimerLibraryId = null;
      }

      const [updated] = await db
        .update(primerGroups)
        .set(patch)
        .where(eq(primerGroups.id, id))
        .returning();
      refreshState.trigger();
      res.json(updated);
    } catch (err) {
      console.error("Error updating primer group:", err);
      res.status(500).json({ error: "Failed to update primer group" });
    }
  });

  // DELETE /api/primer-groups/:id — soft delete only.
  app.delete("/api/primer-groups/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
      const [updated] = await db
        .update(primerGroups)
        .set({ isActive: false })
        .where(eq(primerGroups.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      refreshState.trigger();
      res.json({ success: true });
    } catch (err) {
      console.error("Error deactivating primer group:", err);
      res.status(500).json({ error: "Failed to deactivate primer group" });
    }
  });
}
