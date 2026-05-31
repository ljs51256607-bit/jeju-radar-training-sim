import type {
  ConventionalSidDerivedProcedure,
  ConventionalSidRuntimePathRouteEntry,
  DepartureRunway,
  ProcedureRecord,
  RadarDataset
} from "./types";

export interface ConventionalSidRuntimeFixTarget {
  id: string;
  latitude: number;
  longitude: number;
}

export interface ConventionalSidReferenceOverlayPolicy {
  publishedChartLineworkRole?: string;
  sourceChartLineworkMayDriveMotion?: boolean;
  exactOverlayAllowed?: boolean;
  candidateOverlayLabel?: string;
}

export interface ConventionalSidRuntimeRoute {
  procedure: ProcedureRecord;
  route: string[];
  runtimeClass: string;
  motionAuthority: string;
  exactRuntimeRouteAllowed: boolean;
  trainingRuntimePathAllowed: boolean;
  referenceOverlayPolicy: ConventionalSidReferenceOverlayPolicy;
}

function normalizeFixId(fixId: string) {
  return fixId.trim().toUpperCase();
}

function routeEntryId(entry: ConventionalSidRuntimePathRouteEntry) {
  return entry.point_id ?? entry.fix_id;
}

function runtimePathAllowed(procedure: ConventionalSidDerivedProcedure) {
  return procedure.runtime_path?.training_runtime_path_allowed === true;
}

function routeEntries(procedure: ConventionalSidDerivedProcedure) {
  return procedure.runtime_path?.route ?? [];
}

function terminalExitFixId(procedure: ConventionalSidDerivedProcedure) {
  const route = routeEntries(procedure);
  const lastEntry = route[route.length - 1];

  return lastEntry?.fix_id ? normalizeFixId(lastEntry.fix_id) : undefined;
}

export function conventionalSidRuntimeFix(
  dataset: RadarDataset,
  fixId: string
): ConventionalSidRuntimeFixTarget | null {
  const normalizedFixId = normalizeFixId(fixId);
  const procedures = dataset.conventionalRadarSidDerivedGeometry?.procedures ?? [];

  for (const procedure of procedures) {
    for (const point of procedure.derived_points ?? []) {
      if (normalizeFixId(point.point_id) === normalizedFixId) {
        return {
          id: point.point_id,
          latitude: point.latitude,
          longitude: point.longitude
        };
      }
    }

    for (const entry of routeEntries(procedure)) {
      const entryId = routeEntryId(entry);

      if (
        entryId &&
        normalizeFixId(entryId) === normalizedFixId &&
        typeof entry.latitude === "number" &&
        Number.isFinite(entry.latitude) &&
        typeof entry.longitude === "number" &&
        Number.isFinite(entry.longitude)
      ) {
        return {
          id: entryId,
          latitude: entry.latitude,
          longitude: entry.longitude
        };
      }
    }
  }

  return null;
}

export function conventionalSidRuntimeRouteForExitFix(
  dataset: RadarDataset,
  departureRunway: DepartureRunway,
  exitFix: string
): ConventionalSidRuntimeRoute | null {
  const normalizedExitFix = normalizeFixId(exitFix);
  const procedures = dataset.conventionalRadarSidDerivedGeometry?.procedures ?? [];
  const procedure = procedures.find(
    (candidate) =>
      candidate.procedure_type === "SID" &&
      candidate.runway === departureRunway &&
      runtimePathAllowed(candidate) &&
      terminalExitFixId(candidate) === normalizedExitFix
  );

  if (!procedure?.runtime_path) {
    return null;
  }

  const runtimeClass = procedure.runtime_path.runtime_class ?? "training_runtime_route";
  const motionAuthority =
    procedure.runtime_path.motion_authority ?? "text_radial_dme_derived_training_path";
  const exactRuntimeRouteAllowed = procedure.runtime_path.exact_runtime_route_allowed === true;
  const trainingRuntimePathAllowed = procedure.runtime_path.training_runtime_path_allowed === true;
  const referenceOverlayPolicy = procedure.runtime_path.reference_overlay_policy ?? {
    published_chart_linework_role: "reference_overlay_only",
    source_chart_linework_may_drive_motion: false,
    exact_overlay_allowed: false,
    candidate_overlay_label: "REF/CAND"
  };
  const route = routeEntries(procedure)
    .map(routeEntryId)
    .filter((routeFixId): routeFixId is string => Boolean(routeFixId));

  if (route.length < 2 || route[route.length - 1] !== normalizedExitFix) {
    return null;
  }

  return {
    procedure: {
      id: procedure.procedure_id,
      name: procedure.procedure_name,
      runway: procedure.runway,
      route_text: route.join(" - "),
      constraints: [
        "Training runtime route derived from conventional/RADAR SID text/radial/DME authority artifact.",
        ...(exactRuntimeRouteAllowed === false
          ? ["Not authorized as exact published route automation."]
          : []),
        ...(referenceOverlayPolicy.published_chart_linework_role === "reference_overlay_only"
          ? ["Published chart linework is reference overlay only and must not drive aircraft motion."]
          : [])
      ],
      extraction_status: procedure.runtime_path.path_status,
      source_file: procedure.source_file,
      source_section: procedure.source_section,
      runtime_authority: runtimeClass,
      motion_source: motionAuthority,
      reference_overlay_role:
        referenceOverlayPolicy.published_chart_linework_role === "reference_overlay_only"
          ? "source_chart_linework_reference_overlay_only"
          : referenceOverlayPolicy.published_chart_linework_role,
      exact_runtime_route_allowed: exactRuntimeRouteAllowed,
      training_runtime_path_allowed: trainingRuntimePathAllowed
    },
    route,
    runtimeClass,
    motionAuthority,
    exactRuntimeRouteAllowed,
    trainingRuntimePathAllowed,
    referenceOverlayPolicy: {
      publishedChartLineworkRole: referenceOverlayPolicy.published_chart_linework_role,
      sourceChartLineworkMayDriveMotion:
        referenceOverlayPolicy.source_chart_linework_may_drive_motion,
      exactOverlayAllowed: referenceOverlayPolicy.exact_overlay_allowed,
      candidateOverlayLabel: referenceOverlayPolicy.candidate_overlay_label
    }
  };
}
