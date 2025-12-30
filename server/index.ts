import express from "express";
import cors from "cors";
import { registerRoutes } from "./routes";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

app.use(cors());
app.use(express.json());

registerRoutes(app);

app.listen(PORT, "localhost", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
