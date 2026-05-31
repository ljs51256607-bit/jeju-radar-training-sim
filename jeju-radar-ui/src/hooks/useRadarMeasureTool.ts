import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  IDLE_MEASURE_DRAG_STATE,
  MAX_MEASURE_CHAIN_LEGS,
  cumulativeMeasureDistanceNm as measureCumulativeDistanceNm,
  estimateMeasureLabelWidth,
  measureDistanceLabel,
  measureEtaLabel,
  measureLabelContainsMapPoint,
  measureLineBearingTrueDeg,
  measureLineDistanceNm,
  measureLineEndCoordinate as resolveMeasureLineEndCoordinate,
  measureLineFromDrag,
  measureLineStartCoordinate as resolveMeasureLineStartCoordinate,
  renderedMeasureLines as buildRenderedMeasureLines,
  type MeasureDragState,
  type MeasureEndMode,
  type MeasureLineState,
  type MeasureStartMode
} from "../lib/measureTool";
import type { Projector } from "../lib/radar";
import type { ScreenPoint, SvgInteractionEvent } from "../lib/radarMapLayout";
import {
  formatHeading,
  trueToMagneticHeading
} from "../lib/radarMapViewModel";
import type { AircraftState } from "../lib/types";

interface UseRadarMeasureToolOptions {
  aircraft: AircraftState[];
  clientPointToSvgPoint: (event: SvgInteractionEvent) => ScreenPoint | null;
  isDatablockDragging: () => boolean;
  labelScale: number;
  magneticVariationWestDeg: number;
  onBeginMeasure: () => void;
  pointerEventToCoordinate: (event: ReactPointerEvent<SVGElement>) => [number, number] | null;
  projector: Pick<Projector, "project">;
  svgPointToMapPoint: (point: ScreenPoint) => ScreenPoint;
}

