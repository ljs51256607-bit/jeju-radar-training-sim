import {
  applyAcceptedAtcCommandToAircraft,
  acceptedAtcCommandIntentIsSupported,
  type AtcCommandControlUpdates
} from "./atcCommandApplication";
import {
  type ParsedAtcCommand
} from "./atcCommandParser";
import {
  pilotReadbackForParsedCommandBatch,
  type ParsedAtcCommandBatch
} from "./atcCommandBatch";
import { parsedCommandsWithHoldReadbackContext } from "./atcHoldReadbackContext";
import {
  semanticIssueForParsedCommand,
  semanticIssueSummary,
  type AtcSemanticCommandIssue
} from "./atcSemanticCommandExtractor";
import { validateAtcCommand } from "./atcCommandValidation";
import { aircraftAcceptsAtcCommands } from "./aircraftFrequency";
import {
  pilotResponseForAircraftNotOnFrequency,
  pilotResponseForMissingCallsign,
  pilotResponseForMultiCommandAccepted,
  pilotResponseForMultiCommandRejected,
  pilotResponseForNoPatternMatch,
  pilotResponseForPartialCommandAccepted,
  pilotResponseForUnknownCallsign,
  pilotResponseForValidation,
  type PilotResponse
} from "./pilotResponseLayer";
import { sanitizeCallsignInput } from "./scenarioTraffic";
import { commandActivationTimeMs } from "./simulationTickRuntime";
import type { AircraftCommandKind, AircraftState, RadarDataset } from "./types";

export interface EvaluateAtcCommandBatchArgs {
  batch: ParsedAtcCommandBatch;
  aircraftTraffic: AircraftState[];
  dataset: RadarDataset;
  magneticVariationWestDeg: number;
  activeAtMs: number;
}

export type AtcCommandBatchEvaluation =
  | {
      status: "response";
      response: PilotResponse;
      targetAircraftId?: string;
      markOnFrequencyAircraftId?: string;
    }
  | {
      status: "applied";
      response: PilotResponse;
      targetAircraftId: string;
      markOnFrequencyAircraftId: string;
      aircraft: AircraftState;
      controlUpdates: AtcCommandControlUpdates;
      appliedCommands?: ParsedAtcCommand[];
      rejectedCommands?: ParsedAtcCommand[];
    };

export function slotRequiresConfirmation(parsed: ParsedAtcCommand) {
  const cancellation = parsed.slots.cancel_level_restriction;

  return Boolean(
    parsed.slots.requires_confirmation ||
      (
        cancellation &&
        typeof cancellation === "object" &&
        "requires_confirmation" in cancellation &&
        cancellation.requires_confirmation
      )
  );
}

export function atcCommandKind(parsed: ParsedAtcCommand): AircraftCommandKind {
  switch (parsed.intent) {
    case "MAINTAIN_PRESENT_HEADING":
    case "ASSIGN_HEADING":
    case "ONE_CIRCLE_HEADING":
    case "DIRECT_TO_FIX":
    case "TURN_DIRECT_FIX":
    case "HOLD_AT_FIX":
      return "HDG";
    case "ASSIGN_SPEED":
    case "SPEED_UNTIL_FIX":
    case "SPEED_UNTIL_FIX_THEN_NORMAL":
    case "MAXIMUM_FORWARD_SPEED":
    case "MINIMUM_SPEED":
    case "MAINTAIN_SPEED_LIMIT":
    case "MAINTAIN_SPEED_UNTIL":
    case "RESUME_NORMAL_SPEED":
    case "CANCEL_SPEED_RESTRICTION":
      return "SPD";
    case "ASSIGN_ALTITUDE":
    case "CROSS_FIX_RESTRICTION":
    case "DESCEND_VIA":
      return "ALT";
    case "CLEARED_ILS":
    case "CLEARED_VISUAL_APPROACH":
      return "ILS";
    case "ASSIGN_VERTICAL_SPEED":
    case "INCREASE_DESCENT_RATE":
    case "INCREASE_CLIMB_RATE":
    case "RESUME_NORMAL_CLIMB":
    case "RESUME_NORMAL_DESCENT":
    case "EXPEDITE_DESCENT":
    case "EXPEDITE_CLIMB":
    default:
      return "VS";
  }
}

