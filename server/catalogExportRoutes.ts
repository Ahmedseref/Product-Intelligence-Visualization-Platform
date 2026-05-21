// =============================================================================
// catalogExportRoutes.ts
// -----------------------------------------------------------------------------
// POST /api/systems/export-catalog — server-side Word (.docx) generation for
// the System Preview "Export catalog" feature. Builds a real, editable .docx
// (not images) using the `docx` library, with an SVG cross-section rendered
// to PNG via `sharp` for each system.
// =============================================================================

import type { Express, Request, Response } from "express";
import { db } from "./db";
import {
  systems,
  systemLayers,
  systemProductOptions,
  products,
  productQualificationTags,
  proformaSettings,
} from "@shared/schema";
import { eq, inArray, asc } from "drizzle-orm";
import { authMiddleware, requirePasswordChange } from "./authRoutes";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  ImageRun,
  HeadingLevel,
  BorderStyle,
  WidthType,
  AlignmentType,
  ShadingType,
  PageBreak,
  TableOfContents,
  StyleLevel,
} from "docx";
import sharp from "sharp";

// -------- Layer position visual mapping (mirrors client LAYER_COLORS) --------
const LAYER_COLORS: Record<string, { fill: string; accent: string; text: string; label: string }> = {
  primer:       { fill: "FAEEDA", accent: "BA7517", text: "633806", label: "Primer"       },
  base_coat:    { fill: "E6F1FB", accent: "378ADD", text: "0C447C", label: "Base coat"    },
  intermediate: { fill: "F1EFE8", accent: "888780", text: "444441", label: "Intermediate" },
  topcoat:      { fill: "EAF3DE", accent: "639922", text: "27500A", label: "Topcoat"      },
  standalone:   { fill: "F1EFE8", accent: "888780", text: "444441", label: "Standalone"   },
  unknown:      { fill: "F1EFE8", accent: "D3D1C7", text: "888780", label: "Layer"        },
};

// Same heuristic as the client (SystemBuilderPreview.inferLayerPositionFromSlotName).
function inferLayerPosition(layerName: string): keyof typeof LAYER_COLORS {
  const n = (layerName || "").toLowerCase();
  if (/\bprimer\b/.test(n)) return "primer";
  if (/\bbase[\s\-_]?coat\b|\bbasecoat\b|\bbase\b/.test(n)) return "base_coat";
  if (/\bintermediate\b|\bmid[\s\-_]?coat\b/.test(n)) return "intermediate";
  if (/\btop[\s\-_]?coat\b|\btopcoat\b|\bfinish\b|\bseal(er)?\b/.test(n)) return "topcoat";
  if (/\bstand[\s\-_]?alone\b/.test(n)) return "standalone";
  return "unknown";
}

// Material chemistry detection (mirrors client MATERIAL_KEYWORDS).
function detectMaterial(text: string): "Epoxy" | "PU" | "Polyurea" | "Acrylic" | null {
  if (/\b(epoxy|epoks(?:i|y))\b/i.test(text)) return "Epoxy";
  if (/\b(polyurea|poliurea)\b/i.test(text)) return "Polyurea";
  if (/\b(pu|polyurethane|poliuretan)\b/i.test(text)) return "PU";
  if (/\b(acrylic|akrilik)\b/i.test(text)) return "Acrylic";
  return null;
}

