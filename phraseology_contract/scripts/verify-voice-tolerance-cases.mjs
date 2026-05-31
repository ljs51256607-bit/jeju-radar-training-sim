import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const testCasePath = path.join(rootDir, "data", "voice_phraseology_tolerance_acceptance_cases.json");

const doc = JSON.parse(fs.readFileSync(testCasePath, "utf8"));
const failures = [];
const warnings = [];

const allowedRiskLevels = new Set(["low", "medium", "high"]);
const allowedReadbackPolicies = new Set([
  "READBACK",
  "CONFIRM_INTENT",
  "TRAFFIC_RESPONSE",
  "REQUEST_ONE_MORE_APPROACH",
  "SEQUENCE_READBACK",
  "MULTI_COMMAND_READBACK",
  "READBACK_APPLIED_AND_SAY_AGAIN_MISSING_SLOT",
  "CONFIRM_ALTITUDE",
  "RADIO_CALLSIGN_REPEAT",
  "SILENT_OR_UI_WARNING"
]);

const motionCategories = new Set(["HDG", "SPD", "ALT", "APPROACH", "DIRECT"]);
const readbackOnlyCategories = new Set(["TRAFFIC", "SEQUENCE", "MISSED", "RADIO"]);
const categoryByIntent = new Map([
  ["ASSIGN_HEADING", "HDG"],
  ["MAINTAIN_PRESENT_HEADING", "HDG"],
  ["ONE_CIRCLE_HEADING", "HDG"],
  ["ASSIGN_SPEED", "SPD"],
  ["SPEED_UNTIL_FIX", "SPD"],
  ["SPEED_UNTIL_FIX_THEN_NORMAL", "SPD"],
  ["MAXIMUM_FORWARD_SPEED", "SPD"],
  ["MINIMUM_SPEED", "SPD"],
  ["RESUME_NORMAL_SPEED", "SPD"],
  ["ASSIGN_ALTITUDE", "ALT"],
  ["EXPEDITE_DESCENT", "ALT"],
  ["EXPEDITE_CLIMB", "ALT"],
  ["CROSS_FIX_RESTRICTION", "ALT"],
  ["CLEARED_ILS", "APPROACH"],
  ["DIRECT_TO_FIX", "DIRECT"],
  ["TURN_DIRECT_FIX", "DIRECT"],
  ["TRAFFIC_INFORMATION", "TRAFFIC"],
  ["SEQUENCE_NUMBER", "SEQUENCE"],
  ["ASK_INTENTIONS", "MISSED"],
  ["REQUEST_ONE_MORE_APPROACH", "MISSED"],
  ["JAMMED_TRANSMISSION", "RADIO"],
  ["CONFIRM_CALLSIGN", "RADIO"]
]);

const requiredSlotRules = new Map([
  ["ASSIGN_HEADING", ["heading_deg"]],
  ["ONE_CIRCLE_HEADING", ["turn_direction", "heading_deg"]],
  ["ASSIGN_SPEED", ["speed_kt"]],
  ["SPEED_UNTIL_FIX", ["speed_kt", "fix_id"]],
  ["SPEED_UNTIL_FIX_THEN_NORMAL", ["speed_kt", "fix_id"]],
  ["ASSIGN_ALTITUDE", ["altitude_ft"]],
  ["CROSS_FIX_RESTRICTION", ["fix_id", "altitude_ft", "restriction"]],
  ["CLEARED_ILS", ["runway"]],
  ["DIRECT_TO_FIX", ["fix_id"]],
  ["TURN_DIRECT_FIX", ["turn_direction", "fix_id"]],
  ["TRAFFIC_INFORMATION", ["clock_position", "distance_nm", "direction_bound", "altitude_ft"]],
  ["SEQUENCE_NUMBER", ["sequence_number"]]
]);

function addFailure(id, reason, detail = {}) {
  failures.push({ id, reason, ...detail });
}

