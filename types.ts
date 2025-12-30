
export type FieldType = 'text' | 'number' | 'currency' | 'percentage' | 'date' | 'boolean' | 'dropdown';

export interface CustomField {
  id: string;
  label: string;
  type: FieldType;
  options?: string[]; // for dropdowns
}

export interface CustomFieldValue {
  fieldId: string;
  value: any;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  changes: Record<string, { old: any; new: any }>;
  snapshot: Partial<Product>;
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
  customFields: CustomFieldValue[];
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

export type ViewMode = 'dashboard' | 'inventory' | 'visualize' | 'add-product' | 'taxonomy-manager';
export type UserRole = 'Admin' | 'Editor' | 'Viewer';

export interface User {
  id: string;
  name: string;
  role: UserRole;
}
