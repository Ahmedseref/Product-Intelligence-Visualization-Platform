import { 
  treeNodes, products, customFieldDefinitions,
  suppliers, supplierProducts, attachments, appSettings,
  colors, documents, proformaSettings, proformas, proformaItems, proformaFinancials,
  customers, customerFields,
  qualificationVocabularies,
  type TreeNode, type InsertTreeNode,
  type Product, type InsertProduct,
  type CustomFieldDefinition, type InsertCustomFieldDefinition,
  type Supplier, type InsertSupplier,
  type SupplierProduct, type InsertSupplierProduct,
  type Attachment, type InsertAttachment,
  type Color, type InsertColor,
  type Document, type InsertDocument,
  type ProformaSettings, type InsertProformaSettings,
  type Proforma, type InsertProforma,
  type ProformaItem, type InsertProformaItem,
  type ProformaFinancial, type InsertProformaFinancial,
  type Customer, type InsertCustomer,
  type CustomerField, type InsertCustomerField
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, isNull, desc, sql } from "drizzle-orm";

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

  async getSupplierProducts(): Promise<SupplierProduct[]> {
    return await db.select().from(supplierProducts).orderBy(supplierProducts.createdAt);
  }

  async getSupplierProduct(supplierProductId: string): Promise<SupplierProduct | undefined> {
    const [sp] = await db.select().from(supplierProducts).where(eq(supplierProducts.supplierProductId, supplierProductId));
    return sp || undefined;
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

  async getUsageAreas(): Promise<string[]> {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, 'usage_areas'));
    if (setting && Array.isArray(setting.value)) {
      return setting.value as string[];
    }
    const defaultAreas = [
      'Commercial',
      'Food & Beverage',
      'Healthcare',
      'Industrial',
      'Infrastructure',
      'Parking',
      'Residential',
      'Sports'
    ];
    await db.insert(appSettings).values({ key: 'usage_areas', value: defaultAreas }).onConflictDoNothing();
    return defaultAreas;
  }

  async setUsageAreas(areas: string[]): Promise<string[]> {
    const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, 'usage_areas'));
    if (existing) {
      await db.update(appSettings).set({ value: areas, updatedAt: new Date() }).where(eq(appSettings.key, 'usage_areas'));
    } else {
      await db.insert(appSettings).values({ key: 'usage_areas', value: areas });
    }
    return areas;
  }

  async getUnits(): Promise<string[]> {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, 'units'));
    if (setting && Array.isArray(setting.value)) {
      return setting.value as string[];
    }
    const defaultUnits = ['kg', 'ton', 'piece', 'liter', 'box', 'pallet', 'm', 'm²', 'm³', 'ft', 'ft²', 'ft³', 'inch', 'cm', 'mm', 'gallon', 'oz', 'lb', 'set', 'pair', 'roll', 'sheet', 'pack', 'carton'];
    await db.insert(appSettings).values({ key: 'units', value: defaultUnits }).onConflictDoNothing();
    return defaultUnits;
  }

  async setUnits(units: string[]): Promise<string[]> {
    const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, 'units'));
    if (existing) {
      await db.update(appSettings).set({ value: units, updatedAt: new Date() }).where(eq(appSettings.key, 'units'));
    } else {
      await db.insert(appSettings).values({ key: 'units', value: units });
    }
    return units;
  }

  async getInventoryColumns(): Promise<{ key: string; label: string; visible: boolean; order: number }[]> {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, 'inventory_columns'));
    if (setting && Array.isArray(setting.value)) {
      return setting.value as { key: string; label: string; visible: boolean; order: number }[];
    }
    return [];
  }

  async setInventoryColumns(columns: { key: string; label: string; visible: boolean; order: number }[]): Promise<{ key: string; label: string; visible: boolean; order: number }[]> {
    const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, 'inventory_columns'));
    if (existing) {
      await db.update(appSettings).set({ value: columns, updatedAt: new Date() }).where(eq(appSettings.key, 'inventory_columns'));
    } else {
      await db.insert(appSettings).values({ key: 'inventory_columns', value: columns });
    }
    return columns;
  }

  async getColors(): Promise<Color[]> {
    return await db.select().from(colors).orderBy(colors.sortOrder);
  }

  async getColor(id: number): Promise<Color | undefined> {
    const [color] = await db.select().from(colors).where(eq(colors.id, id));
    return color || undefined;
  }

  async createColor(color: InsertColor): Promise<Color> {
    const [created] = await db.insert(colors).values(color).returning();
    return created;
  }

  async updateColor(id: number, updates: Partial<InsertColor>): Promise<Color | undefined> {
    const [updated] = await db
      .update(colors)
      .set(updates)
      .where(eq(colors.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteColor(id: number): Promise<boolean> {
    const result = await db.delete(colors).where(eq(colors.id, id)).returning();
    return result.length > 0;
  }

  async getDocuments(): Promise<Document[]> {
    return await db.select().from(documents).orderBy(desc(documents.createdAt));
  }

  async getDocument(documentId: string): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.documentId, documentId));
    return doc || undefined;
  }

  async getDocumentsByRelation(relatedToType: string, relatedToId: string): Promise<Document[]> {
    return await db.select().from(documents).where(
      and(eq(documents.relatedToType, relatedToType), eq(documents.relatedToId, relatedToId))
    ).orderBy(desc(documents.createdAt));
  }

  async createDocument(doc: InsertDocument): Promise<Document> {
    const [created] = await db.insert(documents).values(doc).returning();
    return created;
  }

  async updateDocument(documentId: string, updates: Partial<InsertDocument>): Promise<Document | undefined> {
    const [updated] = await db
      .update(documents)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(documents.documentId, documentId))
      .returning();
    return updated || undefined;
  }

  async deleteDocument(documentId: string): Promise<boolean> {
    const result = await db.delete(documents).where(eq(documents.documentId, documentId)).returning();
    return result.length > 0;
  }

  async getNextDocumentId(): Promise<string> {
    const result = await db.select({ maxId: sql<string>`MAX(${documents.documentId})` }).from(documents);
    const maxId = result[0]?.maxId;
    if (!maxId) {
      return "D-0001";
    }
    const num = parseInt(maxId.replace("D-", ""), 10);
    return `D-${String(num + 1).padStart(4, "0")}`;
  }

  async getProformaSettings(): Promise<ProformaSettings | undefined> {
    const [row] = await db.select().from(proformaSettings).limit(1);
    return row || undefined;
  }

  async upsertProformaSettings(data: Partial<InsertProformaSettings>): Promise<ProformaSettings> {
    const existing = await this.getProformaSettings();
    if (existing) {
      const [updated] = await db
        .update(proformaSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(proformaSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(proformaSettings).values(data as InsertProformaSettings).returning();
      return created;
    }
  }

  async getProformas(): Promise<Proforma[]> {
    return await db.select().from(proformas).orderBy(desc(proformas.createdAt));
  }

  async getProforma(proformaId: string): Promise<Proforma | undefined> {
    const [row] = await db.select().from(proformas).where(eq(proformas.proformaId, proformaId));
    return row || undefined;
  }

  async createProforma(data: InsertProforma): Promise<Proforma> {
    const [created] = await db.insert(proformas).values(data).returning();
    return created;
  }

  async updateProforma(proformaId: string, updates: Partial<InsertProforma>): Promise<Proforma | undefined> {
    const [updated] = await db
      .update(proformas)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(proformas.proformaId, proformaId))
      .returning();
    return updated || undefined;
  }

  async getProformaItems(proformaId: string): Promise<ProformaItem[]> {
    return await db
      .select()
      .from(proformaItems)
      .where(eq(proformaItems.proformaId, proformaId))
      .orderBy(proformaItems.sortOrder);
  }

  async createProformaItem(data: InsertProformaItem): Promise<ProformaItem> {
    const [created] = await db.insert(proformaItems).values(data).returning();
    return created;
  }

  async updateProformaItem(id: number, updates: Partial<InsertProformaItem>): Promise<ProformaItem | undefined> {
    const [updated] = await db
      .update(proformaItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(proformaItems.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteProformaItem(id: number): Promise<boolean> {
    const result = await db.delete(proformaItems).where(eq(proformaItems.id, id)).returning();
    return result.length > 0;
  }

  async deleteProforma(proformaId: string): Promise<boolean> {
    await db.delete(proformaItems).where(eq(proformaItems.proformaId, proformaId));
    await db.delete(proformaFinancials).where(eq(proformaFinancials.proformaId, proformaId));
    const result = await db.delete(proformas).where(eq(proformas.proformaId, proformaId)).returning();
    return result.length > 0;
  }

  async getProformaFinancials(proformaId: string): Promise<ProformaFinancial[]> {
    return await db.select().from(proformaFinancials)
      .where(eq(proformaFinancials.proformaId, proformaId))
      .orderBy(proformaFinancials.orderIndex);
  }

  async createProformaFinancial(data: InsertProformaFinancial): Promise<ProformaFinancial> {
    const [created] = await db.insert(proformaFinancials).values(data).returning();
    return created;
  }

  async updateProformaFinancial(id: number, updates: Partial<InsertProformaFinancial>): Promise<ProformaFinancial | undefined> {
    const [updated] = await db.update(proformaFinancials)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(proformaFinancials.id, id))
      .returning();
    return updated;
  }

  async deleteProformaFinancial(id: number): Promise<boolean> {
    const result = await db.delete(proformaFinancials).where(eq(proformaFinancials.id, id)).returning();
    return result.length > 0;
  }

  async getCustomers(): Promise<Customer[]> {
    return await db.select().from(customers).orderBy(customers.name);
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [row] = await db.select().from(customers).where(eq(customers.id, id));
    return row;
  }

  async createCustomer(data: InsertCustomer): Promise<Customer> {
    const [created] = await db.insert(customers).values(data).returning();
    return created;
  }

  async updateCustomer(id: number, updates: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [updated] = await db.update(customers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return updated;
  }

  async deleteCustomer(id: number): Promise<boolean> {
    await db.delete(customerFields).where(eq(customerFields.customerId, id));
    const result = await db.delete(customers).where(eq(customers.id, id)).returning();
    return result.length > 0;
  }

  async getCustomerFields(customerId: number): Promise<CustomerField[]> {
    return await db.select().from(customerFields)
      .where(eq(customerFields.customerId, customerId))
      .orderBy(customerFields.sortOrder);
  }

  async createCustomerField(data: InsertCustomerField): Promise<CustomerField> {
    const [created] = await db.insert(customerFields).values(data).returning();
    return created;
  }

  async updateCustomerField(id: number, updates: Partial<InsertCustomerField>): Promise<CustomerField | undefined> {
    const [updated] = await db.update(customerFields)
      .set(updates)
      .where(eq(customerFields.id, id))
      .returning();
    return updated;
  }

  async deleteCustomerField(id: number): Promise<boolean> {
    const result = await db.delete(customerFields).where(eq(customerFields.id, id)).returning();
    return result.length > 0;
  }

  async replaceCustomerFields(customerId: number, fields: Array<{ fieldName: string; fieldValue: string; sortOrder: number }>): Promise<CustomerField[]> {
    await db.delete(customerFields).where(eq(customerFields.customerId, customerId));
    if (fields.length === 0) return [];
    const inserted = await db.insert(customerFields).values(
      fields.map(f => ({ customerId, fieldName: f.fieldName, fieldValue: f.fieldValue, sortOrder: f.sortOrder }))
    ).returning();
    return inserted;
  }

  async getNextProformaId(): Promise<string> {
    // Extract the numeric base from every proformaId (stripping -vN suffixes),
    // then take the numeric MAX. This avoids lexicographic comparison pitfalls
    // where e.g. "PI-0009-v2" > "PI-0010" as a string but 9 < 10 numerically.
    const result = await db
      .select({
        maxNum: sql<number>`MAX(
          CAST(
            REGEXP_REPLACE(
              REGEXP_REPLACE(${proformas.proformaId}, '-v[0-9]+$', ''),
              '^PI-', ''
            ) AS INTEGER
          )
        )`,
      })
      .from(proformas);
    const maxNum = result[0]?.maxNum;
    if (maxNum == null) {
      return "PI-0001";
    }
    return `PI-${String(maxNum + 1).padStart(4, "0")}`;
  }

  // Find the next version number for a given base proforma (the original
  // plus any existing versions linked to it).
  async getNextVersionNumber(baseProformaId: string): Promise<number> {
    // The "base" is the proforma whose parentProformaId is null AND whose
    // proformaId matches, OR whose parentProformaId matches.
    const rows = await db
      .select({ version: proformas.version })
      .from(proformas)
      .where(
        or(
          eq(proformas.proformaId, baseProformaId),
          eq(proformas.parentProformaId, baseProformaId),
        ),
      );
    const maxV = rows.reduce((mx, r) => Math.max(mx, r.version ?? 1), 0);
    return maxV + 1;
  }

  // Deep-copy a proforma (header + items + financials) into a new row.
  // Used by both "Duplicate" (no parent link) and "New Version" (parent link).
  async duplicateProforma(
    sourceId: string,
    newProformaId: string,
    opts?: { parentProformaId?: string; version?: number },
  ): Promise<Proforma> {
    const source = await this.getProforma(sourceId);
    if (!source) throw new Error(`Source proforma ${sourceId} not found`);

    const now = new Date();
    const newRow: InsertProforma = {
      proformaId: newProformaId,
      customerId: source.customerId,
      customerName: source.customerName,
      customerCountry: source.customerCountry,
      customerContact: source.customerContact,
      currency: source.currency,
      status: 'draft',
      notes: source.notes,
      shipTo: source.shipTo,
      portOfLoading: source.portOfLoading,
      placeOfDestination: source.placeOfDestination,
      finalPlaceOfDelivery: source.finalPlaceOfDelivery,
      countryOfOrigin: source.countryOfOrigin,
      transportationMode: source.transportationMode,
      paymentTerms: source.paymentTerms,
      deliveryTerms: source.deliveryTerms,
      customColumns: source.customColumns,
      hiddenColumns: source.hiddenColumns,
      columnOrder: source.columnOrder,
      totalFormula: source.totalFormula,
      quantityFormula: source.quantityFormula,
      finalTotalOverride: source.finalTotalOverride,
      summaryColumns: source.summaryColumns,
      finalTotalLabel: source.finalTotalLabel,
      builtinColumnLabels: source.builtinColumnLabels,
      version: opts?.version ?? 1,
      parentProformaId: opts?.parentProformaId ?? null,
      date: now,
    };
    const created = await this.createProforma(newRow);

    // Copy line items
    const items = await this.getProformaItems(sourceId);
    for (const it of items) {
      await this.createProformaItem({
        proformaId: newProformaId,
        productId: it.productId,
        customName: it.customName,
        customDescription: it.customDescription,
        customPrice: it.customPrice,
        quantity: it.quantity,
        unit: it.unit,
        customValues: it.customValues,
        sortOrder: it.sortOrder,
      });
    }

    // Copy financial steps
    const fins = await this.getProformaFinancials(sourceId);
    for (const f of fins) {
      await this.createProformaFinancial({
        proformaId: newProformaId,
        name: f.name,
        type: f.type,
        valueType: f.valueType,
        value: f.value,
        orderIndex: f.orderIndex,
      });
    }

    return created;
  }
}

export const storage = new DatabaseStorage();

// =============================================================================
// Product Qualification — vocabulary seeding (idempotent)
// =============================================================================
// Populates the closed-list values for each qualification dimension. The seed
// is idempotent — on every startup it INSERTs only the rows that don't
// already exist, so adding new entries (e.g. new layer-position values) on a
// populated database is safe and automatic.
export async function seedQualificationVocabularies(): Promise<void> {
  const seed: Array<{ vocabType: string; values: Array<string | { value: string; label: string }> }> = [
    {
      vocabType: 'substrate',
      // Note: 'Over Primer' and 'Over Base Coat' are required by the Layer
      // Position feature — they're stored in substrate_types when a base
      // coat / intermediate / topcoat product is qualified.
      values: ['Concrete', 'Steel', 'Metal', 'Wood', 'Screed', 'Asphalt', 'Ceramic', 'Existing Coating', 'Over Primer', 'Over Base Coat'],
    },
    {
      // Single source of truth: percentage-range labels keyed to measured
      // substrate moisture. The qualification engine maps its inferred
      // categories (standard/moisture-tolerant/underwater) into these same
      // labels so the closed-list UI <select> always has a matching value.
      vocabType: 'humidity',
      values: [
        'Dry (0–4%)',
        'Slightly Damp (4–6%)',
        'Damp / High Moisture (6–8%)',
        'Wet (>8%)',
      ],
    },
    {
      vocabType: 'duty',
      values: ['Light', 'Medium', 'Heavy', 'Industrial', 'Antistatic', 'Antibacterial', 'Anti Chemicals (Harsh environments)'],
    },
    {
      vocabType: 'finish',
      values: ['Smooth', 'Textured', 'Anti-Slip', 'Matt', 'Gloss', 'Satin'],
    },
    {
      // Layer Position — controls which other fields are visible/required.
      vocabType: 'layer_position',
      values: [
        { value: 'primer',       label: 'Primer' },
        { value: 'base_coat',    label: 'Base Coat' },
        { value: 'intermediate', label: 'Intermediate Coat' },
        { value: 'topcoat',      label: 'Topcoat / Sealer' },
        { value: 'standalone',   label: 'Standalone' },
      ],
    },
  ];

  // Pull every existing (vocabType, value) pair into a Set for fast lookup.
  const existing = await db
    .select({ vocabType: qualificationVocabularies.vocabType, value: qualificationVocabularies.value })
    .from(qualificationVocabularies);
  const existingKey = new Set(existing.map(r => `${r.vocabType}::${r.value}`));

  const toInsert: Array<typeof qualificationVocabularies.$inferInsert> = [];
  for (const { vocabType, values } of seed) {
    values.forEach((v, idx) => {
      const value = typeof v === 'string' ? v : v.value;
      const label = typeof v === 'string' ? v : v.label;
      if (!existingKey.has(`${vocabType}::${value}`)) {
        toInsert.push({ vocabType, value, label, sortOrder: idx, isActive: true });
      }
    });
  }

  if (toInsert.length === 0) return;
  await db.insert(qualificationVocabularies).values(toInsert);
  console.log(`[Seed] Inserted ${toInsert.length} new qualification vocabulary entries`);
}
