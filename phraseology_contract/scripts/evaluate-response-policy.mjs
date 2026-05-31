import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAtcCommand } from "./parse-atc-command.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const policyPath = path.join(rootDir, "data", "pilot_response_policy.json");
const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));

function normalizePhrase(rawPhrase) {
  return rawPhrase.trim().toUpperCase().replace(/\s+/g, " ");
}

function detectCallsign(normalizedPhrase) {
  const match = normalizedPhrase.match(/^([A-Z]{2,3}\d{2,4})(?:\s+|$)/);
  return match ? match[1] : null;
}

function policyFor(condition) {
  return policy.policies.find((entry) => entry.condition === condition);
}

function detectAmbiguousAlias(body) {
  const match = body.match(/^(LEFT|RIGHT)\s+(\d{1,3})$/);

  if (!match) {
    return null;
  }

  return {
    candidate_intent: "ASSIGN_HEADING",
    candidate_instruction: `turn ${match[1].toLowerCase()} heading ${match[2]}`
  };
}

function validateParsedSlots(parsed) {
  if (typeof parsed.slots.speed_kt === "number") {
    const speedRule = policy.slot_validation.speed_kt;
    if (parsed.slots.speed_kt < speedRule.min || parsed.slots.speed_kt > speedRule.max) {
      return {
        condition: "INVALID_SLOT",
        reason: "speed_kt_out_of_range"
      };
    }
  }

  if (typeof parsed.slots.heading_deg === "number") {
    const headingRule = policy.slot_validation.heading_deg;
    if (parsed.slots.heading_deg < headingRule.min || parsed.slots.heading_deg > headingRule.max) {
      return {
        condition: "INVALID_SLOT",
        reason: "heading_deg_out_of_range"
      };
    }
  }

  if (typeof parsed.slots.altitude_ft === "number") {
    const altitudeRule = policy.slot_validation.altitude_ft;
    if (parsed.slots.altitude_ft < altitudeRule.min || parsed.slots.altitude_ft > altitudeRule.max) {
      return {
        condition: "INVALID_SLOT",
        reason: "altitude_ft_out_of_range"
      };
    }
  }

  return null;
}

export function evaluateResponsePolicy(rawPhrase, options = {}) {
  const activeCallsigns = new Set(options.activeCallsigns ?? []);
  const normalizedPhrase = normalizePhrase(rawPhrase);
  const callsign = detectCallsign(normalizedPhrase);

  if (!callsign) {
    const rule = policyFor("MISSING_CALLSIGN");
    return {
      condition: "MISSING_CALLSIGN",
      response_action: rule.response_action,
      engine_action: rule.engine_action,
      callsign: null,
      parser: null
    };
  }

  if (activeCallsigns.size > 0 && !activeCallsigns.has(callsign)) {
    const rule = policyFor("UNKNOWN_CALLSIGN");
    return {
      condition: "UNKNOWN_CALLSIGN",
      response_action: rule.response_action,
      engine_action: rule.engine_action,
      callsign,
      parser: null
    };
  }

  const parsed = parseAtcCommand(rawPhrase);

  if (!parsed.ok) {
    const body = normalizedPhrase.slice(callsign.length).trim();
    const ambiguous = detectAmbiguousAlias(body);

    if (ambiguous) {
      const rule = policyFor("AMBIGUOUS_ALIAS");
      return {
        condition: "AMBIGUOUS_ALIAS",
        response_action: rule.response_action,
        engine_action: rule.engine_action,
        callsign,
        candidate_intent: ambiguous.candidate_intent,
        candidate_instruction: ambiguous.candidate_instruction,
        parser: parsed
      };
    }

    const rule = policyFor("NO_PATTERN_MATCH_WITH_CALLSIGN");
    return {
      condition: "NO_PATTERN_MATCH_WITH_CALLSIGN",
      response_action: rule.response_action,
      engine_action: rule.engine_action,
      callsign,
      parser: parsed
    };
  }

  const slotProblem = validateParsedSlots(parsed);

  if (slotProblem) {
    const rule = policyFor(slotProblem.condition);
    return {
      condition: slotProblem.condition,
      response_action: rule.response_action,
      engine_action: rule.engine_action,
      reason: slotProblem.reason,
      callsign,
      parser: parsed
    };
  }

  if (parsed.slots.cancel_level_restriction?.requires_confirmation) {
    const rule = policyFor("REQUIRES_CONFIRMATION");
    return {
      condition: "REQUIRES_CONFIRMATION",
      response_action: rule.response_action,
      engine_action: rule.engine_action,
      callsign,
      candidate_instruction: "cancel all approach level restrictions",
      reason: parsed.slots.confirmation_required_reason,
      parser: parsed
    };
  }

  const rule = policyFor("VALIDATED_COMMAND");
  return {
    condition: "VALIDATED_COMMAND",
    response_action: rule.response_action,
    engine_action: rule.engine_action,
    callsign,
    parser: parsed
  };
}

if (process.argv[1] === __filename) {
  const phrase = process.argv.slice(2).join(" ");

  if (!phrase) {
    console.error("Usage: node evaluate-response-policy.mjs \"JJA123 DESCEND 6000\"");
    process.exit(2);
  }

  console.log(JSON.stringify(evaluateResponsePolicy(phrase, {
    activeCallsigns: ["JJA123", "KAL481"]
  }), null, 2));
}
