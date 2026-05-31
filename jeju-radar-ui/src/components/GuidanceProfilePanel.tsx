import type { AircraftState } from "../lib/types";

function formatGuidanceReasonDetail(status: NonNullable<AircraftState["guidance_status"]>) {
  if (status.landing_feasible === false) {
    return "LDG UNABLE";
  }

  if (status.climb_gradient_feasible === false) {
    return "CG UNABLE";
  }

  if (status.reason?.includes("10000ft speed gate")) {
    return "A100 SPD GATE";
  }

  if (status.status === "late_descent") {
    return "LATE SPD";
  }

  if (status.status === "too_high") {
    return "TOO HIGH";
  }

  if (status.status === "high_but_recoverable") {
    return "HIGH, LDG OK";
  }

  if (status.status === "unable") {
    return "PROFILE UNABLE";
  }

  return "PLAN OK";
}

function guidanceProfilePanelMeta(status?: AircraftState["guidance_status"]) {
  if (!status) {
    return { label: "OK", tone: "ok" as const };
  }

  if (status.status === "unable" || status.landing_feasible === false) {
    return { label: "UNABLE", tone: "critical" as const };
  }

  if (status.status === "too_high") {
    return { label: "TOO HIGH", tone: "critical" as const };
  }

  if (status.status === "late_descent") {
    return { label: "LATE", tone: "warning" as const };
  }

  if (status.status === "high_but_recoverable") {
    return { label: "HIGH OK", tone: "warning" as const };
  }

  return { label: "OK", tone: "ok" as const };
}

function formatGuidanceProfileAltitude(altitudeFt: number) {
  const hundreds = String(Math.round(altitudeFt / 100)).padStart(3, "0");
  return altitudeFt < 14000 ? `A${hundreds}` : `F${hundreds}`;
}

function formatGuidanceProfileTarget(status?: AircraftState["guidance_status"]) {
  if (!status) {
    return "-";
  }

  const targetParts = [
    status.constraint_fix ?? status.active_fix_id,
    typeof status.target_altitude_ft === "number"
      ? formatGuidanceProfileAltitude(status.target_altitude_ft)
      : undefined,
    typeof status.target_speed_kt === "number" ? `${Math.round(status.target_speed_kt)}KT` : undefined
  ].filter(Boolean);

  return targetParts.length > 0 ? targetParts.join(" ") : "-";
}

function formatGuidanceProfileVertical(status?: AircraftState["guidance_status"]) {
  if (!status) {
    return "-";
  }

  const verticalParts = [
    typeof status.target_vertical_rate_fpm === "number" && Math.abs(status.target_vertical_rate_fpm) > 1
      ? `CMD ${formatSignedFpm(status.target_vertical_rate_fpm)}`
      : undefined,
    typeof status.required_vertical_rate_fpm === "number" && Math.abs(status.required_vertical_rate_fpm) > 1
      ? `REQ ${formatSignedFpm(status.required_vertical_rate_fpm)}`
      : undefined,
    typeof status.max_vertical_rate_fpm === "number" && status.max_vertical_rate_fpm > 0
      ? `MAX ${Math.round(status.max_vertical_rate_fpm)}`
      : undefined
  ].filter(Boolean);

  return verticalParts.length > 0 ? verticalParts.join(" / ") : "-";
}

function formatGuidanceProfileClimbGradient(status?: AircraftState["guidance_status"]) {
  if (
    !status ||
    typeof status.required_climb_gradient_ft_per_nm !== "number" ||
    !Number.isFinite(status.required_climb_gradient_ft_per_nm)
  ) {
    return "-";
  }

  const gradientParts = [
    `${Math.round(status.required_climb_gradient_ft_per_nm)}`,
    typeof status.max_climb_gradient_ft_per_nm === "number" &&
    Number.isFinite(status.max_climb_gradient_ft_per_nm)
      ? `MAX ${Math.round(status.max_climb_gradient_ft_per_nm)}`
      : undefined
  ].filter(Boolean);

  return `${gradientParts.join(" / ")} FT/NM`;
}

function formatGuidanceProfileDistance(status?: AircraftState["guidance_status"]) {
  if (!status) {
    return "-";
  }

  const distanceParts = [
    typeof status.remaining_distance_nm === "number" ? `${status.remaining_distance_nm.toFixed(1)}NM` : undefined,
    typeof status.late_by_nm === "number" && status.late_by_nm > 0.1
      ? `LATE ${status.late_by_nm.toFixed(1)}NM`
      : undefined
  ].filter(Boolean);

  return distanceParts.length > 0 ? distanceParts.join(" / ") : "-";
}

function formatGuidanceProfileLanding(status?: AircraftState["guidance_status"]) {
  const landingRequired =
    typeof status?.landing_required_vertical_rate_fpm === "number" &&
    Number.isFinite(status.landing_required_vertical_rate_fpm) &&
    Math.abs(status.landing_required_vertical_rate_fpm) > 1
      ? ` / REQ ${formatSignedFpm(status.landing_required_vertical_rate_fpm)}`
      : "";

  if (status?.landing_feasible === true) {
    return `FEASIBLE${landingRequired}`;
  }

  if (status?.landing_feasible === false) {
    return `INFEASIBLE${landingRequired}`;
  }

  return "-";
}

function formatSignedFpm(verticalRateFpm: number) {
  const rounded = Math.round(verticalRateFpm);

  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export default function GuidanceProfilePanel({ aircraft }: { aircraft: AircraftState }) {
  const status = aircraft.guidance_status;
  const meta = guidanceProfilePanelMeta(status);
  const rows = [
    { label: "TGT", value: formatGuidanceProfileTarget(status) },
    { label: "VS", value: formatGuidanceProfileVertical(status) },
    { label: "CG", value: formatGuidanceProfileClimbGradient(status) },
    { label: "DIST", value: formatGuidanceProfileDistance(status) },
    { label: "LDG", value: formatGuidanceProfileLanding(status) },
    { label: "WHY", value: status ? formatGuidanceReasonDetail(status) : "PLAN OK" }
  ];

  return (
    <section
      className={`aircraft-profile-panel aircraft-profile-${meta.tone}`}
      aria-label="Guidance profile status"
    >
      <div className="aircraft-profile-header">
        <span>PROFILE</span>
        <strong>{meta.label}</strong>
      </div>
      <div className="aircraft-profile-grid">
        {rows.map((row) => (
          <div className="aircraft-profile-row" key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
