import type { Projector } from "../lib/radar";
import {
  formatMvaAltitude
} from "../lib/radarMapViewModel";
import type { GeoFeature } from "../lib/types";

interface RadarMvaLabelLayerProps {
  labelScale: number;
  mvaAltitudeLabelFeatures: GeoFeature[];
  projector: Projector;
  showMvaAltitudeLabels: boolean;
}

export default function RadarMvaLabelLayer({
  labelScale,
  mvaAltitudeLabelFeatures,
  projector,
  showMvaAltitudeLabels
}: RadarMvaLabelLayerProps) {
  if (!showMvaAltitudeLabels) {
    return null;
  }

  return (
    <>
      {mvaAltitudeLabelFeatures.map((feature) => {
        const coordinates = feature.geometry.coordinates as [number, number];
        const featureId = String(feature.properties.feature_id ?? "mva-altitude-label");
        const altitude = Number(feature.properties.mva_ft ?? 0);
        const labelPoint = projector.project(coordinates);

        return (
          <g
            key={featureId}
            className="radar-mva-label"
            transform={`translate(${labelPoint.x}, ${labelPoint.y}) scale(${labelScale})`}
          >
            <text x="0" y="2">
              {formatMvaAltitude(altitude)}
            </text>
          </g>
        );
      })}
    </>
  );
}
