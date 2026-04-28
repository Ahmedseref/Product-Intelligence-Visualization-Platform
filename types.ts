
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
  systemSubstrate?: string | null;
  systemHumidity?: string | null;
  systemDuty?: string | null;
  // Optional per-sector overrides keyed by sector name.
  sectorOverrides?: Record<string, { substrateOverride?: string | null }> | null;
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
  createdAt: string;
  updatedAt: string;
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

export type ViewMode = 'technical-intelligence' | 'inventory' | 'add-product' | 'taxonomy-manager' | 'suppliers' | 'settings' | 'system-builder' | 'document-memory' | 'proforma';

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
export interface ProformaCustomColumn {
  id: string;
  name: string;
  type: 'text' | 'number';
  orderIndex: number;
}

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
