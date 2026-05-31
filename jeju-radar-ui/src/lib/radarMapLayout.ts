import type { DensityMode, MapLabel, RunwayMode } from "./types";

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface SvgInteractionEvent {
  clientX: number;
  clientY: number;
  currentTarget: SVGElement;
  preventDefault: () => void;
  stopPropagation: () => void;
}

export interface SvgViewportBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SvgViewportSize {
  width: number;
  height: number;
}

export interface MapViewTransformState {
  pan: ScreenPoint;
  viewHeight: number;
  viewWidth: number;
  zoomScale: number;
}

type LabelAnchor = "start" | "middle" | "end";

export interface LabelTextPlacement {
  x: number;
  y: number;
  textAnchor: LabelAnchor;
}

interface LabelBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PlacedMapLabel {
  label: MapLabel;
  point: ScreenPoint;
  highlight: boolean;
  pointOnly: boolean;
  textPlacement: LabelTextPlacement;
}

interface LabelVisibilityOverlays {
  rwy31Sid: boolean;
}

export function labelMatchesRunway(label: MapLabel, selectedRunway: RunwayMode) {
  const text = label.text;

  const runway07Highlights = new Set(["YUMIN", "LIMSO", "AKBIN", "PETAA", "PC404", "KAMIT", "OLLEH"]);
  const runway25Highlights = new Set([
    "DUKAL",
    "TOKIN",
    "YDM",
    "LOTKA",
    "CJU",
    "LIDVO",
    "DOKVU",
    "MEXER",
    "PC841",
    "PC861",
    "PC871",
    "PC872",
    "TOREN"
  ]);

  if (selectedRunway === "07") {
    return runway07Highlights.has(text) || label.layer === "entry_exit_fix" || label.layer === "fix_major";
  }

  return runway25Highlights.has(text) || label.layer === "entry_exit_fix";
}

export function isProcedureFixLabel(label: MapLabel) {
  return /^rwy\d{2}_(star|sid)_fix$/.test(label.layer);
}

export function isDirectableFixLabel(label: MapLabel) {
  return (
    label.layer === "fix_major" ||
    label.layer === "entry_exit_fix" ||
    label.layer === "approach_reference" ||
    label.layer === "handoff_reference" ||
    isProcedureFixLabel(label)
  );
}

function isYdmDmeFixLabel(label: MapLabel) {
  return /^D\d+(?:\.\d+)? YDM$/.test(label.text);
}

function isIcjuDmeFixLabel(label: MapLabel) {
  return /^D\d+(?:\.\d+)? ICJU$/.test(label.text);
}

function shouldHideFixLabel(label: MapLabel) {
  return ["PC404", "TEWOO", "YDM"].includes(label.text);
}

function shouldHideLabelForRunway(label: MapLabel, selectedRunway: RunwayMode) {
  if (selectedRunway === "07") {
    return ["DUKAL", "TOKIN", "LOTKA"].includes(label.text);
  }

  return ["YUMIN", "LIMSO", "AKBIN"].includes(label.text);
}

function shouldShowPointOnly(label: MapLabel) {
  return label.text === "PETAA";
}

