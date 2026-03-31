import type { Express } from "express";
import { storage } from "./storage";
import { authMiddleware, requirePasswordChange } from "./authRoutes";
import * as XLSX from "xlsx";
import { refreshState } from "./refreshState";

function computeFinancials(
  subtotal: number,
  financials: Array<{ id: number; name: string; type: string; valueType: string; value: number; orderIndex: number }>
) {
  const sorted = [...financials].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  let running = subtotal;
  const steps: Array<{ id: number; name: string; type: string; valueType: string; value: number; computedAmount: number; runningTotal: number }> = [];
  for (const fin of sorted) {
    const amount = fin.valueType === "percentage" ? running * (fin.value / 100) : fin.value;
    const signed = fin.type === "subtract" ? -amount : amount;
    running += signed;
    steps.push({ id: fin.id, name: fin.name, type: fin.type, valueType: fin.valueType, value: fin.value, computedAmount: signed, runningTotal: running });
  }
  return { subtotal, steps, finalTotal: running };
}

async function buildFullProforma(proformaId: string) {
  const proforma = await storage.getProforma(proformaId);
  if (!proforma) return null;

  const rawItems = await storage.getProformaItems(proformaId);
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

  const financials = await storage.getProformaFinancials(proformaId);
  let customerFieldsList: Array<{ id: number; customerId: number; fieldName: string; fieldValue: string | null; sortOrder: number }> = [];
  if (proforma.customerId) {
    customerFieldsList = await storage.getCustomerFields(proforma.customerId);
  }

  return { ...proforma, items: enrichedItems, financials, customerFields: customerFieldsList };
}

