import {
  collectFeatureCoordinates,
  linePoints,
  multiLinePath,
  type Projector
} from "../lib/radar";
import {
  layerClass
} from "../lib/radarMapViewModel";
import type { GeoFeature, RunwayMode } from "../lib/types";

interface RadarProcedureFeatureLayerProps {
  labelScale: number;
  projector: Projector;
  selectedRunway: RunwayMode;
  visibleFeatures: GeoFeature[];
}

export default function RadarProcedureFeatureLayer({
  labelScale,
  projector,
  selectedRunway,
  visibleFeatures
}: RadarProcedureFeatureLayerProps) {
  return (
    <>
      {visibleFeatures.map((feature) => {
        if (feature.geometry.type === "Polygon") {
          return null;
        }

        if (feature.geometry.type === "Point") {
          const point = projector.project(feature.geometry.coordinates as [number, number]);

          if (feature.properties.layer === "final_app_fix") {
            return (
              <g
                key={String(feature.properties.feature_id)}
                className="radar-faf-marker"
                transform={`translate(${point.x}, ${point.y}) scale(${labelScale})`}
              >
                <line x1="-7" y1="-7" x2="7" y2="7" />
                <line x1="-7" y1="7" x2="7" y2="-7" />
              </g>
            );
          }

          return null;
        }

        if (feature.geometry.type === "MultiLineString") {
          return (
            <path
              key={String(feature.properties.feature_id)}
              className={layerClass(feature, selectedRunway)}
              d={multiLinePath(projector, feature.geometry.coordinates as Array<Array<[number, number]>>)}
            />
          );
        }

        return (
          <polyline
            key={String(feature.properties.feature_id)}
            className={layerClass(feature, selectedRunway)}
            points={linePoints(projector, collectFeatureCoordinates(feature))}
          />
        );
      })}
    </>
  );
}
