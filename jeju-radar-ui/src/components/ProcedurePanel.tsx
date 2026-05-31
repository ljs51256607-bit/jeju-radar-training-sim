import type {
  FrequencyReference,
  HandoffReference,
  HotspotReferenceZone,
  ProcedureRecord,
  RadarDataset,
  RunwayMode,
  TransferAnchor
} from "../lib/types";

interface ProcedurePanelProps {
  dataset: RadarDataset;
  selectedRunway: RunwayMode;
}

function handoffMatchesRunway(reference: HandoffReference, runway: RunwayMode) {
  const runwayToken = `RWY ${runway}`;

  return (
    reference.id.includes(runway) ||
    reference.reference_runway === runway ||
    reference.applicable_procedures?.some((procedureName) => procedureName.includes(runwayToken)) ||
    reference.handoff_flow === "TWR -> APP/DC"
  );
}

function hotspotMatchesRunway(zone: HotspotReferenceZone, runway: RunwayMode) {
  return zone.runway_group.replace(/\s/g, "").toUpperCase().includes(`RWY${runway}`);
}

function procedureVisibleForRunwayMode(procedure: ProcedureRecord, runway: RunwayMode) {
  if (procedure.runway === runway) {
    return true;
  }

  return runway === "25" && (procedure.runway === "31" || procedure.paired_runway_mode === "25+31");
}