// -----------------------------------------------------------------------------
// SVG cross-section → PNG (sharp). Renders stacked bands, bottom = first layer.
// -----------------------------------------------------------------------------
async function renderCrossSectionPng(
  layers: Array<{ layerName: string; position: string }>,
): Promise<Buffer> {
  const W = 520;
  const padX = 16;
  const padY = 16;
  const titleH = 24;
  const bandH = 56;
  const gap = 4;
  const n = Math.max(layers.length, 1);
  const H = padY * 2 + titleH + n * bandH + (n - 1) * gap + 40; // +substrate band

  // Render in layer-order: lowest order first → primer at the top of the
  // diagram, topcoat at the bottom (matches "BUILD-UP (BOTTOM → TOP)" label).
  const ordered = [...layers];

  const bands = ordered
    .map((l, i) => {
      const c = LAYER_COLORS[l.position] || LAYER_COLORS.unknown;
      const y = padY + titleH + i * (bandH + gap);
      const label = `${LAYER_COLORS[l.position]?.label || "Layer"} — ${escapeXml(l.layerName)}`;
      // No stroke on the band — the colored accent bar on the left is
      // enough structure; an outer stroke reads as a selection box in Word.
      return `
        <rect x="${padX}" y="${y}" width="${W - padX * 2}" height="${bandH}" rx="6" ry="6"
              fill="#${c.fill}"/>
        <rect x="${padX}" y="${y}" width="6" height="${bandH}" rx="3" ry="3" fill="#${c.accent}"/>
        <text x="${padX + 16}" y="${y + bandH / 2 + 5}" font-family="Helvetica, Arial, sans-serif"
              font-size="13" font-weight="600" fill="#${c.text}">${label}</text>`;
    })
    .join("");

  const substrateY = padY + titleH + n * bandH + (n - 1) * gap + 8;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>
  <text x="${padX}" y="${padY + 14}" font-family="Helvetica, Arial, sans-serif"
        font-size="12" font-weight="700" fill="#475569" letter-spacing="1">BUILD-UP (BOTTOM → TOP)</text>
  ${bands}
  <line x1="${padX}" y1="${substrateY}" x2="${W - padX}" y2="${substrateY}"
        stroke="#94A3B8" stroke-width="1" stroke-dasharray="4 3"/>
  <text x="${W / 2}" y="${substrateY + 20}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="11" font-style="italic"
        fill="#64748B">Structural substrate</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

function escapeXml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
}

// -----------------------------------------------------------------------------
// docx helpers
// -----------------------------------------------------------------------------
function plain(text: string, opts: { bold?: boolean; italic?: boolean; size?: number; color?: string } = {}) {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italic, size: opts.size ?? 22, color: opts.color })],
  });
}

function heading(text: string, level: HeadingLevel, size = 28) {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true, size })],
    spacing: { before: 200, after: 120 },
  });
}

// Section sub-heading — neutral dark gray, slightly smaller, NO docx heading
// style applied so Word doesn't auto-color it with the theme accent (which
// reads as visual competition with the system title).
function subheading(text: string) {
  return new Paragraph({
    spacing: { before: 200, after: 100 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 18,
        color: "475569",
        characterSpacing: 30,
      }),
    ],
  });
}

function badge(text: string, fill: string, color: string) {
  return new TableCell({
    width: { size: 22, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, color: "auto", fill },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: borderless(),
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: true, size: 18, color })],
      }),
    ],
  });
}

function borderless() {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: none, bottom: none, left: none, right: none };
}
function thin(color = "E5E7EB") {
  const b = { style: BorderStyle.SINGLE, size: 4, color };
  return { top: b, bottom: b, left: b, right: b };
}

function paramTable(rows: Array<[string, string]>) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "F1F5F9" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: rows.map(([k, v], i) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            shading: i === 0 ? { type: ShadingType.CLEAR, color: "auto", fill: "F8FAFC" } : undefined,
            margins: { top: 80, bottom: 80, left: 120, right: 80 },
            borders: borderless(),
            children: [new Paragraph({ children: [new TextRun({ text: k, size: 18, color: "475569" })] })],
          }),
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            margins: { top: 80, bottom: 80, left: 80, right: 120 },
            borders: borderless(),
            children: [new Paragraph({ children: [new TextRun({ text: v, size: 20, color: "0F172A" })] })],
          }),
        ],
      }),
    ),
  });
}

// -----------------------------------------------------------------------------
// Request handler
// -----------------------------------------------------------------------------
type ExportOptions = {
  includeCover: boolean;
  includeCrossSection: boolean;
  includeParameters: boolean;
  includeProducts: boolean;
  includeAlternatives: boolean;
  includeRecommendations: boolean;
  hideStockCodes: boolean;
  hideSuppliers: boolean;
  hideStatus: boolean;
  format: "docx" | "pdf";
};

