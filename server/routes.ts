import type { Express } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { stockCodeHistory, products as productsTable, suppliers as suppliersTable, documents as documentsTable, productQualificationTags, qualificationVocabularies, treeNodes as treeNodesTable } from "@shared/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import { inferQualificationTags, type InferenceResult } from "./qualificationEngine";
import * as backupService from "./backupService";
import * as stockCodeService from "./stockCodeService";
import { authMiddleware, requirePasswordChange } from "./authRoutes";
import { refreshState } from "./refreshState";

// Walk tree_nodes from a leaf nodeId up to the root, returning the names AND
// branch codes encountered. The qualification engine matches against either,
// so we mix both into the same array.
async function buildTaxonomyPath(leafNodeId: string): Promise<string[]> {
  const path: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = leafNodeId;
  // Hard cap to avoid pathological loops in malformed trees.
  for (let i = 0; i < 32 && cursor && !seen.has(cursor); i++) {
    seen.add(cursor);
    const rows = await db
      .select()
      .from(treeNodesTable)
      .where(eq(treeNodesTable.nodeId, cursor))
      .limit(1);
    if (rows.length === 0) break;
    const node = rows[0];
    if (node.name) path.unshift(node.name);
    if (node.branchCode) path.unshift(node.branchCode);
    cursor = node.parentId || null;
  }
  return path;
}

