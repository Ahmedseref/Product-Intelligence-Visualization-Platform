import type { Express } from "express";
import { storage } from "./storage";

export function registerRoutes(app: Express): void {
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
      res.status(201).json(node);
    } catch (error) {
      console.error("Error creating tree node:", error);
      res.status(500).json({ error: "Failed to create tree node" });
    }
  });

  app.patch("/api/tree-nodes/:nodeId", async (req, res) => {
    try {
      const node = await storage.updateTreeNode(req.params.nodeId, req.body);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      res.json(node);
    } catch (error) {
      console.error("Error updating tree node:", error);
      res.status(500).json({ error: "Failed to update tree node" });
    }
  });

  app.delete("/api/tree-nodes/:nodeId", async (req, res) => {
    try {
      await storage.deleteTreeNode(req.params.nodeId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting tree node:", error);
      res.status(500).json({ error: "Failed to delete tree node" });
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
      res.status(201).json(product);
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
      res.json(product);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/products/:productId", async (req, res) => {
    try {
      await storage.deleteProduct(req.params.productId);
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
      res.status(201).json(field);
    } catch (error) {
      console.error("Error creating custom field:", error);
      res.status(500).json({ error: "Failed to create custom field" });
    }
  });

  app.delete("/api/custom-fields/:fieldId", async (req, res) => {
    try {
      await storage.deleteCustomFieldDefinition(req.params.fieldId);
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

      res.json({ message: "Database seeded successfully" });
    } catch (error) {
      console.error("Error seeding database:", error);
      res.status(500).json({ error: "Failed to seed database" });
    }
  });
}
