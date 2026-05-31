from __future__ import annotations

import csv
import json
import math
from pathlib import Path
from typing import Any


WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
AIRPORT_PATH = WORKSPACE_ROOT / "data" / "reference" / "rkpc_airport.json"
PERFORMANCE_PROFILE_PATH = WORKSPACE_ROOT / "data" / "reference" / "aircraft_performance_profiles.json"
ROUTE_REGISTER_PATH = WORKSPACE_ROOT / "data" / "authority" / "rkpc_sid_star_route_register.csv"
TERMINAL_FIX_REGISTER_PATH = WORKSPACE_ROOT / "data" / "authority" / "rkpc_terminal_fix_register.csv"
GEOMETRY_AUDIT_PATH = WORKSPACE_ROOT / "data" / "authority" / "rkpc_conventional_radar_sid_geometry_audit.json"
DERIVED_GEOMETRY_PATH = WORKSPACE_ROOT / "data" / "authority" / "rkpc_conventional_radar_sid_derived_geometry.json"

EARTH_RADIUS_NM = 3440.065


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)
    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def distance_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    haversine = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * EARTH_RADIUS_NM * math.asin(math.sqrt(haversine))


def heading_delta_deg(actual: float, expected: float) -> float:
    return abs((actual - expected + 180) % 360 - 180)


def turn_rate_deg_sec(ground_speed_kt: float, bank_deg: float, max_turn_rate_deg_sec: float) -> float:
    if ground_speed_kt <= 0 or bank_deg <= 0:
        raise AssertionError("Turn-rate inputs must be positive")
    bank_limited_turn_rate = (1091 * math.tan(math.radians(bank_deg))) / ground_speed_kt
    return min(max_turn_rate_deg_sec, max(0.1, bank_limited_turn_rate))


def turn_radius_nm(ground_speed_kt: float, turn_rate: float) -> float:
    return (ground_speed_kt / 3600) / math.radians(turn_rate)


