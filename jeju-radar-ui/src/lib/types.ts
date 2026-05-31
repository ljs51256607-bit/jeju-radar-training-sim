export type RunwayMode = "07" | "25";
export type DepartureRunway = "07" | "25" | "31";
export type SurfaceMode = "exact" | "training";
export type DensityMode = "full" | "balanced" | "declutter";
export type ScopeExtentMode = "tma";
export type AircraftCommandKind = "HDG" | "SPD" | "ALT" | "VS" | "DCT" | "STAR" | "SID" | "ILS";
export type AircraftQuickCommandField = "heading" | "speed" | "altitude" | "verticalRate";
export type ProcedureMenuAction =
  | "STAR_CXL"
  | "STAR_DES"
  | "ILS"
  | "KAMIT"
  | "AKPON"
  | "TAMNA"
  | "PANSI"
  | "LIMDI";

export interface RunwayReference {
  id: string;
  true_bearing_deg: number;
  length_m: number;
  width_m: number;
  threshold: {
    latitude: number;
    longitude: number;
    elevation_m?: number;
  };
}

export interface FrequencyReference {
  position: string;
  callsign: string;
  frequency_mhz: number;
  notes?: string;
}

export interface NavaidReference {
  id: string;
  type: string;
  latitude: number;
  longitude: number;
  notes?: string;
}

export interface AirportReference {
  airport_meta: {
    icao: string;
    name: string;
    mag_var?: string;
    arp: {
      latitude: number;
      longitude: number;
    };
  };
  runways: RunwayReference[];
  frequencies: FrequencyReference[];
  navaids: NavaidReference[];
  notes: string[];
}

export interface ControllerPosition {
  id: string;
  name: string;
  abbreviation: string;
  responsibility_summary: string;
}

export interface HandoffPoint {
  id: string;
  from_position: string;
  to_position: string;
  criteria_text: string;
  classification: string;
}

export interface AirspaceReference {
  controller_positions: ControllerPosition[];
  handoff_points: HandoffPoint[];
  notes: string[];
}

export interface ReferencePoint {
  id: string;
  type: string;
  latitude?: number;
  longitude?: number;
  reference_dataset?: string;
  reference_key?: string;
}

export interface GeometryReference {
  reference_points: ReferencePoint[];
  chart_guides: {
    scope_extent?: {
      id: string;
      west_longitude: number;
      east_longitude: number;
      south_latitude: number;
      north_latitude: number;
      grid_interval_minutes: number;
      notes?: string[];
      source_file?: string;
      source_section?: string;
    };
    concentric_rings?: {
      center_point_id: string;
      observed_ring_distances_nm: number[];
      notes: string[];
    };
    airspace_class_rules?: Array<{
      class: string;
      rules: string[];
      source_file?: string;
      source_section?: string;
    }>;
  };
  notes: string[];
}

export interface ReferencePointsDocument {
  metadata: Record<string, unknown>;
  reference_points: ReferencePoint[];
}

export interface ChartPrimitivesDocument {
  metadata: Record<string, unknown>;
  chart_guides: GeometryReference["chart_guides"];
  visual_reference_geometry: Array<{
    id: string;
    type: string;
    applies_runway?: string;
    center_navaid_id?: string;
    radius_nm?: number;
    constraint_text?: string;
    source_file?: string;
    source_section?: string;
  }>;
}

export interface ProcedureRecord {
  id: string;
  name: string;
  runway: string;
  route_text?: string;
  paired_runway_mode?: string;
  entry_fixes?: string[];
  initial_fixes?: string[];
  final_fixes?: string[];
  constraints?: string[];
  holding?: string[];
  missed_approach?: string;
  approach_type?: string;
  extraction_status?: string;
  source_file?: string;
  source_section?: string;
  runtime_authority?: string;
  motion_source?: string;
  reference_overlay_role?: string;
  exact_runtime_route_allowed?: boolean;
  training_runtime_path_allowed?: boolean;
}

export type MissedApproachLegType = "track_to_fix" | "turn_track_to_fix";
export type MissedApproachTurnDirection = "left" | "right";

export interface MissedApproachLeg {
  type: MissedApproachLegType;
  fix_id: string;
  published_track_deg: number;
  turn_direction?: MissedApproachTurnDirection;
}

export interface MissedApproachHold {
  fix_id: string;
  altitude_ft: number;
}

