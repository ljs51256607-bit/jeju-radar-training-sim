import type { Projector } from "../lib/radar";
import type { HoldingOverlayGeometry } from "../lib/holdingOverlayGeometry";
import type { GeoFeature, RadarDataset, RunwayMode } from "../lib/types";
import RadarAirspaceLayer from "./RadarAirspaceLayer";
import RadarGraticuleLayer from "./RadarGraticuleLayer";
import RadarHoldingOverlayLayer from "./RadarHoldingOverlayLayer";
import RadarMvaLabelLayer from "./RadarMvaLabelLayer";
import RadarProcedureFeatureLayer from "./RadarProcedureFeatureLayer";
import RadarRangeRingLayer from "./RadarRangeRingLayer";
import RadarRunwayBar, { type ProjectedSegment } from "./RadarRunwayBar";

interface RadarBaseMapLayerProps {
  boundaryFeatures: GeoFeature[];
  holdingOverlays: HoldingOverlayGeometry[];
  labelScale: number;
  latitudeGridLines: number[];
  longitudeGridLines: number[];
  mvaAltitudeLabelFeatures: GeoFeature[];
  primaryRunwayBar: ProjectedSegment | null;
  projector: Projector;
  radarSite: [number, number] | null;
  rangeRings: number[];
  scopeExtent: RadarDataset["geometry"]["chart_guides"]["scope_extent"] | undefined;
  selectedRunway: RunwayMode;
  showMvaAltitudeLabels: boolean;
  specialUseFeatures: GeoFeature[];
  surveillanceBoundaryFeatures: GeoFeature[];
  viewHeight: number;
  viewWidth: number;
  visibleFeatures: GeoFeature[];
  showRings: boolean;
}

export default function RadarBaseMapLayer({
  boundaryFeatures,
  holdingOverlays,
  labelScale,
  latitudeGridLines,
  longitudeGridLines,
  mvaAltitudeLabelFeatures,
  primaryRunwayBar,
  projector,
  radarSite,
  rangeRings,
  scopeExtent,
  selectedRunway,
  showMvaAltitudeLabels,
  showRings,
  specialUseFeatures,
  surveillanceBoundaryFeatures,
  viewHeight,
  viewWidth,
  visibleFeatures
}: RadarBaseMapLayerProps) {
  return (
    <>
      <RadarGraticuleLayer
        labelScale={labelScale}
        latitudeGridLines={latitudeGridLines}
        longitudeGridLines={longitudeGridLines}
        projector={projector}
        scopeExtent={scopeExtent}
        viewHeight={viewHeight}
        viewWidth={viewWidth}
      />
      <RadarRangeRingLayer
        labelScale={labelScale}
        projector={projector}
        radarSite={radarSite}
        rangeRings={rangeRings}
        showRings={showRings}
      />
      <RadarAirspaceLayer
        boundaryFeatures={boundaryFeatures}
        projector={projector}
        specialUseFeatures={specialUseFeatures}
        surveillanceBoundaryFeatures={surveillanceBoundaryFeatures}
      />
      <RadarMvaLabelLayer
        labelScale={labelScale}
        mvaAltitudeLabelFeatures={mvaAltitudeLabelFeatures}
        projector={projector}
        showMvaAltitudeLabels={showMvaAltitudeLabels}
      />
      <RadarProcedureFeatureLayer
        labelScale={labelScale}
        projector={projector}
        selectedRunway={selectedRunway}
        visibleFeatures={visibleFeatures}
      />
      <RadarHoldingOverlayLayer holdingOverlays={holdingOverlays} labelScale={labelScale} />
      <RadarRunwayBar primaryRunwayBar={primaryRunwayBar} />
    </>
  );
}
