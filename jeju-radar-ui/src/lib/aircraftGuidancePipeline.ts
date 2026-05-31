import { buildAircraftGuidancePlan } from "./aircraftGuidancePlanner";
import { applyAircraftGuidanceExecution } from "./aircraftGuidanceExecution";
import { applyAircraftGuidanceStatus } from "./aircraftGuidanceStatus";
import { applyFlightProfileAutomation } from "./flightProfileGuidance";
import type { AircraftState, RadarDataset, WindSettings } from "./types";
import { applyVerticalProfileGuidance } from "./verticalProfileGuidance";

export function applyAircraftGuidancePipeline(
  aircraft: AircraftState,
  dataset: RadarDataset,
  currentTimeMs: number,
  options: { wind?: WindSettings } = {}
): AircraftState {
  const verticallyManagedAircraft = usesPlannerNativeVerticalProfile(aircraft)
    ? aircraft
    : applyVerticalProfileGuidance(aircraft, dataset, currentTimeMs);
  const flightProfileAircraft = applyFlightProfileAutomation(verticallyManagedAircraft, dataset, currentTimeMs);
  const guidancePlan = buildAircraftGuidancePlan(flightProfileAircraft, dataset, currentTimeMs, {
    wind: options.wind
  });
  const guidanceExecutedAircraft = applyAircraftGuidanceExecution(flightProfileAircraft, guidancePlan);

  return applyAircraftGuidanceStatus(guidanceExecutedAircraft, dataset, currentTimeMs, {
    wind: options.wind
  });
}

function usesPlannerNativeVerticalProfile(aircraft: AircraftState) {
  return (
    aircraft.route_mode === "procedure" &&
    (aircraft.procedure_kind === "APP" || aircraft.procedure_kind === "STAR")
  );
}
