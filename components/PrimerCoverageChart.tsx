// =============================================================================
// PrimerCoverageChart.tsx
// -----------------------------------------------------------------------------
// Visual heatmap matrix showing which primers cover which substrate ×
// humidity combinations. Each cell holds one chip per matching primer,
// colored by the primer's base chemistry (Epoxy / PU / Bitumen / Silane /
// Acrylic / Other). Tiny dots in the chip corner indicate the compatible
// system types.
//
// View modes:
//   - "Products": one chip per primer, labelled with product name (or
//     just a colored band when "Show names" is off).
//   - "Grouped by base": one chip per base chemistry that appears in
//     the cell, labelled "Epoxy Primer (3)" etc. — useful for a
//     high-level coverage overview when the library is large.
//
// The chart is built as a programmatic SVG (no charting library) so the
// "Export SVG" button can serialize it directly with no canvas rasterizing
// step. PNG and JPG exports go through html2canvas (already installed).
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Download, FileImage, FileText, RefreshCw, Eye, EyeOff, Layers, List } from 'lucide-react';
import { primerLibraryApi, PrimerCoverageChartData, PrimerCoverageChartPrimer } from '../client/api';

// Color scheme per primer base — exact values from the spec.
const BASE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Epoxy:   { bg: '#E6F1FB', border: '#378ADD', text: '#0C447C' },
  PU:      { bg: '#FAEEDA', border: '#BA7517', text: '#633806' },
  Bitumen: { bg: '#F1EFE8', border: '#888780', text: '#444441' },
  Silane:  { bg: '#EAF3DE', border: '#639922', text: '#27500A' },
  Acrylic: { bg: '#EEEDFE', border: '#7F77DD', text: '#26215C' },
  Other:   { bg: '#F1EFE8', border: '#D3D1C7', text: '#888780' },
};

// System-type dot colors painted in the chip's bottom-right corner.
const SYSTEM_TYPE_DOTS: Record<string, string> = {
  Epoxy:    '#378ADD',
  PU:       '#BA7517',
  Polyurea: '#1D9E75',
  Acrylic:  '#7F77DD',
};

// Human-readable label for a primer base in "Grouped" view. We append
// "Primer" so the cell reads naturally ("Epoxy Primer (3)").
const BASE_LABEL: Record<string, string> = {
  Epoxy: 'Epoxy Primer',
  PU: 'PU Primer',
  Bitumen: 'Bitumen Primer',
  Silane: 'Silane Primer',
  Acrylic: 'Acrylic Primer',
  Other: 'Other Primer',
};

// Substrate display order is anchored by the spec so the chart looks the
// same regardless of how vocabularies happen to sort in the database.
const SUBSTRATE_PREFERRED_ORDER = [
  'Concrete', 'Screed', 'Steel', 'Metal', 'Ceramic',
  'Existing Coating', 'Over Primer', 'Over Base Coat',
];

// Chart geometry. CELL_W is wide enough for "Epoxy Primer (12)" or a
// truncated product name. Chips fill the cell with no inset so there
// are no visible gaps between adjacent cells.
const CELL_W = 160;
const CHIP_H = 26;
const CHIP_GAP = 0;          // chips touch — keeps cells tight
const BAND_H = 10;           // height of a colored band when names are hidden
const ROW_LABEL_W = 110;
const HEADER_H = 48;
const PAD = 16;
const MIN_ROW_H = 32;
const MAX_VISIBLE_CHIPS = 4; // beyond this we collapse into "+N more"

// Same hex guard the server uses — keeps unexpected color values out of
// inlined SVG attributes regardless of where the value originated.
const SAFE_HEX_RE = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
const safeColor = (c: string, fallback = '#D3D1C7') =>
  typeof c === 'string' && SAFE_HEX_RE.test(c.trim()) ? c.trim() : fallback;

// SVG-safe text escape.
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

// Bucket a cell's primer list by detected base, preserving a stable
// order that matches the legend. Returns one entry per distinct base.
function groupByBase(primers: PrimerCoverageChartPrimer[]) {
  const buckets = new Map<string, PrimerCoverageChartPrimer[]>();
  for (const p of primers) {
    const k = p.primer_base || 'Other';
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(p);
  }
  const order = ['Epoxy', 'PU', 'Bitumen', 'Silane', 'Acrylic', 'Other'];
  return order
    .filter((b) => buckets.has(b))
    .map((b) => ({ base: b, primers: buckets.get(b)! }));
}

// Truncate a label to the chip's available width.
function fitText(s: string, max = 22): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