function addWarning(id, reason, detail = {}) {
  warnings.push({ id, reason, ...detail });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function startsWithCallsign(rawPhrase) {
  return /^[A-Z]{2,3}\d{2,4}\b/i.test(String(rawPhrase ?? "").trim());
}

function validateSlotValue(testCase, chunk, slotKey, value) {
  const id = testCase.id;

  if (slotKey === "heading_deg") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 360) {
      addFailure(id, "invalid_heading_deg", { value });
    }
  }

  if (slotKey === "speed_kt") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 80 || value > 350) {
      addFailure(id, "invalid_speed_kt", { value });
    }
  }

  if (slotKey === "altitude_ft" || slotKey === "target_altitude_ft") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 60000) {
      addFailure(id, "invalid_altitude_ft", { slot: slotKey, value });
    }
  }

  if (slotKey === "turn_direction") {
    if (!["LEFT", "RIGHT"].includes(value)) {
      addFailure(id, "invalid_turn_direction", { value });
    }
  }

  if (slotKey === "fix_id") {
    if (typeof value !== "string" || !/^[A-Z0-9]{2,6}$/.test(value)) {
      addFailure(id, "invalid_fix_id", { value });
    }
  }

  if (slotKey === "runway") {
    if (typeof value !== "string" || !/^\d{2}[LRC]?$/.test(value)) {
      addFailure(id, "invalid_runway", { value });
    }
  }

  if (slotKey === "restriction") {
    if (!["AT_OR_BELOW", "BELOW"].includes(value)) {
      addFailure(id, "invalid_crossing_restriction", { value });
    }
  }

  if (slotKey === "clock_position") {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 12) {
      addFailure(id, "invalid_clock_position", { value });
    }
  }

  if (slotKey === "distance_nm") {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 80) {
      addFailure(id, "invalid_distance_nm", { value });
    }
  }

  if (slotKey === "direction_bound") {
    if (typeof value !== "string" || !/^[A-Z]+$/.test(value)) {
      addFailure(id, "invalid_direction_bound", { value });
    }
  }

  if (slotKey === "sequence_number") {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 20) {
      addFailure(id, "invalid_sequence_number", { value });
    }
  }

  if (slotKey === "approach_variant") {
    if (!["Z", "Y"].includes(value)) {
      addFailure(id, "invalid_approach_variant", { value });
    }
  }

  if (chunk.category === "TRAFFIC" && slotKey === "aircraft_type") {
    if (typeof value !== "string" || !/^[A-Z0-9]{2,6}$/.test(value)) {
      addFailure(id, "invalid_traffic_aircraft_type", { value });
    }
  }
}

function validateChunk(testCase, chunk, index) {
  const id = testCase.id;

  if (!isRecord(chunk)) {
    addFailure(id, "chunk_not_object", { index });
    return;
  }

  if (typeof chunk.intent !== "string" || !chunk.intent) {
    addFailure(id, "missing_chunk_intent", { index });
    return;
  }

  if (!categoryByIntent.has(chunk.intent)) {
    addFailure(id, "unknown_intent", { index, intent: chunk.intent });
  }

  if (typeof chunk.category !== "string" || !chunk.category) {
    addFailure(id, "missing_chunk_category", { index, intent: chunk.intent });
  } else if (categoryByIntent.has(chunk.intent) && categoryByIntent.get(chunk.intent) !== chunk.category) {
    addFailure(id, "intent_category_mismatch", {
      index,
      intent: chunk.intent,
      expected: categoryByIntent.get(chunk.intent),
      actual: chunk.category
    });
  }

  if (!isRecord(chunk.required_slots)) {
    addFailure(id, "required_slots_not_object", { index, intent: chunk.intent });
    return;
  }

  if (hasOwn(chunk, "optional_slots") && !isRecord(chunk.optional_slots)) {
    addFailure(id, "optional_slots_not_object", { index, intent: chunk.intent });
  }

  if (hasOwn(chunk, "missing_slots") && !Array.isArray(chunk.missing_slots)) {
    addFailure(id, "missing_slots_not_array", { index, intent: chunk.intent });
  }

  if (hasOwn(chunk, "ambiguous_slots") && !isRecord(chunk.ambiguous_slots)) {
    addFailure(id, "ambiguous_slots_not_object", { index, intent: chunk.intent });
  }

  for (const requiredSlot of requiredSlotRules.get(chunk.intent) ?? []) {
    if (!hasOwn(chunk.required_slots, requiredSlot)) {
      const missingSlots = Array.isArray(chunk.missing_slots) ? chunk.missing_slots : [];
      const ambiguousSlots = isRecord(chunk.ambiguous_slots) ? chunk.ambiguous_slots : {};

      if (!missingSlots.includes(requiredSlot) && !hasOwn(ambiguousSlots, requiredSlot)) {
        addFailure(id, "missing_required_slot_for_intent", {
          index,
          intent: chunk.intent,
          slot: requiredSlot
        });
      }
    }
  }

  for (const [slotKey, value] of Object.entries(chunk.required_slots)) {
    validateSlotValue(testCase, chunk, slotKey, value);
  }

  if (isRecord(chunk.optional_slots)) {
    for (const [slotKey, value] of Object.entries(chunk.optional_slots)) {
      validateSlotValue(testCase, chunk, slotKey, value);
    }
  }
}

