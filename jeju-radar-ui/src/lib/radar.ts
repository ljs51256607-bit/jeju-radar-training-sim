import type { GeoFeature, MapLabel } from "./types";

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface Projector {
  project: (coordinate: [number, number]) => ScreenPoint;
  unproject: (point: ScreenPoint) => [number, number];
  projectRadiusNm: (center: [number, number], radiusNm: number) => number;
}

export interface GeoBounds {
  westLongitude: number;
  eastLongitude: number;
  southLatitude: number;
  northLatitude: number;
}

function projectToWorld(
  coordinate: [number, number],
  centerLatitude: number,
  centerLongitude: number
) {
  const lonScale = Math.cos((centerLatitude * Math.PI) / 180);

  return {
    x: (coordinate[0] - centerLongitude) * lonScale,
    y: coordinate[1] - centerLatitude
  };
}

export function createProjector(
  coordinates: Array<[number, number]>,
  width: number,
  height: number,
  padding = 72
): Projector {
  if (coordinates.length === 0) {
    throw new Error("createProjector requires at least one coordinate");
  }

  let minLatitude = Number.POSITIVE_INFINITY;
  let maxLatitude = Number.NEGATIVE_INFINITY;
  let minLongitude = Number.POSITIVE_INFINITY;
  let maxLongitude = Number.NEGATIVE_INFINITY;

  for (const [longitude, latitude] of coordinates) {
    if (latitude < minLatitude) {
      minLatitude = latitude;
    }
    if (latitude > maxLatitude) {
      maxLatitude = latitude;
    }
    if (longitude < minLongitude) {
      minLongitude = longitude;
    }
    if (longitude > maxLongitude) {
      maxLongitude = longitude;
    }
  }

  const centerLatitude = (minLatitude + maxLatitude) / 2;
  const centerLongitude = (minLongitude + maxLongitude) / 2;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const coordinate of coordinates) {
    const point = projectToWorld(coordinate, centerLatitude, centerLongitude);

    if (point.x < minX) {
      minX = point.x;
    }
    if (point.x > maxX) {
      maxX = point.x;
    }
    if (point.y < minY) {
      minY = point.y;
    }
    if (point.y > maxY) {
      maxY = point.y;
    }
  }

  const xSpan = maxX - minX || 1;
  const ySpan = maxY - minY || 1;
  const scale = Math.min((width - padding * 2) / xSpan, (height - padding * 2) / ySpan);

  return {
    project(coordinate: [number, number]) {
      const point = projectToWorld(coordinate, centerLatitude, centerLongitude);

      return {
        x: padding + (point.x - minX) * scale,
        y: height - padding - (point.y - minY) * scale
      };
    },
    unproject(point: ScreenPoint) {
      const lonScale = Math.cos((centerLatitude * Math.PI) / 180);
      const worldX = (point.x - padding) / scale + minX;
      const worldY = (height - padding - point.y) / scale + minY;

      return [worldX / lonScale + centerLongitude, worldY + centerLatitude];
    },
    projectRadiusNm(center: [number, number], radiusNm: number) {
      const lonOffset = radiusNm / (60 * Math.cos((center[1] * Math.PI) / 180));
      const centerPoint = this.project(center);
      const edgePoint = this.project([center[0] + lonOffset, center[1]]);

      return Math.abs(edgePoint.x - centerPoint.x);
    }
  };
}

export function createProjectorFromBounds(
  bounds: GeoBounds,
  width: number,
  height: number,
  padding = 72
): Projector {
  return createProjector(
    [
      [bounds.westLongitude, bounds.southLatitude],
      [bounds.westLongitude, bounds.northLatitude],
      [bounds.eastLongitude, bounds.southLatitude],
      [bounds.eastLongitude, bounds.northLatitude]
    ],
    width,
    height,
    padding
  );
}

export function collectFeatureCoordinates(feature: GeoFeature): Array<[number, number]> {
  const { coordinates, type } = feature.geometry;

  if (type === "LineString") {
    return coordinates as Array<[number, number]>;
  }

  if (type === "MultiLineString") {
    return (coordinates as Array<Array<[number, number]>>).flat();
  }

  if (type === "Polygon") {
    return (coordinates as Array<Array<[number, number]>>).flat();
  }

  if (type === "Point") {
    return [coordinates as [number, number]];
  }

  return [];
}

export function linePoints(
  projector: Projector,
  coordinates: Array<[number, number]>
): string {
  return coordinates
    .map((coordinate) => {
      const point = projector.project(coordinate);
      return `${point.x},${point.y}`;
    })
    .join(" ");
}

export function multiLinePath(
  projector: Projector,
  lines: Array<Array<[number, number]>>
): string {
  return lines
    .map((line) =>
      line
        .map((coordinate, index) => {
          const point = projector.project(coordinate);
          return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;
        })
        .join(" ")
    )
    .join(" ");
}

export function polygonPoints(
  projector: Projector,
  rings: Array<Array<[number, number]>>
): string {
  const outerRing = rings[0] ?? [];
  return linePoints(projector, outerRing);
}

export function collectDatasetCoordinates(
  features: GeoFeature[],
  labels: MapLabel[],
  points: Array<[number, number]>
): Array<[number, number]> {
  return [
    ...features.flatMap((feature) => collectFeatureCoordinates(feature)),
    ...labels.map((label) => [label.longitude, label.latitude] as [number, number]),
    ...points
  ];
}
