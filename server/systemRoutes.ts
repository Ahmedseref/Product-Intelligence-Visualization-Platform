import type { Express } from "express";
import { db } from "./db";
import { systems, systemLayers, systemProductOptions, sectors, systemHistory, products } from "@shared/schema";
import { eq, asc, desc } from "drizzle-orm";
import { authMiddleware, requirePasswordChange } from "./authRoutes";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function registerSystemRoutes(app: Express): void {
  app.use("/api/systems", authMiddleware, requirePasswordChange);
  app.use("/api/system-layers", authMiddleware, requirePasswordChange);
  app.use("/api/system-product-options", authMiddleware, requirePasswordChange);
  app.use("/api/sectors", authMiddleware, requirePasswordChange);
  app.use("/api/system-history", authMiddleware, requirePasswordChange);

  app.get("/api/sectors", async (req, res) => {
    try {
      const allSectors = await db.select().from(sectors).orderBy(asc(sectors.sortOrder));
      res.json(allSectors);
    } catch (error) {
      console.error("Error fetching sectors:", error);
      res.status(500).json({ error: "Failed to fetch sectors" });
    }
  });

  app.post("/api/sectors", async (req, res) => {
    try {
      const sectorId = generateId("sec");
      const [created] = await db.insert(sectors).values({ ...req.body, sectorId }).returning();
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating sector:", error);
      res.status(500).json({ error: "Failed to create sector" });
    }
  });

  app.put("/api/sectors/:sectorId", async (req, res) => {
    try {
      const [updated] = await db
        .update(sectors)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(sectors.sectorId, req.params.sectorId))
        .returning();
      if (!updated) return res.status(404).json({ error: "Sector not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating sector:", error);
      res.status(500).json({ error: "Failed to update sector" });
    }
  });

  app.delete("/api/sectors/:sectorId", async (req, res) => {
    try {
      const [deleted] = await db.delete(sectors).where(eq(sectors.sectorId, req.params.sectorId)).returning();
      if (!deleted) return res.status(404).json({ error: "Sector not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting sector:", error);
      res.status(500).json({ error: "Failed to delete sector" });
    }
  });

  app.get("/api/systems", async (req, res) => {
    try {
      const allSystems = await db.select().from(systems).orderBy(desc(systems.createdAt));
      res.json(allSystems);
    } catch (error) {
      console.error("Error fetching systems:", error);
      res.status(500).json({ error: "Failed to fetch systems" });
    }
  });

  app.get("/api/systems/:systemId", async (req, res) => {
    try {
      const [system] = await db.select().from(systems).where(eq(systems.systemId, req.params.systemId));
      if (!system) return res.status(404).json({ error: "System not found" });
      res.json(system);
    } catch (error) {
      console.error("Error fetching system:", error);
      res.status(500).json({ error: "Failed to fetch system" });
    }
  });

  app.get("/api/systems/:systemId/full", async (req, res) => {
    try {
      const [system] = await db.select().from(systems).where(eq(systems.systemId, req.params.systemId));
      if (!system) return res.status(404).json({ error: "System not found" });

      const layers = await db
        .select()
        .from(systemLayers)
        .where(eq(systemLayers.systemId, req.params.systemId))
        .orderBy(asc(systemLayers.orderSequence));

      const layersWithProducts = await Promise.all(
        layers.map(async (layer) => {
          const options = await db
            .select({
              id: systemProductOptions.id,
              optionId: systemProductOptions.optionId,
              layerId: systemProductOptions.layerId,
              productId: systemProductOptions.productId,
              benefit: systemProductOptions.benefit,
              isDefault: systemProductOptions.isDefault,
              createdAt: systemProductOptions.createdAt,
              productName: products.name,
              productStockCode: products.stockCode,
              productSupplier: products.supplier,
            })
            .from(systemProductOptions)
            .leftJoin(products, eq(systemProductOptions.productId, products.productId))
            .where(eq(systemProductOptions.layerId, layer.layerId));

          return { ...layer, productOptions: options };
        })
      );

      res.json({ ...system, layers: layersWithProducts });
    } catch (error) {
      console.error("Error fetching full system:", error);
      res.status(500).json({ error: "Failed to fetch full system" });
    }
  });

  app.post("/api/systems", async (req, res) => {
    try {
      const systemId = generateId("sys");
      const [created] = await db.insert(systems).values({ ...req.body, systemId }).returning();
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating system:", error);
      res.status(500).json({ error: "Failed to create system" });
    }
  });

  app.put("/api/systems/:systemId", async (req, res) => {
    try {
      const [updated] = await db
        .update(systems)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(systems.systemId, req.params.systemId))
        .returning();
      if (!updated) return res.status(404).json({ error: "System not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating system:", error);
      res.status(500).json({ error: "Failed to update system" });
    }
  });

  app.delete("/api/systems/:systemId", async (req, res) => {
    try {
      await db.delete(systemProductOptions).where(
        eq(systemProductOptions.layerId, 
          db.select({ layerId: systemLayers.layerId }).from(systemLayers).where(eq(systemLayers.systemId, req.params.systemId)).limit(1) as any
        )
      );
      const sysLayers = await db.select().from(systemLayers).where(eq(systemLayers.systemId, req.params.systemId));
      for (const layer of sysLayers) {
        await db.delete(systemProductOptions).where(eq(systemProductOptions.layerId, layer.layerId));
      }
      await db.delete(systemLayers).where(eq(systemLayers.systemId, req.params.systemId));
      await db.delete(systemHistory).where(eq(systemHistory.systemId, req.params.systemId));
      const [deleted] = await db.delete(systems).where(eq(systems.systemId, req.params.systemId)).returning();
      if (!deleted) return res.status(404).json({ error: "System not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting system:", error);
      res.status(500).json({ error: "Failed to delete system" });
    }
  });

  app.get("/api/system-layers/:systemId", async (req, res) => {
    try {
      const layers = await db
        .select()
        .from(systemLayers)
        .where(eq(systemLayers.systemId, req.params.systemId))
        .orderBy(asc(systemLayers.orderSequence));
      res.json(layers);
    } catch (error) {
      console.error("Error fetching layers:", error);
      res.status(500).json({ error: "Failed to fetch layers" });
    }
  });

  app.post("/api/system-layers", async (req, res) => {
    try {
      const layerId = generateId("lyr");
      const [created] = await db.insert(systemLayers).values({ ...req.body, layerId }).returning();
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating layer:", error);
      res.status(500).json({ error: "Failed to create layer" });
    }
  });

  app.put("/api/system-layers/:layerId", async (req, res) => {
    try {
      const [updated] = await db
        .update(systemLayers)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(systemLayers.layerId, req.params.layerId))
        .returning();
      if (!updated) return res.status(404).json({ error: "Layer not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating layer:", error);
      res.status(500).json({ error: "Failed to update layer" });
    }
  });

  app.put("/api/system-layers/reorder/:systemId", async (req, res) => {
    try {
      const { layerOrder } = req.body;
      for (let i = 0; i < layerOrder.length; i++) {
        await db
          .update(systemLayers)
          .set({ orderSequence: i, updatedAt: new Date() })
          .where(eq(systemLayers.layerId, layerOrder[i]));
      }
      const layers = await db
        .select()
        .from(systemLayers)
        .where(eq(systemLayers.systemId, req.params.systemId))
        .orderBy(asc(systemLayers.orderSequence));
      res.json(layers);
    } catch (error) {
      console.error("Error reordering layers:", error);
      res.status(500).json({ error: "Failed to reorder layers" });
    }
  });

  app.delete("/api/system-layers/:layerId", async (req, res) => {
    try {
      await db.delete(systemProductOptions).where(eq(systemProductOptions.layerId, req.params.layerId));
      const [deleted] = await db.delete(systemLayers).where(eq(systemLayers.layerId, req.params.layerId)).returning();
      if (!deleted) return res.status(404).json({ error: "Layer not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting layer:", error);
      res.status(500).json({ error: "Failed to delete layer" });
    }
  });

  app.get("/api/system-product-options/:layerId", async (req, res) => {
    try {
      const options = await db
        .select({
          id: systemProductOptions.id,
          optionId: systemProductOptions.optionId,
          layerId: systemProductOptions.layerId,
          productId: systemProductOptions.productId,
          benefit: systemProductOptions.benefit,
          isDefault: systemProductOptions.isDefault,
          createdAt: systemProductOptions.createdAt,
          productName: products.name,
          productStockCode: products.stockCode,
          productSupplier: products.supplier,
        })
        .from(systemProductOptions)
        .leftJoin(products, eq(systemProductOptions.productId, products.productId))
        .where(eq(systemProductOptions.layerId, req.params.layerId));
      res.json(options);
    } catch (error) {
      console.error("Error fetching product options:", error);
      res.status(500).json({ error: "Failed to fetch product options" });
    }
  });

  app.post("/api/system-product-options", async (req, res) => {
    try {
      const optionId = generateId("opt");
      const [created] = await db.insert(systemProductOptions).values({ ...req.body, optionId }).returning();
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating product option:", error);
      res.status(500).json({ error: "Failed to create product option" });
    }
  });

  app.put("/api/system-product-options/:optionId", async (req, res) => {
    try {
      const [updated] = await db
        .update(systemProductOptions)
        .set(req.body)
        .where(eq(systemProductOptions.optionId, req.params.optionId))
        .returning();
      if (!updated) return res.status(404).json({ error: "Option not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating product option:", error);
      res.status(500).json({ error: "Failed to update product option" });
    }
  });

  app.delete("/api/system-product-options/:optionId", async (req, res) => {
    try {
      const [deleted] = await db.delete(systemProductOptions).where(eq(systemProductOptions.optionId, req.params.optionId)).returning();
      if (!deleted) return res.status(404).json({ error: "Option not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting product option:", error);
      res.status(500).json({ error: "Failed to delete product option" });
    }
  });

  app.get("/api/system-history/:systemId", async (req, res) => {
    try {
      const history = await db
        .select()
        .from(systemHistory)
        .where(eq(systemHistory.systemId, req.params.systemId))
        .orderBy(desc(systemHistory.createdAt));
      res.json(history);
    } catch (error) {
      console.error("Error fetching system history:", error);
      res.status(500).json({ error: "Failed to fetch system history" });
    }
  });

  app.post("/api/system-history", async (req, res) => {
    try {
      const [created] = await db.insert(systemHistory).values(req.body).returning();
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating history entry:", error);
      res.status(500).json({ error: "Failed to create history entry" });
    }
  });

  app.get("/api/systems/stats/overview", async (req, res) => {
    try {
      const allSystems = await db.select().from(systems);
      const allLayers = await db.select().from(systemLayers);
      const allOptions = await db.select().from(systemProductOptions);
      const allSectors = await db.select().from(sectors);

      const productUtilization: Record<string, number> = {};
      for (const opt of allOptions) {
        productUtilization[opt.productId] = (productUtilization[opt.productId] || 0) + 1;
      }

      const systemComplexity = allSystems.map((sys) => {
        const sysLayers = allLayers.filter((l) => l.systemId === sys.systemId);
        const layerIds = sysLayers.map((l) => l.layerId);
        const optionCount = allOptions.filter((o) => layerIds.includes(o.layerId)).length;
        return { systemId: sys.systemId, name: sys.name, layerCount: sysLayers.length, optionCount };
      });

      const layerDistribution: Record<string, number> = {};
      for (const layer of allLayers) {
        const name = layer.layerName.toLowerCase();
        if (name.includes("prime") || name.includes("primer")) layerDistribution["Primer"] = (layerDistribution["Primer"] || 0) + 1;
        else if (name.includes("base")) layerDistribution["Base Coat"] = (layerDistribution["Base Coat"] || 0) + 1;
        else if (name.includes("top") || name.includes("finish")) layerDistribution["Top Coat"] = (layerDistribution["Top Coat"] || 0) + 1;
        else layerDistribution["Other"] = (layerDistribution["Other"] || 0) + 1;
      }

      const productSystemMatrix: { productId: string; systemId: string; systemName: string; count: number }[] = [];
      for (const sys of allSystems) {
        const sysLayerIds = allLayers.filter(l => l.systemId === sys.systemId).map(l => l.layerId);
        const sysOptions = allOptions.filter(o => sysLayerIds.includes(o.layerId));
        const prodCounts: Record<string, number> = {};
        for (const opt of sysOptions) {
          prodCounts[opt.productId] = (prodCounts[opt.productId] || 0) + 1;
        }
        for (const [pid, cnt] of Object.entries(prodCounts)) {
          productSystemMatrix.push({ productId: pid, systemId: sys.systemId, systemName: sys.name, count: cnt });
        }
      }

      const layerProductMatrix: { layerName: string; productId: string; count: number }[] = [];
      for (const layer of allLayers) {
        const layerOpts = allOptions.filter(o => o.layerId === layer.layerId);
        for (const opt of layerOpts) {
          layerProductMatrix.push({ layerName: layer.layerName, productId: opt.productId, count: 1 });
        }
      }

      const systemLayerMatrix: { systemName: string; layerName: string; productCount: number }[] = [];
      for (const sys of allSystems) {
        const sysLayers = allLayers.filter(l => l.systemId === sys.systemId);
        for (const layer of sysLayers) {
          const prodCount = allOptions.filter(o => o.layerId === layer.layerId).length;
          systemLayerMatrix.push({ systemName: sys.name, layerName: layer.layerName, productCount: prodCount });
        }
      }

      res.json({
        totalSystems: allSystems.length,
        totalLayers: allLayers.length,
        totalOptions: allOptions.length,
        totalSectors: allSectors.length,
        productUtilization,
        systemComplexity,
        layerDistribution,
        productSystemMatrix,
        layerProductMatrix,
        systemLayerMatrix,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.post("/api/systems/:systemId/snapshot", async (req, res) => {
    try {
      const [system] = await db.select().from(systems).where(eq(systems.systemId, req.params.systemId));
      if (!system) return res.status(404).json({ error: "System not found" });

      const layers = await db.select().from(systemLayers).where(eq(systemLayers.systemId, req.params.systemId)).orderBy(asc(systemLayers.orderSequence));
      const layersWithProducts = await Promise.all(
        layers.map(async (layer) => {
          const options = await db.select().from(systemProductOptions).where(eq(systemProductOptions.layerId, layer.layerId));
          return { ...layer, productOptions: options };
        })
      );

      const snapshot = { system, layers: layersWithProducts };
      const newVersion = (system.version || 1) + 1;

      await db.insert(systemHistory).values({
        systemId: system.systemId,
        version: system.version || 1,
        snapshotData: snapshot,
        changeDescription: req.body.description || `Version ${system.version || 1} snapshot`,
        changedBy: req.body.changedBy,
      });

      await db.update(systems).set({ version: newVersion, updatedAt: new Date() }).where(eq(systems.systemId, req.params.systemId));

      res.json({ success: true, version: newVersion });
    } catch (error) {
      console.error("Error creating snapshot:", error);
      res.status(500).json({ error: "Failed to create snapshot" });
    }
  });

  app.get("/api/systems/export/:systemId", async (req, res) => {
    try {
      const format = req.query.format || "json";
      const [system] = await db.select().from(systems).where(eq(systems.systemId, req.params.systemId));
      if (!system) return res.status(404).json({ error: "System not found" });

      const layers = await db.select().from(systemLayers).where(eq(systemLayers.systemId, req.params.systemId)).orderBy(asc(systemLayers.orderSequence));
      const layersWithProducts = await Promise.all(
        layers.map(async (layer) => {
          const options = await db
            .select({
              optionId: systemProductOptions.optionId,
              productId: systemProductOptions.productId,
              benefit: systemProductOptions.benefit,
              isDefault: systemProductOptions.isDefault,
              productName: products.name,
              productStockCode: products.stockCode,
              productSupplier: products.supplier,
            })
            .from(systemProductOptions)
            .leftJoin(products, eq(systemProductOptions.productId, products.productId))
            .where(eq(systemProductOptions.layerId, layer.layerId));
          return { layerName: layer.layerName, order: layer.orderSequence, notes: layer.notes, products: options };
        })
      );

      const exportData = {
        name: system.name,
        description: system.description,
        typicalUses: system.typicalUses,
        status: system.status,
        version: system.version,
        layers: layersWithProducts,
        exportedAt: new Date().toISOString(),
      };

      if (format === "json") {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="${system.name.replace(/\s+/g, '_')}_spec.json"`);
        return res.json(exportData);
      }

      if (format === "csv") {
        const rows: string[] = ["System,Layer,Order,Product,Supplier,Stock Code,Benefit,Default"];
        for (const layer of layersWithProducts) {
          for (const prod of layer.products) {
            rows.push(
              [system.name, layer.layerName, layer.order, prod.productName || "", prod.productSupplier || "", prod.productStockCode || "", prod.benefit || "", prod.isDefault ? "Yes" : "No"]
                .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                .join(",")
            );
          }
          if (layer.products.length === 0) {
            rows.push([system.name, layer.layerName, layer.order, "", "", "", "", ""].map((v) => `"${v}"`).join(","));
          }
        }
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${system.name.replace(/\s+/g, '_')}_spec.csv"`);
        return res.send(rows.join("\n"));
      }

      res.json(exportData);
    } catch (error) {
      console.error("Error exporting system:", error);
      res.status(500).json({ error: "Failed to export system" });
    }
  });

  app.post("/api/systems/import", async (req, res) => {
    try {
      const { name, description, typicalUses, sectorMapping, layers } = req.body;

      if (!name) return res.status(400).json({ error: "System name is required" });

      const systemId = generateId("sys");
      const [createdSystem] = await db.insert(systems).values({
        systemId,
        name,
        description: description || "",
        typicalUses: typicalUses || "",
        sectorMapping: sectorMapping || [],
        status: "draft",
      }).returning();

      if (layers && Array.isArray(layers)) {
        for (let i = 0; i < layers.length; i++) {
          const layer = layers[i];
          const layerId = generateId("lyr");
          await db.insert(systemLayers).values({
            layerId,
            systemId,
            layerName: layer.layerName || layer.name || `Layer ${i + 1}`,
            orderSequence: layer.orderSequence ?? layer.order ?? i,
            notes: layer.notes || "",
          });

          if (layer.products && Array.isArray(layer.products)) {
            for (const prod of layer.products) {
              const optionId = generateId("opt");
              await db.insert(systemProductOptions).values({
                optionId,
                layerId,
                productId: prod.productId,
                benefit: prod.benefit || "",
                isDefault: prod.isDefault || false,
              });
            }
          }
        }
      }

      res.status(201).json(createdSystem);
    } catch (error) {
      console.error("Error importing system:", error);
      res.status(500).json({ error: "Failed to import system" });
    }
  });
}
