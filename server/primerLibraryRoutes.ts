// ─────────────────────────────────────────────────────────────────────────────
// Primer Library API
// CRUD + a `resolve` endpoint that the System Builder's adaptive primer
// slot calls to ask "given this system's substrate / humidity / type, which
// primers from the library will serve?". Auto-generates PL-XXXX ids.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { db } from "./db";
import { primerLibrary, products } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authMiddleware, requirePasswordChange } from "./authRoutes";
import { refreshState } from "./refreshState";

// Find the next sequential PL-XXXX id by extracting the numeric suffix from
// every existing primer_id and taking MAX+1. Falls back to 1 on first row.
async function nextPrimerId(): Promise<string> {
  const result = await db.execute(sql`
    SELECT COALESCE(
      MAX(CAST(REGEXP_REPLACE(primer_id, '[^0-9]', '', 'g') AS INTEGER)),
      0
    ) AS max_id
    FROM primer_library
    WHERE primer_id ~ '^PL-[0-9]+$'
  `);
  const row = (result as any).rows?.[0] || (result as any)[0] || { max_id: 0 };
  const next = (Number(row.max_id) || 0) + 1;
  return `PL-${String(next).padStart(4, "0")}`;
}

export function registerPrimerLibraryRoutes(app: Express): void {
  app.use("/api/primer-library", authMiddleware, requirePasswordChange);

  // GET /api/primer-library
  // Lists active primer library entries with optional filters. The filters
  // are applied in JS rather than SQL because compatibleSubstrates and
  // compatibleSystemTypes are jsonb arrays — equality there is fiddly with
  // Drizzle and the library is small enough that scanning is cheap.
  app.get("/api/primer-library", async (req, res) => {
    try {
      const { substrate, humidity, systemType, search } = req.query as {
        substrate?: string;
        humidity?: string;
        systemType?: string;
        search?: string;
      };

      const rows = await db
        .select()
        .from(primerLibrary)
        .where(eq(primerLibrary.isActive, true))
        .orderBy(desc(primerLibrary.createdAt));

      const filtered = rows.filter((r) => {
        if (substrate && !(r.compatibleSubstrates || []).includes(substrate)) return false;
        if (humidity && r.humidityTolerance !== humidity) return false;
        if (systemType && !(r.compatibleSystemTypes || []).includes(systemType)) return false;
        if (search) {
          const q = search.toLowerCase();
          const hay = `${r.productName || ""} ${r.supplier || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      res.json(filtered);
    } catch (err) {
      console.error("Error fetching primer library:", err);
      res.status(500).json({ error: "Failed to fetch primer library" });
    }
  });

  // GET /api/primer-library/resolve
  // The hot endpoint: returns the primers that match the supplied system
  // context. Sorted so exact humidity matches come first, then everything
  // else that matches substrate/systemType. When a filter is omitted it
  // does not constrain the result (so calling with no params returns all
  // active primers, useful for previews while parameters are being chosen).
  app.get("/api/primer-library/resolve", async (req, res) => {
    try {
      const { substrate, humidity, systemType } = req.query as {
        substrate?: string;
        humidity?: string;
        systemType?: string;
      };

      const rows = await db
        .select()
        .from(primerLibrary)
        .where(eq(primerLibrary.isActive, true));

      const matched = rows.filter((r) => {
        if (substrate && !(r.compatibleSubstrates || []).includes(substrate)) return false;
        if (systemType && !(r.compatibleSystemTypes || []).includes(systemType)) return false;
        // Humidity is intentionally NOT a hard filter — we still want to
        // surface near-matches so the UI can show "alternatives". Exact
        // matches are simply ranked first below.
        return true;
      });

      matched.sort((a, b) => {
        const aExact = humidity && a.humidityTolerance === humidity ? 0 : 1;
        const bExact = humidity && b.humidityTolerance === humidity ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return (a.productName || "").localeCompare(b.productName || "");
      });

      // When humidity is provided, only return rows that actually match it
      // OR have no humidity set (treated as universal). This prevents the
      // "alternatives" leak from above polluting strict resolves.
      const final = humidity
        ? matched.filter((r) => !r.humidityTolerance || r.humidityTolerance === humidity)
        : matched;

      res.json(final);
    } catch (err) {
      console.error("Error resolving primer library:", err);
      res.status(500).json({ error: "Failed to resolve primer library" });
    }
  });

  // POST /api/primer-library
  // Creates a new entry. Looks up productName + supplier from products to
  // denormalise; if the product is not found we still create the entry but
  // with null display fields (the UI will show productId).
  app.post("/api/primer-library", async (req, res) => {
    try {
      const {
        productId,
        compatibleSubstrates,
        humidityTolerance,
        compatibleSystemTypes,
        notes,
      } = req.body || {};

      if (!productId || typeof productId !== "string") {
        return res.status(400).json({ error: "productId is required" });
      }
      if (!Array.isArray(compatibleSubstrates) || compatibleSubstrates.length === 0) {
        return res.status(400).json({ error: "At least one substrate is required" });
      }
      if (!humidityTolerance) {
        return res.status(400).json({ error: "humidityTolerance is required" });
      }
      if (!Array.isArray(compatibleSystemTypes) || compatibleSystemTypes.length === 0) {
        return res.status(400).json({ error: "At least one system type is required" });
      }

      const [product] = await db.select().from(products).where(eq(products.productId, productId));

      const primerId = await nextPrimerId();
      const [created] = await db
        .insert(primerLibrary)
        .values({
          primerId,
          productId,
          productName: product?.name ?? null,
          supplier: product?.supplier ?? null,
          compatibleSubstrates,
          humidityTolerance,
          compatibleSystemTypes,
          layerPosition: "primer",
          notes: notes ?? null,
          isActive: true,
        })
        .returning();
      refreshState.trigger();
      res.status(201).json(created);
    } catch (err) {
      console.error("Error creating primer library entry:", err);
      res.status(500).json({ error: "Failed to create primer library entry" });
    }
  });

  // PATCH /api/primer-library/:id
  // Partial update. If productId changes we re-sync the denormalised
  // productName + supplier so the list view stays correct.
  app.patch("/api/primer-library/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

      const patch: Record<string, any> = {};
      const allowed = [
        "productId",
        "compatibleSubstrates",
        "humidityTolerance",
        "compatibleSystemTypes",
        "notes",
      ] as const;
      for (const key of allowed) {
        if (key in req.body) patch[key] = req.body[key];
      }

      if (patch.productId) {
        const [product] = await db
          .select()
          .from(products)
          .where(eq(products.productId, patch.productId));
        patch.productName = product?.name ?? null;
        patch.supplier = product?.supplier ?? null;
      }

      const [updated] = await db
        .update(primerLibrary)
        .set(patch)
        .where(eq(primerLibrary.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      refreshState.trigger();
      res.json(updated);
    } catch (err) {
      console.error("Error updating primer library entry:", err);
      res.status(500).json({ error: "Failed to update primer library entry" });
    }
  });

  // DELETE /api/primer-library/:id
  // Soft delete only — sets isActive=false. We never hard-delete because
  // adaptive layers may pin a primerId in default_primer_library_id and
  // would break silently if the row vanished.
  app.delete("/api/primer-library/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
      const [updated] = await db
        .update(primerLibrary)
        .set({ isActive: false })
        .where(eq(primerLibrary.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      refreshState.trigger();
      res.json({ success: true });
    } catch (err) {
      console.error("Error deactivating primer library entry:", err);
      res.status(500).json({ error: "Failed to deactivate primer library entry" });
    }
  });
}
