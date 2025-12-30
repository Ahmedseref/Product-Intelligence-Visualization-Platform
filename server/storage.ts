import { 
  treeNodes, products, customFieldDefinitions,
  type TreeNode, type InsertTreeNode,
  type Product, type InsertProduct,
  type CustomFieldDefinition, type InsertCustomFieldDefinition
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
}

export const storage = new DatabaseStorage();
