"use client";

import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_SANDBOX_API;

export default function Home() {
  const [result, setResult] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [intentAmount, setIntentAmount] = useState(250000);

  const [scenario, setScenario] = useState({
    new_recipient: true,
    high_velocity: true,
    replay_attempt: false,
    is_attack: true,
  });

  async function runSimulation() {
    if (!API) {
      alert("NEXT_PUBLIC_SANDBOX_API not set");
      return;
    }

    setLoading(true);

    const res = await fetch(`${API}/sandbox/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: { amountUsd: intentAmount },
        scenario,
      }),
    });

    const data = await res.json();
    setResult(data);

    await loadDashboard();

    setLoading(false);
  }

  async function loadDashboard() {
    if (!API) return;

    const res = await fetch(`${API}/sandbox/dashboard`);
    const data = await res.json();
    setDashboard(data);
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <main className="min-h-screen bg-black text-white p-10">
      <h1 className="text-4xl font-bold mb-8">
        CryptoCardia Sandbox
      </h1>

      {/* Intent Builder */}
      <div className="border border-gray-800 p-6 rounded mb-8">
        <h2 className="text-xl font-semibold mb-4">
          Intent Builder
        </h2>

        <label className="block mb-2">
          Amount (USD)
        </label>

        <input
          type="number"
          value={intentAmount}
          onChange={(e) => setIntentAmount(Number(e.target.value))}
          className="bg-gray-900 border border-gray-700 p-2 rounded w-64 mb-6"
        />

        <h3 className="text-lg font-semibold mb-2">
          Scenario Toggles
        </h3>

        <div className="space-y-2">
          {Object.keys(scenario).map((key) => (
            <label key={key} className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={(scenario as any)[key]}
                onChange={(e) =>
                  setScenario({
                    ...scenario,
                    [key]: e.target.checked,
                  })
                }
              />
              <span>{key}</span>
            </label>
          ))}
        </div>

        <button
          onClick={runSimulation}
          disabled={loading}
          className="mt-6 bg-white text-black px-6 py-3 rounded font-semibold"
        >
          {loading ? "Running..." : "Run Attack Simulation"}
        </button>
      </div>

      {/* Decision Output */}
      {result && (
        <div className="border border-gray-800 p-6 rounded mb-8">
          <h2 className="text-xl font-semibold mb-4">
            Decision Outcome
          </h2>

          <p>
            <strong>Decision:</strong> {result.decision}
          </p>

          <p>
            <strong>Risk:</strong> {result.risk}
          </p>

          <p>
            <strong>Reasons:</strong>{" "}
            {result.reasons?.join(", ")}
          </p>

          <div className="mt-4 border-t border-gray-700 pt-4">
            <h3 className="text-lg font-semibold mb-2">
              Cost-to-Outcome Ledger
            </h3>

            <p>
              Attempted Value: $
              {result.ledger.attempted_value_usd}
            </p>

            <p>
              Prevented Loss: $
              {result.ledger.prevented_loss_usd}
            </p>

            <p>
              Friction Cost: $
              {result.ledger.friction_cost_usd}
            </p>

            <p className="font-bold">
              Net Security Value: $
              {result.ledger.net_security_value_usd}
            </p>
          </div>
        </div>
      )}

      {/* Cumulative Dashboard */}
      {dashboard && (
        <div className="border border-gray-800 p-6 rounded">
          <h2 className="text-xl font-semibold mb-4">
            Cumulative Sandbox Ledger
          </h2>

          <p>Total Runs: {dashboard.total_runs}</p>
          <p>Total Attempted: ${dashboard.total_attempted}</p>
          <p>Total Prevented: ${dashboard.total_prevented}</p>
          <p>Total Friction: ${dashboard.total_friction}</p>

          <p className="font-bold mt-2">
            Net Security Value: ${dashboard.net_security_value}
          </p>
        </div>
      )}
    </main>
  );
}