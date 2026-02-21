import express from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../src/db.js";
import { evaluateIntent } from "../services/riskEngine.js";
import { sha256 } from "../src/utils/hash.js";

const router = express.Router();

/**
 * POST /lab/run
 * Core Execution Governance Lab endpoint
 */
router.post("/lab/run", async (req, res) => {
  try {
    const runId = uuidv4();
    const { intent = {}, scenario = {} } = req.body;

    if (!intent.amountUsd) {
      return res.status(400).json({
        error: "intent.amountUsd is required"
      });
    }

    const attemptedValue = Number(intent.amountUsd) || 0;

    // ─────────────────────────────────────────────
    // Baseline World (No Governance)
    // ─────────────────────────────────────────────

    const baselineDecision = "ALLOW";
    const baselineRisk = "LOW";

    // ─────────────────────────────────────────────
    // Governed World
    // ─────────────────────────────────────────────

    const evaluation = evaluateIntent({ intent, scenario });

    const decision = evaluation.decision;
    const riskLevel = evaluation.risk;
    const reasons = evaluation.reasons;
    const integrityFailure = evaluation.integrityFailure;

    // ─────────────────────────────────────────────
    // Cost-to-Outcome Calculation
    // ─────────────────────────────────────────────

    const isAttack = Object.values(scenario).some(Boolean);

    const preventedLoss =
      decision === "DENY" && isAttack ? attemptedValue : 0;

    const frictionCost =
      decision === "STEP_UP" ? 25 : 0;

    const falsePositiveCost =
      decision === "DENY" && !isAttack ? 50 : 0;

    const netSecurityValue =
      preventedLoss - frictionCost - falsePositiveCost;

    // ─────────────────────────────────────────────
    // Policy Metadata
    // ─────────────────────────────────────────────

    const policyId = "DEFAULT_V1";
    const policyVersion = 1;
    const policyHash = sha256(`${policyId}_${policyVersion}`);

    // ─────────────────────────────────────────────
    // Persist lab_runs
    // ─────────────────────────────────────────────

    await pool.query(
      `
      INSERT INTO lab_runs (
        id,
        policy_id,
        policy_version,
        policy_hash,
        intent,
        scenario,
        decision,
        risk,
        reasons,
        baseline_decision,
        baseline_risk,
        attempted_value_usd,
        prevented_loss_usd,
        friction_cost_usd,
        false_positive_cost_usd,
        net_security_value_usd
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
      )
      `,
      [
        runId,
        policyId,
        policyVersion,
        policyHash,
        intent,
        scenario,
        decision,
        riskLevel,
        reasons,
        baselineDecision,
        baselineRisk,
        attemptedValue,
        preventedLoss,
        frictionCost,
        falsePositiveCost,
        netSecurityValue
      ]
    );

    // ─────────────────────────────────────────────
    // Write Hash-Chained Audit Event
    // ─────────────────────────────────────────────

    const prevResult = await pool.query(
      `SELECT event_hash FROM lab_audit_events
       WHERE run_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [runId]
    );

    const prevHash = prevResult.rows[0]?.event_hash || null;

    const eventPayload = {
      decision,
      risk: riskLevel,
      reasons,
      integrityFailure
    };

    const eventHash = sha256(
      JSON.stringify(eventPayload) + (prevHash || "")
    );

    await pool.query(
      `
      INSERT INTO lab_audit_events (
        id,
        run_id,
        event_type,
        message,
        data,
        prev_hash,
        event_hash
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        uuidv4(),
        runId,
        "EXECUTION_DECISION",
        "Execution governance evaluated",
        eventPayload,
        prevHash,
        eventHash
      ]
    );

    // ─────────────────────────────────────────────
    // Response
    // ─────────────────────────────────────────────

    return res.json({
      runId,
      baseline: {
        decision: baselineDecision,
        risk: baselineRisk
      },
      governed: {
        decision,
        risk: riskLevel,
        reasons,
        integrityFailure
      },
      economics: {
        attemptedValue,
        preventedLoss,
        frictionCost,
        falsePositiveCost,
        netSecurityValue
      }
    });

  } catch (err) {
    console.error("LAB_RUN_ERROR:", err);
    return res.status(500).json({
      error: "Execution Governance Lab run failed"
    });
  }
});

export default router;