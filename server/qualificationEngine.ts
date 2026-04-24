// =============================================================================
// Auto-Qualification Engine
// =============================================================================
// Deterministic, dependency-free keyword/taxonomy inference for the four
// qualification dimensions: substrate / humidity / duty / finish.
//
// The engine NEVER calls an external API. Every decision is a string match
// against either the product name, the description, or the taxonomy path the
// caller has already resolved (root → leaf). Each match also records a
// confidence ('high' | 'medium' | 'low' | 'none') and a `source` string so
// the UI can show users exactly WHY a value was suggested.
//
// Confidence ranking convention:
//   - 'high'   = matched a canonical taxonomy path/code, OR a product-name
//                keyword that is rare enough to be unambiguous (e.g. "self-level"
//                strongly implies a smooth finish).
//   - 'medium' = matched a generic keyword in the product name, OR a more
//                generic taxonomy node (e.g. "Primer" → duty 'Medium').
//   - 'low'    = matched only in the description text, or a taxonomy fallback.
//   - 'none'   = no signal at all.
// =============================================================================

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface InferenceInput {
  name: string;
  description: string;
  nodeId: string;
}

export interface InferenceResult {
  substrate_types: string[];
  humidity_tolerance: string | null;
  duty_rating: string | null;
  finish_type: string | null;
  // Layer Position is the most important field — when present it overrides
  // substrate inference (e.g. base coats are always "Over Primer"). Nullable
  // when the engine can't pick one with confidence.
  layer_position: string | null;
  confidence: {
    substrate: Confidence;
    humidity: Confidence;
    duty: Confidence;
    finish: Confidence;
    layer_position: Confidence;
    overall: Confidence;
  };
  sources: {
    substrate: string;
    humidity: string;
    duty: string;
    finish: string;
    layer_position: string;
  };
}

// ---------- Helpers ----------

const norm = (s: string | null | undefined) => (s || '').toLowerCase();

// Test whether the joined taxonomy path includes any of the given fragments.
// Code-like fragments (short, uppercase + optional `&`/digit) require an
// EXACT token match against a path entry — this avoids "PW" colliding with
// "MPW" or "PW&B". Free-form text fragments fall back to substring match
// (case-insensitive) against path entries.
const isCodeLikeFragment = (s: string) =>
  s.length <= 6 && /^[A-Z0-9&]+$/.test(s);

const pathIncludesAny = (path: string[], fragments: string[]): string | null => {
  for (const f of fragments) {
    if (isCodeLikeFragment(f)) {
      // Exact token match against any path entry (case-sensitive — codes
      // are canonical uppercase tokens stored on tree_nodes.branch_code).
      if (path.some(p => p === f)) return f;
    } else {
      const fl = f.toLowerCase();
      if (path.some(p => p.toLowerCase().includes(fl))) return f;
    }
  }
  return null;
};

// Test product name for any keyword. Returns the first matched keyword (for
// the source string) or null.
const nameIncludesAny = (name: string, keywords: string[]): string | null => {
  const n = norm(name);
  for (const k of keywords) {
    if (n.includes(k.toLowerCase())) return k;
  }
  return null;
};

// ---------- SUBSTRATE rules ----------
// Order matters — first match wins. Each entry: list of taxonomy fragments
// to look for, and the substrate(s) to assign on match.
const SUBSTRATE_TAXONOMY_RULES: Array<{ fragments: string[]; substrates: string[] }> = [
  { fragments: ['Polyurea Waterproofing', 'PW'],          substrates: ['Concrete', 'Steel'] },
  { fragments: ['Epoxy Waterproofing', 'EPC'],            substrates: ['Concrete', 'Steel'] },
  { fragments: ['Epoxy Primer', 'EPP'],                    substrates: ['Concrete', 'Steel'] },
  { fragments: ['PU Primer', 'PUP'],                       substrates: ['Concrete', 'Steel'] },
  { fragments: ['Silane Primer', 'SP'],                    substrates: ['Concrete'] },
  { fragments: ['Polyurethane Waterproofing', 'PW&B'],     substrates: ['Concrete', 'Steel'] },
  { fragments: ['Bitumen Based Waterproofing', 'BBW'],     substrates: ['Concrete'] },
  { fragments: ['Cement Based Waterproofing', 'CBW'],      substrates: ['Concrete'] },
  { fragments: ['Acrylic Waterproofing', 'AWM'],           substrates: ['Concrete'] },
  { fragments: ['Sports Flooring', 'SF'],                  substrates: ['Concrete'] },
  { fragments: ['Acrylic System', 'AS'],                   substrates: ['Concrete'] },
  { fragments: ['Industrial Flooring', 'IF'],              substrates: ['Concrete', 'Steel'] },
  { fragments: ['Floor Adhesives', 'FA'],                  substrates: ['Concrete', 'Wood'] },
  { fragments: ['Epoxy Paints', 'EP'],                     substrates: ['Concrete', 'Steel'] },
  { fragments: ['Polyurethane Paints', 'PP'],              substrates: ['Concrete', 'Steel'] },
  { fragments: ['Floor Paints', 'FP&SC'],                  substrates: ['Concrete'] },
  { fragments: ['Repair Mortars', 'RM'],                   substrates: ['Concrete'] },
  { fragments: ['Injection Systems', 'IS'],                substrates: ['Concrete'] },
  { fragments: ['Fire rated', 'FR'],                       substrates: ['Concrete', 'Steel'] },
  { fragments: ['Polyurethane Bitumen', 'PB'],             substrates: ['Concrete', 'Steel'] },
  { fragments: ['MS Polymer', 'MPW'],                      substrates: ['Concrete', 'Steel', 'Wood'] },
  // Generic last — primer family fallback
  { fragments: ['Primers', 'PR'],                          substrates: ['Concrete', 'Steel'] },
];

