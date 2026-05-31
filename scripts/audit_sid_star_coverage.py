from __future__ import annotations

import csv
import json
import argparse
from pathlib import Path
from typing import Any


WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
ROUTE_REGISTER_PATH = WORKSPACE_ROOT / "data" / "authority" / "rkpc_sid_star_route_register.csv"
TERMINAL_FIX_REGISTER_PATH = WORKSPACE_ROOT / "data" / "authority" / "rkpc_terminal_fix_register.csv"
PROCEDURES_PATH = WORKSPACE_ROOT / "data" / "reference" / "rkpc_procedures.json"
CONSTRAINT_REGISTER_PATH = WORKSPACE_ROOT / "data" / "reference" / "rkpc_procedure_constraint_register.json"
VIDEOMAP_LABELS_PATH = WORKSPACE_ROOT / "data" / "geometry" / "videomap_labels.json"
RWY07_PROCEDURE_LINES_PATH = WORKSPACE_ROOT / "data" / "geometry" / "rwy07_procedure_lines.geojson"
RWY25_PROCEDURE_LINES_PATH = WORKSPACE_ROOT / "data" / "geometry" / "rwy25_procedure_lines.geojson"
RWY31_PROCEDURE_LINES_PATH = WORKSPACE_ROOT / "data" / "geometry" / "rwy31_procedure_lines.geojson"
OUTPUT_PATH = WORKSPACE_ROOT / "data" / "authority" / "sid_star_coverage_audit.json"

