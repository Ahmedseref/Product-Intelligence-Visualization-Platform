import type { Express } from "express";
import { storage } from "./storage";
import { authMiddleware, requirePasswordChange } from "./authRoutes";

export function registerCustomerRoutes(app: Express): void {
  app.use("/api/customers", authMiddleware, requirePasswordChange);

  // ── Customer List ──────────────────────────────────────────────────
  app.get("/api/customers", async (req, res) => {
    try {
      const list = await storage.getCustomers();
      res.json(list);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const { name, fields } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "Customer name is required" });
      const customer = await storage.createCustomer({ name: name.trim() });
      if (fields && Array.isArray(fields) && fields.length > 0) {
        await storage.replaceCustomerFields(
          customer.id,
          fields.map((f: { fieldName: string; fieldValue: string }, idx: number) => ({
            fieldName: f.fieldName,
            fieldValue: f.fieldValue || "",
            sortOrder: idx,
          }))
        );
      }
      const customerFields = await storage.getCustomerFields(customer.id);
      res.status(201).json({ ...customer, fields: customerFields });
    } catch (error) {
      console.error("Error creating customer:", error);
      res.status(500).json({ error: "Failed to create customer" });
    }
  });

  // ── Single Customer ────────────────────────────────────────────────
  app.get("/api/customers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const customer = await storage.getCustomer(id);
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      const fields = await storage.getCustomerFields(id);
      res.json({ ...customer, fields });
    } catch (error) {
      console.error("Error fetching customer:", error);
      res.status(500).json({ error: "Failed to fetch customer" });
    }
  });

  app.patch("/api/customers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { name, fields } = req.body;
      if (name !== undefined) {
        await storage.updateCustomer(id, { name: name.trim() });
      }
      if (fields !== undefined && Array.isArray(fields)) {
        await storage.replaceCustomerFields(
          id,
          fields.map((f: { fieldName: string; fieldValue: string }, idx: number) => ({
            fieldName: f.fieldName,
            fieldValue: f.fieldValue || "",
            sortOrder: idx,
          }))
        );
      }
      const updated = await storage.getCustomer(id);
      const customerFields = await storage.getCustomerFields(id);
      res.json({ ...updated, fields: customerFields });
    } catch (error) {
      console.error("Error updating customer:", error);
      res.status(500).json({ error: "Failed to update customer" });
    }
  });

  app.delete("/api/customers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const deleted = await storage.deleteCustomer(id);
      if (!deleted) return res.status(404).json({ error: "Customer not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting customer:", error);
      res.status(500).json({ error: "Failed to delete customer" });
    }
  });
}
