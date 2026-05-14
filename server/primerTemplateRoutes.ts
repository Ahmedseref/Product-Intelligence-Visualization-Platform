// ─────────────────────────────────────────────────────────────────────────────
// Primer Templates API
// Saved snapshots of primer-resolution criteria (substrates / humidity /
// duty / system types + optional default primer pin). Created from an
// adaptive primer slot and applied to another system's slot to reuse the
// same configuration. Does not store layer relationships — applying a
// template just copies its defaultPrimerLibraryId onto the target layer.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { db } from "./db";
import { primerTemplates, primerLibrary } from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { authMiddleware, requirePasswordChange } from "./authRoutes";
import { refreshState } from "./refreshState";

async function nextTemplateId(): Promise<string> {
  const result = await db.execute(sql`
    SELECT COALESCE(
      MAX(CAST(REGEXP_REPLACE(template_id, '[^0-9]', '', 'g') AS INTEGER)),
      0
    ) AS max_id
    FROM primer_templates
    WHERE template_id ~ '^PT-[0-9]+$'
  `);
  const row = (result as any).rows?.[0] || (result as any)[0] || { max_id: 0 };
  const next = (Number(row.max_id) || 0) + 1;
  return `PT-${String(next).padStart(4, "0")}`;
}

export function registerPrimerTemplateRoutes(app: Express): void {
  app.use("/api/primer-templates", authMiddleware, requirePasswordChange);

  // GET /api/primer-templates — list active templates, newest first.
  app.get("/api/primer-templates", async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(primerTemplates)
        .where(eq(primerTemplates.isActive, true))
        .orderBy(desc(primerTemplates.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("Error fetching primer templates:", err);
      res.status(500).json({ error: "Failed to fetch primer templates" });
    }
  });

  // POST /api/primer-templates — create a new template. All filter fields
  // are optional except `name`; an empty filter set means "any primer".
  app.post("/api/primer-templates", async (req, res) => {
    try {
      const {
        name,
        substrates,
        humidityTolerance,
        dutyRating,
        compatibleSystemTypes,
        defaultPrimerLibraryId,
        notes,
      } = req.body || {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name is required" });
      }

      // Validate the optional pinned primer actually exists and is active.
      // We don't error on the apply path itself, just on save — once stored
      // the row is trusted by clients.
      if (defaultPrimerLibraryId) {
        const [pin] = await db
          .select({ id: primerLibrary.id })
          .from(primerLibrary)
          .where(and(eq(primerLibrary.primerId, String(defaultPrimerLibraryId)), eq(primerLibrary.isActive, true)));
        if (!pin) {
          return res.status(400).json({ error: "defaultPrimerLibraryId does not match an active primer" });
        }
      }

      const templateId = await nextTemplateId();
      const [created] = await db
        .insert(primerTemplates)
        .values({
          templateId,
          name: name.trim(),
          substrates: Array.isArray(substrates) ? substrates : [],
          humidityTolerance: humidityTolerance ?? null,
          dutyRating: dutyRating ?? null,
          compatibleSystemTypes: Array.isArray(compatibleSystemTypes) ? compatibleSystemTypes : [],
          defaultPrimerLibraryId: defaultPrimerLibraryId ?? null,
          notes: notes ?? null,
          isActive: true,
        })
        .returning();
      refreshState.trigger();
      res.status(201).json(created);
    } catch (err) {
      console.error("Error creating primer template:", err);
      res.status(500).json({ error: "Failed to create primer template" });
    }
  });

  // PATCH /api/primer-templates/:id — partial update.
  app.patch("/api/primer-templates/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

      const patch: Record<string, any> = {};
      const allowed = [
        "name",
        "substrates",
        "humidityTolerance",
        "dutyRating",
        "compatibleSystemTypes",
        "defaultPrimerLibraryId",
        "notes",
      ] as const;
      for (const key of allowed) {
        if (key in req.body) patch[key] = req.body[key];
      }

      if (patch.defaultPrimerLibraryId) {
        const [pin] = await db
          .select({ id: primerLibrary.id })
          .from(primerLibrary)
          .where(and(eq(primerLibrary.primerId, String(patch.defaultPrimerLibraryId)), eq(primerLibrary.isActive, true)));
        if (!pin) {
          return res.status(400).json({ error: "defaultPrimerLibraryId does not match an active primer" });
        }
      }

      const [updated] = await db
        .update(primerTemplates)
        .set(patch)
        .where(eq(primerTemplates.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      refreshState.trigger();
      res.json(updated);
    } catch (err) {
      console.error("Error updating primer template:", err);
      res.status(500).json({ error: "Failed to update primer template" });
    }
  });

  // DELETE /api/primer-templates/:id — soft delete only.
  app.delete("/api/primer-templates/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
      const [updated] = await db
        .update(primerTemplates)
        .set({ isActive: false })
        .where(eq(primerTemplates.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      refreshState.trigger();
      res.json({ success: true });
    } catch (err) {
      console.error("Error deactivating primer template:", err);
      res.status(500).json({ error: "Failed to deactivate primer template" });
    }
  });
}
