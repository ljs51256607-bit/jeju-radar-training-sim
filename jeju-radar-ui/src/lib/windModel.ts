import type { WindLayer, WindSettings } from "./types";

export const WIND_LAYER_ALTITUDES_FT = [0, 1500, 3000, 6000, 9000, 12000, 15000, 18000] as const;

export interface WindVector {
  east_kt: number;
  north_kt: number;
  speed_kt: number;
  direction_from_deg: number;
  direction_to_deg: number;
}

export interface WindCorrectedMotion {
  heading_true_deg: number;
  track_true_deg: number;
  ground_speed_kt: number;
}

const CALM_VECTOR: WindVector = {
  east_kt: 0,
  north_kt: 0,
  speed_kt: 0,
  direction_from_deg: 0,
  direction_to_deg: 180
};

export function defaultWindSettings(): WindSettings {
  return {
    enabled: false,
    layers: WIND_LAYER_ALTITUDES_FT.map((altitude_ft) => ({
      altitude_ft,
      direction_from_deg: 270,
      speed_kt: 0
    }))
  };
}

export function calmWindSettings(enabled = false): WindSettings {
  return {
    enabled,
    layers: WIND_LAYER_ALTITUDES_FT.map((altitude_ft) => ({
      altitude_ft,
      direction_from_deg: 0,
      speed_kt: 0
    }))
  };
}

export function randomWindSettings(): WindSettings {
  const baseDirection = Math.floor(Math.random() * 360);
  const baseSpeed = 4 + Math.floor(Math.random() * 10);

  return {
    enabled: true,
    layers: WIND_LAYER_ALTITUDES_FT.map((altitude_ft, index) => ({
      altitude_ft,
      direction_from_deg: normalizeHeading(baseDirection + (Math.random() * 70 - 35)),
      speed_kt: Math.max(0, Math.round(baseSpeed + index * 4 + Math.random() * 8))
    }))
  };
}

export function normalizeWindSettings(value: unknown): WindSettings {
  if (!isRecord(value)) {
    return defaultWindSettings();
  }

  const rawLayers = Array.isArray(value.layers) ? value.layers : [];
  const layersByAltitude = new Map<number, WindLayer>();

  for (const rawLayer of rawLayers) {
    if (!isRecord(rawLayer)) {
      continue;
    }

    const altitudeFt = Number(rawLayer.altitude_ft);
    const directionFromDeg = Number(rawLayer.direction_from_deg);
    const speedKt = Number(rawLayer.speed_kt);

    if (!Number.isFinite(altitudeFt)) {
      continue;
    }

    const matchingAltitude = WIND_LAYER_ALTITUDES_FT.find((layerAltitude) => layerAltitude === altitudeFt);

    if (typeof matchingAltitude !== "number") {
      continue;
    }

    layersByAltitude.set(matchingAltitude, {
      altitude_ft: matchingAltitude,
      direction_from_deg: normalizeHeading(Number.isFinite(directionFromDeg) ? directionFromDeg : 0),
      speed_kt: clampNumber(Number.isFinite(speedKt) ? speedKt : 0, 0, 200)
    });
  }

  return {
    enabled: Boolean(value.enabled),
    layers: WIND_LAYER_ALTITUDES_FT.map((altitude_ft) =>
      layersByAltitude.get(altitude_ft) ?? {
        altitude_ft,
        direction_from_deg: 270,
        speed_kt: 0
      }
    )
  };
}

export function windLayerSummary(wind: WindSettings, altitudeFt: number) {
  const resolved = resolveWindAtAltitude(wind, altitudeFt);
  return `${Math.round(resolved.direction_from_deg).toString().padStart(3, "0")}/${Math.round(resolved.speed_kt)
    .toString()
    .padStart(2, "0")}`;
}

export function windLayerRangeLabel(altitudeFt: number) {
  const index = WIND_LAYER_ALTITUDES_FT.findIndex((layerAltitude) => layerAltitude === altitudeFt);

  if (index < 0) {
    return `${altitudeFt}`;
  }

  const nextAltitudeFt = WIND_LAYER_ALTITUDES_FT[index + 1];

  if (typeof nextAltitudeFt !== "number") {
    return `${altitudeFt}+`;
  }

  return `${altitudeFt}~${nextAltitudeFt}`;
}

export function resolveWindAtAltitude(wind: WindSettings | null | undefined, altitudeFt: number): WindVector {
  if (!wind?.enabled) {
    return CALM_VECTOR;
  }

  const layers = normalizeWindSettings(wind).layers.sort((first, second) => first.altitude_ft - second.altitude_ft);

  if (layers.length === 0) {
    return CALM_VECTOR;
  }

  if (!Number.isFinite(altitudeFt) || altitudeFt <= layers[0].altitude_ft) {
    return windVectorFromLayer(layers[0]);
  }

  const lastLayer = layers[layers.length - 1];

  if (altitudeFt >= lastLayer.altitude_ft) {
    return windVectorFromLayer(lastLayer);
  }

  for (let index = 0; index < layers.length - 1; index += 1) {
    const lower = layers[index];
    const upper = layers[index + 1];

    if (altitudeFt < lower.altitude_ft || altitudeFt > upper.altitude_ft) {
      continue;
    }

    const lowerVector = windVectorFromLayer(lower);
    const upperVector = windVectorFromLayer(upper);
    const ratio = (altitudeFt - lower.altitude_ft) / (upper.altitude_ft - lower.altitude_ft);

    return windVectorFromComponents(
      interpolate(lowerVector.east_kt, upperVector.east_kt, ratio),
      interpolate(lowerVector.north_kt, upperVector.north_kt, ratio)
    );
  }

  return CALM_VECTOR;
}

