import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  IDLE_DATABLOCK_DRAG_STATE,
  type DatablockDragState
} from "../lib/radarAircraftMenu";
import type { ScreenPoint } from "../lib/radarMapLayout";

interface UseRadarDatablockDragOptions {
  onSelectAircraft: (aircraftId: string) => void;
  viewHeight: number;
  viewWidth: number;
  zoomScale: number;
}

export function useRadarDatablockDrag({
  onSelectAircraft,
  viewHeight,
  viewWidth,
  zoomScale
}: UseRadarDatablockDragOptions) {
  const [datablockOffsets, setDatablockOffsets] = useState<Record<string, ScreenPoint>>({});
  const [datablockDragState, setDatablockDragState] =
    useState<DatablockDragState>(IDLE_DATABLOCK_DRAG_STATE);
  const datablockDragStateRef = useRef<DatablockDragState>(IDLE_DATABLOCK_DRAG_STATE);

  function resetDatablockDrag() {
    setDatablockOffsets({});
    datablockDragStateRef.current = IDLE_DATABLOCK_DRAG_STATE;
    setDatablockDragState(IDLE_DATABLOCK_DRAG_STATE);
  }

  function clientDeltaToMapDelta(event: ReactPointerEvent<SVGGElement>, activeDrag: DatablockDragState) {
    const ownerSvg = event.currentTarget.ownerSVGElement;
    const bounds = ownerSvg?.getBoundingClientRect();

    if (!bounds || bounds.width === 0 || bounds.height === 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: ((event.clientX - activeDrag.startX) * viewWidth) / bounds.width / zoomScale,
      y: ((event.clientY - activeDrag.startY) * viewHeight) / bounds.height / zoomScale
    };
  }

  function handleDatablockPointerDown(
    event: ReactPointerEvent<SVGGElement>,
    aircraftId: string,
    blockOffset: ScreenPoint
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelectAircraft(aircraftId);
    const nextDragState = {
      active: true,
      aircraftId,
      startX: event.clientX,
      startY: event.clientY,
      originX: blockOffset.x,
      originY: blockOffset.y
    };
    datablockDragStateRef.current = nextDragState;
    setDatablockDragState(nextDragState);
  }

  function handleDatablockPointerMove(event: ReactPointerEvent<SVGGElement>) {
    const activeDrag = datablockDragStateRef.current;

    if (!activeDrag.active || !activeDrag.aircraftId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const delta = clientDeltaToMapDelta(event, activeDrag);
    const nextOffset = {
      x: activeDrag.originX + delta.x,
      y: activeDrag.originY + delta.y
    };

    setDatablockOffsets((currentOffsets) => ({
      ...currentOffsets,
      [activeDrag.aircraftId as string]: nextOffset
    }));
  }

  function stopDatablockDragging(event: ReactPointerEvent<SVGGElement>) {
    const activeDrag = datablockDragStateRef.current;

    if (activeDrag.active) {
      event.preventDefault();
      event.stopPropagation();
    }

    const nextDragState = {
      ...activeDrag,
      active: false,
      aircraftId: null
    };
    datablockDragStateRef.current = nextDragState;
    setDatablockDragState(nextDragState);
  }

  return {
    datablockDragState,
    datablockDragStateRef,
    datablockOffsets,
    handleDatablockPointerDown,
    handleDatablockPointerMove,
    resetDatablockDrag,
    stopDatablockDragging
  };
}
