import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, ".scenario-presets-verify");
const presetsOutFile = path.join(outDir, "scenarioPresets.mjs");
const firstContactOutFile = path.join(outDir, "pilotFirstContact.mjs");
const storageOutFile = path.join(outDir, "scenarioStorage.mjs");
const missedApproachOutFile = path.join(outDir, "missedApproachRuntime.mjs");

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, label) {
  if (!condition) {
    throw new Error(label);
  }
}

await rm(outDir, { force: true, recursive: true });
await mkdir(outDir, { recursive: true });

for (const [entryPoint, outFile] of [
  ["src/lib/scenarioPresets.ts", presetsOutFile],
  ["src/lib/pilotFirstContact.ts", firstContactOutFile],
  ["src/lib/scenarioStorage.ts", storageOutFile],
  ["src/lib/missedApproachRuntime.ts", missedApproachOutFile]
]) {
  await build({
    absWorkingDir: rootDir,
    bundle: true,
    entryPoints: [entryPoint],
    external: [],
    format: "esm",
    outfile: outFile,
    platform: "node",
    target: "es2020"
  });
}

const {
  BUILT_IN_SCENARIO_PRESETS,
  RADIO_FLOW_HIGH_TRAFFIC_PRESET_ID
} = await import(pathToFileURL(presetsOutFile).href);
const {
  confirmMostRecentJammedCallsign,
  evaluatePilotFirstContactBatch
} = await import(pathToFileURL(firstContactOutFile).href);
const {
  applyMissedApproachCandidate,
  automaticMissedApproachCandidate
} = await import(pathToFileURL(missedApproachOutFile).href);
const {
  normalizeImportedScenarioSnapshot,
  scenarioExportEnvelopeForSnapshot,
  scenarioExportFilename,
  scenarioExportJsonForSnapshot,
  isScenarioSnapshotV1,
  retimeAircraftForScenarioLoad
} = await import(pathToFileURL(storageOutFile).href);

const preset = BUILT_IN_SCENARIO_PRESETS.find((candidate) =>
  candidate.id === RADIO_FLOW_HIGH_TRAFFIC_PRESET_ID
);

assertTrue(Boolean(preset), "R07 high-traffic radio-flow built-in preset exists");
assertEqual(preset.flow.kind, "radio", "Preset flow kind");
assertEqual(preset.flow.label, "RADIO FLOW", "Preset flow label");
assertEqual(preset.flow.trainingFocus, "first_contact_jam_sequence", "Preset training focus");
assertTrue(preset.flow.tags.includes("first_contact"), "Preset flow tags include first contact");
assertTrue(preset.flow.tags.includes("radio_jam"), "Preset flow tags include radio jam");
assertEqual(preset.snapshot.name, "R07 high traffic radio flow", "Preset display name");
assertEqual(preset.snapshot.runway, "07", "Preset runway");
assertEqual(preset.snapshot.radar.paused, true, "Preset starts paused for controller setup");
assertTrue(isScenarioSnapshotV1(preset.snapshot), "Preset is valid scenario snapshot v1");
assertEqual(preset.snapshot.aircraft.length, 5, "Preset aircraft count");
assertEqual(
  preset.snapshot.aircraft.filter((aircraft) => aircraft.pilot_first_contact?.role === "APP").length,
  3,
  "Preset includes three APP first-contact candidates"
);
assertEqual(
  preset.snapshot.aircraft.filter((aircraft) => aircraft.pilot_first_contact?.role === "DEP").length,
  1,
  "Preset includes one DEP first-contact candidate"
);
assertTrue(
  preset.snapshot.aircraft.every((aircraft) => aircraft.frequency_state !== "on_frequency"),
  "Preset aircraft do not start already on frequency"
);

const loadedAircraft = preset.snapshot.aircraft.map((aircraft) =>
  retimeAircraftForScenarioLoad(aircraft, 60_000)
);
const initialJam = evaluatePilotFirstContactBatch(
  loadedAircraft,
  preset.dataset,
  61_000
);
assertEqual(initialJam.status, "jammed", "Preset creates initial first-contact radio jam");
assertEqual(initialJam.event.callsigns.length, 3, "Preset initial jam includes three callers");

const confirmed = confirmMostRecentJammedCallsign(initialJam.aircraftTraffic, 62_000);
assertEqual(confirmed.status, "confirmed", "Preset jam can be sequenced by controller callsign query");
assertEqual(confirmed.callsign, "JJA111", "Preset jam confirmation starts with deterministic first caller");

