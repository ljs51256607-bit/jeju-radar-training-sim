import { build } from "esbuild";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, ".procedure-guidance-verify");
const outFile = path.join(outDir, "procedureGuidance.mjs");
const motionOutFile = path.join(outDir, "aircraftMotion.mjs");
const commandAdapterOutFile = path.join(outDir, "aircraftCommandAdapter.mjs");

function readJson(relativePath) {
  return readFile(path.join(rootDir, relativePath), "utf8").then(JSON.parse);
}

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

function readWorkspaceJson(relativePath) {
  return readFile(path.join(rootDir, "..", relativePath), "utf8").then(JSON.parse);
}

function normalizeFixId(fixId) {
  return fixId.trim().toUpperCase();
}

function parseProcedureRouteText(routeText = "") {
  return routeText
    .split("-")
    .map((routePart) => normalizeFixId(routePart))
    .filter((routePart) => routePart && !/^\d/.test(routePart) && !/\bFT\b/.test(routePart));
}

function aircraftAtFix(fix, overrides = {}) {
  return {
    id: "VERIFY",
    callsign: "VERIFY",
    aircraft_type: "B738",
    flight_phase: "arrival",
    latitude: fix.latitude,
    longitude: fix.longitude,
    heading_true_deg: 0,
    ground_speed_kt: 360,
    altitude_ft: 8000,
    vertical_rate_fpm: 0,
    route_mode: "vector",
    assigned: { altitude_ft: 8000 },
    ...overrides
  };
}

await rm(outDir, { force: true, recursive: true });
await mkdir(outDir, { recursive: true });

await build({
  absWorkingDir: rootDir,
  bundle: true,
  entryPoints: ["src/lib/procedureGuidance.ts"],
  external: [],
  format: "esm",
  outfile: outFile,
  platform: "node",
  target: "es2020"
});

await build({
  absWorkingDir: rootDir,
  bundle: true,
  entryPoints: ["src/lib/aircraftMotion.ts"],
  external: [],
  format: "esm",
  outfile: motionOutFile,
  platform: "node",
  target: "es2020"
});

await build({
  absWorkingDir: rootDir,
  bundle: true,
  entryPoints: ["src/lib/aircraftCommandAdapter.ts"],
  external: [],
  format: "esm",
  outfile: commandAdapterOutFile,
  platform: "node",
  target: "es2020"
});

const [
  { guideAircraftAlongRoute, resolveDirectFix },
  { advanceAircraftForRadarSweep, destinationPoint, distanceNmBetweenPoints, distanceNmForSeconds, initialBearingTrueDeg },
  { applyScopedLevelRestrictionCancellation },
  procedures,
  videomapLabels,
  referencePoints,
  performanceProfiles,
  flightProfiles,
  verticalProfiles
] =
  await Promise.all([
    import(pathToFileURL(outFile).href),
    import(pathToFileURL(motionOutFile).href),
    import(pathToFileURL(commandAdapterOutFile).href),
    readJson("public/reference/rkpc_procedures.json"),
    readJson("public/geometry/videomap_labels.json"),
    readJson("public/reference/rkpc_reference_points.json"),
    readWorkspaceJson("data/reference/aircraft_performance_profiles.json"),
    readWorkspaceJson("data/reference/rkpc_flight_profiles.json"),
    readWorkspaceJson("data/reference/rkpc_vertical_profiles.json")
  ]);

const dataset = {
  procedures,
  videomapLabels,
  geometry: { reference_points: referencePoints.reference_points },
  flightProfiles,
  verticalProfiles,
  aircraftPerformanceProfiles: performanceProfiles
};

const fix = (fixId) => {
  const result = resolveDirectFix(dataset, fixId);

  if (!result) {
    throw new Error(`${fixId} coordinate missing`);
  }

  return result;
};

const dotolStar = procedures.stars.find((procedure) => procedure.id === "RNAV_DOTOL_2P");
const akponSid = procedures.sids.find((procedure) => procedure.id === "RNAV_AKPON_1E");
const ils07 = procedures.approaches.find((procedure) => procedure.id === "ILS_Z_LOC_Z_RWY_07");
const ils25 = procedures.approaches.find((procedure) => procedure.id === "ILS_Z_LOC_Z_RWY_25");

if (!dotolStar || !akponSid || !ils07 || !ils25) {
  throw new Error("Required procedure record missing");
}

const requiredCurrentAipProcedures = [
  ["RNAV_DOTOL_2M", "stars"],
  ["RNAV_UPGOS_2M", "stars"],
  ["RNAV_TAMNA_2M", "stars"],
  ["RNAV_TOSAN_2M", "stars"],
  ["RNAV_SOSDO_2M", "stars"],
  ["RNAV_LIMDI_2M", "stars"],
  ["RNAV_KAMIT_1W", "sids"],
  ["RNAV_AKPON_1W", "sids"],
  ["RNAV_KAMIT_2N", "sids"],
  ["RNAV_AKPON_1N", "sids"]
];

for (const [procedureId, collectionName] of requiredCurrentAipProcedures) {
  const procedure = procedures[collectionName].find((candidate) => candidate.id === procedureId);
  assertTrue(Boolean(procedure), `${procedureId} procedure exists`);
  const route = parseProcedureRouteText(procedure.route_text);
  assertTrue(route.length > 0, `${procedureId} route is not empty`);
  for (const fixId of route) {
    fix(fixId);
  }
}

const splitDepartureSidExpectations = [
  ["25", "KAMIT", "RNAV_KAMIT_1W"],
  ["31", "KAMIT", "RNAV_KAMIT_2N"],
  ["25", "AKPON", "RNAV_AKPON_1W"],
  ["31", "AKPON", "RNAV_AKPON_1N"]
];

for (const [runway, exitFix, expectedSidId] of splitDepartureSidExpectations) {
  const selectedSid = procedures.sids.find((procedure) => {
    const route = parseProcedureRouteText(procedure.route_text);

    return procedure.runway === runway && route[route.length - 1] === exitFix;
  });

  assertTrue(Boolean(selectedSid), `RWY${runway} ${exitFix} split departure SID exists`);
  assertEqual(selectedSid.id, expectedSidId, `RWY${runway} ${exitFix} split departure SID`);
}

for (const fixId of ["YUMIN", "LIMSO", "RW070", "DUKAL", "TOKIN", "RW250"]) {
  fix(fixId);
}

const starRoute = parseProcedureRouteText(dotolStar.route_text).slice(
  parseProcedureRouteText(dotolStar.route_text).indexOf("DAKPI")
);
const dotolRoute = parseProcedureRouteText(dotolStar.route_text);
const starIlsRoute = [...starRoute, "LIMSO", "RW070"];
const rwy25IlsRoute = ["DUKAL", "TOKIN", "RW250"];
const sidRoute = parseProcedureRouteText(akponSid.route_text);
assertTrue(parseProcedureRouteText(dotolStar.route_text).includes("PC726"), "DOTOL 2P retains PC726");
const performance = performanceProfiles.profiles.find(
  (profile) => profile.id === performanceProfiles.default_profile_id
);
const now = 1_700_000_000_000;

if (!performance) {
  throw new Error("Default performance profile missing");
}

let motionAircraft = aircraftAtFix(fix("DAKPI"), {
  heading_true_deg: 0,
  assigned: { heading_true_deg: 90 },
  heading_active_at_ms: now + 10_000
});
motionAircraft = advanceAircraftForRadarSweep(motionAircraft, 3, { currentTimeMs: now, performance });
assertEqual(motionAircraft.heading_true_deg, 0, "HDG pending keeps actual heading");

