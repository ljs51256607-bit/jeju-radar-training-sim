import { build } from "esbuild";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, ".motion-model-verify");
const outFile = path.join(outDir, "aircraftMotion.mjs");
const now = 1_700_000_000_000;

function assertTrue(condition, label) {
  if (!condition) {
    throw new Error(label);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function readWorkspaceJson(relativePath) {
  return JSON.parse(await readFile(path.join(rootDir, "..", relativePath), "utf8"));
}

function baseAircraft(overrides = {}) {
  return {
    id: "MOTION-VERIFY",
    callsign: "MOTION",
    aircraft_type: "B738",
    flight_phase: "arrival",
    latitude: 33.5,
    longitude: 126.5,
    heading_true_deg: 0,
    indicated_speed_kt: 250,
    ground_speed_kt: 250,
    altitude_ft: 8000,
    vertical_rate_fpm: 0,
    route_mode: "vector",
    assigned: {},
    ...overrides
  };
}

function advanceSweeps(initialAircraft, sweepCount, elapsedSeconds = 3) {
  let aircraft = initialAircraft;

  for (let step = 0; step < sweepCount; step += 1) {
    aircraft = advanceAircraftForRadarSweep(aircraft, elapsedSeconds, {
      currentTimeMs: now + step * elapsedSeconds * 1000,
      performance
    });
  }

  return aircraft;
}

function assertDescentGateSatisfiedBeforeCrossing(initialAircraft, label, maxSteps = 90) {
  let aircraft = initialAircraft;
  let crossedGate = false;
  let fastestBelowGateKt = Number.POSITIVE_INFINITY;

  for (let step = 0; step < maxSteps; step += 1) {
    aircraft = advanceAircraftForRadarSweep(aircraft, 3, {
      currentTimeMs: now + step * 3_000,
      performance
    });

    if (aircraft.altitude_ft <= 10000) {
      crossedGate = true;
      fastestBelowGateKt = Math.min(fastestBelowGateKt, aircraft.indicated_speed_kt);
      assertTrue(
        aircraft.indicated_speed_kt <= 251,
        `${label}: aircraft must not descend through 10000 ft above 250 KIAS gate`
      );
      break;
    }
  }

  assertTrue(crossedGate, `${label}: aircraft eventually descends through the 10000 ft gate`);
  assertTrue(fastestBelowGateKt <= 251, `${label}: speed gate is satisfied before descent continues`);
}

await rm(outDir, { force: true, recursive: true });
await mkdir(outDir, { recursive: true });

await build({
  absWorkingDir: rootDir,
  bundle: true,
  entryPoints: ["src/lib/aircraftMotion.ts"],
  external: [],
  format: "esm",
  outfile: outFile,
  platform: "node",
  target: "es2020"
});

const [{ advanceAircraftForRadarSweep }, performanceProfiles] = await Promise.all([
  import(pathToFileURL(outFile).href),
  readWorkspaceJson("data/reference/aircraft_performance_profiles.json")
]);

const performance = performanceProfiles.profiles.find(
  (profile) => profile.id === performanceProfiles.default_profile_id
);

if (!performance) {
  throw new Error("Default performance profile missing");
}

let aircraft = baseAircraft({
  heading_true_deg: 0,
  assigned: { heading_true_deg: 90 },
  heading_active_at_ms: now + 10_000
});
aircraft = advanceAircraftForRadarSweep(aircraft, 3, { currentTimeMs: now, performance });
assertEqual(aircraft.heading_true_deg, 0, "Pending HDG keeps actual heading");
assertEqual(aircraft.turn_state, undefined, "Pending HDG does not create turn state");

aircraft = baseAircraft({
  heading_true_deg: 0,
  assigned: { heading_true_deg: 90 },
  heading_active_at_ms: now - 1
});
const firstTurn = advanceAircraftForRadarSweep(aircraft, 3, { currentTimeMs: now, performance });
const secondTurn = advanceAircraftForRadarSweep(firstTurn, 3, { currentTimeMs: now + 3_000, performance });
assertTrue(firstTurn.heading_true_deg > 0 && firstTurn.heading_true_deg < 8, "Roll-in starts a gradual turn");
assertTrue(firstTurn.turn_state?.bank_deg > 0, "Roll-in stores live bank state");
assertTrue(
  Math.abs(secondTurn.turn_state?.bank_deg ?? 0) >= Math.abs(firstTurn.turn_state?.bank_deg ?? 0),
  "Bank continues rolling toward normal bank"
);
assertTrue(secondTurn.heading_true_deg > firstTurn.heading_true_deg, "Heading keeps turning toward target");

let oneCircle = baseAircraft({
  heading_true_deg: 0,
  assigned: { heading_true_deg: 90 },
  heading_active_at_ms: now - 1,
  one_circle_turn_state: {
    target_heading_true_deg: 90,
    direction: 1,
    start_heading_true_deg: 0,
    last_heading_true_deg: 0,
    accumulated_turn_deg: 0,
    required_turn_deg: 450,
    started_at_ms: now - 1
  }
});
oneCircle = advanceSweeps(oneCircle, 10);
assertTrue(
  oneCircle.one_circle_turn_state?.accumulated_turn_deg > 0,
  "One-circle heading accumulates directed turn"
);
assertTrue(
  oneCircle.one_circle_turn_state?.accumulated_turn_deg < 360,
  "One-circle heading does not roll out before the full circle"
);
assertTrue(
  oneCircle.heading_true_deg !== 90,
  "One-circle heading does not immediately capture rollout heading"
);

let oneCircleCompletion = oneCircle;
let maxOneCircleAccumulatedTurnDeg = oneCircle.one_circle_turn_state?.accumulated_turn_deg ?? 0;

for (let step = 10; step < 120 && oneCircleCompletion.one_circle_turn_state; step += 1) {
  maxOneCircleAccumulatedTurnDeg = Math.max(
    maxOneCircleAccumulatedTurnDeg,
    oneCircleCompletion.one_circle_turn_state.accumulated_turn_deg
  );
  oneCircleCompletion = advanceAircraftForRadarSweep(oneCircleCompletion, 3, {
    currentTimeMs: now + step * 3_000,
    performance
  });
}

assertEqual(oneCircleCompletion.one_circle_turn_state, undefined, "One-circle state clears after rollout");
assertEqual(Math.round(oneCircleCompletion.heading_true_deg), 90, "One-circle rolls out on assigned heading");
assertTrue(
  maxOneCircleAccumulatedTurnDeg >= 360,
  "One-circle completes at least one full directed turn before rollout"
);

const highAltitudeSpeed = advanceAircraftForRadarSweep(
  baseAircraft({
    altitude_ft: 16000,
    indicated_speed_kt: 250,
    ground_speed_kt: 250,
    assigned: {}
  }),
  3,
  { currentTimeMs: now, performance }
);
assertTrue(
  highAltitudeSpeed.ground_speed_kt > highAltitudeSpeed.indicated_speed_kt,
  "No-wind radar ground speed is altitude-adjusted above IAS"
);

const lowTmaGroundSpeed = advanceAircraftForRadarSweep(
  baseAircraft({
    altitude_ft: 9400,
    indicated_speed_kt: 250,
    ground_speed_kt: 250,
    assigned: {}
  }),
  3,
  { currentTimeMs: now, performance }
);
assertEqual(
  Math.round(lowTmaGroundSpeed.ground_speed_kt),
  278,
  "9400 ft 250 KIAS displays about 278 kt GS with the Jeju APP training TAS factor"
);

const levelAccel = advanceAircraftForRadarSweep(
  baseAircraft({
    altitude_ft: 5000,
    indicated_speed_kt: 220,
    ground_speed_kt: 220,
    assigned: { speed_kt: 300 },
    speed_active_at_ms: now - 1
  }),
  3,
  { currentTimeMs: now, performance }
);
const climbAccel = advanceAircraftForRadarSweep(
  baseAircraft({
    altitude_ft: 5000,
    indicated_speed_kt: 220,
    ground_speed_kt: 220,
    assigned: { speed_kt: 300, altitude_ft: 10000 },
    speed_active_at_ms: now - 1,
    altitude_active_at_ms: now - 1
  }),
  3,
  { currentTimeMs: now, performance }
);
assertTrue(
  climbAccel.indicated_speed_kt - 220 < levelAccel.indicated_speed_kt - 220,
  "Climb acceleration is damped versus level acceleration"
);

const climbWithoutSpeedPull = advanceSweeps(
  baseAircraft({
    flight_phase: "departure",
    altitude_ft: 5000,
    indicated_speed_kt: 220,
    ground_speed_kt: 220,
    assigned: { speed_kt: 220, altitude_ft: 10000 },
    speed_active_at_ms: now - 1,
    altitude_active_at_ms: now - 1
  }),
  3
);
const climbWithSpeedPull = advanceSweeps(
  baseAircraft({
    flight_phase: "departure",
    altitude_ft: 5000,
    indicated_speed_kt: 220,
    ground_speed_kt: 220,
    assigned: { speed_kt: 300, altitude_ft: 10000 },
    speed_active_at_ms: now - 1,
    altitude_active_at_ms: now - 1
  }),
  3
);
assertTrue(
  climbWithSpeedPull.vertical_rate_fpm < climbWithoutSpeedPull.vertical_rate_fpm,
  "Departure climb rate is reduced while the aircraft is pulling speed"
);

const highAltitudeAccel = advanceAircraftForRadarSweep(
  baseAircraft({
    altitude_ft: 16000,
    indicated_speed_kt: 220,
    ground_speed_kt: 220,
    assigned: { speed_kt: 300 },
    speed_active_at_ms: now - 1
  }),
  3,
  { currentTimeMs: now, performance }
);
assertTrue(
  highAltitudeAccel.indicated_speed_kt - 220 < levelAccel.indicated_speed_kt - 220,
  "High-altitude acceleration is damped versus low-altitude acceleration"
);

const arrivalDecel = advanceAircraftForRadarSweep(
  baseAircraft({
    flight_phase: "arrival",
    indicated_speed_kt: 250,
    ground_speed_kt: 250,
    assigned: { speed_kt: 210 },
    speed_active_at_ms: now - 1
  }),
  3,
  { currentTimeMs: now, performance }
);
const departureDecel = advanceAircraftForRadarSweep(
  baseAircraft({
    flight_phase: "departure",
    indicated_speed_kt: 250,
    ground_speed_kt: 250,
    assigned: { speed_kt: 210 },
    speed_active_at_ms: now - 1
  }),
  3,
  { currentTimeMs: now, performance }
);
assertTrue(
  250 - arrivalDecel.indicated_speed_kt > 250 - departureDecel.indicated_speed_kt,
  "Approach deceleration is stronger than departure deceleration"
);

const taperedAltitude = advanceAircraftForRadarSweep(
  baseAircraft({
    altitude_ft: 9500,
    vertical_rate_fpm: 1800,
    assigned: { altitude_ft: 10000 },
    altitude_active_at_ms: now - 1
  }),
  3,
  { currentTimeMs: now, performance }
);
assertTrue(
  taperedAltitude.vertical_rate_fpm > 0 && taperedAltitude.vertical_rate_fpm < performance.climb_fpm,
  "Altitude capture tapers vertical speed near assigned altitude"
);

const capturedAltitude = advanceAircraftForRadarSweep(
  baseAircraft({
    altitude_ft: 9950,
    vertical_rate_fpm: 1800,
    assigned: { altitude_ft: 10000 },
    altitude_active_at_ms: now - 1
  }),
  3,
  { currentTimeMs: now, performance }
);
assertEqual(capturedAltitude.altitude_ft, 10000, "Altitude captures inside capture band");
assertEqual(capturedAltitude.vertical_rate_fpm, 0, "Altitude capture zeros vertical rate");

const deceleratingDescent = advanceAircraftForRadarSweep(
  baseAircraft({
    flight_phase: "arrival",
    altitude_ft: 11000,
    indicated_speed_kt: 290,
    ground_speed_kt: 290,
    vertical_rate_fpm: -1500,
    assigned: { altitude_ft: 10000, speed_kt: 250 },
    altitude_active_at_ms: now - 1,
    speed_active_at_ms: now - 1
  }),
  3,
  { currentTimeMs: now, performance }
);
assertTrue(
  deceleratingDescent.altitude_ft < 11000,
  "Decelerating descent keeps descending instead of stopping immediately"
);
assertTrue(
  deceleratingDescent.vertical_rate_fpm < 0 &&
    deceleratingDescent.vertical_rate_fpm > -performance.descent_fpm,
  "Decelerating descent shallows vertical rate instead of holding level"
);
assertTrue(
  deceleratingDescent.indicated_speed_kt < 290,
  "Decelerating descent reduces indicated speed"
);

const normalManagedDescent = advanceSweeps(
  baseAircraft({
    flight_phase: "arrival",
    altitude_ft: 9000,
    indicated_speed_kt: 240,
    ground_speed_kt: 240,
    assigned: { altitude_ft: 5000 },
    altitude_active_at_ms: now - 1,
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed"
  }),
  3
);
const expeditedManagedDescent = advanceSweeps(
  baseAircraft({
    flight_phase: "arrival",
    altitude_ft: 9000,
    indicated_speed_kt: 240,
    ground_speed_kt: 240,
    assigned: { altitude_ft: 5000, vertical_rate_fpm: -2500 },
    altitude_active_at_ms: now - 1,
    vertical_rate_active_at_ms: now - 1,
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed"
  }),
  3
);
assertTrue(
  expeditedManagedDescent.vertical_rate_fpm < normalManagedDescent.vertical_rate_fpm,
  "Expedite descent VS has higher descent priority than normal managed descent"
);
assertTrue(
  Math.abs(expeditedManagedDescent.vertical_rate_fpm) <= 2500,
  "Expedite descent remains within the requested vertical-speed limit"
);

const normalEnergyDescent = advanceSweeps(
  baseAircraft({
    flight_phase: "arrival",
    altitude_ft: 14000,
    indicated_speed_kt: 250,
    ground_speed_kt: 250,
    assigned: { altitude_ft: 12000 },
    altitude_active_at_ms: now - 1
  }),
  4
);
const expeditedEnergyDescent = advanceSweeps(
  baseAircraft({
    flight_phase: "arrival",
    altitude_ft: 14000,
    indicated_speed_kt: 250,
    ground_speed_kt: 250,
    assigned: { altitude_ft: 12000 },
    altitude_active_at_ms: now - 1,
    energy_mode: "expedite_descent"
  }),
  4
);
assertTrue(
  expeditedEnergyDescent.vertical_rate_fpm < normalEnergyDescent.vertical_rate_fpm,
  "Expedite descent energy mode commands a steeper managed descent"
);
assertTrue(
  expeditedEnergyDescent.indicated_speed_kt > normalEnergyDescent.indicated_speed_kt,
  "Expedite descent energy mode may bias speed upward when no speed cap blocks it"
);

const cappedExpediteDescent = advanceSweeps(
  baseAircraft({
    flight_phase: "arrival",
    altitude_ft: 14000,
    indicated_speed_kt: 240,
    ground_speed_kt: 240,
    assigned: { altitude_ft: 12000, speed_kt: 240 },
    altitude_active_at_ms: now - 1,
    speed_active_at_ms: now - 1,
    energy_mode: "expedite_descent"
  }),
  4
);
assertTrue(
  cappedExpediteDescent.indicated_speed_kt <= 241,
  "Expedite descent does not override an assigned speed"
);

const normalEnergyClimb = advanceSweeps(
  baseAircraft({
    flight_phase: "departure",
    altitude_ft: 6000,
    indicated_speed_kt: 230,
    ground_speed_kt: 230,
    assigned: { altitude_ft: 10000 },
    altitude_active_at_ms: now - 1
  }),
  4
);
const expeditedEnergyClimb = advanceSweeps(
  baseAircraft({
    flight_phase: "departure",
    altitude_ft: 6000,
    indicated_speed_kt: 230,
    ground_speed_kt: 230,
    assigned: { altitude_ft: 10000 },
    altitude_active_at_ms: now - 1,
    energy_mode: "expedite_climb"
  }),
  4
);
assertTrue(
  expeditedEnergyClimb.vertical_rate_fpm > normalEnergyClimb.vertical_rate_fpm,
  "Expedite climb energy mode commands a steeper managed climb"
);

const increasedDescentRate = advanceSweeps(
  baseAircraft({
    flight_phase: "arrival",
    altitude_ft: 14000,
    indicated_speed_kt: 250,
    ground_speed_kt: 250,
    assigned: { altitude_ft: 12000 },
    altitude_active_at_ms: now - 1,
    energy_mode: "increase_descent_rate"
  }),
  4
);
assertTrue(
  increasedDescentRate.vertical_rate_fpm < normalEnergyDescent.vertical_rate_fpm,
  "Increase descent rate mode commands a steeper descent than normal"
);

const increasedClimbRate = advanceSweeps(
  baseAircraft({
    flight_phase: "departure",
    altitude_ft: 6000,
    indicated_speed_kt: 230,
    ground_speed_kt: 230,
    assigned: { altitude_ft: 10000 },
    altitude_active_at_ms: now - 1,
    energy_mode: "increase_climb_rate"
  }),
  4
);
assertTrue(
  increasedClimbRate.vertical_rate_fpm > normalEnergyClimb.vertical_rate_fpm,
  "Increase climb rate mode commands a steeper climb than normal"
);

let stagedSpeedGateDescent = baseAircraft({
  flight_phase: "arrival",
  altitude_ft: 11000,
  indicated_speed_kt: 290,
  ground_speed_kt: 290,
  vertical_rate_fpm: -1500,
  assigned: { altitude_ft: 10000, speed_kt: 250 },
  altitude_active_at_ms: now - 1,
  speed_active_at_ms: now - 1
});
let previousAltitudeFt = stagedSpeedGateDescent.altitude_ft;
let previousSpeedKt = stagedSpeedGateDescent.indicated_speed_kt;

for (let step = 0; step < 15; step += 1) {
  stagedSpeedGateDescent = advanceAircraftForRadarSweep(stagedSpeedGateDescent, 3, {
    currentTimeMs: now + step * 3_000,
    performance
  });

  assertTrue(
    stagedSpeedGateDescent.altitude_ft < previousAltitudeFt,
    "Staged speed-gate descent keeps descending across sweeps"
  );
  assertTrue(
    stagedSpeedGateDescent.indicated_speed_kt < previousSpeedKt,
    "Staged speed-gate descent keeps decelerating across sweeps"
  );
  assertTrue(
    stagedSpeedGateDescent.vertical_rate_fpm < 0,
    "Staged speed-gate descent does not level off while decelerating above the gate"
  );

  previousAltitudeFt = stagedSpeedGateDescent.altitude_ft;
  previousSpeedKt = stagedSpeedGateDescent.indicated_speed_kt;
}

assertDescentGateSatisfiedBeforeCrossing(
  baseAircraft({
    flight_phase: "arrival",
    altitude_ft: 12000,
    indicated_speed_kt: 300,
    ground_speed_kt: 300,
    vertical_rate_fpm: -1500,
    assigned: { altitude_ft: 6000 },
    altitude_active_at_ms: now - 1
  }),
  "Motion-local 10000 ft gate lookahead without assigned speed"
);

assertDescentGateSatisfiedBeforeCrossing(
  baseAircraft({
    flight_phase: "arrival",
    altitude_ft: 10500,
    indicated_speed_kt: 290,
    ground_speed_kt: 290,
    vertical_rate_fpm: -1500,
    assigned: { altitude_ft: 6000 },
    altitude_active_at_ms: now - 1
  }),
  "Close-in 10000 ft gate fallback holds above gate until speed is safe"
);

const alreadySlowGateDescent = advanceAircraftForRadarSweep(
  baseAircraft({
    flight_phase: "arrival",
    altitude_ft: 11000,
    indicated_speed_kt: 245,
    ground_speed_kt: 245,
    vertical_rate_fpm: -1500,
    assigned: { altitude_ft: 6000 },
    altitude_active_at_ms: now - 1
  }),
  3,
  { currentTimeMs: now, performance }
);
assertEqual(
  alreadySlowGateDescent.vertical_rate_fpm,
  -performance.descent_fpm,
  "Already-slow descent keeps normal vertical rate through the 10000 ft gate"
);
assertEqual(
  alreadySlowGateDescent.indicated_speed_kt,
  245,
  "Already-slow descent does not create an unnecessary speed target"
);

const farDeceleratingDescent = advanceAircraftForRadarSweep(
  baseAircraft({
    flight_phase: "arrival",
    altitude_ft: 16000,
    indicated_speed_kt: 290,
    ground_speed_kt: 290,
    vertical_rate_fpm: -1500,
    assigned: { altitude_ft: 10000, speed_kt: 250 },
    altitude_active_at_ms: now - 1,
    speed_active_at_ms: now - 1
  }),
  3,
  { currentTimeMs: now, performance }
);
assertEqual(
  farDeceleratingDescent.vertical_rate_fpm,
  -performance.descent_fpm,
  "Far deceleration target keeps normal descent when there is enough altitude"
);

const descentRollIn = advanceAircraftForRadarSweep(
  baseAircraft({
    altitude_ft: 8000,
    vertical_rate_fpm: 0,
    assigned: { altitude_ft: 5000 },
    altitude_active_at_ms: now - 1
  }),
  1,
  { currentTimeMs: now, performance }
);
assertTrue(
  descentRollIn.vertical_rate_fpm < 0 &&
    Math.abs(descentRollIn.vertical_rate_fpm) <= performance.vertical_rate_change_fpm_sec,
  "Vertical rate rolls into descent instead of stepping immediately to full rate"
);

const pendingAltitudeCrossing = advanceAircraftForRadarSweep(
  baseAircraft({
    altitude_ft: 4050,
    vertical_rate_fpm: -1500,
    assigned: { altitude_ft: 4000 },
    altitude_active_at_ms: now + 10_000
  }),
  3,
  { currentTimeMs: now, performance }
);
assertEqual(
  pendingAltitudeCrossing.altitude_ft,
  4000,
  "Pending ALT protects assigned altitude from being crossed by existing vertical rate"
);
assertEqual(
  pendingAltitudeCrossing.vertical_rate_fpm,
  0,
  "Pending ALT protection zeros vertical rate at assigned altitude"
);

const pendingAltitudeMovingAway = advanceAircraftForRadarSweep(
  baseAircraft({
    altitude_ft: 3800,
    vertical_rate_fpm: -1500,
    assigned: { altitude_ft: 4000 },
    altitude_active_at_ms: now + 10_000
  }),
  3,
  { currentTimeMs: now, performance }
);
assertEqual(
  pendingAltitudeMovingAway.altitude_ft,
  3800,
  "Pending ALT stops further movement away after already below assigned altitude"
);
assertEqual(
  pendingAltitudeMovingAway.vertical_rate_fpm,
  0,
  "Pending ALT moving-away protection zeros vertical rate"
);

console.log("Motion model verification passed");
