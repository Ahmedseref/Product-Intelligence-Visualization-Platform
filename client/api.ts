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
  customFields?: any[];
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

export interface MasterProductData {
  id?: number;
  masterProductId: string;
  name: string;
  nodeId: string;
  description?: string;
  imageUrl?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierProductData {
  id?: number;
  supplierProductId: string;
  masterProductId: string;
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

  async getMasterProducts(): Promise<MasterProductData[]> {
    const res = await fetch(`${API_BASE}/master-products`);
    if (!res.ok) throw new Error('Failed to fetch master products');
    return res.json();
  },

  async createMasterProduct(mp: Omit<MasterProductData, 'id'>): Promise<MasterProductData> {
    const res = await fetch(`${API_BASE}/master-products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mp),
    });
    if (!res.ok) throw new Error('Failed to create master product');
    return res.json();
  },

  async updateMasterProduct(masterProductId: string, updates: Partial<MasterProductData>): Promise<MasterProductData> {
    const res = await fetch(`${API_BASE}/master-products/${masterProductId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update master product');
    return res.json();
  },

  async deleteMasterProduct(masterProductId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/master-products/${masterProductId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete master product');
  },

  async getSupplierProducts(): Promise<SupplierProductData[]> {
    const res = await fetch(`${API_BASE}/supplier-products`);
    if (!res.ok) throw new Error('Failed to fetch supplier products');
    return res.json();
  },

  async getSupplierProductsByMaster(masterProductId: string): Promise<SupplierProductData[]> {
    const res = await fetch(`${API_BASE}/supplier-products/by-master/${masterProductId}`);
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
};