export function evaluateAtcCommandBatch({
  batch,
  aircraftTraffic,
  dataset,
  magneticVariationWestDeg,
  activeAtMs
}: EvaluateAtcCommandBatchArgs): AtcCommandBatchEvaluation {
  const commands = batch.commands;
  const firstCommand = commands[0];

  if (!firstCommand?.callsign) {
    return { status: "response", response: pilotResponseForMissingCallsign() };
  }

  const callsigns = new Set(commands.map((command) => command.callsign).filter(Boolean));

  if (callsigns.size !== 1) {
    return {
      status: "response",
      response: pilotResponseForMultiCommandRejected(
        firstCommand.callsign,
        "multi-command contains mixed callsigns"
      )
    };
  }

  const targetAircraft = aircraftTraffic.find(
    (aircraft) => sanitizeCallsignInput(aircraft.callsign) === firstCommand.callsign
  );

  if (!targetAircraft) {
    return {
      status: "response",
      response: pilotResponseForUnknownCallsign(firstCommand.callsign)
    };
  }

  if (!aircraftAcceptsAtcCommands(targetAircraft, firstCommand)) {
    return {
      status: "response",
      targetAircraftId: targetAircraft.id,
      response: pilotResponseForAircraftNotOnFrequency(firstCommand.callsign)
    };
  }

  const partialCandidate = classifyBatchCommands(commands, targetAircraft, dataset);

  if (partialCandidate.rejected.length > 0 && partialCandidate.accepted.length > 0) {
    const partialResult = applyAcceptedBatchCommands({
      commands: partialCandidate.accepted,
      targetAircraft,
      dataset,
      magneticVariationWestDeg,
      activeAtMs
    });
    const rejectedCommands = [
      ...partialCandidate.rejected.map((entry) => entry.command),
      ...partialResult.rejected.map((entry) => entry.command)
    ];

    if (partialResult.appliedCommands.length > 0) {
      const issues = [
        ...partialCandidate.rejected.map((entry) => entry.issue),
        ...partialResult.rejected.map((entry) => entry.issue)
      ];
      const readback = partialReadbackForCommands(
        firstCommand.callsign,
        partialResult.appliedCommands,
        issues,
        targetAircraft,
        magneticVariationWestDeg
      );

      return {
        status: "applied",
        targetAircraftId: targetAircraft.id,
        markOnFrequencyAircraftId: targetAircraft.id,
        aircraft: partialResult.aircraft,
        controlUpdates: partialResult.controlUpdates,
        appliedCommands: partialResult.appliedCommands,
        rejectedCommands,
        response: pilotResponseForPartialCommandAccepted(
          firstCommand.callsign,
          readback,
          `${partialResult.appliedCommands.length} commands applied; ${rejectedCommands.length} chunks not applied: ${issues.map((issue) => issue.detail).join(", ")}`
        )
      };
    }
  }

  const noPatternCommand = partialCandidate.rejected.find((entry) => !entry.command.ok || !entry.command.intent)?.command;
  if (noPatternCommand) {
    return {
      status: "response",
      targetAircraftId: targetAircraft.id,
      markOnFrequencyAircraftId: targetAircraft.id,
      response: pilotResponseForNoPatternMatch(noPatternCommand)
    };
  }

  for (const command of commands) {
    if (!acceptedAtcCommandIntentIsSupported(command)) {
      return {
        status: "response",
        targetAircraftId: targetAircraft.id,
        markOnFrequencyAircraftId: targetAircraft.id,
        response: pilotResponseForMultiCommandRejected(
          firstCommand.callsign,
          `${command.intent ?? "unknown"} is not supported inside multi-command yet`
        )
      };
    }

    const validation = validateAtcCommand(command, targetAircraft, dataset);

    if (validation.status === "say_again" || validation.status === "unable") {
      return {
        status: "response",
        targetAircraftId: targetAircraft.id,
        markOnFrequencyAircraftId: targetAircraft.id,
        response: pilotResponseForValidation(command, validation)
      };
    }

    if (validation.status === "confirm" || slotRequiresConfirmation(command)) {
      return {
        status: "response",
        targetAircraftId: targetAircraft.id,
        markOnFrequencyAircraftId: targetAircraft.id,
        response: pilotResponseForMultiCommandRejected(
          firstCommand.callsign,
          `multi-command requires separate confirmation: ${validation.detail}`
        )
      };
    }
  }

  const fullApplyResult = applyAcceptedBatchCommands({
    commands,
    targetAircraft,
    dataset,
    magneticVariationWestDeg,
    activeAtMs
  });

  if (fullApplyResult.rejected.length > 0) {
    const firstRejected = fullApplyResult.rejected[0];

    return {
      status: "response",
      targetAircraftId: targetAircraft.id,
      markOnFrequencyAircraftId: targetAircraft.id,
      response: pilotResponseForValidation(firstRejected.command, {
        status: "unable",
        detail: firstRejected.issue.detail
      })
    };
  }

  return {
    status: "applied",
    targetAircraftId: targetAircraft.id,
    markOnFrequencyAircraftId: targetAircraft.id,
    aircraft: fullApplyResult.aircraft,
    controlUpdates: fullApplyResult.controlUpdates,
    appliedCommands: fullApplyResult.appliedCommands,
    response: pilotResponseForMultiCommandAccepted(
      firstCommand.callsign,
      pilotReadbackForParsedCommandBatch(
        parsedCommandsWithHoldReadbackContext(commands, targetAircraft, magneticVariationWestDeg)
      ),
      `${commands.length} commands applied`
    )
  };
}

