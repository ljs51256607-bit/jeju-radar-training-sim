import { defaultScenarioStreamForm } from "./scenarioTraffic";
import type { ScenarioSnapshotV1 } from "./scenarioStorage";
import { DEFAULT_SCENARIO_OVERLAYS } from "./scopeViewModel";
import { defaultWindSettings } from "./windModel";
import type { AircraftState, RadarDataset } from "./types";

export const RADIO_FLOW_HIGH_TRAFFIC_PRESET_ID = "r07-high-traffic-radio-flow";
export const MISSED_APPROACH_RWY07_PRESET_ID = "r07-ils-missed-approach-flow";
export const HANDOFF_RWY07_PRESET_ID = "r07-handoff-contact-flow";
export const VISUAL_APPROACH_RWY07_PRESET_ID = "r07-visual-approach-flow";
const RADIO_FLOW_DOTOL_LATITUDE = 34.254278;
const RADIO_FLOW_DOTOL_LONGITUDE = 126.610167;
const MISSED_APPROACH_PRESET_SAVED_AT = "2026-05-27T00:05:00.000Z";
const MISSED_APPROACH_PRESET_SAVED_AT_MS = Date.parse(MISSED_APPROACH_PRESET_SAVED_AT);

export type BuiltInScenarioFlowKind =
  | "radio"
  | "traffic_stream"
  | "handoff"
  | "missed_approach"
  | "visual_approach"
  | "mixed";

export interface BuiltInScenarioFlowMetadata {
  kind: BuiltInScenarioFlowKind;
  label: string;
  trainingFocus: string;
  tags: string[];
}

export interface BuiltInScenarioPreset {
  id: string;
  description: string;
  flow: BuiltInScenarioFlowMetadata;
  dataset: RadarDataset;
  snapshot: ScenarioSnapshotV1;
}

const radioFlowDataset = {
  procedures: {
    fixes: [
      { id: "DOTOL", latitude: RADIO_FLOW_DOTOL_LATITUDE, longitude: RADIO_FLOW_DOTOL_LONGITUDE },
      { id: "UPGOS", latitude: 33.1, longitude: 126.1 },
      { id: "KAMIT", latitude: 33.4, longitude: 126.4 }
    ],
    stars: [],
    sids: [],
    approaches: [],
    visual_approach_rules: [],
    notes: []
  }
} as unknown as RadarDataset;

const missedApproachDataset = {
  procedures: {
    fixes: [
      { id: "RW070", latitude: 33.499881, longitude: 126.468472 },
      { id: "PC404", latitude: 33.545083, longitude: 126.5565 },
      { id: "PETAA", latitude: 33.521667, longitude: 126.926111 }
    ],
    approaches: [
      {
        id: "ILS_Z_LOC_Z_RWY_07",
        name: "ILS Z or LOC Z RWY 07",
        missed_approach:
          "Climb to 8 000 ft on track of 066° to PC404, then RIGHT turn on track of 102° to PETAA and hold."
      }
    ],
    stars: [],
    sids: [],
    visual_approach_rules: [],
    notes: []
  }
} as unknown as RadarDataset;

const handoffDataset = {
  handoffRules: {
    metadata: {
      name: "rkpc_handoff_rules",
      status: "rule_document"
    },
    tower_handoff_reference_geometry: [
      {
        id: "ARR_07_LIMSO_HANDOFF",
        type: "point_reference",
        applicable_procedures: ["ILS Z RWY 07"],
        fix_id: "LIMSO",
        reference_dataset: "rkpc_procedures.json",
        handoff_flow: "APP/ARR -> TWR"
      },
      {
        id: "DEP_TWR_TO_APP_0_5NM",
        type: "distance_reference",
        applicable_procedures: ["SID"],
        distance_from_departure_end_nm: 0.5,
        distance_tolerance_text: "활주로 종단으로부터 대략 1/2마일 통과 시",
        handoff_flow: "TWR -> APP/DC"
      }
    ]
  },
  procedures: {
    fixes: [
      { id: "LIMSO", latitude: 33.4175, longitude: 126.308611 },
      { id: "RW070", latitude: 33.499881, longitude: 126.468472 },
      { id: "RW250", latitude: 33.514878, longitude: 126.497642 },
      { id: "KAMIT", latitude: 33.4, longitude: 126.4 }
    ],
    approaches: [],
    stars: [],
    sids: [],
    visual_approach_rules: [],
    notes: []
  }
} as unknown as RadarDataset;

