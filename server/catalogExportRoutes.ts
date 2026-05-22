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
  primerLibrary,
  treeNodes,
  qualificationVocabularies,
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
  TableOfContents,
  StyleLevel,
  Footer,
  PageNumber,
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

// Per-material color theme. Drives the system header banner color, the
// chemistry badge, the recommendation box border and the page border so
// every system reads as a visually distinct "chapter" in the catalog.
// Colors are picked for high contrast on white and to stay readable on
// a light fill underneath dark text.
type SystemTheme = {
  primary: string;   // banner / page border / accent
  fill: string;      // light header background
  text: string;      // dark text on fill
  badgeFill: string; // chemistry badge fill
  badgeText: string; // chemistry badge text
  label: string;     // pretty material label
};

const MATERIAL_THEMES: Record<string, SystemTheme> = {
  Epoxy:    { primary: "1D4ED8", fill: "DBEAFE", text: "1E3A8A", badgeFill: "DBEAFE", badgeText: "1E3A8A", label: "Epoxy"    },
  PU:       { primary: "7C3AED", fill: "EDE9FE", text: "5B21B6", badgeFill: "EDE9FE", badgeText: "5B21B6", label: "PU"       },
  Polyurea: { primary: "C2410C", fill: "FFEDD5", text: "9A3412", badgeFill: "FFEDD5", badgeText: "9A3412", label: "Polyurea" },
  Acrylic:  { primary: "BE185D", fill: "FCE7F3", text: "9D174D", badgeFill: "FCE7F3", badgeText: "9D174D", label: "Acrylic"  },
};
const DEFAULT_THEME: SystemTheme = {
  primary: "0F766E", fill: "CCFBF1", text: "115E59", badgeFill: "CCFBF1", badgeText: "115E59", label: "System",
};
function themeFor(material: string | null): SystemTheme {
  return (material && MATERIAL_THEMES[material]) || DEFAULT_THEME;
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
      // Avoid "Primer — Primer" when the layer name already matches the
      // position label (case-insensitive). Show just one of them.
      const posLabel = LAYER_COLORS[l.position]?.label || "Layer";
      const sameAsName = (l.layerName || "").trim().toLowerCase() === posLabel.toLowerCase();
      const label = sameAsName
        ? escapeXml(l.layerName)
        : `${posLabel} — ${escapeXml(l.layerName)}`;
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

// Page footer: thin top border, company contact line on the left, page
// "N of M" on the right. Color matches the section theme so each system's
// footer reads as part of that system's chapter.
function buildPageFooter(
  theme: SystemTheme,
  contact: { name: string; address: string; phone: string; email: string },
): Footer {
  // Build a compact contact line — skip empty fields so we don't leave
  // dangling separators.
  const contactBits = [contact.name, contact.address, contact.phone, contact.email]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join("  ·  ");

  return new Footer({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 6, color: theme.primary },
          bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 80, type: WidthType.PERCENTAGE },
                borders: borderless(),
                margins: { top: 80, bottom: 0, left: 0, right: 0 },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: contactBits, size: 14, color: "64748B" })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 20, type: WidthType.PERCENTAGE },
                borders: borderless(),
                margins: { top: 80, bottom: 0, left: 0, right: 0 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun({ text: "Page ", size: 14, color: "64748B" }),
                      new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "64748B" }),
                      new TextRun({ text: " of ", size: 14, color: "64748B" }),
                      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: "64748B" }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// Page-border block for a section. We use a thin solid frame in the
// theme color, offset slightly from the edge so it doesn't get clipped
// by printers.
function pageBordersFor(theme: SystemTheme) {
  const border = { style: BorderStyle.SINGLE, size: 12, color: theme.primary, space: 16 };
  return {
    pageBorderTop: border,
    pageBorderRight: border,
    pageBorderBottom: border,
    pageBorderLeft: border,
  };
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
  // When true, append a "Primer Selection Reference" page at the end of
  // the catalog summarising primer coverage by substrate × humidity.
  includePrimerChart: boolean;
  hideStockCodes: boolean;
  hideSuppliers: boolean;
  hideStatus: boolean;
  // When true, the bold product-name line and the "Alternatives: ..."
  // paragraph are both omitted from each layer card so the catalog
  // shows only generic layer categories. Useful for customer-facing
  // technical proposals where the brand/SKU should stay private.
  hideProductNames: boolean;
  format: "docx" | "pdf";
};

