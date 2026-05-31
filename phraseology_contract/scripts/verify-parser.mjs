import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAtcCommand } from "./parse-atc-command.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const testCasePath = path.join(rootDir, "data", "atc_command_test_cases.json");

const testCases = JSON.parse(fs.readFileSync(testCasePath, "utf8")).test_cases;
const failures = [];

function deepEqual(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

for (const testCase of testCases) {
  const parsed = parseAtcCommand(testCase.phrase);

  if (!parsed.ok) {
    failures.push({
      id: testCase.id,
      reason: "no_match",
      phrase: testCase.phrase
    });
    continue;
  }

  if (parsed.intent !== testCase.expected_intent) {
    failures.push({
      id: testCase.id,
      reason: "intent_mismatch",
      expected: testCase.expected_intent,
      actual: parsed.intent
    });
    continue;
  }

  for (const [slotKey, expectedValue] of Object.entries(testCase.expected_slots ?? {})) {
    if (slotKey === "callsign") {
      if (parsed.callsign !== expectedValue) {
        failures.push({
          id: testCase.id,
          reason: "callsign_mismatch",
          expected: expectedValue,
          actual: parsed.callsign
        });
      }
      continue;
    }

    if (!deepEqual(parsed.slots[slotKey], expectedValue)) {
      failures.push({
        id: testCase.id,
        reason: "slot_mismatch",
        slot: slotKey,
        expected: expectedValue,
        actual: parsed.slots[slotKey]
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
  parser_test_cases: testCases.length
}, null, 2));
