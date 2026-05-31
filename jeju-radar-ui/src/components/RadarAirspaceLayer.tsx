import {
  polygonPoints,
  type Projector
} from "../lib/radar";
import type { GeoFeature } from "../lib/types";

interface RadarAirspaceLayerProps {
  boundaryFeatures: GeoFeature[];
  projector: Projector;
  specialUseFeatures: GeoFeature[];
  surveillanceBoundaryFeatures: GeoFeature[];
}

export default function RadarAirspaceLayer({
  boundaryFeatures,
  projector,
  specialUseFeatures,
  surveillanceBoundaryFeatures
}: RadarAirspaceLayerProps) {
  return (
    <>
      {boundaryFeatures.map((feature) => {
        const polygon = feature.geometry.coordinates as Array<Array<[number, number]>>;

        return (
          <polygon
            key={String(feature.properties.feature_id ?? "tma-boundary")}
            className="radar-tma-airspace"
            points={polygonPoints(projector, polygon)}
          />
        );
      })}

      {surveillanceBoundaryFeatures.map((feature) => {
        const polygon = feature.geometry.coordinates as Array<Array<[number, number]>>;

        return (
          <polygon
            key={String(feature.properties.feature_id ?? "surveillance-boundary")}
            className="radar-surveillance-boundary"
            points={polygonPoints(projector, polygon)}
          />
        );
      })}

      {specialUseFeatures.map((feature) => {
        const polygon = feature.geometry.coordinates as Array<Array<[number, number]>>;
        const areaType = String(feature.properties.area_type ?? "").toLowerCase();

        return (
          <polygon
            key={String(feature.properties.feature_id ?? "special-use-airspace")}
            className={`radar-special-use-airspace ${areaType === "cata" ? "cata" : "moa"}`}
            points={polygonPoints(projector, polygon)}
          />
        );
      })}
    </>
  );
}
