import { holdingPatternsForRunway } from "./holdingPatterns";
import { holdingPatternOverlayPath } from "./holdingOverlayGeometry";
import {
  collectDatasetCoordinates,
  createProjector,
  createProjectorFromBounds
} from "./radar";
import {
  buildGraticuleValues,
  labelCounterScale,
  labelVisibleForDensity,
  labelVisibleForOverlay,
  layoutLabels
} from "./radarMapLayout";
import type { ScenarioOverlayState } from "./scenarioStorage";
import type { DensityMode, GeoFeature, RadarDataset, RunwayMode } from "./types";

interface ProjectedPoint {
  x: number;
  y: number;
}

export function featureMatchesRunway(feature: GeoFeature, selectedRunway: RunwayMode) {
  const featureId = String(feature.properties.feature_id ?? "");
  const runway = String(feature.properties.runway ?? "");

  if (featureId.includes("RWY_07")) {
    return selectedRunway === "07";
  }

  if (featureId.includes("RWY_25") || featureId.includes("RWY_31")) {
    return selectedRunway === "25";
  }

  if (featureId.includes("ARR_25")) {
    return selectedRunway === "25";
  }

  if (runway === "07") {
    return selectedRunway === "07";
  }

  if (runway === "25" || runway === "31") {
    return selectedRunway === "25";
  }

  if (featureId.includes("SID_")) {
    return selectedRunway === "07";
  }

  return true;
}

export function zoomLodLabel(zoomScale: number) {
  if (zoomScale < 0.72) {
    return "OUT";
  }

  if (zoomScale < 0.95) {
    return "SECTOR";
  }

  if (zoomScale > 1.35) {
    return "DETAIL";
  }

  return "NORMAL";
}

export function initialViewForScope(initialZoom: number) {
  return {
    zoom: initialZoom,
    pan: { x: 0, y: 0 }
  };
}

export function formatMvaAltitude(altitudeFt: number) {
  return altitudeFt >= 1000 ? String(Math.round(altitudeFt / 100)) : String(altitudeFt);
}

export function guideVisibleForDensity(feature: GeoFeature, densityMode: DensityMode, selectedRunway: RunwayMode) {
  const featureId = String(feature.properties.feature_id ?? "");
  const layer = String(feature.properties.layer ?? "");
  const selectedRunwayFinalGuide =
    featureId.includes(`RWY_${selectedRunway}_FINAL`) ||
    (selectedRunway === "25" && featureId.includes("RWY_31_FINAL"));

  if (featureId === "RWY_07_ILS_Y_GUIDE" || featureId === "RWY_07_VOR_GUIDE") {
    return false;
  }

  if (densityMode === "full") {
    return true;
  }

  if (densityMode === "balanced") {
    return !featureId.includes("MISSED_APPROACH");
  }

  return (
    layer === "handoff_reference" ||
    selectedRunwayFinalGuide ||
    featureId.includes("ARR_25_DUKAL_TOKIN_WINDOW")
  );
}

export function resolveReferencePoint(dataset: RadarDataset, pointId: string): [number, number] | null {
  const directPoint = dataset.geometry.reference_points.find((point) => point.id === pointId);

  if (directPoint?.latitude && directPoint?.longitude) {
    return [directPoint.longitude, directPoint.latitude];
  }

  if (pointId === "ARP") {
    return [dataset.airport.airport_meta.arp.longitude, dataset.airport.airport_meta.arp.latitude];
  }

  if (pointId === "YDM") {
    const ydm = dataset.airport.navaids.find((navaid) => navaid.id === "YDM");
    return ydm ? [ydm.longitude, ydm.latitude] : null;
  }

  return null;
}

export function runwayThresholdCoordinate(dataset: RadarDataset, runwayId: string): [number, number] | null {
  const runway = dataset.airport.runways.find((candidate) => candidate.id === runwayId);

  if (!runway) {
    return null;
  }

  return [runway.threshold.longitude, runway.threshold.latitude];
}

export function compactProjectedSegment(start: ProjectedPoint, end: ProjectedPoint, ratio: number) {
  const center = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2
  };
  const halfVector = {
    x: ((end.x - start.x) * ratio) / 2,
    y: ((end.y - start.y) * ratio) / 2
  };

  return {
    start: { x: center.x - halfVector.x, y: center.y - halfVector.y },
    end: { x: center.x + halfVector.x, y: center.y + halfVector.y }
  };
}

