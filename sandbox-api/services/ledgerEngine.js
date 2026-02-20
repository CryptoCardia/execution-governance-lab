export function computeLedger({ intent, decision, scenario }) {
  const attempted = intent.amountUsd;
  let prevented = 0;
  let friction = 0;

  const stepUpCost = 25; // simple default

  if (decision === "DENY" && scenario.is_attack) {
    prevented = attempted;
  }

  if (decision === "STEP_UP") {
    friction = stepUpCost;
  }

  const net = prevented - friction;

  return {
    attempted_value_usd: attempted,
    prevented_loss_usd: prevented,
    friction_cost_usd: friction,
    net_security_value_usd: net,
  };
}