function classifyBatchCommands(
  commands: ParsedAtcCommand[],
  targetAircraft: AircraftState,
  dataset: RadarDataset
) {
  const accepted: ParsedAtcCommand[] = [];
  const rejected: Array<{ command: ParsedAtcCommand; issue: AtcSemanticCommandIssue }> = [];

  for (const command of commands) {
    if (!command.ok || !command.intent) {
      rejected.push({ command, issue: semanticIssueForParsedCommand(command) });
      continue;
    }

    if (!acceptedAtcCommandIntentIsSupported(command)) {
      rejected.push({
        command,
        issue: {
          kind: "unrecognized_instruction",
          detail: `${command.intent} is not supported inside multi-command yet`,
          sayAgainText: atcCommandKind(command).toLowerCase()
        }
      });
      continue;
    }

    const validation = validateAtcCommand(command, targetAircraft, dataset);

    if (validation.status !== "accepted" || slotRequiresConfirmation(command)) {
      rejected.push({
        command,
        issue: {
          kind: validation.status === "confirm" || slotRequiresConfirmation(command)
            ? "unrecognized_instruction"
            : semanticIssueForParsedCommand(command).kind,
          detail: validation.detail,
          sayAgainText: validation.status === "confirm"
            ? commandKindSayAgainText(command)
            : rejectedCommandSayAgainText(command)
        }
      });
      continue;
    }

    accepted.push(command);
  }

  return { accepted, rejected };
}

function rejectedCommandSayAgainText(command: ParsedAtcCommand) {
  const semanticIssue = semanticIssueForParsedCommand(command);

  if (semanticIssue.kind !== "unrecognized_instruction") {
    return semanticIssue.sayAgainText;
  }

  return commandKindSayAgainText(command);
}

function commandKindSayAgainText(command: ParsedAtcCommand) {
  switch (atcCommandKind(command)) {
    case "HDG":
      return "heading";
    case "SPD":
      return "speed";
    case "ALT":
      return "altitude";
    case "VS":
      return "vertical speed";
    case "ILS":
      return "approach clearance";
  }
}

function applyAcceptedBatchCommands({
  commands,
  targetAircraft,
  dataset,
  magneticVariationWestDeg,
  activeAtMs
}: {
  commands: ParsedAtcCommand[];
  targetAircraft: AircraftState;
  dataset: RadarDataset;
  magneticVariationWestDeg: number;
  activeAtMs: number;
}) {
  let nextAircraft = targetAircraft;
  const controlUpdates: AtcCommandControlUpdates = {};
  const appliedCommands: ParsedAtcCommand[] = [];
  const rejected: Array<{ command: ParsedAtcCommand; issue: AtcSemanticCommandIssue }> = [];

  for (const command of commands) {
    const commandActiveAtMs = commandActivationTimeMs(dataset, atcCommandKind(command), activeAtMs);
    const result = applyAcceptedAtcCommandToAircraft({
      aircraft: nextAircraft,
      parsed: command,
      dataset,
      magneticVariationWestDeg,
      activeAtMs: commandActiveAtMs
    });

    if (result.status !== "applied") {
      rejected.push({
        command,
        issue: {
          kind: "unrecognized_instruction",
          detail: result.detail ?? "multi-command adapter rejected command",
          sayAgainText: atcCommandKind(command).toLowerCase()
        }
      });
      continue;
    }

    nextAircraft = result.aircraft;
    Object.assign(controlUpdates, result.controlUpdates);
    appliedCommands.push(command);
  }

  return {
    aircraft: nextAircraft,
    controlUpdates,
    appliedCommands,
    rejected
  };
}

function partialReadbackForCommands(
  callsign: string,
  appliedCommands: ParsedAtcCommand[],
  issues: AtcSemanticCommandIssue[],
  targetAircraft: AircraftState,
  magneticVariationWestDeg: number
) {
  const readback = pilotReadbackForParsedCommandBatch(
    parsedCommandsWithHoldReadbackContext(appliedCommands, targetAircraft, magneticVariationWestDeg)
  );
  const issueText = semanticIssueSummary(issues);

  return `${readback}. Say again ${issueText}.`;
}