export function useRadarMeasureTool({
  aircraft,
  clientPointToSvgPoint,
  isDatablockDragging,
  labelScale,
  magneticVariationWestDeg,
  onBeginMeasure,
  pointerEventToCoordinate,
  projector,
  svgPointToMapPoint
}: UseRadarMeasureToolOptions) {
  const [measureLines, setMeasureLines] = useState<MeasureLineState[]>([]);
  const [measureDragState, setMeasureDragState] =
    useState<MeasureDragState>(IDLE_MEASURE_DRAG_STATE);
  const [snapAircraftId, setSnapAircraftId] = useState<string | null>(null);
  const aircraftRef = useRef(aircraft);
  const measureDragStateRef = useRef<MeasureDragState>(IDLE_MEASURE_DRAG_STATE);

  useEffect(() => {
    aircraftRef.current = aircraft;
  }, [aircraft]);

  useEffect(() => {
    function handleWindowMeasureStop(event: PointerEvent) {
      const activeDrag = measureDragStateRef.current;

      if (!activeDrag.active || activeDrag.pointerId !== event.pointerId) {
        return;
      }

      finishMeasureDrag();
    }

    window.addEventListener("pointerup", handleWindowMeasureStop);
    window.addEventListener("pointercancel", handleWindowMeasureStop);

    return () => {
      window.removeEventListener("pointerup", handleWindowMeasureStop);
      window.removeEventListener("pointercancel", handleWindowMeasureStop);
    };
  }, []);

  const renderedMeasureLines = buildRenderedMeasureLines(measureLines, measureDragState);
  const latestMeasureLineId =
    measureLines.length > 0 ? measureLines[measureLines.length - 1].id : null;

  function measureLineStartCoordinate(measureLine: MeasureLineState): [number, number] {
    return resolveMeasureLineStartCoordinate(measureLine, aircraft);
  }

  function measureLineEndCoordinate(measureLine: MeasureLineState): [number, number] {
    return resolveMeasureLineEndCoordinate(measureLine, aircraft);
  }

  function cumulativeMeasureDistanceNm(measureLineIndex: number) {
    return measureCumulativeDistanceNm(renderedMeasureLines, measureLineIndex, aircraft);
  }

  function snapMeasureEndToAircraft(
    event: ReactPointerEvent<SVGElement>,
    activeDrag: MeasureDragState
  ) {
    const svgPoint = clientPointToSvgPoint(event);

    if (!svgPoint) {
      return null;
    }

    const mapPoint = svgPointToMapPoint(svgPoint);
    let nearestAircraft: AircraftState | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const target of aircraft) {
      if (target.id === activeDrag.aircraftId) {
        continue;
      }

      const aircraftPoint = projector.project([target.longitude, target.latitude]);
      const distance = Math.hypot(mapPoint.x - aircraftPoint.x, mapPoint.y - aircraftPoint.y);

      if (distance < nearestDistance && distance <= 28) {
        nearestDistance = distance;
        nearestAircraft = target;
      }
    }

    if (!nearestAircraft) {
      return null;
    }

    return {
      aircraftId: nearestAircraft.id,
      coordinate: [nearestAircraft.longitude, nearestAircraft.latitude] as [number, number]
    };
  }

  function measureLineLabelContainsMapPoint(
    measureLine: MeasureLineState,
    measureLineIndex: number,
    mapPoint: ScreenPoint
  ) {
    const measureStart = measureLineStartCoordinate(measureLine);
    const startPoint = projector.project(measureStart);
    const measureEnd = measureLineEndCoordinate(measureLine);
    const endPoint = projector.project(measureEnd);
    const midPoint = {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2
    };
    const distanceNm = cumulativeMeasureDistanceNm(measureLineIndex);
    const bearingTrueDeg = measureLineBearingTrueDeg(measureLine, aircraft);
    const bearingMagDeg = trueToMagneticHeading(bearingTrueDeg, magneticVariationWestDeg);
    const label = `${measureDistanceLabel(distanceNm)}NM ${formatHeading(
      bearingMagDeg
    )} ${measureEtaLabel(distanceNm, measureLine.groundSpeedKt)}MIN`;
    const labelWidth = estimateMeasureLabelWidth(label);
    return measureLabelContainsMapPoint(mapPoint, midPoint, labelWidth, labelScale);
  }

  function clearMeasureLinesIfEventHitsLabel(event: SvgInteractionEvent) {
    if (measureLines.length === 0) {
      return false;
    }

    const svgPoint = clientPointToSvgPoint(event);

    if (!svgPoint) {
      return false;
    }

    const mapPoint = svgPointToMapPoint(svgPoint);
    const pointerHitsMeasureLabel = renderedMeasureLines.some(
      (measureLine, measureLineIndex) =>
        measureLine.fixed &&
        measureLineLabelContainsMapPoint(measureLine, measureLineIndex, mapPoint)
    );

    if (!pointerHitsMeasureLabel) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    clearMeasureLines();
    return true;
  }

  function updateSnapAircraftFromPointer(event: ReactPointerEvent<SVGElement>) {
    if (measureDragStateRef.current.active || isDatablockDragging()) {
      return;
    }

    const svgPoint = clientPointToSvgPoint(event);

    if (!svgPoint) {
      setSnapAircraftId(null);
      return;
    }

    const mapPoint = svgPointToMapPoint(svgPoint);
    let nearestAircraftId: string | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const target of aircraft) {
      const aircraftPoint = projector.project([target.longitude, target.latitude]);
      const distance = Math.hypot(mapPoint.x - aircraftPoint.x, mapPoint.y - aircraftPoint.y);

      if (distance < nearestDistance && distance <= 28) {
        nearestDistance = distance;
        nearestAircraftId = target.id;
      }
    }

    setSnapAircraftId(nearestAircraftId);
  }

  function handleMeasurePointerDown(
    event: ReactPointerEvent<SVGCircleElement>,
    target: AircraftState
  ) {
    if (clearMeasureLinesIfEventHitsLabel(event)) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onBeginMeasure();

    const start: [number, number] = [target.longitude, target.latitude];
    const pointerCoordinate = pointerEventToCoordinate(event) ?? start;
    const nextDragState: MeasureDragState = {
      active: true,
      aircraftId: target.id,
      pointerId: event.pointerId,
      start,
      startMode: "aircraft",
      end: pointerCoordinate,
      endMode: "point",
      endAircraftId: null,
      groundSpeedKt: target.ground_speed_kt,
      chainIndex: 1
    };

    setSnapAircraftId(null);
    setMeasureLines([]);
    measureDragStateRef.current = nextDragState;
    setMeasureDragState(nextDragState);
  }

  function handleMeasureChainPointerDown(
    event: ReactPointerEvent<SVGCircleElement>,
    sourceLine: MeasureLineState
  ) {
    if (event.button !== 0 || measureLines.length >= MAX_MEASURE_CHAIN_LEGS) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onBeginMeasure();

    const chainedStartAircraft =
      sourceLine.endMode === "aircraft" && sourceLine.endAircraftId
        ? aircraft.find((target) => target.id === sourceLine.endAircraftId)
        : null;
    const chainedStartMode: MeasureStartMode = chainedStartAircraft ? "aircraft" : "point";
    const startAircraftId = chainedStartAircraft?.id ?? sourceLine.aircraftId;
    const start: [number, number] = measureLineEndCoordinate(sourceLine);
    const pointerCoordinate = pointerEventToCoordinate(event) ?? start;
    const nextDragState: MeasureDragState = {
      active: true,
      aircraftId: startAircraftId,
      pointerId: event.pointerId,
      start,
      startMode: chainedStartMode,
      end: pointerCoordinate,
      endMode: "point",
      endAircraftId: null,
      groundSpeedKt: chainedStartAircraft?.ground_speed_kt ?? sourceLine.groundSpeedKt,
      chainIndex: Math.min(sourceLine.chainIndex + 1, MAX_MEASURE_CHAIN_LEGS)
    };

    setSnapAircraftId(null);
    measureDragStateRef.current = nextDragState;
    setMeasureDragState(nextDragState);
  }

  function handleMeasurePointerMove(event: ReactPointerEvent<SVGElement>) {
    const activeDrag = measureDragStateRef.current;

    if (!activeDrag.active || activeDrag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const snappedAircraft = snapMeasureEndToAircraft(event, activeDrag);
    const pointerCoordinate = snappedAircraft?.coordinate ?? pointerEventToCoordinate(event);

    if (!pointerCoordinate) {
      return;
    }

    const nextDragState = {
      ...activeDrag,
      end: pointerCoordinate,
      endMode: (snappedAircraft ? "aircraft" : "point") as MeasureEndMode,
      endAircraftId: snappedAircraft?.aircraftId ?? null
    };

    setSnapAircraftId(snappedAircraft?.aircraftId ?? null);
    measureDragStateRef.current = nextDragState;
    setMeasureDragState(nextDragState);
  }

  function finishMeasureDrag() {
    const activeDrag = measureDragStateRef.current;
    const completedLine = measureLineFromDrag(
      activeDrag,
      `measure-${activeDrag.aircraftId ?? "point"}-${Date.now()}`
    );

    if (completedLine) {
      const distanceNm = measureLineDistanceNm(completedLine, aircraftRef.current);

      if (distanceNm >= 0.1) {
        setMeasureLines((currentLines) => {
          if (currentLines.length >= MAX_MEASURE_CHAIN_LEGS) {
            return currentLines;
          }

          return [...currentLines, completedLine];
        });
      }
    }

    measureDragStateRef.current = IDLE_MEASURE_DRAG_STATE;
    setMeasureDragState(IDLE_MEASURE_DRAG_STATE);
    setSnapAircraftId(null);
  }

  function stopMeasureDragging(event: ReactPointerEvent<SVGElement>) {
    const activeDrag = measureDragStateRef.current;

    if (!activeDrag.active || activeDrag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleMeasurePointerMove(event);
    finishMeasureDrag();
  }

  function handleAircraftSnapEnter(aircraftId: string) {
    if (!measureDragStateRef.current.active) {
      setSnapAircraftId(aircraftId);
    }
  }

  function handleAircraftSnapLeave(aircraftId: string) {
    setSnapAircraftId((currentAircraftId) =>
      currentAircraftId === aircraftId ? null : currentAircraftId
    );
  }

  function clearMeasureLines() {
    measureDragStateRef.current = IDLE_MEASURE_DRAG_STATE;
    setMeasureDragState(IDLE_MEASURE_DRAG_STATE);
    setMeasureLines([]);
  }

  function clearMeasureSnap() {
    setSnapAircraftId(null);
  }

  function resetMeasureTool() {
    measureDragStateRef.current = IDLE_MEASURE_DRAG_STATE;
    setMeasureDragState(IDLE_MEASURE_DRAG_STATE);
    setMeasureLines([]);
    setSnapAircraftId(null);
  }

  function handleMeasureLineContextMenu(event: ReactMouseEvent<SVGElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleMeasureLinePointerDown(event: ReactPointerEvent<SVGElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    clearMeasureLines();
  }

  function handleMeasureLineMouseDown(event: ReactMouseEvent<SVGElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    clearMeasureLines();
  }

  function handleMeasureLineClick(event: ReactMouseEvent<SVGElement>) {
    event.preventDefault();
    event.stopPropagation();
    clearMeasureLines();
  }

  function handleAircraftMeasureHitboxClick(event: ReactMouseEvent<SVGCircleElement>) {
    if (!clearMeasureLinesIfEventHitsLabel(event)) {
      event.stopPropagation();
    }
  }

  function isMeasureDragging() {
    return measureDragStateRef.current.active;
  }

  return {
    clearMeasureLines,
    clearMeasureLinesIfEventHitsLabel,
    clearMeasureSnap,
    handleAircraftMeasureHitboxClick,
    handleAircraftSnapEnter,
    handleAircraftSnapLeave,
    handleMeasureChainPointerDown,
    handleMeasureLineClick,
    handleMeasureLineContextMenu,
    handleMeasureLineMouseDown,
    handleMeasureLinePointerDown,
    handleMeasurePointerDown,
    handleMeasurePointerMove,
    isMeasureDragging,
    latestMeasureLineId,
    measureDragState,
    measureLineCount: measureLines.length,
    renderedMeasureLines,
    resetMeasureTool,
    snapAircraftId,
    stopMeasureDragging,
    updateSnapAircraftFromPointer
  };
}