export function registerRoutes(app: Express): void {
  app.use("/api/tree-nodes", authMiddleware, requirePasswordChange);
  app.use("/api/products", authMiddleware, requirePasswordChange);
  app.use("/api/suppliers", authMiddleware, requirePasswordChange);
  app.use("/api/custom-fields", authMiddleware, requirePasswordChange);
  app.use("/api/usage-areas", authMiddleware, requirePasswordChange);
  app.use("/api/seed", authMiddleware, requirePasswordChange);
  app.use("/api/backups", authMiddleware, requirePasswordChange);
  app.use("/api/supplier-products", authMiddleware, requirePasswordChange);
  app.use("/api/settings", authMiddleware, requirePasswordChange);
  app.use("/api/colors", authMiddleware, requirePasswordChange);
  app.use("/api/stock-codes", authMiddleware, requirePasswordChange);

  app.get("/api/tree-nodes", async (req, res) => {
    try {
      const nodes = await storage.getTreeNodes();
      res.json(nodes);
    } catch (error) {
      console.error("Error fetching tree nodes:", error);
      res.status(500).json({ error: "Failed to fetch tree nodes" });
    }
  });

  app.get("/api/tree-nodes/:nodeId", async (req, res) => {
    try {
      const node = await storage.getTreeNode(req.params.nodeId);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      res.json(node);
    } catch (error) {
      console.error("Error fetching tree node:", error);
      res.status(500).json({ error: "Failed to fetch tree node" });
    }
  });

  app.post("/api/tree-nodes", async (req, res) => {
    try {
      const node = await storage.createTreeNode(req.body);
      refreshState.trigger();
      res.status(201).json(node);
    } catch (error) {
      console.error("Error creating tree node:", error);
      res.status(500).json({ error: "Failed to create tree node" });
    }
  });

  app.patch("/api/tree-nodes/:nodeId", async (req, res) => {
    try {
      // Fetch old node state so we can detect true value changes for stock code regen
      const oldNode = await storage.getTreeNode(req.params.nodeId);
      const node = await storage.updateTreeNode(req.params.nodeId, req.body);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      // Only regen if branchCode or parentId actually changed (not just present in payload)
      const branchCodeChanged = req.body.branchCode !== undefined && req.body.branchCode !== oldNode?.branchCode;
      const parentChanged = req.body.parentId !== undefined && req.body.parentId !== oldNode?.parentId;
      if (branchCodeChanged || parentChanged) {
        stockCodeService.regenerateStockCodesForNode(req.params.nodeId, 'System').catch(e =>
          console.error("Stock code regen after node update failed:", e)
        );
      }
      refreshState.trigger();
      res.json(node);
    } catch (error) {
      console.error("Error updating tree node:", error);
      res.status(500).json({ error: "Failed to update tree node" });
    }
  });

  app.delete("/api/tree-nodes/:nodeId", async (req, res) => {
    try {
      await storage.deleteTreeNode(req.params.nodeId);
      refreshState.trigger();
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting tree node:", error);
      res.status(500).json({ error: "Failed to delete tree node" });
    }
  });

  app.get("/api/tree-nodes/:nodeId/path", async (req, res) => {
    try {
      const nodes = await storage.getTreeNodes();
      const nodeId = req.params.nodeId;
      const path: { id: string; name: string; type: string }[] = [];
      
      let current = nodes.find(n => n.nodeId === nodeId);
      while (current) {
        path.unshift({ id: current.nodeId, name: current.name, type: current.type });
        current = nodes.find(n => n.nodeId === current?.parentId);
      }
      
      if (path.length === 0) {
        return res.status(404).json({ error: "Node not found" });
      }
      
      res.json({
        nodeId,
        path,
        pathString: path.map(p => p.name).join(' > ')
      });
    } catch (error) {
      console.error("Error fetching node path:", error);
      res.status(500).json({ error: "Failed to fetch node path" });
    }
  });

  app.get("/api/tree-nodes/:nodeId/descendants", async (req, res) => {
    try {
      const nodes = await storage.getTreeNodes();
      const nodeId = req.params.nodeId;
      const descendants: string[] = [];
      
      const findDescendants = (parentId: string) => {
        nodes.forEach(node => {
          if (node.parentId === parentId) {
            descendants.push(node.nodeId);
            findDescendants(node.nodeId);
          }
        });
      };
      
      const targetNode = nodes.find(n => n.nodeId === nodeId);
      if (!targetNode) {
        return res.status(404).json({ error: "Node not found" });
      }
      
      findDescendants(nodeId);
      
      res.json({
        nodeId,
        descendants,
        includesSelf: [nodeId, ...descendants]
      });
    } catch (error) {
      console.error("Error fetching node descendants:", error);
      res.status(500).json({ error: "Failed to fetch node descendants" });
    }
  });

  app.get("/api/products", async (req, res) => {
    try {
      const products = await storage.getProducts();
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:productId", async (req, res) => {
    try {
      const product = await storage.getProduct(req.params.productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });

  app.get("/api/products/by-node/:nodeId", async (req, res) => {
    try {
      const products = await storage.getProductsByNodeId(req.params.nodeId);
      res.json(products);
    } catch (error) {
      console.error("Error fetching products by node:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const product = await storage.createProduct(req.body);
      if (product.nodeId) {
        try {
          const generated = await stockCodeService.generateStockCode(
            product.nodeId, 
            product.id,
            product.colorId || undefined,
            product.supplierId || undefined
          );
          if (generated) {
            await storage.updateProduct(product.productId, { stockCode: generated });
            product.stockCode = generated;
          }
        } catch (e) {
          console.error("Stock code generation failed (non-critical):", e);
        }
      }
      // Auto-Qualification: run the inference engine post-create and attach
      // the suggestions to the response (NEVER auto-saved). The frontend uses
      // this payload to surface a toast/CTA in the Product Qualification tab.
      let qualification_suggestions: InferenceResult | null = null;
      try {
        if (product.nodeId) {
          const path = await buildTaxonomyPath(product.nodeId);
          qualification_suggestions = inferQualificationTags(
            { name: product.name || '', description: product.description || '', nodeId: product.nodeId },
            path,
          );
        }
      } catch (e) {
        console.error("Qualification inference failed (non-critical):", e);
      }

      refreshState.trigger();
      res.status(201).json({ ...product, qualification_suggestions });
    } catch (error) {
      console.error("Error creating product:", error);
      res.status(500).json({ error: "Failed to create product" });
    }
  });

  app.patch("/api/products/:productId", async (req, res) => {
    try {
      const product = await storage.updateProduct(req.params.productId, req.body);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      if (req.body.nodeId || req.body.colorId !== undefined || req.body.supplierId !== undefined) {
        try {
          const generated = await stockCodeService.generateStockCode(
            product.nodeId, 
            product.id,
            product.colorId || undefined,
            product.supplierId || undefined
          );
          if (generated && generated !== product.stockCode) {
            await storage.updateProduct(product.productId, { stockCode: generated });
            product.stockCode = generated;
          }
        } catch (e) {
          console.error("Stock code regeneration failed (non-critical):", e);
        }
      }
      refreshState.trigger();
      res.json(product);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/products/:productId", async (req, res) => {
    try {
      // Cascade: remove any documents linked to this product
      await db.delete(documentsTable).where(
        and(eq(documentsTable.relatedToType, 'Product'), eq(documentsTable.relatedToId, req.params.productId))
      );
      await storage.deleteProduct(req.params.productId);
      refreshState.trigger();
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  app.get("/api/custom-fields", async (req, res) => {
    try {
      const fields = await storage.getCustomFieldDefinitions();
      res.json(fields);
    } catch (error) {
      console.error("Error fetching custom fields:", error);
      res.status(500).json({ error: "Failed to fetch custom fields" });
    }
  });

  app.post("/api/custom-fields", async (req, res) => {
    try {
      const field = await storage.createCustomFieldDefinition(req.body);
      refreshState.trigger();
      res.status(201).json(field);
    } catch (error) {
      console.error("Error creating custom field:", error);
      res.status(500).json({ error: "Failed to create custom field" });
    }
  });

  app.delete("/api/custom-fields/:fieldId", async (req, res) => {
    try {
      await storage.deleteCustomFieldDefinition(req.params.fieldId);
      refreshState.trigger();
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting custom field:", error);
      res.status(500).json({ error: "Failed to delete custom field" });
    }
  });

  app.post("/api/seed", async (req, res) => {
    try {
      const existingNodes = await storage.getTreeNodes();
      if (existingNodes.length > 0) {
        return res.json({ message: "Database already seeded" });
      }

      const initialNodes = [
        { nodeId: 'node-1', name: 'Chemical', type: 'sector', parentId: null, description: 'Industrial and fine chemicals' },
        { nodeId: 'node-2', name: 'Industrial Grade', type: 'category', parentId: 'node-1' },
        { nodeId: 'node-3', name: 'Resins', type: 'subcategory', parentId: 'node-2' },
        { nodeId: 'node-4', name: 'Textile', type: 'sector', parentId: null },
        { nodeId: 'node-5', name: 'Sustainable Fabrics', type: 'category', parentId: 'node-4' },
        { nodeId: 'node-6', name: 'Cotton Based', type: 'subcategory', parentId: 'node-5' },
        { nodeId: 'node-7', name: 'Electronics', type: 'sector', parentId: null },
        { nodeId: 'node-8', name: 'Semiconductors', type: 'category', parentId: 'node-7' },
        { nodeId: 'node-9', name: 'Microprocessors', type: 'subcategory', parentId: 'node-8' },
      ];

      for (const node of initialNodes) {
        await storage.createTreeNode(node);
      }

      const initialProducts = [
        {
          productId: 'PRD-001',
          name: 'Industrial Grade Resin',
          supplier: 'Global Chem Co',
          nodeId: 'node-3',
          category: 'Raw Materials',
          sector: 'Chemical',
          manufacturer: 'ChemFab Industries',
          manufacturingLocation: 'Germany, Ludwigshafen',
          description: 'High-performance epoxy resin for industrial bonding applications.',
          imageUrl: 'https://picsum.photos/seed/resin/400/300',
          price: 1250,
          currency: 'EUR',
          unit: 'ton',
          moq: 5,
          leadTime: 21,
          packagingType: 'Steel Drum',
          certifications: ['ISO 9001', 'REACH'],
          shelfLife: '24 months',
          storageConditions: 'Cool, dry place away from sunlight',
          customFields: [],
          createdBy: 'Admin User',
          history: []
        },
        {
          productId: 'PRD-002',
          name: 'Sustainable Cotton Fabric',
          supplier: 'EcoTextile Ltd',
          nodeId: 'node-6',
          category: 'Finished Goods',
          sector: 'Textile',
          manufacturer: 'Green Weave',
          manufacturingLocation: 'India, Tirupur',
          description: 'Organic cotton fabric with GOTS certification.',
          imageUrl: 'https://picsum.photos/seed/fabric/400/300',
          price: 4.5,
          currency: 'USD',
          unit: 'meter',
          moq: 500,
          leadTime: 45,
          packagingType: 'Rolls',
          certifications: ['GOTS', 'OEKO-TEX'],
          shelfLife: 'N/A',
          storageConditions: 'Standard warehouse conditions',
          customFields: [],
          createdBy: 'Editor Jane',
          history: []
        },
        {
          productId: 'PRD-003',
          name: 'Precision Microchips X1',
          supplier: 'TechSilicon Inc',
          nodeId: 'node-9',
          category: 'Components',
          sector: 'Electronics',
          manufacturer: 'TSMC',
          manufacturingLocation: 'Taiwan, Hsinchu',
          description: 'High-speed processing unit for edge computing devices.',
          imageUrl: 'https://picsum.photos/seed/chip/400/300',
          price: 12.8,
          currency: 'USD',
          unit: 'piece',
          moq: 1000,
          leadTime: 120,
          packagingType: 'Anti-static Tray',
          certifications: ['RoHS', 'CE'],
          shelfLife: 'Indefinite',
          storageConditions: 'Anti-static, dry',
          customFields: [],
          createdBy: 'Admin User',
          history: []
        }
      ];

      for (const product of initialProducts) {
        await storage.createProduct(product);
      }

      const existingSuppliers = await storage.getSuppliers();
      if (existingSuppliers.length === 0) {
        const initialSuppliers = [
          {
            supplierId: 'S-0001',
            name: 'Global Chem Co',
            country: 'Germany',
            contactName: 'Hans Mueller',
            contactEmail: 'hans@globalchem.de',
            contactPhone: '+49 621 555 0100',
            address: 'Ludwigshafen Industrial Park, 67063 Ludwigshafen',
            website: 'https://globalchem.de',
            notes: 'Premium chemical supplier, ISO 9001 certified',
            isActive: true,
          },
          {
            supplierId: 'S-0002',
            name: 'EcoTextile Ltd',
            country: 'India',
            contactName: 'Priya Sharma',
            contactEmail: 'priya@ecotextile.in',
            contactPhone: '+91 422 555 0200',
            address: 'Tirupur Textile Hub, Tamil Nadu 641604',
            website: 'https://ecotextile.in',
            notes: 'Sustainable fabric manufacturer, GOTS certified',
            isActive: true,
          },
          {
            supplierId: 'S-0003',
            name: 'TechSilicon Inc',
            country: 'Taiwan',
            contactName: 'Wei Chen',
            contactEmail: 'wei.chen@techsilicon.tw',
            contactPhone: '+886 3 555 0300',
            address: 'Hsinchu Science Park, Taiwan 30078',
            website: 'https://techsilicon.tw',
            notes: 'Advanced semiconductor components supplier',
            isActive: true,
          },
        ];

        for (const supplier of initialSuppliers) {
          await storage.createSupplier(supplier);
        }
      }

      refreshState.trigger();
      res.json({ message: "Database seeded successfully" });
    } catch (error) {
      console.error("Error seeding database:", error);
      res.status(500).json({ error: "Failed to seed database" });
    }
  });

  app.get("/api/suppliers", async (req, res) => {
    try {
      const suppliers = await storage.getSuppliers();
      res.json(suppliers);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      res.status(500).json({ error: "Failed to fetch suppliers" });
    }
  });

  app.get("/api/suppliers/suggest-code", async (req, res) => {
    try {
      const { name } = req.query;
      if (!name) return res.status(400).json({ error: "name is required" });
      const allSuppliers = await db.select().from(suppliersTable);
      const existingCodes = allSuppliers
        .filter(s => s.supplierCode)
        .map(s => s.supplierCode!);
      const suggested = stockCodeService.generateBranchCodeFromName(name as string, existingCodes);
      res.json({ code: suggested });
    } catch (error) {
      console.error("Error suggesting supplier code:", error);
      res.status(500).json({ error: "Failed to suggest supplier code" });
    }
  });

  app.get("/api/suppliers/:supplierId", async (req, res) => {
    try {
      const supplier = await storage.getSupplier(req.params.supplierId);
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      res.json(supplier);
    } catch (error) {
      console.error("Error fetching supplier:", error);
      res.status(500).json({ error: "Failed to fetch supplier" });
    }
  });

  app.post("/api/suppliers", async (req, res) => {
    try {
      const supplier = await storage.createSupplier(req.body);
      refreshState.trigger();
      res.status(201).json(supplier);
    } catch (error) {
      console.error("Error creating supplier:", error);
      res.status(500).json({ error: "Failed to create supplier" });
    }
  });

  app.patch("/api/suppliers/:supplierId", async (req, res) => {
    try {
      const supplier = await storage.updateSupplier(req.params.supplierId, req.body);
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      if (req.body.supplierCode !== undefined) {
        try {
          const supplierProducts = await db.select().from(productsTable).where(eq(productsTable.supplierId, req.params.supplierId));
          for (const product of supplierProducts) {
            await stockCodeService.updateProductStockCode(product.productId, 'Supplier code changed');
          }
        } catch (e) {
          console.error("Stock code regeneration after supplier code change failed:", e);
        }
      }
      refreshState.trigger();
      res.json(supplier);
    } catch (error) {
      console.error("Error updating supplier:", error);
      res.status(500).json({ error: "Failed to update supplier" });
    }
  });

  app.delete("/api/suppliers/:supplierId", async (req, res) => {
    try {
      // Cascade: remove any documents linked to this supplier
      await db.delete(documentsTable).where(
        and(eq(documentsTable.relatedToType, 'Supplier'), eq(documentsTable.relatedToId, req.params.supplierId))
      );
      await storage.deleteSupplier(req.params.supplierId);
      refreshState.trigger();
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting supplier:", error);
      res.status(500).json({ error: "Failed to delete supplier" });
    }
  });

  app.get("/api/supplier-products", async (req, res) => {
    try {
      const supplierProducts = await storage.getSupplierProducts();
      res.json(supplierProducts);
    } catch (error) {
      console.error("Error fetching supplier products:", error);
      res.status(500).json({ error: "Failed to fetch supplier products" });
    }
  });

  app.get("/api/supplier-products/:supplierProductId", async (req, res) => {
    try {
      const supplierProduct = await storage.getSupplierProduct(req.params.supplierProductId);
      if (!supplierProduct) {
        return res.status(404).json({ error: "Supplier product not found" });
      }
      res.json(supplierProduct);
    } catch (error) {
      console.error("Error fetching supplier product:", error);
      res.status(500).json({ error: "Failed to fetch supplier product" });
    }
  });

  app.get("/api/supplier-products/by-supplier/:supplierId", async (req, res) => {
    try {
      const products = await storage.getSupplierProductsBySupplierId(req.params.supplierId);
      res.json(products);
    } catch (error) {
      console.error("Error fetching supplier products by supplier:", error);
      res.status(500).json({ error: "Failed to fetch supplier products" });
    }
  });

  app.post("/api/supplier-products", async (req, res) => {
    try {
      const supplierProduct = await storage.createSupplierProduct(req.body);
      refreshState.trigger();
      res.status(201).json(supplierProduct);
    } catch (error) {
      console.error("Error creating supplier product:", error);
      res.status(500).json({ error: "Failed to create supplier product" });
    }
  });

  app.patch("/api/supplier-products/:supplierProductId", async (req, res) => {
    try {
      const supplierProduct = await storage.updateSupplierProduct(req.params.supplierProductId, req.body);
      if (!supplierProduct) {
        return res.status(404).json({ error: "Supplier product not found" });
      }
      refreshState.trigger();
      res.json(supplierProduct);
    } catch (error) {
      console.error("Error updating supplier product:", error);
      res.status(500).json({ error: "Failed to update supplier product" });
    }
  });

  app.delete("/api/supplier-products/:supplierProductId", async (req, res) => {
    try {
      await storage.deleteSupplierProduct(req.params.supplierProductId);
      refreshState.trigger();
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting supplier product:", error);
      res.status(500).json({ error: "Failed to delete supplier product" });
    }
  });

  app.get("/api/attachments", async (req, res) => {
    try {
      const attachments = await storage.getAttachments();
      res.json(attachments);
    } catch (error) {
      console.error("Error fetching attachments:", error);
      res.status(500).json({ error: "Failed to fetch attachments" });
    }
  });

  app.get("/api/attachments/:attachmentId", async (req, res) => {
    try {
      const attachment = await storage.getAttachment(req.params.attachmentId);
      if (!attachment) {
        return res.status(404).json({ error: "Attachment not found" });
      }
      res.json(attachment);
    } catch (error) {
      console.error("Error fetching attachment:", error);
      res.status(500).json({ error: "Failed to fetch attachment" });
    }
  });

  app.get("/api/attachments/by-product/:supplierProductId", async (req, res) => {
    try {
      const attachments = await storage.getAttachmentsByProductId(req.params.supplierProductId);
      res.json(attachments);
    } catch (error) {
      console.error("Error fetching attachments by product:", error);
      res.status(500).json({ error: "Failed to fetch attachments" });
    }
  });

  app.post("/api/attachments", async (req, res) => {
    try {
      const attachment = await storage.createAttachment(req.body);
      refreshState.trigger();
      res.status(201).json(attachment);
    } catch (error) {
      console.error("Error creating attachment:", error);
      res.status(500).json({ error: "Failed to create attachment" });
    }
  });

  app.patch("/api/attachments/:attachmentId", async (req, res) => {
    try {
      const attachment = await storage.updateAttachment(req.params.attachmentId, req.body);
      if (!attachment) {
        return res.status(404).json({ error: "Attachment not found" });
      }
      refreshState.trigger();
      res.json(attachment);
    } catch (error) {
      console.error("Error updating attachment:", error);
      res.status(500).json({ error: "Failed to update attachment" });
    }
  });

  app.delete("/api/attachments/:attachmentId", async (req, res) => {
    try {
      await storage.deleteAttachment(req.params.attachmentId);
      refreshState.trigger();
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting attachment:", error);
      res.status(500).json({ error: "Failed to delete attachment" });
    }
  });

  app.get("/api/analytics/product-usage-heatmap", async (req, res) => {
    try {
      const { level = 'category', categories, usageAreas, suppliers, manufacturers, minPrice, maxPrice } = req.query;
      
      const products = await storage.getProducts();
      const treeNodes = await storage.getTreeNodes();
      
      const DEFAULT_USAGE_AREAS = [
        'Industrial', 'Commercial', 'Residential', 'Infrastructure',
        'Food & Beverage', 'Healthcare', 'Parking', 'Sports'
      ];

      const categoriesByLevel = treeNodes.filter((n: any) => n.type === level);
      const filteredCategories = categories 
        ? categoriesByLevel.filter((c: any) => (categories as string).split(',').includes(c.nodeId))
        : categoriesByLevel;
      
      const targetUsageAreas = usageAreas 
        ? (usageAreas as string).split(',')
        : DEFAULT_USAGE_AREAS;

      const filteredProducts = products.filter((p: any) => {
        if (suppliers && !(suppliers as string).split(',').includes(p.supplier)) return false;
        if (manufacturers && !(manufacturers as string).split(',').includes(p.manufacturer)) return false;
        if (minPrice && p.price < parseFloat(minPrice as string)) return false;
        if (maxPrice && p.price > parseFloat(maxPrice as string)) return false;
        return true;
      });

      const getProductCategory = (product: any): any => {
        const findCategoryAtLevel = (nodeId: string): any => {
          const node = treeNodes.find((n: any) => n.nodeId === nodeId);
          if (!node) return undefined;
          if (node.type === level) return node;
          if (node.parentId) return findCategoryAtLevel(node.parentId);
          return undefined;
        };
        if (product.nodeId) {
          const node = treeNodes.find((n: any) => n.nodeId === product.nodeId);
          if (node) return findCategoryAtLevel(node.nodeId);
        }
        if (product.category) {
          const cat = treeNodes.find((n: any) => n.nodeId === product.category || n.name === product.category);
          if (cat) return findCategoryAtLevel(cat.nodeId);
        }
        return undefined;
      };

      const getProductUsageAreas = (product: any): string[] => {
        const usageField = product.customFields?.find((cf: any) => 
          cf.fieldId?.toLowerCase().includes('usage') || 
          cf.fieldId?.toLowerCase().includes('application')
        );
        if (usageField?.value) {
          return String(usageField.value).split(',').map((v: string) => v.trim());
        }
        return DEFAULT_USAGE_AREAS.slice(0, 2);
      };

      const heatmapData = filteredCategories.map((cat: any) => {
        const dataPoints = targetUsageAreas.map(area => {
          const matchingProducts = filteredProducts.filter((p: any) => {
            const productCat = getProductCategory(p);
            if (!productCat || productCat.nodeId !== cat.nodeId) return false;
            return getProductUsageAreas(p).includes(area);
          });

          const prices = matchingProducts.map((p: any) => p.price).filter((p: number) => p > 0);
          const suppliersSet = new Set(matchingProducts.map((p: any) => p.supplier));
          const manufacturersSet = new Set(matchingProducts.map((p: any) => p.manufacturer).filter(Boolean));

          return {
            x: area,
            y: matchingProducts.length,
            meta: {
              productIds: matchingProducts.map((p: any) => p.id),
              suppliers: suppliersSet.size,
              manufacturers: manufacturersSet.size,
              avgPrice: prices.length > 0 ? prices.reduce((a: number, b: number) => a + b, 0) / prices.length : 0,
              minPrice: prices.length > 0 ? Math.min(...prices) : 0,
              maxPrice: prices.length > 0 ? Math.max(...prices) : 0
            }
          };
        });

        return {
          id: cat.name,
          categoryId: cat.nodeId,
          data: dataPoints
        };
      });

      res.json(heatmapData);
    } catch (error) {
      console.error("Error generating heatmap data:", error);
      res.status(500).json({ error: "Failed to generate heatmap data" });
    }
  });

  app.get("/api/settings/usage-areas", async (req, res) => {
    try {
      const usageAreas = await storage.getUsageAreas();
      res.json(usageAreas);
    } catch (error) {
      console.error("Error fetching usage areas:", error);
      res.status(500).json({ error: "Failed to fetch usage areas" });
    }
  });

  app.put("/api/settings/usage-areas", async (req, res) => {
    try {
      const { areas } = req.body;
      if (!Array.isArray(areas)) {
        return res.status(400).json({ error: "Areas must be an array" });
      }
      const updatedAreas = await storage.setUsageAreas(areas);
      refreshState.trigger();
      res.json(updatedAreas);
    } catch (error) {
      console.error("Error updating usage areas:", error);
      res.status(500).json({ error: "Failed to update usage areas" });
    }
  });

  app.post("/api/settings/usage-areas/rename", async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName || typeof oldName !== 'string' || typeof newName !== 'string') {
        return res.status(400).json({ error: "oldName and newName are required strings" });
      }
      const allProducts = await storage.getProducts();
      let migratedCount = 0;
      for (const product of allProducts) {
        const cf = product.customFields as any;
        if (!cf) continue;
        let areas: string[] | null = null;

        if (typeof cf === 'object' && !Array.isArray(cf) && Array.isArray(cf['Usage Areas'])) {
          areas = cf['Usage Areas'];
        } else if (Array.isArray(cf)) {
          const usageField = cf.find((f: any) =>
            f.fieldId?.toLowerCase().includes('usage') || f.fieldId?.toLowerCase().includes('application')
          );
          if (usageField) {
            if (Array.isArray(usageField.value)) {
              areas = usageField.value;
            } else if (typeof usageField.value === 'string') {
              areas = usageField.value.split(',').map((v: string) => v.trim()).filter(Boolean);
            }
          }
        }

        if (areas && areas.includes(oldName)) {
          const newAreas = areas.map(a => a === oldName ? newName : a);
          const updatedCf = { 'Usage Areas': newAreas };
          await storage.updateProduct(product.productId, { customFields: updatedCf });
          migratedCount++;
        }
      }
      refreshState.trigger();
      res.json({ migratedCount });
    } catch (error) {
      console.error("Error renaming usage area in products:", error);
      res.status(500).json({ error: "Failed to rename usage area in products" });
    }
  });

  app.get("/api/settings/units", async (req, res) => {
    try {
      const units = await storage.getUnits();
      res.json(units);
    } catch (error) {
      console.error("Error fetching units:", error);
      res.status(500).json({ error: "Failed to fetch units" });
    }
  });

  app.put("/api/settings/units", async (req, res) => {
    try {
      const { units } = req.body;
      if (!Array.isArray(units)) {
        return res.status(400).json({ error: "Units must be an array" });
      }
      const updatedUnits = await storage.setUnits(units);
      refreshState.trigger();
      res.json(updatedUnits);
    } catch (error) {
      console.error("Error updating units:", error);
      res.status(500).json({ error: "Failed to update units" });
    }
  });

  app.get("/api/settings/inventory-columns", async (req, res) => {
    try {
      const columns = await storage.getInventoryColumns();
      res.json(columns);
    } catch (error) {
      console.error("Error fetching inventory columns:", error);
      res.status(500).json({ error: "Failed to fetch inventory columns" });
    }
  });

  app.put("/api/settings/inventory-columns", async (req, res) => {
    try {
      const { columns } = req.body;
      if (!Array.isArray(columns)) {
        return res.status(400).json({ error: "Columns must be an array" });
      }
      const updated = await storage.setInventoryColumns(columns);
      refreshState.trigger();
      res.json(updated);
    } catch (error) {
      console.error("Error updating inventory columns:", error);
      res.status(500).json({ error: "Failed to update inventory columns" });
    }
  });

  app.post("/api/backups/create", async (req, res) => {
    try {
      const { description } = req.body;
      const backup = await backupService.createBackup("MANUAL", description || "Manual backup");
      refreshState.trigger();
      res.status(201).json(backup);
    } catch (error) {
      console.error("Error creating backup:", error);
      res.status(500).json({ error: "Failed to create backup" });
    }
  });

  app.get("/api/backups", async (req, res) => {
    try {
      const backups = await backupService.listBackups();
      res.json(backups);
    } catch (error) {
      console.error("Error listing backups:", error);
      res.status(500).json({ error: "Failed to list backups" });
    }
  });

  app.get("/api/backups/:id/preview", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid backup ID" });
      }
      const preview = await backupService.getRestorePreview(id);
      res.json(preview);
    } catch (error) {
      console.error("Error getting restore preview:", error);
      res.status(500).json({ error: "Failed to get restore preview" });
    }
  });

  app.get("/api/backups/:id/export", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid backup ID" });
      }
      const { filename, data } = await backupService.exportBackup(id);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/octet-stream");
      res.send(data);
    } catch (error) {
      console.error("Error exporting backup:", error);
      res.status(500).json({ error: "Failed to export backup" });
    }
  });

  app.post("/api/backups/restore/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid backup ID" });
      }
      const result = await backupService.restoreBackup(id);
      if (result.success) {
        refreshState.trigger();
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error("Error restoring backup:", error);
      res.status(500).json({ error: "Failed to restore backup" });
    }
  });

  app.post("/api/backups/import", async (req, res) => {
    const MAX_IMPORT_SIZE = 50 * 1024 * 1024; // 50MB limit
    let totalSize = 0;
    
    try {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_IMPORT_SIZE) {
          req.destroy();
          return res.status(413).json({ error: "Backup file too large (max 50MB)" });
        }
        chunks.push(chunk);
      });
      req.on("end", async () => {
        try {
          const buffer = Buffer.concat(chunks);
          const result = await backupService.importBackup(buffer);
          if (result.success) {
            refreshState.trigger();
            res.status(201).json(result);
          } else {
            res.status(400).json(result);
          }
        } catch (error) {
          console.error("Error importing backup:", error);
          res.status(500).json({ error: "Failed to import backup" });
        }
      });
    } catch (error) {
      console.error("Error importing backup:", error);
      res.status(500).json({ error: "Failed to import backup" });
    }
  });

  app.delete("/api/backups/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid backup ID" });
      }
      await backupService.deleteBackup(id);
      refreshState.trigger();
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting backup:", error);
      res.status(500).json({ error: "Failed to delete backup" });
    }
  });

  app.post("/api/backups/auto-trigger", async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason || typeof reason !== "string") {
        return res.status(400).json({ error: "Reason is required" });
      }
      const backup = await backupService.triggerAutoBackup(reason);
      refreshState.trigger();
      res.status(201).json(backup);
    } catch (error) {
      console.error("Error triggering auto-backup:", error);
      res.status(500).json({ error: "Failed to trigger auto-backup" });
    }
  });

  app.get("/api/backups/settings", async (req, res) => {
    try {
      const settings = backupService.getBackupSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error getting backup settings:", error);
      res.status(500).json({ error: "Failed to get backup settings" });
    }
  });

  app.put("/api/backups/settings", async (req, res) => {
    try {
      const settings = await backupService.updateBackupSettings(req.body);
      refreshState.trigger();
      res.json(settings);
    } catch (error) {
      console.error("Error updating backup settings:", error);
      res.status(500).json({ error: "Failed to update backup settings" });
    }
  });

  app.get("/api/colors", async (req, res) => {
    try {
      const allColors = await storage.getColors();
      res.json(allColors);
    } catch (error) {
      console.error("Error fetching colors:", error);
      res.status(500).json({ error: "Failed to fetch colors" });
    }
  });

  app.post("/api/colors", async (req, res) => {
    try {
      const { name, code, hexValue } = req.body;
      if (!name || !code) {
        return res.status(400).json({ error: "Name and code are required" });
      }
      const validation = stockCodeService.validateBranchCode(code.toUpperCase());
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      const color = await storage.createColor({ name, code: code.toUpperCase(), hexValue });
      refreshState.trigger();
      res.status(201).json(color);
    } catch (error: any) {
      if (error.message?.includes('unique') || error.code === '23505') {
        return res.status(400).json({ error: "Color code already exists" });
      }
      console.error("Error creating color:", error);
      res.status(500).json({ error: "Failed to create color" });
    }
  });

  app.patch("/api/colors/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      // Fetch old color state to compare values before regenerating stock codes
      const oldColor = await storage.getColor(id);
      const color = await storage.updateColor(id, req.body);
      if (!color) return res.status(404).json({ error: "Color not found" });
      // Only regen if the numeric code segment actually changed (affects stock code format)
      if (req.body.code !== undefined && req.body.code !== oldColor?.code) {
        const affected = await db.select().from(productsTable).where(eq(productsTable.colorId, id));
        for (const p of affected) {
          stockCodeService.updateProductStockCode(p.productId, 'Color code changed', 'System').catch(e =>
            console.error(`Stock code regen for product ${p.productId} failed:`, e)
          );
        }
      }
      refreshState.trigger();
      res.json(color);
    } catch (error) {
      console.error("Error updating color:", error);
      res.status(500).json({ error: "Failed to update color" });
    }
  });

  app.delete("/api/colors/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      // Null out colorId on all products using this color, then regen their stock codes
      const affected = await db.select().from(productsTable).where(eq(productsTable.colorId, id));
      if (affected.length > 0) {
        await db.update(productsTable).set({ colorId: null }).where(eq(productsTable.colorId, id));
        for (const p of affected) {
          stockCodeService.updateProductStockCode(p.productId, 'Color deleted', 'System').catch(e =>
            console.error(`Stock code regen for product ${p.productId} after color delete failed:`, e)
          );
        }
      }
      await storage.deleteColor(id);
      refreshState.trigger();
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting color:", error);
      res.status(500).json({ error: "Failed to delete color" });
    }
  });

  app.get("/api/stock-codes/preview", async (req, res) => {
    try {
      const { nodeId, colorId, productId, supplierId } = req.query;
      if (!nodeId) return res.status(400).json({ error: "nodeId is required" });
      const code = await stockCodeService.previewStockCode(
        nodeId as string,
        colorId ? parseInt(colorId as string) : null,
        productId as string || null,
        supplierId as string || null
      );
      res.json({ stockCode: code });
    } catch (error) {
      console.error("Error previewing stock code:", error);
      res.status(500).json({ error: "Failed to preview stock code" });
    }
  });

  app.post("/api/stock-codes/generate/:productId", async (req, res) => {
    try {
      const code = await stockCodeService.updateProductStockCode(
        req.params.productId,
        "Manual generation",
        (req as any).user?.username || "Admin"
      );
      if (!code) return res.status(404).json({ error: "Product not found" });
      refreshState.trigger();
      res.json({ stockCode: code });
    } catch (error) {
      console.error("Error generating stock code:", error);
      res.status(500).json({ error: "Failed to generate stock code" });
    }
  });

  app.post("/api/stock-codes/bulk-regenerate", async (req, res) => {
    try {
      const updated = await stockCodeService.bulkRegenerateStockCodes(
        (req as any).user?.username || "Admin"
      );
      refreshState.trigger();
      res.json({ updated });
    } catch (error) {
      console.error("Error bulk regenerating stock codes:", error);
      res.status(500).json({ error: "Failed to regenerate stock codes" });
    }
  });

  app.post("/api/stock-codes/migrate-branch-codes", async (req, res) => {
    try {
      const migrated = await stockCodeService.migrateExistingBranchCodes();
      refreshState.trigger();
      res.json({ migrated });
    } catch (error) {
      console.error("Error migrating branch codes:", error);
      res.status(500).json({ error: "Failed to migrate branch codes" });
    }
  });

  app.get("/api/stock-codes/history/:productId", async (req, res) => {
    try {
      const history = await stockCodeService.getStockCodeHistoryForProduct(req.params.productId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching stock code history:", error);
      res.status(500).json({ error: "Failed to fetch stock code history" });
    }
  });

  app.get("/api/stock-codes/branch-directory", async (req, res) => {
    try {
      const allNodes = await storage.getTreeNodes();
      const allProducts = await storage.getProducts();

      const productCountMap: Record<string, number> = {};
      for (const p of allProducts) {
        if (p.nodeId) {
          productCountMap[p.nodeId] = (productCountMap[p.nodeId] || 0) + 1;
        }
      }

      const directory = allNodes.map(node => {
        const path: string[] = [];
        let current: any = node;
        while (current) {
          path.unshift(current.name);
          current = allNodes.find((n: any) => n.nodeId === current?.parentId);
        }

        return {
          nodeId: node.nodeId,
          name: node.name,
          type: node.type,
          branchCode: node.branchCode || null,
          parentId: node.parentId,
          path: path.join(' > '),
          productCount: productCountMap[node.nodeId] || 0,
        };
      });

      res.json(directory);
    } catch (error) {
      console.error("Error fetching branch directory:", error);
      res.status(500).json({ error: "Failed to fetch branch directory" });
    }
  });

  app.get("/api/stock-codes/stats", async (req, res) => {
    try {
      const allNodes = await storage.getTreeNodes();
      const allProducts = await storage.getProducts();
      const allColors = await storage.getColors();

      const nodesWithBranchCode = allNodes.filter((n: any) => n.branchCode);
      const productsWithStockCode = allProducts.filter((p: any) => p.stockCode);
      const productsWithColor = allProducts.filter((p: any) => p.colorId);

      res.json({
        totalNodes: allNodes.length,
        nodesWithBranchCode: nodesWithBranchCode.length,
        nodesWithoutBranchCode: allNodes.length - nodesWithBranchCode.length,
        totalProducts: allProducts.length,
        productsWithStockCode: productsWithStockCode.length,
        productsWithoutStockCode: allProducts.length - productsWithStockCode.length,
        productsWithColor: productsWithColor.length,
        totalColors: allColors.length,
      });
    } catch (error) {
      console.error("Error fetching stock code stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/stock-codes/history", async (req, res) => {
    try {
      const history = await db.select().from(stockCodeHistory)
        .orderBy(stockCodeHistory.changedAt)
        .limit(100);
      res.json(history);
    } catch (error) {
      console.error("Error fetching stock code history:", error);
      res.status(500).json({ error: "Failed to fetch stock code history" });
    }
  });

  app.post("/api/stock-codes/suggest-branch-code", async (req, res) => {
    try {
      const { name, excludeNodeId } = req.body;
      if (!name) return res.status(400).json({ error: "name is required" });
      const allNodes = await storage.getTreeNodes();
      const existingCodes = allNodes
        .filter((n: any) => n.branchCode && n.nodeId !== excludeNodeId)
        .map((n: any) => n.branchCode!);
      const suggestion = stockCodeService.generateBranchCodeFromName(name, existingCodes);
      res.json({ suggestion });
    } catch (error) {
      console.error("Error suggesting branch code:", error);
      res.status(500).json({ error: "Failed to suggest branch code" });
    }
  });

  app.use("/api/refresh-state", authMiddleware);
  app.get("/api/refresh-state", (_req, res) => {
    res.json({ triggerId: refreshState.triggerId, lastUpdated: refreshState.lastUpdated });
  });

  // ===========================================================================
  // Product Qualification — Phase 1 (additive only)
  // ===========================================================================
  // All five endpoints below are new and do not modify or replace any existing
  // routes. They power the System Builder's product-qualification filter.
  app.use("/api/qualification-vocabularies", authMiddleware, requirePasswordChange);
  app.use("/api/qualification-tags", authMiddleware, requirePasswordChange);

  // GET /api/qualification-vocabularies
  // Returns all active vocabulary items grouped by vocab_type, e.g.
  // { substrate: [...], humidity: [...], duty: [...], finish: [...] }
  app.get("/api/qualification-vocabularies", async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(qualificationVocabularies)
        .where(eq(qualificationVocabularies.isActive, true))
        .orderBy(asc(qualificationVocabularies.vocabType), asc(qualificationVocabularies.sortOrder));

      const grouped: Record<string, typeof rows> = {};
      for (const row of rows) {
        if (!grouped[row.vocabType]) grouped[row.vocabType] = [];
        grouped[row.vocabType].push(row);
      }
      res.json(grouped);
    } catch (error) {
      console.error("Error fetching qualification vocabularies:", error);
      res.status(500).json({ error: "Failed to fetch qualification vocabularies" });
    }
  });

  // GET /api/qualification-tags — list all rows where is_system_ready = true
  // Note: this must be registered BEFORE /:productId so the literal path wins.
  app.get("/api/qualification-tags", async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(productQualificationTags)
        .where(eq(productQualificationTags.isSystemReady, true));
      res.json(rows);
    } catch (error) {
      console.error("Error fetching qualification tags:", error);
      res.status(500).json({ error: "Failed to fetch qualification tags" });
    }
  });

  // GET /api/qualification-tags/:productId — single product's tag, or null
  app.get("/api/qualification-tags/:productId", async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(productQualificationTags)
        .where(eq(productQualificationTags.productId, req.params.productId))
        .limit(1);
      res.json(rows[0] || null);
    } catch (error) {
      console.error("Error fetching qualification tag:", error);
      res.status(500).json({ error: "Failed to fetch qualification tag" });
    }
  });

  // POST /api/qualification-tags — create or upsert (one row per product_id)
  app.post("/api/qualification-tags", async (req, res) => {
    try {
      const {
        productId, substrateTypes, humidityTolerance, dutyRating,
        finishType, qualifiedBy, isSystemReady,
      } = req.body || {};
      if (!productId) {
        return res.status(400).json({ error: "productId is required" });
      }

      const existing = await db
        .select()
        .from(productQualificationTags)
        .where(eq(productQualificationTags.productId, productId))
        .limit(1);

      const payload = {
        productId,
        substrateTypes: substrateTypes ?? null,
        humidityTolerance: humidityTolerance ?? null,
        dutyRating: dutyRating ?? null,
        finishType: finishType ?? null,
        qualifiedAt: new Date(),
        qualifiedBy: qualifiedBy ?? null,
        isSystemReady: isSystemReady ?? false,
      };

      let result;
      if (existing.length > 0) {
        const updated = await db
          .update(productQualificationTags)
          .set(payload)
          .where(eq(productQualificationTags.productId, productId))
          .returning();
        result = updated[0];
      } else {
        const inserted = await db
          .insert(productQualificationTags)
          .values(payload)
          .returning();
        result = inserted[0];
      }
      res.json(result);
    } catch (error) {
      console.error("Error upserting qualification tag:", error);
      res.status(500).json({ error: "Failed to save qualification tag" });
    }
  });

  // PATCH /api/qualification-tags/:productId — partial update of an existing row
  app.patch("/api/qualification-tags/:productId", async (req, res) => {
    try {
      const allowed: Array<keyof typeof productQualificationTags.$inferInsert> = [
        'substrateTypes', 'humidityTolerance', 'dutyRating',
        'finishType', 'qualifiedBy', 'isSystemReady',
      ];
      const patch: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in (req.body || {})) patch[key] = req.body[key];
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }
      // Refresh the qualification timestamp on every patch
      patch.qualifiedAt = new Date();

      const updated = await db
        .update(productQualificationTags)
        .set(patch)
        .where(eq(productQualificationTags.productId, req.params.productId))
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({ error: "Qualification tag not found" });
      }
      res.json(updated[0]);
    } catch (error) {
      console.error("Error updating qualification tag:", error);
      res.status(500).json({ error: "Failed to update qualification tag" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/qualification-tags/auto-infer
  // Body: { productIds: string[] }  — empty array means "all products"
  // Returns: per-product suggestions with confidence + sources. Never saves.
  // ---------------------------------------------------------------------------
  app.post("/api/qualification-tags/auto-infer", async (req, res) => {
    try {
      const requestedIds: string[] = Array.isArray(req.body?.productIds) ? req.body.productIds : [];

      // Fetch the product slice we need to infer for.
      const products = requestedIds.length === 0
        ? await db.select().from(productsTable)
        : await db.select().from(productsTable).where(inArray(productsTable.productId, requestedIds));

      // Pre-fetch every existing qualification tag in one round-trip so we
      // can mark already_qualified for each product.
      const existingTags = await db
        .select({ productId: productQualificationTags.productId, isSystemReady: productQualificationTags.isSystemReady })
        .from(productQualificationTags);
      const readyMap = new Map<string, boolean>(existingTags.map(t => [t.productId, !!t.isSystemReady]));

      // Cache taxonomy paths per nodeId so we don't walk the tree N times.
      const pathCache = new Map<string, string[]>();
      const getPath = async (nodeId: string): Promise<string[]> => {
        if (pathCache.has(nodeId)) return pathCache.get(nodeId)!;
        const p = await buildTaxonomyPath(nodeId);
        pathCache.set(nodeId, p);
        return p;
      };

      const results = [] as Array<{
        product_id: string;
        product_name: string;
        taxonomy_path: string;
        suggested: { substrate_types: string[]; humidity_tolerance: string | null; duty_rating: string | null; finish_type: string | null };
        confidence: InferenceResult['confidence'];
        sources: InferenceResult['sources'];
        already_qualified: boolean;
      }>;

      for (const p of products) {
        const path = p.nodeId ? await getPath(p.nodeId) : [];
        const inf = inferQualificationTags(
          { name: p.name || '', description: p.description || '', nodeId: p.nodeId || '' },
          path,
        );
        results.push({
          product_id: p.productId,
          product_name: p.name || '',
          taxonomy_path: path.join(' › '),
          suggested: {
            substrate_types: inf.substrate_types,
            humidity_tolerance: inf.humidity_tolerance,
            duty_rating: inf.duty_rating,
            finish_type: inf.finish_type,
          },
          confidence: inf.confidence,
          sources: inf.sources,
          already_qualified: readyMap.get(p.productId) === true,
        });
      }

      res.json({ results });
    } catch (error) {
      console.error("Error running auto-infer:", error);
      res.status(500).json({ error: "Failed to run auto-inference" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/qualification-tags/auto-save-batch
  // Body: { tags: Array<{ product_id, substrate_types, humidity_tolerance,
  //                       duty_rating, finish_type, is_system_ready }> }
  // Upserts all rows. Returns { saved: number }.
  // ---------------------------------------------------------------------------
  app.post("/api/qualification-tags/auto-save-batch", async (req, res) => {
    try {
      const tags: any[] = Array.isArray(req.body?.tags) ? req.body.tags : [];
      if (tags.length === 0) return res.json({ saved: 0 });

      let saved = 0;
      for (const t of tags) {
        if (!t?.product_id) continue;
        const payload = {
          productId: String(t.product_id),
          substrateTypes: Array.isArray(t.substrate_types) && t.substrate_types.length > 0 ? t.substrate_types : null,
          humidityTolerance: t.humidity_tolerance || null,
          dutyRating: t.duty_rating || null,
          finishType: t.finish_type || null,
          isSystemReady: !!t.is_system_ready,
          qualifiedAt: new Date(),
        };
        const existing = await db
          .select()
          .from(productQualificationTags)
          .where(eq(productQualificationTags.productId, payload.productId))
          .limit(1);
        if (existing.length > 0) {
          await db
            .update(productQualificationTags)
            .set(payload)
            .where(eq(productQualificationTags.productId, payload.productId));
        } else {
          await db.insert(productQualificationTags).values(payload);
        }
        saved++;
      }
      res.json({ saved });
    } catch (error) {
      console.error("Error in auto-save-batch:", error);
      res.status(500).json({ error: "Failed to save batch" });
    }
  });
}