const DEFAULT_OPTS: ExportOptions = {
  includeCover: true,
  includeCrossSection: true,
  includeParameters: true,
  includeProducts: true,
  includeAlternatives: true,
  includeRecommendations: true,
  includePrimerChart: true,
  hideStockCodes: false,
  hideSuppliers: false,
  hideStatus: false,
  hideProductNames: false,
  format: "docx",
};

// ─── Primer base detection + colors ──────────────────────────────────────
// Mirrors components/PrimerCoverageChart.tsx + the /coverage-chart endpoint
// so the catalog page uses the same chemistry classification and palette
// as the on-screen chart. Kept here as plain constants (no import) to
// avoid pulling client code into the server bundle.
const PRIMER_BASE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Epoxy:   { bg: "E6F1FB", border: "378ADD", text: "0C447C" },
  PU:      { bg: "FAEEDA", border: "BA7517", text: "633806" },
  Bitumen: { bg: "F1EFE8", border: "888780", text: "444441" },
  Silane:  { bg: "EAF3DE", border: "639922", text: "27500A" },
  Acrylic: { bg: "EEEDFE", border: "7F77DD", text: "26215C" },
  Other:   { bg: "F1EFE8", border: "D3D1C7", text: "888780" },
};
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

// -----------------------------------------------------------------------------
// Primer Selection Reference page (docx section)
// -----------------------------------------------------------------------------
// Reads primer_library + products + tree_nodes + qualification vocabularies
// and produces a single-page substrate × humidity matrix. Cells list the
// primers (stock_code – product_name) that cover that combination, shaded
// by the primer's detected base chemistry. Returns null when there are no
// primers to chart so the caller can skip the page entirely.
async function buildPrimerChartSection(
  theme: SystemTheme,
  contact: { name: string; address: string; phone: string; email: string },
): Promise<any | null> {
  // Pull everything in parallel — these are independent reads.
  const [primerRows, vocabRows, allNodes] = await Promise.all([
    db
      .select({ row: primerLibrary, product: products })
      .from(primerLibrary)
      .leftJoin(products, eq(products.productId, primerLibrary.productId))
      .where(eq(primerLibrary.isActive, true)),
    db.select().from(qualificationVocabularies).where(eq(qualificationVocabularies.isActive, true)),
    db
      .select({ nodeId: treeNodes.nodeId, name: treeNodes.name, parentId: treeNodes.parentId })
      .from(treeNodes),
  ]);

  if (primerRows.length === 0) return null;

  // Compute taxonomy paths for primer-base detection (matches /coverage-chart).
  const nodeMap = new Map(allNodes.map(n => [n.nodeId, n] as const));
  const pathCache = new Map<string, string>();
  function pathFor(nodeId: string | null | undefined): string {
    if (!nodeId) return "";
    if (pathCache.has(nodeId)) return pathCache.get(nodeId)!;
    const parts: string[] = [];
    let cur = nodeMap.get(nodeId);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.nodeId)) {
      parts.unshift(cur.name);
      seen.add(cur.nodeId);
      cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined;
    }
    const p = parts.join(" > ");
    pathCache.set(nodeId, p);
    return p;
  }

  // Normalised primer list with derived base + stock-code-first label.
  const primers = primerRows.map(({ row, product }) => ({
    label: (product?.stockCode || row.primerId || "").trim(),
    name: row.productName || product?.name || "",
    substrates: row.compatibleSubstrates || [],
    humidity: row.humidityTolerance || "",
    base: detectPrimerBase(product?.name || "", product?.description || "", pathFor(product?.nodeId)),
  }));

  // Build axes from the FULL vocabulary (not just values that already
  // appear in the library) so the printed reference page shows every
  // substrate × humidity combination, including empty ones the user
  // can fill in later. Preferred substrates float to the top.
  const SUBSTRATE_ORDER = ["Concrete", "Screed", "Steel", "Metal", "Ceramic", "Existing Coating", "Over Primer", "Over Base Coat"];
  const allSubs = vocabRows
    .filter(v => v.vocabType === "substrate")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(v => v.value);
  const allSubsSet = new Set(allSubs);
  const substrates = [
    ...SUBSTRATE_ORDER.filter(s => allSubsSet.has(s)),
    ...allSubs.filter(s => !SUBSTRATE_ORDER.includes(s)),
  ];
  const humidities = vocabRows
    .filter(v => v.vocabType === "humidity")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(v => v.value);

  if (substrates.length === 0 || humidities.length === 0) return null;

  // Cells: stock-code chips listed line-by-line. Cell shading is set
  // from the *first* primer in the cell (mixed-base cells are rare; the
  // chip text itself shows each base color via inline TextRun color).
  function cellFor(substrate: string, humidity: string) {
    const matching = primers.filter(
      p => p.substrates.includes(substrate) && p.humidity === humidity,
    );
    if (matching.length === 0) {
      return new TableCell({
        width: { size: Math.floor(100 / (humidities.length + 1)), type: WidthType.PERCENTAGE },
        margins: { top: 80, bottom: 80, left: 80, right: 80 },
        borders: thinDashed(),
        children: [new Paragraph({ children: [new TextRun({ text: "—", color: "CBD5E1", size: 16 })] })],
      });
    }
    const firstBase = PRIMER_BASE_COLORS[matching[0].base] || PRIMER_BASE_COLORS.Other;
    return new TableCell({
      width: { size: Math.floor(100 / (humidities.length + 1)), type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: firstBase.bg },
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      borders: thinSolid(firstBase.border),
      children: matching.map(p => {
        const c = PRIMER_BASE_COLORS[p.base] || PRIMER_BASE_COLORS.Other;
        return new Paragraph({
          spacing: { before: 20, after: 20 },
          children: [
            // Stock code intentionally hidden from the printed chart —
            // product name only, matching the on-screen chip.
            new TextRun({ text: p.name || p.label || "—", bold: true, size: 14, color: c.text }),
          ],
        });
      }),
    });
  }

  // Header row: blank corner + one cell per humidity column.
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        width: { size: Math.floor(100 / (humidities.length + 1)), type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: theme.fill },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        borders: thinSolid(theme.primary),
        children: [new Paragraph({ children: [new TextRun({ text: "Substrate ↓ / Humidity →", bold: true, size: 16, color: theme.text })] })],
      }),
      ...humidities.map(h => new TableCell({
        width: { size: Math.floor(100 / (humidities.length + 1)), type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: theme.fill },
        margins: { top: 80, bottom: 80, left: 80, right: 80 },
        borders: thinSolid(theme.primary),
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, size: 14, color: theme.text })] })],
      })),
    ],
  });

  // Body rows: substrate label + one cell per humidity column.
  const bodyRows = substrates.map(s =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: Math.floor(100 / (humidities.length + 1)), type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: "F8FAFC" },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          borders: thinSolid("CBD5E1"),
          children: [new Paragraph({ children: [new TextRun({ text: s, bold: true, size: 16, color: "0F172A" })] })],
        }),
        ...humidities.map(h => cellFor(s, h)),
      ],
    }),
  );

  // Legend paragraphs — always show every supported primer base so the
  // reader can recognise bases that are not in the library yet (e.g.
  // Bitumen / Silane often come from the taxonomy tree only).
  const usedBases = ["Epoxy", "PU", "Bitumen", "Silane", "Acrylic"];
  const legendRuns: any[] = [new TextRun({ text: "Legend: ", bold: true, size: 16, color: "475569" })];
  usedBases.forEach((b, i) => {
    const c = PRIMER_BASE_COLORS[b] || PRIMER_BASE_COLORS.Other;
    if (i > 0) legendRuns.push(new TextRun({ text: "   ", size: 16 }));
    legendRuns.push(new TextRun({ text: "■ ", size: 18, color: c.border }));
    legendRuns.push(new TextRun({ text: b, size: 16, color: "475569" }));
  });

  const children: any[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: "Primer Selection Reference", bold: true, size: 28, color: theme.text })],
    }),
    plain("Substrate × humidity coverage map for the active primer library. Cell color indicates the primer base chemistry.", { size: 18, color: "64748B" }),
    new Paragraph({ spacing: { before: 160 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...bodyRows],
    }),
    new Paragraph({ spacing: { before: 200 }, children: legendRuns }),
  ];

  return {
    properties: {
      page: {
        // Landscape orientation gives us room for many humidity columns
        // without crushing the cell text. A4 dimensions in twentieths
        // of a point: 16838 × 11906 (landscape).
        size: { width: 16838, height: 11906, orientation: "landscape" as const },
        margin: { top: 720, bottom: 1000, left: 720, right: 720 },
        borders: pageBordersFor(theme),
      },
    },
    footers: { default: buildPageFooter(theme, contact) },
    children,
  };
}

