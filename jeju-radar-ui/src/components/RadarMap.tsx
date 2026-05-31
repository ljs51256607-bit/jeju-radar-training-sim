import {
  useEffect,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  RadarMapHud
} from "./RadarMapHud";
import RadarMapHtmlOverlays from "./RadarMapHtmlOverlays";
import RadarMapSceneLayers from "./RadarMapSceneLayers";
import { useRadarAircraftTextMenu } from "../hooks/useRadarAircraftTextMenu";
import { useRadarDatablockDrag } from "../hooks/useRadarDatablockDrag";
import { useRadarFixPickInteractions } from "../hooks/useRadarFixPickInteractions";
import { useRadarMapCoordinateTransforms } from "../hooks/useRadarMapCoordinateTransforms";
import { useRadarMeasureTool } from "../hooks/useRadarMeasureTool";
import { useRadarViewportController } from "../hooks/useRadarViewportController";
import { useSvgViewportSize } from "../hooks/useSvgViewportSize";
import {
  formatHeading,
  radarMapSceneViewModel,
  trueToMagneticHeading
} from "../lib/radarMapViewModel";
import { buildRadarScaleReadout } from "../lib/radarScaleReadout";
import type { ScenarioOverlayState } from "../lib/scenarioStorage";
import { RADAR_MAP_VIEWPORT } from "../lib/radarMapViewportConfig";
import type {
  AircraftQuickCommandField,
  AircraftState,
  DensityMode,
  MapLabel,
  ProcedureMenuAction,
  RadarDataset,
  RunwayMode,
  SurfaceMode
} from "../lib/types";

const {
  height: VIEW_HEIGHT,
  initialZoom: INITIAL_ZOOM,
  maxZoom: MAX_ZOOM,
  minZoom: MIN_ZOOM,
  width: VIEW_WIDTH
} = RADAR_MAP_VIEWPORT;

interface RadarMapProps {
  aircraft: AircraftState[];
  densityMode: DensityMode;
  dataset: RadarDataset;
  mapSpawnPickActive: boolean;
  mapSpawnPoint: { latitude: number; longitude: number } | null;
  onAssignProcedureAction: (aircraftId: string, action: ProcedureMenuAction) => void;
  onApplyAircraftCommand: (
    aircraftId: string,
    field: AircraftQuickCommandField,
    value: string
  ) => void;
  onApplyPublishedHold: (aircraftId: string, altitude: string, speed: string) => void;
  onApplyAdHocHoldFix: (aircraftId: string, fixId: string) => void;
  onApplyAdHocHoldNow: (aircraftId: string) => void;
  onBeginMeasure: () => void;
  onClearAircraftText: (aircraftId: string) => void;
  onDirectToFix: (fix: MapLabel) => void;
  onPickFixSpawn: (fix: MapLabel) => void;
  onPickMapSpawnPoint: (point: { latitude: number; longitude: number }) => void;
  onSelectAircraft: (aircraftId: string) => void;
  onSetAircraftText: (aircraftId: string, value: string) => void;
  fixSpawnPickActive: boolean;
  selectedAircraftDirectFixId: string | null;
  selectedRunway: RunwayMode;
  selectedAircraftId: string | null;
  overlays: ScenarioOverlayState;
  showChrome: boolean;
  surfaceMode: SurfaceMode;
  lastRadarUpdateAt: number | null;
  radarPaused: boolean;
  magneticVariationWestDeg: number;
}