const exportEnvelope = scenarioExportEnvelopeForSnapshot(
  preset.snapshot,
  "2026-05-27T00:00:00.000Z"
);
assertEqual(exportEnvelope.export_schema, "jeju_radar_scenario_export_v1", "Scenario export has explicit schema");
assertEqual(exportEnvelope.exportedAt, "2026-05-27T00:00:00.000Z", "Scenario export records export time");
assertEqual(exportEnvelope.summary.name, preset.snapshot.name, "Scenario export summary keeps name");
assertEqual(exportEnvelope.summary.runway, preset.snapshot.runway, "Scenario export summary keeps runway");
assertEqual(exportEnvelope.summary.aircraftCount, 5, "Scenario export summary counts aircraft");
assertEqual(exportEnvelope.summary.arrivalStreamCount, 0, "Scenario export summary counts arrival streams");
assertEqual(exportEnvelope.summary.departureWaveCount, 0, "Scenario export summary counts departure waves");
assertEqual(exportEnvelope.snapshot, preset.snapshot, "Scenario export wraps original snapshot reference");
assertEqual(
  normalizeImportedScenarioSnapshot(exportEnvelope),
  preset.snapshot,
  "Scenario import accepts export wrapper"
);
assertEqual(
  normalizeImportedScenarioSnapshot({ snapshot: preset.snapshot }),
  preset.snapshot,
  "Scenario import still accepts saved-record wrapper"
);
assertTrue(
  scenarioExportFilename(preset.snapshot).includes("R07"),
  "Scenario export filename includes runway"
);
assertTrue(
  scenarioExportFilename(preset.snapshot).endsWith(".json"),
  "Scenario export filename stays JSON"
);
const exportJson = JSON.parse(
  scenarioExportJsonForSnapshot(preset.snapshot, "2026-05-27T00:00:00.000Z")
);
assertEqual(exportJson.summary.aircraftCount, 5, "Scenario export JSON contains summary");
assertTrue(isScenarioSnapshotV1(exportJson.snapshot), "Scenario export JSON contains valid snapshot");

const missedApproachPreset = BUILT_IN_SCENARIO_PRESETS.find((candidate) =>
  candidate.flow.kind === "missed_approach"
);

assertTrue(Boolean(missedApproachPreset), "Missed approach built-in preset exists");
assertEqual(missedApproachPreset.flow.label, "MISSED APP", "Missed approach preset flow label");
assertEqual(
  missedApproachPreset.flow.trainingFocus,
  "ils_z_go_around_first_contact",
  "Missed approach preset training focus"
);
assertTrue(
  missedApproachPreset.flow.tags.includes("go_around"),
  "Missed approach preset tags include go-around"
);
assertEqual(missedApproachPreset.snapshot.runway, "07", "Missed approach preset runway");
assertEqual(
  missedApproachPreset.snapshot.traffic.scenarioForm.missedApproachProbability,
  "100",
  "Missed approach preset arms automatic missed approach"
);
assertEqual(
  missedApproachPreset.snapshot.traffic.activeDepartureWaves.length,
  1,
  "Missed approach preset includes a departure wave to retime"
);

const finalApproachAircraft = missedApproachPreset.snapshot.aircraft.find((aircraft) =>
  aircraft.approach_phase === "final" && aircraft.procedure_id === "ILS_Z_LOC_Z_RWY_07"
);

assertTrue(Boolean(finalApproachAircraft), "Missed approach preset includes final ILS Z RWY07 aircraft");

const missedCandidate = automaticMissedApproachCandidate({
  aircraft: finalApproachAircraft,
  dataset: missedApproachPreset.dataset,
  probabilityPercent: 100,
  currentTimeMs: 90_000
});

assertTrue(Boolean(missedCandidate), "Missed approach preset creates automatic missed candidate");
assertEqual(missedCandidate.profile.id, "MISSED_APPROACH_ILS_Z_RWY_07", "Missed preset candidate profile");
const missedEvent = applyMissedApproachCandidate(missedCandidate);
assertTrue(Boolean(missedEvent), "Missed approach preset candidate applies");
assertEqual(missedEvent.aircraft.next_fix, "PC404", "Missed approach preset starts toward PC404");
assertEqual(missedEvent.aircraft.scratchpad, "MA", "Missed approach preset writes MA scratchpad");
assertEqual(
  missedEvent.aircraft.pilot_first_contact.role,
  "MISSED_APP",
  "Missed approach preset hands aircraft to APP first-contact flow"
);

const missedFirstContact = evaluatePilotFirstContactBatch(
  [{ ...missedEvent.aircraft, altitude_ft: 1300 }],
  missedApproachPreset.dataset,
  92_000
);

assertEqual(missedFirstContact.status, "single", "Missed approach preset produces sequenced APP first contact");
assertEqual(missedFirstContact.event.role, "MISSED_APP", "Missed approach first contact role");
assertTrue(
  missedFirstContact.event.text.includes("missed approach"),
  "Missed approach first contact reports missed approach"
);

const handoffPreset = BUILT_IN_SCENARIO_PRESETS.find((candidate) =>
  candidate.flow.kind === "handoff"
);

