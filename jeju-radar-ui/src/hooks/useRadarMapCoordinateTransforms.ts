import type { MutableRefObject, PointerEvent as ReactPointerEvent } from "react";
import type { Projector } from "../lib/radar";
import {
  clientPointToShellPoint as resolveClientPointToShellPoint,
  clientPointToSvgPoint as resolveClientPointToSvgPoint,
  mapPointToShellPoint as resolveMapPointToShellPoint,
  svgPointToMapPoint as resolveSvgPointToMapPoint,
  type ScreenPoint,
  type SvgInteractionEvent
} from "../lib/radarMapLayout";

interface UseRadarMapCoordinateTransformsOptions {
  pan: ScreenPoint;
  projector: Pick<Projector, "unproject">;
  svgRef: MutableRefObject<SVGSVGElement | null>;
  svgSize: { width: number; height: number };
  viewHeight: number;
  viewWidth: number;
  zoomScale: number;
}

export function useRadarMapCoordinateTransforms({
  pan,
  projector,
  svgRef,
  svgSize,
  viewHeight,
  viewWidth,
  zoomScale
}: UseRadarMapCoordinateTransformsOptions) {
  function mapPointToShellPoint(point: ScreenPoint) {
    return resolveMapPointToShellPoint(point, svgSize, {
      pan,
      viewHeight,
      viewWidth,
      zoomScale
    });
  }

  function clientPointToShellPoint(clientX: number, clientY: number) {
    const bounds = svgRef.current?.getBoundingClientRect();

    if (!bounds) {
      return null;
    }

    return resolveClientPointToShellPoint(clientX, clientY, bounds);
  }

  function clientPointToSvgPoint(event: SvgInteractionEvent) {
    return resolveClientPointToSvgPoint(event, viewWidth, viewHeight);
  }

  function svgPointToMapPoint(point: ScreenPoint) {
    return resolveSvgPointToMapPoint(point, {
      pan,
      viewHeight,
      viewWidth,
      zoomScale
    });
  }

  function pointerEventToCoordinate(event: ReactPointerEvent<SVGElement>) {
    const svgPoint = clientPointToSvgPoint(event);

    if (!svgPoint) {
      return null;
    }

    return projector.unproject(svgPointToMapPoint(svgPoint));
  }

  return {
    clientPointToShellPoint,
    clientPointToSvgPoint,
    mapPointToShellPoint,
    pointerEventToCoordinate,
    svgPointToMapPoint
  };
}
