import type { Express } from "express";
import { storage } from "./storage";
import { authMiddleware, requirePasswordChange } from "./authRoutes";

export function registerDocumentRoutes(app: Express): void {
  app.use("/api/documents", authMiddleware, requirePasswordChange);

  app.get("/api/documents", async (req, res) => {
    try {
      const docs = await storage.getDocuments();
      res.json(docs);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/by-relation/:type/:id", async (req, res) => {
    try {
      const docs = await storage.getDocumentsByRelation(req.params.type, req.params.id);
      res.json(docs);
    } catch (error) {
      console.error("Error fetching documents by relation:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:documentId", async (req, res) => {
    try {
      const doc = await storage.getDocument(req.params.documentId);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(doc);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.post("/api/documents", async (req, res) => {
    try {
      const documentId = await storage.getNextDocumentId();
      const doc = await storage.createDocument({ ...req.body, documentId });
      res.status(201).json(doc);
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  app.patch("/api/documents/:documentId", async (req, res) => {
    try {
      const doc = await storage.updateDocument(req.params.documentId, req.body);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(doc);
    } catch (error) {
      console.error("Error updating document:", error);
      res.status(500).json({ error: "Failed to update document" });
    }
  });

  app.delete("/api/documents/:documentId", async (req, res) => {
    try {
      const deleted = await storage.deleteDocument(req.params.documentId);
      if (!deleted) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });
}
