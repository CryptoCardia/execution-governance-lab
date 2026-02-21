import express from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../src/db.js";
import { evaluateIntent } from "../services/riskEngine.js";
import { sha256 } from "../src/utils/hash.js";
import { computeExecHash } from "../src/utils/execHash.js";

const router = express.Router();

/**
 * POST /lab/run
 */
router.post("/lab/run", async (req, res) => {
  try {
    const runId = uuidv4();
    const { intent = {}, scenario = {}, execution = null } = req.body;

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
    // Execution Hash Logic
    // ─────────────────────────────────────────────

    let expectedExecHash = null;
    let actualExecHash = null;
    let execTampered = false;

    if (execution) {
      expectedExecHash = computeExecHash(execution);

      if (scenario.contract_param_tamper) {
        const tampered = JSON.parse(JSON.stringify(execution));

        // Simple mutation example
        if (tampered.params?.amountUsd) {
          tampered.params.amountUsd =
            Number(tampered.params.amountUsd) + 1000;
        }

        actualExecHash = computeExecHash(tampered);
        execTampered = expectedExecHash !== actualExecHash;
      } else {
        actualExecHash = expectedExecHash;
      }
    }

    // ─────────────────────────────────────────────
    // Governance Evaluation
    // ─────────────────────────────────────────────

    let evaluation;

    if (execTampered) {
      evaluation = {
        decision: "DENY",
        risk: "CRITICAL",
        reasons: ["EXEC_HASH_MISMATCH"],
        integrityFailure: true
      };
    } else {
      evaluation = evaluateIntent({ intent, scenario });
    }

    const decision = evaluation.decision;
    const riskLevel = evaluation.risk;
    const reasons = evaluation.reasons;
    const integrityFailure = evaluation.integrityFailure || false;

    // ─────────────────────────────────────────────
    // Economic Modeling
    // ─────────────────────────────────────────────

    const isAttack =
      execTampered ||
      Object.values(scenario).some(Boolean);

    const preventedLoss =
      decision === "DENY" && isAttack
        ? attemptedValue
        : 0;

    const frictionCost =
      decision === "STEP_UP"
        ? 25
        : 0;

    const falsePositiveCost =
      decision === "DENY" && !isAttack
        ? 50
        : 0;

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
    // Hash-Chained Audit Event
    // ─────────────────────────────────────────────

    const prevResult = await pool.query(
      `
      SELECT event_hash
      FROM lab_audit_events
      WHERE run_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [runId]
    );

    const prevHash = prevResult.rows[0]?.event_hash || "";

    const eventPayload = {
      decision,
      risk: riskLevel,
      reasons,
      integrityFailure,
      expectedExecHash,
      actualExecHash
    };

    const eventHash = sha256(
      JSON.stringify(eventPayload) + prevHash
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
        prevHash || null,
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
      execution: {
        expectedExecHash,
        actualExecHash,
        tampered: execTampered
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

/**
 * GET /lab/dashboard
 */
router.get("/lab/dashboard", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_runs,
        COALESCE(SUM(attempted_value_usd),0) as total_attempted,
        COALESCE(SUM(prevented_loss_usd),0) as total_prevented,
        COALESCE(SUM(friction_cost_usd),0) as total_friction,
        COALESCE(SUM(false_positive_cost_usd),0) as total_false_positives,
        COALESCE(SUM(net_security_value_usd),0) as net_security_value
      FROM lab_runs
    `);

    const blockRateResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE decision = 'DENY')::float /
        NULLIF(COUNT(*),0) as block_rate
      FROM lab_runs
    `);

    return res.json({
      ...result.rows[0],
      block_rate: blockRateResult.rows[0].block_rate || 0
    });

  } catch (err) {
    console.error("LAB_DASHBOARD_ERROR:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

export default router;