const visualApproachDataset = {
  procedures: {
    fixes: [
      { id: "YUMIN", latitude: 33.457139, longitude: 126.220972 },
      { id: "LIMSO", latitude: 33.4175, longitude: 126.308611 },
      { id: "RW070", latitude: 33.499881, longitude: 126.468472 }
    ],
    approaches: [],
    stars: [],
    sids: [],
    visual_approach_rules: [
      {
        id: "VISUAL_APPROACH_AIP_GENERAL",
        name: "AIP/Chart general visual approach gate",
        default_for_simulator: true,
        conditions: [
          "Ceiling above 500 ft plus MVA",
          "Visibility not less than 3 SM",
          "Vectors may be initiated by ATC or approved upon pilot request on traffic permitting basis"
        ]
      },
      {
        id: "RWY07_VISUAL_NOISE_ABATEMENT",
        name: "RWY 07 visual final alignment restriction",
        default_for_simulator: true,
        conditions: [
          "When conducting visual approach RWY 07, all arriving aircraft shall align the final approach course outside YDM 6 DME"
        ]
      }
    ],
    notes: []
  }
} as unknown as RadarDataset;

const appFirstContactCandidates: AircraftState[] = [
  highTrafficAppAircraft("seq1", "JJA111", 17000, 15000),
  highTrafficAppAircraft("seq2", "KAL222", 16000, 14000),
  highTrafficAppAircraft("seq3", "TWB333", 15000, 13000)
];

const radioFlowAircraft: AircraftState[] = [
  ...appFirstContactCandidates,
  {
    id: "dep-seq1",
    callsign: "AAR432",
    aircraft_type: "A321",
    flight_phase: "departure",
    latitude: 33.48,
    longitude: 126.5,
    heading_true_deg: 70,
    ground_speed_kt: 170,
    altitude_ft: 900,
    vertical_rate_fpm: 2200,
    route_mode: "procedure",
    owner_position: "DEP",
    planned_exit_fix: "KAMIT",
    procedure_name: "RNAV KAMIT 2E",
    procedure_kind: "SID",
    assigned: { altitude_ft: 10000 },
    pilot_first_contact: {
      role: "DEP",
      trigger_altitude_ft: 1200
    },
    frequency_state: "not_on_frequency",
    scratchpad: "KAM",
    scratchpad_auto_direct_token: "KAM"
  },
  {
    id: "flow-watch1",
    callsign: "JNA259",
    aircraft_type: "A321",
    flight_phase: "arrival",
    latitude: 33.22,
    longitude: 126.42,
    heading_true_deg: 250,
    ground_speed_kt: 230,
    altitude_ft: 11000,
    vertical_rate_fpm: -700,
    route_mode: "vector",
    owner_position: "APP",
    assigned: { heading_true_deg: 250, speed_kt: 230, altitude_ft: 8000 },
    frequency_state: "not_on_frequency",
    scratchpad: "H25 S23"
  }
];

