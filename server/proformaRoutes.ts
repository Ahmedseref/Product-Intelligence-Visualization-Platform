import type { Express } from "express";
import { storage } from "./storage";
import { authMiddleware, requirePasswordChange } from "./authRoutes";

export function registerProformaRoutes(app: Express): void {
  app.use("/api/proforma", authMiddleware, requirePasswordChange);

  // ── Proforma Settings (singleton) ──────────────────────────────────
  app.get("/api/proforma/settings", async (req, res) => {
    try {
      const settings = await storage.getProformaSettings();
      res.json(settings || {});
    } catch (error) {
      console.error("Error fetching proforma settings:", error);
      res.status(500).json({ error: "Failed to fetch proforma settings" });
    }
  });

  app.put("/api/proforma/settings", async (req, res) => {
    try {
      const settings = await storage.upsertProformaSettings(req.body);
      res.json(settings);
    } catch (error) {
      console.error("Error saving proforma settings:", error);
      res.status(500).json({ error: "Failed to save proforma settings" });
    }
  });

  // ── Proformas ───────────────────────────────────────────────────────
  app.get("/api/proforma/list", async (req, res) => {
    try {
      const list = await storage.getProformas();
      res.json(list);
    } catch (error) {
      console.error("Error fetching proformas:", error);
      res.status(500).json({ error: "Failed to fetch proformas" });
    }
  });

  app.post("/api/proforma/list", async (req, res) => {
    try {
      const nextId = await storage.getNextProformaId();
      const created = await storage.createProforma({
        ...req.body,
        proformaId: nextId,
      });
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating proforma:", error);
      res.status(500).json({ error: "Failed to create proforma" });
    }
  });

  app.get("/api/proforma/:proformaId", async (req, res) => {
    try {
      const proforma = await storage.getProforma(req.params.proformaId);
      if (!proforma) return res.status(404).json({ error: "Proforma not found" });

      const rawItems = await storage.getProformaItems(req.params.proformaId);

      // Enrich items with live product data (single source of truth)
      const enrichedItems = await Promise.all(
        rawItems.map(async (item) => {
          const product = await storage.getProduct(item.productId);
          return {
            ...item,
            productName: product?.name || "",
            productDescription: product?.description || "",
            productPrice: product?.price || 0,
            productUnit: product?.unit || "",
            productCurrency: product?.currency || "",
            productStockCode: product?.stockCode || "",
            productSupplier: product?.supplier || "",
          };
        })
      );

      res.json({ ...proforma, items: enrichedItems });
    } catch (error) {
      console.error("Error fetching proforma:", error);
      res.status(500).json({ error: "Failed to fetch proforma" });
    }
  });

  app.patch("/api/proforma/:proformaId", async (req, res) => {
    try {
      const updated = await storage.updateProforma(req.params.proformaId, req.body);
      if (!updated) return res.status(404).json({ error: "Proforma not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating proforma:", error);
      res.status(500).json({ error: "Failed to update proforma" });
    }
  });

  app.delete("/api/proforma/:proformaId", async (req, res) => {
    try {
      const deleted = await storage.deleteProforma(req.params.proformaId);
      if (!deleted) return res.status(404).json({ error: "Proforma not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting proforma:", error);
      res.status(500).json({ error: "Failed to delete proforma" });
    }
  });

  // ── Proforma Items ──────────────────────────────────────────────────
  app.post("/api/proforma/:proformaId/items", async (req, res) => {
    try {
      const item = await storage.createProformaItem({
        ...req.body,
        proformaId: req.params.proformaId,
      });
      res.status(201).json(item);
    } catch (error) {
      console.error("Error adding proforma item:", error);
      res.status(500).json({ error: "Failed to add proforma item" });
    }
  });

  app.patch("/api/proforma-items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid item ID" });
      const updated = await storage.updateProformaItem(id, req.body);
      if (!updated) return res.status(404).json({ error: "Item not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating proforma item:", error);
      res.status(500).json({ error: "Failed to update proforma item" });
    }
  });

  app.delete("/api/proforma-items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid item ID" });
      const deleted = await storage.deleteProformaItem(id);
      if (!deleted) return res.status(404).json({ error: "Item not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting proforma item:", error);
      res.status(500).json({ error: "Failed to delete proforma item" });
    }
  });
}
