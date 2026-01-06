import { 
  treeNodes, products, customFieldDefinitions,
  suppliers, masterProducts, supplierProducts, attachments,
  type TreeNode, type InsertTreeNode,
  type Product, type InsertProduct,
  type CustomFieldDefinition, type InsertCustomFieldDefinition,
  type Supplier, type InsertSupplier,
  type MasterProduct, type InsertMasterProduct,
  type SupplierProduct, type InsertSupplierProduct,
  type Attachment, type InsertAttachment
} from "@shared/schema";
import { db } from "./db";
import { eq, and, isNull } from "drizzle-orm";

export interface IStorage {
  getTreeNodes(): Promise<TreeNode[]>;
  getTreeNode(nodeId: string): Promise<TreeNode | undefined>;
  createTreeNode(node: InsertTreeNode): Promise<TreeNode>;
  updateTreeNode(nodeId: string, updates: Partial<InsertTreeNode>): Promise<TreeNode | undefined>;
  deleteTreeNode(nodeId: string): Promise<boolean>;
  
  getProducts(): Promise<Product[]>;
  getProduct(productId: string): Promise<Product | undefined>;
  getProductsByNodeId(nodeId: string): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(productId: string, updates: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(productId: string): Promise<boolean>;
  
  getCustomFieldDefinitions(): Promise<CustomFieldDefinition[]>;
  createCustomFieldDefinition(field: InsertCustomFieldDefinition): Promise<CustomFieldDefinition>;
  deleteCustomFieldDefinition(fieldId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getTreeNodes(): Promise<TreeNode[]> {
    return await db.select().from(treeNodes).orderBy(treeNodes.sortOrder);
  }

  async getTreeNode(nodeId: string): Promise<TreeNode | undefined> {
    const [node] = await db.select().from(treeNodes).where(eq(treeNodes.nodeId, nodeId));
    return node || undefined;
  }

  async createTreeNode(node: InsertTreeNode): Promise<TreeNode> {
    const [created] = await db.insert(treeNodes).values(node).returning();
    return created;
  }

  async updateTreeNode(nodeId: string, updates: Partial<InsertTreeNode>): Promise<TreeNode | undefined> {
    const [updated] = await db
      .update(treeNodes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(treeNodes.nodeId, nodeId))
      .returning();
    return updated || undefined;
  }

  async deleteTreeNode(nodeId: string): Promise<boolean> {
    const children = await db.select().from(treeNodes).where(eq(treeNodes.parentId, nodeId));
    for (const child of children) {
      await this.deleteTreeNode(child.nodeId);
    }
    
    await db.delete(products).where(eq(products.nodeId, nodeId));
    
    const result = await db.delete(treeNodes).where(eq(treeNodes.nodeId, nodeId)).returning();
    return result.length > 0;
  }

  async getProducts(): Promise<Product[]> {
    return await db.select().from(products).orderBy(products.dateAdded);
  }

  async getProduct(productId: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.productId, productId));
    return product || undefined;
  }

