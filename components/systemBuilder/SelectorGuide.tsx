// =============================================================================
// SelectorGuide.tsx
// -----------------------------------------------------------------------------
// "Selector Guide by Application / Environment" — an editable matrix that
// pairs SYSTEMS (columns, each with its own color) against APPLICATIONS
// (rows). A dot at the intersection means "this system suits this
// application". Modeled after the printed PPG flooring selector chart.
//
// Behavior:
//  - Click a cell to toggle its dot (colored with the column's color).
//  - Header & row names are inline-editable (blur to save).
//  - Add/remove columns or rows with the toolbar buttons.
//  - Each column has a color picker (native <input type="color">).
//  - Every mutation autosaves to the server (debounced) so the user
//    never has to hit "Save".
//  - Export PNG / JPG (html2canvas) and SVG (manual SVG builder so we
//    get a true vector file instead of a rasterized DOM screenshot).
//
// Persistence: a single JSON doc via /api/selector-guide (see
// selectorGuideRoutes.ts). The full document is sent on every save —
// the payload is tiny and avoids partial-update conflict handling.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Plus, Trash2, Download, RefreshCw, FileImage, FileText } from 'lucide-react';
import { selectorGuideApi, SelectorGuideDoc } from '../../client/api';

// Curated palette used when adding a new system. Picked for visual
// separation on white and to mirror the original PPG chart palette.
const NEW_SYSTEM_PALETTE = [
  '#22C55E', '#38BDF8', '#F97316', '#1E3A8A', '#7C3AED',
  '#0F766E', '#EA580C', '#DC2626', '#A16207', '#9333EA',
  '#0891B2', '#BE185D', '#15803D', '#1D4ED8', '#B45309',
];

// Short, stable id generator. We don't need crypto-grade uniqueness —
// just collision-free within one document for stable cell keys.
function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

const cellKey = (appId: string, sysId: string) => `${appId}:${sysId}`;

// Trigger a browser download for a Blob — used by all three exports.
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Build a real SVG mirror of the rendered chart. We rebuild it from the
// model (not the DOM) so the output is a clean, editable vector with
// real text nodes — perfect for opening in Illustrator / Figma.
// Mirrors the server-side validator so we never inline an unvetted
// color string into raw SVG attributes (avoids both invalid XML and
// any chance of attribute-injection in downloaded files).
const SAFE_HEX_RE = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
const safeColor = (c: string, fallback = '#64748B') =>
  typeof c === 'string' && SAFE_HEX_RE.test(c.trim()) ? c.trim() : fallback;