export type HoldingPatternKind = "missed" | "star" | "atc";
export type HoldingTurnDirection = "left" | "right";
export type HoldingEntryType = "direct" | "parallel" | "teardrop";
export type HoldingPhase =
  | "entry_to_fix"
  | "entry_parallel_outbound"
  | "entry_teardrop_outbound"
  | "turn_inbound"
  | "outbound"
  | "inbound";

export interface HoldingPattern {
  id: string;
  kind: HoldingPatternKind;
  fix_id: string;
  anchor_type?: "fix" | "present_position";
  anchor_latitude?: number;
  anchor_longitude?: number;
  anchor_deferred_until_ms?: number;
  inbound_course_deg: number;
  turn_direction: HoldingTurnDirection;
  leg_time_min: number;
  min_altitude_ft?: number;
  max_altitude_ft?: number;
  max_speed_kt?: number;
  source: string;
  procedure_id?: string;
  runway?: RunwayMode;
  notes?: string[];
}

export interface AircraftHoldingState {
  pattern_id: string;
  fix_id: string;
  entry_type: HoldingEntryType;
  phase: HoldingPhase;
  inbound_course_deg: number;
  turn_direction: HoldingTurnDirection;
  leg_time_min: number;
  phase_started_at_ms: number;
  entry_initial_heading_deg?: number;
  entry_target_heading_deg?: number;
  established_at_ms?: number;
}

export interface MissedApproachProfile {
  id: string;
  approach_id: string;
  name: string;
  runway: RunwayMode;
  target_altitude_ft: number;
  initial_speed_kt: number;
  initial_climb_fpm: number;
  route: string[];
  legs: MissedApproachLeg[];
  hold: MissedApproachHold;
  source_text: string;
}

export interface ProceduresReference {
  fixes: Array<{
    id: string;
    latitude: number;
    longitude: number;
  }>;
  stars: ProcedureRecord[];
  sids: ProcedureRecord[];
  approaches: ProcedureRecord[];
  visual_approach_rules: Array<{
    runway: string;
    condition_summary?: string;
    special_notes?: string[];
  }>;
  notes: string[];
}

export interface HandoffReference {
  id: string;
  type: string;
  applicable_procedures?: string[];
  fix_id?: string;
  start_fix_id?: string;
  end_fix_id?: string;
  reference_runway?: string;
  distance_from_threshold_nm?: number;
  distance_from_departure_end_nm?: number;
  distance_tolerance_text?: string;
  handoff_flow: string;
}

export interface HandoffRulesDocument {
  metadata: Record<string, unknown>;
  tower_handoff_reference_geometry: HandoffReference[];
}

export interface TransferAnchor {
  airway: string;
  fix_id?: string;
  fix_name?: string;
  default_altitude_text: string;
  runway_25_variant_text?: string;
  special_condition_text?: string;
  from_unit: string;
  to_unit: string;
  geometry_status?: string;
}

export interface TransferRulesDocument {
  metadata: Record<string, unknown>;
  interfacility_transfer_anchors: {
    arrivals_into_jeju_tma: TransferAnchor[];
    departures_and_overflights_out_of_jeju_tma: TransferAnchor[];
  };
}

export interface HotspotReferenceZone {
  id: string;
  runway_group: string;
  anchor_refs: string[];
  description: string;
  geometry_status: string;
}

export interface HotspotDescriptorDocument {
  metadata: Record<string, unknown>;
  hotspot_reference_zones: HotspotReferenceZone[];
}

export interface GeoFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "LineString" | "MultiLineString" | "Polygon" | "Point";
    coordinates: unknown;
  };
}

export interface GeoFeatureCollection {
  type: "FeatureCollection";
  name?: string;
  metadata?: Record<string, unknown>;
  features: GeoFeature[];
}

export interface MapLabel {
  id: string;
  text: string;
  latitude: number;
  longitude: number;
  layer: string;
  source: string;
}

export interface MapLabelsDocument {
  metadata: Record<string, unknown>;
  labels: MapLabel[];
}

export interface AircraftAssignment {
  heading_true_deg?: number;
  speed_kt?: number;
  altitude_ft?: number;
  vertical_rate_fpm?: number;
}

export type LevelRestrictionCancellationScope = "STAR" | "APP_FIX" | "APP_ALL" | "DIRECT_FIX";