assertTrue(Boolean(handoffPreset), "Handoff built-in preset exists");
assertEqual(handoffPreset.flow.label, "HANDOFF", "Handoff preset flow label");
assertEqual(
  handoffPreset.flow.trainingFocus,
  "app_twr_dep_contact_sequence",
  "Handoff preset training focus"
);
assertTrue(handoffPreset.flow.tags.includes("arrival_handoff"), "Handoff tags include arrival handoff");
assertTrue(handoffPreset.flow.tags.includes("departure_contact"), "Handoff tags include departure contact");
assertEqual(handoffPreset.snapshot.runway, "07", "Handoff preset runway");
assertEqual(handoffPreset.snapshot.aircraft.length, 2, "Handoff preset aircraft count");
assertTrue(
  handoffPreset.dataset.handoffRules.tower_handoff_reference_geometry.some((rule) =>
    rule.id === "ARR_07_LIMSO_HANDOFF"
  ),
  "Handoff preset carries ARR LIMSO handoff rule"
);
assertTrue(
  handoffPreset.dataset.handoffRules.tower_handoff_reference_geometry.some((rule) =>
    rule.id === "DEP_TWR_TO_APP_0_5NM"
  ),
  "Handoff preset carries DEP tower-to-APP handoff rule"
);
const handoffArrival = handoffPreset.snapshot.aircraft.find((aircraft) =>
  aircraft.callsign === "JJA207"
);
const handoffDeparture = handoffPreset.snapshot.aircraft.find((aircraft) =>
  aircraft.callsign === "KAL432"
);

assertTrue(Boolean(handoffArrival), "Handoff preset includes arrival aircraft");
assertEqual(handoffArrival.next_fix, "LIMSO", "Handoff arrival starts at LIMSO reference");
assertEqual(handoffArrival.frequency_state, "on_frequency", "Handoff arrival is already on APP frequency");
assertEqual(handoffArrival.scratchpad, "TWR", "Handoff arrival marks tower transfer target");
assertTrue(Boolean(handoffDeparture), "Handoff preset includes departure aircraft");
assertEqual(handoffDeparture.pilot_first_contact.role, "DEP", "Handoff departure is a DEP contact candidate");
assertEqual(handoffDeparture.frequency_state, "not_on_frequency", "Handoff departure waits for APP contact");

const handoffContact = evaluatePilotFirstContactBatch(
  handoffPreset.snapshot.aircraft,
  handoffPreset.dataset,
  60_000
);

assertEqual(handoffContact.status, "single", "Handoff preset produces a single departure contact");
assertEqual(handoffContact.event.callsign, "KAL432", "Handoff departure contacts APP first");
assertEqual(handoffContact.event.role, "DEP", "Handoff contact role");
assertTrue(
  handoffContact.event.text.includes("Jeju Departure"),
  "Handoff departure first contact uses Jeju Departure"
);

const visualPreset = BUILT_IN_SCENARIO_PRESETS.find((candidate) =>
  candidate.flow.kind === "visual_approach"
);

assertTrue(Boolean(visualPreset), "Visual approach built-in preset exists");
assertEqual(visualPreset.flow.label, "VISUAL APP", "Visual approach preset flow label");
assertEqual(
  visualPreset.flow.trainingFocus,
  "rwy07_visual_approach_condition_gate",
  "Visual approach preset training focus"
);
assertTrue(visualPreset.flow.tags.includes("visual_approach"), "Visual tags include visual approach");
assertTrue(visualPreset.flow.tags.includes("rwy07"), "Visual tags include runway 07");
assertEqual(visualPreset.snapshot.runway, "07", "Visual approach preset runway");
assertEqual(visualPreset.snapshot.aircraft.length, 2, "Visual approach preset aircraft count");
assertTrue(
  visualPreset.dataset.procedures.visual_approach_rules.some((rule) =>
    rule.id === "VISUAL_APPROACH_AIP_GENERAL"
  ),
  "Visual preset carries AIP general visual approach rule"
);
assertTrue(
  visualPreset.dataset.procedures.visual_approach_rules.some((rule) =>
    rule.id === "RWY07_VISUAL_NOISE_ABATEMENT"
  ),
  "Visual preset carries RWY07 visual alignment restriction"
);
const visualArrival = visualPreset.snapshot.aircraft.find((aircraft) =>
  aircraft.callsign === "JJA307"
);
const visualSequenceTraffic = visualPreset.snapshot.aircraft.find((aircraft) =>
  aircraft.callsign === "ABL549"
);

assertTrue(Boolean(visualArrival), "Visual preset includes target arrival");
assertEqual(visualArrival.route_mode, "vector", "Visual target arrival starts in vector mode");
assertEqual(visualArrival.frequency_state, "on_frequency", "Visual target arrival is already on APP frequency");
assertEqual(visualArrival.scratchpad, "VIS", "Visual target arrival marks visual approach");
assertEqual(visualArrival.assigned.speed_kt, 180, "Visual target speed is 180");
assertTrue(Boolean(visualSequenceTraffic), "Visual preset includes sequence traffic");
assertEqual(visualSequenceTraffic.scratchpad, "SEQ", "Visual sequence aircraft is marked for sequencing");

console.log("Scenario presets verification passed");