function labelTextPlacement(label: MapLabel): LabelTextPlacement {
  const placements: Record<string, LabelTextPlacement> = {
    DOTOL: { x: -12, y: -10, textAnchor: "end" },
    IPDAS: { x: 0, y: -20, textAnchor: "middle" },
    KAMIT: { x: 10, y: 20, textAnchor: "start" },
    UPGOS: { x: 11, y: -9, textAnchor: "start" },
    AKPON: { x: 11, y: -8, textAnchor: "start" },
    MAKET: { x: 11, y: 15, textAnchor: "start" },
    TAMNA: { x: 11, y: 14, textAnchor: "start" },
    OLLEH: { x: 10, y: -9, textAnchor: "start" },
    YUMIN: { x: -12, y: -10, textAnchor: "end" },
    LIMSO: { x: 10, y: 13, textAnchor: "start" },
    AKBIN: { x: -11, y: -10, textAnchor: "end" },
    LIMDI: { x: -12, y: 16, textAnchor: "end" },
    PANSI: { x: -10, y: 15, textAnchor: "end" },
    SOSDO: { x: 0, y: 16, textAnchor: "middle" },
    TOSAN: { x: 11, y: 16, textAnchor: "start" },
    PALRI: { x: -10, y: 16, textAnchor: "end" },
    MANBA: { x: -12, y: 13, textAnchor: "end" },
    CHUJA: { x: -11, y: -10, textAnchor: "end" },
    PC726: { x: -10, y: 16, textAnchor: "end" },
    PC728: { x: 10, y: 12, textAnchor: "start" },
    PC721: { x: -9, y: 12, textAnchor: "end" },
    PC722: { x: 9, y: 14, textAnchor: "start" },
    BIROM: { x: -11, y: -11, textAnchor: "end" },
    PC621: { x: -9, y: -10, textAnchor: "end" },
    PC622: { x: -9, y: 13, textAnchor: "end" },
    PC623: { x: -9, y: -10, textAnchor: "end" },
    PC624: { x: -9, y: 13, textAnchor: "end" },
    PC625: { x: -9, y: -10, textAnchor: "end" },
    PC626: { x: -9, y: 13, textAnchor: "end" },
    DAKPI: { x: -10, y: 15, textAnchor: "end" },
    PC628: { x: 9, y: 14, textAnchor: "start" },
    PIMIK: { x: -10, y: 15, textAnchor: "end" },
    PC723: { x: 10, y: 15, textAnchor: "start" },
    PC724: { x: 11, y: -9, textAnchor: "start" },
    PC727: { x: -10, y: -10, textAnchor: "end" },
    PC725: { x: 10, y: 15, textAnchor: "start" },
    PC811: { x: -10, y: -10, textAnchor: "end" },
    PC813: { x: 11, y: -9, textAnchor: "start" },
    PC814: { x: 11, y: 15, textAnchor: "start" },
    PC816: { x: -10, y: 15, textAnchor: "end" },
    DUKAL: { x: 11, y: -9, textAnchor: "start" },
    LIDVO: { x: -11, y: 15, textAnchor: "end" },
    DOKVU: { x: 11, y: -9, textAnchor: "start" },
    VEKDI: { x: -11, y: -10, textAnchor: "end" },
    KIBEK: { x: 11, y: -10, textAnchor: "start" },
    MEXER: { x: -11, y: 15, textAnchor: "end" },
    TOREN: { x: 11, y: -9, textAnchor: "start" },
    PC861: { x: -11, y: -10, textAnchor: "end" },
    PC871: { x: -11, y: 15, textAnchor: "end" },
    PC872: { x: 11, y: -9, textAnchor: "start" },
    PC874: { x: 11, y: 15, textAnchor: "start" }
  };

  return placements[label.text] ?? { x: 10, y: -8, textAnchor: "start" as const };
}

function labelPlacementCandidates(label: MapLabel): LabelTextPlacement[] {
  const preferred = labelTextPlacement(label);
  const standard: LabelTextPlacement[] = [
    { x: 10, y: -8, textAnchor: "start" },
    { x: 10, y: 15, textAnchor: "start" },
    { x: -10, y: -8, textAnchor: "end" },
    { x: -10, y: 15, textAnchor: "end" },
    { x: 0, y: -20, textAnchor: "middle" },
    { x: 0, y: 20, textAnchor: "middle" },
    { x: 16, y: 3, textAnchor: "start" },
    { x: -16, y: 3, textAnchor: "end" },
    { x: 16, y: -18, textAnchor: "start" },
    { x: -16, y: -18, textAnchor: "end" },
    { x: 22, y: -8, textAnchor: "start" },
    { x: 22, y: 16, textAnchor: "start" },
    { x: -22, y: -8, textAnchor: "end" },
    { x: -22, y: 16, textAnchor: "end" },
    { x: 0, y: -28, textAnchor: "middle" },
    { x: 0, y: 28, textAnchor: "middle" },
    { x: 28, y: 4, textAnchor: "start" },
    { x: -28, y: 4, textAnchor: "end" }
  ];
  const key = (placement: LabelTextPlacement) => `${placement.x}:${placement.y}:${placement.textAnchor}`;
  const seen = new Set<string>();

  return [preferred, ...standard].filter((placement) => {
    const placementKey = key(placement);
    if (seen.has(placementKey)) {
      return false;
    }

    seen.add(placementKey);
    return true;
  });
}

function labelPriority(label: MapLabel) {
  if (label.layer === "fix_major") {
    return 0;
  }

  if (label.layer === "entry_exit_fix") {
    return 1;
  }

  if (label.layer === "handoff_reference") {
    return 2;
  }

  if (/_sid_fix$/.test(label.layer)) {
    return 3;
  }

  if (/_star_fix$/.test(label.layer)) {
    return /^PC\d+$/.test(label.text) ? 5 : 4;
  }

  return 6;
}

function estimateLabelWidth(label: MapLabel) {
  const characterWidth = /^PC\d+$/.test(label.text) ? 5.9 : isProcedureFixLabel(label) ? 6.3 : 7.2;
  return Math.max(22, label.text.length * characterWidth);
}

export function directLabelHitbox(label: MapLabel, placement: LabelTextPlacement) {
  const width = estimateLabelWidth(label) + 10;
  const height = isProcedureFixLabel(label) ? 17 : 19;
  const left =
    placement.textAnchor === "middle"
      ? placement.x - width / 2
      : placement.textAnchor === "end"
        ? placement.x - width
        : placement.x;

  return {
    height,
    width,
    x: left - 5,
    y: placement.y - height + 5
  };
}

