const API_BASE = '/api';

export interface TreeNodeData {
  id?: number;
  nodeId: string;
  name: string;
  type: string;
  parentId: string | null;
  description?: string;
  metadata?: Record<string, any>;
  isActive?: boolean;
  sortOrder?: number;
}

export interface TechnicalSpecData {
  id: string;
  name: string;
  value: string;
  unit?: string;
  affectsPrice?: boolean;
}

export interface ProductData {
  id?: number;
  productId: string;
  name: string;
  supplier?: string;
  supplierId?: string;
  nodeId: string;
  manufacturer?: string;
  manufacturingLocation?: string;
  description?: string;
  imageUrl?: string;
  price?: number;
  currency?: string;
  unit?: string;
  moq?: number;
  leadTime?: number;
  packagingType?: string;
  hsCode?: string;
  certifications?: string[];
  shelfLife?: string;
  storageConditions?: string;
  customFields?: Record<string, any>;
  technicalSpecs?: TechnicalSpecData[];
  category?: string;
  sector?: string;
  createdBy?: string;
  history?: any[];
  dateAdded?: string;
  lastUpdated?: string;
}

export interface CustomFieldData {
  id?: number;
  fieldId: string;
  label: string;
  type: string;
  options?: string[];
  nodeId?: string;
  isGlobal?: boolean;
}