  async getProductsByNodeId(nodeId: string): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.nodeId, nodeId));
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    return created;
  }

  async updateProduct(productId: string, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db
      .update(products)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(products.productId, productId))
      .returning();
    return updated || undefined;
  }

  async deleteProduct(productId: string): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.productId, productId)).returning();
    return result.length > 0;
  }

  async getCustomFieldDefinitions(): Promise<CustomFieldDefinition[]> {
    return await db.select().from(customFieldDefinitions);
  }

  async createCustomFieldDefinition(field: InsertCustomFieldDefinition): Promise<CustomFieldDefinition> {
    const [created] = await db.insert(customFieldDefinitions).values(field).returning();
    return created;
  }

  async deleteCustomFieldDefinition(fieldId: string): Promise<boolean> {
    const result = await db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.fieldId, fieldId)).returning();
    return result.length > 0;
  }

  async getSuppliers(): Promise<Supplier[]> {
    return await db.select().from(suppliers).orderBy(suppliers.name);
  }

  async getSupplier(supplierId: string): Promise<Supplier | undefined> {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.supplierId, supplierId));
    return supplier || undefined;
  }

  async createSupplier(supplier: InsertSupplier): Promise<Supplier> {
    const [created] = await db.insert(suppliers).values(supplier).returning();
    return created;
  }

  async updateSupplier(supplierId: string, updates: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const [updated] = await db
      .update(suppliers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(suppliers.supplierId, supplierId))
      .returning();
    return updated || undefined;
  }

  async deleteSupplier(supplierId: string): Promise<boolean> {
    await db.delete(supplierProducts).where(eq(supplierProducts.supplierId, supplierId));
    const result = await db.delete(suppliers).where(eq(suppliers.supplierId, supplierId)).returning();
    return result.length > 0;
  }

  async getMasterProducts(): Promise<MasterProduct[]> {
    return await db.select().from(masterProducts).orderBy(masterProducts.name);
  }

  async getMasterProduct(masterProductId: string): Promise<MasterProduct | undefined> {
    const [mp] = await db.select().from(masterProducts).where(eq(masterProducts.masterProductId, masterProductId));
    return mp || undefined;
  }

  async createMasterProduct(mp: InsertMasterProduct): Promise<MasterProduct> {
    const [created] = await db.insert(masterProducts).values(mp).returning();
    return created;
  }

  async updateMasterProduct(masterProductId: string, updates: Partial<InsertMasterProduct>): Promise<MasterProduct | undefined> {
    const [updated] = await db
      .update(masterProducts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(masterProducts.masterProductId, masterProductId))
      .returning();
    return updated || undefined;
  }

  async deleteMasterProduct(masterProductId: string): Promise<boolean> {
    await db.delete(supplierProducts).where(eq(supplierProducts.masterProductId, masterProductId));
    const result = await db.delete(masterProducts).where(eq(masterProducts.masterProductId, masterProductId)).returning();
    return result.length > 0;
  }

  async getSupplierProducts(): Promise<SupplierProduct[]> {
    return await db.select().from(supplierProducts).orderBy(supplierProducts.createdAt);
  }

  async getSupplierProduct(supplierProductId: string): Promise<SupplierProduct | undefined> {
    const [sp] = await db.select().from(supplierProducts).where(eq(supplierProducts.supplierProductId, supplierProductId));
    return sp || undefined;
  }

  async getSupplierProductsByMasterId(masterProductId: string): Promise<SupplierProduct[]> {
    return await db.select().from(supplierProducts).where(eq(supplierProducts.masterProductId, masterProductId));
  }

  async getSupplierProductsBySupplierId(supplierId: string): Promise<SupplierProduct[]> {
    return await db.select().from(supplierProducts).where(eq(supplierProducts.supplierId, supplierId));
  }

  async createSupplierProduct(sp: InsertSupplierProduct): Promise<SupplierProduct> {
    const [created] = await db.insert(supplierProducts).values(sp).returning();
    return created;
  }

  async updateSupplierProduct(supplierProductId: string, updates: Partial<InsertSupplierProduct>): Promise<SupplierProduct | undefined> {
    const [updated] = await db
      .update(supplierProducts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(supplierProducts.supplierProductId, supplierProductId))
      .returning();
    return updated || undefined;
  }

  async deleteSupplierProduct(supplierProductId: string): Promise<boolean> {
    await db.delete(attachments).where(eq(attachments.supplierProductId, supplierProductId));
    const result = await db.delete(supplierProducts).where(eq(supplierProducts.supplierProductId, supplierProductId)).returning();
    return result.length > 0;
  }

  async getAttachments(): Promise<Attachment[]> {
    return await db.select().from(attachments).orderBy(attachments.uploadedAt);
  }

  async getAttachment(attachmentId: string): Promise<Attachment | undefined> {
    const [attachment] = await db.select().from(attachments).where(eq(attachments.attachmentId, attachmentId));
    return attachment || undefined;
  }

  async getAttachmentsByProductId(supplierProductId: string): Promise<Attachment[]> {
    return await db.select().from(attachments).where(eq(attachments.supplierProductId, supplierProductId));
  }

  async createAttachment(attachment: InsertAttachment): Promise<Attachment> {
    const [created] = await db.insert(attachments).values(attachment).returning();
    return created;
  }

  async updateAttachment(attachmentId: string, updates: Partial<InsertAttachment>): Promise<Attachment | undefined> {
    const [updated] = await db
      .update(attachments)
      .set(updates)
      .where(eq(attachments.attachmentId, attachmentId))
      .returning();
    return updated || undefined;
  }

  async deleteAttachment(attachmentId: string): Promise<boolean> {
    const result = await db.delete(attachments).where(eq(attachments.attachmentId, attachmentId)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
