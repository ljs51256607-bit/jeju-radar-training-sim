import {
  coordinateLabel
} from "../lib/radarMapLayout";
import type { Projector } from "../lib/radar";
import type { RadarDataset } from "../lib/types";

interface RadarGraticuleLayerProps {
  labelScale: number;
  latitudeGridLines: number[];
  longitudeGridLines: number[];
  projector: Projector;
  scopeExtent: RadarDataset["geometry"]["chart_guides"]["scope_extent"] | undefined;
  viewHeight: number;
  viewWidth: number;
}

export default function RadarGraticuleLayer({
  labelScale,
  latitudeGridLines,
  longitudeGridLines,
  projector,
  scopeExtent,
  viewHeight,
  viewWidth
}: RadarGraticuleLayerProps) {
  return (
    <>
      {scopeExtent
        ? longitudeGridLines.map((longitude) => {
            const top = projector.project([longitude, scopeExtent.north_latitude]);
            const bottom = projector.project([longitude, scopeExtent.south_latitude]);

            return (
              <g key={`lon-grid-${longitude}`}>
                <line
                  className="radar-graticule"
                  x1={top.x}
                  y1={top.y}
                  x2={bottom.x}
                  y2={bottom.y}
                />
                <text
                  className="radar-graticule-label"
                  transform={`translate(${top.x + 5}, ${top.y + 20}) scale(${labelScale})`}
                >
                  {coordinateLabel(longitude, "longitude")}
                </text>
                <text
                  className="radar-graticule-label"
                  transform={`translate(${bottom.x + 5}, ${bottom.y - 10}) scale(${labelScale})`}
                >
                  {coordinateLabel(longitude, "longitude")}
                </text>
              </g>
            );
          })
        : null}

      {scopeExtent
        ? latitudeGridLines.map((latitude) => {
            const left = projector.project([scopeExtent.west_longitude, latitude]);
            const right = projector.project([scopeExtent.east_longitude, latitude]);

            return (
              <g key={`lat-grid-${latitude}`}>
                <line
                  className="radar-graticule"
                  x1={left.x}
                  y1={left.y}
                  x2={right.x}
                  y2={right.y}
                />
                <text
                  className="radar-graticule-label"
                  transform={`translate(${left.x + 8}, ${left.y - 8}) scale(${labelScale})`}
                >
                  {coordinateLabel(latitude, "latitude")}
                </text>
                <text
                  className="radar-graticule-label"
                  transform={`translate(${right.x - 76}, ${right.y - 8}) scale(${labelScale})`}
                >
                  {coordinateLabel(latitude, "latitude")}
                </text>
              </g>
            );
          })
        : null}

      {!scopeExtent
        ? Array.from({ length: 9 }, (_, index) => {
            const x = 90 + index * 175;
            return (
              <line key={`grid-x-${index}`} className="radar-gridline" x1={x} y1="0" x2={x} y2={viewHeight} />
            );
          })
        : null}

      {!scopeExtent
        ? Array.from({ length: 7 }, (_, index) => {
            const y = 110 + index * 145;
            return (
              <line key={`grid-y-${index}`} className="radar-gridline" x1="0" y1={y} x2={viewWidth} y2={y} />
            );
          })
        : null}
    </>
  );
}
