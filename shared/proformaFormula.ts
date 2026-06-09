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
//   {Name}             → convenience alias for {col:Name}. ANY bare token that
//                        is not one of the reserved aliases above is resolved
//                        against column names (case-insensitive, trim-equal).
//                        Custom columns win over built-ins on a name clash
//                        (e.g. a user-added numeric "Unit" beats the built-in
//                        text "Unit"), because only the custom column can hold
//                        a number worth multiplying. This lets users write the
//                        intuitive `{Unit} * {Pallet}` instead of the verbose
//                        `{col:Unit} * {col:Pallet}`.
//
// Authoring conveniences:
//   • A single leading '=' is stripped, so spreadsheet-style `={qty}*2` works.
//   • Token matching is case-insensitive for both reserved aliases and names.
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

// Resolve a single {token} (the text between the braces) to a numeric string
// literal suitable for substitution into the math expression. Understands:
//   • reserved aliases: qty / quantity, unit_price / unitprice / "unit price",
//     total — case-insensitive;
//   • the explicit {col:Name} form (force a column lookup, skipping aliases);
//   • the bare {Name} form (column lookup by display name).
// On a name clash, non-built-in (custom) columns win because they are the ones
// that actually hold a numeric value. Built-in numeric columns (qty, unit
// price, total) resolve from the row; built-in text columns (product, unit)
// have no numeric value here and resolve to 0. Unknown names → 0 (a normal
// in-progress edit state, not an authoring error). A nested formula column or
// {total} that itself errors flips `markError` so the parent surfaces NaN.
function resolveToken(
  rawToken: string,
  row: FormulaRow,
  columns: FormulaColumn[],
  totalFormula: string | null | undefined,
  depth: number,
  markError: () => void,
): string {
  let token = String(rawToken).trim();

  // Explicit {col:Name} prefix forces a column lookup and bypasses the
  // reserved-alias shortcuts (so a custom column literally named "qty" can
  // still be addressed via {col:qty}).
  let forceColumn = false;
  if (/^col\s*:/i.test(token)) {
    token = token.slice(token.indexOf(':') + 1).trim();
    forceColumn = true;
  }

  const lower = token.toLowerCase();

  // Recursively evaluate the running row total, flagging errors upward.
  const resolveTotal = (): string => {
    const t = computeRowTotal(row, columns, totalFormula, depth + 1);
    if (!Number.isFinite(t)) { markError(); return '0'; }
    return String(t);
  };

  // Reserved aliases (skipped when an explicit col: prefix was given).
  if (!forceColumn) {
    if (lower === 'qty' || lower === 'quantity') return String(safeNum(row.qty));
    if (lower === 'unit_price' || lower === 'unitprice' || lower === 'unit price') {
      return String(safeNum(row.unitPrice));
    }
    if (lower === 'total') return resolveTotal();
  }

  // Column lookup by display name. Prefer custom columns over built-ins on a
  // name collision (only customs hold a meaningful number).
  const matches = columns.filter(c => (c.name ?? '').trim().toLowerCase() === lower);
  const col = matches.find(c => c.type !== 'builtin') ?? matches[0];
  if (!col) return '0'; // unknown column → treat as 0, common during edits

  if (col.type === 'formula') {
    const v = evaluateFormula(col.formula ?? '', row, columns, totalFormula, depth + 1);
    if (!Number.isFinite(v)) { markError(); return '0'; }
    return String(v);
  }

  // Built-in columns have no entry in customValues — map the numeric ones to
  // the row fields and treat the text ones (product, unit) as 0.
  if (col.type === 'builtin') {
    if (col.id === 'quantity') return String(safeNum(row.qty));
    if (col.id === 'unitPrice') return String(safeNum(row.unitPrice));
    if (col.id === 'total') return resolveTotal();
    return '0';
  }

  // text / number custom column → its stored (string) value, parsed lazily.
  const raw = row.customValues?.[col.id];
  if (raw == null || String(raw).trim() === '') return '0';
  const num = parseFloat(String(raw));
  return Number.isFinite(num) ? String(num) : '0';
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
    // Spreadsheet muscle-memory: tolerate a single leading '=' (e.g. "={qty}*2").
    if (expr.startsWith('=')) expr = expr.slice(1).trim();
    if (expr === '') return 0;

    // Tracks whether any substitution propagated a formula error from a
    // nested {Name}/{col:Name} or {total} resolution. If so the whole
    // expression is poisoned and we surface NaN to callers instead of
    // silently using 0 (which would falsify totals).
    let nestedError = false;
    const markError = () => { nestedError = true; };

    // Single pass over every {token}. The resolver below understands the
    // reserved aliases ({qty}/{unit_price}/{total}), the explicit {col:Name}
    // form, and the bare {Name} convenience form. Doing it in one pass means
    // a column's own formula referencing {total} still resolves correctly
    // regardless of token ordering.
    expr = expr.replace(/\{([^}]+)\}/g, (_match, rawToken: string) =>
      resolveToken(rawToken, row, columns, totalFormula, depth, markError),
    );

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