function validatePolicyShape(testCase) {
  const chunks = testCase.expected_chunks;
  const hasIncompleteChunk = chunks.some((chunk) => {
    return (
      Array.isArray(chunk.missing_slots) && chunk.missing_slots.length > 0
    ) || (
      isRecord(chunk.ambiguous_slots) && Object.keys(chunk.ambiguous_slots).length > 0
    );
  });
  const hasCompleteApplyChunk = chunks.some((chunk) => {
    return motionCategories.has(chunk.category) && !chunk.missing_slots && !chunk.ambiguous_slots;
  });
  const hasAmbiguousAlias = chunks.some((chunk) => Boolean(chunk.optional_slots?.ambiguous_alias));
  const hasMotionChunk = chunks.some((chunk) => motionCategories.has(chunk.category));
  const hasReadbackOnlyChunk = chunks.some((chunk) => readbackOnlyCategories.has(chunk.category));

  if (testCase.apply_policy === "PARTIAL_APPLY") {
    if (!hasIncompleteChunk) {
      addFailure(testCase.id, "partial_apply_without_incomplete_chunk");
    }

    if (!hasCompleteApplyChunk) {
      addFailure(testCase.id, "partial_apply_without_applicable_chunk");
    }
  }

  if (testCase.apply_policy === "CONFIRM_BEFORE_APPLY" && !hasIncompleteChunk && !hasAmbiguousAlias) {
    addFailure(testCase.id, "confirm_without_ambiguity");
  }

  if (testCase.apply_policy === "READBACK_ONLY") {
    if (hasMotionChunk) {
      addFailure(testCase.id, "readback_only_contains_motion_chunk");
    }

    if (!hasReadbackOnlyChunk) {
      addFailure(testCase.id, "readback_only_without_readback_category");
    }
  }

  if (testCase.apply_policy === "APPLY" && hasIncompleteChunk) {
    addFailure(testCase.id, "apply_contains_incomplete_chunk");
  }

  if (testCase.apply_policy === "NO_STATE_CHANGE" && hasMotionChunk && startsWithCallsign(testCase.raw_phrase)) {
    addFailure(testCase.id, "no_state_change_with_addressed_motion_command", {
      detail: "Addressed motion commands should usually confirm or apply after validation."
    });
  } else if (testCase.apply_policy === "NO_STATE_CHANGE" && hasMotionChunk) {
    addWarning(testCase.id, "no_state_change_motion_without_callsign", {
      detail: "Allowed for missing callsign or selected-target-disabled mode."
    });
  }
}

if (!isRecord(doc.metadata)) {
  addFailure("metadata", "missing_metadata");
}

if (!isRecord(doc.policy_labels)) {
  addFailure("policy_labels", "missing_policy_labels");
}

if (!Array.isArray(doc.test_cases)) {
  addFailure("test_cases", "test_cases_not_array");
}

const allowedApplyPolicies = new Set(Object.keys(doc.policy_labels ?? {}));
const seenIds = new Set();
const categoryCounts = new Map();
const policyCounts = new Map();

for (const testCase of doc.test_cases ?? []) {
  if (!isRecord(testCase)) {
    addFailure("test_case", "test_case_not_object");
    continue;
  }

  if (typeof testCase.id !== "string" || !testCase.id) {
    addFailure("test_case", "missing_id");
    continue;
  }

  if (seenIds.has(testCase.id)) {
    addFailure(testCase.id, "duplicate_id");
  }
  seenIds.add(testCase.id);

  if (!testCase.id.startsWith("vpt_")) {
    addWarning(testCase.id, "nonstandard_id_prefix", { expected_prefix: "vpt_" });
  }

  if (typeof testCase.raw_phrase !== "string" || !testCase.raw_phrase.trim()) {
    addFailure(testCase.id, "missing_raw_phrase");
  }

  if (!Array.isArray(testCase.expected_chunks) || testCase.expected_chunks.length === 0) {
    addFailure(testCase.id, "missing_expected_chunks");
    continue;
  }

  if (!allowedApplyPolicies.has(testCase.apply_policy)) {
    addFailure(testCase.id, "unknown_apply_policy", { apply_policy: testCase.apply_policy });
  }

  if (!allowedReadbackPolicies.has(testCase.readback_policy)) {
    addFailure(testCase.id, "unknown_readback_policy", { readback_policy: testCase.readback_policy });
  }

  if (!allowedRiskLevels.has(testCase.risk_level)) {
    addFailure(testCase.id, "unknown_risk_level", { risk_level: testCase.risk_level });
  }

  policyCounts.set(testCase.apply_policy, (policyCounts.get(testCase.apply_policy) ?? 0) + 1);

  testCase.expected_chunks.forEach((chunk, index) => {
    validateChunk(testCase, chunk, index);

    if (chunk?.category) {
      categoryCounts.set(chunk.category, (categoryCounts.get(chunk.category) ?? 0) + 1);
    }
  });

  validatePolicyShape(testCase);
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures, warnings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "ok",
  metadata_id: doc.metadata?.id,
  voice_tolerance_test_cases: doc.test_cases?.length ?? 0,
  policy_counts: Object.fromEntries([...policyCounts.entries()].sort()),
  category_counts: Object.fromEntries([...categoryCounts.entries()].sort()),
  warnings
}, null, 2));
