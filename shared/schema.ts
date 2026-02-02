import { pgTable, text, serial, integer, timestamp, jsonb, boolean, real, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  supplierId: varchar("supplier_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  country: varchar("country", { length: 100 }),
  contactName: varchar("contact_name", { length: 255 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 100 }),
  address: text("address"),
  website: varchar("website", { length: 255 }),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const masterProducts = pgTable("master_products", {
  id: serial("id").primaryKey(),
  masterProductId: varchar("master_product_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  nodeId: varchar("node_id", { length: 100 }).notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const supplierProducts = pgTable("supplier_products", {
  id: serial("id").primaryKey(),
  supplierProductId: varchar("supplier_product_id", { length: 100 }).notNull().unique(),
  masterProductId: varchar("master_product_id", { length: 100 }),
  supplierId: varchar("supplier_id", { length: 100 }).notNull(),
  productName: varchar("product_name", { length: 255 }),
  formFactor: varchar("form_factor", { length: 100 }),
  sku: varchar("sku", { length: 100 }),
  price: real("price").default(0),
  currency: varchar("currency", { length: 10 }).default("USD"),
  unit: varchar("unit", { length: 50 }),
  moq: integer("moq").default(1),
  leadTime: integer("lead_time").default(0),
  packagingType: varchar("packaging_type", { length: 100 }),
  hsCode: varchar("hs_code", { length: 50 }),
  certifications: jsonb("certifications").default([]),
  technicalSpecs: jsonb("technical_specs").default([]),
  images: jsonb("images").default([]),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  history: jsonb("history").default([]),
});

export const treeNodes = pgTable("tree_nodes", {
  id: serial("id").primaryKey(),
  nodeId: varchar("node_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  parentId: varchar("parent_id", { length: 100 }),
  description: text("description"),
  metadata: jsonb("metadata"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  productId: varchar("product_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  supplier: varchar("supplier", { length: 255 }),
  supplierId: varchar("supplier_id", { length: 100 }),
  nodeId: varchar("node_id", { length: 100 }).notNull(),
  manufacturer: varchar("manufacturer", { length: 255 }),
  manufacturingLocation: varchar("manufacturing_location", { length: 255 }),
  description: text("description"),
  imageUrl: text("image_url"),
  price: real("price").default(0),
  currency: varchar("currency", { length: 10 }).default("USD"),
  unit: varchar("unit", { length: 50 }),
  moq: integer("moq").default(1),
  leadTime: integer("lead_time").default(0),
  packagingType: varchar("packaging_type", { length: 100 }),
  hsCode: varchar("hs_code", { length: 50 }),
  certifications: jsonb("certifications").default([]),
  shelfLife: varchar("shelf_life", { length: 100 }),
  storageConditions: text("storage_conditions"),
  customFields: jsonb("custom_fields").default([]),
  technicalSpecs: jsonb("technical_specs").default([]),
  category: varchar("category", { length: 255 }),
  sector: varchar("sector", { length: 255 }),
  createdBy: varchar("created_by", { length: 255 }),
  dateAdded: timestamp("date_added").defaultNow(),
  lastUpdated: timestamp("last_updated").defaultNow(),
  history: jsonb("history").default([]),
});

export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: serial("id").primaryKey(),
  fieldId: varchar("field_id", { length: 100 }).notNull().unique(),
  label: varchar("label", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  options: jsonb("options"),
  nodeId: varchar("node_id", { length: 100 }),
  isGlobal: boolean("is_global").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  attachmentId: varchar("attachment_id", { length: 100 }).notNull().unique(),
  supplierProductId: varchar("supplier_product_id", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }),
  size: integer("size").default(0),
  objectPath: text("object_path").notNull(),
  category: varchar("category", { length: 100 }),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const backups = pgTable("backups", {
  id: serial("id").primaryKey(),
  versionNumber: integer("version_number").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  triggerType: varchar("trigger_type", { length: 20 }).notNull(), // AUTO | MANUAL | SYSTEM
  description: text("description"),
  compressedData: text("compressed_data").notNull(), // Base64 encoded gzip data
  originalSize: integer("original_size").notNull(),
  compressedSize: integer("compressed_size").notNull(),
  checksum: varchar("checksum", { length: 64 }).notNull(), // SHA-256 hash
  entityCounts: jsonb("entity_counts").default({}), // { products: n, suppliers: n, treeNodes: n, ... }
});

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  supplierProducts: many(supplierProducts),
}));

export const masterProductsRelations = relations(masterProducts, ({ many, one }) => ({
  supplierProducts: many(supplierProducts),
  treeNode: one(treeNodes, {
    fields: [masterProducts.nodeId],
    references: [treeNodes.nodeId],
  }),
}));

export const supplierProductsRelations = relations(supplierProducts, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [supplierProducts.supplierId],
    references: [suppliers.supplierId],
  }),
  attachments: many(attachments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  supplierProduct: one(supplierProducts, {
    fields: [attachments.supplierProductId],
    references: [supplierProducts.supplierProductId],
  }),
}));

export const treeNodesRelations = relations(treeNodes, ({ many }) => ({
  products: many(products),
  masterProducts: many(masterProducts),
  customFields: many(customFieldDefinitions),
}));

export const productsRelations = relations(products, ({ one }) => ({
  treeNode: one(treeNodes, {
    fields: [products.nodeId],
    references: [treeNodes.nodeId],
  }),
}));

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = typeof suppliers.$inferInsert;
export type MasterProduct = typeof masterProducts.$inferSelect;
export type InsertMasterProduct = typeof masterProducts.$inferInsert;
export type SupplierProduct = typeof supplierProducts.$inferSelect;
export type InsertSupplierProduct = typeof supplierProducts.$inferInsert;
export type TreeNode = typeof treeNodes.$inferSelect;
export type InsertTreeNode = typeof treeNodes.$inferInsert;
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;
export type InsertCustomFieldDefinition = typeof customFieldDefinitions.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;
export type AppSettings = typeof appSettings.$inferSelect;
export type InsertAppSettings = typeof appSettings.$inferInsert;
export type Backup = typeof backups.$inferSelect;
export type InsertBackup = typeof backups.$inferInsert;
