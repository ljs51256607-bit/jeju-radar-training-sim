import {
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from "react";
import type { ScreenPoint } from "../lib/radarMapLayout";
import { initialViewForScope } from "../lib/radarMapViewModel";

interface RadarViewportDragState {
  active: boolean;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface UseRadarViewportControllerOptions {
  initialZoom: number;
  maxZoom: number;
  minZoom: number;
}

export function useRadarViewportController({
  initialZoom,
  maxZoom,
  minZoom
}: UseRadarViewportControllerOptions) {
  const [zoom, setZoom] = useState(initialZoom);
  const [pan, setPan] = useState<ScreenPoint>({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<RadarViewportDragState>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0
  });
  const zoomScale = clampZoom(zoom, minZoom, maxZoom);

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.16 : -0.16;
    setZoom((currentZoom) => clampZoom(currentZoom + delta, minZoom, maxZoom));
  }

  function startDragging(event: ReactPointerEvent<SVGSVGElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y
    });
  }

  function moveDragging(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragState.active) {
      return false;
    }

    event.preventDefault();
    setPan({
      x: dragState.originX + (event.clientX - dragState.startX),
      y: dragState.originY + (event.clientY - dragState.startY)
    });
    return true;
  }

  function stopDragging() {
    setDragState((currentState) => ({
      ...currentState,
      active: false
    }));
  }

  function resetViewport() {
    const initialView = initialViewForScope(initialZoom);
    setZoom(initialView.zoom);
    setPan(initialView.pan);
    stopDragging();
  }

  function zoomIn() {
    setZoom((currentZoom) => clampZoom(currentZoom + 0.2, minZoom, maxZoom));
  }

  function zoomOut() {
    setZoom((currentZoom) => clampZoom(currentZoom - 0.2, minZoom, maxZoom));
  }

  return {
    dragState,
    handleWheel,
    moveDragging,
    pan,
    resetViewport,
    startDragging,
    stopDragging,
    zoom,
    zoomIn,
    zoomOut,
    zoomScale
  };
}

function clampZoom(nextZoom: number, minZoom: number, maxZoom: number) {
  return Math.min(maxZoom, Math.max(minZoom, Number(nextZoom.toFixed(2))));
}