export interface LevelRestrictionCancellationPolicy {
  scope: LevelRestrictionCancellationScope;
  fix_id?: string;
  requires_confirmation?: boolean;
}

export type SpeedRestrictionCancellationScope = "FIX" | "ACTIVE_NEXT";

export interface SpeedRestrictionCancellationPolicy {
  scope: SpeedRestrictionCancellationScope;
  fix_id?: string;
  requires_confirmation?: boolean;
}

export type AircraftGuidanceProfileStatus =
  | "stable"
  | "high_but_recoverable"
  | "too_high"
  | "late_descent"
  | "unable";

export interface AircraftGuidanceStatus {
  generated_at_ms: number;
  mode: string;
  active_fix_id?: string;
  status: AircraftGuidanceProfileStatus;
  display_label?: "HIGH" | "LATE" | "UNABLE";
  reason?: string;
  constraint_fix?: string;
  target_altitude_ft?: number;
  target_speed_kt?: number;
  target_vertical_rate_fpm?: number;
  required_vertical_rate_fpm?: number;
  max_vertical_rate_fpm?: number;
  required_climb_gradient_ft_per_nm?: number;
  max_climb_gradient_ft_per_nm?: number;
  climb_gradient_feasible?: boolean;
  remaining_distance_nm?: number;
  late_by_nm?: number;
  landing_feasible?: boolean;
  landing_required_vertical_rate_fpm?: number;
  landing_distance_nm?: number;
}

export type AircraftSpeedControlMode = "controller" | "managed" | "released";
export type AircraftVerticalControlMode = "controller" | "managed";
export type AircraftVerticalProcedureMode = "des_via" | "cancel_level" | "approach" | "controller";
export type AircraftEnergyMode =
  | "normal"
  | "expedite_descent"
  | "expedite_climb"
  | "increase_descent_rate"
  | "increase_climb_rate";
export type AircraftControllerSpeedPolicyType = "target" | "minimum" | "maximum" | "minimum_practical";

export type AircraftSpeedReleaseCondition =
  | {
      type: "passing_altitude";
      altitude_ft: number;
    }
  | {
      type: "passing_fix";
      fix_id: string;
    };

export interface AircraftControllerSpeedPolicy {
  type: AircraftControllerSpeedPolicyType;
  speed_kt: number;
  active_at_ms?: number;
  release_condition?: AircraftSpeedReleaseCondition;
}

export interface AircraftTurnState {
  target_heading_true_deg: number;
  bank_deg: number;
  direction: -1 | 0 | 1;
}

export interface AircraftOneCircleTurnState {
  target_heading_true_deg: number;
  direction: -1 | 1;
  start_heading_true_deg: number;
  last_heading_true_deg: number;
  accumulated_turn_deg: number;
  required_turn_deg: number;
  started_at_ms?: number;
}

export interface DepartureRollState {
  active: boolean;
  runway: string;
  end_latitude: number;
  end_longitude: number;
  total_distance_nm: number;
  release_altitude_ft: number;
  release_speed_kt: number;
  accel_kt_sec: number;
}

export interface ProcedureCaptureTransitionState {
  active_fix_id: string;
  next_fix_id: string;
  started_at_ms: number;
  duration_ms: number;
  elapsed_ms?: number;
  from_heading_true_deg: number;
  target_heading_true_deg: number;
  start_latitude: number;
  start_longitude: number;
}

export type PilotFirstContactRole = "APP" | "DEP" | "MISSED_APP";
export type AircraftFrequencyState = "not_on_frequency" | "first_contacted" | "on_frequency";

export interface PilotFirstContactState {
  role: PilotFirstContactRole;
  done?: boolean;
  awaiting_controller_response?: boolean;
  trigger_fix?: string;
  trigger_distance_nm?: number;
  trigger_altitude_ft?: number;
  contacted_at_ms?: number;
  call_text?: string;
  last_jammed_at_ms?: number;
  retry_after_ms?: number;
  jammed_count?: number;
  standby?: boolean;
  standby_at_ms?: number;
}

export interface WindLayer {
  altitude_ft: number;
  direction_from_deg: number;
  speed_kt: number;
}

export interface WindSettings {
  enabled: boolean;
  layers: WindLayer[];
}

