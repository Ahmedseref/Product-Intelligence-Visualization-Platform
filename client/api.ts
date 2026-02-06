const API_BASE = '/api';

export interface TreeNodeData {
  id?: number;
  nodeId: string;
  name: string;
  type: string;
  parentId: string | null;
  description?: string;
  metadata?: Record<string, any>;
  branchCode?: string;
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
  stockCode?: string;
  colorId?: number;
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

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return fetch(url, { ...options, headers });
}

export const api = {
  async getTreeNodes(): Promise<TreeNodeData[]> {
    const res = await authFetch(`${API_BASE}/tree-nodes`);
    if (!res.ok) throw new Error('Failed to fetch tree nodes');
    return res.json();
  },

  async createTreeNode(node: Omit<TreeNodeData, 'id'>): Promise<TreeNodeData> {
    const res = await authFetch(`${API_BASE}/tree-nodes`, {
      method: 'POST',
      body: JSON.stringify(node),
    });
    if (!res.ok) throw new Error('Failed to create tree node');
    return res.json();
  },

  async updateTreeNode(nodeId: string, updates: Partial<TreeNodeData>): Promise<TreeNodeData> {
    const res = await authFetch(`${API_BASE}/tree-nodes/${nodeId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update tree node');
    return res.json();
  },

  async deleteTreeNode(nodeId: string): Promise<void> {
    const res = await authFetch(`${API_BASE}/tree-nodes/${nodeId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete tree node');
  },

  async getProducts(): Promise<ProductData[]> {
    const res = await authFetch(`${API_BASE}/products`);
    if (!res.ok) throw new Error('Failed to fetch products');
    return res.json();
  },

  async createProduct(product: Omit<ProductData, 'id'>): Promise<ProductData> {
    const res = await authFetch(`${API_BASE}/products`, {
      method: 'POST',
      body: JSON.stringify(product),
    });
    if (!res.ok) throw new Error('Failed to create product');
    return res.json();
  },

  async updateProduct(productId: string, updates: Partial<ProductData>): Promise<ProductData> {
    const res = await authFetch(`${API_BASE}/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update product');
    return res.json();
  },

  async deleteProduct(productId: string): Promise<void> {
    const res = await authFetch(`${API_BASE}/products/${productId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete product');
  },

  async getCustomFields(): Promise<CustomFieldData[]> {
    const res = await authFetch(`${API_BASE}/custom-fields`);
    if (!res.ok) throw new Error('Failed to fetch custom fields');
    return res.json();
  },

  async createCustomField(field: Omit<CustomFieldData, 'id'>): Promise<CustomFieldData> {
    const res = await authFetch(`${API_BASE}/custom-fields`, {
      method: 'POST',
      body: JSON.stringify(field),
    });
    if (!res.ok) throw new Error('Failed to create custom field');
    return res.json();
  },

  async deleteCustomField(fieldId: string): Promise<void> {
    const res = await authFetch(`${API_BASE}/custom-fields/${fieldId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete custom field');
  },

  async seedDatabase(): Promise<{ message: string }> {
    const res = await authFetch(`${API_BASE}/seed`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to seed database');
    return res.json();
  },

  async getSuppliers(): Promise<SupplierData[]> {
    const res = await authFetch(`${API_BASE}/suppliers`);
    if (!res.ok) throw new Error('Failed to fetch suppliers');
    return res.json();
  },

  async createSupplier(supplier: Omit<SupplierData, 'id'>): Promise<SupplierData> {
    const res = await authFetch(`${API_BASE}/suppliers`, {
      method: 'POST',
      body: JSON.stringify(supplier),
    });
    if (!res.ok) throw new Error('Failed to create supplier');
    return res.json();
  },

  async updateSupplier(supplierId: string, updates: Partial<SupplierData>): Promise<SupplierData> {
    const res = await authFetch(`${API_BASE}/suppliers/${supplierId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update supplier');
    return res.json();
  },

  async deleteSupplier(supplierId: string): Promise<void> {
    const res = await authFetch(`${API_BASE}/suppliers/${supplierId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete supplier');
  },

  async getSupplierProducts(): Promise<SupplierProductData[]> {
    const res = await authFetch(`${API_BASE}/supplier-products`);
    if (!res.ok) throw new Error('Failed to fetch supplier products');
    return res.json();
  },

  async getSupplierProductsBySupplier(supplierId: string): Promise<SupplierProductData[]> {
    const res = await authFetch(`${API_BASE}/supplier-products/by-supplier/${supplierId}`);
    if (!res.ok) throw new Error('Failed to fetch supplier products');
    return res.json();
  },

  async createSupplierProduct(sp: Omit<SupplierProductData, 'id'>): Promise<SupplierProductData> {
    const res = await authFetch(`${API_BASE}/supplier-products`, {
      method: 'POST',
      body: JSON.stringify(sp),
    });
    if (!res.ok) throw new Error('Failed to create supplier product');
    return res.json();
  },

  async updateSupplierProduct(supplierProductId: string, updates: Partial<SupplierProductData>): Promise<SupplierProductData> {
    const res = await authFetch(`${API_BASE}/supplier-products/${supplierProductId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update supplier product');
    return res.json();
  },

  async deleteSupplierProduct(supplierProductId: string): Promise<void> {
    const res = await authFetch(`${API_BASE}/supplier-products/${supplierProductId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete supplier product');
  },

  async getColors(): Promise<any[]> {
    const res = await authFetch(`${API_BASE}/colors`);
    if (!res.ok) throw new Error('Failed to fetch colors');
    return res.json();
  },

  async createColor(color: { name: string; code: string; hexValue?: string }): Promise<any> {
    const res = await authFetch(`${API_BASE}/colors`, {
      method: 'POST',
      body: JSON.stringify(color),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create color');
    }
    return res.json();
  },

  async updateColor(id: number, updates: Partial<{ name: string; code: string; hexValue: string; isActive: boolean; sortOrder: number }>): Promise<any> {
    const res = await authFetch(`${API_BASE}/colors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update color');
    return res.json();
  },

  async deleteColor(id: number): Promise<void> {
    const res = await authFetch(`${API_BASE}/colors/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete color');
  },

  async generateStockCode(productId: string): Promise<{ stockCode: string }> {
    const res = await authFetch(`${API_BASE}/stock-codes/generate/${productId}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to generate stock code');
    return res.json();
  },

  async previewStockCode(nodeId: string, colorId?: number, productId?: string): Promise<{ stockCode: string }> {
    const params = new URLSearchParams({ nodeId });
    if (colorId) params.append('colorId', String(colorId));
    if (productId) params.append('productId', productId);
    const res = await authFetch(`${API_BASE}/stock-codes/preview?${params}`);
    if (!res.ok) throw new Error('Failed to preview stock code');
    return res.json();
  },

  async bulkRegenerateStockCodes(): Promise<{ updated: number }> {
    const res = await authFetch(`${API_BASE}/stock-codes/bulk-regenerate`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to regenerate stock codes');
    return res.json();
  },

  async migrateExistingBranchCodes(): Promise<{ migrated: number }> {
    const res = await authFetch(`${API_BASE}/stock-codes/migrate-branch-codes`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to migrate branch codes');
    return res.json();
  },

  async getStockCodeHistory(productId: string): Promise<any[]> {
    const res = await authFetch(`${API_BASE}/stock-codes/history/${productId}`);
    if (!res.ok) throw new Error('Failed to fetch stock code history');
    return res.json();
  },

  async getAllStockCodeHistory(): Promise<any[]> {
    const res = await authFetch(`${API_BASE}/stock-codes/history`);
    if (!res.ok) throw new Error('Failed to fetch stock code history');
    return res.json();
  },

  async getBranchDirectory(): Promise<any[]> {
    const res = await authFetch(`${API_BASE}/stock-codes/branch-directory`);
    if (!res.ok) throw new Error('Failed to fetch branch directory');
    return res.json();
  },

  async getStockCodeStats(): Promise<any> {
    const res = await authFetch(`${API_BASE}/stock-codes/stats`);
    if (!res.ok) throw new Error('Failed to fetch stock code stats');
    return res.json();
  },

  async suggestBranchCode(name: string, excludeNodeId?: string): Promise<{ suggestion: string }> {
    const res = await authFetch(`${API_BASE}/stock-codes/suggest-branch-code`, {
      method: 'POST',
      body: JSON.stringify({ name, excludeNodeId }),
    });
    if (!res.ok) throw new Error('Failed to suggest branch code');
    return res.json();
  },

  async getUsageAreas(): Promise<string[]> {
    const res = await authFetch(`${API_BASE}/settings/usage-areas`);
    if (!res.ok) throw new Error('Failed to fetch usage areas');
    return res.json();
  },

  async updateUsageAreas(areas: string[]): Promise<string[]> {
    const res = await authFetch(`${API_BASE}/settings/usage-areas`, {
      method: 'PUT',
      body: JSON.stringify({ areas }),
    });
    if (!res.ok) throw new Error('Failed to update usage areas');
    return res.json();
  },

  async listBackups(): Promise<BackupSummary[]> {
    const res = await authFetch(`${API_BASE}/backups`);
    if (!res.ok) throw new Error('Failed to fetch backups');
    return res.json();
  },

  async createBackup(description?: string): Promise<BackupSummary> {
    const res = await authFetch(`${API_BASE}/backups/create`, {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
    if (!res.ok) throw new Error('Failed to create backup');
    return res.json();
  },

  async getRestorePreview(id: number): Promise<RestorePreview> {
    const res = await authFetch(`${API_BASE}/backups/${id}/preview`);
    if (!res.ok) throw new Error('Failed to get restore preview');
    return res.json();
  },

  async restoreBackup(id: number): Promise<{ success: boolean; message: string }> {
    const res = await authFetch(`${API_BASE}/backups/restore/${id}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to restore backup');
    }
    return res.json();
  },

  async exportBackup(id: number): Promise<Blob> {
    const res = await authFetch(`${API_BASE}/backups/${id}/export`);
    if (!res.ok) throw new Error('Failed to export backup');
    return res.blob();
  },

  async importBackup(file: File): Promise<{ success: boolean; backupId?: number; message: string }> {
    const arrayBuffer = await file.arrayBuffer();
    const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const res = await fetch(`${API_BASE}/backups/import`, {
      method: 'POST',
      headers,
      body: arrayBuffer,
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to import backup');
    }
    return res.json();
  },

  async deleteBackup(id: number): Promise<void> {
    const res = await authFetch(`${API_BASE}/backups/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete backup');
  },

  async triggerAutoBackup(reason: string): Promise<BackupSummary> {
    const res = await authFetch(`${API_BASE}/backups/auto-trigger`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error('Failed to trigger auto-backup');
    return res.json();
  },

  async getBackupSettings(): Promise<BackupSettingsData> {
    const res = await authFetch(`${API_BASE}/backups/settings`);
    if (!res.ok) throw new Error('Failed to fetch backup settings');
    return res.json();
  },

  async updateBackupSettings(settings: Partial<BackupSettingsData>): Promise<BackupSettingsData> {
    const res = await authFetch(`${API_BASE}/backups/settings`, {
      method: 'PUT',
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

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  isFirstLogin: boolean;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function initAuthToken(): void {
  authToken = getStoredToken();
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

export const authApi = {
  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }
    return response.json();
  },

  async logout(): Promise<void> {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    setAuthToken(null);
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const response = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to change password');
    }
  },

  async getCurrentUser(): Promise<AuthUser | null> {
    if (!authToken) return null;
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        if (response.status === 401) {
          setAuthToken(null);
          return null;
        }
        throw new Error('Failed to get user');
      }
      return response.json();
    } catch {
      return null;
    }
  },
};

export const systemsApi = {
  getSectors: async () => {
    const response = await fetch(`${API_BASE}/sectors`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch sectors');
    return response.json();
  },
  createSector: async (data: { name: string; description?: string }) => {
    const response = await fetch(`${API_BASE}/sectors`, {
      method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create sector');
    return response.json();
  },
  updateSector: async (sectorId: string, data: Partial<{ name: string; description?: string }>) => {
    const response = await fetch(`${API_BASE}/sectors/${sectorId}`, {
      method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update sector');
    return response.json();
  },
  deleteSector: async (sectorId: string) => {
    const response = await fetch(`${API_BASE}/sectors/${sectorId}`, {
      method: 'DELETE', headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete sector');
    return response.json();
  },

  getSystems: async () => {
    const response = await fetch(`${API_BASE}/systems`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch systems');
    return response.json();
  },
  getSystem: async (systemId: string) => {
    const response = await fetch(`${API_BASE}/systems/${systemId}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch system');
    return response.json();
  },
  getSystemFull: async (systemId: string) => {
    const response = await fetch(`${API_BASE}/systems/${systemId}/full`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch full system');
    return response.json();
  },
  createSystem: async (data: { name: string; description?: string; typicalUses?: string; sectorMapping?: string[] }) => {
    const response = await fetch(`${API_BASE}/systems`, {
      method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create system');
    return response.json();
  },
  updateSystem: async (systemId: string, data: Partial<{ name: string; description?: string; typicalUses?: string; sectorMapping?: string[]; status?: string }>) => {
    const response = await fetch(`${API_BASE}/systems/${systemId}`, {
      method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update system');
    return response.json();
  },
  deleteSystem: async (systemId: string) => {
    const response = await fetch(`${API_BASE}/systems/${systemId}`, {
      method: 'DELETE', headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete system');
    return response.json();
  },

  getLayers: async (systemId: string) => {
    const response = await fetch(`${API_BASE}/system-layers/${systemId}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch layers');
    return response.json();
  },
  createLayer: async (data: { systemId: string; layerName: string; orderSequence?: number; notes?: string }) => {
    const response = await fetch(`${API_BASE}/system-layers`, {
      method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create layer');
    return response.json();
  },
  updateLayer: async (layerId: string, data: Partial<{ layerName: string; notes?: string; orderSequence?: number }>) => {
    const response = await fetch(`${API_BASE}/system-layers/${layerId}`, {
      method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update layer');
    return response.json();
  },
  reorderLayers: async (systemId: string, layerOrder: string[]) => {
    const response = await fetch(`${API_BASE}/system-layers/reorder/${systemId}`, {
      method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ layerOrder }),
    });
    if (!response.ok) throw new Error('Failed to reorder layers');
    return response.json();
  },
  deleteLayer: async (layerId: string) => {
    const response = await fetch(`${API_BASE}/system-layers/${layerId}`, {
      method: 'DELETE', headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete layer');
    return response.json();
  },

  getProductOptions: async (layerId: string) => {
    const response = await fetch(`${API_BASE}/system-product-options/${layerId}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch product options');
    return response.json();
  },
  addProductOption: async (data: { layerId: string; productId: string; benefit?: string; isDefault?: boolean }) => {
    const response = await fetch(`${API_BASE}/system-product-options`, {
      method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to add product option');
    return response.json();
  },
  updateProductOption: async (optionId: string, data: Partial<{ benefit?: string; isDefault?: boolean }>) => {
    const response = await fetch(`${API_BASE}/system-product-options/${optionId}`, {
      method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update product option');
    return response.json();
  },
  removeProductOption: async (optionId: string) => {
    const response = await fetch(`${API_BASE}/system-product-options/${optionId}`, {
      method: 'DELETE', headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to remove product option');
    return response.json();
  },

  getStats: async () => {
    const response = await fetch(`${API_BASE}/systems/stats/overview`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch stats');
    return response.json();
  },
  createSnapshot: async (systemId: string, data?: { description?: string; changedBy?: string }) => {
    const response = await fetch(`${API_BASE}/systems/${systemId}/snapshot`, {
      method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
    });
    if (!response.ok) throw new Error('Failed to create snapshot');
    return response.json();
  },
  getHistory: async (systemId: string) => {
    const response = await fetch(`${API_BASE}/system-history/${systemId}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch history');
    return response.json();
  },
  exportSystem: async (systemId: string, format: 'json' | 'csv' = 'json') => {
    const response = await fetch(`${API_BASE}/systems/export/${systemId}?format=${format}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to export system');
    if (format === 'csv') {
      const blob = await response.blob();
      return blob;
    }
    return response.json();
  },
  importSystem: async (data: any) => {
    const response = await fetch(`${API_BASE}/systems/import`, {
      method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to import system');
    return response.json();
  },
};

const buildFilterParams = (filters?: { supplier?: string; sector?: string; taxonomy?: string }): string => {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.supplier) params.set('supplier', filters.supplier);
  if (filters.sector) params.set('sector', filters.sector);
  if (filters.taxonomy) params.set('taxonomy', filters.taxonomy);
  const str = params.toString();
  return str ? `&${str}` : '';
};

export const analyticsApi = {
  getOverview: async (filters?: { supplier?: string; sector?: string; taxonomy?: string }) => {
    const fp = buildFilterParams(filters);
    const response = await fetch(`${API_BASE}/analytics/overview?_=1${fp}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch analytics overview');
    return response.json();
  },
  getProductIntelligence: async (filters?: { supplier?: string; sector?: string; taxonomy?: string }) => {
    const fp = buildFilterParams(filters);
    const response = await fetch(`${API_BASE}/analytics/product-intelligence?_=1${fp}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch product intelligence');
    return response.json();
  },
  getSystemIntelligence: async (filters?: { supplier?: string; sector?: string; taxonomy?: string }) => {
    const fp = buildFilterParams(filters);
    const response = await fetch(`${API_BASE}/analytics/system-intelligence?_=1${fp}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch system intelligence');
    return response.json();
  },
  getSupplierHeatmap: async (mode: string, filters?: { supplier?: string; sector?: string; taxonomy?: string }) => {
    const fp = buildFilterParams(filters);
    const response = await fetch(`${API_BASE}/analytics/supplier-heatmap?mode=${mode}${fp}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch supplier heatmap');
    return response.json();
  },
  getTaxonomySupplier: async (filters?: { supplier?: string; sector?: string; taxonomy?: string }) => {
    const fp = buildFilterParams(filters);
    const response = await fetch(`${API_BASE}/analytics/taxonomy-supplier?_=1${fp}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch taxonomy supplier data');
    return response.json();
  },
  getCoverageRadar: async (filters?: { supplier?: string; sector?: string; taxonomy?: string }) => {
    const fp = buildFilterParams(filters);
    const response = await fetch(`${API_BASE}/analytics/coverage-radar?_=1${fp}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch coverage radar');
    return response.json();
  },
  getCompetitiveBenchmark: async (systemId?: string, filters?: { supplier?: string; sector?: string; taxonomy?: string }) => {
    const fp = buildFilterParams(filters);
    const url = systemId
      ? `${API_BASE}/analytics/competitive-benchmark?systemId=${systemId}${fp}`
      : `${API_BASE}/analytics/competitive-benchmark?_=1${fp}`;
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch competitive benchmark');
    return response.json();
  },
  getFilters: async () => {
    const response = await fetch(`${API_BASE}/analytics/filters`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch filters');
    return response.json();
  },
};
