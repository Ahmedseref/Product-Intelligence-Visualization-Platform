// =============================================================================
// PrimerCoverageChart.tsx
// -----------------------------------------------------------------------------
// Visual heatmap matrix showing which primers cover which substrate ×
// humidity combinations. Each cell holds one chip per matching primer,
// colored by the primer's base chemistry (Epoxy / PU / Bitumen / Silane /
// Acrylic / Other). Tiny dots in the chip corner indicate the compatible
// system types.
//
// The chart is built as a programmatic SVG (no charting library) so the
// "Export SVG" button can serialize it directly with no canvas rasterizing
// step. PNG and JPG exports go through html2canvas (already installed).
//
// Data: /api/primer-library/coverage-chart (see primerLibraryRoutes.ts).
// The endpoint returns the primer list + the substrate and humidity vocab
// in display order so this component only has to pick which axis values
// actually appear in the data.
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Download, FileImage, FileText, RefreshCw } from 'lucide-react';
import { primerLibraryApi, PrimerCoverageChartData, PrimerCoverageChartPrimer } from '../client/api';

// Color scheme per primer base — exact values from the spec. Each entry
// is used both as inline SVG attributes (chip fill/border/text) and as
// the legend swatch + the docx-export shading on the server.
const BASE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Epoxy:   { bg: '#E6F1FB', border: '#378ADD', text: '#0C447C' },
  PU:      { bg: '#FAEEDA', border: '#BA7517', text: '#633806' },
  Bitumen: { bg: '#F1EFE8', border: '#888780', text: '#444441' },
  Silane:  { bg: '#EAF3DE', border: '#639922', text: '#27500A' },
  Acrylic: { bg: '#EEEDFE', border: '#7F77DD', text: '#26215C' },
  Other:   { bg: '#F1EFE8', border: '#D3D1C7', text: '#888780' },
};

// System-type dot colors painted in the chip's bottom-right corner.
// Limited to 4 indicators per chip (matches the 4 known system types).
const SYSTEM_TYPE_DOTS: Record<string, string> = {
  Epoxy:    '#378ADD',
  PU:       '#BA7517',
  Polyurea: '#1D9E75',
  Acrylic:  '#7F77DD',
};

// Substrate display order is anchored by the spec so the chart looks the
// same regardless of how vocabularies happen to sort in the database.
// Any extra substrates returned by the API are appended afterwards.
const SUBSTRATE_PREFERRED_ORDER = [
  'Concrete', 'Screed', 'Steel', 'Metal', 'Ceramic',
  'Existing Coating', 'Over Primer', 'Over Base Coat',
];

// Chart geometry — fixed values from the spec.
const CELL_W = 110;
const CHIP_H = 28;
const CHIP_GAP = 2;
const ROW_LABEL_W = 100;
const HEADER_H = 48;
const PAD = 16;
const MIN_ROW_H = 36;
const MAX_VISIBLE_CHIPS = 3; // beyond this we collapse into "+N more"

// Same hex guard the server uses — keeps unexpected color values out of
// inlined SVG attributes regardless of where the value originated.
const SAFE_HEX_RE = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
const safeColor = (c: string, fallback = '#D3D1C7') =>
  typeof c === 'string' && SAFE_HEX_RE.test(c.trim()) ? c.trim() : fallback;

// SVG-safe text escape — applied to every dynamic string we drop into a
// <text> node so a stray "<" or "&" never invalidates the export.
const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

// Group primers into a {substrate: {humidity: primer[]}} matrix.
// Multi-substrate primers fan out to one entry per substrate, mirroring
// the heatmap semantics ("this primer covers this substrate/humidity").
function buildMatrix(primers: PrimerCoverageChartPrimer[]): Map<string, Map<string, PrimerCoverageChartPrimer[]>> {
  const m = new Map<string, Map<string, PrimerCoverageChartPrimer[]>>();
  for (const p of primers) {
    const subs = p.compatible_substrates?.length ? p.compatible_substrates : ['Other'];
    const hum = p.humidity_tolerance || 'Dry (0–4%)';
    for (const s of subs) {
      if (!m.has(s)) m.set(s, new Map());
      const row = m.get(s)!;
      if (!row.has(hum)) row.set(hum, []);
      row.get(hum)!.push(p);
    }
  }
  return m;
}

// Truncate stock code to the chip's available label area. The cap is
// 12 chars per the spec, with an ellipsis when we trim. Keeping the
// first 12 chars preserves the most stable prefix (supplier/branch
// codes) of structured stock codes like P.GR.CO.CC.WP.PR.0324.
function fitStockCode(code: string, max = 12): string {
  if (!code) return '';
  return code.length <= max ? code : code.slice(0, max - 1) + '…';
}

