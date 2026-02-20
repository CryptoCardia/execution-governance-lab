export function evaluateIntent({ intent, scenario }) {
  let score = 0;
  const reasons = [];

  if (intent.amountUsd > 100000) {
    score += 40;
    reasons.push("HIGH_AMOUNT");
  }

  if (scenario.new_recipient) {
    score += 30;
    reasons.push("NEW_RECIPIENT");
  }

  if (scenario.high_velocity) {
    score += 30;
    reasons.push("HIGH_VELOCITY");
  }

  if (scenario.replay_attempt) {
    return {
      decision: "DENY",
      risk: "HIGH",
      reasons: ["REPLAY_ATTACK"],
    };
  }

  let risk = "LOW";
  if (score >= 70) risk = "HIGH";
  else if (score >= 30) risk = "MEDIUM";

  let decision = "ALLOW";
  if (risk === "HIGH") decision = "DENY";
  else if (risk === "MEDIUM") decision = "STEP_UP";

  return { decision, risk, reasons };
}