function estimateLabelBox(
  point: ScreenPoint,
  label: MapLabel,
  placement: LabelTextPlacement,
  labelScale: number
): LabelBox {
  const width = estimateLabelWidth(label) * labelScale;
  const height = (isProcedureFixLabel(label) ? 11 : 13) * labelScale;
  const padding = 2.5 * labelScale;
  const anchorX = point.x + placement.x * labelScale;
  const baselineY = point.y + placement.y * labelScale;
  const left =
    placement.textAnchor === "middle" ? anchorX - width / 2 : placement.textAnchor === "end" ? anchorX - width : anchorX;

  return {
    left: left - padding,
    right: left + width + padding,
    top: baselineY - height - padding,
    bottom: baselineY + padding
  };
}

function boxesOverlap(first: LabelBox, second: LabelBox) {
  return !(first.right < second.left || second.right < first.left || first.bottom < second.top || second.bottom < first.top);
}

function overlapArea(first: LabelBox, second: LabelBox) {
  if (!boxesOverlap(first, second)) {
    return 0;
  }

  const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
  return Math.max(0, width) * Math.max(0, height);
}

function collisionScore(candidate: LabelBox, placedBoxes: LabelBox[]) {
  return placedBoxes.reduce((score, placedBox) => {
    const area = overlapArea(candidate, placedBox);
    return score + (area > 0 ? 1_000 + area : 0);
  }, 0);
}

export function layoutLabels(
  labels: MapLabel[],
  project: (coordinate: [number, number]) => ScreenPoint,
  selectedRunway: RunwayMode,
  labelScale: number
): PlacedMapLabel[] {
  const placedBoxes: LabelBox[] = [];

  return [...labels]
    .sort((first, second) => {
      const priorityDelta = labelPriority(first) - labelPriority(second);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return first.text.localeCompare(second.text);
    })
    .map((label) => {
      const point = project([label.longitude, label.latitude]);
      const highlight = labelMatchesRunway(label, selectedRunway);
      const pointOnly = shouldShowPointOnly(label);

      if (pointOnly) {
        return {
          label,
          point,
          highlight,
          pointOnly,
          textPlacement: labelTextPlacement(label)
        };
      }

      const candidates = labelPlacementCandidates(label);
      let selectedPlacement = candidates[0];
      let selectedBox = estimateLabelBox(point, label, selectedPlacement, labelScale);
      let selectedScore = collisionScore(selectedBox, placedBoxes);

      for (const candidate of candidates.slice(1)) {
        const candidateBox = estimateLabelBox(point, label, candidate, labelScale);
        const candidateScore = collisionScore(candidateBox, placedBoxes);

        if (candidateScore < selectedScore) {
          selectedPlacement = candidate;
          selectedBox = candidateBox;
          selectedScore = candidateScore;
        }

        if (selectedScore === 0) {
          break;
        }
      }

      placedBoxes.push(selectedBox);

      return {
        label,
        point,
        highlight,
        pointOnly,
        textPlacement: selectedPlacement
      };
    });
}

export function labelClassName(label: MapLabel, highlight: boolean) {
  const classes = ["radar-label"];

  if (highlight) {
    classes.push("active");
  }

  if (isProcedureFixLabel(label)) {
    classes.push("procedure-fix");
  }

  if (/^PC\d+$/.test(label.text)) {
    classes.push("numbered-fix");
  }

  return classes.join(" ");
}

export function fixSymbolClassName(label: MapLabel, highlight: boolean) {
  const classes = ["radar-fix-symbol"];

  if (highlight) {
    classes.push("active");
  }

  if (isProcedureFixLabel(label)) {
    classes.push("procedure-fix");
  }

  return classes.join(" ");
}

export function fixCrossClassName(label: MapLabel) {
  const classes = ["radar-fix-cross"];

  if (isProcedureFixLabel(label)) {
    classes.push("procedure-fix");
  }

  return classes.join(" ");
}

export function labelVisibleForDensity(
  label: MapLabel,
  selectedRunway: RunwayMode,
  densityMode: DensityMode,
  _zoomScale: number
) {
  if (
    isYdmDmeFixLabel(label) ||
    isIcjuDmeFixLabel(label) ||
    shouldHideFixLabel(label) ||
    shouldHideLabelForRunway(label, selectedRunway)
  ) {
    return false;
  }

  const highlight = labelMatchesRunway(label, selectedRunway);
  const selectedRunwayProcedureFix =
    isProcedureFixLabel(label) &&
    ((selectedRunway === "07" && label.layer.startsWith("rwy07_")) ||
      (selectedRunway === "25" && (label.layer.startsWith("rwy25_") || label.layer.startsWith("rwy31_"))));
  const fixLikeLabel =
    selectedRunwayProcedureFix ||
    ["fix_major", "entry_exit_fix", "approach_reference", "handoff_reference", "navaid"].includes(label.layer);

  if (selectedRunwayProcedureFix) {
    return densityMode !== "declutter";
  }

  if (densityMode === "full") {
    return true;
  }

  if (densityMode === "balanced") {
    return highlight || fixLikeLabel;
  }

  return highlight || (label.layer === "navaid" && ["YDM", "CJU"].includes(label.text));
}

