export function evaluateIntent({ intent, scenario }) {
  let score = 0;
  const reasons = [];

  const amount = intent.amountUsd || 0;

  // ─────────────────────────────────────────────
  // Hard Integrity Failures (Immediate DENY)
  // ─────────────────────────────────────────────

  if (scenario.replay_attempt) {
    return {
      decision: "DENY",
      risk: "HIGH",
      reasons: ["REPLAY_ATTACK"],
      integrityFailure: true
    };
  }

  if (scenario.ttl_expired) {
    return {
      decision: "DENY",
      risk: "HIGH",
      reasons: ["TTL_EXPIRED"],
      integrityFailure: true
    };
  }

  if (scenario.exec_hash_mismatch) {
    return {
      decision: "DENY",
      risk: "HIGH",
      reasons: ["EXEC_HASH_MISMATCH"],
      integrityFailure: true
    };
  }

  if (scenario.poison_stats) {
    return {
      decision: "DENY",
      risk: "HIGH",
      reasons: ["UNTRUSTED_STATS_SOURCE"],
      integrityFailure: true
    };
  }

  // ─────────────────────────────────────────────
  // Risk Scoring Signals
  // ─────────────────────────────────────────────

  if (amount >= 1000000) {
    score += 60;
    reasons.push("EXTREME_AMOUNT");
  } else if (amount >= 100000) {
    score += 40;
    reasons.push("HIGH_AMOUNT");
  } else if (amount >= 25000) {
    score += 20;
    reasons.push("ELEVATED_AMOUNT");
  }

  if (scenario.new_recipient) {
    score += 25;
    reasons.push("NEW_RECIPIENT");
  }

  if (scenario.high_velocity) {
    score += 25;
    reasons.push("HIGH_VELOCITY");
  }

  if (scenario.unusual_time) {
    score += 15;
    reasons.push("UNUSUAL_TIME");
  }

  if (scenario.admin_scope) {
    score += 20;
    reasons.push("ADMIN_SCOPE");
  }

  if (scenario.api_key_compromise) {
    score += 30;
    reasons.push("API_KEY_COMPROMISED");
  }

  // ─────────────────────────────────────────────
  // Risk Band Classification
  // ─────────────────────────────────────────────

  let risk = "LOW";

  if (score >= 70) {
    risk = "HIGH";
  } else if (score >= 35) {
    risk = "MEDIUM";
  }

  // ─────────────────────────────────────────────
  // Policy Decision Mapping
  // ─────────────────────────────────────────────

  let decision = "ALLOW";

  if (risk === "HIGH") {
    decision = "DENY";
  } else if (risk === "MEDIUM") {
    decision = "STEP_UP";
  }

  return {
    decision,
    risk,
    reasons,
    score,
    integrityFailure: false
  };
}