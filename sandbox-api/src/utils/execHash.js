import crypto from "crypto";

/**
 * Deterministic JSON stringify (sorted keys)
 */
function canonicalize(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalize).join(",")}]`;
  }

  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `"${k}":${canonicalize(obj[k])}`)
    .join(",")}}`;
}

export function computeExecHash(executionPayload) {
  const domain = "EXEC:LAB:v1:";
  const canonical = canonicalize(executionPayload);
  return crypto
    .createHash("sha256")
    .update(domain + canonical)
    .digest("hex");
}