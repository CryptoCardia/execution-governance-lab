import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import sandboxRouter from "../routes/sandbox.js";
import { pool } from "./db.js";

dotenv.config();

if (process.env.SANDBOX_MODE !== "true") {
  throw new Error("SANDBOX_MODE must be true");
}

const app = express();
app.use(cors());
app.use(express.json());

app.locals.db = pool;

app.use("/sandbox", sandboxRouter);

app.get("/health", (_, res) => {
  res.json({ ok: true, mode: "sandbox" });
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`Sandbox API running on port ${PORT}`);
});