export interface AircraftState {
  id: string;
  callsign: string;
  aircraft_type: string;
  flight_phase: "arrival" | "departure" | "overflight";
  latitude: number;
  longitude: number;
  heading_true_deg: number;
  indicated_speed_kt?: number;
  ground_speed_kt: number;
  altitude_ft: number;
  vertical_rate_fpm: number;
  route_mode: "vector" | "direct" | "procedure" | "hold";
  next_fix?: string;
  procedure_id?: string;
  procedure_name?: string;
  procedure_kind?: "STAR" | "SID" | "APP";
  procedure_runtime_authority?: string;
  procedure_motion_source?: string;
  procedure_reference_overlay_role?: string;
  procedure_exact_runtime_route_allowed?: boolean;
  procedure_training_runtime_path_allowed?: boolean;
  procedure_route?: string[];
  procedure_route_index?: number;
  approach_phase?: "initial" | "intermediate" | "final" | "missed" | "landed";
  holding_pattern?: HoldingPattern;
  holding_state?: AircraftHoldingState;
  missed_approach_profile_id?: string;
  missed_approach_activated_at_ms?: number;
  missed_approach_reported_at_ms?: number;
  landing_state?: "landed";
  landed_at_ms?: number;
  planned_entry_fix?: string;
  planned_exit_fix?: string;
  guidance_active_at_ms?: number;
  heading_active_at_ms?: number;
  speed_active_at_ms?: number;
  altitude_active_at_ms?: number;
  vertical_rate_active_at_ms?: number;
  speed_control_mode?: AircraftSpeedControlMode;
  altitude_control_mode?: AircraftVerticalControlMode;
  vertical_rate_control_mode?: AircraftVerticalControlMode;
  vertical_procedure_mode?: AircraftVerticalProcedureMode;
  controller_assigned_speed_kt?: number;
  controller_speed_policy?: AircraftControllerSpeedPolicy;
  execution_heading_true_deg?: number;
  execution_speed_kt?: number;
  execution_altitude_ft?: number;
  execution_vertical_rate_fpm?: number;
  managed_speed_kt?: number;
  managed_altitude_constraint_fix?: string;
  managed_altitude_constraint_ft?: number;
  managed_vertical_rate_fpm?: number;
  pending_descent_altitude_ft?: number;
  star_via_clearance_altitude_ft?: number;
  energy_mode?: AircraftEnergyMode;
  guidance_status?: AircraftGuidanceStatus;
  cancelled_approach_level_restriction_fixes?: string[];
  cancelled_speed_restriction_fixes?: string[];
  target_runway?: string;
  departure_runway?: DepartureRunway;
  assigned?: AircraftAssignment;
  turn_state?: AircraftTurnState;
  one_circle_turn_state?: AircraftOneCircleTurnState;
  procedure_capture_transition?: ProcedureCaptureTransitionState;
  owner_position?: "APP" | "DEP";
  arrival_airport?: string;
  destination_airport?: string;
  scratchpad?: string;
  scratchpad_auto_direct_token?: string;
  scratchpad_auto_procedure_token?: string;
  departure_roll?: DepartureRollState;
  pilot_first_contact?: PilotFirstContactState;
  frequency_state?: AircraftFrequencyState;
  scenario_stream_id?: string;
  scenario_stream_role?: "arrival_stream" | "departure_wave";
  squawk?: string;
  remark?: string;
}

export interface TrafficSeedDocument {
  metadata: Record<string, unknown>;
  aircraft: AircraftState[];
}

export type ScenarioFixRole = "arrival_entry" | "departure_exit" | "conventional_gate";

export interface ScenarioFixRoleRecord {
  fix_id: string;
  latitude: number;
  longitude: number;
  coordinate_status: string;
  scenario_roles: ScenarioFixRole[];
  overlap_gate: boolean;
  route_family: string[];
  arrival: {
    enabled: boolean;
    basis: string | null;
    runways: string[];
    procedures: string[];
  };
  departure: {
    enabled: boolean;
    basis: string | null;
    runways: string[];
    procedures: string[];
  };
  notes?: string;
}

export interface ScenarioFixRoleRegisterDocument {
  metadata: Record<string, unknown>;
  fixes: ScenarioFixRoleRecord[];
}