// Thin solid border helper used by the primer chart cells.
function thinSolid(colorHex: string) {
  return {
    top:    { style: BorderStyle.SINGLE, size: 6, color: colorHex },
    bottom: { style: BorderStyle.SINGLE, size: 6, color: colorHex },
    left:   { style: BorderStyle.SINGLE, size: 6, color: colorHex },
    right:  { style: BorderStyle.SINGLE, size: 6, color: colorHex },
  };
}
// Dashed border for empty (no-primer) cells so coverage holes are
// visually obvious in the printed reference page.
function thinDashed() {
  return {
    top:    { style: BorderStyle.DASHED, size: 4, color: "CBD5E1" },
    bottom: { style: BorderStyle.DASHED, size: 4, color: "CBD5E1" },
    left:   { style: BorderStyle.DASHED, size: 4, color: "CBD5E1" },
    right:  { style: BorderStyle.DASHED, size: 4, color: "CBD5E1" },
  };
}

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

        // Company contact block sourced from Proforma Invoice Settings.
        // Falls back to friendly defaults when the row is missing so the
        // export never breaks on a fresh install.
        const settings = settingsRows[0] || ({} as any);
        const companyName = settings.companyName || "Flooring & Waterproofing Systems";
        const companyAddress = settings.address || "";
        const companyPhone = settings.phone || "";
        const companyEmail = settings.email || "";
        const contact = { name: companyName, address: companyAddress, phone: companyPhone, email: companyEmail };
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

          // Cover sizes are deliberately tight so the banner, the catalog
          // summary, the company contact block, and the table of contents
          // all fit on a single A4 page. If you grow any of these blocks,
          // shrink another to keep the one-page guarantee.
          const coverChildren: any[] = [
            new Paragraph({
              shading: { type: ShadingType.CLEAR, color: "auto", fill: "0F766E" },
              spacing: { before: 80, after: 80 },
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: companyName, bold: true, size: 28, color: "FFFFFF" })],
            }),
            new Paragraph({
              shading: { type: ShadingType.CLEAR, color: "auto", fill: "0F766E" },
              spacing: { before: 0, after: 80 },
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "TECHNICAL SYSTEMS CATALOG", bold: true, size: 16, color: "CCFBF1", characterSpacing: 50 })],
            }),
            // Company contact block — only render rows that exist, so a
            // missing address/phone/email doesn't leave a blank line.
            ...((companyAddress || companyPhone || companyEmail)
              ? [
                  new Paragraph({ spacing: { before: 200, after: 40 } }),
                  ...(companyAddress ? [plain(companyAddress, { size: 18, color: "475569" })] : []),
                  ...((companyPhone || companyEmail)
                    ? [plain(
                        [companyPhone, companyEmail].filter(Boolean).join("  ·  "),
                        { size: 18, color: "475569" },
                      )]
                    : []),
                ]
              : []),
            new Paragraph({ spacing: { before: 240 } }),
            plain(`Generated: ${today}`, { size: 18, color: "64748B" }),
            plain(`Systems included: ${orderedSystems.length}  ·  Active: ${activeCount}  ·  Draft: ${draftCount}`, { size: 18, color: "64748B" }),
            plain(
              `Type breakdown — Epoxy: ${matCounts.Epoxy}  ·  PU: ${matCounts.PU}  ·  Polyurea: ${matCounts.Polyurea}  ·  Acrylic: ${matCounts.Acrylic}`,
              { size: 18, color: "64748B" },
            ),
            new Paragraph({ spacing: { before: 200 } }),
            heading("Table of contents", HeadingLevel.HEADING_2, 20),
            new TableOfContents("Systems", {
              hyperlink: true,
              headingStyleRange: "2-2",
              stylesWithLevels: [new StyleLevel("Heading2", 1)],
            }),
            // No explicit PageBreak here — each system uses its own
            // docx section, which naturally starts on a new page.
          ];

          sections.push({
            properties: {
              page: {
                margin: { top: 720, bottom: 1000, left: 720, right: 720 },
                borders: pageBordersFor(DEFAULT_THEME),
              },
            },
            footers: { default: buildPageFooter(DEFAULT_THEME, contact) },
            children: coverChildren,
          });
        }

        // ---- Per-system pages ----
        for (let idx = 0; idx < orderedSystems.length; idx++) {
          const s = orderedSystems[idx];
          const layers = layersBySystem.get(s.systemId) || [];
          const children: any[] = [];

          // Detect chemistry early and resolve the theme — drives the
          // heading color, badge color, recommendation box border, page
          // border, and footer accent for this system. We look at the
          // system name + description + every layer-product name so we
          // catch systems whose name doesn't spell out the chemistry.
          const sysAllText = [s.name, s.description || ""]
            .concat(layers.flatMap((l: any) =>
              (optionsByLayer.get(l.layerId) || []).map((o: any) => productById.get(o.productId)?.name || "")))
            .join(" ");
          const material = detectMaterial(sysAllText);
          const theme = themeFor(material);

          // -- system heading (used by TOC) --
          // Heading2 style is required so the TOC picks it up; we keep
          // that, but tint the title in the theme color and add a thin
          // themed band above it so each chapter reads as a distinct
          // color block.
          children.push(
            new Paragraph({
              shading: { type: ShadingType.CLEAR, color: "auto", fill: theme.fill },
              spacing: { before: 0, after: 0 },
              children: [new TextRun({ text: " ", size: 6 })],
            }),
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              shading: { type: ShadingType.CLEAR, color: "auto", fill: theme.fill },
              spacing: { before: 80, after: 80 },
              children: [new TextRun({ text: s.name, bold: true, size: 30, color: theme.text })],
            }),
          );

          // -- badges row --
          const badgeCells: TableCell[] = [];
          if (material) badgeCells.push(badge(material, theme.badgeFill, theme.badgeText));
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
                              // When the layer name duplicates the position label
                              // (e.g. layerName "Primer" for position "primer"),
                              // collapse to a single label to avoid "PRIMER · Primer".
                              ...((l.layerName || "").trim().toLowerCase() === c.label.toLowerCase()
                                ? [new TextRun({ text: c.label.toUpperCase(), bold: true, size: 20, color: c.text })]
                                : [
                                    new TextRun({ text: `${c.label.toUpperCase()}  ·  `, bold: true, size: 16, color: c.text }),
                                    new TextRun({ text: l.layerName, bold: true, size: 20, color: c.text }),
                                  ]),
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
                // When hiding product names entirely, drop the
                // "Contact us..." placeholder too — the layer-category
                // header is the only thing the customer should see.
                if (!opts.hideProductNames) {
                  rightChildren.push(plain("Contact us for product recommendation.", { italic: true, color: "64748B", size: 18 }));
                }
              } else {
                const prod = productById.get(def.productId) || {};
                const supplier = prod.supplier || prod.brand || "";
                const stockCode = prod.stockCode || prod.productStockCode || "";
                const desc = (prod.description || "").slice(0, 100);

                // Skip the bold product-name heading when the customer
                // wants only generic layer info. Supplier / stock-code
                // meta keep their own dedicated hide toggles so a user
                // can still allow brand visibility without the SKU.
                if (!opts.hideProductNames) {
                  rightChildren.push(
                    new Paragraph({
                      spacing: { before: 80, after: 40 },
                      children: [new TextRun({ text: prod.name || def.productId, bold: true, size: 22, color: "0F172A" })],
                    }),
                  );
                }
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

                if (opts.includeAlternatives && !opts.hideProductNames && alts.length) {
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

          // -- recommendation box -- (themed to the system's chemistry)
          if (opts.includeRecommendations && s.previewNote) {
            children.push(new Paragraph({ spacing: { before: 240 } }));
            children.push(
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: thin(theme.primary),
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        shading: { type: ShadingType.CLEAR, color: "auto", fill: theme.fill },
                        margins: { top: 140, bottom: 140, left: 160, right: 160 },
                        borders: thin(theme.primary),
                        children: [
                          new Paragraph({ children: [new TextRun({ text: "RECOMMENDATION", bold: true, size: 16, color: theme.text, characterSpacing: 50 })] }),
                          plain(s.previewNote, { size: 20, color: theme.text }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            );
          }

          // Each system is its own docx section, so Word starts it on a
          // fresh page automatically — no manual PageBreak required.

          sections.push({
            properties: {
              page: {
                margin: { top: 720, bottom: 1000, left: 720, right: 720 },
                borders: pageBordersFor(theme),
              },
            },
            footers: { default: buildPageFooter(theme, contact) },
            children,
          });
        }

        // ---- Primer Selection Reference (optional, appended last) ----
        // Mirrors the on-screen Primer Coverage Chart: a substrate × humidity
        // table whose cells list the matching primers' stock codes shaded by
        // their detected primer base (Epoxy / PU / Bitumen / Silane / etc.).
        // Skipped silently when the toggle is off or when no primer-library
        // entries exist — the page would otherwise show an empty grid.
        if (opts.includePrimerChart) {
          try {
            const primerSection = await buildPrimerChartSection(DEFAULT_THEME, contact);
            if (primerSection) sections.push(primerSection);
          } catch (e) {
            // Don't let a primer-chart failure block the whole export.
            console.warn("[catalog-export] primer chart skipped:", e);
          }
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
