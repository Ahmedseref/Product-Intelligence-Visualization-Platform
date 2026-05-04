import { pgTable, text, serial, integer, timestamp, jsonb, boolean, real, varchar, uuid } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  isFirstLogin: boolean("is_first_login").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  supplierId: varchar("supplier_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  supplierCode: varchar("supplier_code", { length: 5 }),
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
  branchCode: varchar("branch_code", { length: 10 }),
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
  stockCode: varchar("stock_code", { length: 255 }),
  colorId: integer("color_id"),
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

export const colors = pgTable("colors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  hexValue: varchar("hex_value", { length: 7 }),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const stockCodeHistory = pgTable("stock_code_history", {
  id: serial("id").primaryKey(),
  productId: varchar("product_id", { length: 100 }).notNull(),
  oldStockCode: varchar("old_stock_code", { length: 255 }),
  newStockCode: varchar("new_stock_code", { length: 255 }).notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  changedBy: varchar("changed_by", { length: 255 }),
  changedAt: timestamp("changed_at").defaultNow(),
});

export const sectors = pgTable("sectors", {
  id: serial("id").primaryKey(),
  sectorId: varchar("sector_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const systems = pgTable("systems", {
  id: serial("id").primaryKey(),
  systemId: varchar("system_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  typicalUses: text("typical_uses"),
  sectorMapping: jsonb("sector_mapping").default([]),
  status: varchar("status", { length: 20 }).default("draft"),
  version: integer("version").default(1),
  isActive: boolean("is_active").default(true),
  // System-level qualification parameters. When any of these are set the
  // layer product search is filtered to matching qualified products.
  // All three are nullable so legacy systems continue to behave as before.
  systemSubstrate: varchar("system_substrate", { length: 50 }),
  systemHumidity: varchar("system_humidity", { length: 50 }),
  systemDuty: varchar("system_duty", { length: 50 }),
  // Per-sector overrides keyed by sector name, e.g.
  //   { "Flooring": { "substrateOverride": "Concrete" } }
  // Nullable / empty by default. Used to override systemSubstrate when
  // searching products inside a particular sector's layers.
  sectorOverrides: jsonb("sector_overrides").$type<Record<string, { substrateOverride?: string | null }>>().default({}),
  // Free-text recommendation / note shown on the System Preview catalog page.
  // Editable inline from the preview modal; nullable so legacy systems and
  // newly-created ones default to no note.
  previewNote: text("preview_note"),
  // Installable-spec total dry-film thickness for the whole build-up, in
  // millimetres. Min/max range so a system can carry e.g. "2.0 – 3.0 mm".
  // Both nullable for backward compatibility with systems that haven't
  // been spec'd yet. Stored as `real` (single-precision float) — physical
  // quantities, not money, so float precision is more than enough and
  // round-trips as a JS number rather than a numeric-string.
  totalThicknessMinMm: real("total_thickness_min_mm"),
  totalThicknessMaxMm: real("total_thickness_max_mm"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const systemLayers = pgTable("system_layers", {
  id: serial("id").primaryKey(),
  layerId: varchar("layer_id", { length: 100 }).notNull().unique(),
  systemId: varchar("system_id", { length: 100 }).notNull(),
  layerName: varchar("layer_name", { length: 255 }).notNull(),
  orderSequence: integer("order_sequence").notNull().default(0),
  notes: text("notes"),
  // The product_id of the layer's default product, if any. Mirrors the
  // is_default flag on system_product_options for direct querying without
  // joining. Nullable so layers without a chosen default remain unchanged.
  defaultProductId: varchar("default_product_id", { length: 100 }),
  // Optional per-layer substrate override — wins over the sector override
  // and the system-level substrate when filtering the product search for
  // this specific layer. Nullable for backward compatibility.
  layerSubstrateOverride: varchar("layer_substrate_override", { length: 50 }),
  // ---- Installable-spec fields (all nullable so legacy layers stay valid) ----
  // Material consumption per square metre of substrate, in kg/m². Convention
  // is kg/m² because the dominant materials in this app (epoxy, PU,
  // polyurea, cement-acrylic) are quoted that way; for thinned coatings the
  // user can convert in their head. Stored as `real`; allows fractional
  // values like 0.35 (typical primer) up to 6 (heavy self-leveller).
  consumptionRateKgM2: real("consumption_rate_kg_m2"),
  // Dry film thickness in microns (μm). The contractually agreed final
  // thickness of this coat once cured.
  dftMicrons: real("dft_microns"),
  // Recoat window minimum/maximum hours between this coat and the next.
  // Missing the max recoat window is the single most common cause of
  // intercoat adhesion failure for PU and polyurea systems, so both
  // bounds are surfaced as first-class fields.
  recoatMinHours: real("recoat_min_hours"),
  recoatMaxHours: real("recoat_max_hours"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const systemProductOptions = pgTable("system_product_options", {
  id: serial("id").primaryKey(),
  optionId: varchar("option_id", { length: 100 }).notNull().unique(),
  layerId: varchar("layer_id", { length: 100 }).notNull(),
  productId: varchar("product_id", { length: 100 }).notNull(),
  benefit: text("benefit"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const systemHistory = pgTable("system_history", {
  id: serial("id").primaryKey(),
  systemId: varchar("system_id", { length: 100 }).notNull(),
  version: integer("version").notNull(),
  snapshotData: jsonb("snapshot_data").notNull(),
  changeDescription: text("change_description"),
  changedBy: varchar("changed_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  documentId: varchar("document_id", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  link: text("link").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  relatedToType: varchar("related_to_type", { length: 30 }).notNull(),
  relatedToId: varchar("related_to_id", { length: 100 }),
  relatedToName: varchar("related_to_name", { length: 255 }),
  tags: jsonb("tags").default([]),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

export const proformaSettings = pgTable("proforma_settings", {
  id: serial("id").primaryKey(),
  companyName: varchar("company_name", { length: 255 }),
  companyLogo: text("company_logo"),
  address: text("address"),
  phone: varchar("phone", { length: 100 }),
  email: varchar("email", { length: 255 }),
  defaultCurrency: varchar("default_currency", { length: 10 }).default("USD"),
  paymentTerms: text("payment_terms"),
  deliveryTerms: text("delivery_terms"),
  notes: text("notes"),
  bankDetails: text("bank_details"),
  defaultPortOfLoading: varchar("default_port_of_loading", { length: 255 }),
  defaultCountryOfOrigin: varchar("default_country_of_origin", { length: 255 }),
  defaultTransportationMode: varchar("default_transportation_mode", { length: 255 }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customerFields = pgTable("customer_fields", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  fieldName: varchar("field_name", { length: 255 }).notNull(),
  fieldValue: text("field_value"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const proformas = pgTable("proformas", {
  id: serial("id").primaryKey(),
  proformaId: varchar("proforma_id", { length: 50 }).notNull().unique(),
  customerId: integer("customer_id"),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerCountry: varchar("customer_country", { length: 100 }),
  customerContact: text("customer_contact"),
  currency: varchar("currency", { length: 10 }).default("USD"),
  status: varchar("status", { length: 20 }).default("draft"),
  notes: text("notes"),
  shipTo: text("ship_to"),
  portOfLoading: varchar("port_of_loading", { length: 255 }),
  placeOfDestination: varchar("place_of_destination", { length: 255 }),
  finalPlaceOfDelivery: varchar("final_place_of_delivery", { length: 255 }),
  countryOfOrigin: varchar("country_of_origin", { length: 255 }),
  transportationMode: varchar("transportation_mode", { length: 255 }),
  paymentTerms: text("payment_terms"),
  deliveryTerms: text("delivery_terms"),
  date: timestamp("date").defaultNow(),
  // User-defined extra columns for the items table. Each entry is
  //   { id: string; name: string; type: 'text' | 'number'; orderIndex: number }
  // and is rendered both in the editor and in the preview, in ascending
  // orderIndex order. Default columns (Description, Qty, Unit, Unit Price,
  // Total) are NOT in this list — only the user's additions.
  customColumns: jsonb("custom_columns").default([]),
  // Array of column ids that should be hidden in both the editor and the
  // preview. Built-in column ids: 'unit', 'unitPrice', 'total'. Custom
  // column ids match the id field on customColumns entries. The required
  // columns ('product' / Description and 'quantity' / Qty) cannot be hidden.
  hiddenColumns: jsonb("hidden_columns").default([]),
  // Display order for ALL columns (built-in + custom). The user reorders
  // columns via drag-and-drop in the editor; this array holds the resulting
  // order as a flat list of column ids. When empty/missing, the legacy
  // ordering (built-ins in their canonical order, custom columns by their
  // orderIndex) is used so old proformas still render correctly.
  columnOrder: jsonb("column_order").default([]),
  // Optional row-total formula. When NULL or 'default' the row total is the
  // standard qty * unit_price. When set to a formula string (using the
  // tokens documented in shared/proformaFormula.ts — {qty}, {unit_price},
  // {col:Name}, {total}) the row total is computed by evaluating it for
  // each row, and the proforma subtotal aggregates those evaluated totals.
  totalFormula: text("total_formula"),
  // Versioning: version number (1 = original, 2+ = revisions). The proformaId
  // encodes the version suffix (e.g. PI-0001-v2) but we store the integer
  // separately for easy sorting and max-version queries.
  version: integer("version").default(1),
  // Points to the base proformaId when this row is a version of an earlier
  // invoice. NULL for standalone / original invoices and for duplicates.
  parentProformaId: varchar("parent_proforma_id", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const proformaItems = pgTable("proforma_items", {
  id: serial("id").primaryKey(),
  proformaId: varchar("proforma_id", { length: 50 }).notNull(),
  productId: varchar("product_id", { length: 100 }).notNull(),
  customName: varchar("custom_name", { length: 255 }),
  customDescription: text("custom_description"),
  customPrice: real("custom_price"),
  quantity: real("quantity").notNull().default(1),
  // Per-row values for the proforma's customColumns. Keyed by column id from
  // proformas.customColumns. Stored values are always strings — number columns
  // parse on read so we never lose a partial entry like "12." while typing.
  customValues: jsonb("custom_values").default({}),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const proformaFinancials = pgTable("proforma_financials", {
  id: serial("id").primaryKey(),
  proformaId: varchar("proforma_id", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull().default("add"),
  valueType: varchar("value_type", { length: 20 }).notNull().default("fixed"),
  value: real("value").notNull().default(0),
  orderIndex: integer("order_index").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

export const sectorsRelations = relations(sectors, ({ }) => ({
}));

export const systemsRelations = relations(systems, ({ many }) => ({
  layers: many(systemLayers),
  history: many(systemHistory),
}));

export const systemLayersRelations = relations(systemLayers, ({ one, many }) => ({
  system: one(systems, {
    fields: [systemLayers.systemId],
    references: [systems.systemId],
  }),
  productOptions: many(systemProductOptions),
}));

export const systemProductOptionsRelations = relations(systemProductOptions, ({ one }) => ({
  layer: one(systemLayers, {
    fields: [systemProductOptions.layerId],
    references: [systemLayers.layerId],
  }),
  product: one(products, {
    fields: [systemProductOptions.productId],
    references: [products.productId],
  }),
}));

export const systemHistoryRelations = relations(systemHistory, ({ one }) => ({
  system: one(systems, {
    fields: [systemHistory.systemId],
    references: [systems.systemId],
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
export type Color = typeof colors.$inferSelect;
export type InsertColor = typeof colors.$inferInsert;
export type StockCodeHistory = typeof stockCodeHistory.$inferSelect;
export type InsertStockCodeHistory = typeof stockCodeHistory.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Sector = typeof sectors.$inferSelect;
export type InsertSector = typeof sectors.$inferInsert;
export type System = typeof systems.$inferSelect;
export type InsertSystem = typeof systems.$inferInsert;
export type SystemLayer = typeof systemLayers.$inferSelect;
export type InsertSystemLayer = typeof systemLayers.$inferInsert;
export type SystemProductOption = typeof systemProductOptions.$inferSelect;
export type InsertSystemProductOption = typeof systemProductOptions.$inferInsert;
export type SystemHistory = typeof systemHistory.$inferSelect;
export type InsertSystemHistory = typeof systemHistory.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;
export type ProformaSettings = typeof proformaSettings.$inferSelect;
export type InsertProformaSettings = typeof proformaSettings.$inferInsert;
export type Proforma = typeof proformas.$inferSelect;
export type InsertProforma = typeof proformas.$inferInsert;
export type ProformaItem = typeof proformaItems.$inferSelect;
export type InsertProformaItem = typeof proformaItems.$inferInsert;
export type ProformaFinancial = typeof proformaFinancials.$inferSelect;
export type InsertProformaFinancial = typeof proformaFinancials.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;
export type CustomerField = typeof customerFields.$inferSelect;
export type InsertCustomerField = typeof customerFields.$inferInsert;

// =============================================================================
// Product Qualification System — Phase 1 (additive only)
// =============================================================================
// `product_qualification_tags` stores per-product qualification metadata that
// the System Builder uses to filter products by substrate, humidity, duty
// rating, and finish type. Each row is keyed by the existing products.product_id
// (varchar) and is independent of the products table — no FK constraint is
// added so this stays a purely additive change.
export const productQualificationTags = pgTable("product_qualification_tags", {
  id: serial("id").primaryKey(),
  productId: varchar("product_id", { length: 100 }).notNull(),
  // Array of substrate strings, e.g. ["Concrete", "Steel"]
  substrateTypes: jsonb("substrate_types").$type<string[]>(),
  humidityTolerance: varchar("humidity_tolerance", { length: 50 }),
  dutyRating: varchar("duty_rating", { length: 50 }),
  finishType: varchar("finish_type", { length: 50 }),
  // Layer Position — controls which other fields are shown and what
  // substrate options are available. Nullable so existing rows still load.
  layerPosition: varchar("layer_position", { length: 50 }),
  qualifiedAt: timestamp("qualified_at"),
  qualifiedBy: varchar("qualified_by", { length: 100 }),
  // When true, the product is exposed to the System Builder filter
  isSystemReady: boolean("is_system_ready").default(false),
});

// `qualification_vocabularies` stores the closed-list values for each
// qualification dimension (substrate / humidity / duty / finish). Seeded on
// startup if empty — see seedQualificationVocabularies() in storage.ts.
export const qualificationVocabularies = pgTable("qualification_vocabularies", {
  id: serial("id").primaryKey(),
  vocabType: varchar("vocab_type", { length: 50 }).notNull(),
  value: varchar("value", { length: 100 }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
});

export type ProductQualificationTag = typeof productQualificationTags.$inferSelect;
export type InsertProductQualificationTag = typeof productQualificationTags.$inferInsert;
export type QualificationVocabulary = typeof qualificationVocabularies.$inferSelect;
export type InsertQualificationVocabulary = typeof qualificationVocabularies.$inferInsert;