motionAircraft = aircraftAtFix(fix("DAKPI"), {
  heading_true_deg: 0,
  assigned: { heading_true_deg: 90 },
  heading_active_at_ms: now - 1
});
motionAircraft = advanceAircraftForRadarSweep(motionAircraft, 3, { currentTimeMs: now, performance });
assertTrue(
  motionAircraft.heading_true_deg > 0 && motionAircraft.heading_true_deg < 90,
  "HDG active turns gradually, not instantly"
);

motionAircraft = aircraftAtFix(fix("DAKPI"), {
  ground_speed_kt: 250,
  assigned: { speed_kt: 190 },
  speed_active_at_ms: now - 1
});
motionAircraft = advanceAircraftForRadarSweep(motionAircraft, 3, { currentTimeMs: now, performance });
assertTrue(
  motionAircraft.indicated_speed_kt < 250 && motionAircraft.indicated_speed_kt > 190,
  "SPD active changes indicated speed gradually, not instantly"
);
assertTrue(
  motionAircraft.ground_speed_kt > motionAircraft.indicated_speed_kt,
  "SPD model keeps radar ground speed altitude-adjusted above IAS"
);

motionAircraft = aircraftAtFix(fix("DAKPI"), {
  altitude_ft: 8000,
  vertical_rate_fpm: 0,
  assigned: { altitude_ft: 10000 },
  altitude_active_at_ms: now - 1
});
motionAircraft = advanceAircraftForRadarSweep(motionAircraft, 3, { currentTimeMs: now, performance });
assertTrue(
  motionAircraft.altitude_ft > 8000 && motionAircraft.vertical_rate_fpm > 0,
  "ALT active starts climb toward assigned altitude"
);

const dotolToPc726Bearing = initialBearingTrueDeg(
  fix("DOTOL").latitude,
  fix("DOTOL").longitude,
  fix("PC726").latitude,
  fix("PC726").longitude
);
const beforePc72610Nm = destinationPoint(
  fix("PC726").latitude,
  fix("PC726").longitude,
  reciprocalHeading(dotolToPc726Bearing),
  10
);
let starPlannerNativeAircraft = aircraftAtFix(beforePc72610Nm, {
  route_mode: "procedure",
  next_fix: "PC726",
  procedure_id: "RNAV_DOTOL_2P",
  procedure_kind: "STAR",
  procedure_route: dotolRoute,
  procedure_route_index: dotolRoute.indexOf("PC726"),
  heading_true_deg: dotolToPc726Bearing,
  altitude_ft: 12000,
  indicated_speed_kt: 285,
  ground_speed_kt: 285,
  assigned: { altitude_ft: 9000 },
  altitude_control_mode: "managed",
  vertical_rate_control_mode: "managed",
  vertical_procedure_mode: "des_via",
  star_via_clearance_altitude_ft: 9000,
  scratchpad_auto_direct_token: "726",
  scratchpad_auto_procedure_token: "STAR"
});
starPlannerNativeAircraft = guideAircraftAlongRoute(starPlannerNativeAircraft, dataset, 3, {
  currentTimeMs: now,
  performance
});
assertEqual(
  starPlannerNativeAircraft.guidance_status.mode,
  "star_des_via",
  "STAR DES VIA uses planner-native guidance mode"
);
assertEqual(
  starPlannerNativeAircraft.execution_altitude_ft,
  10000,
  "STAR DES VIA high-speed profile protects A100 speed gate before PC726 descent"
);
assertEqual(
  starPlannerNativeAircraft.execution_speed_kt,
  250,
  "STAR DES VIA high-speed profile commands 250 kt before descending below A100"
);
assertEqual(
  starPlannerNativeAircraft.managed_altitude_constraint_fix,
  "PC726",
  "STAR DES VIA speed gate keeps pending PC726 constraint context"
);

const manbaToPc621Bearing = initialBearingTrueDeg(
  fix("MANBA").latitude,
  fix("MANBA").longitude,
  fix("PC621").latitude,
  fix("PC621").longitude
);
const beforePc6213Nm = destinationPoint(
  fix("PC621").latitude,
  fix("PC621").longitude,
  reciprocalHeading(manbaToPc621Bearing),
  3
);
let starCarryForwardAircraft = aircraftAtFix(beforePc6213Nm, {
  route_mode: "procedure",
  next_fix: "PC621",
  procedure_id: "RNAV_DOTOL_2P",
  procedure_kind: "STAR",
  procedure_route: dotolRoute,
  procedure_route_index: dotolRoute.indexOf("PC621"),
  heading_true_deg: manbaToPc621Bearing,
  altitude_ft: 7200,
  indicated_speed_kt: 249,
  ground_speed_kt: 249,
  assigned: { altitude_ft: 4000 },
  altitude_control_mode: "managed",
  vertical_rate_control_mode: "managed",
  vertical_procedure_mode: "des_via",
  star_via_clearance_altitude_ft: 4000,
  scratchpad_auto_direct_token: "621",
  scratchpad_auto_procedure_token: "STAR"
});
starCarryForwardAircraft = guideAircraftAlongRoute(starCarryForwardAircraft, dataset, 3, {
  currentTimeMs: now,
  performance
});
assertEqual(
  starCarryForwardAircraft.managed_altitude_constraint_fix,
  "PC621",
  "STAR DES VIA planner carries prior altitude restriction to active point-merge fix"
);
assertEqual(
  starCarryForwardAircraft.execution_altitude_ft,
  7000,
  "STAR DES VIA planner carries BIROM 7000 through PC621"
);
assertEqual(
  starCarryForwardAircraft.execution_speed_kt,
  220,
  "STAR DES VIA planner carries MANBA 220 through PC621"
);

let profileGateAircraft = aircraftAtFix(fix("DAKPI"), {
  altitude_ft: 12000,
  indicated_speed_kt: 300,
  ground_speed_kt: 300,
  vertical_rate_fpm: -1500,
  assigned: { altitude_ft: 6000, vertical_rate_fpm: -1500 },
  altitude_active_at_ms: now - 1,
  vertical_rate_active_at_ms: now - 1
});
let profileGateCrossed = false;

for (let step = 0; step < 90; step += 1) {
  profileGateAircraft = guideAircraftAlongRoute(profileGateAircraft, dataset, 3, {
    currentTimeMs: now + step * 3_000,
    performance
  });

  if (profileGateAircraft.altitude_ft <= 10000) {
    profileGateCrossed = true;
    assertTrue(
      profileGateAircraft.indicated_speed_kt <= 251,
      "Flight-profile speed gate is satisfied before descending through A100"
    );
    break;
  }
}

assertTrue(profileGateCrossed, "Flight-profile speed gate eventually allows descent below A100");