export interface SupplierData {
  id?: number;
  supplierId: string;
  name: string;
  country?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  website?: string;
  notes?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierProductData {
  id?: number;
  supplierProductId: string;
  supplierId: string;
  formFactor?: string;
  sku?: string;
  price?: number;
  currency?: string;
  unit?: string;
  moq?: number;
  leadTime?: number;
  packagingType?: string;
  hsCode?: string;
  certifications?: string[];
  technicalSpecs?: TechnicalSpecData[];
  images?: string[];
  isActive?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  history?: any[];
}

export const api = {
  async getTreeNodes(): Promise<TreeNodeData[]> {
    const res = await fetch(`${API_BASE}/tree-nodes`);
    if (!res.ok) throw new Error('Failed to fetch tree nodes');
    return res.json();
  },

  async createTreeNode(node: Omit<TreeNodeData, 'id'>): Promise<TreeNodeData> {
    const res = await fetch(`${API_BASE}/tree-nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(node),
    });
    if (!res.ok) throw new Error('Failed to create tree node');
    return res.json();
  },

  async updateTreeNode(nodeId: string, updates: Partial<TreeNodeData>): Promise<TreeNodeData> {
    const res = await fetch(`${API_BASE}/tree-nodes/${nodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update tree node');
    return res.json();
  },

  async deleteTreeNode(nodeId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/tree-nodes/${nodeId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete tree node');
  },

  async getProducts(): Promise<ProductData[]> {
    const res = await fetch(`${API_BASE}/products`);
    if (!res.ok) throw new Error('Failed to fetch products');
    return res.json();
  },

  async createProduct(product: Omit<ProductData, 'id'>): Promise<ProductData> {
    const res = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
    if (!res.ok) throw new Error('Failed to create product');
    return res.json();
  },

  async updateProduct(productId: string, updates: Partial<ProductData>): Promise<ProductData> {
    const res = await fetch(`${API_BASE}/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update product');
    return res.json();
  },

  async deleteProduct(productId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/products/${productId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete product');
  },

  async getCustomFields(): Promise<CustomFieldData[]> {
    const res = await fetch(`${API_BASE}/custom-fields`);
    if (!res.ok) throw new Error('Failed to fetch custom fields');
    return res.json();
  },

  async createCustomField(field: Omit<CustomFieldData, 'id'>): Promise<CustomFieldData> {
    const res = await fetch(`${API_BASE}/custom-fields`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(field),
    });
    if (!res.ok) throw new Error('Failed to create custom field');
    return res.json();
  },

  async deleteCustomField(fieldId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/custom-fields/${fieldId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete custom field');
  },

  async seedDatabase(): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/seed`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to seed database');
    return res.json();
  },

  async getSuppliers(): Promise<SupplierData[]> {
    const res = await fetch(`${API_BASE}/suppliers`);
    if (!res.ok) throw new Error('Failed to fetch suppliers');
    return res.json();
  },

  async createSupplier(supplier: Omit<SupplierData, 'id'>): Promise<SupplierData> {
    const res = await fetch(`${API_BASE}/suppliers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(supplier),
    });
    if (!res.ok) throw new Error('Failed to create supplier');
    return res.json();
  },

  async updateSupplier(supplierId: string, updates: Partial<SupplierData>): Promise<SupplierData> {
    const res = await fetch(`${API_BASE}/suppliers/${supplierId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update supplier');
    return res.json();
  },

  async deleteSupplier(supplierId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/suppliers/${supplierId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete supplier');
  },

  async getSupplierProducts(): Promise<SupplierProductData[]> {
    const res = await fetch(`${API_BASE}/supplier-products`);
    if (!res.ok) throw new Error('Failed to fetch supplier products');
    return res.json();
  },

  async getSupplierProductsBySupplier(supplierId: string): Promise<SupplierProductData[]> {
    const res = await fetch(`${API_BASE}/supplier-products/by-supplier/${supplierId}`);
    if (!res.ok) throw new Error('Failed to fetch supplier products');
    return res.json();
  },

  async createSupplierProduct(sp: Omit<SupplierProductData, 'id'>): Promise<SupplierProductData> {
    const res = await fetch(`${API_BASE}/supplier-products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sp),
    });
    if (!res.ok) throw new Error('Failed to create supplier product');
    return res.json();
  },

  async updateSupplierProduct(supplierProductId: string, updates: Partial<SupplierProductData>): Promise<SupplierProductData> {
    const res = await fetch(`${API_BASE}/supplier-products/${supplierProductId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update supplier product');
    return res.json();
  },

  async deleteSupplierProduct(supplierProductId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/supplier-products/${supplierProductId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete supplier product');
  },

  async getUsageAreas(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/settings/usage-areas`);
    if (!res.ok) throw new Error('Failed to fetch usage areas');
    return res.json();
  },

  async updateUsageAreas(areas: string[]): Promise<string[]> {
    const res = await fetch(`${API_BASE}/settings/usage-areas`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ areas }),
    });
    if (!res.ok) throw new Error('Failed to update usage areas');
    return res.json();
  },

  async listBackups(): Promise<BackupSummary[]> {
    const res = await fetch(`${API_BASE}/backups`);
    if (!res.ok) throw new Error('Failed to fetch backups');
    return res.json();
  },

  async createBackup(description?: string): Promise<BackupSummary> {
    const res = await fetch(`${API_BASE}/backups/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    });
    if (!res.ok) throw new Error('Failed to create backup');
    return res.json();
  },

  async getRestorePreview(id: number): Promise<RestorePreview> {
    const res = await fetch(`${API_BASE}/backups/${id}/preview`);
    if (!res.ok) throw new Error('Failed to get restore preview');
    return res.json();
  },

  async restoreBackup(id: number): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/backups/restore/${id}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to restore backup');
    }
    return res.json();
  },

  async exportBackup(id: number): Promise<Blob> {
    const res = await fetch(`${API_BASE}/backups/${id}/export`);
    if (!res.ok) throw new Error('Failed to export backup');
    return res.blob();
  },

  async importBackup(file: File): Promise<{ success: boolean; backupId?: number; message: string }> {
    const arrayBuffer = await file.arrayBuffer();
    const res = await fetch(`${API_BASE}/backups/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: arrayBuffer,
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to import backup');
    }
    return res.json();
  },

  async deleteBackup(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/backups/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete backup');
  },

  async triggerAutoBackup(reason: string): Promise<BackupSummary> {
    const res = await fetch(`${API_BASE}/backups/auto-trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error('Failed to trigger auto-backup');
    return res.json();
  },

  async getBackupSettings(): Promise<BackupSettingsData> {
    const res = await fetch(`${API_BASE}/backups/settings`);
    if (!res.ok) throw new Error('Failed to fetch backup settings');
    return res.json();
  },

  async updateBackupSettings(settings: Partial<BackupSettingsData>): Promise<BackupSettingsData> {
    const res = await fetch(`${API_BASE}/backups/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to update backup settings');
    return res.json();
  },
};

export interface BackupSummary {
  id: number;
  versionNumber: number;
  createdAt: string | null;
  triggerType: string;
  description: string | null;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  entityCounts: Record<string, number>;
}

export interface RestorePreview {
  products: number;
  suppliers: number;
  treeNodes: number;
  customFieldDefinitions: number;
  appSettings: number;
}

export interface BackupSettingsData {
  maxBackups: number;
  autoBackupIntervalHours: number;
}
