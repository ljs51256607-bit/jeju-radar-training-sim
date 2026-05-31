import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const grammarPath = path.join(rootDir, "data", "atc_command_grammar.json");
const MINIMUM_SPEED_TARGET_KT = 155;

const placeholderRegex = new Map([
  ["heading_deg", "(?<heading_deg>\\d{1,3})"],
  ["speed_kt", "(?<speed_kt>\\d{2,3})"],
  ["altitude_ft", "(?<altitude_ft>\\d{3,5})"],
  ["vertical_rate_fpm", "(?<vertical_rate_fpm>-?\\d{3,4})"],
  ["fix_id", "(?<fix_id>[A-Z0-9]{2,6})"],
  ["turn_direction", "(?<turn_direction>LEFT|RIGHT)"],
  ["leg_time_minutes", "(?<leg_time_minutes>\\d+(?:\\.\\d+)?)"],
  ["runway", "(?<runway>\\d{2}[LRC]?)"],
  ["approach_variant", "(?<approach_variant>Z|Y)"],
  ["procedure_compact", "(?<procedure_compact>\\d+[A-Z])"],
  ["procedure_number_word", "(?<procedure_number_word>ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE)"],
  ["procedure_suffix_word", "(?<procedure_suffix_word>PAPA|MIKE|ECHO|WHISKEY|NOVEMBER|KILO|LIMA|YANKEE|ZULU)"],
  ["procedure_id", "(?<procedure_id>[A-Z0-9_\\-]+)"],
  ["reason", "(?<reason>.+)"]
]);

function loadGrammar() {
  return JSON.parse(fs.readFileSync(grammarPath, "utf8"));
}

function normalizePhrase(rawPhrase) {
  return rawPhrase.trim().toUpperCase().replace(/\s+/g, " ");
}