export function layerClass(feature: GeoFeature, selectedRunway: RunwayMode) {
  const layer = String(feature.properties.layer ?? "");
  const featureId = String(feature.properties.feature_id ?? "");

  if (
    layer === "conventional_sid_reference_overlay" ||
    feature.properties.authority_level === "reference_overlay_only"
  ) {
    return "radar-procedure procedure-sid-reference";
  }

  if (featureId.includes("RWY_07") || featureId.includes("RWY_25") || featureId.includes("RWY_31")) {
    return selectedRunway === "07" ? "radar-guide guide-07" : "radar-guide guide-25";
  }

  if (featureId.includes("SID_")) {
    return "radar-guide guide-departure";
  }

  if (/^rwy\d{2}_star$/.test(layer)) {
    return "radar-procedure procedure-star";
  }

  if (/^rwy\d{2}_sid$/.test(layer)) {
    return "radar-procedure procedure-sid";
  }

  if (/^rwy\d{2}_final_approach$/.test(layer)) {
    return "radar-procedure procedure-ils-final";
  }

  if (layer === "handoff_reference") {
    return "radar-guide guide-handoff";
  }

  if (layer === "coastline") {
    return "radar-guide guide-coastline";
  }

  if (layer === "ats_route") {
    return "radar-guide guide-airway";
  }

  if (layer === "mva_sector_boundary") {
    return "radar-mva-sector";
  }

  return "radar-guide guide-neutral";
}

export function normalizeHeading(headingDeg: number) {
  return ((headingDeg % 360) + 360) % 360;
}

export function trueToMagneticHeading(headingTrueDeg: number, magneticVariationWestDeg: number) {
  return normalizeHeading(headingTrueDeg + magneticVariationWestDeg);
}

export function formatHeading(headingDeg: number) {
  return String(Math.round(normalizeHeading(headingDeg))).padStart(3, "0");
}

export interface RadarMapSceneViewModelOptions {
  dataset: RadarDataset;
  densityMode: DensityMode;
  mapSpawnPoint: { latitude: number; longitude: number } | null;
  overlays: ScenarioOverlayState;
  pan: { x: number; y: number };
  selectedRunway: RunwayMode;
  viewHeight: number;
  viewWidth: number;
  zoom: number;
  maxZoom: number;
  minZoom: number;
}