ACTIVE_RUNWAYS = {"07", "25", "31"}
ACTIVE_ROUTE_STATUSES = {
    "coordinate_verified",
}
INTENTIONALLY_HIDDEN_LABELS = {
    "YDM": "User requested RADAR/YDM removal from display.",
}
VISIBLE_PROCEDURE_LABEL_LAYERS = {
    "entry_exit_fix",
    "fix_major",
    "handoff_reference",
    "approach_reference",
    "navaid",
    "rwy07_sid_fix",
    "rwy07_star_fix",
    "rwy25_sid_fix",
    "rwy25_star_fix",
    "rwy31_sid_fix",
    "rwy31_star_fix",
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def split_sequence(value: str) -> list[str]:
    return [item.strip() for item in value.split(">") if item.strip()]


def route_should_have_active_line(row: dict[str, str]) -> bool:
    return (
        row["runway"] in ACTIVE_RUNWAYS
        and row["procedure_type"] in {"STAR", "SID"}
        and row["route_definition_type"] == "fix_sequence"
        and row["coordinate_status"] in ACTIVE_ROUTE_STATUSES
    )


def label_status(fix_id: str, label_names: set[str]) -> str:
    if fix_id in INTENTIONALLY_HIDDEN_LABELS:
        return "intentionally_hidden"

    if fix_id in label_names:
        return "present"

    return "missing"


def build_fix_lookup() -> dict[str, dict[str, Any]]:
    fixes = {row["fix_id"]: row for row in read_csv(TERMINAL_FIX_REGISTER_PATH)}
    procedures = load_json(PROCEDURES_PATH)

    for fix in procedures["fixes"]:
        fixes[fix["id"]] = {
            "fix_id": fix["id"],
            "source_file": fix.get("source_file"),
            "source_section": fix.get("source_section"),
            "authority_status": "coordinate_verified",
        }

    return fixes


def visible_label_status(fix_id: str, labels_by_text: dict[str, list[dict[str, Any]]]) -> str:
    if fix_id in INTENTIONALLY_HIDDEN_LABELS:
        return "intentionally_hidden"

    labels = labels_by_text.get(fix_id, [])
    if not labels:
        return "missing"

    if any(label.get("layer") in VISIBLE_PROCEDURE_LABEL_LAYERS for label in labels):
        return "present"

    return "present_but_hidden_layer"


def build_audit() -> dict[str, Any]:
    routes = read_csv(ROUTE_REGISTER_PATH)
    fixes = build_fix_lookup()
    constraint_register = load_json(CONSTRAINT_REGISTER_PATH)
    labels = load_json(VIDEOMAP_LABELS_PATH)["labels"]
    label_names = {label["text"] for label in labels}
    labels_by_text: dict[str, list[dict[str, Any]]] = {}
    for label in labels:
        labels_by_text.setdefault(label["text"], []).append(label)
    procedure_line_features = (
        load_json(RWY07_PROCEDURE_LINES_PATH)["features"]
        + load_json(RWY25_PROCEDURE_LINES_PATH)["features"]
        + load_json(RWY31_PROCEDURE_LINES_PATH)["features"]
    )
    active_line_procedure_ids = {
        feature["properties"].get("procedure_id")
        for feature in procedure_line_features
        if feature["properties"].get("procedure_type") in {"STAR", "SID"}
    }

    route_audits: list[dict[str, Any]] = []
    missing_active_labels: dict[str, dict[str, Any]] = {}

    for row in routes:
        if row["procedure_type"] not in {"STAR", "SID"}:
            continue

        sequence = split_sequence(row["fix_sequence"])
        missing_coordinates = [fix_id for fix_id in sequence if fix_id and fix_id not in fixes]
        label_results = [
            {
                "fix_id": fix_id,
                "status": visible_label_status(fix_id, labels_by_text),
                "data_status": label_status(fix_id, label_names),
                "reason": INTENTIONALLY_HIDDEN_LABELS.get(fix_id),
            }
            for fix_id in sequence
            if fix_id and fix_id in fixes
        ]
        active_expected = route_should_have_active_line(row)
        active_line_present = row["procedure_id"] in active_line_procedure_ids

        if active_expected:
            for item in label_results:
                if item["status"] not in {"present", "intentionally_hidden"}:
                    missing_active_labels[item["fix_id"]] = {
                        "fix_id": item["fix_id"],
                        "status": item["status"],
                        "routes": sorted(
                            {
                                *missing_active_labels.get(item["fix_id"], {}).get("routes", []),
                                row["procedure_id"],
                            }
                        ),
                    }

        route_audits.append(
            {
                "procedure_id": row["procedure_id"],
                "procedure_type": row["procedure_type"],
                "runway": row["runway"],
                "route_definition_type": row["route_definition_type"],
                "coordinate_status": row["coordinate_status"],
                "fix_count": len(sequence),
                "missing_coordinates": missing_coordinates,
                "active_line_expected": active_expected,
                "active_line_present": active_line_present,
                "missing_active_line": active_expected and not active_line_present,
                "label_results": label_results,
            }
        )

    active_routes = [item for item in route_audits if item["active_line_expected"]]
    missing_active_lines = [item["procedure_id"] for item in active_routes if item["missing_active_line"]]
    route_register_unmodeled = [
        item["procedure_id"]
        for item in route_audits
        if item["runway"] in ACTIVE_RUNWAYS
        and item["procedure_type"] == "SID"
        and item["route_definition_type"] != "fix_sequence"
    ]
    supplemental_unmodeled = [
        item["procedure_id"]
        for item in constraint_register.get("supplemental_unmodeled_procedures", [])
        if item.get("procedure_type") == "SID"
    ]

    route_register_items_not_in_supplemental = sorted(set(route_register_unmodeled) - set(supplemental_unmodeled))
    supplemental_items_not_in_route_register = sorted(set(supplemental_unmodeled) - set(route_register_unmodeled))
    if route_register_items_not_in_supplemental:
        raise AssertionError(
            "Route-register conventional/vector SID is missing from supplemental_unmodeled_procedures: "
            f"{route_register_items_not_in_supplemental}"
        )
    if supplemental_items_not_in_route_register:
        raise AssertionError(
            "Supplemental conventional/vector SID is missing from route register: "
            f"{supplemental_items_not_in_route_register}"
        )

    conventional_unmodeled = sorted(supplemental_unmodeled)

    return {
        "metadata": {
            "active_runways": sorted(ACTIVE_RUNWAYS),
            "route_register": "data/authority/rkpc_sid_star_route_register.csv",
            "terminal_fix_register": "data/authority/rkpc_terminal_fix_register.csv",
            "videomap_labels": "data/geometry/videomap_labels.json",
            "constraint_register": "data/reference/rkpc_procedure_constraint_register.json",
            "rwy07_procedure_lines": "data/geometry/rwy07_procedure_lines.geojson",
            "rwy25_procedure_lines": "data/geometry/rwy25_procedure_lines.geojson",
            "rwy31_procedure_lines": "data/geometry/rwy31_procedure_lines.geojson",
        },
        "summary": {
            "total_star_sid_routes": len(route_audits),
            "active_fix_sequence_routes_expected": len(active_routes),
            "active_fix_sequence_routes_present": len(active_routes) - len(missing_active_lines),
            "missing_active_lines": missing_active_lines,
            "missing_active_visible_labels": sorted(missing_active_labels.values(), key=lambda item: item["fix_id"]),
            "intentionally_hidden_labels": INTENTIONALLY_HIDDEN_LABELS,
            "conventional_or_vector_sids_not_geometry_modeled": conventional_unmodeled,
            "route_register_conventional_or_vector_sids": sorted(route_register_unmodeled),
        },
        "routes": route_audits,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify public SID/STAR route coverage.")
    parser.add_argument(
        "--write",
        action="store_true",
        help="write the derived audit report into data/authority; default is verify-only",
    )
    args = parser.parse_args()

    audit = build_audit()
    summary = audit["summary"]

    failures = []
    if summary["missing_active_lines"]:
        failures.append(f"missing active route lines: {summary['missing_active_lines']}")
    if summary["missing_active_visible_labels"]:
        failures.append(f"missing active visible labels: {summary['missing_active_visible_labels']}")

    if args.write:
        OUTPUT_PATH.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {OUTPUT_PATH.relative_to(WORKSPACE_ROOT)}")

    print(
        "Active fix-sequence routes: "
        f"{summary['active_fix_sequence_routes_present']}/"
        f"{summary['active_fix_sequence_routes_expected']}"
    )
    print(f"Missing active route lines: {summary['missing_active_lines']}")
    print(f"Missing active visible labels: {summary['missing_active_visible_labels']}")
    print(
        "Conventional/vector SIDs not geometry-modeled: "
        f"{summary['conventional_or_vector_sids_not_geometry_modeled']}"
    )

    if failures:
        raise AssertionError("; ".join(failures))

    print("SID/STAR coverage verification passed")


if __name__ == "__main__":
    main()
