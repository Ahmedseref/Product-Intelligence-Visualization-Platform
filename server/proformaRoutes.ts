import type { Express } from "express";
import { storage } from "./storage";
import { authMiddleware, requirePasswordChange } from "./authRoutes";
import ExcelJS from "exceljs";
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
      const items = (full.items || []) as Array<{ productStockCode?: string; customName?: string | null; productName?: string; customDescription?: string | null; productDescription?: string; quantity: number; customPrice?: number | null; productPrice?: number; productUnit?: string }>;
      const financials = (full.financials || []) as Array<{ id: number; name: string; type: string; valueType: string; value: number; orderIndex: number }>;
      const customerFields = (full.customerFields || []) as Array<{ fieldName: string; fieldValue?: string | null }>;
      const currency = full.currency || settings?.defaultCurrency || "USD";
      const subtotal = items.reduce((sum, item) => sum + item.quantity * (item.customPrice ?? item.productPrice ?? 0), 0);
      const { steps, finalTotal } = computeFinancials(subtotal, financials);
      const invoiceDate = full.date ? new Date(full.date).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
      const invoicedTo = (full as any).shipTo?.trim() || "SAME AS CONSIGNEE";
      const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const wb = new ExcelJS.Workbook();
      wb.creator = settings?.companyName || "Product Intelligence";
      const ws = wb.addWorksheet("Proforma Invoice", {
        pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
        properties: { defaultRowHeight: 15 },
      });

      const FONT_FAMILY = "Segoe UI";
      const DARK = "FF1E293B";
      const MED = "FF475569";
      const LIGHT = "FF94A3B8";
      const BG_HEADER = "FFF8FAFC";
      const BORDER_DARK: Partial<ExcelJS.Border> = { style: "medium", color: { argb: "FF1E293B" } };
      const BORDER_THIN: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFCBD5E1" } };
      const BORDER_DASHED: Partial<ExcelJS.Border> = { style: "dotted", color: { argb: "FFCBD5E1" } };

      ws.columns = [
        { width: 36 },
        { width: 10 },
        { width: 10 },
        { width: 14 },
        { width: 14 },
      ];

      let r = 1;

      // ─── TITLE BAR ───
      ws.mergeCells(r, 1, r, 5);
      const titleCell = ws.getCell(r, 1);
      titleCell.value = "PROFORMA INVOICE";
      titleCell.font = { name: FONT_FAMILY, size: 14, bold: true, color: { argb: DARK } };
      titleCell.alignment = { vertical: "middle" };
      titleCell.border = { top: BORDER_DARK, left: BORDER_DARK, right: BORDER_DARK, bottom: BORDER_DARK };
      for (let c = 2; c <= 5; c++) {
        ws.getCell(r, c).border = { top: BORDER_DARK, bottom: BORDER_DARK, right: c === 5 ? BORDER_DARK : undefined };
      }
      ws.getRow(r).height = 28;
      r++;

      // ─── HEADER SECTION: Company (left cols 1-2) + Meta Table (right cols 3-5) ───
      const effectivePaymentTerms = (full as any).paymentTerms || settings?.paymentTerms || "";
      const effectiveDeliveryTerms = (full as any).deliveryTerms || settings?.deliveryTerms || "";

      const metaRows: [string, string][] = [
        ["DATE", invoiceDate],
        ["NUMBER", full.proformaId],
        ["TERMS OF PAYMENT", effectivePaymentTerms || "—"],
        ["TERMS OF DELIVERY", effectiveDeliveryTerms || "—"],
        ["PORT OF LOADING", (full as any).portOfLoading || "—"],
        ["TRANSACTION CURRENCY", currency],
        ["PLACE OF DESTINATION", (full as any).placeOfDestination || "—"],
        ["FINAL PLACE OF DELIVERY", (full as any).finalPlaceOfDelivery || "—"],
        ["COUNTRY OF ORIGIN", (full as any).countryOfOrigin || "—"],
        ["TRANSPORTATION MODE", (full as any).transportationMode || "—"],
      ];

      const companyLines: string[] = [];
      companyLines.push("Produced & Exported By:");
      companyLines.push(settings?.companyName || "Your Company");
      if (settings?.address) companyLines.push(settings.address);
      if (settings?.phone) companyLines.push(`T: ${settings.phone}`);
      if (settings?.email) companyLines.push(`E: ${settings.email}`);
      companyLines.push("");
      companyLines.push("Bill & Ship To:");
      companyLines.push(full.customerName);
      if (full.customerCountry) companyLines.push(full.customerCountry);
      if (full.customerContact) companyLines.push(full.customerContact);
      const filteredFields = customerFields.filter(f => !["country", "contact", "email"].includes(f.fieldName.toLowerCase()));
      for (const f of filteredFields) {
        companyLines.push(`${f.fieldName}: ${f.fieldValue || "—"}`);
      }
      companyLines.push("");
      companyLines.push("Invoiced To:");
      companyLines.push(invoicedTo);

      const headerRows = Math.max(metaRows.length, companyLines.length);
      const headerStartRow = r;

      for (let i = 0; i < headerRows; i++) {
        const row = ws.getRow(r + i);
        row.height = 16;

        const leftCell = ws.getCell(r + i, 1);
        ws.mergeCells(r + i, 1, r + i, 2);
        const lineText = companyLines[i] || "";
        leftCell.value = lineText;
        const isSectionHeader = lineText === "Produced & Exported By:" || lineText === "Bill & Ship To:" || lineText === "Invoiced To:";
        const isCompanyName = i === 1;
        leftCell.font = {
          name: FONT_FAMILY,
          size: isSectionHeader ? 7 : isCompanyName ? 10 : 9,
          bold: isCompanyName || isSectionHeader,
          color: { argb: isSectionHeader ? LIGHT : isCompanyName ? DARK : MED },
        };
        leftCell.alignment = { vertical: "middle", wrapText: true };
        leftCell.border = { left: BORDER_DARK, right: BORDER_DARK };
        ws.getCell(r + i, 2).border = { right: BORDER_DARK };

        if (i < metaRows.length) {
          const [label, value] = metaRows[i];
          const labelCell = ws.getCell(r + i, 3);
          ws.mergeCells(r + i, 4, r + i, 5);
          const valueCell = ws.getCell(r + i, 4);

          labelCell.value = label;
          labelCell.font = { name: FONT_FAMILY, size: 8, color: { argb: MED } };
          labelCell.alignment = { vertical: "middle" };
          labelCell.border = { left: BORDER_DARK, right: BORDER_THIN, bottom: i < metaRows.length - 1 ? BORDER_THIN : undefined };

          valueCell.value = value;
          valueCell.font = { name: FONT_FAMILY, size: 8, bold: true, color: { argb: DARK } };
          valueCell.alignment = { vertical: "middle" };
          valueCell.border = { right: BORDER_DARK, bottom: i < metaRows.length - 1 ? BORDER_THIN : undefined };
          ws.getCell(r + i, 5).border = { right: BORDER_DARK, bottom: i < metaRows.length - 1 ? BORDER_THIN : undefined };
        } else {
          ws.getCell(r + i, 3).border = { left: BORDER_DARK };
          ws.getCell(r + i, 5).border = { right: BORDER_DARK };
        }
      }

      for (let c = 1; c <= 5; c++) {
        const cell = ws.getCell(headerStartRow + headerRows - 1, c);
        cell.border = { ...cell.border, bottom: BORDER_DARK };
      }
      r += headerRows;

      // ─── PRODUCTS TABLE HEADER ───
      const prodHeaders = ["DESCRIPTION OF GOODS", "QTY", "UNIT", "UNIT PRICE", "TOTAL"];
      const prodRow = ws.getRow(r);
      prodRow.height = 22;
      for (let c = 0; c < prodHeaders.length; c++) {
        const cell = ws.getCell(r, c + 1);
        cell.value = prodHeaders[c];
        cell.font = { name: FONT_FAMILY, size: 8, bold: true, color: { argb: MED } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_HEADER } };
        cell.alignment = { vertical: "middle", horizontal: c === 0 ? "left" : c <= 2 ? "center" : "right" };
        cell.border = {
          top: BORDER_DARK,
          bottom: BORDER_DARK,
          left: c === 0 ? BORDER_DARK : BORDER_THIN,
          right: c === prodHeaders.length - 1 ? BORDER_DARK : BORDER_THIN,
        };
      }
      r++;

      // ─── PRODUCT ROWS ───
      if (items.length === 0) {
        ws.mergeCells(r, 1, r, 5);
        const emptyCell = ws.getCell(r, 1);
        emptyCell.value = "No products in this proforma";
        emptyCell.font = { name: FONT_FAMILY, size: 9, italic: true, color: { argb: LIGHT } };
        emptyCell.alignment = { vertical: "middle", horizontal: "center" };
        emptyCell.border = { left: BORDER_DARK, right: BORDER_DARK };
        for (let c = 2; c <= 5; c++) ws.getCell(r, c).border = { right: c === 5 ? BORDER_DARK : undefined };
        ws.getRow(r).height = 24;
        r++;
      }
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const displayName = item.customName ?? item.productName ?? "";
        const displayDesc = item.customDescription ?? item.productDescription ?? "";
        const displayPrice = item.customPrice ?? item.productPrice ?? 0;
        const lineTotal = displayPrice * item.quantity;
        const unit = item.productUnit || "pc";

        let descText = displayName;
        if (displayDesc) descText += `\n${displayDesc}`;
        if (item.productStockCode) descText += `\n${item.productStockCode}`;

        const row = ws.getRow(r);
        row.height = descText.includes("\n") ? 36 : 20;

        const descCell = ws.getCell(r, 1);
        descCell.value = descText;
        descCell.font = { name: FONT_FAMILY, size: 9, color: { argb: DARK } };
        descCell.alignment = { vertical: "middle", wrapText: true };
        descCell.border = { left: BORDER_DARK, right: BORDER_THIN, bottom: i < items.length - 1 ? BORDER_THIN : undefined };

        const qtyCell = ws.getCell(r, 2);
        qtyCell.value = item.quantity;
        qtyCell.font = { name: FONT_FAMILY, size: 9, color: { argb: DARK } };
        qtyCell.alignment = { vertical: "middle", horizontal: "center" };
        qtyCell.border = { right: BORDER_THIN, bottom: i < items.length - 1 ? BORDER_THIN : undefined };

        const unitCell = ws.getCell(r, 3);
        unitCell.value = unit;
        unitCell.font = { name: FONT_FAMILY, size: 9, color: { argb: MED } };
        unitCell.alignment = { vertical: "middle", horizontal: "center" };
        unitCell.border = { right: BORDER_THIN, bottom: i < items.length - 1 ? BORDER_THIN : undefined };

        const priceCell = ws.getCell(r, 4);
        priceCell.value = `${currency} ${fmt(displayPrice)}`;
        priceCell.font = { name: FONT_FAMILY, size: 9, color: { argb: DARK } };
        priceCell.alignment = { vertical: "middle", horizontal: "right" };
        priceCell.border = { right: BORDER_THIN, bottom: i < items.length - 1 ? BORDER_THIN : undefined };

        const totalCell = ws.getCell(r, 5);
        totalCell.value = `${currency} ${fmt(lineTotal)}`;
        totalCell.font = { name: FONT_FAMILY, size: 9, bold: true, color: { argb: DARK } };
        totalCell.alignment = { vertical: "middle", horizontal: "right" };
        totalCell.border = { right: BORDER_DARK, bottom: i < items.length - 1 ? BORDER_THIN : undefined };

        r++;
      }

      // ─── SUBTOTAL ROW (only when financial steps exist) ───
      const portOfLoading = (full as any).portOfLoading || "";
      const countryOfOrigin = (full as any).countryOfOrigin || "";
      const finalPlaceOfDelivery = (full as any).finalPlaceOfDelivery || "";
      const placeOfDestination = (full as any).placeOfDestination || "";

      if (steps.length > 0) {
        const subtotalRow = ws.getRow(r);
        subtotalRow.height = 22;
        ws.mergeCells(r, 1, r, 4);
        const subLabelCell = ws.getCell(r, 1);
        let subLabel = `SUBTOTAL ${effectiveDeliveryTerms}`;
        if (portOfLoading) subLabel += ` ${portOfLoading}`;
        if (countryOfOrigin) subLabel += `, ${countryOfOrigin}`;
        subLabelCell.value = subLabel.trim();
        subLabelCell.font = { name: FONT_FAMILY, size: 8, bold: true, color: { argb: MED } };
        subLabelCell.alignment = { vertical: "middle", horizontal: "right" };
        subLabelCell.border = { left: BORDER_DARK, top: BORDER_DARK };
        for (let c = 2; c <= 4; c++) ws.getCell(r, c).border = { top: BORDER_DARK };
        const subAmtCell = ws.getCell(r, 5);
        subAmtCell.value = `${currency} ${fmt(subtotal)}`;
        subAmtCell.font = { name: FONT_FAMILY, size: 9, bold: true, color: { argb: MED } };
        subAmtCell.alignment = { vertical: "middle", horizontal: "right" };
        subAmtCell.border = { right: BORDER_DARK, top: BORDER_DARK };
        r++;
      }

      // ─── FINANCIAL CALCULATION STEPS ───
      for (const step of steps) {
        const row = ws.getRow(r);
        row.height = 18;

        ws.mergeCells(r, 1, r, 4);
        const labelCell = ws.getCell(r, 1);
        const label = step.valueType === "percentage" ? `${step.name} (${step.value}%)` : step.name;
        labelCell.value = label;
        labelCell.font = { name: FONT_FAMILY, size: 8, color: { argb: DARK } };
        labelCell.alignment = { vertical: "middle", horizontal: "right" };
        labelCell.border = { left: BORDER_DARK, top: BORDER_DASHED };
        for (let c = 2; c <= 4; c++) {
          ws.getCell(r, c).border = { top: BORDER_DASHED };
        }

        const amtCell = ws.getCell(r, 5);
        amtCell.value = `${currency} ${fmt(Math.abs(step.computedAmount))}`;
        amtCell.font = { name: FONT_FAMILY, size: 8, color: { argb: DARK } };
        amtCell.alignment = { vertical: "middle", horizontal: "right" };
        amtCell.border = { right: BORDER_DARK, top: BORDER_DASHED };
        r++;
      }

      // ─── FINAL TOTAL ROW ───
      const totalRow = ws.getRow(r);
      totalRow.height = 24;
      ws.mergeCells(r, 1, r, 4);
      const totalLabelCell = ws.getCell(r, 1);
      let totalLabel: string;
      if (steps.length > 0) {
        totalLabel = `TOTAL ${effectiveDeliveryTerms || "CIF"}`;
        if (finalPlaceOfDelivery) totalLabel += ` ${finalPlaceOfDelivery}`;
        if (placeOfDestination) totalLabel += `, ${placeOfDestination}`;
      } else {
        totalLabel = `TOTAL ${effectiveDeliveryTerms}`;
        if (portOfLoading) totalLabel += ` ${portOfLoading}`;
      }
      totalLabelCell.value = totalLabel.trim();
      totalLabelCell.font = { name: FONT_FAMILY, size: 9, bold: true, color: { argb: DARK } };
      totalLabelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_HEADER } };
      totalLabelCell.alignment = { vertical: "middle", horizontal: "right" };
      totalLabelCell.border = { left: BORDER_DARK, top: BORDER_DARK, bottom: BORDER_DARK };
      for (let c = 2; c <= 4; c++) {
        ws.getCell(r, c).border = { top: BORDER_DARK, bottom: BORDER_DARK };
        ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_HEADER } };
      }
      const grandTotalCell = ws.getCell(r, 5);
      grandTotalCell.value = `${currency} ${fmt(finalTotal)}`;
      grandTotalCell.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: DARK } };
      grandTotalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_HEADER } };
      grandTotalCell.alignment = { vertical: "middle", horizontal: "right" };
      grandTotalCell.border = { right: BORDER_DARK, top: BORDER_DARK, bottom: BORDER_DARK };
      r++;

      // ─── NOTES SECTION ───
      const notesText = (full as any).notes || settings?.notes || "";
      if (notesText) {
        ws.mergeCells(r, 1, r, 5);
        const notesLabelCell = ws.getCell(r, 1);
        notesLabelCell.value = "Notes";
        notesLabelCell.font = { name: FONT_FAMILY, size: 7, bold: true, color: { argb: LIGHT } };
        notesLabelCell.border = { left: BORDER_DARK, right: BORDER_DARK };
        for (let c = 2; c <= 5; c++) ws.getCell(r, c).border = { right: c === 5 ? BORDER_DARK : undefined };
        r++;

        ws.mergeCells(r, 1, r, 5);
        const notesCell = ws.getCell(r, 1);
        notesCell.value = notesText;
        notesCell.font = { name: FONT_FAMILY, size: 9, color: { argb: MED } };
        notesCell.alignment = { wrapText: true, vertical: "top" };
        notesCell.border = { left: BORDER_DARK, right: BORDER_DARK, bottom: settings?.bankDetails ? undefined : BORDER_DARK };
        for (let c = 2; c <= 5; c++) ws.getCell(r, c).border = { right: c === 5 ? BORDER_DARK : undefined, bottom: settings?.bankDetails ? undefined : BORDER_DARK };
        ws.getRow(r).height = 30;
        r++;
      }

      // ─── BANK DETAILS SECTION ───
      if (settings?.bankDetails) {
        ws.mergeCells(r, 1, r, 5);
        const bankLabelCell = ws.getCell(r, 1);
        bankLabelCell.value = "Bank Details";
        bankLabelCell.font = { name: FONT_FAMILY, size: 7, bold: true, color: { argb: LIGHT } };
        bankLabelCell.border = { left: BORDER_DARK, right: BORDER_DARK };
        for (let c = 2; c <= 5; c++) ws.getCell(r, c).border = { right: c === 5 ? BORDER_DARK : undefined };
        r++;

        ws.mergeCells(r, 1, r, 5);
        const bankCell = ws.getCell(r, 1);
        bankCell.value = settings.bankDetails;
        bankCell.font = { name: "Consolas", size: 8, color: { argb: MED } };
        bankCell.alignment = { wrapText: true, vertical: "top" };
        bankCell.border = { left: BORDER_DARK, right: BORDER_DARK, bottom: BORDER_DARK };
        for (let c = 2; c <= 5; c++) ws.getCell(r, c).border = { right: c === 5 ? BORDER_DARK : undefined, bottom: BORDER_DARK };
        ws.getRow(r).height = 40;
        r++;
      }

      // Close bottom border if neither notes nor bank details exist
      if (!notesText && !settings?.bankDetails) {
        // Bottom border already set by total row
      }

      const buffer = await wb.xlsx.writeBuffer();
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
