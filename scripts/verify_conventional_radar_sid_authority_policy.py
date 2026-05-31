from __future__ import annotations

import json
from pathlib import Path
from typing import Any


WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
POLICY_PATH = WORKSPACE_ROOT / "CONVENTIONAL_RADAR_SID_RUNTIME_POLICY.md"
DATA_SOURCES_PATH = WORKSPACE_ROOT / "DATA_SOURCES.md"
EXACT_LINEWORK_AUDIT_PATH = (
    WORKSPACE_ROOT
    / "data"
    / "authority"
    / "rkpc_conventional_radar_sid_exact_linework_audit.json"
)
DERIVED_GEOMETRY_PATH = (
    WORKSPACE_ROOT
    / "data"
    / "authority"
    / "rkpc_conventional_radar_sid_derived_geometry.json"
)
LINEWORK_RECONCILIATION_PATH = (
    WORKSPACE_ROOT
    / "data"
    / "authority"
    / "rkpc_sid_page3_ipdas_4k_linework_reconciliation_audit.json"
)

REQUIRED_POLICY_PHRASES = [
    "exact runtime route",
    "training runtime route",
    "reference overlay",
    "source chart linework",
    "schematic_or_offset_not_geodetic_exact",
    "exact_runtime_route_allowed=false",
    "training_runtime_path_allowed=true",
    "D6.5",
    "D30.0",
    "IPDAS",
]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def procedure_by_id(document: dict[str, Any], procedure_id: str) -> dict[str, Any]:
    procedure = next(
        (item for item in document.get("procedures", []) if item.get("procedure_id") == procedure_id),
        None,
    )
    require(procedure is not None, f"Missing procedure: {procedure_id}")
    return procedure


def main() -> None:
    require(POLICY_PATH.exists(), f"Missing conventional/RADAR SID policy: {POLICY_PATH.relative_to(WORKSPACE_ROOT)}")
    policy_text = POLICY_PATH.read_text(encoding="utf-8")
    data_sources_text = DATA_SOURCES_PATH.read_text(encoding="utf-8")
    exact_audit = read_json(EXACT_LINEWORK_AUDIT_PATH)
    derived_geometry = read_json(DERIVED_GEOMETRY_PATH)
    reconciliation_audit = read_json(LINEWORK_RECONCILIATION_PATH)

    for phrase in REQUIRED_POLICY_PHRASES:
        require(phrase in policy_text, f"Policy missing required phrase: {phrase}")
    require("CONVENTIONAL_RADAR_SID_RUNTIME_POLICY.md" in data_sources_text, "DATA_SOURCES must reference the SID runtime policy")

    source_registers = exact_audit.get("metadata", {}).get("source_registers", [])
    require(
        "CONVENTIONAL_RADAR_SID_RUNTIME_POLICY.md" in source_registers,
        "Exact linework audit must reference the conventional/RADAR SID policy",
    )
    rules = exact_audit.get("metadata", {}).get("rules", [])
    require(
        any("reference overlay" in rule.lower() for rule in rules),
        "Exact linework audit rules must separate reference overlay from runtime geometry",
    )

    ipdas_exact = procedure_by_id(exact_audit, "IPDAS_4K")
    ipdas_derived = procedure_by_id(derived_geometry, "IPDAS_4K")
    require(ipdas_exact.get("exact_runtime_route_allowed") is False, "IPDAS exact runtime must remain blocked")
    require(ipdas_exact.get("training_runtime_path_allowed") is True, "IPDAS training runtime path must remain allowed")
    require(ipdas_derived.get("runtime_route_allowed") is False, "Derived geometry must not authorize exact runtime route")
    runtime_path = ipdas_derived.get("runtime_path") or {}
    require(runtime_path.get("training_runtime_path_allowed") is True, "Training runtime path must remain available")
    require(runtime_path.get("exact_runtime_route_allowed") is False, "Runtime path exact flag must remain false")
    require(runtime_path.get("runtime_class") == "training_runtime_route", "Runtime path class must be training_runtime_route")
    require(
        runtime_path.get("motion_authority") == "text_radial_dme_derived_training_path",
        "Runtime path motion authority mismatch",
    )
    reference_overlay_policy = runtime_path.get("reference_overlay_policy") or {}
    require(
        reference_overlay_policy.get("published_chart_linework_role") == "reference_overlay_only",
        "Published chart linework must be reference overlay only",
    )
    require(
        reference_overlay_policy.get("source_chart_linework_may_drive_motion") is False,
        "Source chart linework must not drive aircraft motion",
    )
    require(reference_overlay_policy.get("exact_overlay_allowed") is False, "Exact overlay must remain blocked")
    require(reference_overlay_policy.get("candidate_overlay_label") == "REF/CAND", "Candidate overlay label mismatch")
    notes = " ".join(runtime_path.get("notes", []))
    require("reference overlay" in notes.lower(), "Runtime path notes must distinguish reference overlay from training path")

    assessment = reconciliation_audit.get("geodetic_assessment") or {}
    require(
        assessment.get("chart_route_line_status") == "schematic_or_offset_not_geodetic_exact",
        "Linework reconciliation must classify chart line as schematic/offset",
    )
    decision = reconciliation_audit.get("exact_runtime_route_decision") or {}
    require(decision.get("exact_runtime_route_allowed") is False, "Linework decision must keep exact runtime blocked")

    blockers = ipdas_exact.get("remaining_blockers", [])
    require(
        any("exact route centerline authority" in blocker for blocker in blockers),
        "Exact audit blockers must require exact route centerline authority",
    )

    print("Conventional/RADAR SID authority policy verification passed")
    print("Policy keeps IPDAS 4K exact route blocked while preserving training runtime path")


if __name__ == "__main__":
    main()