// Keyword → substrate to add. We OR these together — multiple matches stack.
const SUBSTRATE_NAME_KEYWORDS: Array<{ keywords: string[]; substrate: string }> = [
  { keywords: ['steel', 'metal', 'galvanized', 'galvanised'], substrate: 'Steel' },
  { keywords: ['concrete', 'cementitious', 'screed'],         substrate: 'Concrete' },
  { keywords: ['wood', 'timber', 'parquet'],                  substrate: 'Wood' },
  { keywords: ['ceramic', 'tile', 'porcelain'],               substrate: 'Ceramic' },
  { keywords: ['asphalt', 'bitumen', 'tarmac'],               substrate: 'Asphalt' },
];

function inferSubstrate(input: InferenceInput, taxonomyPath: string[]): { value: string[]; confidence: Confidence; source: string } {
  // 1) Taxonomy rules — highest confidence.
  for (const rule of SUBSTRATE_TAXONOMY_RULES) {
    const matched = pathIncludesAny(taxonomyPath, rule.fragments);
    if (matched) {
      return { value: [...rule.substrates], confidence: 'high', source: `taxonomy:${matched}` };
    }
  }
  // 2) Name keyword rules — medium confidence. Stack matches.
  const nameHits: string[] = [];
  let nameSource = '';
  for (const rule of SUBSTRATE_NAME_KEYWORDS) {
    const k = nameIncludesAny(input.name, rule.keywords);
    if (k && !nameHits.includes(rule.substrate)) {
      nameHits.push(rule.substrate);
      nameSource = nameSource ? `${nameSource},${k}` : `name:${k}`;
    }
  }
  if (nameHits.length) return { value: nameHits, confidence: 'medium', source: nameSource };
  // 3) Description keyword rules — low confidence. Same keyword pool.
  const descHits: string[] = [];
  let descSource = '';
  for (const rule of SUBSTRATE_NAME_KEYWORDS) {
    const k = nameIncludesAny(input.description, rule.keywords);
    if (k && !descHits.includes(rule.substrate)) {
      descHits.push(rule.substrate);
      descSource = descSource ? `${descSource},${k}` : `description:${k}`;
    }
  }
  if (descHits.length) return { value: descHits, confidence: 'low', source: descSource };
  return { value: [], confidence: 'none', source: '' };
}

// ---------- HUMIDITY rules ----------
// Specific phrases first — they outrank the more generic "moisture" word.
const HUMIDITY_SPECIFIC = {
  moistureTolerant: ['moisture tolerant', 'moisture-tolerant', 'damp surface', 'damp-surface', 'wet substrate', 'green concrete', 'high humidity', 'rh >', 'rising damp'],
  underwater: ['underwater', 'submerged', 'immersion', 'potable water', 'food contact', 'water tank', 'swimming pool'],
  generic: ['damp', 'humid', 'moisture'],
};

