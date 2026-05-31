import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import {
  datablockAirport,
  formatDatablockAltitude
} from "../lib/radarAircraftMenu";
import {
  altitudeTrend,
  frequencyStatusClass,
  guidanceStatusClass,
  guidanceStatusLabel
} from "../lib/radarDatablock";
import type { ScreenPoint } from "../lib/radarMapLayout";
import type { AircraftState } from "../lib/types";

interface RadarAircraftDatablockProps {
  blockOffset: ScreenPoint;
  blockX: number;
  blockY: number;
  datablockDragging: boolean;
  frequencyLabel: string | null;
  onCallsignClick: (event: ReactMouseEvent<SVGElement>) => void;
  onCallsignDoubleClick: (event: ReactMouseEvent<SVGElement>, target: AircraftState) => void;
  onCallsignPointerDown: (event: ReactPointerEvent<SVGElement>) => void;
  onDatablockPointerDown: (
    event: ReactPointerEvent<SVGGElement>,
    aircraftId: string,
    blockOffset: ScreenPoint
  ) => void;
  onDatablockPointerMove: (event: ReactPointerEvent<SVGGElement>) => void;
  onStopDatablockDragging: (event: ReactPointerEvent<SVGGElement>) => void;
  target: AircraftState;
  targetOwnerPosition: string;
}

export default function RadarAircraftDatablock({
  blockOffset,
  blockX,
  blockY,
  datablockDragging,
  frequencyLabel,
  onCallsignClick,
  onCallsignDoubleClick,
  onCallsignPointerDown,
  onDatablockPointerDown,
  onDatablockPointerMove,
  onStopDatablockDragging,
  target,
  targetOwnerPosition
}: RadarAircraftDatablockProps) {
  const airport = datablockAirport(target);
  const presentAltitude = formatDatablockAltitude(target.altitude_ft);
  const assignedAltitude = formatDatablockAltitude(target.assigned?.altitude_ft);
  const trend = altitudeTrend(target);
  const guidanceLabel = guidanceStatusLabel(target);
  const guidanceClass = guidanceStatusClass(target);
  const frequencyClass = frequencyStatusClass(target);
  const scratchpad = target.scratchpad ?? "";

  return (
    <g
      className={
        datablockDragging ? "radar-aircraft-datablock dragging" : "radar-aircraft-datablock"
      }
      transform={`translate(${blockX}, ${blockY})`}
      onLostPointerCapture={(event) => onStopDatablockDragging(event)}
      onPointerCancel={(event) => onStopDatablockDragging(event)}
      onPointerDown={(event) => onDatablockPointerDown(event, target.id, blockOffset)}
      onPointerMove={(event) => onDatablockPointerMove(event)}
      onPointerUp={(event) => onStopDatablockDragging(event)}
    >
      <rect
        className="radar-aircraft-datablock-hitbox"
        data-aircraft-datablock={target.callsign}
        x="-3"
        y="-8"
        width="112"
        height="43"
        rx="3"
      />
      <rect
        className="radar-aircraft-call-hitbox"
        data-aircraft-call-button={target.callsign}
        height="11"
        onClick={(event) => onCallsignClick(event)}
        onDoubleClick={(event) => onCallsignDoubleClick(event, target)}
        onPointerDown={(event) => onCallsignPointerDown(event)}
        rx="2"
        width="39"
        x="-2"
        y="-8"
      />
      <text
        className="radar-aircraft-call"
        data-aircraft-call={target.callsign}
        onClick={(event) => onCallsignClick(event)}
        onDoubleClick={(event) => onCallsignDoubleClick(event, target)}
        onPointerDown={(event) => onCallsignPointerDown(event)}
        x="0"
        y="0"
      >
        {target.callsign}
      </text>
      <text className="radar-aircraft-state" x="43" y="0">
        {target.squawk ?? "----"}
      </text>
      <text className="radar-aircraft-state radar-aircraft-right-column" x="106" y="0">
        {targetOwnerPosition}
      </text>
      <text className="radar-aircraft-state" x="0" y="10">
        {presentAltitude}
      </text>
      <text className="radar-aircraft-trend" x="31" y="10">
        {trend}
      </text>
      <text className="radar-aircraft-state" x="45" y="10">
        {assignedAltitude}
      </text>
      <text className="radar-aircraft-state radar-aircraft-right-column" x="106" y="10">
        {airport}
      </text>
      <text className="radar-aircraft-state" x="0" y="20">
        {formatGroundSpeed(target.ground_speed_kt)}
      </text>
      <text className="radar-aircraft-state" x="43" y="20">
        {target.aircraft_type}
      </text>
      {frequencyLabel ? (
        <text
          className={[
            "radar-aircraft-frequency-status",
            frequencyClass ? `radar-aircraft-frequency-${frequencyClass}` : ""
          ]
            .filter(Boolean)
            .join(" ")}
          data-aircraft-frequency-label={target.callsign}
          x="106"
          y="20"
        >
          {frequencyLabel}
        </text>
      ) : null}
      <text
        className="radar-aircraft-scratchpad"
        data-aircraft-scratchpad={target.callsign}
        x="0"
        y="30"
      >
        {scratchpad}
      </text>
      {guidanceLabel ? (
        <text
          className={[
            "radar-aircraft-guidance-status",
            guidanceClass ? `radar-aircraft-guidance-${guidanceClass}` : ""
          ]
            .filter(Boolean)
            .join(" ")}
          data-aircraft-guidance-label={target.callsign}
          x="106"
          y="30"
        >
          {guidanceLabel}
        </text>
      ) : null}
    </g>
  );
}

function formatGroundSpeed(speedKt: number) {
  return String(Math.round(speedKt)).padStart(3, "0");
}
