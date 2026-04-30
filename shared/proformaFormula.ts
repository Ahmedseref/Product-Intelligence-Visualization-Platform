// =============================================================================
// shared/proformaFormula.ts — pure formula utilities for proforma invoices
// =============================================================================
// This module is intentionally dependency-free (no React, no DOM, no API
// calls) so it can be imported from both the browser editor and the
// server-side Excel exporter to keep row-total semantics identical.
//
// Token grammar (matches the spec in attached_assets):
//   {qty}              → row.qty                              (number)
//   {unit_price}       → row.unitPrice                        (number)
//   {total}            → computeRowTotal(row, columns, ...)   (number, recursive)
//   {col:Name}         → row.customValues[col.id] for the column whose
//                        `name` (label) matches Name. If the matched column
//                        is itself of type 'formula', its formula is
//                        recursively evaluated.
//
// Safety
// ------
//   • Evaluation uses `new Function('"use strict"; return (' + expr + ')')`
//     which is strictly safer than `eval()` (no closure access) and is
//     bounded by a token-substitution + character-whitelist pass.
//   • Recursion depth is hard-capped at MAX_DEPTH (3) to defeat cycles.
//   • Real evaluation errors (parse failure, eval throw, depth blown out
//     while still actively recursing on a formula) produce NaN so callers
//     can distinguish "broken formula" from a legitimate 0 result and
//     render the spec-mandated em-dash placeholder. Missing / blank
//     {col:Name} lookups stay 0 — they are normal during data entry.
// =============================================================================

export interface FormulaColumn {
  // Stable, opaque id. Built-in columns use canonical ids ('product',
  // 'unitPrice', 'quantity', 'unit', 'total'); custom columns use the id
  // generated when the user added them.
  id: string;
  // Display name used to resolve {col:Name} tokens. Compared trim-equal.
  name: string;
  type: 'text' | 'number' | 'formula' | 'builtin';
  unit?: string;
  // Only meaningful for type='formula'. Same grammar as totalFormula.
  formula?: string;
}

export interface FormulaRow {
  qty: number;
  unitPrice: number;
  // Custom column values keyed by column id (NOT name). Always strings —
  // numeric columns are parsed lazily so partial entries like '12.' are
  // preserved while the user is typing.
  customValues: Record<string, string>;
}

const MAX_DEPTH = 3;

// Convert any incoming value to a finite number, defaulting to 0.
function safeNum(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Helper: caller-friendly check for "the formula engine returned an error".
// We use NaN as the sentinel so callers can render '—' / show a tooltip
// without losing the ability to participate in arithmetic when valid.
export function isFormulaError(value: number): boolean {
  return !Number.isFinite(value);
}

// Evaluate a formula expression by replacing tokens with numeric literals
// and running the result through a sandboxed Function.
// Returns NaN when the formula is structurally broken (parse failure,
// whitelist violation, exception during eval, recursion depth blown out
// while a formula is still actively recursing). Empty / missing
// formulas resolve to 0 because that is a normal in-progress edit state,
// not an authoring error.
export function evaluateFormula(
  formula: string | null | undefined,
  row: FormulaRow,
  columns: FormulaColumn[],
  totalFormula?: string | null,
  depth: number = 0,
): number {
  if (!formula) return 0;
  // Active recursion attempted to go past the depth cap → real error.
  if (depth > MAX_DEPTH) return NaN;
  try {
    let expr = String(formula).trim();
    if (expr === '') return 0;

    // Tracks whether any substitution propagated a formula error from a
    // nested {col:Name} or {total} resolution. If so the whole expression
    // is poisoned and we surface NaN to callers instead of silently using
    // 0 (which would falsify totals).
    let nestedError = false;

    // Order matters: substitute {col:Name} BEFORE {total} so a column whose
    // formula references {total} still resolves correctly.
    expr = expr.replace(/\{col:([^}]+)\}/g, (_match, rawName: string) => {
      const name = String(rawName).trim();
      const col = columns.find(c => (c.name ?? '').trim() === name);
      if (!col) return '0'; // unknown column → treat as 0, common during edits
      if (col.type === 'formula') {
        const v = evaluateFormula(col.formula ?? '', row, columns, totalFormula, depth + 1);
        if (!Number.isFinite(v)) {
          nestedError = true;
          return '0';
        }
        return String(v);
      }
      const raw = row.customValues?.[col.id];
      if (raw == null || String(raw).trim() === '') return '0';
      const num = parseFloat(String(raw));
      return Number.isFinite(num) ? String(num) : '0';
    });

    expr = expr.replace(/\{qty\}/g, String(safeNum(row.qty)));
    expr = expr.replace(/\{unit_price\}/g, String(safeNum(row.unitPrice)));
    expr = expr.replace(/\{total\}/g, () => {
      const t = computeRowTotal(row, columns, totalFormula, depth + 1);
      if (!Number.isFinite(t)) {
        nestedError = true;
        return '0';
      }
      return String(t);
    });

    if (nestedError) return NaN;

    // Whitelist: after substitution the expression must contain only digits,
    // standard math operators, parentheses, dots, whitespace and exponent
    // markers. Anything else (letters, identifiers, brackets) is treated as
    // a formula authoring error.
    if (!/^[0-9eE+\-*/().\s]*$/.test(expr)) {
      return NaN;
    }

    // eslint-disable-next-line no-new-func
    const fn = new Function('"use strict"; return (' + expr + ')');
    const result = fn();
    const num = typeof result === 'number' ? result : Number(result);
    // Division by zero, NaN literals, etc. surface as errors.
    return Number.isFinite(num) ? num : NaN;
  } catch {
    return NaN;
  }
}

// Compute one row's "total" cell value. When totalFormula is empty or the
// sentinel 'default', the standard qty × unit_price applies; otherwise the
// formula is evaluated against this row. Returns NaN if the user-supplied
// totalFormula is structurally broken so callers can render '—'.
export function computeRowTotal(
  row: FormulaRow,
  columns: FormulaColumn[],
  totalFormula?: string | null,
  depth: number = 0,
): number {
  if (!totalFormula || totalFormula === 'default') {
    return safeNum(row.qty) * safeNum(row.unitPrice);
  }
  if (depth > MAX_DEPTH) return NaN;
  return evaluateFormula(totalFormula, row, columns, totalFormula, depth);
}

// Sum row totals to produce the proforma subtotal that feeds the financial
// calculation steps (VAT, freight, etc.). Rows whose total formula errors
// are skipped (counted as 0) so a single bad row cannot blank the entire
// invoice subtotal — the bad row itself still renders '—' in the UI.
export function computeSubtotal(
  rows: FormulaRow[],
  columns: FormulaColumn[],
  totalFormula?: string | null,
): number {
  return rows.reduce((sum, r) => {
    const t = computeRowTotal(r, columns, totalFormula);
    return sum + (Number.isFinite(t) ? t : 0);
  }, 0);
}