export interface AircraftPerformanceProfile {
  id: string;
  aircraft_types: string[];
  normal_bank_deg: number;
  max_bank_deg: number;
  max_turn_rate_deg_sec: number;
  roll_rate_deg_sec?: number;
  rollout_heading_delta_deg?: number;
  accel_kt_sec: number;
  decel_kt_sec: number;
  climb_accel_factor?: number;
  high_altitude_accel_factor?: number;
  approach_decel_factor?: number;
  tas_factor_per_1000_ft?: number;
  max_tas_factor?: number;
  high_altitude_threshold_ft?: number;
  climb_fpm: number;
  descent_fpm: number;
  climb_acceleration_vertical_penalty_fpm_per_kt_sec?: number;
  expedite_descent_fpm?: number;
  expedite_descent_rate_factor?: number;
  expedite_descent_speed_bias_kt?: number;
  expedite_descent_max_speed_kt?: number;
  expedite_climb_fpm?: number;
  expedite_climb_rate_factor?: number;
  increase_rate_step_fpm?: number;
  deceleration_descent_min_fpm?: number;
  deceleration_descent_buffer_sec?: number;
  vertical_rate_change_fpm_sec?: number;
  altitude_capture_ft: number;
  altitude_capture_taper_ft?: number;
  minimum_capture_vertical_rate_fpm?: number;
  notes?: string[];
  sources?: string[];
}

export interface AircraftPerformanceProfilesDocument {
  metadata: Record<string, unknown>;
  default_profile_id: string;
  profiles: AircraftPerformanceProfile[];
}

export interface CommandDelayProfile {
  command: AircraftCommandKind;
  min_delay_sec: number;
  nominal_delay_sec: number;
  max_delay_sec: number;
  notes?: string[];
}

export interface CommandDelayProfilesDocument {
  metadata: Record<string, unknown>;
  profiles: CommandDelayProfile[];
}

export interface FlightProfileSpeedRange {
  min: number;
  max: number;
}

export interface FlightProfileSpeedGate {
  altitude_ft: number;
  max_speed_kt: number;
  release_margin_kt?: number;
}

export interface FlightProfileArrivalRules {
  entry_speed_kt: FlightProfileSpeedRange;
  speed_gate: FlightProfileSpeedGate;
  minimum_speed_command?: {
    target_speed_kt: number;
    typical_below_altitude_ft?: number;
  };
  approach_landing_speed?: {
    threshold_distance_nm: number;
    default_speed_kt: number;
    by_aircraft_type?: Record<string, number>;
  };
  default_descent_fpm: number;
  default_climb_fpm: number;
  procedure_speed_max_kt: Record<string, number>;
  approach_phase_speed_max_kt: Record<string, number>;
}

export interface FlightProfileDepartureRules {
  below_10000_speed_kt: number;
  above_10000_speed_kt: number;
  speed_transition_altitude_ft: number;
  initial_climb_fpm: number;
  mid_climb_fpm: number;
  default_descent_fpm: number;
}

export interface FlightProfileRecord {
  id: string;
  global_max_speed_kt?: number;
  arrival: FlightProfileArrivalRules;
  departure: FlightProfileDepartureRules;
  notes?: string[];
}

export interface FlightProfilesDocument {
  metadata: Record<string, unknown>;
  default_profile_id: string;
  profiles: FlightProfileRecord[];
}

export type VerticalConstraintType = "at" | "at_or_above" | "at_or_below" | "window";

export interface VerticalConstraintRecord {
  fix_id: string;
  type: VerticalConstraintType;
  altitude_ft?: number;
  min_altitude_ft?: number;
  max_altitude_ft?: number;
  speed_kt?: number;
  source_text: string;
  source_file?: string;
  source_section?: string;
}

export type ProcedureLevelConstraintKind = "climb_gradient";

export interface ProcedureLevelConstraintRecord {
  kind: ProcedureLevelConstraintKind;
  climb_gradient_pct?: number;
  purpose?: string;
  required_until_altitude_ft?: number;
  source_text: string;
  source_file?: string;
  source_section?: string;
}

export interface ProcedureVerticalConstraintSet {
  procedure_id: string;
  procedure_kind: "STAR" | "SID" | "APP";
  procedure_level_constraints?: ProcedureLevelConstraintRecord[];
  constraints: VerticalConstraintRecord[];
  notes?: string[];
}

