
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
}

export interface Product {
  id: string;
  name: string;
  supplier: string;
  supplierId?: string;
  nodeId: string; // Linked to the tree
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

export type ViewMode = 'dashboard' | 'inventory' | 'visualize' | 'add-product' | 'taxonomy-manager' | 'suppliers' | 'settings';
export type UserRole = 'Admin' | 'Editor' | 'Viewer';

export interface User {
  id: string;
  name: string;
  role: UserRole;
}