function ProcedureCompactList({
  title,
  procedures
}: {
  title: string;
  procedures: ProcedureRecord[];
}) {
  return (
    <section className="inspector-section">
      <div className="panel-heading">
        <h3>{title}</h3>
        <span>{procedures.length}</span>
      </div>

      <div className="inspector-list">
        {procedures.map((procedure) => (
          <article className="inspector-row" key={procedure.id}>
            <strong>{procedure.name}</strong>
            <span>{procedure.extraction_status ?? "verified"}</span>
            {procedure.route_text ? <p>{procedure.route_text}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function TransferList({
  title,
  anchors
}: {
  title: string;
  anchors: TransferAnchor[];
}) {
  return (
    <section className="inspector-section">
      <div className="panel-heading">
        <h3>{title}</h3>
        <span>{anchors.length}</span>
      </div>

      <div className="inspector-list">
        {anchors.map((anchor) => (
          <article className="inspector-row" key={`${anchor.airway}-${anchor.fix_id ?? anchor.fix_name ?? "na"}`}>
            <strong>{anchor.fix_id ?? anchor.fix_name ?? anchor.airway}</strong>
            <span>
              {anchor.from_unit}
              {" -> "}
              {anchor.to_unit}
            </span>
            <p>
              {anchor.airway} / {anchor.default_altitude_text}
              {anchor.runway_25_variant_text ? ` / ${anchor.runway_25_variant_text}` : ""}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FrequencyList({ frequencies }: { frequencies: FrequencyReference[] }) {
  return (
    <section className="inspector-section">
      <div className="panel-heading">
        <h3>주파수</h3>
        <span>{frequencies.length}</span>
      </div>

      <div className="inspector-list compact">
        {frequencies.map((frequency) => (
          <article className="inspector-row tight" key={`${frequency.position}-${frequency.frequency_mhz}`}>
            <strong>{frequency.position}</strong>
            <span>{frequency.callsign}</span>
            <p>{frequency.frequency_mhz.toFixed(3)} MHz</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function ProcedurePanel({ dataset, selectedRunway }: ProcedurePanelProps) {
  const stars = dataset.procedures.stars.filter((procedure) =>
    procedureVisibleForRunwayMode(procedure, selectedRunway)
  );
  const sids = dataset.procedures.sids.filter((procedure) =>
    procedureVisibleForRunwayMode(procedure, selectedRunway)
  );
  const approaches = dataset.procedures.approaches.filter(
    (procedure) => procedure.runway === selectedRunway
  );
  const frequencies = dataset.airport.frequencies.filter((frequency) =>
    ["AP", "AR", "DC", "TWR"].includes(frequency.position)
  );
  const handoffReferences = dataset.handoffRules.tower_handoff_reference_geometry.filter((reference) =>
    handoffMatchesRunway(reference, selectedRunway)
  );
  const visualRule = dataset.procedures.visual_approach_rules.find(
    (procedure) => procedure.runway === selectedRunway
  );
  const hotspots = dataset.hotspotDescriptors.hotspot_reference_zones.filter((zone) =>
    hotspotMatchesRunway(zone, selectedRunway)
  );
  const inboundTransfers = dataset.transferRules.interfacility_transfer_anchors.arrivals_into_jeju_tma;
  const outboundTransfers =
    dataset.transferRules.interfacility_transfer_anchors.departures_and_overflights_out_of_jeju_tma;

  return (
    <aside className="scope-sidebar">
      <section className="inspector-section inspector-hero">
        <div className="panel-heading">
          <h3>Scope Inspector</h3>
          <span>{selectedRunway === "25" ? "RWY 25+31" : `RWY ${selectedRunway}`}</span>
        </div>
        <p>
          exact data는 잠겼고, 이 패널은 <strong>활주로 package / transfer / handoff / hotspot</strong>을
          빠르게 보는 용도입니다.
        </p>
        <div className="inspector-badges">
          <span>{stars.length} STAR</span>
          <span>{sids.length} SID</span>
          <span>{approaches.length} APP</span>
          <span>{hotspots.length} HS</span>
        </div>
      </section>

      <ProcedureCompactList title="STAR" procedures={stars} />
      <ProcedureCompactList title="SID" procedures={sids} />
      <ProcedureCompactList title="Approach" procedures={approaches} />

      <section className="inspector-section">
        <div className="panel-heading">
          <h3>Tower Handoff</h3>
          <span>{handoffReferences.length}</span>
        </div>

        <div className="inspector-list">
          {handoffReferences.map((reference) => (
            <article className="inspector-row" key={reference.id}>
              <strong>{reference.id}</strong>
              <span>{reference.handoff_flow}</span>
              <p>
                {reference.fix_id
                  ? `fix ${reference.fix_id}`
                  : reference.start_fix_id && reference.end_fix_id
                    ? `${reference.start_fix_id} - ${reference.end_fix_id}`
                    : reference.distance_from_threshold_nm
                      ? `threshold ${reference.distance_from_threshold_nm}NM`
                      : reference.distance_from_departure_end_nm
                        ? `departure end ${reference.distance_from_departure_end_nm}NM`
                        : reference.distance_tolerance_text ?? "reference"}
              </p>
            </article>
          ))}
        </div>
      </section>

      <TransferList title="Inbound Transfer" anchors={inboundTransfers} />
      <TransferList title="Outbound Transfer" anchors={outboundTransfers} />

      <section className="inspector-section">
        <div className="panel-heading">
          <h3>Hot Spot</h3>
          <span>{hotspots.length}</span>
        </div>

        <div className="inspector-list">
          {hotspots.map((zone) => (
            <article className="inspector-row" key={zone.id}>
              <strong>{zone.id}</strong>
              <span>{zone.runway_group}</span>
              <p>
                {zone.anchor_refs.join(" / ")} / {zone.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      {visualRule ? (
        <section className="inspector-section">
          <div className="panel-heading">
            <h3>Visual Rule</h3>
            <span>RWY {selectedRunway}</span>
          </div>
          <div className="inspector-row">
            <strong>{visualRule.condition_summary ?? "visual approach note"}</strong>
            {visualRule.special_notes?.length ? (
              <p>{visualRule.special_notes.join(" / ")}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <FrequencyList frequencies={frequencies} />

      <section className="inspector-section">
        <div className="panel-heading">
          <h3>관제석 구조</h3>
          <span>{dataset.airspace.controller_positions.length}</span>
        </div>

        <div className="inspector-list compact">
          {dataset.airspace.controller_positions.map((position) => (
            <article className="inspector-row" key={position.id}>
              <strong>{position.abbreviation}</strong>
              <span>{position.name}</span>
              <p>{position.responsibility_summary}</p>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}
