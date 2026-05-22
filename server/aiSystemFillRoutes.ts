// AI Fill route for systems.
//
// POST /api/systems/:systemId/ai-fill
//   Body: { sections?: ('description' | 'recommendation' | 'warnings' | 'usageAreas')[] }
//   Returns: { description, recommendation, warnings, usageAreas, confidence, reasoning }
//
// Uses the Replit-managed OpenAI AI integration (billed to Replit credits,
// no user API key needed) — the SDK is instantiated against
// AI_INTEGRATIONS_OPENAI_BASE_URL with a proxy-issued API key.
//
// The endpoint never auto-saves. The client surfaces the response in a side-
// by-side review panel and the user explicitly applies + saves.

import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { db } from "./db";
import { systems, systemLayers, systemProductOptions, products, productQualificationTags } from "@shared/schema";
import { eq, asc, ne } from "drizzle-orm";
import { authMiddleware, requirePasswordChange } from "./authRoutes";

const MODEL = "gpt-5.4";
const MAX_TOKENS = 8192;

type AiFillResponse = {
  description: string;
  recommendation: string;
  warnings: string[];
  // Usage areas: each entry is ONE standalone sentence describing where the
  // system is typically used (e.g. "Suitable for pharmaceutical cleanrooms.").
  // Rendered as a bullet list in the UI and persisted to `systems.typical_uses`
  // as newline-joined text.
  usageAreas: string[];
  // Per-layer "Description & key properties" content rendered on the
  // System Preview cards (Sika/PPG-style). Keyed by `layerId` from the
  // request payload — the client uses this to fan out PUT calls to
  // /api/system-layers/:id when the user accepts the suggestion. The
  // server treats the keys as opaque strings and never tries to mutate
  // layers itself.
  layerEnhancements: Record<string, { description: string; properties: string[] }>;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasoning: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────
// Compact "key: value" string built from a product's `technicalSpecs` /
// `customFields` jsonb arrays. Stored as a single pre-formatted string on
// the prompt-side type so the prompt template can splice it directly
// without re-doing the array → text shaping.
type ProductSpecs = string;

type LayerForPrompt = {
  // Stable layerId — echoed back in the response's `layerEnhancements`
  // map so the client can fan out per-layer PUT calls. Never shown to
  // the user; only used as a key.
  layerId: string;
  order: number;
  name: string;
  position: string;
  defaultProduct: {
    name: string;
    supplier: string;
    description: string;
    specs: ProductSpecs;
    // Taxonomy hint pulled from `products.category` + `products.sector`,
    // joined with " / " when both are present. Empty string when neither
    // is set. Helps the model anchor the layer description in the
    // product's actual taxonomy (e.g. "Coatings / Epoxy Primers").
    taxonomy: string;
    tags: { substrate: string; humidity: string; duty: string; finish: string };
  } | null;
  // Alternatives now carry name + supplier + (full) description + specs so
  // the AI can reason about substitution options, not just acknowledge
  // their existence.
  alternatives: {
    name: string;
    supplier: string;
    description: string;
    specs: ProductSpecs;
  }[];
};

type SystemForPrompt = {
  name: string;
  type: string;
  status: string;
  substrates: string[];
  humidity: string | null;
  duty: string | null;
  finish: string | null;
  hasTopcoat: boolean;
  layers: LayerForPrompt[];
  uniqueSuppliers: string[];
};

function inferSystemType(name: string, description: string): string {
  const t = `${name} ${description}`.toLowerCase();
  if (/\bpolyurea\b/.test(t)) return "Polyurea";
  if (/\bepoxy\b/.test(t)) return "Epoxy";
  if (/\bacrylic\b/.test(t)) return "Acrylic";
  if (/\b(pu|polyurethane)\b/.test(t)) return "PU";
  if (/\bbitumen|bituminous\b/.test(t)) return "Bitumen";
  if (/\bcement\b/.test(t)) return "Cement";
  return "Generic";
}

// Flatten a product's `technicalSpecs` / `customFields` jsonb arrays into
// a single "key: value; key: value" string for the prompt. Both columns
// are arrays of `{ key/name/label, value }` objects in this codebase, so
// the formatter accepts either shape defensively (different product
// imports use slightly different keys). Returns "" when the array is
// empty/missing — the prompt template hides the line in that case.
function formatProductSpecs(
  technicalSpecs: unknown,
  customFields: unknown,
): string {
  const out: string[] = [];
  const push = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const row of arr) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const key = (r.key ?? r.name ?? r.label ?? r.field ?? "").toString().trim();
      const val = (r.value ?? r.val ?? "").toString().trim();
      if (key && val) out.push(`${key}: ${val}`);
    }
  };
  push(technicalSpecs);
  push(customFields);
  return out.join("; ");
}

