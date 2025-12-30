import { pgTable, text, serial, integer, timestamp, jsonb, boolean, real, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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

export const treeNodesRelations = relations(treeNodes, ({ many }) => ({
  products: many(products),
  customFields: many(customFieldDefinitions),
}));

export const productsRelations = relations(products, ({ one }) => ({
  treeNode: one(treeNodes, {
    fields: [products.nodeId],
    references: [treeNodes.nodeId],
  }),
}));

export type TreeNode = typeof treeNodes.$inferSelect;
export type InsertTreeNode = typeof treeNodes.$inferInsert;
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;
export type InsertCustomFieldDefinition = typeof customFieldDefinitions.$inferInsert;
