// =============================================================================
// selectorGuideRoutes.ts
// -----------------------------------------------------------------------------
// GET/PUT /api/selector-guide — persists the editable "Selector Guide by
// Application/Environment" matrix shown in the Analytics tab. The whole
// document is stored as a single JSON blob in `app_settings` (key =
// "selector_guide") so the user can freely add/remove systems and
// applications without schema migrations.
//
// First-load seeding fills the table with a realistic flooring-systems
// starter set (mirrors the PPG reference catalog the feature is modeled
// after) so the chart isn't empty on a fresh install.
// =============================================================================

import type { Express, Request, Response } from "express";
import { db } from "./db";
import { appSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { authMiddleware, requirePasswordChange } from "./authRoutes";

const SETTING_KEY = "selector_guide";

// Shape of the persisted document. Kept intentionally permissive on the
// server (we re-validate shape on write) so the client can evolve the
// schema (e.g. add per-cell colors) without a coordinated migration.
export type SelectorGuideDoc = {
  title: string;
  systems: { id: string; name: string; color: string }[];
  applications: { id: string; name: string }[];
  // Sparse map of "appId:sysId" → true. Absent key = no dot.
  cells: Record<string, boolean>;
};

// Default seed — modeled after the PPG flooring selector chart the
// feature replicates, but using generic chemistry-named columns so it's
// useful on day one regardless of brand.
const DEFAULT_DOC: SelectorGuideDoc = {
  title: "Selector Guide by Application / Environment",
  systems: [
    { id: "sys_general",    name: "General Purpose",       color: "#22C55E" },
    { id: "sys_wear",       name: "Wear Resistance",       color: "#38BDF8" },
    { id: "sys_chemical",   name: "Chemical Resistance",   color: "#F97316" },
    { id: "sys_esd",        name: "Electrostatic Protection", color: "#1E3A8A" },
    { id: "sys_urethane",   name: "Urethane Cement",       color: "#7C3AED" },
    { id: "sys_mma",        name: "Methyl Methacrylate (MMA)", color: "#0F766E" },
    { id: "sys_waterborne", name: "Waterborne Coatings",   color: "#EA580C" },
  ],
  applications: [
    { id: "app_hangars",    name: "Airplane Hangars" },
    { id: "app_auto",       name: "Automotive / Fire Station / Garages" },
    { id: "app_chem",       name: "Chemical Manufacturing / Pharmaceutical" },
    { id: "app_schools",    name: "Schools / Retail / Hospitals" },
    { id: "app_food",       name: "Food & Beverage / Commercial Kitchens" },
    { id: "app_restaurants",name: "Restaurants / Breweries / Wineries" },
    { id: "app_warehouses", name: "Warehouses / Distribution Centers" },
    { id: "app_mechrooms",  name: "Mechanical Rooms" },
    { id: "app_datacenter", name: "Data Centers / Chip Manufacturing" },
    { id: "app_themeparks", name: "Theme Parks" },
  ],
  // Reasonable starter dots — copied row-for-row from the reference
  // image so the user opens the page to a familiar layout.
  cells: {
    "app_hangars:sys_wear": true,
    "app_hangars:sys_chemical": true,
    "app_hangars:sys_waterborne": true,
    "app_auto:sys_general": true,
    "app_auto:sys_wear": true,
    "app_auto:sys_chemical": true,
    "app_auto:sys_waterborne": true,
    "app_chem:sys_chemical": true,
    "app_chem:sys_esd": true,
    "app_chem:sys_urethane": true,
    "app_chem:sys_mma": true,
    "app_schools:sys_general": true,
    "app_schools:sys_wear": true,
    "app_schools:sys_waterborne": true,
    "app_food:sys_chemical": true,
    "app_food:sys_urethane": true,
    "app_restaurants:sys_general": true,
    "app_restaurants:sys_wear": true,
    "app_restaurants:sys_chemical": true,
    "app_restaurants:sys_urethane": true,
    "app_warehouses:sys_general": true,
    "app_warehouses:sys_wear": true,
    "app_warehouses:sys_chemical": true,
    "app_warehouses:sys_esd": true,
    "app_warehouses:sys_waterborne": true,
    "app_mechrooms:sys_chemical": true,
    "app_mechrooms:sys_mma": true,
    "app_datacenter:sys_esd": true,
    "app_themeparks:sys_mma": true,
  },
};

// Strict color validator — only accept 3/6/8-digit hex. We refuse
// arbitrary CSS color strings so the value can safely be inlined into
// SVG attributes on export without injection / invalid-XML risk.
const HEX_COLOR_RE = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
function safeColor(input: any, fallback = "#64748B"): string {
  if (typeof input === "string" && HEX_COLOR_RE.test(input.trim())) {
    return input.trim();
  }
  return fallback;
}

// Defensive normalizer: trims strings, fills missing fields, drops
// unknown cell keys whose ids no longer exist after a column/row delete.
function normalize(input: any): SelectorGuideDoc {
  const doc: SelectorGuideDoc = {
    title: typeof input?.title === "string" ? input.title.slice(0, 200) : DEFAULT_DOC.title,
    systems: Array.isArray(input?.systems)
      ? input.systems
          .filter((s: any) => s && typeof s.id === "string")
          .map((s: any) => ({
            id: String(s.id).slice(0, 64),
            name: String(s.name ?? "Untitled system").slice(0, 120),
            color: safeColor(s.color),
          }))
      : [],
    applications: Array.isArray(input?.applications)
      ? input.applications
          .filter((a: any) => a && typeof a.id === "string")
          .map((a: any) => ({
            id: String(a.id),
            name: String(a.name ?? "Untitled application"),
          }))
      : [],
    cells: {},
  };
  const validSys = new Set(doc.systems.map((s) => s.id));
  const validApp = new Set(doc.applications.map((a) => a.id));
  if (input?.cells && typeof input.cells === "object") {
    for (const [k, v] of Object.entries(input.cells)) {
      if (!v) continue;
      const [appId, sysId] = String(k).split(":");
      if (validApp.has(appId) && validSys.has(sysId)) {
        doc.cells[`${appId}:${sysId}`] = true;
      }
    }
  }
  return doc;
}

export function registerSelectorGuideRoutes(app: Express): void {
  // GET — return the stored doc, seeding the default if no row exists yet.
  app.get(
    "/api/selector-guide",
    authMiddleware,
    requirePasswordChange,
    async (_req: Request, res: Response) => {
      try {
        const [row] = await db
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, SETTING_KEY));
        if (!row) {
          // First load: persist defaults so subsequent edits start from
          // a stable baseline.
          await db
            .insert(appSettings)
            .values({ key: SETTING_KEY, value: DEFAULT_DOC as any })
            .onConflictDoNothing();
          return res.json(DEFAULT_DOC);
        }
        return res.json(normalize(row.value));
      } catch (err: any) {
        console.error("[selector-guide] GET failed:", err);
        return res.status(500).json({ error: "Failed to load selector guide", details: err?.message });
      }
    },
  );

  // PUT — replace the whole doc. We accept full-document writes only;
  // the chart is small enough that partial PATCH semantics aren't worth
  // the conflict-resolution complexity.
  app.put(
    "/api/selector-guide",
    authMiddleware,
    requirePasswordChange,
    async (req: Request, res: Response) => {
      try {
        const doc = normalize(req.body);
        const [existing] = await db
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, SETTING_KEY));
        if (existing) {
          await db
            .update(appSettings)
            .set({ value: doc as any, updatedAt: new Date() })
            .where(eq(appSettings.key, SETTING_KEY));
        } else {
          await db.insert(appSettings).values({ key: SETTING_KEY, value: doc as any });
        }
        return res.json(doc);
      } catch (err: any) {
        console.error("[selector-guide] PUT failed:", err);
        return res.status(500).json({ error: "Failed to save selector guide", details: err?.message });
      }
    },
  );
}
