
export type FieldType = 'text' | 'number' | 'currency' | 'percentage' | 'date' | 'boolean' | 'dropdown';

export interface CustomField {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];
}

export interface CustomFieldValue {
  fieldId: string;
  value: any;
}

export interface TechnicalSpec {
  id: string;
  name: string;
  value: string;
  unit?: string;
  affectsPrice?: boolean;
}

// Product classification used by the product form to tailor the
// Technical Specifications template. Defaults to 'standalone'.
export type ProductType = 'standalone' | 'flooring' | 'tiles';

export interface HistoryEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  changes: Record<string, { old: any; new: any }>;
  snapshot: Partial<Product>;
}

export interface Supplier {
  id: string;
  name: string;
  supplierCode?: string;
  country?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  website?: string;
  notes?: string;
  isActive: boolean;
  // Notion "Contact Connector" sync fields — populated for contacts
  // sourced from (or pushed to) the linked Notion database.
  leadPosition?: string;
  leadSource?: string;
  sourceQuality?: string;
  industryMainActivities?: string;
  contactType?: string;
  // Remaining Notion "Contact Connector" properties (full-fidelity mapping).
  recordId?: string;
  action?: string;
  priority?: string;
  paymentTerms?: string;
  mobile2?: string;
  pendingPayment?: string;
  paidAmount?: number;
  invoiceValue?: number;
  reminder?: string;
  updates?: string;
  brand?: string[];
  product?: string[];
  result?: string[];
  filesMedia?: { name: string; url: string }[];
  tasksRelation?: string[];
  dailyTasksConnector?: string[];
  relatedDocs?: string[];
  docsRelation?: string[];
  notionRawProperties?: Record<string, any>;
  notionPageId?: string;
  notionLastEditedTime?: string;
  appLastEditedTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierProduct {
  id: string;
  supplierId: string;
  productName?: string;
  formFactor?: string;
  sku?: string;
  price: number;
  currency: string;
  unit?: string;
  moq: number;
  leadTime: number;
  packagingType?: string;
  hsCode?: string;
  certifications: string[];
  technicalSpecs: TechnicalSpec[];
  images: string[];
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  history: HistoryEntry[];
  supplierName?: string;
  categoryName?: string;
}

export type TreeNodeType = 'sector' | 'category' | 'subcategory' | 'group';

export interface TreeNode {
  id: string;
  name: string;
  type: TreeNodeType;
  parentId: string | null;
  description?: string;
  metadata?: Record<string, any>;
  branchCode?: string;
}

export interface Color {
  id: number;
  name: string;
  code: string;
  hexValue?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface StockCodeHistoryEntry {
  id: number;
  productId: string;
  oldStockCode: string | null;
  newStockCode: string;
  reason: string;
  changedBy: string | null;
  changedAt: string;
}

export interface Product {
  id: string;
  name: string;
  supplier: string;
  supplierId?: string;
  nodeId: string;
  stockCode?: string;
  colorId?: number;
  manufacturer: string;
  manufacturingLocation: string;
  description: string;
  imageUrl: string;
  price: number;
  currency: string;
  unit: string;
  moq: number;
  leadTime: number; // in days
  packagingType: string;
  hsCode?: string;
  certifications: string[];
  shelfLife: string;
  storageConditions: string;
  customFields: Record<string, any>;
  technicalSpecs?: TechnicalSpec[]; // Multiple technical specifications
  // Product classification driving the Technical Specifications template
  // in the product form: 'standalone' (default), 'flooring', or 'tiles'.
  productType?: ProductType;
  dateAdded: string;
  lastUpdated: string;
  createdBy: string;
  history: HistoryEntry[];
  // Deprecated flat fields kept for compatibility or reference
  category: string; 
  sector: string;
}

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'area';
export type AggregationMethod = 'sum' | 'avg' | 'min' | 'max' | 'count';

export interface ChartConfig {
  id: string;
  title: string;
  type: ChartType;
  xAxis: string;
  yAxis: string;
  aggregation: AggregationMethod;
}

export interface Sector {
  id: number;
  sectorId: string;
  name: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SystemData {
  id: number;
  systemId: string;
  name: string;
  description?: string;
  typicalUses?: string;
  sectorMapping: string[];
  status: string;
  version: number;
  isActive: boolean;
  // Optional system-level qualification parameters used to filter the
  // layer product search. All three are nullable for backward compatibility.
  // Array of substrate vocabulary values (e.g. ["Concrete","Screed"]).
  // Null/empty = "any substrate". Legacy single-string values are migrated
  // server-side to 1-element arrays.
  systemSubstrate?: string[] | null;
  systemHumidity?: string | null;
  systemDuty?: string | null;
  // Optional per-sector overrides keyed by sector name.
  sectorOverrides?: Record<string, { substrateOverride?: string | null }> | null;
  // Free-text recommendation shown on the System Preview catalog tab.
  previewNote?: string | null;
  // Installable-spec total dry-film thickness range for the build-up, in mm.
  // Both nullable; absence means "not specified yet".
  totalThicknessMinMm?: number | null;
  totalThicknessMaxMm?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SystemLayer {
  id: number;
  layerId: string;
  systemId: string;
  layerName: string;
  orderSequence: number;
  notes?: string;
  // The product_id of the layer's pinned default product (if any).
  defaultProductId?: string | null;
  // Optional per-layer substrate override (wins over sector and system
  // substrate when filtering product search).
  layerSubstrateOverride?: string | null;
  // Installable-spec fields; all nullable. Stored as `real` server-side and
  // round-tripped as plain JS numbers.
  consumptionRateKgM2?: number | null; // kg of material per m² of substrate
  dftMicrons?: number | null;          // dry film thickness, μm
  recoatMinHours?: number | null;      // minimum hours before next coat
  recoatMaxHours?: number | null;      // maximum hours before next coat
  // Adaptive primer slot. 'fixed' (default/null) → manual products via
  // systemProductOptions. 'adaptive' → product is resolved at spec time
  // from the Primer Library based on the system's substrate + humidity.
  layerMode?: 'fixed' | 'adaptive' | null;
  // Pinned default primer (primer_library.primerId) when layerMode is
  // 'adaptive'. Optional — when null, all matching primers are alternatives.
  defaultPrimerLibraryId?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Primer Library ──
// One row per primer-condition combination served by the library. Adaptive
// primer slots resolve to one of these entries at spec time. Soft-deleted
// entries (isActive=false) are excluded from the standard list but remain
// in the table so historical references stay intact.
export interface PrimerLibraryEntry {
  id: number;
  primerId: string;                       // PL-0001 etc.
  productId: string;                      // products.productId
  productName: string | null;
  supplier: string | null;
  compatibleSubstrates: string[];         // substrate vocab values
  humidityTolerance: string | null;       // humidity vocab value
  dutyRating: string | null;              // duty vocab value (Light/Medium/Heavy/…)
  compatibleSystemTypes: string[];        // ["Epoxy","PU","Polyurea","Acrylic"]
  layerPosition: string | null;           // always 'primer' today
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  // Live description from products.description, not denormalised — joined
  // server-side on every list/resolve so edits to the product show here.
  productDescription?: string | null;
}

export interface SystemProductOption {
  id: number;
  optionId: string;
  layerId: string;
  productId: string;
  benefit?: string;
  isDefault: boolean;
  createdAt: string;
  productName?: string;
  productStockCode?: string;
  productSupplier?: string;
}

export interface SystemLayerWithProducts extends SystemLayer {
  productOptions: SystemProductOption[];
}

export interface SystemFull extends SystemData {
  layers: SystemLayerWithProducts[];
}

export interface SystemHistoryEntry {
  id: number;
  systemId: string;
  version: number;
  snapshotData: any;
  changeDescription?: string;
  changedBy?: string;
  createdAt: string;
}

export interface SystemStats {
  totalSystems: number;
  totalLayers: number;
  totalOptions: number;
  totalSectors: number;
  productUtilization: Record<string, number>;
  systemComplexity: { systemId: string; name: string; layerCount: number; optionCount: number }[];
  layerDistribution: Record<string, number>;
  productSystemMatrix: { productId: string; systemId: string; systemName: string; count: number }[];
  layerProductMatrix: { layerName: string; productId: string; count: number }[];
  systemLayerMatrix: { systemName: string; layerName: string; productCount: number }[];
}

export interface DocumentRecord {
  id: number;
  documentId: string;
  name: string;
  link: string;
  type: string;
  relatedToType: string;
  relatedToId?: string;
  relatedToName?: string;
  tags: string[];
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export type ViewMode = 'technical-intelligence' | 'inventory' | 'add-product' | 'taxonomy-manager' | 'suppliers' | 'industry-analysis' | 'settings' | 'system-builder' | 'document-memory' | 'proforma';

export interface ProformaSettingsData {
  id?: number;
  companyName?: string;
  companyLogo?: string;
  address?: string;
  phone?: string;
  email?: string;
  defaultCurrency?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  notes?: string;
  bankDetails?: string;
  defaultPortOfLoading?: string;
  defaultCountryOfOrigin?: string;
  defaultTransportationMode?: string;
}

export interface ProformaItemData {
  id: number;
  proformaId: string;
  productId: string;
  customName?: string | null;
  customDescription?: string | null;
  customPrice?: number | null;
  quantity: number;
  // User-set unit of measure for this row. Falls back to productUnit when null.
  unit?: string | null;
  sortOrder?: number;
  productName?: string;
  productDescription?: string;
  productPrice?: number;
  productUnit?: string;
  productCurrency?: string;
  productStockCode?: string;
  productSupplier?: string;
  // Per-row values for the proforma's user-defined custom columns. Keyed by
  // column id (see ProformaCustomColumn). Stored as strings; the Edit/Preview
  // components parse numeric columns lazily so partial input is preserved.
  customValues?: Record<string, string> | null;
}

// One user-added column on the proforma items table. The user picks the name
// and the data type; position relative to the built-in columns is computed
// from orderIndex (smaller = further left, larger = further right).
//
// type='formula' columns are computed read-only cells whose value is derived
// from `formula` (see shared/proformaFormula.ts for grammar).
// `unit` is an optional display label shown after the column header
// (e.g. "kg", "m²", "%").
export interface ProformaCustomColumn {
  id: string;
  name: string;
  type: 'text' | 'number' | 'formula';
  // Legacy ordering field. New code drives display order via the proforma's
  // `columnOrder` array (which orders built-ins + customs together) so this
  // is optional; we keep it for backwards compatibility with older payloads.
  orderIndex?: number;
  unit?: string;
  formula?: string;
}

// Built-in column ids that the user is allowed to hide. 'product' (description)
// and 'quantity' are required and never appear in this set.
export type ProformaHideableBuiltin = 'unit' | 'unitPrice' | 'total';

// Display order for ALL columns (built-in + custom) in a proforma's items
// table. Each entry is a column id — built-in ids ('product', 'unitPrice',
// 'customPrice', 'quantity', 'total') or the id of a ProformaCustomColumn.
// Persisted on the proforma so the user's drag-and-drop ordering survives
// reloads and is mirrored in the preview / PDF / Excel exports.
export type ProformaColumnOrder = string[];

export interface ProformaFinancialData {
  id: number;
  proformaId: string;
  name: string;
  type: 'add' | 'subtract';
  valueType: 'percentage' | 'fixed';
  value: number;
  orderIndex: number;
}

export interface CustomerFieldData {
  id: number;
  customerId: number;
  fieldName: string;
  fieldValue?: string | null;
  sortOrder: number;
}

export interface CustomerData {
  id: number;
  name: string;
  createdAt?: string | null;
  fields?: CustomerFieldData[];
}

export interface ProformaData {
  id: number;
  proformaId: string;
  customerId?: number | null;
  customerName: string;
  customerCountry?: string | null;
  customerContact?: string | null;
  currency?: string | null;
  status?: string | null;
  notes?: string | null;
  shipTo?: string | null;
  portOfLoading?: string | null;
  placeOfDestination?: string | null;
  finalPlaceOfDelivery?: string | null;
  countryOfOrigin?: string | null;
  transportationMode?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  date?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  // Custom column definitions (user-added columns shown in the items
  // table and the printed preview). See ProformaCustomColumn above.
  customColumns?: ProformaCustomColumn[] | null;
  // Column ids that should be hidden in both the editor and the preview.
  // 'product' (Description) and 'quantity' (Qty) are required and ignored
  // if present here.
  hiddenColumns?: string[] | null;
  // User-defined display order of column ids (built-in + custom). Empty
  // or missing → fall back to canonical order.
  columnOrder?: string[] | null;
  // Optional row-total formula override. When null/empty/'default', row
  // totals use qty × unit_price. See shared/proformaFormula.ts.
  totalFormula?: string | null;
  // Optional quantity formula. When null/empty/'default', each row's quantity
  // is entered manually. When set, the per-row quantity is computed from this
  // formula and feeds the row total / subtotal. See shared/proformaFormula.ts.
  quantityFormula?: string | null;
  // Optional manual override for the computed final total.
  finalTotalOverride?: number | null;
  // Column ids selected for column-sum display in the invoice totals section.
  summaryColumns?: string[] | null;
  // Custom label text for the FINAL TOTAL row (e.g. "TOTAL CIF ISTANBUL").
  finalTotalLabel?: string | null;
  // Label overrides for built-in columns (keyed by col id).
  builtinColumnLabels?: Record<string, string> | null;
  // Versioning: version number (1 = original). Versions > 1 have a
  // parentProformaId linking them to the base invoice.
  version?: number | null;
  parentProformaId?: string | null;
  items?: ProformaItemData[];
  financials?: ProformaFinancialData[];
  customerFields?: CustomerFieldData[];
}

export type UserRole = 'Admin' | 'Editor' | 'Viewer';

export interface User {
  id: string;
  name: string;
  role: UserRole;
}

// =============================================================================
// Product Qualification — Phase 1 (additive only)
// =============================================================================
// Mirrors shared/schema.ts. Used by the System Builder qualification filter
// and any future qualification UI.
export interface QualificationTag {
  id: number;
  productId: string;
  substrateTypes: string[] | null;
  humidityTolerance: string | null;
  dutyRating: string | null;
  finishType: string | null;
  // Layer Position drives the engine's substrate/finish overrides. We rely
  // on it in the Primer Library import flow to surface only those qualified
  // products that the user has marked as primers.
  layerPosition: string | null;
  qualifiedAt: string | null;
  qualifiedBy: string | null;
  isSystemReady: boolean;
}

export interface QualificationVocabulary {
  id: number;
  vocabType: string; // 'substrate' | 'humidity' | 'duty' | 'finish'
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}
