import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import RadarAircraftLayer from "./RadarAircraftLayer";
import RadarBaseMapLayer from "./RadarBaseMapLayer";
import RadarLabelLayer from "./RadarLabelLayer";
import RadarMeasureLayer, {
  RadarMeasureDeleteOverlay
} from "./RadarMeasureLayer";
import RadarSpawnPickMarker from "./RadarSpawnPickMarker";
import type { HoldingOverlayGeometry } from "../lib/holdingOverlayGeometry";
import type { MeasureDragState, MeasureLineState } from "../lib/measureTool";
import type { Projector } from "../lib/radar";
import type {
  PlacedMapLabel,
  ScreenPoint
} from "../lib/radarMapLayout";
import type {
  AircraftState,
  DensityMode,
  GeoFeature,
  MapLabel,
  RadarDataset,
  RunwayMode
} from "../lib/types";
import type { DatablockDragState } from "../lib/radarAircraftMenu";
import type { ProjectedSegment } from "./RadarRunwayBar";

interface RadarMapSceneLayersProps {
  aircraft: AircraftState[];
  boundaryFeatures: GeoFeature[];
  datablockDragState: DatablockDragState;
  datablockOffsets: Record<string, ScreenPoint>;
  densityMode: DensityMode;
  fixSpawnPickActive: boolean;
  formatHeading: (headingDeg: number) => string;
  holdingOverlays: HoldingOverlayGeometry[];
  labelScale: number;
  latestMeasureLineId: string | null;
  latitudeGridLines: number[];
  longitudeGridLines: number[];
  magneticVariationWestDeg: number;
  mapSpawnScreenPoint: ScreenPoint | null;
  mapTransform: string;
  measureDragState: MeasureDragState;
  measureLineCount: number;
  mvaAltitudeLabelFeatures: GeoFeature[];
  onAircraftMeasureHitboxClick: (event: ReactMouseEvent<SVGCircleElement>) => void;
  onAircraftSnapEnter: (aircraftId: string) => void;
  onAircraftSnapLeave: (aircraftId: string) => void;
  onCallsignClick: (event: ReactMouseEvent<SVGElement>) => void;
  onCallsignDoubleClick: (event: ReactMouseEvent<SVGElement>, target: AircraftState) => void;
  onCallsignPointerDown: (event: ReactPointerEvent<SVGElement>) => void;
  onClearMeasureLines: () => void;
  onDatablockPointerDown: (
    event: ReactPointerEvent<SVGGElement>,
    aircraftId: string,
    blockOffset: ScreenPoint
  ) => void;
  onDatablockPointerMove: (event: ReactPointerEvent<SVGGElement>) => void;
  onDirectFixClick: (event: ReactMouseEvent<SVGElement>, label: MapLabel) => void;
  onDirectFixMouseDown: (event: ReactMouseEvent<SVGElement>, label: MapLabel) => void;
  onDirectFixPointerDown: (event: ReactPointerEvent<SVGElement>, label: MapLabel) => void;
  onMeasureChainPointerDown: (
    event: ReactPointerEvent<SVGCircleElement>,
    sourceLine: MeasureLineState
  ) => void;
  onMeasureLineClick: (event: ReactMouseEvent<SVGElement>) => void;
  onMeasureLineContextMenu: (event: ReactMouseEvent<SVGElement>) => void;
  onMeasureLineMouseDown: (event: ReactMouseEvent<SVGElement>) => void;
  onMeasureLinePointerDown: (event: ReactPointerEvent<SVGElement>) => void;
  onMeasurePointerDown: (
    event: ReactPointerEvent<SVGCircleElement>,
    target: AircraftState
  ) => void;
  onMeasurePointerMove: (event: ReactPointerEvent<SVGElement>) => void;
  onSelectAircraft: (aircraftId: string) => void;
  onStopDatablockDragging: (event: ReactPointerEvent<SVGGElement>) => void;
  onStopMeasureDragging: (event: ReactPointerEvent<SVGElement>) => void;
  placedLabels: PlacedMapLabel[];
  primaryRunwayBar: ProjectedSegment | null;
  projector: Projector;
  radarSite: [number, number] | null;
  rangeRings: number[];
  renderedMeasureLines: MeasureLineState[];
  scopeExtent: RadarDataset["geometry"]["chart_guides"]["scope_extent"] | undefined;
  selectedAircraftDirectFixId: string | null;
  selectedAircraftId: string | null;
  selectedRunway: RunwayMode;
  showMvaAltitudeLabels: boolean;
  showRings: boolean;
  snapAircraftId: string | null;
  specialUseFeatures: GeoFeature[];
  surveillanceBoundaryFeatures: GeoFeature[];
  trueToMagneticHeading: (headingTrueDeg: number, magneticVariationWestDeg: number) => number;
  viewHeight: number;
  viewWidth: number;
  visibleFeatures: GeoFeature[];
}