const missedApproachFinalAircraft: AircraftState[] = [
  {
    id: "missed-rwy07-final1",
    callsign: "JJA117",
    aircraft_type: "B738",
    flight_phase: "arrival",
    latitude: 33.499881,
    longitude: 126.468472,
    heading_true_deg: 66,
    indicated_speed_kt: 145,
    ground_speed_kt: 145,
    altitude_ft: 900,
    vertical_rate_fpm: -500,
    route_mode: "procedure",
    next_fix: "RW070",
    procedure_id: "ILS_Z_LOC_Z_RWY_07",
    procedure_name: "ILS Z or LOC Z RWY 07",
    procedure_kind: "APP",
    procedure_route: ["YUMIN", "LIMSO", "RW070"],
    procedure_route_index: 2,
    approach_phase: "final",
    owner_position: "APP",
    target_runway: "07",
    assigned: {
      altitude_ft: 2900,
      speed_kt: 160
    },
    speed_control_mode: "managed",
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed",
    vertical_procedure_mode: "approach",
    scratchpad: "ILS",
    scratchpad_auto_procedure_token: "ILS",
    frequency_state: "not_on_frequency"
  }
];

const handoffFlowAircraft: AircraftState[] = [
  {
    id: "handoff-arr-rwy07-limso",
    callsign: "JJA207",
    aircraft_type: "B738",
    flight_phase: "arrival",
    latitude: 33.4175,
    longitude: 126.308611,
    heading_true_deg: 66,
    indicated_speed_kt: 180,
    ground_speed_kt: 180,
    altitude_ft: 2900,
    vertical_rate_fpm: 0,
    route_mode: "procedure",
    next_fix: "LIMSO",
    procedure_id: "ILS_Z_LOC_Z_RWY_07",
    procedure_name: "ILS Z or LOC Z RWY 07",
    procedure_kind: "APP",
    procedure_route: ["YUMIN", "LIMSO", "RW070"],
    procedure_route_index: 1,
    approach_phase: "final",
    owner_position: "APP",
    target_runway: "07",
    assigned: {
      altitude_ft: 2900,
      speed_kt: 180
    },
    speed_control_mode: "controller",
    altitude_control_mode: "controller",
    vertical_rate_control_mode: "controller",
    vertical_procedure_mode: "approach",
    scratchpad: "TWR",
    frequency_state: "on_frequency"
  },
  {
    id: "handoff-dep-rwy07-contact",
    callsign: "KAL432",
    aircraft_type: "A321",
    flight_phase: "departure",
    latitude: 33.518,
    longitude: 126.506,
    heading_true_deg: 70,
    ground_speed_kt: 185,
    altitude_ft: 1300,
    vertical_rate_fpm: 2200,
    route_mode: "procedure",
    owner_position: "DEP",
    departure_runway: "07",
    planned_exit_fix: "KAMIT",
    procedure_id: "KAMIT_2E",
    procedure_name: "RNAV KAMIT 2E",
    procedure_kind: "SID",
    assigned: {
      altitude_ft: 10000,
      speed_kt: 250
    },
    pilot_first_contact: {
      role: "DEP",
      trigger_altitude_ft: 1200
    },
    frequency_state: "not_on_frequency",
    scratchpad: "KAM",
    scratchpad_auto_direct_token: "KAM"
  }
];