def navaid_lookup(airport: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {navaid["id"]: navaid for navaid in airport.get("navaids", [])}


def route_row_lookup() -> dict[str, dict[str, str]]:
    return {row["procedure_id"]: row for row in read_csv(ROUTE_REGISTER_PATH)}


def terminal_fix_lookup() -> dict[str, dict[str, str]]:
    return {row["fix_id"]: row for row in read_csv(TERMINAL_FIX_REGISTER_PATH)}


def default_performance_profile() -> dict[str, Any]:
    performance_data = read_json(PERFORMANCE_PROFILE_PATH)
    default_profile_id = performance_data["default_profile_id"]
    profile = next(
        (
            row
            for row in performance_data.get("profiles", [])
            if row.get("id") == default_profile_id
        ),
        None,
    )
    if not profile:
        raise AssertionError(f"Missing default aircraft performance profile: {default_profile_id}")
    return profile


def audit_lookup() -> dict[str, dict[str, Any]]:
    return {
        row["procedure_id"]: row
        for row in read_json(GEOMETRY_AUDIT_PATH).get("procedures", [])
    }


def assert_close(actual: float, expected: float, tolerance: float, label: str) -> None:
    if abs(actual - expected) > tolerance:
        raise AssertionError(f"{label}: expected {expected}, got {actual}")


def main() -> None:
    if not DERIVED_GEOMETRY_PATH.exists():
        raise AssertionError(f"Missing derived geometry file: {DERIVED_GEOMETRY_PATH.relative_to(WORKSPACE_ROOT)}")

    airport = read_json(AIRPORT_PATH)
    navaids = navaid_lookup(airport)
    performance = default_performance_profile()
    route_rows = route_row_lookup()
    terminal_fixes = terminal_fix_lookup()
    audit_rows = audit_lookup()
    derived = read_json(DERIVED_GEOMETRY_PATH)

    ipdas = next(
        (row for row in derived.get("procedures", []) if row.get("procedure_id") == "IPDAS_4K"),
        None,
    )
    if not ipdas:
        raise AssertionError("IPDAS_4K derived geometry is required as first radial/DME implementation")

    if ipdas.get("runtime_route_allowed") is not False:
        raise AssertionError("IPDAS_4K derived geometry must not enable runtime route before full route audit")
    if ipdas.get("derivation_status") != "training_runtime_path_constructed":
        raise AssertionError("IPDAS_4K derivation_status must be training_runtime_path_constructed")
    if ipdas.get("automation_status") != "blocked_pending_exact_chart_validation":
        raise AssertionError("IPDAS_4K automation_status must be blocked_pending_exact_chart_validation")
    if route_rows["IPDAS_4K"]["route_definition_type"] != "radial_dme":
        raise AssertionError("IPDAS_4K route register type must remain radial_dme")
    if audit_rows["IPDAS_4K"]["runtime_route_allowed"] is not False:
        raise AssertionError("IPDAS_4K geometry audit must still block runtime route")

    magnetic_to_true_offset_deg = ipdas.get("magnetic_to_true_offset_deg")
    assert_close(magnetic_to_true_offset_deg, -8, 0.001, "IPDAS_4K magnetic_to_true_offset_deg")

    first_point = next(
        (
            point
            for point in ipdas.get("derived_points", [])
            if point.get("point_id") == "IPDAS_4K_YDM_R067_D6_5"
        ),
        None,
    )
    if not first_point:
        raise AssertionError("IPDAS_4K_YDM_R067_D6_5 derived point is required")

    ydm = navaids["YDM"]
    expected_true_bearing = (first_point["radial_magnetic_deg"] + magnetic_to_true_offset_deg) % 360
    actual_true_bearing = bearing_deg(
        float(ydm["latitude"]),
        float(ydm["longitude"]),
        float(first_point["latitude"]),
        float(first_point["longitude"]),
    )
    actual_distance = distance_nm(
        float(ydm["latitude"]),
        float(ydm["longitude"]),
        float(first_point["latitude"]),
        float(first_point["longitude"]),
    )

    if heading_delta_deg(actual_true_bearing, expected_true_bearing) > 0.05:
        raise AssertionError(
            "IPDAS_4K_YDM_R067_D6_5 true bearing mismatch: "
            f"expected {expected_true_bearing}, got {actual_true_bearing}"
        )
    assert_close(actual_distance, 6.5, 0.02, "IPDAS_4K_YDM_R067_D6_5 distance_nm")

    intercept_point = next(
        (
            point
            for point in ipdas.get("derived_points", [])
            if point.get("point_id") == "IPDAS_4K_CJU_R013_D30"
        ),
        None,
    )
    if not intercept_point:
        raise AssertionError("IPDAS_4K_CJU_R013_D30 derived intercept point is required")
    if intercept_point.get("crossing_altitude_ft") != 7000:
        raise AssertionError("IPDAS_4K_CJU_R013_D30 crossing_altitude_ft must be 7000")

    cju = navaids["CJU"]
    intercept_expected_true_bearing = (
        intercept_point["radial_magnetic_deg"] + magnetic_to_true_offset_deg
    ) % 360
    intercept_actual_true_bearing = bearing_deg(
        float(cju["latitude"]),
        float(cju["longitude"]),
        float(intercept_point["latitude"]),
        float(intercept_point["longitude"]),
    )
    intercept_actual_distance = distance_nm(
        float(cju["latitude"]),
        float(cju["longitude"]),
        float(intercept_point["latitude"]),
        float(intercept_point["longitude"]),
    )

    if heading_delta_deg(intercept_actual_true_bearing, intercept_expected_true_bearing) > 0.05:
        raise AssertionError(
            "IPDAS_4K_CJU_R013_D30 true bearing mismatch: "
            f"expected {intercept_expected_true_bearing}, got {intercept_actual_true_bearing}"
        )
    assert_close(intercept_actual_distance, 30.0, 0.02, "IPDAS_4K_CJU_R013_D30 distance_nm")

    ipdas_fix = next(
        (
            fix
            for fix in route_rows["IPDAS_4K"]["fix_sequence"].split(" > ")
            if fix == "IPDAS"
        ),
        None,
    )
    if ipdas_fix != "IPDAS":
        raise AssertionError("IPDAS_4K route register must retain IPDAS endpoint")

    route_segment = next(
        (
            segment
            for segment in ipdas.get("derived_segments", [])
            if segment.get("segment_id") == "IPDAS_4K_D6_5_TO_CJU_R013_D30"
        ),
        None,
    )
    if not route_segment:
        raise AssertionError("IPDAS_4K_D6_5_TO_CJU_R013_D30 derived segment is required")
    if route_segment.get("from_point_id") != "IPDAS_4K_YDM_R067_D6_5":
        raise AssertionError("IPDAS_4K_D6_5_TO_CJU_R013_D30 segment from_point_id mismatch")
    if route_segment.get("to_point_id") != "IPDAS_4K_CJU_R013_D30":
        raise AssertionError("IPDAS_4K_D6_5_TO_CJU_R013_D30 segment to_point_id mismatch")
    if route_segment.get("runtime_leg_allowed") is not False:
        raise AssertionError("IPDAS_4K_D6_5_TO_CJU_R013_D30 segment must remain blocked for runtime")

    ipdas_terminal_fix = terminal_fixes.get("IPDAS")
    if not ipdas_terminal_fix:
        raise AssertionError("IPDAS terminal fix must exist in rkpc_terminal_fix_register.csv")

    ipdas_lat = float(ipdas_terminal_fix["latitude"])
    ipdas_lon = float(ipdas_terminal_fix["longitude"])
    ipdas_expected_true_bearing = (13 + magnetic_to_true_offset_deg) % 360
    ipdas_actual_true_bearing = bearing_deg(
        float(cju["latitude"]),
        float(cju["longitude"]),
        ipdas_lat,
        ipdas_lon,
    )
    ipdas_actual_distance = distance_nm(
        float(cju["latitude"]),
        float(cju["longitude"]),
        ipdas_lat,
        ipdas_lon,
    )
    if heading_delta_deg(ipdas_actual_true_bearing, ipdas_expected_true_bearing) > 0.1:
        raise AssertionError(
            "IPDAS terminal fix is not aligned with CJU R013: "
            f"expected true {ipdas_expected_true_bearing}, got {ipdas_actual_true_bearing}"
        )
    assert_close(ipdas_actual_distance, 52.3, 0.2, "IPDAS CJU DME")

    continuation_segment = next(
        (
            segment
            for segment in ipdas.get("derived_segments", [])
            if segment.get("segment_id") == "IPDAS_4K_CJU_R013_D30_TO_IPDAS"
        ),
        None,
    )
    if not continuation_segment:
        raise AssertionError("IPDAS_4K_CJU_R013_D30_TO_IPDAS continuation segment is required")
    if continuation_segment.get("from_point_id") != "IPDAS_4K_CJU_R013_D30":
        raise AssertionError("IPDAS_4K_CJU_R013_D30_TO_IPDAS segment from_point_id mismatch")
    if continuation_segment.get("to_fix_id") != "IPDAS":
        raise AssertionError("IPDAS_4K_CJU_R013_D30_TO_IPDAS segment to_fix_id mismatch")
    if continuation_segment.get("radial_magnetic_deg") != 13:
        raise AssertionError("IPDAS_4K_CJU_R013_D30_TO_IPDAS radial_magnetic_deg must be 13")
    if continuation_segment.get("endpoint_crossing_altitude_ft") != 9000:
        raise AssertionError("IPDAS_4K_CJU_R013_D30_TO_IPDAS endpoint_crossing_altitude_ft must be 9000")
    if continuation_segment.get("runtime_leg_allowed") is not False:
        raise AssertionError("IPDAS_4K_CJU_R013_D30_TO_IPDAS segment must remain blocked for runtime")

    continuation_actual_bearing = bearing_deg(
        float(intercept_point["latitude"]),
        float(intercept_point["longitude"]),
        ipdas_lat,
        ipdas_lon,
    )
    continuation_actual_distance = distance_nm(
        float(intercept_point["latitude"]),
        float(intercept_point["longitude"]),
        ipdas_lat,
        ipdas_lon,
    )
    if heading_delta_deg(continuation_actual_bearing, ipdas_expected_true_bearing) > 0.2:
        raise AssertionError(
            "IPDAS_4K_CJU_R013_D30_TO_IPDAS segment bearing mismatch: "
            f"expected {ipdas_expected_true_bearing}, got {continuation_actual_bearing}"
        )
    assert_close(
        float(continuation_segment["distance_nm"]),
        continuation_actual_distance,
        0.05,
        "IPDAS_4K_CJU_R013_D30_TO_IPDAS distance_nm",
    )

    turn_capture_model = ipdas.get("turn_capture_model")
    if not turn_capture_model:
        raise AssertionError("IPDAS_4K turn_capture_model is required before route automation can be considered")
    if turn_capture_model.get("model_status") != "tolerance_model_only_not_runtime_path":
        raise AssertionError("IPDAS_4K turn_capture_model must remain a tolerance-only model")
    if turn_capture_model.get("turn_start_point_id") != "IPDAS_4K_YDM_R067_D6_5":
        raise AssertionError("IPDAS_4K turn_capture_model turn_start_point_id mismatch")
    if turn_capture_model.get("turn_direction") != "left":
        raise AssertionError("IPDAS_4K turn_capture_model turn_direction must be left")
    if turn_capture_model.get("target_radial_source_navaid") != "CJU":
        raise AssertionError("IPDAS_4K turn_capture_model target_radial_source_navaid must be CJU")
    if turn_capture_model.get("target_radial_magnetic_deg") != 13:
        raise AssertionError("IPDAS_4K turn_capture_model target_radial_magnetic_deg must be 13")
    if turn_capture_model.get("runtime_path_allowed") is not False:
        raise AssertionError("IPDAS_4K turn_capture_model runtime_path_allowed must remain false")

    initial_track_true_deg = float(turn_capture_model["initial_track_true_deg"])
    target_course_true_deg = float(turn_capture_model["target_course_true_deg"])
    assert_close(initial_track_true_deg, 59.0, 0.01, "IPDAS_4K turn_capture_model initial_track_true_deg")
    assert_close(target_course_true_deg, 5.0, 0.01, "IPDAS_4K turn_capture_model target_course_true_deg")
    assert_close(
        float(turn_capture_model["turn_angle_deg"]),
        heading_delta_deg(initial_track_true_deg, target_course_true_deg),
        0.01,
        "IPDAS_4K turn_capture_model turn_angle_deg",
    )

    design_ground_speed_kt = float(turn_capture_model["design_ground_speed_kt"])
    normal_bank_deg = float(turn_capture_model["normal_bank_deg"])
    assert_close(design_ground_speed_kt, 250.0, 0.01, "IPDAS_4K turn_capture_model design_ground_speed_kt")
    assert_close(normal_bank_deg, float(performance["normal_bank_deg"]), 0.01, "IPDAS_4K turn_capture_model normal_bank_deg")
    assert_close(
        float(turn_capture_model["max_bank_deg"]),
        float(performance["max_bank_deg"]),
        0.01,
        "IPDAS_4K turn_capture_model max_bank_deg",
    )

    expected_turn_rate = turn_rate_deg_sec(
        design_ground_speed_kt,
        normal_bank_deg,
        float(performance["max_turn_rate_deg_sec"]),
    )
    expected_turn_radius = turn_radius_nm(design_ground_speed_kt, expected_turn_rate)
    assert_close(
        float(turn_capture_model["nominal_turn_rate_deg_sec"]),
        expected_turn_rate,
        0.01,
        "IPDAS_4K turn_capture_model nominal_turn_rate_deg_sec",
    )
    assert_close(
        float(turn_capture_model["nominal_turn_radius_nm"]),
        expected_turn_radius,
        0.02,
        "IPDAS_4K turn_capture_model nominal_turn_radius_nm",
    )

    capture_tolerance = turn_capture_model.get("capture_tolerance")
    if not capture_tolerance:
        raise AssertionError("IPDAS_4K turn_capture_model capture_tolerance is required")
    assert_close(float(capture_tolerance["cross_track_nm"]), 0.5, 0.001, "IPDAS_4K capture cross_track_nm")
    assert_close(float(capture_tolerance["heading_error_deg"]), 10.0, 0.001, "IPDAS_4K capture heading_error_deg")
    assert_close(float(capture_tolerance["min_cju_dme_nm"]), 10.0, 0.001, "IPDAS_4K capture min_cju_dme_nm")
    assert_close(float(capture_tolerance["max_cju_dme_nm"]), 30.0, 0.001, "IPDAS_4K capture max_cju_dme_nm")
    if turn_capture_model.get("direct_course_turn_intersects_target_radial") is not False:
        raise AssertionError("IPDAS_4K direct course turn must not be marked as sufficient to intercept CJU R013")
    if turn_capture_model.get("requires_intercept_heading_model") is not True:
        raise AssertionError("IPDAS_4K turn_capture_model must require an intercept heading/path model")

    runtime_path = ipdas.get("runtime_path")
    if not runtime_path:
        raise AssertionError("IPDAS_4K runtime_path is required")
    if runtime_path.get("path_status") != "training_runtime_path_constructed":
        raise AssertionError("IPDAS_4K runtime_path path_status must be training_runtime_path_constructed")
    if runtime_path.get("training_runtime_path_allowed") is not True:
        raise AssertionError("IPDAS_4K runtime_path training_runtime_path_allowed must be true")
    if runtime_path.get("exact_runtime_route_allowed") is not False:
        raise AssertionError("IPDAS_4K runtime_path exact_runtime_route_allowed must remain false")

    runtime_route = runtime_path.get("route", [])
    runtime_route_ids = [
        entry.get("point_id") or entry.get("fix_id")
        for entry in runtime_route
    ]
    expected_runtime_route_ids = [
        "IPDAS_4K_YDM_R067_D6_5",
        "IPDAS_4K_CJU_R013_INTERCEPT_D15",
        "IPDAS_4K_CJU_R013_D30",
        "IPDAS",
    ]
    if runtime_route_ids != expected_runtime_route_ids:
        raise AssertionError(
            "IPDAS_4K runtime_path route mismatch: "
            f"expected {expected_runtime_route_ids}, got {runtime_route_ids}"
        )

    runtime_intercept = next(
        (
            entry
            for entry in runtime_route
            if entry.get("point_id") == "IPDAS_4K_CJU_R013_INTERCEPT_D15"
        ),
        None,
    )
    if not runtime_intercept:
        raise AssertionError("IPDAS_4K runtime D15 intercept point is required")
    if runtime_intercept.get("kind") != "constructed_intercept":
        raise AssertionError("IPDAS_4K runtime D15 intercept kind must be constructed_intercept")
    if runtime_intercept.get("source_navaid") != "CJU":
        raise AssertionError("IPDAS_4K runtime D15 intercept source_navaid must be CJU")
    if runtime_intercept.get("radial_magnetic_deg") != 13:
        raise AssertionError("IPDAS_4K runtime D15 intercept radial_magnetic_deg must be 13")
    assert_close(float(runtime_intercept["cju_dme_nm"]), 15.0, 0.001, "IPDAS_4K runtime D15 cju_dme_nm")

    intercept_d15_actual_true_bearing = bearing_deg(
        float(cju["latitude"]),
        float(cju["longitude"]),
        float(runtime_intercept["latitude"]),
        float(runtime_intercept["longitude"]),
    )
    intercept_d15_actual_distance = distance_nm(
        float(cju["latitude"]),
        float(cju["longitude"]),
        float(runtime_intercept["latitude"]),
        float(runtime_intercept["longitude"]),
    )
    if heading_delta_deg(intercept_d15_actual_true_bearing, ipdas_expected_true_bearing) > 0.05:
        raise AssertionError(
            "IPDAS_4K runtime D15 intercept bearing mismatch: "
            f"expected {ipdas_expected_true_bearing}, got {intercept_d15_actual_true_bearing}"
        )
    assert_close(intercept_d15_actual_distance, 15.0, 0.02, "IPDAS_4K runtime D15 distance_nm")

    d65_to_d15_heading = bearing_deg(
        float(first_point["latitude"]),
        float(first_point["longitude"]),
        float(runtime_intercept["latitude"]),
        float(runtime_intercept["longitude"]),
    )
    d15_to_d30_heading = bearing_deg(
        float(runtime_intercept["latitude"]),
        float(runtime_intercept["longitude"]),
        float(intercept_point["latitude"]),
        float(intercept_point["longitude"]),
    )
    assert_close(
        float(runtime_intercept["inbound_heading_true_deg"]),
        d65_to_d15_heading,
        0.1,
        "IPDAS_4K runtime D6.5-to-D15 inbound_heading_true_deg",
    )
    assert_close(
        float(runtime_intercept["outbound_course_true_deg"]),
        d15_to_d30_heading,
        0.2,
        "IPDAS_4K runtime D15-to-D30 outbound_course_true_deg",
    )
    assert_close(
        float(runtime_intercept["intercept_angle_deg"]),
        heading_delta_deg(d65_to_d15_heading, d15_to_d30_heading),
        0.1,
        "IPDAS_4K runtime D15 intercept_angle_deg",
    )

    print("Conventional/RADAR SID derived geometry verification passed")
    print("Verified IPDAS_4K YDM R067 D6.5, CJU R013/D30.0, D30.0-to-IPDAS continuation, turn capture tolerance, and training runtime path")


if __name__ == "__main__":
    main()