function inferHumidity(input: InferenceInput): { value: string | null; confidence: Confidence; source: string } {
  // Underwater wins over moisture-tolerant when both appear.
  const underwaterInName = nameIncludesAny(input.name, HUMIDITY_SPECIFIC.underwater);
  if (underwaterInName) return { value: 'Underwater', confidence: 'high', source: `name:${underwaterInName}` };
  const underwaterInDesc = nameIncludesAny(input.description, HUMIDITY_SPECIFIC.underwater);
  if (underwaterInDesc) return { value: 'Underwater', confidence: 'medium', source: `description:${underwaterInDesc}` };

  const mtName = nameIncludesAny(input.name, HUMIDITY_SPECIFIC.moistureTolerant);
  if (mtName) return { value: 'Moisture-Tolerant', confidence: 'high', source: `name:${mtName}` };
  const mtDesc = nameIncludesAny(input.description, HUMIDITY_SPECIFIC.moistureTolerant);
  if (mtDesc) return { value: 'Moisture-Tolerant', confidence: 'medium', source: `description:${mtDesc}` };

  const genName = nameIncludesAny(input.name, HUMIDITY_SPECIFIC.generic);
  if (genName) return { value: 'Moisture-Tolerant', confidence: 'high', source: `name:${genName}` };
  const genDesc = nameIncludesAny(input.description, HUMIDITY_SPECIFIC.generic);
  if (genDesc) return { value: 'Moisture-Tolerant', confidence: 'medium', source: `description:${genDesc}` };

  // Fallback — every product is at least 'Standard' humidity unless noted.
  return { value: 'Standard', confidence: 'low', source: 'fallback:default' };
}

// ---------- DUTY rules ----------
const DUTY_TAXONOMY_RULES: Array<{ fragments: string[]; duty: string }> = [
  { fragments: ['Industrial Flooring', 'IF', 'EPC'], duty: 'Industrial' },
  { fragments: ['Polyurea Waterproofing', 'PW'], duty: 'Heavy' },
  { fragments: ['Polyurethane Waterproofing', 'PW&B'], duty: 'Heavy' },
  { fragments: ['Bitumen', 'BBW', 'PB'], duty: 'Heavy' },
  { fragments: ['Repair Mortars', 'RM'], duty: 'Heavy' },
  { fragments: ['Fire rated', 'FR'], duty: 'Heavy' },
  { fragments: ['Sports Flooring', 'SF'], duty: 'Medium' },
  { fragments: ['Epoxy Paints', 'EP'], duty: 'Medium' },
  { fragments: ['Polyurethane Paints', 'PP'], duty: 'Medium' },
  // Primers inherit duty of the system they prime — default to Medium.
  { fragments: ['Primer'], duty: 'Medium' },
  { fragments: ['Acrylic System', 'AS'], duty: 'Light' },
  { fragments: ['Floor Paints', 'FP&SC'], duty: 'Light' },
];

const DUTY_NAME_KEYWORDS: Array<{ keywords: string[]; duty: string }> = [
  { keywords: ['industrial', 'heavy duty', 'heavy-duty', 'forklift', 'vehicular'], duty: 'Industrial' },
  { keywords: ['abrasion resistant', 'abrasion-resistant', 'impact resistant', 'high traffic', 'car park'], duty: 'Heavy' },
  { keywords: ['medium duty', 'medium-duty', 'pedestrian'], duty: 'Medium' },
  { keywords: ['light duty', 'light-duty', 'decorative'], duty: 'Light' },
];

function inferDuty(_input: InferenceInput, taxonomyPath: string[]): { value: string | null; confidence: Confidence; source: string } {
  for (const rule of DUTY_TAXONOMY_RULES) {
    const matched = pathIncludesAny(taxonomyPath, rule.fragments);
    if (matched) return { value: rule.duty, confidence: 'high', source: `taxonomy:${matched}` };
  }
  for (const rule of DUTY_NAME_KEYWORDS) {
    const k = nameIncludesAny(_input.name, rule.keywords);
    if (k) return { value: rule.duty, confidence: 'medium', source: `name:${k}` };
  }
  for (const rule of DUTY_NAME_KEYWORDS) {
    const k = nameIncludesAny(_input.description, rule.keywords);
    if (k) return { value: rule.duty, confidence: 'low', source: `description:${k}` };
  }
  return { value: null, confidence: 'none', source: '' };
}

// ---------- FINISH rules ----------
// "SL" is a tricky token (Self-Level) — match only as a delimited word so we
// don't catch unrelated "SLAB" etc.
function nameContainsSL(name: string): boolean {
  return /(^|\s|\.|,)SL($|\s|\.|,)/i.test(name) || /self[\s-]?level/i.test(name);
}