const PrimerCoverageChart: React.FC = () => {
  const [data, setData] = useState<PrimerCoverageChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'All' | 'Epoxy' | 'PU' | 'Polyurea' | 'Acrylic'>('All');
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await primerLibraryApi.coverageChart();
        if (!cancelled) setData(d);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load primer coverage chart');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- Derived data ----
  // The chart slices the primer list two ways:
  //   - `axisPrimers` decides which substrates/humidities to show (always
  //     based on the full unfiltered set, so a system-type filter never
  //     removes axis labels — gaps are visible coverage holes).
  //   - `cellPrimers` is the post-filter set used to render chips.
  const visible = useMemo(() => {
    if (!data) return null;
    const axisPrimers = data.primers; // axis labels driven by full set
    const cellPrimers = filter === 'All'
      ? data.primers
      : data.primers.filter(p => (p.compatible_system_types || []).includes(filter));

    // Used substrates: respect the spec's preferred order, drop unused.
    const usedSubsSet = new Set<string>();
    axisPrimers.forEach(p => (p.compatible_substrates || []).forEach(s => usedSubsSet.add(s)));
    const orderedSubs = [
      ...SUBSTRATE_PREFERRED_ORDER.filter(s => usedSubsSet.has(s)),
      ...Array.from(usedSubsSet).filter(s => !SUBSTRATE_PREFERRED_ORDER.includes(s)),
    ];

    // Used humidities: keep the vocabulary's sort_order from the server.
    const usedHumSet = new Set<string>();
    axisPrimers.forEach(p => { if (p.humidity_tolerance) usedHumSet.add(p.humidity_tolerance); });
    const orderedHums = data.humidities.filter(h => usedHumSet.has(h));

    const matrix = buildMatrix(cellPrimers);

    // Used bases for the legend (drawn from the unfiltered set so users
    // can recognise the colors of base types that the filter is hiding).
    const usedBases = Array.from(new Set(axisPrimers.map(p => p.primer_base)))
      .sort((a, b) => Object.keys(BASE_COLORS).indexOf(a) - Object.keys(BASE_COLORS).indexOf(b));

    return { orderedSubs, orderedHums, matrix, usedBases, cellPrimers };
  }, [data, filter]);

  // ---- SVG dimensions ----
  const dims = useMemo(() => {
    if (!visible) return { width: 0, height: 0, rowHeights: [] as number[] };
    const { orderedSubs, orderedHums, matrix } = visible;
    const rowHeights = orderedSubs.map((sub) => {
      let maxChips = 0;
      for (const h of orderedHums) {
        const ps = matrix.get(sub)?.get(h) || [];
        maxChips = Math.max(maxChips, ps.length);
      }
      const shown = Math.min(maxChips, MAX_VISIBLE_CHIPS + (maxChips > MAX_VISIBLE_CHIPS ? 1 : 0));
      const h = shown === 0
        ? MIN_ROW_H
        : Math.max(MIN_ROW_H, shown * CHIP_H + (shown - 1) * CHIP_GAP + 8);
      return h;
    });
    const width = ROW_LABEL_W + orderedHums.length * CELL_W + PAD * 2;
    const height = HEADER_H + rowHeights.reduce((a, b) => a + b, 0) + PAD * 2;
    return { width, height, rowHeights };
  }, [visible]);

  // ---- Exports ----
  const dateStamp = () => new Date().toISOString().split('T')[0];

  const exportSvg = () => {
    const svgEl = document.getElementById('primer-coverage-svg');
    if (!svgEl) return;
    // Clone so we can guarantee xmlns attributes are present even if
    // React's renderer omitted any of them.
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    let str = new XMLSerializer().serializeToString(clone);
    str = `<?xml version="1.0" encoding="UTF-8"?>\n` + str;
    const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
    triggerDownload(URL.createObjectURL(blob), `coverage-chart-${dateStamp()}.svg`);
  };

  const exportRaster = async (format: 'png' | 'jpg') => {
    const wrap = document.getElementById('primer-coverage-wrapper');
    if (!wrap) return;
    const canvas = await html2canvas(wrap, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    canvas.toBlob((blob) => {
      if (!blob) return;
      triggerDownload(URL.createObjectURL(blob), `coverage-chart-${dateStamp()}.${format}`);
    }, mime, format === 'jpg' ? 0.95 : undefined);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <RefreshCw size={16} className="animate-spin" /> Loading primer coverage chart…
        </div>
      </div>
    );
  }
  if (error || !data || !visible) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="text-rose-600 text-sm">{error || 'No primer data available.'}</div>
      </div>
    );
  }

  const { orderedSubs, orderedHums, matrix, usedBases } = visible;

  // ---- Render ----
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Primer coverage map</h2>
            <p className="text-xs text-slate-500 mt-1">
              Each chip represents one primer by stock code · color indicates primer base type · dots indicate compatible system types
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => exportRaster('png')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              <FileImage size={14} /> Export PNG
            </button>
            <button onClick={() => exportRaster('jpg')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-white hover:bg-slate-800">
              <Download size={14} /> Export JPG
            </button>
            <button onClick={exportSvg} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
              <FileText size={14} /> Export SVG
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">System type:</span>
          {(['All', 'Epoxy', 'PU', 'Polyurea', 'Acrylic'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                filter === opt
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {opt}
            </button>
          ))}
          {filter !== 'All' && (
            <span className="text-xs text-slate-500 ml-1">
              Empty cells are intentional — they show coverage holes for {filter} systems.
            </span>
          )}
        </div>
      </div>

      {/* Chart — horizontally scrollable when many humidity columns */}
      <div className="overflow-x-auto bg-white">
        <div id="primer-coverage-wrapper" className="inline-block min-w-full p-5 bg-white">
          <svg
            id="primer-coverage-svg"
            xmlns="http://www.w3.org/2000/svg"
            width={dims.width}
            height={dims.height}
            viewBox={`0 0 ${dims.width} ${dims.height}`}
            style={{ fontFamily: 'Helvetica, Arial, sans-serif', display: 'block' }}
          >
            <rect x={0} y={0} width={dims.width} height={dims.height} fill="#FFFFFF" />

            {/* Top-left header corner */}
            <g>
              <rect
                x={PAD}
                y={PAD}
                width={ROW_LABEL_W}
                height={HEADER_H}
                fill="#F8FAFC"
                stroke="#E2E8F0"
              />
              <text
                x={PAD + 6}
                y={PAD + HEADER_H / 2 + 4}
                fontSize={10}
                fontWeight={700}
                fill="#475569"
              >
                Substrate ↓ / Humidity →
              </text>
            </g>

            {/* X-axis header — humidity columns. Long labels wrap to 2 lines. */}
            {orderedHums.map((h, ci) => {
              const x = PAD + ROW_LABEL_W + ci * CELL_W;
              // Break "Dry (0–4%)" into two lines: name then range.
              const parenIdx = h.indexOf('(');
              const top = parenIdx > 0 ? h.slice(0, parenIdx).trim() : h;
              const bot = parenIdx > 0 ? h.slice(parenIdx).trim() : '';
              return (
                <g key={h}>
                  <rect x={x} y={PAD} width={CELL_W} height={HEADER_H} fill="#F8FAFC" stroke="#E2E8F0" />
                  <text x={x + CELL_W / 2} y={PAD + (bot ? 18 : 26)} fontSize={11} fontWeight={700} fill="#0F172A" textAnchor="middle">
                    {esc(top)}
                  </text>
                  {bot && (
                    <text x={x + CELL_W / 2} y={PAD + 34} fontSize={9} fill="#64748B" textAnchor="middle">
                      {esc(bot)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Rows */}
            {(() => {
              let yCursor = PAD + HEADER_H;
              return orderedSubs.map((sub, ri) => {
                const rowH = dims.rowHeights[ri];
                const rowY = yCursor;
                yCursor += rowH;

                return (
                  <g key={sub}>
                    {/* Y-axis row label */}
                    <rect x={PAD} y={rowY} width={ROW_LABEL_W} height={rowH} fill="#F8FAFC" stroke="#E2E8F0" />
                    <text
                      x={PAD + 6}
                      y={rowY + rowH / 2 + 4}
                      fontSize={11}
                      fontWeight={600}
                      fill="#0F172A"
                    >
                      {esc(sub)}
                    </text>

                    {/* Cells */}
                    {orderedHums.map((h, ci) => {
                      const cellX = PAD + ROW_LABEL_W + ci * CELL_W;
                      const cellPrimers = matrix.get(sub)?.get(h) || [];

                      if (cellPrimers.length === 0) {
                        return (
                          <rect
                            key={h}
                            x={cellX}
                            y={rowY}
                            width={CELL_W}
                            height={rowH}
                            fill="#FFFFFF"
                            stroke="#CBD5E1"
                            strokeDasharray="3 3"
                          />
                        );
                      }

                      const overflow = cellPrimers.length > MAX_VISIBLE_CHIPS;
                      const shown = overflow
                        ? cellPrimers.slice(0, MAX_VISIBLE_CHIPS)
                        : cellPrimers;
                      const chips: React.ReactNode[] = [];
                      const totalChips = shown.length + (overflow ? 1 : 0);
                      const stackH = totalChips * CHIP_H + (totalChips - 1) * CHIP_GAP;
                      const startY = rowY + (rowH - stackH) / 2;

                      // Background cell (so cell boundary is visible).
                      chips.push(
                        <rect
                          key="bg"
                          x={cellX}
                          y={rowY}
                          width={CELL_W}
                          height={rowH}
                          fill="#FFFFFF"
                          stroke="#E2E8F0"
                        />,
                      );

                      shown.forEach((p, i) => {
                        const colors = BASE_COLORS[p.primer_base] || BASE_COLORS.Other;
                        const chipX = cellX + 4;
                        const chipY = startY + i * (CHIP_H + CHIP_GAP);
                        const chipW = CELL_W - 8;
                        const label = fitStockCode(p.stock_code || p.primer_id);
                        chips.push(
                          <g key={p.primer_id}>
                            <title>
                              {`${p.stock_code || p.primer_id} · ${p.product_name}${p.supplier ? ' · ' + p.supplier : ''}${p.compatible_system_types?.length ? ' · ' + p.compatible_system_types.join(', ') : ''}`}
                            </title>
                            <rect
                              x={chipX}
                              y={chipY}
                              width={chipW}
                              height={CHIP_H}
                              rx={4}
                              ry={4}
                              fill={safeColor(colors.bg)}
                              stroke={safeColor(colors.border)}
                              strokeWidth={1}
                            />
                            <text
                              x={chipX + 6}
                              y={chipY + CHIP_H / 2 + 3}
                              fontSize={8}
                              fontFamily="ui-monospace, Menlo, Consolas, monospace"
                              fill={safeColor(colors.text, '#0F172A')}
                            >
                              {esc(label)}
                            </text>
                            {/* System type dots — bottom right, max 4 */}
                            {(p.compatible_system_types || []).slice(0, 4).map((st, di) => {
                              const dotColor = SYSTEM_TYPE_DOTS[st];
                              if (!dotColor) return null;
                              const dotR = 2.5;
                              const dotSpacing = 7;
                              const dotX = chipX + chipW - 6 - di * dotSpacing;
                              const dotY = chipY + CHIP_H - 6;
                              return (
                                <circle
                                  key={st + di}
                                  cx={dotX}
                                  cy={dotY}
                                  r={dotR}
                                  fill={safeColor(dotColor)}
                                />
                              );
                            })}
                          </g>,
                        );
                      });

                      if (overflow) {
                        const moreCount = cellPrimers.length - MAX_VISIBLE_CHIPS;
                        const chipY = startY + shown.length * (CHIP_H + CHIP_GAP);
                        chips.push(
                          <g key="more">
                            <rect
                              x={cellX + 4}
                              y={chipY}
                              width={CELL_W - 8}
                              height={CHIP_H}
                              rx={4}
                              ry={4}
                              fill="#F1F5F9"
                              stroke="#94A3B8"
                              strokeWidth={1}
                            />
                            <text
                              x={cellX + CELL_W / 2}
                              y={chipY + CHIP_H / 2 + 3}
                              fontSize={9}
                              fill="#475569"
                              textAnchor="middle"
                              fontWeight={600}
                            >
                              +{moreCount} more
                            </text>
                          </g>,
                        );
                      }

                      return <g key={h}>{chips}</g>;
                    })}
                  </g>
                );
              });
            })()}
          </svg>

          {/* Legend — only base types that actually appear */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Legend:</span>
            {usedBases.map((base) => {
              const c = BASE_COLORS[base] || BASE_COLORS.Other;
              return (
                <div key={base} className="flex items-center gap-1.5">
                  <span
                    className="inline-block rounded-sm"
                    style={{
                      width: 12,
                      height: 12,
                      background: c.bg,
                      border: `1.5px solid ${c.border}`,
                    }}
                  />
                  <span className="text-xs text-slate-700">{base}</span>
                </div>
              );
            })}
            <span className="text-xs text-slate-400 ml-3">·</span>
            <span className="text-xs text-slate-500">System dots:</span>
            {Object.entries(SYSTEM_TYPE_DOTS).map(([st, color]) => (
              <div key={st} className="flex items-center gap-1.5">
                <span
                  className="inline-block rounded-full"
                  style={{ width: 8, height: 8, background: color }}
                />
                <span className="text-xs text-slate-700">{st}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrimerCoverageChart;