function inferLayerPosition(name: string): string {
  const n = name.toLowerCase();
  if (/\bprimer\b/.test(n)) return "primer";
  if (/\bbase\b/.test(n)) return "base_coat";
  if (/\btop|finish\b/.test(n)) return "topcoat";
  if (/\binter|middle\b/.test(n)) return "intermediate";
  return "layer";
}

export function buildSystemFillPrompt(
  system: SystemForPrompt,
  otherSystems: { name: string; type: string; description: string | null }[],
  sections: string[],
): string {
  // Full per-layer block: default product (name + supplier + FULL
  // description + technical/custom specs + qualification tags) and the
  // same depth for every alternative so the AI can reason about
  // substitution rather than just acknowledging an alt exists.
  const layersBlock = system.layers.map((l) => {
    const defSpecs = l.defaultProduct?.specs ? `\n  Specs: ${l.defaultProduct.specs}` : "";
    const defTax = l.defaultProduct?.taxonomy ? `\n  Taxonomy: ${l.defaultProduct.taxonomy}` : "";
    const altsBlock = l.alternatives.length === 0
      ? "  Alternatives: None"
      : `  Alternatives:\n${l.alternatives.map((a) => {
          const aSpecs = a.specs ? `\n      Specs: ${a.specs}` : "";
          const aDesc = a.description ? `\n      Description: ${a.description}` : "";
          return `    - ${a.name} (supplier: ${a.supplier})${aDesc}${aSpecs}`;
        }).join("\n")}`;
    return `
- Layer ${l.order} [layerId="${l.layerId}"]: ${l.name} (${l.position})
  Default product: ${l.defaultProduct?.name || "None assigned"}
  Supplier: ${l.defaultProduct?.supplier || "—"}
  Description: ${l.defaultProduct?.description || "—"}${defTax}${defSpecs}
  Tags: substrate=${l.defaultProduct?.tags.substrate || "—"}, humidity=${l.defaultProduct?.tags.humidity || "—"}, duty=${l.defaultProduct?.tags.duty || "—"}, finish=${l.defaultProduct?.tags.finish || "—"}
${altsBlock}`;
  }).join("");

  // Whitelist of layerIds the model is allowed to write to. The client
  // ignores any unknown keys defensively, but listing them here keeps the
  // model from inventing layerIds that don't exist.
  const layerIdList = system.layers.map((l) => `"${l.layerId}"`).join(", ");

  const otherBlock = otherSystems
    .slice(0, 5)
    .map((s) => `- ${s.name} (${s.type}): "${s.description || "No description yet"}"`)
    .join("\n");

  return `You are a technical writer for a construction chemicals company.
You write professional, accurate system descriptions for flooring
and waterproofing systems — in the style of Sika and PPG technical catalogs.

## The system you are describing

Name: ${system.name}
Type: ${system.type}
Status: ${system.status}

System parameters:
- Substrate: ${system.substrates.length > 0 ? system.substrates.join(", ") : "Not configured"}
- Humidity tolerance: ${system.humidity || "Not configured"}
- Duty rating: ${system.duty || "Not configured"}
- Finish: ${system.finish || "Not configured"}
- Topcoat required: ${system.hasTopcoat ? "Yes" : "No"}

Layers and products:${layersBlock || "\n- (no layers configured yet)"}

Suppliers involved: ${system.uniqueSuppliers.join(", ") || "—"}

## Other systems in the catalog (for tone and style reference)

${otherBlock || "(no other systems available)"}

## Reference architecture knowledge (Sika + PPG flooring systems)

Use this expanded knowledge of Sika and PPG (Sikafloor / Sikagard / Sikalastic
and PPG Pitt-Glaze / Pittsburgh Paints / Amercoat / Sigmatherm / Sigmacover)
to inform the description, recommendation, usage areas and warnings.
Match terminology, build-up logic and use-case language used in those
technical datasheets.

### Sika — Sikafloor® (resin flooring)
- Sikafloor®-2 SynTop / 3 QuartzTop: dry-shake cementitious topping, monolithic
  with concrete pour, heavy industrial floors (warehouses, workshops).
- Sikafloor®-150/151/156/161 series: low-viscosity epoxy primers (and binder
  for screeds), substrate sealing, max RH 4% CM, two coats common.
- Sikafloor®-263 SL / 264: solvent-free pigmented epoxy SL 2-3 mm, glossy,
  chemical resistant — food processing, pharma, electronics, logistics.
- Sikafloor®-269 / 269 CR / 220 W: epoxy roller-applied 200-400 µm, light
  industrial, decorative, garages.
- Sikafloor®-325 / 327 / 330 (Sikafloor MultiDur): elastic epoxy 2-4 mm with
  crack-bridging, commercial and underground parking decks.
- Sikafloor®-PurCem® (HC/HM/HS): polyurethane-cement 4-9 mm, thermal-shock,
  steam-clean, food & beverage wet-process areas, breweries, dairies.
- Sikafloor®-21/22 N PurCem: hybrid PUMA for fast-track food production.
- Sikafloor®-2530 W / 2540 W: water-based epoxy decorative finish or sealer.
- Sikafloor®-359 / 358: tough elastic PU finish, fall-protection floors,
  multi-storey car parks (intermediate), 1-4 mm.
- Sikafloor®-381/390 ECF: conductive epoxy for ESD areas (resistance
  10⁴-10⁹ Ω), requires conductive primer (Sikafloor®-220 W Conductive)
  and copper grounding tape.
- Sikafloor®-Marine: glassflake / vinyl ester for ship decks.

### Sika — Sikalastic® & Sikagard® (waterproofing / protection)
- Sikalastic®-612/618/625/641 LO: liquid-applied PU/polyurea hybrid roof
  membranes, cold-applied, seamless, exposed (UV-stable).
- Sikalastic®-851 RD / 826 RD: spray polyurea, fast-cure, parking decks,
  ponds, secondary containment.
- Sikagard®-550 W Elastic: protective elastomeric coating for concrete
  facades, carbonation barrier, crack-bridging.
- Sikagard®-63 N / 75 EpoCem: chemical-resistant lining for tanks, bunds.

### PPG — Industrial & protective coatings
- Pitt-Glaze® WB1 / WB2: acrylic/epoxy interior wall coatings, hygienic
  scrub-resistant — hospitals, schools, kitchens.
- Amercoat® 385 / 400 / 450 H: epoxy and polyurethane high-build maintenance
  coatings for structural steel and marine environments.
- Sigmacover® 280 / 350: surface-tolerant epoxy primer/intermediate for
  steelwork (offshore, water tanks, bridges).
- Sigmadur® 550 / 1800: aliphatic polyurethane topcoats, UV-stable color
  retention.
- Sigmaguard® CSF 575 / 650: novolac epoxy tank linings for crude oil,
  chemicals, potable water (with NSF approval).
- Sigmatherm® 540 / 230: high-temperature silicone coatings up to 540 °C
  for stacks, exhausts.
- Hi-Temp® 1027 / 1000 V: inorganic copolymer for insulated-jacket
  corrosion-under-insulation (CUI) protection.
- Pittguard® / NovaGuard 840 / 890: chemically-resistant linings for
  secondary containment, pulp & paper.

### Build-up logic and rules to reflect
- Every cementitious substrate needs a primer (epoxy WB or SB) unless
  the topcoat is explicitly self-priming.
- Polyurea waterproofing needs a primer matched to substrate (epoxy on
  concrete, anti-corrosive epoxy on steel) AND an aliphatic UV topcoat
  when exposed.
- PU-cement systems (PurCem-class) DO NOT need a primer on sound new
  concrete cured 7+ days (laitance removed by shotblast/grinding).
- Conductive/ESD systems require a conductive primer + copper grounding
  strip; the conductive layer is between primer and topcoat.
- Self-leveling epoxy floors: total system ~2-4 mm = primer (0.3 mm) +
  SL body (1.5-3 mm) + optional seal coat.
- Roller-applied epoxy: 2 coats × 150-200 µm = ~300-400 µm DFT.
- Aliphatic PU/polyurea topcoats are required for UV exposure; aromatic
  versions chalk and yellow outdoors.
- Recoat windows are typically 12-24 h between coats at 20 °C; exceeding
  the max window requires light abrasion to re-key.
- Substrate moisture: concrete must be < 4% CM (≈ 75% RH) for epoxy/PU;
  PurCem tolerates higher.
- Compatibility: never put PU directly on fresh cement without primer
  (CO₂ blistering risk); never put solvent-based topcoat on water-based
  intermediate without test patch.

## Your task

Generate the following (only the requested sections matter — but always
return all keys, leaving non-requested ones as "" or []):

Requested sections: ${sections.join(", ")}

1. DESCRIPTION (2-4 sentences, customer-facing marketing tone):
   - What the system does and where it is used.
   - Key performance benefits (chemical resistance, flexibility, UV stability
     etc).
   - Any notable feature (e.g. decorative options, fast cure, food-contact
     safe).
   - Do NOT mention specific product names in the description.
   - Do NOT invent technical specs — only reference what is in the data above.
   - Match the tone of the other systems listed above for consistency.

2. RECOMMENDATION (1-3 sentences, technical advisory tone):
   - A practical tip for specifiers or applicators.
   - Could reference substrate preparation, application conditions, or
     complementary products.
   - Should be specific to this system's configuration.
   - Format: direct instruction, e.g. "Ensure concrete is cured for minimum
     28 days and surface RH is below 75% before priming."

3. USAGE AREAS (array of 2-5 short standalone sentences — REQUIRED when
   requested, NEVER return an empty array if "usageAreas" is in the
   requested sections list):
   - Each entry is ONE complete sentence describing a typical use case,
     environment, or sector where this system is suitable.
   - Examples: "Suitable for pharmaceutical cleanrooms with hygienic
     coving.", "Ideal for high-traffic warehouse floors exposed to forklift
     wear.", "Specified for food and beverage production areas requiring
     chemical resistance."
   - Each sentence must stand on its own (no "It is also..." or
     conjunctions referring to earlier entries).
   - Base each one on the actual products, substrates and parameters
     above when available. If the system is underconfigured, fall back
     to the typical use cases for this SYSTEM TYPE (epoxy SL, PU
     waterproofing, polyurea, acrylic etc) using the reference knowledge
     above — but still return 2-5 entries.
   - Only return [] if "usageAreas" was NOT in the requested sections.

4. WARNINGS (array of short strings, optional — only include if genuinely
   relevant):
   - Technical cautions specific to this system.
   - Leave empty array if no specific warnings are needed.
   - Do NOT invent warnings — only flag genuine technical considerations
     based on the products and substrate configuration shown.

5. LAYER ENHANCEMENTS (object keyed by layerId — one entry per layer
   in the system, even when the layer has no default product, so the
   System Preview card can show a meaningful headline regardless):
   - The valid layerIds are: ${layerIdList || "(no layers)"}.
   - For each layer, return an object with:
       "description": 1-3 short sentences in the style of a Sika / PPG
         technical datasheet layer block. Start with a 2-4 word headline
         followed by " — " and a short technical paragraph (e.g.
         "Highly Penetrating Primer — This two-component epoxy primer
         seals the substrate and provides an excellent mechanical bond
         for the subsequent coats."). Ground the language in the
         default product's description, taxonomy, technical specs and
         the supplier knowledge base above. If the layer has no default
         product, describe it generically based on its position + the
         system parameters.
       "properties": array of 3-6 short bullet phrases (NOT full
         sentences) describing the key selling points / technical
         properties of this layer in the context of THIS system. Pull
         from the product's actual specs and description when possible
         (e.g. "Low Viscosity", "Low Odor", "Bonds to Damp Concrete",
         "Roller, Squeegee, or Brush Application", "200-400 µm DFT per
         coat"). Avoid duplicating the system-level description's
         language.
   - Return [] for properties if you genuinely have no grounded bullets
     for that layer — never invent specs that aren't supported by the
     product description, specs or supplier knowledge above.

6. CONFIDENCE:
   - HIGH if the system has complete parameters and at least 2 layers with
     products assigned.
   - MEDIUM if parameters are partially configured or only 1 layer has
     products.
   - LOW if most parameters are "Not configured".

7. REASONING (one sentence): Why you described it this way — which data
   points drove the content.

Respond with ONLY valid JSON, no markdown:
{
  "description": "string",
  "recommendation": "string",
  "usageAreas": ["string", "string", ...],
  "warnings": ["string"],
  "layerEnhancements": {
    "<layerId>": { "description": "string", "properties": ["string", ...] }
  },
  "confidence": "HIGH|MEDIUM|LOW",
  "reasoning": "string"
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────
export function registerAiSystemFillRoutes(app: Express): void {
  app.use("/api/systems/:systemId/ai-fill", authMiddleware, requirePasswordChange);

  app.post("/api/systems/:systemId/ai-fill", async (req: Request, res: Response) => {
    try {
      const { systemId } = req.params;
      const requestedSections: string[] = Array.isArray(req.body?.sections) && req.body.sections.length > 0
        ? req.body.sections
        : ["description", "recommendation", "warnings", "usageAreas"];

      // Fetch system + layers + default products + qualification tags in
      // a small handful of queries (one per concern, joined client-side).
      const [system] = await db.select().from(systems).where(eq(systems.systemId, systemId));
      if (!system) return res.status(404).json({ error: "System not found" });

      const layerRows = await db
        .select()
        .from(systemLayers)
        .where(eq(systemLayers.systemId, systemId))
        .orderBy(asc(systemLayers.orderSequence));

      // For each layer: pull its product options + the default product's
      // qualification tag for the tag block in the prompt.
      const layersForPrompt: LayerForPrompt[] = await Promise.all(
        layerRows.map(async (layer) => {
          const opts = await db
            .select({
              optionId: systemProductOptions.optionId,
              productId: systemProductOptions.productId,
              isDefault: systemProductOptions.isDefault,
              productName: products.name,
              productSupplier: products.supplier,
              productDescription: products.description,
              // Pulled so the AI can ground recommendations + warnings in
              // real product specs (e.g. recoat windows, DFT, density,
              // VOC) rather than catalog-style guesses.
              productTechnicalSpecs: products.technicalSpecs,
              productCustomFields: products.customFields,
              // Pulled for the prompt's per-product "Taxonomy:" line so
              // the AI can ground the layer description in the
              // product's actual category path (e.g. "Coatings / Epoxy
              // Primers"). Both columns are nullable; the formatter
              // joins what's present with " / ".
              productCategory: products.category,
              productSector: products.sector,
            })
            .from(systemProductOptions)
            .leftJoin(products, eq(systemProductOptions.productId, products.productId))
            .where(eq(systemProductOptions.layerId, layer.layerId));

          const def = opts.find((o) => o.isDefault) || opts[0] || null;
          let tag: { substrateTypes: string[] | null; humidityTolerance: string | null; dutyRating: string | null; finishType: string | null } | null = null;
          if (def?.productId) {
            const [t] = await db
              .select({
                substrateTypes: productQualificationTags.substrateTypes,
                humidityTolerance: productQualificationTags.humidityTolerance,
                dutyRating: productQualificationTags.dutyRating,
                finishType: productQualificationTags.finishType,
              })
              .from(productQualificationTags)
              .where(eq(productQualificationTags.productId, def.productId));
            tag = t || null;
          }

          // " / "-joined taxonomy hint from products.category +
          // products.sector. Either may be null/empty; the join drops
          // empty parts so we never emit " /  " or a leading slash.
          const taxonomyParts = [def?.productCategory, def?.productSector]
            .map((s) => (s || "").trim())
            .filter(Boolean);
          const taxonomy = taxonomyParts.join(" / ");

          return {
            layerId: layer.layerId,
            order: (layer.orderSequence ?? 0) + 1,
            name: layer.layerName,
            position: inferLayerPosition(layer.layerName),
            defaultProduct: def
              ? {
                  name: def.productName || "—",
                  supplier: def.productSupplier || "—",
                  description: def.productDescription || "",
                  specs: formatProductSpecs(def.productTechnicalSpecs, def.productCustomFields),
                  taxonomy,
                  tags: {
                    substrate: (tag?.substrateTypes || []).join(", "),
                    humidity: tag?.humidityTolerance || "",
                    duty: tag?.dutyRating || "",
                    finish: tag?.finishType || "",
                  },
                }
              : null,
            alternatives: opts
              .filter((o) => o.optionId !== def?.optionId)
              .map((o) => ({
                name: o.productName || "—",
                supplier: o.productSupplier || "—",
                description: o.productDescription || "",
                specs: formatProductSpecs(o.productTechnicalSpecs, o.productCustomFields),
              })),
          };
        }),
      );

      const uniqueSuppliers = Array.from(
        new Set(
          layersForPrompt
            .flatMap((l) => [l.defaultProduct?.supplier].filter(Boolean) as string[])
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      );

      const hasTopcoat = layersForPrompt.some((l) => l.position === "topcoat");

      const systemForPrompt: SystemForPrompt = {
        name: system.name,
        type: inferSystemType(system.name, system.description || ""),
        status: system.status || "draft",
        substrates: Array.isArray(system.systemSubstrate) ? system.systemSubstrate : [],
        humidity: system.systemHumidity || null,
        duty: system.systemDuty || null,
        finish: null,
        hasTopcoat,
        layers: layersForPrompt,
        uniqueSuppliers,
      };

      // Other systems for tone reference (names + descriptions only, capped).
      const others = await db
        .select({ name: systems.name, description: systems.description })
        .from(systems)
        .where(ne(systems.systemId, systemId))
        .limit(10);
      const otherSystems = others.map((s) => ({
        name: s.name,
        type: inferSystemType(s.name, s.description || ""),
        description: s.description,
      }));

      const prompt = buildSystemFillPrompt(systemForPrompt, otherSystems, requestedSections);

      // Call OpenAI via the Replit AI integration proxy.
      const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      if (!baseURL || !apiKey) {
        return res.status(500).json({ error: "AI integration not configured. Please re-install the OpenAI blueprint." });
      }
      const client = new OpenAI({ apiKey, baseURL });

      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      });

      const rawText = completion.choices?.[0]?.message?.content ?? "";
      if (!rawText.trim()) {
        return res.status(502).json({ error: "AI returned an empty response" });
      }

      // response_format: json_object should give us pure JSON, but defensively
      // strip markdown fences in case the model wraps them anyway.
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      let parsed: AiFillResponse;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return res.status(502).json({ error: "AI returned malformed JSON", raw: cleaned });
      }

      // Normalise + clamp the response shape so the client can rely on it.
      const safe: AiFillResponse = {
        description: typeof parsed.description === "string" ? parsed.description : "",
        recommendation: typeof parsed.recommendation === "string" ? parsed.recommendation : "",
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((w) => typeof w === "string") : [],
        // Trim each sentence + drop empties so the UI never renders blank
        // bullets even if the model returns "" entries in the array.
        usageAreas: Array.isArray(parsed.usageAreas)
          ? parsed.usageAreas
              .filter((u) => typeof u === "string")
              .map((u) => u.trim())
              .filter(Boolean)
          : [],
        // Normalise layerEnhancements: keep ONLY entries keyed by a
        // layerId that actually exists in this system (drops any IDs
        // hallucinated by the model), coerce missing fields to safe
        // defaults, and trim/filter properties so empties never reach
        // the UI as blank bullets.
        layerEnhancements: (() => {
          const out: Record<string, { description: string; properties: string[] }> = {};
          const validIds = new Set(layersForPrompt.map((l) => l.layerId));
          const raw = (parsed as any).layerEnhancements;
          if (raw && typeof raw === "object" && !Array.isArray(raw)) {
            for (const [k, v] of Object.entries(raw)) {
              if (!validIds.has(k) || !v || typeof v !== "object") continue;
              const e = v as { description?: unknown; properties?: unknown };
              const description = typeof e.description === "string" ? e.description.trim() : "";
              const properties = Array.isArray(e.properties)
                ? e.properties
                    .filter((p) => typeof p === "string")
                    .map((p) => (p as string).trim())
                    .filter(Boolean)
                : [];
              if (description || properties.length > 0) {
                out[k] = { description, properties };
              }
            }
          }
          return out;
        })(),
        confidence: ["HIGH", "MEDIUM", "LOW"].includes(String(parsed.confidence)) ? (parsed.confidence as AiFillResponse["confidence"]) : "LOW",
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
      };

      res.json(safe);
    } catch (err: any) {
      console.error("AI fill error:", err);
      res.status(500).json({ error: err?.message || "Failed to generate AI suggestions" });
    }
  });
}
