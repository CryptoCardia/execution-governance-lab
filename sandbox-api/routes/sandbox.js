import express from "express";
import { v4 as uuidv4 } from "uuid";
import { evaluateIntent } from "../services/riskEngine.js";
import { computeLedger } from "../services/ledgerEngine.js";

const router = express.Router();

router.post("/evaluate", async (req, res) => {
  const { intent, scenario } = req.body;

  if (!intent || !scenario) {
    return res.status(400).json({ error: "intent and scenario required" });
  }

  const db = req.app.locals.db;
  const runId = uuidv4();

  const result = evaluateIntent({ intent, scenario });

  const ledger = computeLedger({
    intent,
    decision: result.decision,
    scenario,
  });

  await db.query(
    `
    INSERT INTO sandbox_runs (
      id,
      attempted_value_usd,
      scenario,
      decision,
      risk,
      reasons,
      prevented_loss_usd,
      friction_cost_usd,
      net_security_value_usd
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,
    [
      runId,
      intent.amountUsd,
      JSON.stringify(scenario),
      result.decision,
      result.risk,
      JSON.stringify(result.reasons),
      ledger.prevented_loss_usd,
      ledger.friction_cost_usd,
      ledger.net_security_value_usd,
    ]
  );

  return res.json({
    run_id: runId,
    decision: result.decision,
    risk: result.risk,
    reasons: result.reasons,
    ledger,
  });
});

router.get("/dashboard", async (req, res) => {
  const db = req.app.locals.db;

  const { rows } = await db.query(`
    SELECT
      COUNT(*) AS total_runs,
      COALESCE(SUM(attempted_value_usd),0) AS total_attempted,
      COALESCE(SUM(prevented_loss_usd),0) AS total_prevented,
      COALESCE(SUM(friction_cost_usd),0) AS total_friction,
      COALESCE(SUM(net_security_value_usd),0) AS net_security_value
    FROM sandbox_runs
  `);

  res.json(rows[0]);
});

export default router;