export default function RadarMapSceneLayers({
  aircraft,
  boundaryFeatures,
  datablockDragState,
  datablockOffsets,
  densityMode,
  fixSpawnPickActive,
  formatHeading,
  holdingOverlays,
  labelScale,
  latestMeasureLineId,
  latitudeGridLines,
  longitudeGridLines,
  magneticVariationWestDeg,
  mapSpawnScreenPoint,
  mapTransform,
  measureDragState,
  measureLineCount,
  mvaAltitudeLabelFeatures,
  onAircraftMeasureHitboxClick,
  onAircraftSnapEnter,
  onAircraftSnapLeave,
  onCallsignClick,
  onCallsignDoubleClick,
  onCallsignPointerDown,
  onClearMeasureLines,
  onDatablockPointerDown,
  onDatablockPointerMove,
  onDirectFixClick,
  onDirectFixMouseDown,
  onDirectFixPointerDown,
  onMeasureChainPointerDown,
  onMeasureLineClick,
  onMeasureLineContextMenu,
  onMeasureLineMouseDown,
  onMeasureLinePointerDown,
  onMeasurePointerDown,
  onMeasurePointerMove,
  onSelectAircraft,
  onStopDatablockDragging,
  onStopMeasureDragging,
  placedLabels,
  primaryRunwayBar,
  projector,
  radarSite,
  rangeRings,
  renderedMeasureLines,
  scopeExtent,
  selectedAircraftDirectFixId,
  selectedAircraftId,
  selectedRunway,
  showMvaAltitudeLabels,
  showRings,
  snapAircraftId,
  specialUseFeatures,
  surveillanceBoundaryFeatures,
  trueToMagneticHeading,
  viewHeight,
  viewWidth,
  visibleFeatures
}: RadarMapSceneLayersProps) {
  const project = (coordinate: [number, number]) => projector.project(coordinate);

  return (
    <g transform={mapTransform}>
      <RadarBaseMapLayer
        boundaryFeatures={boundaryFeatures}
        holdingOverlays={holdingOverlays}
        labelScale={labelScale}
        latitudeGridLines={latitudeGridLines}
        longitudeGridLines={longitudeGridLines}
        mvaAltitudeLabelFeatures={mvaAltitudeLabelFeatures}
        primaryRunwayBar={primaryRunwayBar}
        projector={projector}
        radarSite={radarSite}
        rangeRings={rangeRings}
        scopeExtent={scopeExtent}
        selectedRunway={selectedRunway}
        showMvaAltitudeLabels={showMvaAltitudeLabels}
        showRings={showRings}
        specialUseFeatures={specialUseFeatures}
        surveillanceBoundaryFeatures={surveillanceBoundaryFeatures}
        viewHeight={viewHeight}
        viewWidth={viewWidth}
        visibleFeatures={visibleFeatures}
      />

      <RadarLabelLayer
        fixSpawnPickActive={fixSpawnPickActive}
        labelScale={labelScale}
        onDirectFixClick={onDirectFixClick}
        onDirectFixMouseDown={onDirectFixMouseDown}
        onDirectFixPointerDown={onDirectFixPointerDown}
        placedLabels={placedLabels}
        selectedAircraftDirectFixId={selectedAircraftDirectFixId}
        selectedAircraftId={selectedAircraftId}
      />

      <RadarMeasureLayer
        aircraft={aircraft}
        formatHeading={formatHeading}
        labelScale={labelScale}
        latestMeasureLineId={latestMeasureLineId}
        magneticVariationWestDeg={magneticVariationWestDeg}
        measureLineCount={measureLineCount}
        onMeasureChainPointerDown={onMeasureChainPointerDown}
        onMeasureLineClick={onMeasureLineClick}
        onMeasureLineContextMenu={onMeasureLineContextMenu}
        onMeasureLineMouseDown={onMeasureLineMouseDown}
        onMeasureLinePointerDown={onMeasureLinePointerDown}
        onMeasurePointerMove={onMeasurePointerMove}
        onStopMeasureDragging={onStopMeasureDragging}
        project={project}
        renderedMeasureLines={renderedMeasureLines}
        trueToMagneticHeading={trueToMagneticHeading}
      />

      <RadarSpawnPickMarker point={mapSpawnScreenPoint} />

      <RadarAircraftLayer
        aircraft={aircraft}
        datablockDragState={datablockDragState}
        datablockOffsets={datablockOffsets}
        densityMode={densityMode}
        measureDragState={measureDragState}
        onAircraftMeasureHitboxClick={onAircraftMeasureHitboxClick}
        onAircraftSnapEnter={onAircraftSnapEnter}
        onAircraftSnapLeave={onAircraftSnapLeave}
        onCallsignClick={onCallsignClick}
        onCallsignDoubleClick={onCallsignDoubleClick}
        onCallsignPointerDown={onCallsignPointerDown}
        onDatablockPointerDown={onDatablockPointerDown}
        onDatablockPointerMove={onDatablockPointerMove}
        onMeasurePointerDown={onMeasurePointerDown}
        onMeasurePointerMove={onMeasurePointerMove}
        onSelectAircraft={onSelectAircraft}
        onStopDatablockDragging={onStopDatablockDragging}
        onStopMeasureDragging={onStopMeasureDragging}
        project={project}
        selectedAircraftId={selectedAircraftId}
        snapAircraftId={snapAircraftId}
        viewWidth={viewWidth}
      />

      <RadarMeasureDeleteOverlay
        aircraft={aircraft}
        formatHeading={formatHeading}
        labelScale={labelScale}
        magneticVariationWestDeg={magneticVariationWestDeg}
        onClearMeasureLines={onClearMeasureLines}
        onMeasureLineClick={onMeasureLineClick}
        onMeasureLineContextMenu={onMeasureLineContextMenu}
        onMeasureLineMouseDown={onMeasureLineMouseDown}
        onMeasureLinePointerDown={onMeasureLinePointerDown}
        project={project}
        renderedMeasureLines={renderedMeasureLines}
        trueToMagneticHeading={trueToMagneticHeading}
      />
    </g>
  );
}