let aircraft = aircraftAtFix(fix("DAKPI"), {
  route_mode: "direct",
  next_fix: "DAKPI",
  scratchpad_auto_direct_token: "DAK"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3);
assertEqual(aircraft.route_mode, "vector", "DCT reached route_mode");
assertEqual(aircraft.next_fix, undefined, "DCT reached next_fix");
assertEqual(aircraft.scratchpad_auto_direct_token, undefined, "DCT reached direct token");

aircraft = aircraftAtFix(fix("DAKPI"), {
  route_mode: "procedure",
  next_fix: "DAKPI",
  procedure_kind: "STAR",
  procedure_route: starRoute,
  procedure_route_index: 0,
  scratchpad_auto_direct_token: "DAK",
  scratchpad_auto_procedure_token: "STAR"
});
let pendingAircraft = guideAircraftAlongRoute(
  {
    ...aircraft,
    guidance_active_at_ms: now + 100_000
  },
  dataset,
  3,
  { currentTimeMs: now, performance }
);
assertEqual(pendingAircraft.next_fix, "DAKPI", "STAR pending keeps next_fix");
assertEqual(pendingAircraft.procedure_route_index, 0, "STAR pending keeps route_index");

aircraft = guideAircraftAlongRoute(aircraft, dataset, 3);
assertEqual(aircraft.route_mode, "procedure", "STAR DAKPI route_mode");
assertEqual(aircraft.next_fix, "PC628", "STAR DAKPI next_fix");
assertEqual(aircraft.procedure_route_index, 1, "STAR DAKPI route_index");

aircraft = aircraftAtFix(fix("PIMIK"), {
  route_mode: "procedure",
  next_fix: "PIMIK",
  procedure_kind: "STAR",
  procedure_route: starRoute,
  procedure_route_index: starRoute.indexOf("PIMIK"),
  scratchpad_auto_direct_token: "DAK",
  scratchpad_auto_procedure_token: "STAR"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3);
assertEqual(aircraft.next_fix, "YUMIN", "STAR PIMIK next_fix");

aircraft = aircraftAtFix(fix("YUMIN"), {
  route_mode: "procedure",
  next_fix: "YUMIN",
  procedure_kind: "APP",
  procedure_route: starIlsRoute,
  procedure_route_index: starIlsRoute.indexOf("YUMIN"),
  scratchpad_auto_direct_token: "DAK",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3);
assertEqual(aircraft.route_mode, "procedure", "STAR-ILS YUMIN route_mode");
assertEqual(aircraft.next_fix, "LIMSO", "STAR-ILS YUMIN next_fix");

aircraft = aircraftAtFix(fix("YUMIN"), {
  route_mode: "procedure",
  next_fix: "YUMIN",
  procedure_id: "ILS_Z_LOC_Z_RWY_07",
  procedure_kind: "APP",
  procedure_route: starIlsRoute,
  procedure_route_index: starIlsRoute.indexOf("YUMIN"),
  altitude_ft: 4500,
  scratchpad_auto_direct_token: "DAK",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3);
assertEqual(aircraft.route_mode, "procedure", "ILS RWY07 YUMIN 4500 crossing keeps procedure mode");
assertEqual(aircraft.next_fix, "LIMSO", "ILS RWY07 YUMIN 4500 crossing advances to LIMSO");
assertEqual(aircraft.procedure_route_index, starIlsRoute.indexOf("LIMSO"), "ILS RWY07 YUMIN 4500 crossing advances route index");
assertEqual(aircraft.approach_phase, "intermediate", "ILS RWY07 YUMIN 4500 crossing enters intermediate segment");

const limso = fix("LIMSO");
const rwy07Threshold = fix("RW070");
const yuminToLimsoBearing = initialBearingTrueDeg(
  fix("YUMIN").latitude,
  fix("YUMIN").longitude,
  limso.latitude,
  limso.longitude
);
const pimikToYuminBearing = initialBearingTrueDeg(
  fix("PIMIK").latitude,
  fix("PIMIK").longitude,
  fix("YUMIN").latitude,
  fix("YUMIN").longitude
);
const rwy07FinalCourse = initialBearingTrueDeg(
  limso.latitude,
  limso.longitude,
  rwy07Threshold.latitude,
  rwy07Threshold.longitude
);
const beforeYuminAltitudeGuard = destinationPoint(
  fix("YUMIN").latitude,
  fix("YUMIN").longitude,
  reciprocalHeading(pimikToYuminBearing),
  0.1
);
aircraft = aircraftAtFix(beforeYuminAltitudeGuard, {
  route_mode: "procedure",
  next_fix: "YUMIN",
  procedure_id: "ILS_Z_LOC_Z_RWY_07",
  procedure_kind: "APP",
  procedure_route: ["YUMIN", "LIMSO", "RW070"],
  procedure_route_index: 0,
  heading_true_deg: pimikToYuminBearing,
  ground_speed_kt: 190,
  altitude_ft: 4050,
  vertical_rate_fpm: -1500,
  assigned: { altitude_ft: 4000 },
  altitude_active_at_ms: now + 10_000,
  scratchpad_auto_direct_token: "YUM",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3, { currentTimeMs: now, performance });
assertTrue(
  aircraft.altitude_ft >= 4000,
  "ILS RWY07 pending ALT does not descend below YUMIN 4000 before IAF capture"
);
const beforeYuminMaintainGuard = destinationPoint(
  fix("YUMIN").latitude,
  fix("YUMIN").longitude,
  reciprocalHeading(pimikToYuminBearing),
  0.4
);
aircraft = aircraftAtFix(beforeYuminMaintainGuard, {
  route_mode: "procedure",
  next_fix: "YUMIN",
  procedure_id: "ILS_Z_LOC_Z_RWY_07",
  procedure_kind: "APP",
  procedure_route: ["YUMIN", "LIMSO", "RW070"],
  procedure_route_index: 0,
  heading_true_deg: pimikToYuminBearing,
  ground_speed_kt: 203,
  altitude_ft: 4000,
  vertical_rate_fpm: 0,
  assigned: { altitude_ft: 4000 },
  altitude_control_mode: "managed",
  vertical_rate_control_mode: "managed",
  vertical_procedure_mode: "approach",
  scratchpad_auto_direct_token: "YUM",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3, { currentTimeMs: now, performance });
assertTrue(
  aircraft.altitude_ft >= 4000,
  "ILS RWY07 maintain A040 must not start LIMSO descent before YUMIN capture"
);
const beforeYuminSpeedLookahead = destinationPoint(
  fix("YUMIN").latitude,
  fix("YUMIN").longitude,
  reciprocalHeading(pimikToYuminBearing),
  7
);
aircraft = assertProcedureSpeedBeforeFix(
  aircraftAtFix(beforeYuminSpeedLookahead, {
    route_mode: "procedure",
    next_fix: "YUMIN",
    procedure_id: "ILS_Z_LOC_Z_RWY_07",
    procedure_kind: "APP",
    procedure_route: ["YUMIN", "LIMSO", "RW070"],
    procedure_route_index: 0,
    heading_true_deg: pimikToYuminBearing,
    indicated_speed_kt: 230,
    ground_speed_kt: 230,
    altitude_ft: 4000,
    assigned: { altitude_ft: 4000 },
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed",
    vertical_procedure_mode: "approach",
    scratchpad_auto_direct_token: "YUM",
    scratchpad_auto_procedure_token: "ILS"
  }),
  "YUMIN",
  196,
  "ILS RWY07 reaches setup speed before YUMIN capture"
);
const beforeYuminControllerAltitude = destinationPoint(
  fix("YUMIN").latitude,
  fix("YUMIN").longitude,
  reciprocalHeading(pimikToYuminBearing),
  10
);
let controllerAltitudeIlsAircraft = aircraftAtFix(beforeYuminControllerAltitude, {
  route_mode: "procedure",
  next_fix: "YUMIN",
  procedure_id: "ILS_Z_LOC_Z_RWY_07",
  procedure_kind: "APP",
  procedure_route: ["YUMIN", "LIMSO", "RW070"],
  procedure_route_index: 0,
  heading_true_deg: pimikToYuminBearing,
  indicated_speed_kt: 220,
  ground_speed_kt: 220,
  altitude_ft: 8000,
  assigned: { altitude_ft: 4000, speed_kt: 220 },
  altitude_control_mode: "controller",
  vertical_procedure_mode: "controller",
  speed_control_mode: "controller",
  controller_assigned_speed_kt: 220,
  scratchpad_auto_direct_token: "YUM",
  scratchpad_auto_procedure_token: "ILS"
});
const expectedYuminCrossingRateFpm = (8000 - 4000) / (10 / (220 / 60));
controllerAltitudeIlsAircraft = guideAircraftAlongRoute(controllerAltitudeIlsAircraft, dataset, 3, {
  currentTimeMs: now,
  performance
});
assertEqual(
  controllerAltitudeIlsAircraft.altitude_control_mode,
  "managed",
  "ILS RWY07 adopts YUMIN 4000 controller altitude as approach crossing clearance"
);
assertEqual(
  controllerAltitudeIlsAircraft.vertical_procedure_mode,
  "approach",
  "ILS RWY07 resumes managed approach VNAV after adopting YUMIN crossing altitude"
);
assertTrue(
  controllerAltitudeIlsAircraft.execution_vertical_rate_fpm < 0,
  "ILS RWY07 computes descent from 8000 to YUMIN 4000"
);
assertTrue(
  Math.abs(Math.abs(controllerAltitudeIlsAircraft.managed_vertical_rate_fpm) - expectedYuminCrossingRateFpm) < 100,
  "ILS RWY07 computes distance-based descent rate for YUMIN 4000"
);

let controllerAltitudeOverrideAircraft = aircraftAtFix(beforeYuminControllerAltitude, {
  route_mode: "procedure",
  next_fix: "YUMIN",
  procedure_id: "ILS_Z_LOC_Z_RWY_07",
  procedure_kind: "APP",
  procedure_route: ["YUMIN", "LIMSO", "RW070"],
  procedure_route_index: 0,
  heading_true_deg: pimikToYuminBearing,
  indicated_speed_kt: 220,
  ground_speed_kt: 220,
  altitude_ft: 8000,
  assigned: { altitude_ft: 3000, speed_kt: 220 },
  altitude_control_mode: "controller",
  vertical_procedure_mode: "controller",
  speed_control_mode: "controller",
  controller_assigned_speed_kt: 220,
  scratchpad_auto_direct_token: "YUM",
  scratchpad_auto_procedure_token: "ILS"
});
const expectedYuminOverrideRateFpm = (8000 - 3000) / (10 / (220 / 60));
controllerAltitudeOverrideAircraft = guideAircraftAlongRoute(controllerAltitudeOverrideAircraft, dataset, 3, {
  currentTimeMs: now,
  performance
});
assertEqual(
  controllerAltitudeOverrideAircraft.altitude_control_mode,
  "managed",
  "ILS RWY07 adopts YUMIN 3000 controller altitude as allowed approach target"
);
assertEqual(
  controllerAltitudeOverrideAircraft.execution_altitude_ft,
  3000,
  "ILS RWY07 executes controller-cleared YUMIN 3000 instead of default YUMIN 4000"
);
assertEqual(
  controllerAltitudeOverrideAircraft.managed_altitude_constraint_ft,
  3000,
  "ILS RWY07 managed vertical profile keeps YUMIN 3000 as active target"
);
assertTrue(
  Math.abs(controllerAltitudeOverrideAircraft.managed_vertical_rate_fpm) < expectedYuminOverrideRateFpm,
  "ILS RWY07 relaxes YUMIN 3000 descent rate when final landing remains feasible"
);
assertTrue(
  Math.abs(controllerAltitudeOverrideAircraft.managed_vertical_rate_fpm) <=
    Math.abs(controllerAltitudeOverrideAircraft.guidance_status.landing_required_vertical_rate_fpm) + 250,
  "ILS RWY07 uses final landing required descent rate with a small buffer"
);
assertEqual(
  controllerAltitudeOverrideAircraft.guidance_status.status,
  "high_but_recoverable",
  "ILS RWY07 stores planner profile status on aircraft state"
);
assertEqual(
  controllerAltitudeOverrideAircraft.guidance_status.display_label,
  "HIGH",
  "ILS RWY07 exposes planner HIGH label for UI"
);

let speedCoupledApproachAircraft = aircraftAtFix(beforeYuminControllerAltitude, {
  route_mode: "procedure",
  next_fix: "YUMIN",
  procedure_id: "ILS_Z_LOC_Z_RWY_07",
  procedure_kind: "APP",
  procedure_route: ["YUMIN", "LIMSO", "RW070"],
  procedure_route_index: 0,
  heading_true_deg: pimikToYuminBearing,
  indicated_speed_kt: 260,
  ground_speed_kt: 278,
  altitude_ft: 8000,
  assigned: { altitude_ft: 3000 },
  altitude_control_mode: "controller",
  vertical_procedure_mode: "controller",
  scratchpad_auto_direct_token: "YUM",
  scratchpad_auto_procedure_token: "ILS"
});
const uncoupledHighSpeedRateFpm = (8000 - 3000) / (10 / (278 / 60));
speedCoupledApproachAircraft = guideAircraftAlongRoute(speedCoupledApproachAircraft, dataset, 3, {
  currentTimeMs: now,
  performance
});
assertTrue(
  Math.abs(speedCoupledApproachAircraft.guidance_status.required_vertical_rate_fpm) < uncoupledHighSpeedRateFpm,
  "ILS RWY07 planner execution reduces required descent rate after accounting for speed reduction time"
);
assertTrue(
  Math.abs(speedCoupledApproachAircraft.execution_vertical_rate_fpm) < uncoupledHighSpeedRateFpm,
  "ILS RWY07 execution uses speed-coupled descent rate instead of uncoupled high-speed rate"
);

let directControllerAltitudeAircraft = aircraftAtFix(beforeYuminControllerAltitude, {
  route_mode: "direct",
  next_fix: "YUMIN",
  heading_true_deg: pimikToYuminBearing,
  indicated_speed_kt: 220,
  ground_speed_kt: 220,
  altitude_ft: 8000,
  assigned: { altitude_ft: 4000 },
  altitude_control_mode: "controller",
  vertical_rate_control_mode: "controller",
  scratchpad_auto_direct_token: "YUM"
});
directControllerAltitudeAircraft = guideAircraftAlongRoute(directControllerAltitudeAircraft, dataset, 3, {
  currentTimeMs: now,
  performance
});
assertEqual(
  directControllerAltitudeAircraft.guidance_status.mode,
  "direct",
  "DCT YUMIN controller-altitude guidance remains direct mode"
);
assertEqual(
  directControllerAltitudeAircraft.guidance_status.constraint_fix,
  "YUMIN",
  "DCT YUMIN controller altitude is planned against the active fix"
);
assertTrue(
  directControllerAltitudeAircraft.execution_vertical_rate_fpm < 0,
  "DCT YUMIN controller altitude receives planner vertical execution"
);
assertTrue(
  Math.abs(Math.abs(directControllerAltitudeAircraft.managed_vertical_rate_fpm) - expectedYuminCrossingRateFpm) < 100,
  "DCT YUMIN controller altitude uses active-fix distance based vertical rate"
);
assertTrue(
  directControllerAltitudeAircraft.altitude_ft < 8000,
  "DCT YUMIN controller altitude motion consumes the planner descent rate"
);

let scopedCancelAircraft = aircraftAtFix(beforeYuminControllerAltitude, {
  route_mode: "procedure",
  next_fix: "YUMIN",
  procedure_id: "ILS_Z_LOC_Z_RWY_07",
  procedure_kind: "APP",
  procedure_route: ["YUMIN", "LIMSO", "RW070"],
  procedure_route_index: 0,
  heading_true_deg: pimikToYuminBearing,
  indicated_speed_kt: 220,
  ground_speed_kt: 220,
  altitude_ft: 8000,
  assigned: { altitude_ft: 2900, speed_kt: 220 },
  altitude_control_mode: "controller",
  vertical_procedure_mode: "controller",
  speed_control_mode: "controller",
  controller_assigned_speed_kt: 220,
  scratchpad_auto_direct_token: "YUM",
  scratchpad_auto_procedure_token: "ILS"
});
const scopedCancelResult = applyScopedLevelRestrictionCancellation(scopedCancelAircraft, {
  scope: "APP_FIX",
  fix_id: "YUMIN"
});
assertEqual(scopedCancelResult.status, "applied", "APP_FIX cancel level restriction applies to active ILS route");
scopedCancelAircraft = guideAircraftAlongRoute(scopedCancelResult.aircraft, dataset, 3, {
  currentTimeMs: now,
  performance
});
assertTrue(
  scopedCancelAircraft.cancelled_approach_level_restriction_fixes.includes("YUMIN"),
  "APP_FIX cancel stores YUMIN as cancelled approach level restriction"
);
assertEqual(
  scopedCancelAircraft.execution_altitude_ft,
  2900,
  "YUMIN-only cancel preserves controller-cleared 2900 instead of reverting to YUMIN 4000"
);
assertEqual(
  scopedCancelAircraft.managed_altitude_constraint_fix,
  "LIMSO",
  "YUMIN-only cancel leaves LIMSO/IF altitude profile active"
);
assertEqual(
  scopedCancelAircraft.managed_altitude_constraint_ft,
  2900,
  "YUMIN-only cancel does not cancel LIMSO 2900"
);
const appAllCancelResult = applyScopedLevelRestrictionCancellation(scopedCancelAircraft, {
  scope: "APP_ALL",
  requires_confirmation: true
});
assertEqual(appAllCancelResult.status, "confirmation_required", "APP_ALL cancel requires confirmation before state mutation");

let controllerAltitudeIlsReachedFinal = false;

for (let step = 1; step < 140; step += 1) {
  controllerAltitudeIlsAircraft = guideAircraftAlongRoute(controllerAltitudeIlsAircraft, dataset, 3, {
    currentTimeMs: now + step * 3_000,
    performance
  });

  if (controllerAltitudeIlsAircraft.next_fix === "RW070") {
    controllerAltitudeIlsReachedFinal = true;
    assertTrue(
      controllerAltitudeIlsAircraft.altitude_ft < 3900,
      "ILS RWY07 descends below the YUMIN 4000 crossing altitude after FAF sequencing"
    );
    break;
  }
}

assertTrue(controllerAltitudeIlsReachedFinal, "ILS RWY07 controller-altitude scenario reaches the final segment");
const beforeLimso = destinationPoint(
  limso.latitude,
  limso.longitude,
  reciprocalHeading(yuminToLimsoBearing),
  1.2
);
aircraft = aircraftAtFix(beforeLimso, {
  route_mode: "procedure",
  next_fix: "LIMSO",
  procedure_id: "ILS_Z_LOC_Z_RWY_07",
  procedure_kind: "APP",
  procedure_route: starIlsRoute,
  procedure_route_index: starIlsRoute.indexOf("LIMSO"),
  heading_true_deg: yuminToLimsoBearing,
  ground_speed_kt: 190,
  altitude_ft: 3000,
  assigned: { altitude_ft: 2900 },
  scratchpad_auto_direct_token: "YUM",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3, { currentTimeMs: now, performance });
assertEqual(aircraft.next_fix, "LIMSO", "ILS RWY07 before FAF keeps LIMSO as target");
assertTrue(
  headingDeltaAbs(aircraft.execution_heading_true_deg, yuminToLimsoBearing) < 1,
  "ILS RWY07 does not turn toward final course before LIMSO capture"
);
const beforeLimsoSpeedLookahead = destinationPoint(
  limso.latitude,
  limso.longitude,
  reciprocalHeading(yuminToLimsoBearing),
  5
);
aircraft = assertProcedureSpeedBeforeFix(
  aircraftAtFix(beforeLimsoSpeedLookahead, {
    route_mode: "procedure",
    next_fix: "LIMSO",
    procedure_id: "ILS_Z_LOC_Z_RWY_07",
    procedure_kind: "APP",
    procedure_route: starIlsRoute,
    procedure_route_index: starIlsRoute.indexOf("LIMSO"),
    heading_true_deg: yuminToLimsoBearing,
    indicated_speed_kt: 205,
    ground_speed_kt: 205,
    altitude_ft: 3000,
    assigned: { altitude_ft: 2900 },
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed",
    vertical_procedure_mode: "approach",
    scratchpad_auto_direct_token: "YUM",
    scratchpad_auto_procedure_token: "ILS"
  }),
  "LIMSO",
  181,
  "ILS RWY07 reaches FAF speed before LIMSO"
);

aircraft = aircraftAtFix(fix("LIMSO"), {
  route_mode: "procedure",
  next_fix: "LIMSO",
  procedure_kind: "APP",
  procedure_route: starIlsRoute,
  procedure_route_index: starIlsRoute.indexOf("LIMSO"),
  heading_true_deg: yuminToLimsoBearing,
  ground_speed_kt: 190,
  scratchpad_auto_direct_token: "DAK",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3, { currentTimeMs: now, performance });
assertEqual(aircraft.next_fix, "RW070", "ILS LIMSO next_fix");
assertTrue(
  Boolean(aircraft.procedure_capture_transition),
  "ILS RWY07 starts a post-LIMSO capture transition"
);
assertTrue(
  headingDeltaAbs(aircraft.heading_true_deg, rwy07FinalCourse) > 1,
  "ILS RWY07 does not snap heading to final course at LIMSO"
);
assertEqual(aircraft.turn_state, undefined, "ILS RWY07 LIMSO capture clears turn state");
const limsoTransitionStep = guideAircraftAlongRoute(aircraft, dataset, 3, {
  currentTimeMs: now + 3_000,
  performance
});
assertEqual(limsoTransitionStep.next_fix, "RW070", "ILS RWY07 transition keeps RW070 target");
assertTrue(
  distanceNmBetweenPoints(
    limso.latitude,
    limso.longitude,
    limsoTransitionStep.latitude,
    limsoTransitionStep.longitude
  ) > 0.05,
  "ILS RWY07 transition moves forward on the final leg"
);
assertTrue(
  headingDeltaAbs(limsoTransitionStep.heading_true_deg, rwy07FinalCourse) <
    headingDeltaAbs(aircraft.heading_true_deg, rwy07FinalCourse),
  "ILS RWY07 transition blends heading toward final course"
);
const limsoTransitionDone = guideAircraftAlongRoute(limsoTransitionStep, dataset, 3, {
  currentTimeMs: now + 6_000,
  performance
});
assertEqual(
  limsoTransitionDone.procedure_capture_transition,
  undefined,
  "ILS RWY07 clears capture transition after two radar sweeps"
);
assertTrue(
  headingDeltaAbs(limsoTransitionDone.heading_true_deg, rwy07FinalCourse) < 1,
  "ILS RWY07 completes capture transition on final course"
);

const rwy07FinalSpeedPoint = destinationPoint(
  rwy07Threshold.latitude,
  rwy07Threshold.longitude,
  reciprocalHeading(rwy07FinalCourse),
  4.2
);
aircraft = assertProcedureSpeedBeforeFix(
  aircraftAtFix(rwy07FinalSpeedPoint, {
    route_mode: "procedure",
    next_fix: "RW070",
    procedure_id: "ILS_Z_LOC_Z_RWY_07",
    procedure_kind: "APP",
    procedure_route: starIlsRoute,
    procedure_route_index: starIlsRoute.indexOf("RW070"),
    heading_true_deg: rwy07FinalCourse,
    indicated_speed_kt: 180,
    ground_speed_kt: 180,
    altitude_ft: 2200,
    scratchpad_auto_direct_token: "YUM",
    scratchpad_auto_procedure_token: "ILS"
  }),
  "RW070",
  146,
  "ILS RWY07 reaches landing speed inside 5 NM before RW070"
);

aircraft = aircraftAtFix(fix("RW070"), {
  route_mode: "procedure",
  next_fix: "RW070",
  procedure_kind: "APP",
  procedure_route: starIlsRoute,
  procedure_route_index: starIlsRoute.indexOf("RW070"),
  scratchpad_auto_direct_token: "DAK",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3);
assertEqual(aircraft.route_mode, "vector", "ILS final route_mode");
assertEqual(aircraft.next_fix, undefined, "ILS final next_fix");
assertEqual(aircraft.procedure_route, undefined, "ILS final route clear");
assertEqual(aircraft.scratchpad_auto_direct_token, undefined, "ILS final direct token clear");
assertEqual(aircraft.scratchpad_auto_procedure_token, undefined, "ILS final procedure token clear");
assertEqual(aircraft.landing_state, "landed", "ILS RWY07 threshold landing state");

const visualRwy07Route = ["LIMSO", "RW070"];
const visualRwy07BeforeThreshold = destinationPoint(
  rwy07Threshold.latitude,
  rwy07Threshold.longitude,
  reciprocalHeading(rwy07FinalCourse),
  2
);
aircraft = aircraftAtFix(visualRwy07BeforeThreshold, {
  route_mode: "procedure",
  next_fix: "RW070",
  procedure_id: "VISUAL_APPROACH_RWY_07",
  procedure_name: "Visual Approach RWY 07",
  procedure_kind: "APP",
  procedure_route: visualRwy07Route,
  procedure_route_index: visualRwy07Route.indexOf("RW070"),
  approach_phase: "final",
  target_runway: "07",
  heading_true_deg: rwy07FinalCourse,
  indicated_speed_kt: 180,
  ground_speed_kt: 180,
  altitude_ft: 1200,
  vertical_rate_fpm: -500,
  scratchpad: "VIS",
  scratchpad_auto_procedure_token: "VIS",
  altitude_control_mode: "managed",
  vertical_rate_control_mode: "managed",
  speed_control_mode: "managed",
  vertical_procedure_mode: "approach"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3, { currentTimeMs: now, performance });
assertEqual(aircraft.route_mode, "procedure", "Visual RWY07 final route remains procedure before threshold");
assertEqual(aircraft.next_fix, "RW070", "Visual RWY07 final route keeps threshold target");
assertTrue(
  headingDeltaAbs(aircraft.execution_heading_true_deg, rwy07FinalCourse) < 1,
  "Visual RWY07 final route follows runway final course"
);
assertTrue(
  aircraft.execution_speed_kt <= 160,
  "Visual RWY07 final route applies approach speed cap"
);
assertEqual(aircraft.approach_phase, "final", "Visual RWY07 final route stays in final phase");

aircraft = aircraftAtFix(fix("RW070"), {
  route_mode: "procedure",
  next_fix: "RW070",
  procedure_id: "VISUAL_APPROACH_RWY_07",
  procedure_name: "Visual Approach RWY 07",
  procedure_kind: "APP",
  procedure_route: visualRwy07Route,
  procedure_route_index: visualRwy07Route.indexOf("RW070"),
  approach_phase: "final",
  target_runway: "07",
  heading_true_deg: rwy07FinalCourse,
  indicated_speed_kt: 145,
  ground_speed_kt: 145,
  altitude_ft: 300,
  scratchpad: "VIS",
  scratchpad_auto_procedure_token: "VIS",
  vertical_procedure_mode: "approach"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3, { currentTimeMs: now, performance });
assertEqual(aircraft.route_mode, "vector", "Visual RWY07 threshold route_mode clears");
assertEqual(aircraft.next_fix, undefined, "Visual RWY07 threshold next_fix clears");
assertEqual(aircraft.procedure_route, undefined, "Visual RWY07 threshold route clears");
assertEqual(aircraft.scratchpad_auto_procedure_token, undefined, "Visual RWY07 threshold procedure token clears");
assertEqual(aircraft.landing_state, "landed", "Visual RWY07 threshold landing state");

aircraft = aircraftAtFix(fix("DUKAL"), {
  route_mode: "procedure",
  next_fix: "DUKAL",
  procedure_id: "ILS_Z_LOC_Z_RWY_25",
  procedure_kind: "APP",
  procedure_route: rwy25IlsRoute,
  procedure_route_index: 0,
  altitude_ft: 4300,
  scratchpad_auto_direct_token: "DUK",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3);
assertEqual(aircraft.next_fix, "TOKIN", "ILS RWY25 DUKAL next_fix");
assertEqual(aircraft.approach_phase, "intermediate", "ILS RWY25 DUKAL approach phase");

aircraft = aircraftAtFix(fix("TOKIN"), {
  route_mode: "procedure",
  next_fix: "TOKIN",
  procedure_id: "ILS_Z_LOC_Z_RWY_25",
  procedure_kind: "APP",
  procedure_route: rwy25IlsRoute,
  procedure_route_index: 1,
  altitude_ft: 3000,
  ground_speed_kt: 190,
  scratchpad_auto_direct_token: "DUK",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3);
assertEqual(aircraft.next_fix, "RW250", "ILS RWY25 TOKIN next_fix");
assertEqual(aircraft.approach_phase, "final", "ILS RWY25 TOKIN approach phase");

const tokin = fix("TOKIN");
const rwy25Threshold = fix("RW250");
const dukalToTokinBearing = initialBearingTrueDeg(
  fix("DUKAL").latitude,
  fix("DUKAL").longitude,
  tokin.latitude,
  tokin.longitude
);
const rwy25FinalCourse = initialBearingTrueDeg(
  tokin.latitude,
  tokin.longitude,
  rwy25Threshold.latitude,
  rwy25Threshold.longitude
);
const beforeDukalAltitudeGuard = destinationPoint(
  fix("DUKAL").latitude,
  fix("DUKAL").longitude,
  reciprocalHeading(dukalToTokinBearing),
  0.1
);
aircraft = aircraftAtFix(beforeDukalAltitudeGuard, {
  route_mode: "procedure",
  next_fix: "DUKAL",
  procedure_id: "ILS_Z_LOC_Z_RWY_25",
  procedure_kind: "APP",
  procedure_route: rwy25IlsRoute,
  procedure_route_index: 0,
  heading_true_deg: dukalToTokinBearing,
  ground_speed_kt: 190,
  altitude_ft: 4050,
  vertical_rate_fpm: -1500,
  assigned: { altitude_ft: 4000 },
  altitude_active_at_ms: now + 10_000,
  scratchpad_auto_direct_token: "DUK",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3, { currentTimeMs: now, performance });
assertTrue(
  aircraft.altitude_ft >= 4000,
  "ILS RWY25 pending ALT does not descend below DUKAL 4000 before IAF capture"
);
const beforeDukalMaintainGuard = destinationPoint(
  fix("DUKAL").latitude,
  fix("DUKAL").longitude,
  reciprocalHeading(dukalToTokinBearing),
  0.4
);
aircraft = aircraftAtFix(beforeDukalMaintainGuard, {
  route_mode: "procedure",
  next_fix: "DUKAL",
  procedure_id: "ILS_Z_LOC_Z_RWY_25",
  procedure_kind: "APP",
  procedure_route: rwy25IlsRoute,
  procedure_route_index: 0,
  heading_true_deg: dukalToTokinBearing,
  ground_speed_kt: 203,
  altitude_ft: 4000,
  vertical_rate_fpm: 0,
  assigned: { altitude_ft: 4000 },
  altitude_control_mode: "managed",
  vertical_rate_control_mode: "managed",
  vertical_procedure_mode: "approach",
  scratchpad_auto_direct_token: "DUK",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3, { currentTimeMs: now, performance });
assertTrue(
  aircraft.altitude_ft >= 4000,
  "ILS RWY25 maintain A040 must not start TOKIN descent before DUKAL capture"
);
const beforeDukalSpeedLookahead = destinationPoint(
  fix("DUKAL").latitude,
  fix("DUKAL").longitude,
  reciprocalHeading(dukalToTokinBearing),
  7
);
aircraft = assertProcedureSpeedBeforeFix(
  aircraftAtFix(beforeDukalSpeedLookahead, {
    route_mode: "procedure",
    next_fix: "DUKAL",
    procedure_id: "ILS_Z_LOC_Z_RWY_25",
    procedure_kind: "APP",
    procedure_route: rwy25IlsRoute,
    procedure_route_index: 0,
    heading_true_deg: dukalToTokinBearing,
    indicated_speed_kt: 230,
    ground_speed_kt: 230,
    altitude_ft: 4000,
    assigned: { altitude_ft: 4000 },
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed",
    vertical_procedure_mode: "approach",
    scratchpad_auto_direct_token: "DUK",
    scratchpad_auto_procedure_token: "ILS"
  }),
  "DUKAL",
  196,
  "ILS RWY25 reaches setup speed before DUKAL capture"
);
const beforeTokin = destinationPoint(
  tokin.latitude,
  tokin.longitude,
  reciprocalHeading(dukalToTokinBearing),
  1.2
);
aircraft = aircraftAtFix(beforeTokin, {
  route_mode: "procedure",
  next_fix: "TOKIN",
  procedure_id: "ILS_Z_LOC_Z_RWY_25",
  procedure_kind: "APP",
  procedure_route: rwy25IlsRoute,
  procedure_route_index: 1,
  heading_true_deg: dukalToTokinBearing,
  ground_speed_kt: 190,
  altitude_ft: 3000,
  assigned: { altitude_ft: 2900 },
  scratchpad_auto_direct_token: "DUK",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3, { currentTimeMs: now, performance });
assertEqual(aircraft.next_fix, "TOKIN", "ILS RWY25 before FAF keeps TOKIN as target");
assertTrue(
  headingDeltaAbs(aircraft.execution_heading_true_deg, dukalToTokinBearing) < 1,
  "ILS RWY25 does not turn toward final course before TOKIN capture"
);
const beforeTokinSpeedLookahead = destinationPoint(
  tokin.latitude,
  tokin.longitude,
  reciprocalHeading(dukalToTokinBearing),
  5
);
aircraft = assertProcedureSpeedBeforeFix(
  aircraftAtFix(beforeTokinSpeedLookahead, {
    route_mode: "procedure",
    next_fix: "TOKIN",
    procedure_id: "ILS_Z_LOC_Z_RWY_25",
    procedure_kind: "APP",
    procedure_route: rwy25IlsRoute,
    procedure_route_index: 1,
    heading_true_deg: dukalToTokinBearing,
    indicated_speed_kt: 205,
    ground_speed_kt: 205,
    altitude_ft: 3000,
    assigned: { altitude_ft: 2900 },
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed",
    vertical_procedure_mode: "approach",
    scratchpad_auto_direct_token: "DUK",
    scratchpad_auto_procedure_token: "ILS"
  }),
  "TOKIN",
  181,
  "ILS RWY25 reaches FAF speed before TOKIN"
);

aircraft = aircraftAtFix(fix("TOKIN"), {
  route_mode: "procedure",
  next_fix: "TOKIN",
  procedure_id: "ILS_Z_LOC_Z_RWY_25",
  procedure_kind: "APP",
  procedure_route: rwy25IlsRoute,
  procedure_route_index: 1,
  heading_true_deg: dukalToTokinBearing,
  altitude_ft: 3000,
  ground_speed_kt: 190,
  scratchpad_auto_direct_token: "DUK",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3, { currentTimeMs: now, performance });
assertTrue(
  Boolean(aircraft.procedure_capture_transition),
  "ILS RWY25 starts a post-TOKIN capture transition"
);
assertTrue(
  headingDeltaAbs(aircraft.procedure_capture_transition.target_heading_true_deg, rwy25FinalCourse) < 1,
  "ILS RWY25 capture transition targets the final course"
);
assertEqual(aircraft.turn_state, undefined, "ILS RWY25 TOKIN capture clears turn state");
const tokinTransitionStep = guideAircraftAlongRoute(aircraft, dataset, 3, {
  currentTimeMs: now + 3_000,
  performance
});
assertTrue(
  distanceNmBetweenPoints(
    tokin.latitude,
    tokin.longitude,
    tokinTransitionStep.latitude,
    tokinTransitionStep.longitude
  ) > 0.05,
  "ILS RWY25 transition moves forward on the final leg"
);
const initialTokinFinalDelta = headingDeltaAbs(aircraft.heading_true_deg, rwy25FinalCourse);
const transitionTokinFinalDelta = headingDeltaAbs(
  tokinTransitionStep.heading_true_deg,
  rwy25FinalCourse
);
assertTrue(
  initialTokinFinalDelta > 1
    ? transitionTokinFinalDelta < initialTokinFinalDelta
    : transitionTokinFinalDelta < 1,
  "ILS RWY25 transition keeps or blends heading toward final course"
);
const tokinTransitionDone = guideAircraftAlongRoute(tokinTransitionStep, dataset, 3, {
  currentTimeMs: now + 6_000,
  performance
});
assertEqual(
  tokinTransitionDone.procedure_capture_transition,
  undefined,
  "ILS RWY25 clears capture transition after two radar sweeps"
);
assertTrue(
  headingDeltaAbs(tokinTransitionDone.heading_true_deg, rwy25FinalCourse) < 1,
  "ILS RWY25 completes capture transition on final course"
);

const rwy25FinalDescentPoint = destinationPoint(
  rwy25Threshold.latitude,
  rwy25Threshold.longitude,
  reciprocalHeading(rwy25FinalCourse),
  4.2
);
aircraft = assertProcedureSpeedBeforeFix(
  aircraftAtFix(rwy25FinalDescentPoint, {
    route_mode: "procedure",
    next_fix: "RW250",
    procedure_id: "ILS_Z_LOC_Z_RWY_25",
    procedure_kind: "APP",
    procedure_route: rwy25IlsRoute,
    procedure_route_index: 2,
    heading_true_deg: rwy25FinalCourse,
    indicated_speed_kt: 180,
    ground_speed_kt: 180,
    altitude_ft: 2200,
    scratchpad_auto_direct_token: "DUK",
    scratchpad_auto_procedure_token: "ILS"
  }),
  "RW250",
  146,
  "ILS RWY25 reaches landing speed inside 5 NM before RW250"
);
aircraft = aircraftAtFix(rwy25FinalDescentPoint, {
  route_mode: "procedure",
  next_fix: "RW250",
  procedure_id: "ILS_Z_LOC_Z_RWY_25",
  procedure_kind: "APP",
  procedure_route: rwy25IlsRoute,
  procedure_route_index: 2,
  altitude_ft: 2200,
  ground_speed_kt: 190,
  scratchpad_auto_direct_token: "DUK",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3, { currentTimeMs: now, performance });
assertTrue(
  aircraft.execution_altitude_ft > 120 &&
    aircraft.execution_altitude_ft < 2200 &&
    aircraft.execution_vertical_rate_fpm < 0,
  "ILS RWY25 final assigns moving glide-path descent"
);
assertEqual(aircraft.execution_speed_kt, 145, "ILS RWY25 final inside 5 NM assigns B738 landing speed");

aircraft = aircraftAtFix(fix("RW250"), {
  route_mode: "procedure",
  next_fix: "RW250",
  procedure_id: "ILS_Z_LOC_Z_RWY_25",
  procedure_kind: "APP",
  procedure_route: rwy25IlsRoute,
  procedure_route_index: 2,
  altitude_ft: 300,
  scratchpad_auto_direct_token: "DUK",
  scratchpad_auto_procedure_token: "ILS"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3);
assertEqual(aircraft.landing_state, "landed", "ILS RWY25 threshold landing state");

aircraft = aircraftAtFix(fix("PALRI"), {
  route_mode: "procedure",
  next_fix: "PALRI",
  procedure_kind: "SID",
  procedure_route: sidRoute,
  procedure_route_index: 0,
  scratchpad_auto_direct_token: "PAL",
  scratchpad_auto_procedure_token: "SID"
});
aircraft = guideAircraftAlongRoute(aircraft, dataset, 3);
assertEqual(aircraft.route_mode, "procedure", "SID PALRI route_mode");
assertEqual(aircraft.next_fix, "AKPON", "SID PALRI next_fix");

const dotol2m = procedures.stars.find((procedure) => procedure.id === "RNAV_DOTOL_2M");
let rwy25Aircraft = aircraftAtFix(fix("DOKVU"), {
  route_mode: "procedure",
  next_fix: "DOKVU",
  procedure_kind: "STAR",
  procedure_route: parseProcedureRouteText(dotol2m.route_text).slice(
    parseProcedureRouteText(dotol2m.route_text).indexOf("DOKVU")
  ),
  procedure_route_index: 0,
  scratchpad_auto_direct_token: "DOK",
  scratchpad_auto_procedure_token: "STAR"
});
rwy25Aircraft = guideAircraftAlongRoute(rwy25Aircraft, dataset, 3);
assertEqual(rwy25Aircraft.next_fix, "PC682", "RWY25 STAR DOKVU next_fix");

const kamit2n = procedures.sids.find((procedure) => procedure.id === "RNAV_KAMIT_2N");
let rwy31Aircraft = aircraftAtFix(fix("PC861"), {
  flight_phase: "departure",
  route_mode: "procedure",
  next_fix: "PC861",
  procedure_kind: "SID",
  procedure_route: parseProcedureRouteText(kamit2n.route_text),
  procedure_route_index: 0,
  scratchpad_auto_direct_token: "861",
  scratchpad_auto_procedure_token: "SID"
});
rwy31Aircraft = guideAircraftAlongRoute(rwy31Aircraft, dataset, 3);
assertEqual(rwy31Aircraft.next_fix, "PC871", "RWY31 SID PC861 next_fix");

const pansi2e = procedures.sids.find((procedure) => procedure.id === "RNAV_PANSI_2E");
const pansi2eRoute = parseProcedureRouteText(pansi2e.route_text);
const palriToPc813Bearing = initialBearingTrueDeg(
  fix("PALRI").latitude,
  fix("PALRI").longitude,
  fix("PC813").latitude,
  fix("PC813").longitude
);
const beforePc8134Nm = destinationPoint(
  fix("PC813").latitude,
  fix("PC813").longitude,
  reciprocalHeading(palriToPc813Bearing),
  4
);
let sidRestrictionAircraft = aircraftAtFix(beforePc8134Nm, {
  flight_phase: "departure",
  route_mode: "procedure",
  next_fix: "PC813",
  procedure_id: "RNAV_PANSI_2E",
  procedure_kind: "SID",
  procedure_route: pansi2eRoute,
  procedure_route_index: pansi2eRoute.indexOf("PC813"),
  heading_true_deg: palriToPc813Bearing,
  indicated_speed_kt: 280,
  ground_speed_kt: 280,
  altitude_ft: 6000,
  assigned: { altitude_ft: 12000 },
  altitude_control_mode: "managed",
  vertical_rate_control_mode: "managed",
  scratchpad_auto_procedure_token: "SID"
});
sidRestrictionAircraft = guideAircraftAlongRoute(sidRestrictionAircraft, dataset, 3, {
  currentTimeMs: now,
  performance
});
assertEqual(sidRestrictionAircraft.execution_altitude_ft, 9000, "SID PANSI 2E applies PC813 9000ft execution target");
assertTrue(
  sidRestrictionAircraft.execution_vertical_rate_fpm > 0,
  "SID PANSI 2E applies climb rate toward PC813 restriction"
);
assertTrue(
  sidRestrictionAircraft.execution_vertical_rate_fpm <= performance.climb_fpm,
  "SID PANSI 2E managed climb rate stays within normal aircraft performance"
);
assertEqual(
  sidRestrictionAircraft.guidance_status?.max_vertical_rate_fpm,
  performance.climb_fpm,
  "SID PANSI 2E guidance status exposes normal aircraft climb performance cap"
);
assertEqual(
  Math.round(sidRestrictionAircraft.guidance_status?.required_climb_gradient_ft_per_nm ?? 0),
  Math.round(6.8 * 6076.12 / 100),
  "SID PANSI 2E guidance status exposes published climb gradient in ft/NM"
);
assertTrue(
  (sidRestrictionAircraft.guidance_status?.max_climb_gradient_ft_per_nm ?? 0) > 0,
  "SID PANSI 2E guidance status exposes aircraft climb-gradient capability"
);
assertEqual(sidRestrictionAircraft.execution_speed_kt, 250, "SID PANSI 2E applies PC813 250kt execution speed");

console.log("Procedure guidance and motion-model verification passed");

function assertProcedureSpeedBeforeFix(startAircraft, fixId, maxSpeedKt, label) {
  let probe = startAircraft;
  let lastBeforeCapture = startAircraft;
  const normalizedFixId = normalizeFixId(fixId);

  for (let step = 0; step < 120; step += 1) {
    const targetFix = fix(fixId);
    const distanceBeforeNm = distanceNmBetweenPoints(
      probe.latitude,
      probe.longitude,
      targetFix.latitude,
      targetFix.longitude
    );
    const sweepDistanceNm = distanceNmForSeconds(probe.ground_speed_kt, 3);
    const captureDistanceNm = Math.max(0.25, sweepDistanceNm);

    if (distanceBeforeNm > captureDistanceNm) {
      lastBeforeCapture = probe;
    }

    probe = guideAircraftAlongRoute(probe, dataset, 3, {
      currentTimeMs: now + step * 3_000,
      performance
    });

    if (normalizeFixId(probe.next_fix ?? "") !== normalizedFixId || distanceBeforeNm <= captureDistanceNm) {
      const speedBeforeCaptureKt = lastBeforeCapture.indicated_speed_kt ?? lastBeforeCapture.ground_speed_kt;

      assertTrue(
        speedBeforeCaptureKt <= maxSpeedKt,
        `${label}: expected <= ${maxSpeedKt}, got ${speedBeforeCaptureKt.toFixed(1)}`
      );
      return probe;
    }
  }

  throw new Error(`${label}: ${fixId} was not captured during verification`);
}

function reciprocalHeading(headingDeg) {
  return (headingDeg + 180) % 360;
}

function headingDeltaAbs(currentHeadingDeg, targetHeadingDeg) {
  return Math.abs(((((targetHeadingDeg - currentHeadingDeg + 540) % 360) + 360) % 360) - 180);
}