const visualApproachFlowAircraft: AircraftState[] = [
  {
    id: "visual-rwy07-target",
    callsign: "JJA307",
    aircraft_type: "B738",
    flight_phase: "arrival",
    latitude: 33.455,
    longitude: 126.265,
    heading_true_deg: 70,
    indicated_speed_kt: 180,
    ground_speed_kt: 180,
    altitude_ft: 3500,
    vertical_rate_fpm: -500,
    route_mode: "vector",
    owner_position: "APP",
    target_runway: "07",
    approach_phase: "intermediate",
    assigned: {
      heading_true_deg: 70,
      altitude_ft: 3000,
      speed_kt: 180,
      vertical_rate_fpm: -500
    },
    speed_control_mode: "controller",
    altitude_control_mode: "controller",
    vertical_rate_control_mode: "controller",
    scratchpad: "VIS",
    frequency_state: "on_frequency"
  },
  {
    id: "visual-rwy07-sequence",
    callsign: "ABL549",
    aircraft_type: "A320",
    flight_phase: "arrival",
    latitude: 33.4175,
    longitude: 126.308611,
    heading_true_deg: 66,
    indicated_speed_kt: 170,
    ground_speed_kt: 170,
    altitude_ft: 2900,
    vertical_rate_fpm: 0,
    route_mode: "procedure",
    next_fix: "LIMSO",
    procedure_id: "ILS_Z_LOC_Z_RWY_07",
    procedure_name: "ILS Z or LOC Z RWY 07",
    procedure_kind: "APP",
    procedure_route: ["YUMIN", "LIMSO", "RW070"],
    procedure_route_index: 1,
    approach_phase: "final",
    owner_position: "APP",
    target_runway: "07",
    assigned: {
      altitude_ft: 2900,
      speed_kt: 170
    },
    speed_control_mode: "controller",
    altitude_control_mode: "controller",
    vertical_rate_control_mode: "controller",
    vertical_procedure_mode: "approach",
    scratchpad: "SEQ",
    frequency_state: "on_frequency"
  }
];

function missedApproachScenarioForm() {
  return {
    ...defaultScenarioStreamForm(),
    missedApproachProbability: "100"
  };
}

