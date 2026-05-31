import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import {
  destinationPoint,
  distanceNmForSeconds
} from "../lib/aircraftMotion";
import RadarAircraftDatablock from "./RadarAircraftDatablock";
import {
  ownerPosition,
  type DatablockDragState
} from "../lib/radarAircraftMenu";
import {
  resolveAircraftDatablockOffsets
} from "../lib/radarDatablockLayout";
import {
  frequencyStatusLabel,
} from "../lib/radarDatablock";
import type { ScreenPoint } from "../lib/radarMapLayout";
import type { MeasureDragState } from "../lib/measureTool";
import type { AircraftState, DensityMode } from "../lib/types";

interface RadarAircraftLayerProps {
  aircraft: AircraftState[];
  datablockDragState: DatablockDragState;
  datablockOffsets: Record<string, ScreenPoint>;
  densityMode: DensityMode;
  measureDragState: MeasureDragState;
  onAircraftMeasureHitboxClick: (event: ReactMouseEvent<SVGCircleElement>) => void;
  onAircraftSnapEnter: (aircraftId: string) => void;
  onAircraftSnapLeave: (aircraftId: string) => void;
  onCallsignClick: (event: ReactMouseEvent<SVGElement>) => void;
  onCallsignDoubleClick: (event: ReactMouseEvent<SVGElement>, target: AircraftState) => void;
  onCallsignPointerDown: (event: ReactPointerEvent<SVGElement>) => void;
  onDatablockPointerDown: (
    event: ReactPointerEvent<SVGGElement>,
    aircraftId: string,
    blockOffset: ScreenPoint
  ) => void;
  onDatablockPointerMove: (event: ReactPointerEvent<SVGGElement>) => void;
  onMeasurePointerDown: (
    event: ReactPointerEvent<SVGCircleElement>,
    target: AircraftState
  ) => void;
  onMeasurePointerMove: (event: ReactPointerEvent<SVGElement>) => void;
  onSelectAircraft: (aircraftId: string) => void;
  onStopDatablockDragging: (event: ReactPointerEvent<SVGGElement>) => void;
  onStopMeasureDragging: (event: ReactPointerEvent<SVGElement>) => void;
  project: (coordinate: [number, number]) => ScreenPoint;
  selectedAircraftId: string | null;
  snapAircraftId: string | null;
  viewWidth: number;
}

