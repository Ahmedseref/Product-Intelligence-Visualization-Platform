import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { registerRoutes } from "./routes";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";

const rootDir = process.cwd();

console.log("Starting server...");
console.log("Root directory:", rootDir);
console.log("NODE_ENV:", process.env.NODE_ENV);

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/", (req, res, next) => {
  if (req.headers['user-agent']?.includes('health') || req.headers['x-health-check']) {
    return res.status(200).send('OK');
  }
  next();
});

registerObjectStorageRoutes(app);
registerRoutes(app);

function findDistPath(): string {
  const candidates = [
    path.join(rootDir, "dist"),
    path.join(rootDir, "..", "dist"),
    path.resolve("dist"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(rootDir, "dist");
}

const distPath = findDistPath();
console.log("Static files path:", distPath);
console.log("Static path exists:", fs.existsSync(distPath));

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("index.html not found");
      }
    } else {
      next();
    }
  });
} else {
  console.log("Warning: dist folder not found at", distPath);
  app.use((req, res) => {
    res.status(503).send("Application not built. Run npm run build first.");
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