function buildSvg(doc: SelectorGuideDoc): string {
  const COL_W = 130;     // each system column
  const ROW_H = 56;      // each application row
  const ROW_LABEL_W = 260;
  const HEADER_H = 110;
  const PAD = 16;
  const W = ROW_LABEL_W + COL_W * doc.systems.length + PAD * 2;
  const H = HEADER_H + ROW_H * doc.applications.length + PAD * 2 + 40; // +title

  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>`);

  // Title
  parts.push(
    `<text x="${PAD}" y="${PAD + 22}" font-size="22" font-weight="700" fill="#0F172A">${esc(doc.title)}</text>`,
  );

  const gridX = PAD;
  const gridY = PAD + 40;

  // Header: row-label cell + one cell per system column.
  // The system header takes the system's color as its fill.
  parts.push(
    `<rect x="${gridX}" y="${gridY}" width="${ROW_LABEL_W}" height="${HEADER_H}" fill="#F8FAFC" stroke="#E2E8F0"/>`,
    `<text x="${gridX + 12}" y="${gridY + 28}" font-size="13" font-weight="700" fill="#475569">SYSTEMS</text>`,
    `<text x="${gridX + 12}" y="${gridY + 50}" font-size="11" fill="#64748B">Applications ↓</text>`,
  );

  doc.systems.forEach((sys, i) => {
    const x = gridX + ROW_LABEL_W + i * COL_W;
    const color = safeColor(sys.color);
    parts.push(
      `<rect x="${x}" y="${gridY}" width="${COL_W}" height="${HEADER_H}" fill="${color}" stroke="#FFFFFF"/>`,
    );
    // Wrap header text into up to 3 lines so long system names render
    // cleanly inside the column rather than overflowing.
    const words = sys.name.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > 14 && line) {
        lines.push(line);
        line = w;
      } else {
        line = (line + ' ' + w).trim();
      }
      if (lines.length >= 2) break;
    }
    if (line) lines.push(line);
    const startY = gridY + HEADER_H / 2 - (lines.length - 1) * 9;
    lines.forEach((ln, li) => {
      parts.push(
        `<text x="${x + COL_W / 2}" y="${startY + li * 18}" text-anchor="middle" font-size="13" font-weight="700" fill="#FFFFFF">${esc(ln)}</text>`,
      );
    });
  });

  // Rows: application name + dot cells
  doc.applications.forEach((app, ri) => {
    const y = gridY + HEADER_H + ri * ROW_H;
    parts.push(
      `<rect x="${gridX}" y="${y}" width="${ROW_LABEL_W}" height="${ROW_H}" fill="${ri % 2 === 0 ? '#FFFFFF' : '#F8FAFC'}" stroke="#E2E8F0"/>`,
      `<text x="${gridX + 12}" y="${y + ROW_H / 2 + 5}" font-size="13" fill="#0F172A">${esc(app.name)}</text>`,
    );
    doc.systems.forEach((sys, ci) => {
      const x = gridX + ROW_LABEL_W + ci * COL_W;
      parts.push(
        `<rect x="${x}" y="${y}" width="${COL_W}" height="${ROW_H}" fill="${ri % 2 === 0 ? '#FFFFFF' : '#F8FAFC'}" stroke="#E2E8F0"/>`,
      );
      if (doc.cells[cellKey(app.id, sys.id)]) {
        parts.push(
          `<circle cx="${x + COL_W / 2}" cy="${y + ROW_H / 2}" r="11" fill="${safeColor(sys.color)}"/>`,
        );
      }
    });
  });

  parts.push(`</svg>`);
  return parts.join('\n');
}

const SelectorGuide: React.FC = () => {
  const [doc, setDoc] = useState<SelectorGuideDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic save-request token. We bump it on every scheduled save and
  // ignore any in-flight response whose token is no longer current —
  // that prevents an older PUT that finished last from clobbering a
  // newer edit. Combined with the debounce, this gives us last-write-
  // wins-by-edit-order semantics without an ETag round-trip.
  const saveSeq = useRef(0);
  // The container we screenshot for PNG/JPG export. Excludes the
  // delete-X overlays so the exported chart is clean.
  const chartRef = useRef<HTMLDivElement | null>(null);
  // Tracks which header/row cell is being edited so we render an input
  // instead of a label. null means nothing is being edited.
  const [editing, setEditing] = useState<{ kind: 'title' } | { kind: 'system'; id: string } | { kind: 'app'; id: string } | null>(null);
  const [exportMode, setExportMode] = useState(false);

  // ---- Load ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetched = await selectorGuideApi.get();
        if (!cancelled) setDoc(fetched);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load selector guide');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- Debounced autosave ----
  // Every mutation calls scheduleSave; we coalesce rapid edits into a
  // single PUT 500ms after the last change.
  const scheduleSave = useCallback((next: SelectorGuideDoc) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSavingState('saving');
    const myToken = ++saveSeq.current;
    saveTimer.current = setTimeout(async () => {
      try {
        await selectorGuideApi.save(next);
        // Only the latest in-flight save is allowed to clear the
        // "saving" indicator. Older responses arriving late are ignored.
        if (myToken !== saveSeq.current) return;
        setSavingState('saved');
        setTimeout(() => setSavingState((s) => (s === 'saved' ? 'idle' : s)), 1500);
      } catch (e: any) {
        if (myToken !== saveSeq.current) return;
        setError(e?.message || 'Failed to save selector guide');
        setSavingState('idle');
      }
    }, 500);
  }, []);

  // Universal updater — keeps the local state and the autosave call in
  // lock-step so the user never sees stale state.
  const update = useCallback((mut: (prev: SelectorGuideDoc) => SelectorGuideDoc) => {
    setDoc((prev) => {
      if (!prev) return prev;
      const next = mut(prev);
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  // ---- Mutations ----
  const toggleCell = (appId: string, sysId: string) =>
    update((prev) => {
      const key = cellKey(appId, sysId);
      const cells = { ...prev.cells };
      if (cells[key]) delete cells[key];
      else cells[key] = true;
      return { ...prev, cells };
    });

  const renameSystem = (id: string, name: string) =>
    update((prev) => ({
      ...prev,
      systems: prev.systems.map((s) => (s.id === id ? { ...s, name } : s)),
    }));

  const recolorSystem = (id: string, color: string) =>
    update((prev) => ({
      ...prev,
      systems: prev.systems.map((s) => (s.id === id ? { ...s, color } : s)),
    }));

  const addSystem = () =>
    update((prev) => {
      const color = NEW_SYSTEM_PALETTE[prev.systems.length % NEW_SYSTEM_PALETTE.length];
      return {
        ...prev,
        systems: [...prev.systems, { id: newId('sys'), name: 'New system', color }],
      };
    });

  const deleteSystem = (id: string) =>
    update((prev) => {
      // Drop any cells that reference the removed system.
      const cells: Record<string, boolean> = {};
      for (const k of Object.keys(prev.cells)) {
        if (!k.endsWith(':' + id)) cells[k] = true;
      }
      return { ...prev, systems: prev.systems.filter((s) => s.id !== id), cells };
    });

  const renameApp = (id: string, name: string) =>
    update((prev) => ({
      ...prev,
      applications: prev.applications.map((a) => (a.id === id ? { ...a, name } : a)),
    }));

  const addApp = () =>
    update((prev) => ({
      ...prev,
      applications: [...prev.applications, { id: newId('app'), name: 'New application' }],
    }));

  const deleteApp = (id: string) =>
    update((prev) => {
      const cells: Record<string, boolean> = {};
      for (const k of Object.keys(prev.cells)) {
        if (!k.startsWith(id + ':')) cells[k] = true;
      }
      return { ...prev, applications: prev.applications.filter((a) => a.id !== id), cells };
    });

  const renameTitle = (title: string) => update((prev) => ({ ...prev, title }));

  // ---- Exports ----
  // PNG/JPG share the same html2canvas path; we just change the mime type.
  // We temporarily flip into "export mode" to hide hover-only delete
  // overlays and color pickers so the screenshot looks clean.
  const exportRaster = async (mime: 'image/png' | 'image/jpeg') => {
    if (!chartRef.current || !doc) return;
    setExportMode(true);
    // Wait a frame so React can re-render with exportMode=true before
    // html2canvas measures the DOM.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
      });
      canvas.toBlob((blob) => {
        if (!blob) return;
        const ext = mime === 'image/png' ? 'png' : 'jpg';
        downloadBlob(blob, `selector-guide-${new Date().toISOString().split('T')[0]}.${ext}`);
      }, mime, mime === 'image/jpeg' ? 0.95 : undefined);
    } finally {
      setExportMode(false);
    }
  };

  const exportSvg = () => {
    if (!doc) return;
    const svg = buildSvg(doc);
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `selector-guide-${new Date().toISOString().split('T')[0]}.svg`);
  };

  // ---- Render ----
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm py-8">
        <RefreshCw size={16} className="animate-spin" /> Loading selector guide…
      </div>
    );
  }
  if (error && !doc) {
    return <div className="text-rose-600 text-sm py-8">{error}</div>;
  }
  if (!doc) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {editing && editing.kind === 'title' ? (
            <input
              autoFocus
              defaultValue={doc.title}
              onBlur={(e) => { renameTitle(e.target.value.trim() || 'Selector Guide'); setEditing(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
              className="text-lg font-bold text-slate-800 bg-white border border-blue-400 rounded px-2 py-1 outline-none flex-1 min-w-0"
            />
          ) : (
            <button
              onClick={() => setEditing({ kind: 'title' })}
              className="text-lg font-bold text-slate-800 hover:text-blue-700 hover:underline truncate text-left"
              title="Click to edit title"
            >
              {doc.title}
            </button>
          )}
          <span className="text-xs text-slate-400 ml-2 whitespace-nowrap">
            {savingState === 'saving' ? 'Saving…' : savingState === 'saved' ? 'Saved' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={addApp} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100">
            <Plus size={14} /> Application
          </button>
          <button onClick={addSystem} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100">
            <Plus size={14} /> System
          </button>
          <div className="h-5 w-px bg-slate-300 mx-1" />
          <button onClick={() => exportRaster('image/png')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            <FileImage size={14} /> PNG
          </button>
          <button onClick={() => exportRaster('image/jpeg')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-white hover:bg-slate-800">
            <Download size={14} /> JPG
          </button>
          <button onClick={exportSvg} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
            <FileText size={14} /> SVG
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-rose-600 px-5 py-2 bg-rose-50 border-b border-rose-100">{error}</div>}

      {/* Chart — horizontally scrollable when many systems are added */}
      <div className="overflow-x-auto">
        <div ref={chartRef} className="inline-block min-w-full p-5 bg-white">
          <table className="border-collapse" style={{ borderSpacing: 0 }}>
            <thead>
              <tr>
                <th
                  className="text-left align-top p-3 bg-slate-50 border border-slate-200"
                  style={{ width: 260, minWidth: 260, height: 110 }}
                >
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Systems</div>
                  <div className="text-xs text-slate-500 mt-1">Applications ↓</div>
                </th>
                {doc.systems.map((sys) => (
                  <th
                    key={sys.id}
                    className="relative align-middle p-2 border border-white text-white text-center"
                    style={{ background: sys.color, width: 130, minWidth: 130, height: 110 }}
                  >
                    {editing && editing.kind === 'system' && editing.id === sys.id ? (
                      <input
                        autoFocus
                        defaultValue={sys.name}
                        onBlur={(e) => { renameSystem(sys.id, e.target.value.trim() || 'Untitled'); setEditing(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                        className="w-full bg-white/95 text-slate-900 border border-white rounded px-1.5 py-1 text-xs font-semibold text-center outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => setEditing({ kind: 'system', id: sys.id })}
                        className="block w-full text-xs font-bold leading-tight px-1 hover:underline"
                        title="Click to rename"
                      >
                        {sys.name}
                      </button>
                    )}
                    {!exportMode && (
                      <div className="absolute top-1 right-1 flex items-center gap-1 opacity-80">
                        <label className="cursor-pointer" title="Change color">
                          <span className="block w-4 h-4 rounded-full border-2 border-white shadow" style={{ background: sys.color }} />
                          <input
                            type="color"
                            value={sys.color}
                            onChange={(e) => recolorSystem(sys.id, e.target.value)}
                            className="sr-only"
                          />
                        </label>
                        <button
                          onClick={() => {
                            if (confirm(`Remove system "${sys.name}"?`)) deleteSystem(sys.id);
                          }}
                          className="text-white/90 hover:text-white"
                          title="Delete system"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {doc.applications.map((app, ri) => (
                <tr key={app.id} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                  <td className="relative align-middle p-3 border border-slate-200" style={{ width: 260, minWidth: 260, height: 56 }}>
                    {editing && editing.kind === 'app' && editing.id === app.id ? (
                      <input
                        autoFocus
                        defaultValue={app.name}
                        onBlur={(e) => { renameApp(app.id, e.target.value.trim() || 'Untitled'); setEditing(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                        className="w-full text-sm text-slate-900 bg-white border border-blue-400 rounded px-2 py-1 outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => setEditing({ kind: 'app', id: app.id })}
                        className="text-sm text-slate-800 hover:text-blue-700 hover:underline text-left"
                        title="Click to rename"
                      >
                        {app.name}
                      </button>
                    )}
                    {!exportMode && (
                      <button
                        onClick={() => {
                          if (confirm(`Remove application "${app.name}"?`)) deleteApp(app.id);
                        }}
                        className="absolute top-1 right-1 text-slate-300 hover:text-rose-600"
                        title="Delete row"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                  {doc.systems.map((sys) => {
                    const on = !!doc.cells[cellKey(app.id, sys.id)];
                    return (
                      <td
                        key={sys.id}
                        className="border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                        style={{ width: 130, minWidth: 130, height: 56, textAlign: 'center', verticalAlign: 'middle' }}
                        onClick={() => toggleCell(app.id, sys.id)}
                        title={on ? `Click to remove dot — ${sys.name} × ${app.name}` : `Click to add dot — ${sys.name} × ${app.name}`}
                      >
                        {on && (
                          <span
                            className="inline-block rounded-full"
                            style={{ background: sys.color, width: 22, height: 22 }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {doc.applications.length === 0 && (
                <tr>
                  <td colSpan={doc.systems.length + 1} className="p-10 text-center text-slate-400 text-sm border border-slate-200">
                    No applications yet. Click <strong>+ Application</strong> to add a row.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="px-5 py-2 text-[11px] text-slate-400 border-t border-slate-100 bg-slate-50">
        Tip: click any cell to toggle a dot. Click a system or application name to rename. Use the color swatch on each column header to change its color.
      </div>
    </div>
  );
};

export default SelectorGuide;