export default function RadarAircraftLayer({
  aircraft,
  datablockDragState,
  datablockOffsets,
  densityMode,
  measureDragState,
  onAircraftMeasureHitboxClick,
  onAircraftSnapEnter,
  onAircraftSnapLeave,
  onCallsignClick,
  onCallsignDoubleClick,
  onCallsignPointerDown,
  onDatablockPointerDown,
  onDatablockPointerMove,
  onMeasurePointerDown,
  onMeasurePointerMove,
  onSelectAircraft,
  onStopDatablockDragging,
  onStopMeasureDragging,
  project,
  selectedAircraftId,
  snapAircraftId,
  viewWidth
}: RadarAircraftLayerProps) {
  const projectedAircraft = aircraft.map((target) => ({
    point: project([target.longitude, target.latitude]),
    target
  }));
  const resolvedDatablockOffsets = resolveAircraftDatablockOffsets({
    manualOffsets: datablockOffsets,
    targets: projectedAircraft.map(({ point, target }) => ({ id: target.id, point })),
    viewWidth
  });

  return (
    <>
      {projectedAircraft.map(({ point, target }) => {
        const selected = target.id === selectedAircraftId;
        const predictorDistanceNm = distanceNmForSeconds(target.ground_speed_kt, 30);
        const predictorPosition = destinationPoint(
          target.latitude,
          target.longitude,
          target.heading_true_deg,
          predictorDistanceNm
        );
        const predictorPoint = project([predictorPosition.longitude, predictorPosition.latitude]);
        const blockOffset = resolvedDatablockOffsets[target.id];
        const blockX = point.x + blockOffset.x;
        const blockY = point.y + blockOffset.y;
        const showDatablock = densityMode !== "declutter" || selected;
        const targetOwnerPosition = ownerPosition(target);
        const frequencyLabel = frequencyStatusLabel(target);
        const datablockDragging = datablockDragState.aircraftId === target.id;
        const procedureRouteIndex = target.procedure_route_index ?? 0;
        const procedureRouteLeft = target.procedure_route?.slice(procedureRouteIndex).join(" ") ?? "";

        return (
          <g
            key={target.id}
            className={[
              "radar-aircraft",
              targetOwnerPosition === "DEP" ? "radar-aircraft-dep" : "radar-aircraft-app",
              selected ? "selected" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            data-aircraft-callsign={target.callsign}
            data-aircraft-heading-true={target.heading_true_deg}
            data-aircraft-ground-speed={target.ground_speed_kt}
            data-aircraft-altitude={target.altitude_ft}
            data-aircraft-vertical-rate={target.vertical_rate_fpm}
            data-aircraft-assigned-heading={target.assigned?.heading_true_deg ?? undefined}
            data-aircraft-assigned-speed={target.assigned?.speed_kt ?? undefined}
            data-aircraft-assigned-altitude={target.assigned?.altitude_ft ?? undefined}
            data-aircraft-assigned-vertical-rate={target.assigned?.vertical_rate_fpm ?? undefined}
            data-aircraft-guidance-active-at={target.guidance_active_at_ms ?? undefined}
            data-aircraft-guidance-status={target.guidance_status?.status ?? undefined}
            data-aircraft-frequency-status={frequencyLabel || undefined}
            data-aircraft-heading-active-at={target.heading_active_at_ms ?? undefined}
            data-aircraft-speed-active-at={target.speed_active_at_ms ?? undefined}
            data-aircraft-altitude-active-at={target.altitude_active_at_ms ?? undefined}
            data-aircraft-vertical-rate-active-at={target.vertical_rate_active_at_ms ?? undefined}
            data-aircraft-next-fix={target.next_fix ?? undefined}
            data-aircraft-procedure-kind={target.procedure_kind ?? undefined}
            data-aircraft-procedure-route={target.procedure_route?.join(" ") ?? undefined}
            data-aircraft-procedure-route-index={target.procedure_route_index ?? undefined}
            data-aircraft-procedure-route-left={procedureRouteLeft || undefined}
            data-aircraft-route-mode={target.route_mode}
            onClick={() => onSelectAircraft(target.id)}
          >
            <line
              className="radar-aircraft-track"
              x1={point.x}
              y1={point.y}
              x2={predictorPoint.x}
              y2={predictorPoint.y}
            />
            {showDatablock ? (
              <>
                <polyline
                  className="radar-aircraft-leader"
                  points={`${point.x},${point.y} ${point.x + blockOffset.x * 0.35},${point.y + blockOffset.y * 0.35} ${blockX},${blockY}`}
                />
                <RadarAircraftDatablock
                  blockOffset={blockOffset}
                  blockX={blockX}
                  blockY={blockY}
                  datablockDragging={datablockDragging}
                  frequencyLabel={frequencyLabel}
                  onCallsignClick={onCallsignClick}
                  onCallsignDoubleClick={onCallsignDoubleClick}
                  onCallsignPointerDown={onCallsignPointerDown}
                  onDatablockPointerDown={onDatablockPointerDown}
                  onDatablockPointerMove={onDatablockPointerMove}
                  onStopDatablockDragging={onStopDatablockDragging}
                  target={target}
                  targetOwnerPosition={targetOwnerPosition}
                />
              </>
            ) : null}
            <circle
              className="radar-aircraft-measure-hitbox"
              cx={point.x}
              cy={point.y}
              onClick={(event) => onAircraftMeasureHitboxClick(event)}
              onLostPointerCapture={(event) => onStopMeasureDragging(event)}
              onPointerCancel={(event) => onStopMeasureDragging(event)}
              onPointerDown={(event) => onMeasurePointerDown(event, target)}
              onPointerEnter={() => onAircraftSnapEnter(target.id)}
              onPointerLeave={() => onAircraftSnapLeave(target.id)}
              onPointerMove={(event) => onMeasurePointerMove(event)}
              onPointerUp={(event) => onStopMeasureDragging(event)}
              r="28"
            />
            {snapAircraftId === target.id &&
            (!measureDragState.active || measureDragState.endAircraftId === target.id) ? (
              <g className="radar-aircraft-snap-cursor" transform={`translate(${point.x}, ${point.y})`}>
                <circle r="10" />
                <line x1="-13" y1="0" x2="-6" y2="0" />
                <line x1="6" y1="0" x2="13" y2="0" />
                <line x1="0" y1="-13" x2="0" y2="-6" />
                <line x1="0" y1="6" x2="0" y2="13" />
              </g>
            ) : null}
            <circle
              className="radar-aircraft-core"
              cx={point.x}
              cy={point.y}
              onLostPointerCapture={(event) => onStopMeasureDragging(event)}
              onPointerCancel={(event) => onStopMeasureDragging(event)}
              onPointerDown={(event) => onMeasurePointerDown(event, target)}
              onPointerMove={(event) => onMeasurePointerMove(event)}
              onPointerUp={(event) => onStopMeasureDragging(event)}
              r="3.2"
            />
          </g>
        );
      })}
    </>
  );
}