const PrimerCoverageChart: React.FC = () => {
  const [data, setData] = useState<PrimerCoverageChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'All' | 'Epoxy' | 'PU' | 'Polyurea' | 'Acrylic'>('All');
  // View / display preferences.
  const [groupMode, setGroupMode] = useState<'products' | 'base'>('products');
  const [showNames, setShowNames] = useState(true);
  const [hiddenSubs, setHiddenSubs] = useState<Set<string>>(new Set());
  const [hiddenHums, setHiddenHums] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState<'rows' | 'cols' | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Click-outside handler for the hide-rows/cols popover.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pickerOpen]);

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
  const visible = useMemo(() => {
    if (!data) return null;
    const cellPrimers = filter === 'All'
      ? data.primers
      : data.primers.filter(p => (p.compatible_system_types || []).includes(filter));

    // Full substrate vocab, preferred order first, with hidden filtered out.
    const allSubs = new Set(data.substrates);
    const orderedSubs = [
      ...SUBSTRATE_PREFERRED_ORDER.filter(s => allSubs.has(s)),
      ...data.substrates.filter(s => !SUBSTRATE_PREFERRED_ORDER.includes(s)),
    ].filter(s => !hiddenSubs.has(s));

    const orderedHums = data.humidities.filter(h => !hiddenHums.has(h));
    const matrix = buildMatrix(cellPrimers);
    const legendBases = ['Epoxy', 'PU', 'Bitumen', 'Silane', 'Acrylic'];

    // For the picker — always offer the full vocab (so the user can
    // un-hide rows even if they've hidden every substrate).
    const allSubsForPicker = [
      ...SUBSTRATE_PREFERRED_ORDER.filter(s => allSubs.has(s)),
      ...data.substrates.filter(s => !SUBSTRATE_PREFERRED_ORDER.includes(s)),
    ];

    return { orderedSubs, orderedHums, matrix, legendBases, cellPrimers, allSubsForPicker };
  }, [data, filter, hiddenSubs, hiddenHums]);

  // ---- SVG dimensions ----
  const dims = useMemo(() => {
    if (!visible) return { width: 0, height: 0, rowHeights: [] as number[] };
    const { orderedSubs, orderedHums, matrix } = visible;
    const chipH = showNames ? CHIP_H : BAND_H;
    const rowHeights = orderedSubs.map((sub) => {
      let maxItems = 0;
      for (const h of orderedHums) {
        const ps = matrix.get(sub)?.get(h) || [];
        const count = groupMode === 'base' ? groupByBase(ps).length : ps.length;
        maxItems = Math.max(maxItems, count);
      }
      const shown = Math.min(maxItems, MAX_VISIBLE_CHIPS + (maxItems > MAX_VISIBLE_CHIPS ? 1 : 0));
      const h = shown === 0
        ? MIN_ROW_H
        : Math.max(MIN_ROW_H, shown * chipH + (shown - 1) * CHIP_GAP);
      return h;
    });
    const width = ROW_LABEL_W + orderedHums.length * CELL_W + PAD * 2;
    const height = HEADER_H + rowHeights.reduce((a, b) => a + b, 0) + PAD * 2;
    return { width, height, rowHeights };
  }, [visible, showNames, groupMode]);

  // ---- Exports ----
  const dateStamp = () => new Date().toISOString().split('T')[0];

  const exportSvg = () => {
    const svgEl = document.getElementById('primer-coverage-svg');
    if (!svgEl) return;
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

  const { orderedSubs, orderedHums, matrix, legendBases, allSubsForPicker } = visible;
  const chipH = showNames ? CHIP_H : BAND_H;

  // Toggle helpers for the row/col hide picker.
  const toggleSub = (s: string) => setHiddenSubs(prev => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });
  const toggleHum = (h: string) => setHiddenHums(prev => {
    const next = new Set(prev);
    if (next.has(h)) next.delete(h); else next.add(h);
    return next;
  });

  // ---- Render ----
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Primer coverage map</h2>
            <p className="text-xs text-slate-500 mt-1">
              {groupMode === 'base'
                ? 'Cells grouped by primer base — one chip per chemistry with a count.'
                : 'One chip per primer · color indicates primer base · dots indicate compatible system types.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => exportRaster('png')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              <FileImage size={14} /> PNG
            </button>
            <button onClick={() => exportRaster('jpg')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-white hover:bg-slate-800">
              <Download size={14} /> JPG
            </button>
            <button onClick={exportSvg} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
              <FileText size={14} /> SVG
            </button>
          </div>
        </div>

        {/* Filter + view controls */}
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
        </div>

        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {/* Group mode toggle */}
          <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-xs">
            <button
              onClick={() => setGroupMode('products')}
              className={`px-3 py-1.5 inline-flex items-center gap-1.5 ${groupMode === 'products' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
            >
              <List size={13} /> Products
            </button>
            <button
              onClick={() => setGroupMode('base')}
              className={`px-3 py-1.5 inline-flex items-center gap-1.5 border-l border-slate-300 ${groupMode === 'base' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
            >
              <Layers size={13} /> Grouped by base
            </button>
          </div>

          {/* Show names toggle — only meaningful in Products mode */}
          {groupMode === 'products' && (
            <button
              onClick={() => setShowNames(v => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              title={showNames ? 'Hide product names (color bands only)' : 'Show product names'}
            >
              {showNames ? <Eye size={13} /> : <EyeOff size={13} />}
              {showNames ? 'Names: on' : 'Names: off'}
            </button>
          )}

          {/* Hide rows / cols picker */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen(o => (o === 'rows' ? null : 'rows'))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              Rows {hiddenSubs.size > 0 && <span className="text-blue-600">({allSubsForPicker.length - hiddenSubs.size}/{allSubsForPicker.length})</span>}
            </button>
            {pickerOpen === 'rows' && (
              <div className="absolute z-20 mt-1 left-0 w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-2 max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between px-1 pb-1 border-b border-slate-100 mb-1">
                  <span className="text-xs font-semibold text-slate-600">Substrates</span>
                  <button onClick={() => setHiddenSubs(new Set())} className="text-xs text-blue-600 hover:underline">Show all</button>
                </div>
                {allSubsForPicker.map(s => (
                  <label key={s} className="flex items-center gap-2 px-1.5 py-1 hover:bg-slate-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!hiddenSubs.has(s)}
                      onChange={() => toggleSub(s)}
                      className="rounded border-slate-300"
                    />
                    <span className="text-xs text-slate-700">{s}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setPickerOpen(o => (o === 'cols' ? null : 'cols'))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              Columns {hiddenHums.size > 0 && <span className="text-blue-600">({data.humidities.length - hiddenHums.size}/{data.humidities.length})</span>}
            </button>
            {pickerOpen === 'cols' && (
              <div className="absolute z-20 mt-1 left-0 w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-2 max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between px-1 pb-1 border-b border-slate-100 mb-1">
                  <span className="text-xs font-semibold text-slate-600">Humidities</span>
                  <button onClick={() => setHiddenHums(new Set())} className="text-xs text-blue-600 hover:underline">Show all</button>
                </div>
                {data.humidities.map(h => (
                  <label key={h} className="flex items-center gap-2 px-1.5 py-1 hover:bg-slate-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!hiddenHums.has(h)}
                      onChange={() => toggleHum(h)}
                      className="rounded border-slate-300"
                    />
                    <span className="text-xs text-slate-700">{h}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {filter !== 'All' && (
            <span className="text-xs text-slate-500">
              Filter applied: empty cells show coverage holes for {filter} systems.
            </span>
          )}
        </div>
      </div>

      {/* Chart — horizontally scrollable when many humidity columns */}
      <div className="overflow-x-auto bg-white">
        <div id="primer-coverage-wrapper" className="inline-block min-w-full p-5 bg-white">
          {orderedSubs.length === 0 || orderedHums.length === 0 ? (
            <div className="text-sm text-slate-500 px-2 py-8 text-center">
              All rows or columns are hidden. Click <strong>Rows</strong> or <strong>Columns</strong> above and pick <em>Show all</em> to restore them.
            </div>
          ) : (
          <svg
            id="primer-coverage-svg"
            xmlns="http://www.w3.org/2000/svg"
            width={dims.width}
            height={dims.height}
            viewBox={`0 0 ${dims.width} ${dims.height}`}
            style={{ fontFamily: 'Helvetica, Arial, sans-serif', display: 'block' }}
            shapeRendering="crispEdges"
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
                stroke="#CBD5E1"
              />
              <text
                x={PAD + 6}
                y={PAD + HEADER_H / 2 + 4}
                fontSize={10}
                fontWeight={700}
                fill="#475569"
              >
                Substrate / Humidity
              </text>
            </g>

            {/* X-axis header — humidity columns. Long labels wrap to 2 lines. */}
            {orderedHums.map((h, ci) => {
              const x = PAD + ROW_LABEL_W + ci * CELL_W;
              const parenIdx = h.indexOf('(');
              const top = parenIdx > 0 ? h.slice(0, parenIdx).trim() : h;
              const bot = parenIdx > 0 ? h.slice(parenIdx).trim() : '';
              return (
                <g key={h}>
                  <rect x={x} y={PAD} width={CELL_W} height={HEADER_H} fill="#F8FAFC" stroke="#CBD5E1" />
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
                    <rect x={PAD} y={rowY} width={ROW_LABEL_W} height={rowH} fill="#F8FAFC" stroke="#CBD5E1" />
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

                      // Always draw the cell outline so the grid looks solid.
                      const outline = (
                        <rect
                          key="bg"
                          x={cellX}
                          y={rowY}
                          width={CELL_W}
                          height={rowH}
                          fill="#FFFFFF"
                          stroke="#CBD5E1"
                        />
                      );

                      if (cellPrimers.length === 0) {
                        return <g key={h}>{outline}</g>;
                      }

                      // Build the list of "items" to render: either one
                      // per primer (Products mode) or one per base
                      // chemistry present in the cell (Grouped mode).
                      const items: { key: string; label: string; tooltip: string; base: string; sysTypes: string[] }[] =
                        groupMode === 'base'
                          ? groupByBase(cellPrimers).map(g => ({
                              key: g.base,
                              label: `${BASE_LABEL[g.base] || g.base} (${g.primers.length})`,
                              tooltip: `${BASE_LABEL[g.base] || g.base}: ${g.primers.map(p => p.product_name || p.primer_id).join(', ')}`,
                              base: g.base,
                              // Union of system types covered by this group.
                              sysTypes: Array.from(new Set(g.primers.flatMap(p => p.compatible_system_types || []))),
                            }))
                          : cellPrimers.map(p => ({
                              key: p.primer_id,
                              label: p.product_name || p.primer_id,
                              tooltip: `${p.product_name || p.primer_id}${p.supplier ? ' · ' + p.supplier : ''}${p.compatible_system_types?.length ? ' · ' + p.compatible_system_types.join(', ') : ''}`,
                              base: p.primer_base,
                              sysTypes: p.compatible_system_types || [],
                            }));

                      const overflow = items.length > MAX_VISIBLE_CHIPS;
                      const shown = overflow ? items.slice(0, MAX_VISIBLE_CHIPS) : items;
                      const totalChips = shown.length + (overflow ? 1 : 0);
                      const stackH = totalChips * chipH + (totalChips - 1) * CHIP_GAP;
                      const startY = rowY + (rowH - stackH) / 2;

                      const chips: React.ReactNode[] = [outline];

                      shown.forEach((it, i) => {
                        const colors = BASE_COLORS[it.base] || BASE_COLORS.Other;
                        const chipX = cellX;          // flush left — no inset
                        const chipY = startY + i * (chipH + CHIP_GAP);
                        const chipW = CELL_W;

                        if (!showNames && groupMode === 'products') {
                          // Color-band only — compact stripe with system dots.
                          chips.push(
                            <g key={it.key}>
                              <title>{it.tooltip}</title>
                              <rect
                                x={chipX}
                                y={chipY}
                                width={chipW}
                                height={chipH}
                                fill={safeColor(colors.bg)}
                                stroke={safeColor(colors.border)}
                                strokeWidth={0.5}
                              />
                              {/* tiny system dots on the right */}
                              {it.sysTypes.slice(0, 4).map((st, di) => {
                                const dotColor = SYSTEM_TYPE_DOTS[st];
                                if (!dotColor) return null;
                                return (
                                  <circle
                                    key={st + di}
                                    cx={chipX + chipW - 5 - di * 6}
                                    cy={chipY + chipH / 2}
                                    r={2}
                                    fill={safeColor(dotColor)}
                                  />
                                );
                              })}
                            </g>,
                          );
                          return;
                        }

                        // Normal labelled chip (Products w/names OR Grouped).
                        chips.push(
                          <g key={it.key}>
                            <title>{it.tooltip}</title>
                            <rect
                              x={chipX}
                              y={chipY}
                              width={chipW}
                              height={chipH}
                              fill={safeColor(colors.bg)}
                              stroke={safeColor(colors.border)}
                              strokeWidth={0.5}
                            />
                            <text
                              x={chipX + 6}
                              y={chipY + chipH / 2 + 3}
                              fontSize={10}
                              fontWeight={groupMode === 'base' ? 600 : 500}
                              fill={safeColor(colors.text, '#0F172A')}
                            >
                              {esc(fitText(it.label, groupMode === 'base' ? 24 : 22))}
                            </text>
                            {/* System type dots — bottom right */}
                            {it.sysTypes.slice(0, 4).map((st, di) => {
                              const dotColor = SYSTEM_TYPE_DOTS[st];
                              if (!dotColor) return null;
                              return (
                                <circle
                                  key={st + di}
                                  cx={chipX + chipW - 6 - di * 6}
                                  cy={chipY + chipH - 5}
                                  r={2.2}
                                  fill={safeColor(dotColor)}
                                />
                              );
                            })}
                          </g>,
                        );
                      });

                      if (overflow) {
                        const moreCount = items.length - MAX_VISIBLE_CHIPS;
                        const chipY = startY + shown.length * (chipH + CHIP_GAP);
                        chips.push(
                          <g key="more">
                            <rect
                              x={cellX}
                              y={chipY}
                              width={CELL_W}
                              height={chipH}
                              fill="#F1F5F9"
                              stroke="#CBD5E1"
                              strokeWidth={0.5}
                            />
                            <text
                              x={cellX + CELL_W / 2}
                              y={chipY + chipH / 2 + 3}
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
          )}

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Legend:</span>
            {legendBases.map((base) => {
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