export function radarMapSceneViewModel({
  dataset,
  densityMode,
  mapSpawnPoint,
  maxZoom,
  minZoom,
  overlays,
  pan,
  selectedRunway,
  viewHeight,
  viewWidth,
  zoom
}: RadarMapSceneViewModelOptions) {
  const radarSite = resolveReferencePoint(
    dataset,
    dataset.geometry.chart_guides.concentric_rings?.center_point_id ?? "RADAR_SITE"
  );
  const runwayFeatures = dataset.videomapLines.features.filter(
    (feature) => feature.properties.layer === "runway_centerlines"
  );
  const secondaryRunwayFeatures = runwayFeatures.filter((feature) =>
    String(feature.properties.feature_id).includes("13_31")
  );
  const guideFeatures = dataset.videomapLines.features.filter(
    (feature) =>
      feature.properties.layer !== "runway_centerlines" &&
      featureMatchesRunway(feature, selectedRunway) &&
      guideVisibleForDensity(feature, densityMode, selectedRunway)
  );
  const coastlineFeatures =
    overlays.coastline && densityMode !== "declutter" ? dataset.coastlineLines.features : [];
  const airwayFeatures =
    overlays.airways && densityMode !== "declutter" ? dataset.atsRouteLines.features : [];
  const specialUseFeatures =
    overlays.specialUse && densityMode !== "declutter" ? dataset.specialUseAirspace.features : [];
  const mvaFeatures = overlays.mva ? dataset.mvaSectors.features : [];
  const mvaBoundaryFeatures = mvaFeatures.filter((feature) => feature.geometry.type !== "Point");
  const mvaAltitudeLabelFeatures = mvaFeatures.filter(
    (feature) => feature.geometry.type === "Point" && feature.properties.layer === "mva_altitude_label"
  );
  const showMvaAltitudeLabels = overlays.mva;
  const boundaryFeatures = overlays.boundary ? dataset.tmaAirspace.features : [];
  const surveillanceBoundaryFeatures = overlays.surveillanceBoundary ? dataset.tmaBoundary.features : [];
  const procedureFeatures = overlays.guides
    ? selectedRunway === "07"
      ? dataset.rwy07ProcedureLines.features
      : [
          ...dataset.rwy25ProcedureLines.features,
          ...(overlays.rwy31Sid ? dataset.rwy31ProcedureLines.features : [])
        ]
    : [];
  const conventionalSidReferenceSourceFeatures =
    dataset.conventionalSidReferenceOverlays?.features ?? [];
  const conventionalSidReferenceFeatures =
    overlays.guides && overlays.sidReference && selectedRunway === "07"
      ? conventionalSidReferenceSourceFeatures.filter((feature) =>
          featureMatchesRunway(feature, selectedRunway)
        )
      : [];
  const zoomScale = Math.min(maxZoom, Math.max(minZoom, zoom));
  const visibleFeatures = [
    ...coastlineFeatures,
    ...airwayFeatures,
    ...mvaBoundaryFeatures,
    ...(overlays.secondaryRunway ? secondaryRunwayFeatures : []),
    ...(overlays.guides ? guideFeatures : []),
    ...conventionalSidReferenceFeatures,
    ...procedureFeatures,
    ...boundaryFeatures,
    ...surveillanceBoundaryFeatures
  ];
  const visibleLabels = overlays.labels
    ? dataset.videomapLabels.labels.filter((label) =>
        labelVisibleForOverlay(label, selectedRunway, overlays) &&
        labelVisibleForDensity(label, selectedRunway, densityMode, zoomScale)
      )
    : [];
  const runwayThresholds = dataset.airport.runways.map(
    (runway) => [runway.threshold.longitude, runway.threshold.latitude] as [number, number]
  );
  const scopeExtent = dataset.geometry.chart_guides.scope_extent;
  const scopeFrameFeatures = [
    ...dataset.coastlineLines.features,
    ...dataset.atsRouteLines.features,
    ...dataset.specialUseAirspace.features,
    ...dataset.mvaSectors.features,
    ...dataset.tmaAirspace.features,
    ...dataset.rwy07ProcedureLines.features,
    ...dataset.rwy25ProcedureLines.features,
    ...dataset.rwy31ProcedureLines.features,
    ...conventionalSidReferenceSourceFeatures,
    ...runwayFeatures
  ];
  const scopeFramePoints = [...runwayThresholds, ...(radarSite ? [radarSite] : [])];
  const projector = scopeExtent
    ? createProjectorFromBounds(
        {
          westLongitude: scopeExtent.west_longitude,
          eastLongitude: scopeExtent.east_longitude,
          southLatitude: scopeExtent.south_latitude,
          northLatitude: scopeExtent.north_latitude
        },
        viewWidth,
        viewHeight
      )
    : createProjector(collectDatasetCoordinates(scopeFrameFeatures, [], scopeFramePoints), viewWidth, viewHeight);
  const holdingOverlays = overlays.guides
    ? holdingPatternsForRunway(selectedRunway)
        .map((pattern) => holdingPatternOverlayPath(pattern, dataset, (coordinate) =>
          projector.project(coordinate)
        ))
        .filter((pattern): pattern is NonNullable<typeof pattern> => Boolean(pattern))
    : [];
  const runway07Threshold = runwayThresholdCoordinate(dataset, "07");
  const runway25Threshold = runwayThresholdCoordinate(dataset, "25");
  const primaryRunwayBar =
    runway07Threshold && runway25Threshold
      ? compactProjectedSegment(projector.project(runway07Threshold), projector.project(runway25Threshold), 0.62)
      : null;
  const longitudeGridLines = scopeExtent
    ? buildGraticuleValues(
        scopeExtent.west_longitude,
        scopeExtent.east_longitude,
        scopeExtent.grid_interval_minutes
      )
    : [];
  const latitudeGridLines = scopeExtent
    ? buildGraticuleValues(
        scopeExtent.south_latitude,
        scopeExtent.north_latitude,
        scopeExtent.grid_interval_minutes
      )
    : [];
  const rangeRings = dataset.geometry.chart_guides.concentric_rings?.observed_ring_distances_nm ?? [];
  const activeOverlayNames = Object.entries(overlays)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key.toUpperCase());
  const zoomLod = zoomLodLabel(zoomScale);
  const labelScale = labelCounterScale(zoomScale);
  const mapSpawnScreenPoint = mapSpawnPoint
    ? projector.project([mapSpawnPoint.longitude, mapSpawnPoint.latitude])
    : null;
  const placedLabels = layoutLabels(
    visibleLabels,
    (coordinate) => projector.project(coordinate),
    selectedRunway,
    labelScale
  );
  const mapTransform = `translate(${viewWidth / 2 + pan.x} ${viewHeight / 2 + pan.y}) scale(${zoomScale}) translate(${-viewWidth / 2} ${-viewHeight / 2})`;

  return {
    activeOverlayNames,
    airwayFeatures,
    boundaryFeatures,
    coastlineFeatures,
    conventionalSidReferenceFeatures,
    guideFeatures,
    holdingOverlays,
    labelScale,
    latitudeGridLines,
    longitudeGridLines,
    mapSpawnScreenPoint,
    mapTransform,
    mvaAltitudeLabelFeatures,
    mvaBoundaryFeatures,
    mvaFeatures,
    placedLabels,
    primaryRunwayBar,
    procedureFeatures,
    projector,
    radarSite,
    rangeRings,
    runwayFeatures,
    secondaryRunwayFeatures,
    showMvaAltitudeLabels,
    specialUseFeatures,
    scopeExtent,
    surveillanceBoundaryFeatures,
    visibleFeatures,
    visibleLabels,
    zoomLod,
    zoomScale
  };
}