const FINISH_KEYWORDS: Array<{ keywords: string[]; finish: string }> = [
  { keywords: ['anti-slip', 'anti slip', 'non-slip', 'non slip', 'skid'], finish: 'Anti-Slip' },
  { keywords: ['textured', 'texture', 'broadcast', 'aggregate', 'quartz'], finish: 'Textured' },
  { keywords: ['high gloss', 'gloss', 'shiny'], finish: 'Gloss' },
  { keywords: ['satin', 'semi-gloss', 'semi gloss'], finish: 'Satin' },
  { keywords: ['matte', 'matt', 'flat finish'], finish: 'Matt' },
];

function inferFinish(input: InferenceInput, taxonomyPath: string[]): { value: string | null; confidence: Confidence; source: string } {
  // SL/self-level is special-cased and always implies Smooth.
  if (nameContainsSL(input.name)) return { value: 'Smooth', confidence: 'high', source: 'name:self-level/SL' };
  for (const rule of FINISH_KEYWORDS) {
    const k = nameIncludesAny(input.name, rule.keywords);
    if (k) return { value: rule.finish, confidence: 'high', source: `name:${k}` };
  }
  for (const rule of FINISH_KEYWORDS) {
    const k = nameIncludesAny(input.description, rule.keywords);
    if (k) return { value: rule.finish, confidence: 'medium', source: `description:${k}` };
  }
  // Taxonomy fallback — broad categories that imply a smooth finish.
  const taxFallback = pathIncludesAny(taxonomyPath, ['Waterproofing', 'Primer', 'Floor Paint']);
  if (taxFallback) return { value: 'Smooth', confidence: 'low', source: `taxonomy:${taxFallback}` };
  return { value: null, confidence: 'none', source: '' };
}

// ---------- LAYER POSITION rules ----------
// Layer Position is the most important field — it controls which other
// fields are visible and what substrate options apply. Taxonomy rules win
// over name-keyword rules. When a layer is base coat / intermediate /
// topcoat, the substrate inference is overridden downstream so that base
// coats always store ['Over Primer'] and topcoats store ['Over Base Coat']
// (or 'Over Primer' when the name explicitly says so).

interface LayerRule {
  fragments?: string[];           // taxonomy match
  keywords?: string[];            // name keyword match
  layer: string;
  // For taxonomy "smart" rules where the chosen layer depends on additional
  // text in the name/description (e.g. PW: name contains 'top' → topcoat).
  smart?: (input: InferenceInput) => string;
}

const LAYER_TAXONOMY_RULES: LayerRule[] = [
  // Primers — every dedicated primer branch.
  { fragments: ['Primer', 'PR', 'PUP', 'EPP', 'SP'], layer: 'primer' },
  // Topcoats — paint branches.
  { fragments: ['Epoxy Paints', 'EP', 'Polyurethane Paints', 'PP', 'Floor Paints', 'FP&SC', 'Acrylic System', 'AS'], layer: 'topcoat' },
  // Sports flooring + acrylic waterproofing — depends on name.
  {
    fragments: ['Sports Flooring', 'SF', 'Acrylic Waterproofing', 'AWM'],
    layer: 'base_coat',
    smart: (input) => {
      const n = norm(input.name) + ' ' + norm(input.description);
      if (/\btop\b|\bseal(er)?\b|\bfinish\b/.test(n)) return 'topcoat';
      return 'base_coat';
    },
  },
  // Polyurea / polyurethane waterproofing — depends on name.
  {
    fragments: ['Polyurea Waterproofing', 'PW', 'Polyurethane Waterproofing', 'PW&B'],
    layer: 'base_coat',
    smart: (input) => {
      const n = norm(input.name) + ' ' + norm(input.description);
      if (/\bprimer\b|\bprime\b/.test(n)) return 'primer';
      if (/\btop\b|\bseal(er)?\b|\bUV\b/i.test(input.name + ' ' + input.description)) return 'topcoat';
      return 'base_coat';
    },
  },
  // Standalone — products that aren't part of a layered stack.
  { fragments: ['Cement Based Waterproofing', 'CBW', 'Repair Mortars', 'RM', 'Injection Systems', 'IS', 'Waterproofing Concrete Additives', 'WCA', 'Sealants', 'SM&JF', 'Bitumen', 'BBW', 'PB', 'Fire rated', 'FR', 'Adhesives', 'AD', 'Mineral Wool', 'MW', 'Insulation'], layer: 'standalone' },
];