export function registerProformaRoutes(app: Express): void {
  app.use("/api/proforma", authMiddleware, requirePasswordChange);

  // ── Proforma Settings ──────────────────────────────────────────────
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
      refreshState.trigger();
      res.json(settings);
    } catch (error) {
      console.error("Error saving proforma settings:", error);
      res.status(500).json({ error: "Failed to save proforma settings" });
    }
  });

  // ── Proforma List ──────────────────────────────────────────────────
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
      const created = await storage.createProforma({ ...req.body, proformaId: nextId });
      refreshState.trigger();
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating proforma:", error);
      res.status(500).json({ error: "Failed to create proforma" });
    }
  });

  // ── Single Proforma ────────────────────────────────────────────────
  app.get("/api/proforma/:proformaId", async (req, res) => {
    try {
      const full = await buildFullProforma(req.params.proformaId);
      if (!full) return res.status(404).json({ error: "Proforma not found" });
      res.json(full);
    } catch (error) {
      console.error("Error fetching proforma:", error);
      res.status(500).json({ error: "Failed to fetch proforma" });
    }
  });

  app.patch("/api/proforma/:proformaId", async (req, res) => {
    try {
      const updated = await storage.updateProforma(req.params.proformaId, req.body);
      if (!updated) return res.status(404).json({ error: "Proforma not found" });
      refreshState.trigger();
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
      refreshState.trigger();
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting proforma:", error);
      res.status(500).json({ error: "Failed to delete proforma" });
    }
  });

  // ── Excel Export ───────────────────────────────────────────────────
  app.get("/api/proforma/:proformaId/export/excel", async (req, res) => {
    try {
      const full = await buildFullProforma(req.params.proformaId);
      if (!full) return res.status(404).json({ error: "Proforma not found" });

      const settings = await storage.getProformaSettings();
      const items = (full.items || []) as Array<{ productStockCode?: string; customName?: string | null; productName?: string; customDescription?: string | null; productDescription?: string; quantity: number; customPrice?: number | null; productPrice?: number }>;
      const financials = (full.financials || []) as Array<{ id: number; name: string; type: string; valueType: string; value: number; orderIndex: number }>;
      const customerFields = (full.customerFields || []) as Array<{ fieldName: string; fieldValue?: string | null }>;
      const currency = full.currency || settings?.defaultCurrency || "USD";
      const subtotal = items.reduce((sum, item) => sum + item.quantity * (item.customPrice ?? item.productPrice ?? 0), 0);
      const { steps, finalTotal } = computeFinancials(subtotal, financials);

      const wb = XLSX.utils.book_new();

      // Sheet 1: Invoice
      const invoiceRows: (string | number | null)[][] = [
        ["PROFORMA INVOICE", full.proformaId],
        ["Date", full.date ? new Date(full.date).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB")],
        ["Status", full.status || "draft"],
        [],
        ["--- COMPANY ---", ""],
        ["Company Name", settings?.companyName || ""],
        ["Address", settings?.address || ""],
        ["Phone", settings?.phone || ""],
        ["Email", settings?.email || ""],
        ["Payment Terms", settings?.paymentTerms || ""],
        ["Delivery Terms", settings?.deliveryTerms || ""],
        [],
        ["--- CUSTOMER ---", ""],
        ["Customer", full.customerName],
        ["Country", full.customerCountry || ""],
        ["Contact", full.customerContact || ""],
        ...customerFields.map((f) => [f.fieldName, f.fieldValue || ""]),
        [],
        ["Currency", currency],
        ["Notes", full.notes || ""],
        [],
        ["--- TOTALS ---", ""],
        ["Subtotal", subtotal],
        ...steps.map((s) => [`${s.name} (${s.type === "add" ? "+" : "-"} ${s.valueType === "percentage" ? `${s.value}%` : `${currency} ${s.value}`})`, s.computedAmount]),
        ["FINAL TOTAL", finalTotal],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(invoiceRows);
      ws1["!cols"] = [{ wch: 28 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, ws1, "Invoice");

      // Sheet 2: Products
      const productHeaders = ["#", "Stock Code", "Product Name", "Description", "Qty", `Unit Price (${currency})`, `Total (${currency})`];
      const productRows = items.map((item, i) => [
        i + 1,
        item.productStockCode || "",
        item.customName ?? item.productName ?? "",
        item.customDescription ?? item.productDescription ?? "",
        item.quantity,
        item.customPrice ?? item.productPrice ?? 0,
        item.quantity * (item.customPrice ?? item.productPrice ?? 0),
      ]);
      const ws2 = XLSX.utils.aoa_to_sheet([productHeaders, ...productRows]);
      ws2["!cols"] = [{ wch: 4 }, { wch: 20 }, { wch: 28 }, { wch: 32 }, { wch: 8 }, { wch: 16 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Products");

      // Sheet 3: Financials
      const finHeaders = ["Description", "Operation", "Value", `Computed (${currency})`, `Running Total (${currency})`];
      const finRows: (string | number)[][] = [
        ["Subtotal", "", "", subtotal, subtotal],
        ...steps.map((s) => [
          s.name,
          s.type === "add" ? "Add" : "Subtract",
          s.valueType === "percentage" ? `${s.value}%` : `${currency} ${s.value}`,
          s.computedAmount,
          s.runningTotal,
        ]),
        ["FINAL TOTAL", "", "", "", finalTotal],
      ];
      const ws3 = XLSX.utils.aoa_to_sheet([finHeaders, ...finRows]);
      ws3["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws3, "Financials");

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", `attachment; filename="${full.proformaId}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting proforma to Excel:", error);
      res.status(500).json({ error: "Failed to export proforma" });
    }
  });

  // ── Proforma Items ─────────────────────────────────────────────────
  app.post("/api/proforma/:proformaId/items", async (req, res) => {
    try {
      const item = await storage.createProformaItem({ ...req.body, proformaId: req.params.proformaId });
      refreshState.trigger();
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
      refreshState.trigger();
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
      refreshState.trigger();
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting proforma item:", error);
      res.status(500).json({ error: "Failed to delete proforma item" });
    }
  });

  // ── Proforma Financials ────────────────────────────────────────────
  app.get("/api/proforma/:proformaId/financials", async (req, res) => {
    try {
      const fins = await storage.getProformaFinancials(req.params.proformaId);
      res.json(fins);
    } catch (error) {
      console.error("Error fetching proforma financials:", error);
      res.status(500).json({ error: "Failed to fetch financials" });
    }
  });

  app.post("/api/proforma/:proformaId/financials", async (req, res) => {
    try {
      const fins = await storage.getProformaFinancials(req.params.proformaId);
      const nextOrder = fins.length > 0 ? Math.max(...fins.map((f) => f.orderIndex || 0)) + 1 : 0;
      const created = await storage.createProformaFinancial({
        proformaId: req.params.proformaId,
        name: req.body.name || "New Calculation",
        type: req.body.type || "add",
        valueType: req.body.valueType || "fixed",
        value: req.body.value || 0,
        orderIndex: nextOrder,
      });
      refreshState.trigger();
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating proforma financial:", error);
      res.status(500).json({ error: "Failed to create financial" });
    }
  });

  app.patch("/api/proforma-financials/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const updated = await storage.updateProformaFinancial(id, req.body);
      if (!updated) return res.status(404).json({ error: "Financial not found" });
      refreshState.trigger();
      res.json(updated);
    } catch (error) {
      console.error("Error updating proforma financial:", error);
      res.status(500).json({ error: "Failed to update financial" });
    }
  });

  app.delete("/api/proforma-financials/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const deleted = await storage.deleteProformaFinancial(id);
      if (!deleted) return res.status(404).json({ error: "Financial not found" });
      refreshState.trigger();
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting proforma financial:", error);
      res.status(500).json({ error: "Failed to delete financial" });
    }
  });
}