function splitCallsign(normalizedPhrase) {
  const match = normalizedPhrase.match(/^([A-Z]{2,3}\d{2,4})\s+(.+)$/);

  if (!match) {
    return {
      callsign: null,
      body: normalizedPhrase
    };
  }

  return {
    callsign: match[1],
    body: match[2]
  };
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePattern(pattern) {
  const parts = [];
  let cursor = 0;
  const placeholderPattern = /\{([a-zA-Z0-9_]+)\}/g;
  let match;

  while ((match = placeholderPattern.exec(pattern)) !== null) {
    parts.push(escapeRegex(pattern.slice(cursor, match.index)));
    const placeholderName = match[1];
    parts.push(placeholderRegex.get(placeholderName) ?? `(?<${placeholderName}>[A-Z0-9_\\-]+)`);
    cursor = match.index + match[0].length;
  }

  parts.push(escapeRegex(pattern.slice(cursor)));

  return new RegExp(`^${parts.join("")}$`, "i");
}

function coerceSlots(groups = {}) {
  const slots = {};

  for (const [key, value] of Object.entries(groups)) {
    if (value === undefined || value === "") {
      continue;
    }

    if (["heading_deg", "speed_kt", "altitude_ft", "vertical_rate_fpm"].includes(key)) {
      slots[key] = Number.parseInt(value, 10);
    } else if (key === "leg_time_minutes") {
      slots[key] = Number.parseFloat(value);
    } else {
      slots[key] = value.toUpperCase();
    }
  }

  return slots;
}

function cancelLevelRestrictionPolicy(scope, fixId = null, requiresConfirmation = false) {
  return {
    scope,
    ...(fixId ? { fix_id: fixId } : {}),
    requires_confirmation: requiresConfirmation
  };
}

function cancelSpeedRestrictionPolicy(scope, fixId = null, requiresConfirmation = false) {
  return {
    scope,
    ...(fixId ? { fix_id: fixId } : {}),
    requires_confirmation: requiresConfirmation
  };
}

function applySemanticModifiers(parsed) {
  if (parsed.intent === "MAINTAIN_SPEED_LIMIT") {
    const matchedPattern = parsed.matched_pattern ?? "";
    const direction = matchedPattern.includes("OR LESS") ? "or_less" : "or_greater";

    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        speed_limit_direction: direction,
        speed_policy: {
          type: direction === "or_less" ? "maximum_speed_ceiling" : "minimum_speed_floor",
          comparator: direction,
          speed_kt: parsed.slots.speed_kt
        }
      }
    };
  }

  if (parsed.intent === "ASSIGN_SPEED") {
    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        speed_policy: {
          type: "target",
          speed_kt: parsed.slots.speed_kt
        }
      }
    };
  }

  if (parsed.intent === "MINIMUM_SPEED") {
    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        speed_kt: MINIMUM_SPEED_TARGET_KT,
        speed_policy: {
          type: "minimum_practical_speed",
          speed_kt: MINIMUM_SPEED_TARGET_KT,
          note: "controller command to reduce toward practical minimum speed, not an OR GREATER floor"
        }
      }
    };
  }

  if (parsed.intent === "MAINTAIN_SPEED_UNTIL") {
    const releaseCondition = typeof parsed.slots.altitude_ft === "number"
      ? {
          type: "passing_altitude",
          altitude_ft: parsed.slots.altitude_ft
        }
      : typeof parsed.slots.fix_id === "string"
        ? {
            type: "passing_fix",
            fix_id: parsed.slots.fix_id
          }
        : null;

    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        release_condition: releaseCondition,
        release_condition_text: speedReleaseConditionText(releaseCondition),
        speed_policy: {
          type: "minimum_speed_floor",
          comparator: "or_greater",
          speed_kt: parsed.slots.speed_kt,
          release_condition: releaseCondition
        }
      }
    };
  }

  if (parsed.intent === "CANCEL_LEVEL_RESTRICTION") {
    const fixId = typeof parsed.slots.fix_id === "string" ? parsed.slots.fix_id : null;
    const policy = fixId
      ? cancelLevelRestrictionPolicy("APP_FIX", fixId)
      : cancelLevelRestrictionPolicy("APP_ALL", null, true);

    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        cancel_level_restriction: policy,
        constraint_policy: {
          lateral_path: "preserve",
          speed_restrictions: "preserve",
          altitude_restrictions: fixId
            ? {
                app_fix: "cancel",
                app_other_fixes: "preserve",
                final_glidepath: "preserve",
                assigned_target_altitude: "preserve"
              }
            : {
                app_all: "cancel_if_confirmed",
                final_glidepath: "preserve",
                assigned_target_altitude: "preserve"
              }
        },
        ...(fixId
          ? {}
          : {
              confirmation_required_reason:
                "missing fix scope for approach level restriction cancellation"
            })
      }
    };
  }

  if (parsed.intent === "CANCEL_SPEED_RESTRICTION") {
    const fixId = typeof parsed.slots.fix_id === "string" ? parsed.slots.fix_id : null;

    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        cancel_speed_restriction: fixId
          ? cancelSpeedRestrictionPolicy("FIX", fixId)
          : cancelSpeedRestrictionPolicy("ACTIVE_NEXT", null, true),
        ...(fixId
          ? {}
          : {
              confirmation_required_reason:
                "missing fix scope for speed restriction cancellation"
            })
      }
    };
  }

  if (parsed.intent === "DIRECT_TO_FIX") {
    const matchedPattern = parsed.matched_pattern ?? "";

    if (!matchedPattern.includes("CANCEL LEVEL")) {
      return parsed;
    }

    const fixId = typeof parsed.slots.fix_id === "string" ? parsed.slots.fix_id : null;

    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        cancel_level_restriction: cancelLevelRestrictionPolicy("DIRECT_FIX", fixId),
        constraint_policy: {
          lateral_path: "direct",
          speed_restrictions: "none",
          altitude_restrictions: "cancel_previous_procedure_restrictions"
        }
      }
    };
  }

  if (parsed.intent !== "DESCEND_VIA") {
    return parsed;
  }

  const matchedPattern = parsed.matched_pattern ?? "";
  const cancelLevelRestriction = matchedPattern.includes("CANCEL LEVEL");
  const hasArrivalProcedure =
    typeof parsed.slots.fix_id === "string" &&
    ((typeof parsed.slots.procedure_number_word === "string" &&
      typeof parsed.slots.procedure_suffix_word === "string") ||
      typeof parsed.slots.procedure_compact === "string");

  return {
    ...parsed,
    slots: {
      ...parsed.slots,
      ...(hasArrivalProcedure ? { procedure_kind: "ARRIVAL" } : {}),
      constraint_policy: {
        lateral_path: "follow",
        speed_restrictions: "follow",
        altitude_restrictions: cancelLevelRestriction
          ? {
              star: "cancel",
              app: "preserve",
              assigned_target_altitude: "preserve"
            }
          : {
              star: "follow",
              app: "preserve",
              assigned_target_altitude: "preserve"
            }
      },
      ...(cancelLevelRestriction
        ? {
            cancel_level_restriction: cancelLevelRestrictionPolicy("STAR")
          }
        : {})
    }
  };
}

function speedReleaseConditionText(value) {
  if (!value || typeof value !== "object") {
    return "release";
  }

  if (value.type === "passing_altitude" && typeof value.altitude_ft === "number") {
    return `passing ${value.altitude_ft}`;
  }

  if (value.type === "passing_fix" && typeof value.fix_id === "string") {
    return value.fix_id;
  }

  return "release";
}

export function parseAtcCommand(rawPhrase, grammar = loadGrammar()) {
  const normalizedPhrase = normalizePhrase(rawPhrase);
  const { callsign, body } = splitCallsign(normalizedPhrase);

  for (const grammarEntry of grammar.patterns) {
    for (const pattern of grammarEntry.patterns) {
      const regex = compilePattern(pattern);
      const match = body.match(regex);

      if (!match) {
        continue;
      }

      return applySemanticModifiers({
        ok: true,
        callsign,
        intent: grammarEntry.intent,
        category: grammarEntry.category,
        pattern_id: grammarEntry.id,
        matched_pattern: pattern,
        slots: coerceSlots(match.groups)
      });
    }
  }

  return {
    ok: false,
    callsign,
    intent: null,
    category: null,
    pattern_id: null,
    matched_pattern: null,
    slots: {},
    error: "NO_PATTERN_MATCH"
  };
}

if (process.argv[1] === __filename) {
  const phrase = process.argv.slice(2).join(" ");

  if (!phrase) {
    console.error("Usage: node parse-atc-command.mjs \"JJA123 DESCEND 6000\"");
    process.exit(2);
  }

  console.log(JSON.stringify(parseAtcCommand(phrase), null, 2));
}
