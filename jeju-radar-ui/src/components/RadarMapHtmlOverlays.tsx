import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  SetStateAction
} from "react";
import { RadarMeasureHtmlDeleteButtons } from "./RadarMeasureLayer";
import RadarMapControls from "./RadarMapControls";
import RadarTextMenu from "./RadarTextMenu";
import type { MeasureLineState } from "../lib/measureTool";
import type { AircraftTextMenuState } from "../lib/radarAircraftMenu";
import type { RadarScaleReadout } from "../lib/radarScaleReadout";
import type { ScreenPoint } from "../lib/radarMapLayout";
import type {
  AircraftQuickCommandField,
  AircraftState,
  DensityMode,
  ProcedureMenuAction,
  SurfaceMode
} from "../lib/types";

interface RadarMapHtmlOverlaysProps {
  aircraft: AircraftState[];
  aircraftTextMenu: AircraftTextMenuState | null;
  aircraftTextMenuProcedureActions: ProcedureMenuAction[];
  aircraftTextMenuPublishedHoldFixId: string | null;
  densityMode: DensityMode;
  formatHeading: (headingDeg: number) => string;
  labelScale: number;
  lastRadarUpdateAt: number | null;
  magneticVariationWestDeg: number;
  mapPointToShellPoint: (point: ScreenPoint) => { x: number; y: number; scale: number } | null;
  onApplyAircraftCommand: (
    aircraftId: string,
    field: AircraftQuickCommandField,
    value: string
  ) => void;
  onApplyAdHocHoldFix: (aircraftId: string, fixId: string) => void;
  onApplyAdHocHoldNow: (aircraftId: string) => void;
  onApplyPublishedHold: (aircraftId: string, altitude: string, speed: string) => void;
  onAssignProcedureAction: (aircraftId: string, action: ProcedureMenuAction) => void;
  onBeginAircraftMenuCommand: (
    event: ReactMouseEvent<HTMLButtonElement>,
    field: AircraftQuickCommandField,
    label: string
  ) => void;
  onClearAircraftText: (aircraftId: string) => void;
  onClearMeasureLines: () => void;
  onCommitAircraftCommandMenu: () => void;
  onCommitAircraftTextMenu: () => void;
  onResetViewport: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  project: (coordinate: [number, number]) => ScreenPoint;
  quickAltitudeManualInputRef: MutableRefObject<boolean>;
  radarPaused: boolean;
  renderedMeasureLines: MeasureLineState[];
  scaleReadout: RadarScaleReadout;
  setAircraftTextMenu: Dispatch<SetStateAction<AircraftTextMenuState | null>>;
  showChrome: boolean;
  surfaceMode: SurfaceMode;
  trueToMagneticHeading: (headingTrueDeg: number, magneticVariationWestDeg: number) => number;
  zoomLod: string;
  zoomScale: number;
}

export default function RadarMapHtmlOverlays({
  aircraft,
  aircraftTextMenu,
  aircraftTextMenuProcedureActions,
  aircraftTextMenuPublishedHoldFixId,
  densityMode,
  formatHeading,
  labelScale,
  lastRadarUpdateAt,
  magneticVariationWestDeg,
  mapPointToShellPoint,
  onApplyAircraftCommand,
  onApplyAdHocHoldFix,
  onApplyAdHocHoldNow,
  onApplyPublishedHold,
  onAssignProcedureAction,
  onBeginAircraftMenuCommand,
  onClearAircraftText,
  onClearMeasureLines,
  onCommitAircraftCommandMenu,
  onCommitAircraftTextMenu,
  onResetViewport,
  onZoomIn,
  onZoomOut,
  project,
  quickAltitudeManualInputRef,
  radarPaused,
  renderedMeasureLines,
  scaleReadout,
  setAircraftTextMenu,
  showChrome,
  surfaceMode,
  trueToMagneticHeading,
  zoomLod,
  zoomScale
}: RadarMapHtmlOverlaysProps) {
  return (
    <>
      {aircraftTextMenu ? (
        <RadarTextMenu
          aircraftTextMenu={aircraftTextMenu}
          aircraftTextMenuProcedureActions={aircraftTextMenuProcedureActions}
          onApplyAircraftCommand={onApplyAircraftCommand}
          onApplyAdHocHoldFix={onApplyAdHocHoldFix}
          onApplyAdHocHoldNow={onApplyAdHocHoldNow}
          onApplyPublishedHold={onApplyPublishedHold}
          onAssignProcedureAction={onAssignProcedureAction}
          onBeginAircraftMenuCommand={onBeginAircraftMenuCommand}
          onClearAircraftText={onClearAircraftText}
          onCommitAircraftCommandMenu={onCommitAircraftCommandMenu}
          onCommitAircraftTextMenu={onCommitAircraftTextMenu}
          publishedHoldFixId={aircraftTextMenuPublishedHoldFixId}
          quickAltitudeManualInputRef={quickAltitudeManualInputRef}
          setAircraftTextMenu={setAircraftTextMenu}
        />
      ) : null}

      <RadarMeasureHtmlDeleteButtons
        aircraft={aircraft}
        formatHeading={formatHeading}
        labelScale={labelScale}
        magneticVariationWestDeg={magneticVariationWestDeg}
        mapPointToShellPoint={mapPointToShellPoint}
        onClearMeasureLines={onClearMeasureLines}
        project={project}
        renderedMeasureLines={renderedMeasureLines}
        trueToMagneticHeading={trueToMagneticHeading}
      />

      <RadarMapControls
        densityMode={densityMode}
        lastRadarUpdateAt={lastRadarUpdateAt}
        onClearMeasureLines={onClearMeasureLines}
        onResetViewport={onResetViewport}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        radarPaused={radarPaused}
        scaleReadout={scaleReadout}
        showChrome={showChrome}
        surfaceMode={surfaceMode}
        zoomLod={zoomLod}
        zoomScale={zoomScale}
      />
    </>
  );
}
