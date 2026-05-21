// AI Fill route for systems.
//
// POST /api/systems/:systemId/ai-fill
//   Body: { sections?: ('description' | 'recommendation' | 'warnings')[] }
//   Returns: { description, recommendation, warnings, confidence, reasoning }
//
// Uses the Replit-managed Anthropic AI integration (no user API key needed) —
// the SDK is instantiated against AI_INTEGRATIONS_ANTHROPIC_BASE_URL and a
// dummy AI_INTEGRATIONS_ANTHROPIC_API_KEY that the proxy authorises.
//
// The endpoint never auto-saves. The client surfaces the response in a side-
// by-side review panel and the user explicitly applies + saves.

import type { Express, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { systems, systemLayers, systemProductOptions, products, productQualificationTags } from "@shared/schema";
import { eq, asc, ne } from "drizzle-orm";
import { authMiddleware, requirePasswordChange } from "./authRoutes";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8192;

type AiFillResponse = {
  description: string;
  recommendation: string;
  warnings: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasoning: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────
type LayerForPrompt = {
  order: number;
  name: string;
  position: string;
  defaultProduct: {
    name: string;
    supplier: string;
    description: string;
    tags: { substrate: string; humidity: string; duty: string; finish: string };
  } | null;
  alternatives: { name: string }[];
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
  const layersBlock = system.layers.map((l) => `
- Layer ${l.order}: ${l.name} (${l.position})
  Default product: ${l.defaultProduct?.name || "None assigned"}
  Supplier: ${l.defaultProduct?.supplier || "—"}
  Description: ${l.defaultProduct?.description?.slice(0, 150) || "—"}
  Tags: substrate=${l.defaultProduct?.tags.substrate || "—"}, humidity=${l.defaultProduct?.tags.humidity || "—"}, duty=${l.defaultProduct?.tags.duty || "—"}, finish=${l.defaultProduct?.tags.finish || "—"}
  Alternatives: ${l.alternatives.map((a) => a.name).join(", ") || "None"}`).join("");

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

## Reference architecture knowledge

Use your knowledge of Sika, PPG, Mapei, and Fosroc flooring systems to inform
the description. Key facts to reflect accurately:
- Epoxy self-leveling systems: seamless, chemical resistant, high-gloss,
  2-4mm application, suitable for food processing, pharma, logistics.
- Epoxy paint systems: thin-coat 200-500 micron, decorative or functional,
  suitable for light-medium traffic.
- Polyurea waterproofing: fast-cure, flexible, UV-stable with aliphatic
  topcoat, suitable for roofs, bridges, car parks, water tanks.
- PU waterproofing: elastic, crack-bridging, suitable for terraces and roofs.
- PU flooring: comfortable underfoot, flexible, suitable for sports and
  commercial environments.
- Antistatic/ESD systems: conductive primer required, resistance 10^4-10^9
  ohm, suitable for electronics, cleanrooms, operating theatres.
- Acrylic systems: fast-dry, suitable for sports courts and outdoor areas.

## Your task

Generate three things (only the requested sections matter — but always
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

3. WARNINGS (array of short strings, optional — only include if genuinely
   relevant):
   - Technical cautions specific to this system.
   - Leave empty array if no specific warnings are needed.
   - Do NOT invent warnings — only flag genuine technical considerations
     based on the products and substrate configuration shown.

4. CONFIDENCE:
   - HIGH if the system has complete parameters and at least 2 layers with
     products assigned.
   - MEDIUM if parameters are partially configured or only 1 layer has
     products.
   - LOW if most parameters are "Not configured".

5. REASONING (one sentence): Why you described it this way — which data
   points drove the content.

Respond with ONLY valid JSON, no markdown:
{
  "description": "string",
  "recommendation": "string",
  "warnings": ["string"],
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
        : ["description", "recommendation", "warnings"];

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

          return {
            order: (layer.orderSequence ?? 0) + 1,
            name: layer.layerName,
            position: inferLayerPosition(layer.layerName),
            defaultProduct: def
              ? {
                  name: def.productName || "—",
                  supplier: def.productSupplier || "—",
                  description: def.productDescription || "",
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
              .map((o) => ({ name: o.productName || "—" })),
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

      // Call Anthropic via the Replit AI integration proxy.
      const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
      const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
      if (!baseURL || !apiKey) {
        return res.status(500).json({ error: "AI integration not configured. Please re-install the Anthropic blueprint." });
      }
      const client = new Anthropic({ apiKey, baseURL });

      const message = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      });

      // Pull the first text block out of the response.
      const textBlock = message.content.find((b: any) => b.type === "text") as { type: "text"; text: string } | undefined;
      if (!textBlock?.text) {
        return res.status(502).json({ error: "AI returned an empty response" });
      }

      // The prompt asks for raw JSON, but defensively strip markdown fences.
      const cleaned = textBlock.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      let parsed: AiFillResponse;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return res.status(502).json({ error: "AI returned malformed JSON", raw: textBlock.text });
      }

      // Normalise + clamp the response shape so the client can rely on it.
      const safe: AiFillResponse = {
        description: typeof parsed.description === "string" ? parsed.description : "",
        recommendation: typeof parsed.recommendation === "string" ? parsed.recommendation : "",
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((w) => typeof w === "string") : [],
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
