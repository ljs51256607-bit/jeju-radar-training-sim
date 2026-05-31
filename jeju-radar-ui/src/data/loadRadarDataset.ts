import type {
  AircraftPerformanceProfilesDocument,
  AirspaceReference,
  AirportReference,
  ChartPrimitivesDocument,
  CommandDelayProfilesDocument,
  ConventionalRadarSidDerivedGeometryDocument,
  FlightProfilesDocument,
  GeoFeatureCollection,
  HandoffRulesDocument,
  HotspotDescriptorDocument,
  MapLabelsDocument,
  ProceduresReference,
  RadarDataset,
  ReferencePointsDocument,
  ScenarioFixRoleRegisterDocument,
  TrafficSeedDocument,
  TransferRulesDocument,
  VerticalProfilesDocument
} from "../lib/types";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function loadRadarDataset(): Promise<RadarDataset> {
  const [
    airport,
    airspace,
    referencePoints,
    chartPrimitives,
    handoffRules,
    transferRules,
    hotspotDescriptors,
    procedures,
    videomapLines,
    videomapLabels,
    coastlineLines,
    atsRouteLines,
    specialUseAirspace,
    tmaAirspace,
    tmaBoundary,
    mvaSectors,
    rwy07ProcedureLines,
    rwy25ProcedureLines,
    rwy31ProcedureLines,
    conventionalSidReferenceOverlays,
    trafficSeed,
    scenarioFixRoles,
    conventionalRadarSidDerivedGeometry,
    aircraftPerformanceProfiles,
    commandDelayProfiles,
    flightProfiles,
    verticalProfiles
  ] = await Promise.all([
    fetchJson<AirportReference>("/reference/rkpc_airport.json"),
    fetchJson<AirspaceReference>("/reference/rkpc_airspace.json"),
    fetchJson<ReferencePointsDocument>("/reference/rkpc_reference_points.json"),
    fetchJson<ChartPrimitivesDocument>("/reference/rkpc_chart_primitives.json"),
    fetchJson<HandoffRulesDocument>("/reference/rkpc_handoff_rules.json"),
    fetchJson<TransferRulesDocument>("/reference/rkpc_transfer_rules.json"),
    fetchJson<HotspotDescriptorDocument>("/reference/rkpc_hotspot_descriptors.json"),
    fetchJson<ProceduresReference>("/reference/rkpc_procedures.json"),
    fetchJson<GeoFeatureCollection>("/geometry/videomap_lines.geojson"),
    fetchJson<MapLabelsDocument>("/geometry/videomap_labels.json"),
    fetchJson<GeoFeatureCollection>("/geometry/coastline_lines_ui.geojson"),
    fetchJson<GeoFeatureCollection>("/geometry/ats_routes.geojson"),
    fetchJson<GeoFeatureCollection>("/geometry/special_use_airspace.geojson"),
    fetchJson<GeoFeatureCollection>("/geometry/jeju_tma_airspace_display.geojson"),
    fetchJson<GeoFeatureCollection>("/geometry/tma_boundary.geojson"),
    fetchJson<GeoFeatureCollection>("/geometry/mva_sectors.geojson"),
    fetchJson<GeoFeatureCollection>("/geometry/rwy07_procedure_lines.geojson"),
    fetchJson<GeoFeatureCollection>("/geometry/rwy25_procedure_lines.geojson"),
    fetchJson<GeoFeatureCollection>("/geometry/rwy31_procedure_lines.geojson"),
    fetchJson<GeoFeatureCollection>("/geometry/rkpc_conventional_sid_reference_overlays.geojson"),
    fetchJson<TrafficSeedDocument>("/scenarios/traffic_seed.json"),
    fetchJson<ScenarioFixRoleRegisterDocument>("/authority/rkpc_scenario_fix_role_register.json"),
    fetchJson<ConventionalRadarSidDerivedGeometryDocument>("/authority/rkpc_conventional_radar_sid_derived_geometry.json"),
    fetchJson<AircraftPerformanceProfilesDocument>("/reference/aircraft_performance_profiles.json"),
    fetchJson<CommandDelayProfilesDocument>("/reference/command_delay_profiles.json"),
    fetchJson<FlightProfilesDocument>("/reference/rkpc_flight_profiles.json"),
    fetchJson<VerticalProfilesDocument>("/reference/rkpc_vertical_profiles.json")
  ]);

  return {
    airport,
    airspace,
    referencePoints,
    chartPrimitives,
    handoffRules,
    transferRules,
    hotspotDescriptors,
    geometry: {
      reference_points: referencePoints.reference_points,
      chart_guides: chartPrimitives.chart_guides,
      notes: []
    },
    procedures,
    videomapLines,
    videomapLabels,
    coastlineLines,
    atsRouteLines,
    specialUseAirspace,
    tmaAirspace,
    tmaBoundary,
    mvaSectors,
    rwy07ProcedureLines,
    rwy25ProcedureLines,
    rwy31ProcedureLines,
    conventionalSidReferenceOverlays,
    trafficSeed,
    scenarioFixRoles,
    conventionalRadarSidDerivedGeometry,
    aircraftPerformanceProfiles,
    commandDelayProfiles,
    flightProfiles,
    verticalProfiles
  };
}