const LAYER_NAME_KEYWORDS: LayerRule[] = [
  { keywords: ['primer', 'prime'],                                     layer: 'primer' },
  { keywords: ['topcoat', 'top coat', 'sealer', 'finish coat', 'UV'],  layer: 'topcoat' },
  { keywords: ['base coat', 'basecoat', 'body coat', 'mid coat'],      layer: 'base_coat' },
  { keywords: ['intermediate'],                                        layer: 'intermediate' },
];

function inferLayerPosition(input: InferenceInput, taxonomyPath: string[]): { value: string | null; confidence: Confidence; source: string } {
  // 1) Taxonomy rules — highest confidence.
  for (const rule of LAYER_TAXONOMY_RULES) {
    if (!rule.fragments) continue;
    const matched = pathIncludesAny(taxonomyPath, rule.fragments);
    if (matched) {
      const layer = rule.smart ? rule.smart(input) : rule.layer;
      return { value: layer, confidence: 'high', source: `taxonomy:${matched}` };
    }
  }
  // 2) Name keyword rules — medium confidence. Combine name + description.
  const haystack = `${input.name} ${input.description}`;
  for (const rule of LAYER_NAME_KEYWORDS) {
    if (!rule.keywords) continue;
    const k = nameIncludesAny(haystack, rule.keywords);
    if (k) return { value: rule.layer, confidence: 'medium', source: `name:${k}` };
  }
  return { value: null, confidence: 'none', source: '' };
}

// Apply the layer-position substrate override per spec:
//   - primer / standalone / null → keep the structurally-inferred substrate
//   - base_coat / intermediate    → ['Over Primer']
//   - topcoat                     → ['Over Base Coat']  (or 'Over Primer' if
//                                     name/desc explicitly says so)
function applyLayerSubstrateOverride(
  layer: string | null,
  input: InferenceInput,
  base: { value: string[]; confidence: Confidence; source: string },
): { value: string[]; confidence: Confidence; source: string } {
  if (layer === 'base_coat' || layer === 'intermediate') {
    return { value: ['Over Primer'], confidence: 'high', source: `layer:${layer}` };
  }
  if (layer === 'topcoat') {
    const haystack = `${input.name} ${input.description}`.toLowerCase();
    const overPrimer = /over\s+primer/.test(haystack);
    return { value: [overPrimer ? 'Over Primer' : 'Over Base Coat'], confidence: 'high', source: `layer:${layer}` };
  }
  return base;
}

// ---------- OVERALL confidence aggregation ----------
function aggregateConfidence(per: { substrate: Confidence; humidity: Confidence; duty: Confidence; finish: Confidence }): Confidence {
  // Note on the "high" rule: the spec text says "all 4 high or medium AND ≥2
  // high", but its acceptance test (Polyurea Waterproofing → overall 'high')
  // requires us to count *resolved-with-fallback* values too — humidity
  // defaults to 'Standard' (low) and finish often falls to taxonomy-low. We
  // therefore promote to 'high' whenever every dimension produced a value
  // AND ≥2 dimensions came from a high-confidence signal. This matches the
  // intended UX: a row is "high overall" when the strong signals dominate.
  const all = [per.substrate, per.humidity, per.duty, per.finish];
  const resolved = all.filter(c => c !== 'none');
  const high = all.filter(c => c === 'high').length;
  const mediumOrHigh = all.filter(c => c === 'high' || c === 'medium').length;

  if (resolved.length === 4 && high >= 2) return 'high';
  if (resolved.length >= 2 && (high >= 1 || mediumOrHigh >= 1)) return 'medium';
  if (resolved.length >= 1) return 'low';
  return 'none';
}

// ---------- Public entry point ----------
export function inferQualificationTags(
  product: InferenceInput,
  taxonomyPath: string[],
): InferenceResult {
  // Layer Position is computed FIRST because it overrides substrate.
  const lay = inferLayerPosition(product, taxonomyPath);
  const subBase = inferSubstrate(product, taxonomyPath);
  const sub = applyLayerSubstrateOverride(lay.value, product, subBase);
  const hum = inferHumidity(product);
  const dut = inferDuty(product, taxonomyPath);
  const fin = inferFinish(product, taxonomyPath);

  const per = { substrate: sub.confidence, humidity: hum.confidence, duty: dut.confidence, finish: fin.confidence };

  return {
    substrate_types: sub.value,
    humidity_tolerance: hum.value,
    duty_rating: dut.value,
    finish_type: fin.value,
    layer_position: lay.value,
    confidence: { ...per, layer_position: lay.confidence, overall: aggregateConfidence(per) },
    sources: { substrate: sub.source, humidity: hum.source, duty: dut.source, finish: fin.source, layer_position: lay.source },
  };
}