export default function RadarMap({
  aircraft,
  densityMode,
  dataset,
  mapSpawnPickActive,
  mapSpawnPoint,
  onAssignProcedureAction,
  onApplyAircraftCommand,
  onApplyAdHocHoldFix,
  onApplyAdHocHoldNow,
  onApplyPublishedHold,
  onBeginMeasure,
  onClearAircraftText,
  onDirectToFix,
  onPickFixSpawn,
  onPickMapSpawnPoint,
  onSelectAircraft,
  onSetAircraftText,
  fixSpawnPickActive,
  selectedAircraftDirectFixId,
  selectedRunway,
  selectedAircraftId,
  overlays,
  showChrome,
  surfaceMode,
  lastRadarUpdateAt,
  radarPaused,
  magneticVariationWestDeg
}: RadarMapProps) {
  const {
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
  } = useRadarViewportController({
    initialZoom: INITIAL_ZOOM,
    maxZoom: MAX_ZOOM,
    minZoom: MIN_ZOOM
  });
  const { svgRef, svgSize } = useSvgViewportSize();
  const {
    datablockDragState,
    datablockDragStateRef,
    datablockOffsets,
    handleDatablockPointerDown,
    handleDatablockPointerMove,
    resetDatablockDrag,
    stopDatablockDragging
  } = useRadarDatablockDrag({
    onSelectAircraft,
    viewHeight: VIEW_HEIGHT,
    viewWidth: VIEW_WIDTH,
    zoomScale
  });
  const {
    activeOverlayNames,
    boundaryFeatures,
    holdingOverlays,
    labelScale,
    latitudeGridLines,
    longitudeGridLines,
    mapSpawnScreenPoint,
    mapTransform,
    mvaAltitudeLabelFeatures,
    placedLabels,
    primaryRunwayBar,
    projector,
    radarSite,
    rangeRings,
    scopeExtent,
    showMvaAltitudeLabels,
    specialUseFeatures,
    surveillanceBoundaryFeatures,
    visibleFeatures,
    visibleLabels,
    zoomLod
  } = radarMapSceneViewModel({
    dataset,
    densityMode,
    mapSpawnPoint,
    maxZoom: MAX_ZOOM,
    minZoom: MIN_ZOOM,
    overlays,
    pan,
    selectedRunway,
    viewHeight: VIEW_HEIGHT,
    viewWidth: VIEW_WIDTH,
    zoom
  });
  const {
    clientPointToShellPoint,
    clientPointToSvgPoint,
    mapPointToShellPoint,
    pointerEventToCoordinate,
    svgPointToMapPoint
  } = useRadarMapCoordinateTransforms({
    pan,
    projector,
    svgRef,
    svgSize,
    viewHeight: VIEW_HEIGHT,
    viewWidth: VIEW_WIDTH,
    zoomScale
  });
  const scaleReadout = buildRadarScaleReadout({
    pan,
    projector,
    radarSite,
    svgSize,
    viewHeight: VIEW_HEIGHT,
    viewWidth: VIEW_WIDTH,
    zoomScale
  });
  const {
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
    measureLineCount,
    renderedMeasureLines,
    resetMeasureTool,
    snapAircraftId,
    stopMeasureDragging,
    updateSnapAircraftFromPointer
  } = useRadarMeasureTool({
    aircraft,
    clientPointToSvgPoint,
    isDatablockDragging: () => datablockDragStateRef.current.active,
    labelScale,
    magneticVariationWestDeg,
    onBeginMeasure,
    pointerEventToCoordinate,
    projector,
    svgPointToMapPoint
  });
  const {
    handleDirectFixClick,
    handleDirectFixMouseDown,
    handleDirectFixPointerDown
  } = useRadarFixPickInteractions({
    clearMeasureLines,
    fixSpawnPickActive,
    onDirectToFix,
    onPickFixSpawn,
    selectedAircraftId
  });

  const {
    aircraftTextMenu,
    aircraftTextMenuProcedureActions,
    aircraftTextMenuPublishedHoldFixId,
    beginAircraftMenuCommand,
    closeAircraftTextMenu,
    commitAircraftCommandMenu,
    commitAircraftTextMenu,
    handleCallsignClick,
    handleCallsignDoubleClick,
    handleCallsignPointerDown,
    quickAltitudeManualInputRef,
    setAircraftTextMenu
  } = useRadarAircraftTextMenu({
    aircraft,
    clientPointToShellPoint,
    magneticVariationWestDeg,
    onApplyAircraftCommand,
    onSelectAircraft,
    onSetAircraftText
  });

  useEffect(() => {
    resetViewport();
    resetDatablockDrag();
    resetMeasureTool();
    closeAircraftTextMenu();
  }, [selectedRunway]);

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (clearMeasureLinesIfEventHitsLabel(event)) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (mapSpawnPickActive) {
      const pickedCoordinate = pointerEventToCoordinate(event);

      event.preventDefault();
      event.stopPropagation();
      closeAircraftTextMenu();
      stopDragging();

      if (pickedCoordinate) {
        onPickMapSpawnPoint({
          longitude: pickedCoordinate[0],
          latitude: pickedCoordinate[1]
        });
      }

      return;
    }

    event.preventDefault();
    closeAircraftTextMenu();
    startDragging(event);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (isMeasureDragging()) {
      handleMeasurePointerMove(event);
      return;
    }

    if (!dragState.active) {
      updateSnapAircraftFromPointer(event);
      return;
    }

    clearMeasureSnap();
    moveDragging(event);
  }

  function handleMapClick(event: ReactMouseEvent<SVGSVGElement>) {
    if (mapSpawnPickActive) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    closeAircraftTextMenu();
    clearMeasureLinesIfEventHitsLabel(event);
  }

  function stopPointerInteractions(event: ReactPointerEvent<SVGSVGElement>) {
    stopMeasureDragging(event);
    stopDragging();
  }

  return (
    <section className="radar-shell">
      <RadarMapHud
        activeOverlayNames={activeOverlayNames}
        aircraftCount={aircraft.length}
        airportIcao={dataset.airport.airport_meta.icao}
        selectedRunway={selectedRunway}
        showChrome={showChrome}
        tmaFeatureCount={dataset.tmaAirspace.features.length}
        visibleLabelCount={visibleLabels.length}
      />

      <svg
        ref={svgRef}
        className={[
          "radar-map",
          dragState.active ? "dragging" : "",
          mapSpawnPickActive ? "picking-spawn" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="제주 TMA 레이더 베이스 화면"
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onClick={handleMapClick}
        onPointerLeave={() => {
          stopDragging();
          clearMeasureSnap();
        }}
        onPointerMove={handlePointerMove}
        onPointerCancel={stopPointerInteractions}
        onPointerUp={stopPointerInteractions}
        onWheel={handleWheel}
      >
        <defs>
          <linearGradient id="radarFade" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(115, 255, 247, 0.05)" />
            <stop offset="100%" stopColor="rgba(115, 255, 247, 0.01)" />
          </linearGradient>
        </defs>

        <rect className="radar-bg" x="0" y="0" width={VIEW_WIDTH} height={VIEW_HEIGHT} />
        <rect className="radar-overlay" x="0" y="0" width={VIEW_WIDTH} height={VIEW_HEIGHT} />

        <RadarMapSceneLayers
          aircraft={aircraft}
          boundaryFeatures={boundaryFeatures}
          datablockDragState={datablockDragState}
          datablockOffsets={datablockOffsets}
          densityMode={densityMode}
          fixSpawnPickActive={fixSpawnPickActive}
          formatHeading={formatHeading}
          holdingOverlays={holdingOverlays}
          labelScale={labelScale}
          latestMeasureLineId={latestMeasureLineId}
          latitudeGridLines={latitudeGridLines}
          longitudeGridLines={longitudeGridLines}
          magneticVariationWestDeg={magneticVariationWestDeg}
          mapSpawnScreenPoint={mapSpawnScreenPoint}
          mapTransform={mapTransform}
          measureDragState={measureDragState}
          measureLineCount={measureLineCount}
          mvaAltitudeLabelFeatures={mvaAltitudeLabelFeatures}
          onAircraftMeasureHitboxClick={handleAircraftMeasureHitboxClick}
          onAircraftSnapEnter={handleAircraftSnapEnter}
          onAircraftSnapLeave={handleAircraftSnapLeave}
          onCallsignClick={handleCallsignClick}
          onCallsignDoubleClick={handleCallsignDoubleClick}
          onCallsignPointerDown={handleCallsignPointerDown}
          onClearMeasureLines={clearMeasureLines}
          onDatablockPointerDown={handleDatablockPointerDown}
          onDatablockPointerMove={handleDatablockPointerMove}
          onDirectFixClick={handleDirectFixClick}
          onDirectFixMouseDown={handleDirectFixMouseDown}
          onDirectFixPointerDown={handleDirectFixPointerDown}
          onMeasureChainPointerDown={handleMeasureChainPointerDown}
          onMeasureLineClick={handleMeasureLineClick}
          onMeasureLineContextMenu={handleMeasureLineContextMenu}
          onMeasureLineMouseDown={handleMeasureLineMouseDown}
          onMeasureLinePointerDown={handleMeasureLinePointerDown}
          onMeasurePointerDown={handleMeasurePointerDown}
          onMeasurePointerMove={handleMeasurePointerMove}
          onSelectAircraft={onSelectAircraft}
          onStopDatablockDragging={stopDatablockDragging}
          onStopMeasureDragging={stopMeasureDragging}
          placedLabels={placedLabels}
          primaryRunwayBar={primaryRunwayBar}
          projector={projector}
          radarSite={radarSite}
          rangeRings={rangeRings}
          renderedMeasureLines={renderedMeasureLines}
          scopeExtent={scopeExtent}
          selectedAircraftDirectFixId={selectedAircraftDirectFixId}
          selectedAircraftId={selectedAircraftId}
          selectedRunway={selectedRunway}
          showMvaAltitudeLabels={showMvaAltitudeLabels}
          showRings={overlays.rings}
          snapAircraftId={snapAircraftId}
          specialUseFeatures={specialUseFeatures}
          surveillanceBoundaryFeatures={surveillanceBoundaryFeatures}
          trueToMagneticHeading={trueToMagneticHeading}
          viewHeight={VIEW_HEIGHT}
          viewWidth={VIEW_WIDTH}
          visibleFeatures={visibleFeatures}
        />
      </svg>

      <RadarMapHtmlOverlays
        aircraft={aircraft}
        aircraftTextMenu={aircraftTextMenu}
        aircraftTextMenuProcedureActions={aircraftTextMenuProcedureActions}
        aircraftTextMenuPublishedHoldFixId={aircraftTextMenuPublishedHoldFixId}
        densityMode={densityMode}
        formatHeading={formatHeading}
        labelScale={labelScale}
        lastRadarUpdateAt={lastRadarUpdateAt}
        magneticVariationWestDeg={magneticVariationWestDeg}
        mapPointToShellPoint={mapPointToShellPoint}
        onApplyAircraftCommand={onApplyAircraftCommand}
        onApplyAdHocHoldFix={onApplyAdHocHoldFix}
        onApplyAdHocHoldNow={onApplyAdHocHoldNow}
        onApplyPublishedHold={onApplyPublishedHold}
        onAssignProcedureAction={onAssignProcedureAction}
        onBeginAircraftMenuCommand={beginAircraftMenuCommand}
        onClearAircraftText={onClearAircraftText}
        onClearMeasureLines={clearMeasureLines}
        onCommitAircraftCommandMenu={commitAircraftCommandMenu}
        onCommitAircraftTextMenu={commitAircraftTextMenu}
        onResetViewport={resetViewport}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        project={(coordinate) => projector.project(coordinate)}
        quickAltitudeManualInputRef={quickAltitudeManualInputRef}
        radarPaused={radarPaused}
        renderedMeasureLines={renderedMeasureLines}
        scaleReadout={scaleReadout}
        setAircraftTextMenu={setAircraftTextMenu}
        showChrome={showChrome}
        surfaceMode={surfaceMode}
        trueToMagneticHeading={trueToMagneticHeading}
        zoomLod={zoomLod}
        zoomScale={zoomScale}
      />
    </section>
  );
}
