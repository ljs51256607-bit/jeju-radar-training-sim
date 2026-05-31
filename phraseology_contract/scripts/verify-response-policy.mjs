import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateResponsePolicy } from "./evaluate-response-policy.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const testCasePath = path.join(rootDir, "data", "pilot_response_policy_test_cases.json");
const testDoc = JSON.parse(fs.readFileSync(testCasePath, "utf8"));
const failures = [];

for (const testCase of testDoc.test_cases) {
  const result = evaluateResponsePolicy(testCase.phrase, {
    activeCallsigns: testDoc.active_callsigns
  });

  for (const key of ["condition", "response_action", "engine_action"]) {
    const expected = testCase[`expected_${key}`] ?? testCase[key];
    if (expected && result[key] !== expected) {
      failures.push({
        id: testCase.id,
        field: key,
        expected,
        actual: result[key]
      });
    }
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "ok",
  response_policy_test_cases: testDoc.test_cases.length
}, null, 2));