export function windCorrectedMotionForHeading({
  headingTrueDeg,
  trueAirspeedKt,
  wind,
  holdTrack
}: {
  headingTrueDeg: number;
  trueAirspeedKt: number;
  wind: WindVector;
  holdTrack: boolean;
}): WindCorrectedMotion {
  const normalizedHeading = normalizeHeading(headingTrueDeg);
  const airspeed = Math.max(0, Number.isFinite(trueAirspeedKt) ? trueAirspeedKt : 0);

  if (airspeed <= 0 || wind.speed_kt <= 0) {
    return {
      heading_true_deg: normalizedHeading,
      track_true_deg: normalizedHeading,
      ground_speed_kt: airspeed
    };
  }

  if (holdTrack) {
    return windCorrectedMotionForTrack(normalizedHeading, airspeed, wind);
  }

  const airVector = vectorToComponents(normalizedHeading, airspeed);
  const groundEastKt = airVector.east_kt + wind.east_kt;
  const groundNorthKt = airVector.north_kt + wind.north_kt;
  const groundSpeedKt = Math.hypot(groundEastKt, groundNorthKt);

  return {
    heading_true_deg: normalizedHeading,
    track_true_deg: groundSpeedKt > 0.001 ? headingFromComponents(groundEastKt, groundNorthKt) : normalizedHeading,
    ground_speed_kt: groundSpeedKt
  };
}

export function windCorrectionHeadingForTrack(
  trackTrueDeg: number,
  trueAirspeedKt: number,
  wind: WindVector
) {
  return windCorrectedMotionForTrack(trackTrueDeg, trueAirspeedKt, wind).heading_true_deg;
}

function windCorrectedMotionForTrack(
  trackTrueDeg: number,
  trueAirspeedKt: number,
  wind: WindVector
): WindCorrectedMotion {
  const track = normalizeHeading(trackTrueDeg);
  const airspeed = Math.max(0, Number.isFinite(trueAirspeedKt) ? trueAirspeedKt : 0);
  const trackUnit = vectorToComponents(track, 1);
  const rightUnit = vectorToComponents(normalizeHeading(track + 90), 1);
  const windAlongKt = wind.east_kt * trackUnit.east_kt + wind.north_kt * trackUnit.north_kt;
  const windRightKt = wind.east_kt * rightUnit.east_kt + wind.north_kt * rightUnit.north_kt;
  const requiredCrosswindCorrectionKt = -windRightKt;
  const maxCrosswindCorrectionKt = airspeed * 0.98;
  const correctedCrosswindKt = clampNumber(
    requiredCrosswindCorrectionKt,
    -maxCrosswindCorrectionKt,
    maxCrosswindCorrectionKt
  );
  const alongAirspeedKt = Math.sqrt(Math.max(0, airspeed ** 2 - correctedCrosswindKt ** 2));
  const airEastKt = trackUnit.east_kt * alongAirspeedKt + rightUnit.east_kt * correctedCrosswindKt;
  const airNorthKt = trackUnit.north_kt * alongAirspeedKt + rightUnit.north_kt * correctedCrosswindKt;
  const groundEastKt = airEastKt + wind.east_kt;
  const groundNorthKt = airNorthKt + wind.north_kt;
  const groundSpeedKt = Math.hypot(groundEastKt, groundNorthKt);

  return {
    heading_true_deg: headingFromComponents(airEastKt, airNorthKt),
    track_true_deg: groundSpeedKt > 0.001 ? headingFromComponents(groundEastKt, groundNorthKt) : track,
    ground_speed_kt: groundSpeedKt
  };
}

function windVectorFromLayer(layer: WindLayer): WindVector {
  const directionToDeg = normalizeHeading(layer.direction_from_deg + 180);
  const components = vectorToComponents(directionToDeg, Math.max(0, layer.speed_kt));

  return {
    ...components,
    speed_kt: Math.max(0, layer.speed_kt),
    direction_from_deg: normalizeHeading(layer.direction_from_deg),
    direction_to_deg: directionToDeg
  };
}

function windVectorFromComponents(eastKt: number, northKt: number): WindVector {
  const speedKt = Math.hypot(eastKt, northKt);
  const directionToDeg = speedKt > 0.001 ? headingFromComponents(eastKt, northKt) : 180;

  return {
    east_kt: eastKt,
    north_kt: northKt,
    speed_kt: speedKt,
    direction_from_deg: normalizeHeading(directionToDeg + 180),
    direction_to_deg: directionToDeg
  };
}

function vectorToComponents(headingTrueDeg: number, speedKt: number) {
  const radians = toRadians(normalizeHeading(headingTrueDeg));

  return {
    east_kt: Math.sin(radians) * speedKt,
    north_kt: Math.cos(radians) * speedKt
  };
}

function headingFromComponents(eastKt: number, northKt: number) {
  return normalizeHeading(toDegrees(Math.atan2(eastKt, northKt)));
}

function interpolate(start: number, end: number, ratio: number) {
  return start + (end - start) * clampNumber(ratio, 0, 1);
}

function normalizeHeading(value: number) {
  return ((value % 360) + 360) % 360;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
