// ─────────────────────────────────────────────────────────────────────────────
// Primer Library API
// CRUD + a `resolve` endpoint that the System Builder's adaptive primer
// slot calls to ask "given this system's substrate / humidity / type, which
// primers from the library will serve?". Auto-generates PL-XXXX ids.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { db } from "./db";
import { primerLibrary, products, treeNodes, qualificationVocabularies } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authMiddleware, requirePasswordChange } from "./authRoutes";
import { refreshState } from "./refreshState";
import {
  isHardExcluded,
  primerLibraryRowToTags,
  type LayerPosition,
} from "@shared/compatibilityEngine";

// Accept substrate as either a single value (?substrate=Concrete) or a
// comma-separated list (?substrate=Concrete,Steel). Returns an array;
// empty array means "any substrate".
function parseSubstrateParam(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.flatMap(v => parseSubstrateParam(v));
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

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
      const { substrate, humidity, duty, systemType, search } = req.query as {
        substrate?: string;
        humidity?: string;
        duty?: string;
        systemType?: string;
        search?: string;
      };

      // Left-join products to surface the latest description in addition
      // to the denormalised name/supplier already on the row. Description
      // is fetched live (not denormalised) so edits to the product
      // description show up here without a manual sync.
      const rows = await db
        .select({
          row: primerLibrary,
          productDescription: products.description,
        })
        .from(primerLibrary)
        .leftJoin(products, eq(products.productId, primerLibrary.productId))
        .where(eq(primerLibrary.isActive, true))
        .orderBy(desc(primerLibrary.createdAt));

      const flattened = rows.map(({ row, productDescription }) => ({
        ...row,
        productDescription: productDescription ?? null,
      }));

      const filtered = flattened.filter((r) => {
        if (substrate && !(r.compatibleSubstrates || []).includes(substrate)) return false;
        if (humidity && r.humidityTolerance !== humidity) return false;
        if (duty && r.dutyRating !== duty) return false;
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
  // context. Delegates the humidity/duty/substrate/position rules to the
  // shared compatibility engine so the client-side product pickers and
  // this server-side resolver stay in lock-step.
  //
  // `substrate` accepts a comma-separated list to support multi-substrate
  // systems (e.g. ?substrate=Concrete,Steel). systemType is still applied
  // here as a primer-library-specific filter against the row's
  // compatibleSystemTypes array (the engine's family rule is taxonomy-
  // derived and only meaningful client-side).
  app.get("/api/primer-library/resolve", async (req, res) => {
    try {
      const humidity = typeof req.query.humidity === "string" ? req.query.humidity : null;
      const duty = typeof req.query.duty === "string" ? req.query.duty : null;
      const systemType = typeof req.query.systemType === "string" ? req.query.systemType : null;
      const substrates = parseSubstrateParam(req.query.substrate);

      const joined = await db
        .select({
          row: primerLibrary,
          productDescription: products.description,
        })
        .from(primerLibrary)
        .leftJoin(products, eq(products.productId, primerLibrary.productId))
        .where(eq(primerLibrary.isActive, true));
      const rows = joined.map(({ row, productDescription }) => ({
        ...row,
        productDescription: productDescription ?? null,
      }));

      // Active layer position is always 'primer' for primer-library resolve,
      // which makes the engine apply the primer-slot strictness automatically.
      const ctx = {
        systemType: systemType,
        systemSubstrates: substrates,
        systemHumidity: humidity,
        systemDuty: duty,
        activeLayerPosition: 'primer' as LayerPosition,
      };

      const matched = rows.filter((r) => {
        // Primer-library-specific: hard filter on the row's declared
        // system-type compatibility. Rows with no compatibleSystemTypes
        // are treated as universal.
        if (systemType && r.compatibleSystemTypes && r.compatibleSystemTypes.length > 0) {
          if (!r.compatibleSystemTypes.includes(systemType)) return false;
        }
        // Engine handles substrate / humidity / duty exclusions uniformly.
        const tags = primerLibraryRowToTags(r);
        if (isHardExcluded(tags, ctx).excluded) return false;
        return true;
      });

      matched.sort((a, b) => {
        const aExact = humidity && a.humidityTolerance === humidity ? 0 : 1;
        const bExact = humidity && b.humidityTolerance === humidity ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return (a.productName || "").localeCompare(b.productName || "");
      });

      res.json(matched);
    } catch (err) {
      console.error("Error resolving primer library:", err);
      res.status(500).json({ error: "Failed to resolve primer library" });
    }
  });

  // GET /api/primer-library/coverage-chart
  // Returns every active primer joined with its product (for stock_code and
  // taxonomy-derived primer base) plus the substrate + humidity vocabularies
  // — everything the Primer Coverage Chart needs in one round-trip.
  // Primer base is derived here from name + description + taxonomy path; it
  // is NOT a stored column, so chart colors stay in sync with the latest
  // product data even when no one re-saves the library entry.
  app.get("/api/primer-library/coverage-chart", async (_req, res) => {
    try {
      // 1) Pull active primers with their product record for description +
      // stock code. Inactive rows are excluded so retired primers don't
      // pollute the chart.
      const rows = await db
        .select({ row: primerLibrary, product: products })
        .from(primerLibrary)
        .leftJoin(products, eq(products.productId, primerLibrary.productId))
        .where(eq(primerLibrary.isActive, true))
        .orderBy(desc(primerLibrary.createdAt));

      // 2) Build a taxonomy-path string per product by walking tree_nodes
      // from the product's nodeId up to the root. Done with a single
      // select-all to avoid N+1; the tree is small (hundreds of nodes max).
      const allNodes = await db
        .select({ nodeId: treeNodes.nodeId, name: treeNodes.name, parentId: treeNodes.parentId })
        .from(treeNodes);
      const nodeMap = new Map(allNodes.map(n => [n.nodeId, n] as const));
      const pathCache = new Map<string, string>();
      function pathFor(nodeId: string | null | undefined): string {
        if (!nodeId) return "";
        if (pathCache.has(nodeId)) return pathCache.get(nodeId)!;
        const parts: string[] = [];
        let cur = nodeMap.get(nodeId);
        const seen = new Set<string>(); // cycle guard
        while (cur && !seen.has(cur.nodeId)) {
          parts.unshift(cur.name);
          seen.add(cur.nodeId);
          cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined;
        }
        const p = parts.join(" > ");
        pathCache.set(nodeId, p);
        return p;
      }

      // Pure-function base detector — exact spec from the task brief.
      function detectPrimerBase(name: string, description: string, nodePath: string): string {
        const text = `${name || ""} ${description || ""}`.toLowerCase();
        const path = (nodePath || "").toLowerCase();
        if (text.includes("bitumen") || text.includes("bt primer") || path.includes("bitumen")) return "Bitumen";
        if ((text.includes("polyurethane") || text.includes(" pu ") || text.includes("pu primer") || text.includes("pur")) && !text.includes("epoxy")) return "PU";
        if (text.includes("silane") || text.includes("siloxane")) return "Silane";
        if (text.includes("acrylic") || text.includes("mma")) return "Acrylic";
        if (text.includes("epoxy") || text.includes("epx") || text.includes("epo")) return "Epoxy";
        return "Other";
      }

      const primers = rows.map(({ row, product }) => {
        const taxonomyPath = pathFor(product?.nodeId);
        return {
          primer_id: row.primerId,
          product_id: row.productId,
          // Stock code is the chart's identifier; fall back to primer_id if
          // the product has no stock code so a chip never renders blank.
          stock_code: (product?.stockCode || row.primerId || "").trim(),
          product_name: row.productName || product?.name || "",
          supplier: row.supplier || product?.supplier || "",
          taxonomy_path: taxonomyPath,
          compatible_substrates: row.compatibleSubstrates || [],
          humidity_tolerance: row.humidityTolerance || "",
          compatible_system_types: row.compatibleSystemTypes || [],
          primer_base: detectPrimerBase(product?.name || "", product?.description || "", taxonomyPath),
          is_active: row.isActive ?? true,
        };
      });

      // 3) Pull the closed-list vocabularies for axis ordering. We respect
      // the seeded sort_order so "Dry → Slightly Damp → Damp → Wet" stays
      // in the expected meteorological progression even if the DB row
      // order gets shuffled.
      const vocab = await db
        .select()
        .from(qualificationVocabularies)
        .where(eq(qualificationVocabularies.isActive, true));
      const substrates = vocab
        .filter(v => v.vocabType === "substrate")
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map(v => v.value);
      const humidities = vocab
        .filter(v => v.vocabType === "humidity")
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map(v => v.value);

      res.json({ primers, substrates, humidities });
    } catch (err: any) {
      console.error("Error building primer coverage chart:", err);
      res.status(500).json({ error: "Failed to build primer coverage chart", details: err?.message });
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
        dutyRating,
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
          dutyRating: dutyRating ?? null,
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
        "dutyRating",
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