const DEFAULT_OPTS: ExportOptions = {
  includeCover: true,
  includeCrossSection: true,
  includeParameters: true,
  includeProducts: true,
  includeAlternatives: true,
  includeRecommendations: true,
  hideStockCodes: false,
  hideSuppliers: false,
  hideStatus: false,
  format: "docx",
};

export function registerCatalogExportRoutes(app: Express): void {
  app.post(
    "/api/systems/export-catalog",
    authMiddleware,
    requirePasswordChange,
    async (req: Request, res: Response) => {
      try {
        const systemIds: string[] = Array.isArray(req.body?.systemIds) ? req.body.systemIds : [];
        const opts: ExportOptions = { ...DEFAULT_OPTS, ...(req.body?.options || {}) };
        if (!systemIds.length) return res.status(400).json({ error: "systemIds is required (non-empty)" });
        // Hold guard for resolution-time emptiness too; checked after fetch below.

        // ---------- fetch all data in parallel ----------
        const [sysRows, layerRows, optionRows, settingsRows] = await Promise.all([
          db.select().from(systems).where(inArray(systems.systemId, systemIds)),
          db.select().from(systemLayers).where(inArray(systemLayers.systemId, systemIds)),
          (async () => {
            // need layerIds first
            const lr = await db.select({ layerId: systemLayers.layerId })
              .from(systemLayers).where(inArray(systemLayers.systemId, systemIds));
            const layerIds = lr.map((r) => r.layerId);
            if (!layerIds.length) return [] as any[];
            return db.select().from(systemProductOptions).where(inArray(systemProductOptions.layerId, layerIds));
          })(),
          db.select().from(proformaSettings).limit(1),
        ]);

        const productIds = Array.from(new Set(optionRows.map((o: any) => o.productId)));
        const [productRows, tagRows] = await Promise.all([
          productIds.length
            ? db.select().from(products).where(inArray(products.productId, productIds))
            : Promise.resolve([] as any[]),
          productIds.length
            ? db.select().from(productQualificationTags).where(inArray(productQualificationTags.productId, productIds))
            : Promise.resolve([] as any[]),
        ]);

        const productById = new Map<string, any>(productRows.map((p: any) => [p.productId, p]));
        const tagsById = new Map<string, any>(tagRows.map((t: any) => [t.productId, t]));
        const layersBySystem = new Map<string, any[]>();
        for (const l of layerRows) {
          const arr = layersBySystem.get(l.systemId) || [];
          arr.push(l);
          layersBySystem.set(l.systemId, arr);
        }
        for (const arr of layersBySystem.values()) arr.sort((a, b) => (a.orderSequence ?? 0) - (b.orderSequence ?? 0));
        const optionsByLayer = new Map<string, any[]>();
        for (const o of optionRows) {
          const arr = optionsByLayer.get(o.layerId) || [];
          arr.push(o);
          optionsByLayer.set(o.layerId, arr);
        }

        // Preserve requested order so user's selection drives TOC order.
        const sysById = new Map<string, any>(sysRows.map((s: any) => [s.systemId, s]));
        const orderedSystems = systemIds.map((id) => sysById.get(id)).filter(Boolean);
        if (!orderedSystems.length) {
          return res.status(400).json({ error: "No matching systems found for the provided systemIds" });
        }

        const companyName = settingsRows[0]?.companyName || "Flooring & Waterproofing Systems";
        const today = new Date().toISOString().split("T")[0];

        // ---------- build document sections ----------
        const sections: any[] = [];

        // ---- Cover page ----
        if (opts.includeCover) {
          const activeCount = orderedSystems.filter((s) => (s.status || "").toLowerCase() === "active").length;
          const draftCount = orderedSystems.length - activeCount;
          // Material breakdown: detect from system name + layer product names.
          const matCounts: Record<string, number> = { Epoxy: 0, PU: 0, Polyurea: 0, Acrylic: 0 };
          for (const s of orderedSystems) {
            const layers = layersBySystem.get(s.systemId) || [];
            const allText = [s.name, s.description || ""]
              .concat(layers.flatMap((l: any) => (optionsByLayer.get(l.layerId) || []).map((o: any) => productById.get(o.productId)?.name || "")))
              .join(" ");
            const mat = detectMaterial(allText);
            if (mat) matCounts[mat]++;
          }

          const coverChildren: any[] = [
            new Paragraph({
              shading: { type: ShadingType.CLEAR, color: "auto", fill: "0F766E" },
              spacing: { before: 0, after: 0 },
              children: [new TextRun({ text: " ", color: "FFFFFF" })],
            }),
            new Paragraph({
              shading: { type: ShadingType.CLEAR, color: "auto", fill: "0F766E" },
              spacing: { before: 120, after: 120 },
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: companyName, bold: true, size: 36, color: "FFFFFF" })],
            }),
            new Paragraph({
              shading: { type: ShadingType.CLEAR, color: "auto", fill: "0F766E" },
              spacing: { before: 0, after: 120 },
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "TECHNICAL SYSTEMS CATALOG", bold: true, size: 22, color: "CCFBF1", characterSpacing: 50 })],
            }),
            new Paragraph({ spacing: { before: 600 } }),
            plain(`Generated: ${today}`, { size: 22, color: "64748B" }),
            plain(`Systems included: ${orderedSystems.length}  ·  Active: ${activeCount}  ·  Draft: ${draftCount}`, { size: 22, color: "64748B" }),
            plain(
              `Type breakdown — Epoxy: ${matCounts.Epoxy}  ·  PU: ${matCounts.PU}  ·  Polyurea: ${matCounts.Polyurea}  ·  Acrylic: ${matCounts.Acrylic}`,
              { size: 22, color: "64748B" },
            ),
            new Paragraph({ spacing: { before: 400 } }),
            heading("Table of contents", HeadingLevel.HEADING_2, 26),
            new TableOfContents("Systems", {
              hyperlink: true,
              headingStyleRange: "2-2",
              stylesWithLevels: [new StyleLevel("Heading2", 1)],
            }),
            new Paragraph({ children: [new PageBreak()] }),
          ];

          sections.push({
            properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
            children: coverChildren,
          });
        }

        // ---- Per-system pages ----
        for (let idx = 0; idx < orderedSystems.length; idx++) {
          const s = orderedSystems[idx];
          const layers = layersBySystem.get(s.systemId) || [];
          const children: any[] = [];

          // -- system heading (used by TOC) --
          children.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 0, after: 120 },
              children: [new TextRun({ text: s.name, bold: true, size: 32, color: "0F172A" })],
            }),
          );

          // -- badges row --
          const badgeCells: TableCell[] = [];
          const material = detectMaterial(s.name + " " + (s.description || ""));
          if (material) badgeCells.push(badge(material, "DBEAFE", "1E3A8A"));
          if (!opts.hideStatus) {
            const isActive = (s.status || "draft").toLowerCase() === "active";
            badgeCells.push(badge(isActive ? "ACTIVE" : "DRAFT", isActive ? "D1FAE5" : "FEF3C7", isActive ? "065F46" : "92400E"));
          }
          // pad row to 5 cells so widths render predictably
          while (badgeCells.length < 5) {
            badgeCells.push(new TableCell({ borders: borderless(), children: [new Paragraph("")] }));
          }
          if (material || !opts.hideStatus) {
            children.push(
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: borderless(),
                rows: [new TableRow({ children: badgeCells })],
              }),
            );
          }
          if (s.description) {
            children.push(
              new Paragraph({
                spacing: { before: 160, after: 200 },
                children: [new TextRun({ text: s.description, italics: true, size: 20, color: "475569" })],
              }),
            );
          }

          // -- two-column body --
          const leftChildren: any[] = [];
          const rightChildren: any[] = [];

          // LEFT — cross-section + parameters
          if (opts.includeCrossSection) {
            leftChildren.push(subheading("Build-up cross-section"));
            try {
              // Always render every defined layer — the diagram represents
              // the system's build-up structure, independent of which
              // layers happen to have products assigned yet.
              const layerForSvg = layers.map((l: any) => ({ layerName: l.layerName, position: inferLayerPosition(l.layerName) }));
              if (layerForSvg.length === 0) {
                leftChildren.push(plain("No layers defined", { italic: true, color: "94A3B8" }));
              } else {
                const png = await renderCrossSectionPng(layerForSvg);
                leftChildren.push(
                  new Paragraph({
                    children: [
                      new ImageRun({
                        data: png,
                        transformation: { width: 280, height: Math.min(380, 60 + layerForSvg.length * 50) },
                        type: "png",
                      } as any),
                    ],
                  }),
                );
              }
            } catch (err) {
              console.error("[catalog-export] SVG→PNG failed:", err);
              leftChildren.push(plain("Cross-section diagram unavailable", { italic: true, color: "94A3B8" }));
            }
          }
          if (opts.includeParameters) {
            leftChildren.push(subheading("System parameters"));
            const substrateVal = Array.isArray(s.systemSubstrate)
              ? (s.systemSubstrate.length ? s.systemSubstrate.join(", ") : "Not configured")
              : (s.systemSubstrate || "Not configured");
            const dftRange =
              s.totalThicknessMinMm != null || s.totalThicknessMaxMm != null
                ? `${s.totalThicknessMinMm ?? "—"} – ${s.totalThicknessMaxMm ?? "—"} mm`
                : "Not configured";
            leftChildren.push(
              paramTable([
                ["Substrate", substrateVal],
                ["Humidity tolerance", s.systemHumidity || "Not configured"],
                ["Duty rating", s.systemDuty || "Not configured"],
                ["Total thickness", dftRange],
                ["Layers", String(layers.length)],
              ]),
            );
          }

          // RIGHT — layer products. Walk every layer so the catalog
          // structurally mirrors the cross-section on the left; layers
          // without an assigned product get a friendly placeholder.
          if (opts.includeProducts) {
            rightChildren.push(subheading("Layer products"));
            if (layers.length === 0) {
              rightChildren.push(plain("No layers defined.", { italic: true, color: "94A3B8", size: 20 }));
            }
            for (const l of layers) {
              const pos = inferLayerPosition(l.layerName);
              const c = LAYER_COLORS[pos];
              const opts4layer = optionsByLayer.get(l.layerId) || [];
              const def = opts4layer.find((o: any) => o.isDefault) || opts4layer[0];
              const alts = opts4layer.filter((o: any) => o !== def);

              // Layer header row
              const headerTable = new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: thin(c.accent),
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        shading: { type: ShadingType.CLEAR, color: "auto", fill: c.fill },
                        margins: { top: 100, bottom: 100, left: 140, right: 140 },
                        borders: borderless(),
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({ text: `${c.label.toUpperCase()}  ·  `, bold: true, size: 16, color: c.text }),
                              new TextRun({ text: l.layerName, bold: true, size: 20, color: c.text }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              });
              rightChildren.push(headerTable);

              if (!def) {
                rightChildren.push(plain("Contact us for product recommendation.", { italic: true, color: "64748B", size: 18 }));
              } else {
                const prod = productById.get(def.productId) || {};
                const supplier = prod.supplier || prod.brand || "";
                const stockCode = prod.stockCode || prod.productStockCode || "";
                const desc = (prod.description || "").slice(0, 100);

                rightChildren.push(
                  new Paragraph({
                    spacing: { before: 80, after: 40 },
                    children: [new TextRun({ text: prod.name || def.productId, bold: true, size: 22, color: "0F172A" })],
                  }),
                );
                const meta: string[] = [];
                if (!opts.hideSuppliers && supplier) meta.push(`Supplier: ${supplier}`);
                if (!opts.hideStockCodes && stockCode) meta.push(`Code: ${stockCode}`);
                if (meta.length) {
                  rightChildren.push(plain(meta.join("  ·  "), { size: 18, color: "64748B" }));
                }
                if (desc) {
                  rightChildren.push(plain(desc + (prod.description && prod.description.length > 100 ? "…" : ""), { size: 18, color: "475569" }));
                }

                // qualification tags
                const tag = tagsById.get(def.productId);
                if (tag) {
                  const tagBits: string[] = [];
                  const subs = Array.isArray(tag.substrateTypes) ? tag.substrateTypes.filter(Boolean) : [];
                  if (subs.length) tagBits.push(`Substrate: ${subs.join(", ")}`);
                  if (tag.humidityTolerance) tagBits.push(`Humidity: ${tag.humidityTolerance}`);
                  if (tag.dutyRating) tagBits.push(`Duty: ${tag.dutyRating}`);
                  if (tag.finishType) tagBits.push(`Finish: ${tag.finishType}`);
                  if (tagBits.length) {
                    rightChildren.push(plain(tagBits.join("  |  "), { size: 16, color: "64748B", italic: true }));
                  }
                }

                if (opts.includeAlternatives && alts.length) {
                  const altNames = alts
                    .map((a: any) => productById.get(a.productId)?.name || a.productId)
                    .filter(Boolean)
                    .join(", ");
                  rightChildren.push(
                    new Paragraph({
                      spacing: { before: 60, after: 120 },
                      children: [
                        new TextRun({ text: "Alternatives: ", bold: true, size: 16, color: "475569" }),
                        new TextRun({ text: altNames, size: 16, color: "475569" }),
                      ],
                    }),
                  );
                } else {
                  rightChildren.push(new Paragraph({ spacing: { before: 60, after: 120 } }));
                }
              }
            }
          }

          // -- 2-column borderless layout table --
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: borderless(),
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      width: { size: 40, type: WidthType.PERCENTAGE },
                      borders: borderless(),
                      margins: { top: 0, bottom: 0, left: 0, right: 200 },
                      children: leftChildren.length ? leftChildren : [new Paragraph("")],
                    }),
                    new TableCell({
                      width: { size: 60, type: WidthType.PERCENTAGE },
                      borders: borderless(),
                      margins: { top: 0, bottom: 0, left: 200, right: 0 },
                      children: rightChildren.length ? rightChildren : [new Paragraph("")],
                    }),
                  ],
                }),
              ],
            }),
          );

          // -- recommendation box --
          if (opts.includeRecommendations && s.previewNote) {
            children.push(new Paragraph({ spacing: { before: 240 } }));
            children.push(
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: thin("BBF7D0"),
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        shading: { type: ShadingType.CLEAR, color: "auto", fill: "EAF3DE" },
                        margins: { top: 140, bottom: 140, left: 160, right: 160 },
                        borders: thin("BBF7D0"),
                        children: [
                          new Paragraph({ children: [new TextRun({ text: "RECOMMENDATION", bold: true, size: 16, color: "27500A", characterSpacing: 50 })] }),
                          plain(s.previewNote, { size: 20, color: "27500A" }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            );
          }

          // Page break between systems (not after the last one).
          if (idx < orderedSystems.length - 1) {
            children.push(new Paragraph({ children: [new PageBreak()] }));
          }

          sections.push({
            properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
            children,
          });
        }

        const doc = new Document({
          creator: companyName,
          title: "Technical Systems Catalog",
          description: `Catalog of ${orderedSystems.length} system(s) — exported ${today}`,
          sections,
        });

        const buffer = await Packer.toBuffer(doc);
        const fname = `systems-catalog-${today}.docx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
        res.setHeader("Content-Length", String(buffer.length));
        return res.send(buffer);
      } catch (err: any) {
        console.error("[catalog-export] Failed:", err);
        return res.status(500).json({ error: "Failed to generate catalog", details: err?.message });
      }
    },
  );
}