export function labelVisibleForOverlay(
  label: MapLabel,
  selectedRunway: RunwayMode,
  overlays: LabelVisibilityOverlays
) {
  if (selectedRunway === "25" && label.layer.startsWith("rwy31_") && !overlays.rwy31Sid) {
    return false;
  }

  return true;
}

export function labelCounterScale(zoomScale: number) {
  return Math.min(1.55, Math.max(0.3, 1 / Math.pow(zoomScale, 1.2)));
}

export function buildGraticuleValues(start: number, end: number, intervalMinutes: number) {
  const startMinute = Math.ceil((start * 60) / intervalMinutes) * intervalMinutes;
  const endMinute = Math.floor((end * 60) / intervalMinutes) * intervalMinutes;
  const values: number[] = [];

  for (let minute = startMinute; minute <= endMinute; minute += intervalMinutes) {
    values.push(Number((minute / 60).toFixed(6)));
  }

  return values;
}

export function coordinateLabel(value: number, axis: "latitude" | "longitude") {
  const hemisphere = axis === "latitude" ? "N" : "E";
  const totalMinutes = Math.round(Math.abs(value) * 60);
  const degrees = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${degrees}°${String(minutes).padStart(2, "0")}'${hemisphere}`;
}

export function mapPointToShellPoint(
  point: ScreenPoint,
  svgSize: SvgViewportSize,
  transformState: MapViewTransformState
) {
  if (svgSize.width <= 0 || svgSize.height <= 0) {
    return null;
  }

  const { pan, viewHeight, viewWidth, zoomScale } = transformState;
  const viewScale = Math.min(svgSize.width / viewWidth, svgSize.height / viewHeight);
  const renderedWidth = viewWidth * viewScale;
  const renderedHeight = viewHeight * viewScale;
  const viewBoxOffsetX = (svgSize.width - renderedWidth) / 2;
  const viewBoxOffsetY = (svgSize.height - renderedHeight) / 2;
  const transformedX = viewWidth / 2 + pan.x + zoomScale * (point.x - viewWidth / 2);
  const transformedY = viewHeight / 2 + pan.y + zoomScale * (point.y - viewHeight / 2);

  return {
    x: viewBoxOffsetX + transformedX * viewScale,
    y: viewBoxOffsetY + transformedY * viewScale,
    scale: viewScale * zoomScale
  };
}

export function clientPointToShellPoint(
  clientX: number,
  clientY: number,
  bounds: SvgViewportBounds,
  menuWidth = 150,
  menuHeight = 84
) {
  return {
    x: Math.min(Math.max(clientX - bounds.left + 8, 8), Math.max(8, bounds.width - menuWidth)),
    y: Math.min(Math.max(clientY - bounds.top + 8, 8), Math.max(8, bounds.height - menuHeight))
  };
}

export function clientPointToSvgPoint(event: SvgInteractionEvent, viewWidth: number, viewHeight: number) {
  const ownerSvg =
    event.currentTarget instanceof SVGSVGElement
      ? event.currentTarget
      : event.currentTarget.ownerSVGElement;
  const bounds = ownerSvg?.getBoundingClientRect();

  if (!bounds || bounds.width === 0 || bounds.height === 0) {
    return null;
  }

  const preserveAspectRatioScale = Math.min(bounds.width / viewWidth, bounds.height / viewHeight);
  const renderedWidth = viewWidth * preserveAspectRatioScale;
  const renderedHeight = viewHeight * preserveAspectRatioScale;
  const viewBoxOffsetX = (bounds.width - renderedWidth) / 2;
  const viewBoxOffsetY = (bounds.height - renderedHeight) / 2;

  return {
    x: (event.clientX - bounds.left - viewBoxOffsetX) / preserveAspectRatioScale,
    y: (event.clientY - bounds.top - viewBoxOffsetY) / preserveAspectRatioScale
  };
}

export function svgPointToMapPoint(
  point: ScreenPoint,
  transformState: MapViewTransformState
) {
  const { pan, viewHeight, viewWidth, zoomScale } = transformState;

  return {
    x: viewWidth / 2 + (point.x - (viewWidth / 2 + pan.x)) / zoomScale,
    y: viewHeight / 2 + (point.y - (viewHeight / 2 + pan.y)) / zoomScale
  };
}
