import fs from "node:fs";
import path from "node:path";

const workspaceRoot = path.resolve(process.cwd(), "..");
const dataRoot = path.join(workspaceRoot, "data");
const atsRegister = readJson(path.join(dataRoot, "authority", "ats_route_register.json"));
const scenarioFixRoles = readJson(path.join(dataRoot, "authority", "rkpc_scenario_fix_role_register.json"));
const transferRules = readJson(path.join(dataRoot, "reference", "rkpc_transfer_rules.json"));
const procedures = readJson(path.join(dataRoot, "reference", "rkpc_procedures.json"));
const atsRouteLines = readJson(path.join(dataRoot, "geometry", "ats_routes.geojson"));

const airport = {
  latitude: 33.511306,
  longitude: 126.493028
};
const errors = [];
const summaries = [];

for (const roleFix of scenarioFixRoles.fixes) {
  if (!roleFix.arrival.enabled) {
    continue;
  }

  const fixId = normalizeId(roleFix.fix_id);
  const fix = resolveFix(fixId);
  const transferAnchor = transferRules.interfacility_transfer_anchors.arrivals_into_jeju_tma.find(
    (anchor) => normalizeId(anchor.fix_id ?? anchor.fix_name ?? "") === fixId
  );

  if (!fix) {
    errors.push(`${fixId}: missing fix coordinate`);
    continue;
  }

  if (!transferAnchor) {
    errors.push(`${fixId}: missing arrival transfer airway anchor`);
    continue;
  }

  const selectedLeg = selectAirwayOutboundLeg(fix, transferAnchor.airway);

  if (!selectedLeg) {
    errors.push(`${fixId}: cannot resolve outside ATS airway leg for ${transferAnchor.airway}`);
    continue;
  }

  summaries.push(
    `${fixId.padEnd(6)} ${selectedLeg.airwayId.padEnd(4)} via ${selectedLeg.adjacentPointId.padEnd(6)} ` +
      `spawn-out ${formatHeading(selectedLeg.outboundBearing)} inbound ${formatHeading(selectedLeg.inboundBearing)}`
  );
}

if (errors.length > 0) {
  console.error("Arrival stream airway verification failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Arrival stream airway verification passed");
for (const summary of summaries) {
  console.log(summary);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeId(value) {
  return String(value).trim().toUpperCase();
}

function resolveFix(fixId) {
  const fix = procedures.fixes.find((candidateFix) => normalizeId(candidateFix.id) === fixId);

  return fix
    ? {
        latitude: fix.latitude,
        longitude: fix.longitude
      }
    : null;
}

function airwayIdsFromText(airwayText) {
  return airwayText
    .split(/[\/,\s]+/)
    .map((airwayId) => normalizeId(airwayId).replace("*", ""))
    .filter(Boolean);
}

function selectAirwayOutboundLeg(fix, airwayText) {
  const fixDistanceFromAirport = distanceNm(airport, fix);
  let selectedLeg = null;

  for (const airwayId of airwayIdsFromText(airwayText)) {
    const route = atsRegister.routes.find((candidateRoute) => normalizeId(candidateRoute.route_id) === airwayId);
    const displayFeature = atsRouteLines.features.find(
      (feature) => normalizeId(feature.properties.route_id ?? "") === airwayId
    );

    if (!route || !displayFeature) {
      continue;
    }

    let nearestIndex = -1;
    let nearestDistanceNm = Number.POSITIVE_INFINITY;

    route.points.forEach((point, index) => {
      const distanceToFixNm = distanceNm(fix, point);

      if (distanceToFixNm < nearestDistanceNm) {
        nearestDistanceNm = distanceToFixNm;
        nearestIndex = index;
      }
    });

    if (nearestIndex < 0 || nearestDistanceNm > 0.5) {
      continue;
    }

    for (const adjacentIndex of [nearestIndex - 1, nearestIndex + 1]) {
      const adjacentPoint = route.points[adjacentIndex];

      if (!adjacentPoint) {
        continue;
      }

      const outsideScoreNm = distanceNm(airport, adjacentPoint) - fixDistanceFromAirport;
      const outboundBearing = bearingDeg(fix, adjacentPoint);
      const inboundBearing = bearingDeg(adjacentPoint, fix);

      if (!selectedLeg || outsideScoreNm > selectedLeg.outsideScoreNm) {
        selectedLeg = {
          airwayId,
          adjacentPointId: adjacentPoint.point_id,
          outsideScoreNm,
          outboundBearing,
          inboundBearing
        };
      }
    }
  }

  return selectedLeg;
}

function distanceNm(first, second) {
  const earthRadiusNm = 3440.065;
  const startLat = toRadians(first.latitude);
  const endLat = toRadians(second.latitude);
  const deltaLat = toRadians(second.latitude - first.latitude);
  const deltaLon = toRadians(second.longitude - first.longitude);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusNm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function bearingDeg(first, second) {
  const startLat = toRadians(first.latitude);
  const endLat = toRadians(second.latitude);
  const deltaLon = toRadians(second.longitude - first.longitude);
  const y = Math.sin(deltaLon) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLon);

  return normalizeHeading(toDegrees(Math.atan2(y, x)));
}

function normalizeHeading(heading) {
  return ((heading % 360) + 360) % 360;
}

function formatHeading(heading) {
  return String(Math.round(normalizeHeading(heading))).padStart(3, "0");
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}