export const BUILT_IN_SCENARIO_PRESETS: BuiltInScenarioPreset[] = [
  {
    id: RADIO_FLOW_HIGH_TRAFFIC_PRESET_ID,
    description: "First-contact jam and sequenced retry training",
    flow: {
      kind: "radio",
      label: "RADIO FLOW",
      trainingFocus: "first_contact_jam_sequence",
      tags: ["first_contact", "radio_jam", "readback_sequence", "queue"]
    },
    dataset: radioFlowDataset,
    snapshot: {
      version: 1,
      id: RADIO_FLOW_HIGH_TRAFFIC_PRESET_ID,
      name: "R07 high traffic radio flow",
      savedAt: "2026-05-27T00:00:00.000Z",
      runway: "07",
      radar: {
        paused: true,
        surfaceMode: "training",
        densityMode: "balanced",
        scopeExtentMode: "tma",
        overlays: {
          ...DEFAULT_SCENARIO_OVERLAYS,
          rings: false
        },
        showChrome: true,
        simulationSpeed: 1
      },
      aircraft: radioFlowAircraft,
      traffic: {
        scenarioForm: defaultScenarioStreamForm(),
        activeArrivalStreams: [],
        activeDepartureWaves: []
      },
      weather: {
        wind: defaultWindSettings()
      }
    }
  },
  {
    id: MISSED_APPROACH_RWY07_PRESET_ID,
    description: "ILS Z RWY07 go-around and APP missed-approach first-contact training",
    flow: {
      kind: "missed_approach",
      label: "MISSED APP",
      trainingFocus: "ils_z_go_around_first_contact",
      tags: ["go_around", "missed_approach", "first_contact", "departure_retime"]
    },
    dataset: missedApproachDataset,
    snapshot: {
      version: 1,
      id: MISSED_APPROACH_RWY07_PRESET_ID,
      name: "R07 ILS missed approach flow",
      savedAt: MISSED_APPROACH_PRESET_SAVED_AT,
      runway: "07",
      radar: {
        paused: true,
        surfaceMode: "training",
        densityMode: "balanced",
        scopeExtentMode: "tma",
        overlays: {
          ...DEFAULT_SCENARIO_OVERLAYS,
          rings: false
        },
        showChrome: true,
        simulationSpeed: 1
      },
      aircraft: missedApproachFinalAircraft,
      traffic: {
        scenarioForm: missedApproachScenarioForm(),
        activeArrivalStreams: [],
        activeDepartureWaves: [
          {
            id: "missed-rwy07-dep-wave",
            runway: "07",
            departureRunway: "07",
            exitFix: "KAMIT",
            intervalMs: 180_000,
            totalCount: 2,
            spawnedCount: 0,
            lastSpawnAtMs: MISSED_APPROACH_PRESET_SAVED_AT_MS - 150_000,
            aircraftType: "A321",
            callsignPrefix: "MADEP",
            destinationAirport: "RKSS",
            altitudeFt: 10000,
            speedKt: 250,
            verticalRateFpm: 2200
          }
        ]
      },
      weather: {
        wind: defaultWindSettings()
      }
    }
  },
  {
    id: HANDOFF_RWY07_PRESET_ID,
    description: "RWY07 arrival tower handoff and departure APP contact training",
    flow: {
      kind: "handoff",
      label: "HANDOFF",
      trainingFocus: "app_twr_dep_contact_sequence",
      tags: ["arrival_handoff", "departure_contact", "tower_transfer", "first_contact"]
    },
    dataset: handoffDataset,
    snapshot: {
      version: 1,
      id: HANDOFF_RWY07_PRESET_ID,
      name: "R07 handoff contact flow",
      savedAt: "2026-05-27T00:10:00.000Z",
      runway: "07",
      radar: {
        paused: true,
        surfaceMode: "training",
        densityMode: "declutter",
        scopeExtentMode: "tma",
        overlays: {
          ...DEFAULT_SCENARIO_OVERLAYS,
          rings: false
        },
        showChrome: true,
        simulationSpeed: 1
      },
      aircraft: handoffFlowAircraft,
      traffic: {
        scenarioForm: defaultScenarioStreamForm(),
        activeArrivalStreams: [],
        activeDepartureWaves: []
      },
      weather: {
        wind: defaultWindSettings()
      }
    }
  },
  {
    id: VISUAL_APPROACH_RWY07_PRESET_ID,
    description: "RWY07 visual approach condition and sequencing training",
    flow: {
      kind: "visual_approach",
      label: "VISUAL APP",
      trainingFocus: "rwy07_visual_approach_condition_gate",
      tags: ["visual_approach", "rwy07", "sequence", "weather_gate"]
    },
    dataset: visualApproachDataset,
    snapshot: {
      version: 1,
      id: VISUAL_APPROACH_RWY07_PRESET_ID,
      name: "R07 visual approach flow",
      savedAt: "2026-05-27T00:15:00.000Z",
      runway: "07",
      radar: {
        paused: true,
        surfaceMode: "training",
        densityMode: "balanced",
        scopeExtentMode: "tma",
        overlays: {
          ...DEFAULT_SCENARIO_OVERLAYS,
          rings: false
        },
        showChrome: true,
        simulationSpeed: 1
      },
      aircraft: visualApproachFlowAircraft,
      traffic: {
        scenarioForm: defaultScenarioStreamForm(),
        activeArrivalStreams: [],
        activeDepartureWaves: []
      },
      weather: {
        wind: defaultWindSettings()
      }
    }
  }
];

export function builtInScenarioPresetById(presetId: string | null) {
  return BUILT_IN_SCENARIO_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

function highTrafficAppAircraft(
  id: string,
  callsign: string,
  altitudeFt: number,
  assignedAltitudeFt: number
): AircraftState {
  return {
    id,
    callsign,
    aircraft_type: "B738",
    flight_phase: "arrival",
    latitude: RADIO_FLOW_DOTOL_LATITUDE,
    longitude: RADIO_FLOW_DOTOL_LONGITUDE,
    heading_true_deg: 180,
    ground_speed_kt: 280,
    altitude_ft: altitudeFt,
    vertical_rate_fpm: -1000,
    route_mode: "procedure",
    owner_position: "APP",
    planned_entry_fix: "DOTOL",
    assigned: { altitude_ft: assignedAltitudeFt },
    pilot_first_contact: {
      role: "APP",
      trigger_fix: "DOTOL",
      trigger_distance_nm: 6
    },
    frequency_state: "not_on_frequency",
    scratchpad: "DOT",
    scratchpad_auto_direct_token: "DOT"
  };
}
