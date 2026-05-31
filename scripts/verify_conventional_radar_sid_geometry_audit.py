from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
ROUTE_REGISTER_PATH = WORKSPACE_ROOT / "data" / "authority" / "rkpc_sid_star_route_register.csv"
CONSTRAINT_REGISTER_PATH = WORKSPACE_ROOT / "data" / "reference" / "rkpc_procedure_constraint_register.json"
GEOMETRY_AUDIT_PATH = WORKSPACE_ROOT / "data" / "authority" / "rkpc_conventional_radar_sid_geometry_audit.json"

REQUIRED_AUDIT_STATUS = "pending_geometry_derivation"
REQUIRED_AUTOMATION_STATUS = "blocked_pending_geometry_derivation"
REQUIRED_DERIVATIONS_BY_TYPE = {
    "radial_dme": {"radial_track", "turn_or_intercept_geometry"},
    "radial_dme_arc": {"radial_track", "dme_arc", "arc_join_or_exit"},
    "radar_vector": {"runway_heading_vector", "release_altitude"},
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def conventional_radar_route_rows() -> dict[str, dict[str, str]]:
    rows = {}
    for row in read_csv(ROUTE_REGISTER_PATH):
        if (
            row["procedure_type"] == "SID"
            and row["nav_spec"] == "conventional/radar"
            and row["route_definition_type"] != "fix_sequence"
        ):
            rows[row["procedure_id"]] = row
    return rows


def supplemental_unmodeled_sids() -> set[str]:
    constraint_register = read_json(CONSTRAINT_REGISTER_PATH)
    return {
        item["procedure_id"]
        for item in constraint_register.get("supplemental_unmodeled_procedures", [])
        if item.get("procedure_type") == "SID"
    }


def main() -> None:
    if not GEOMETRY_AUDIT_PATH.exists():
        raise AssertionError(f"Missing geometry audit file: {GEOMETRY_AUDIT_PATH.relative_to(WORKSPACE_ROOT)}")

    route_rows = conventional_radar_route_rows()
    supplemental_ids = supplemental_unmodeled_sids()
    audit = read_json(GEOMETRY_AUDIT_PATH)
    audit_items = {
        item["procedure_id"]: item
        for item in audit.get("procedures", [])
    }

    if set(route_rows) != supplemental_ids:
        raise AssertionError(
            "Route register and supplemental SID backlog differ: "
            f"route={sorted(route_rows)} supplemental={sorted(supplemental_ids)}"
        )

    if set(audit_items) != set(route_rows):
        raise AssertionError(
            "Geometry audit procedures must match route-register conventional/radar SID rows: "
            f"audit={sorted(audit_items)} route={sorted(route_rows)}"
        )

    for procedure_id, route_row in route_rows.items():
        item = audit_items[procedure_id]
        route_definition_type = route_row["route_definition_type"]
        required_derivations = REQUIRED_DERIVATIONS_BY_TYPE[route_definition_type]
        actual_derivations = set(item.get("required_geometry_derivations", []))

        if item.get("runway") != route_row["runway"]:
            raise AssertionError(f"{procedure_id} runway does not match route register")
        if item.get("route_definition_type") != route_definition_type:
            raise AssertionError(f"{procedure_id} route_definition_type does not match route register")
        if item.get("audit_status") != REQUIRED_AUDIT_STATUS:
            raise AssertionError(f"{procedure_id} audit_status must be {REQUIRED_AUDIT_STATUS}")
        if item.get("automation_status") != REQUIRED_AUTOMATION_STATUS:
            raise AssertionError(f"{procedure_id} automation_status must be {REQUIRED_AUTOMATION_STATUS}")
        if item.get("runtime_route_allowed") is not False:
            raise AssertionError(f"{procedure_id} runtime_route_allowed must be false")
        if not required_derivations.issubset(actual_derivations):
            raise AssertionError(
                f"{procedure_id} required_geometry_derivations missing "
                f"{sorted(required_derivations - actual_derivations)}"
            )
        if not item.get("source_file") or not item.get("source_section"):
            raise AssertionError(f"{procedure_id} must preserve source_file/source_section")
        if not item.get("route_text"):
            raise AssertionError(f"{procedure_id} must preserve route_text")
        if not item.get("blocking_reason"):
            raise AssertionError(f"{procedure_id} must explain blocking_reason")

    print("Conventional/RADAR SID geometry audit verification passed")
    print(f"Audited procedures: {len(audit_items)}")


if __name__ == "__main__":
    main()