export interface VerticalProfileRecord {
  id: string;
  glide_path_ft_per_nm: number;
  constraint_capture_ft: number;
  min_descent_fpm: number;
  max_descent_fpm: number;
  min_climb_fpm: number;
  max_climb_fpm: number;
  procedure_constraints: ProcedureVerticalConstraintSet[];
  notes?: string[];
}

export interface VerticalProfilesDocument {
  metadata: Record<string, unknown>;
  default_profile_id: string;
  profiles: VerticalProfileRecord[];
}

export interface ConventionalSidDerivedPoint {
  point_id: string;
  label?: string;
  source_navaid?: string;
  radial_magnetic_deg?: number;
  bearing_true_deg?: number;
  distance_nm?: number;
  crossing_altitude_ft?: number;
  latitude: number;
  longitude: number;
  derivation_method?: string;
  source_text?: string;
}

export interface ConventionalSidRuntimePathRouteEntry {
  kind: "derived_point" | "constructed_intercept" | "terminal_fix";
  point_id?: string;
  fix_id?: string;
  label?: string;
  latitude?: number;
  longitude?: number;
  source_navaid?: string;
  radial_magnetic_deg?: number;
  cju_dme_nm?: number;
  inbound_from_point_id?: string;
  inbound_heading_true_deg?: number;
  outbound_course_true_deg?: number;
  intercept_angle_deg?: number;
  crossing_altitude_ft?: number;
  source_text?: string;
}

export interface ConventionalSidRuntimePath {
  path_id: string;
  path_status: string;
  runtime_class?: string;
  motion_authority?: string;
  training_runtime_path_allowed?: boolean;
  exact_runtime_route_allowed?: boolean;
  reference_overlay_policy?: {
    published_chart_linework_role?: string;
    source_chart_linework_may_drive_motion?: boolean;
    exact_overlay_allowed?: boolean;
    candidate_overlay_label?: string;
  };
  route: ConventionalSidRuntimePathRouteEntry[];
  notes?: string[];
}

export interface ConventionalSidDerivedProcedure {
  procedure_id: string;
  procedure_name: string;
  procedure_type: "SID";
  runway: string;
  route_definition_type: string;
  derivation_status: string;
  runtime_route_allowed: boolean;
  automation_status: string;
  magnetic_to_true_offset_deg: number;
  source_file?: string;
  source_section?: string;
  route_text?: string;
  derived_points: ConventionalSidDerivedPoint[];
  derived_segments?: Array<Record<string, unknown>>;
  turn_capture_model?: Record<string, unknown>;
  runtime_path?: ConventionalSidRuntimePath;
  remaining_blockers?: string[];
}

export interface ConventionalRadarSidDerivedGeometryDocument {
  metadata: Record<string, unknown>;
  summary: Record<string, unknown>;
  procedures: ConventionalSidDerivedProcedure[];
}

export interface RadarDataset {
  airport: AirportReference;
  airspace: AirspaceReference;
  referencePoints: ReferencePointsDocument;
  chartPrimitives: ChartPrimitivesDocument;
  handoffRules: HandoffRulesDocument;
  transferRules: TransferRulesDocument;
  hotspotDescriptors: HotspotDescriptorDocument;
  geometry: GeometryReference;
  procedures: ProceduresReference;
  videomapLines: GeoFeatureCollection;
  videomapLabels: MapLabelsDocument;
  coastlineLines: GeoFeatureCollection;
  atsRouteLines: GeoFeatureCollection;
  specialUseAirspace: GeoFeatureCollection;
  tmaAirspace: GeoFeatureCollection;
  tmaBoundary: GeoFeatureCollection;
  mvaSectors: GeoFeatureCollection;
  rwy07ProcedureLines: GeoFeatureCollection;
  rwy25ProcedureLines: GeoFeatureCollection;
  rwy31ProcedureLines: GeoFeatureCollection;
  conventionalSidReferenceOverlays: GeoFeatureCollection;
  trafficSeed: TrafficSeedDocument;
  scenarioFixRoles: ScenarioFixRoleRegisterDocument;
  conventionalRadarSidDerivedGeometry?: ConventionalRadarSidDerivedGeometryDocument;
  aircraftPerformanceProfiles: AircraftPerformanceProfilesDocument;
  commandDelayProfiles: CommandDelayProfilesDocument;
  flightProfiles: FlightProfilesDocument;
  verticalProfiles: VerticalProfilesDocument;
}
