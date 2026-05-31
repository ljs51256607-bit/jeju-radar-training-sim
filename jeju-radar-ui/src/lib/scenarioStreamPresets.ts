import type { ScenarioStreamForm } from "./scenarioStorage";
import {
  isRecord,
  jsonClone,
  scenarioFilename
} from "./scenarioStorage";
import {
  normalizeScenarioStreamForm
} from "./scenarioTraffic";
import type { RunwayMode } from "./types";

export const SCENARIO_STREAM_PRESET_STORAGE_KEY = "jeju-radar-stream-presets-v1";
export const SCENARIO_STREAM_PRESET_STORAGE_LIMIT = 24;

export interface ScenarioStreamPresetV1 {
  version: 1;
  id: string;
  name: string;
  savedAt: string;
  runway: RunwayMode;
  form: ScenarioStreamForm;
}

export interface ScenarioStreamPresetExportEnvelopeV1 {
  export_schema: "jeju_radar_stream_preset_export_v1";
  exportedAt: string;
  summary: {
    name: string;
    runway: RunwayMode;
    savedAt: string;
    arrivalFix: string;
    arrivalSpacingNm: string;
    departure07ExitFix: string;
    departure25ExitFix: string;
    departure31ExitFix: string;
  };
  preset: ScenarioStreamPresetV1;
}

export interface ScenarioStreamPresetBuildArgs {
  form: unknown;
  id?: string;
  name: string;
  runway: RunwayMode;
  savedAtIso?: string;
}

export interface ScenarioStreamPresetStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function scenarioStreamPresetRecordId() {
  return `stream-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function browserScenarioStreamPresetStorage(): ScenarioStreamPresetStorageLike | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }

  return window.localStorage;
}

function normalizedPresetName(name: string) {
  const trimmedName = name.trim();

  return trimmedName || "Stream preset";
}

export function buildScenarioStreamPreset({
  form,
  id = scenarioStreamPresetRecordId(),
  name,
  runway,
  savedAtIso = new Date().toISOString()
}: ScenarioStreamPresetBuildArgs): ScenarioStreamPresetV1 {
  return {
    version: 1,
    id,
    name: normalizedPresetName(name),
    savedAt: savedAtIso,
    runway,
    form: normalizeScenarioStreamForm(jsonClone(form), runway)
  };
}

export function scenarioStreamPresetExportEnvelopeForPreset(
  preset: ScenarioStreamPresetV1,
  exportedAt = new Date().toISOString()
): ScenarioStreamPresetExportEnvelopeV1 {
  const normalizedPreset = {
    ...preset,
    form: normalizeScenarioStreamForm(preset.form, preset.runway)
  };

  return {
    export_schema: "jeju_radar_stream_preset_export_v1",
    exportedAt,
    summary: {
      name: normalizedPreset.name,
      runway: normalizedPreset.runway,
      savedAt: normalizedPreset.savedAt,
      arrivalFix: normalizedPreset.form.arrivalFix,
      arrivalSpacingNm: normalizedPreset.form.arrivalSpacingNm,
      departure07ExitFix: normalizedPreset.form.departure07.exitFix,
      departure25ExitFix: normalizedPreset.form.departure25.exitFix,
      departure31ExitFix: normalizedPreset.form.departure31.exitFix
    },
    preset: normalizedPreset
  };
}

export function scenarioStreamPresetExportJsonForPreset(
  preset: ScenarioStreamPresetV1,
  exportedAt = new Date().toISOString()
) {
  return JSON.stringify(scenarioStreamPresetExportEnvelopeForPreset(preset, exportedAt), null, 2);
}

export function scenarioStreamPresetExportFilename(preset: ScenarioStreamPresetV1) {
  return scenarioFilename([`R${preset.runway}`, preset.name].filter(Boolean).join("_"));
}

export function isScenarioStreamPresetV1(value: unknown): value is ScenarioStreamPresetV1 {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.version === 1 &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.savedAt === "string" &&
    (value.runway === "07" || value.runway === "25") &&
    isRecord(value.form)
  );
}

export function normalizeImportedScenarioStreamPreset(value: unknown) {
  const candidate =
    isRecord(value) &&
    value.export_schema === "jeju_radar_stream_preset_export_v1" &&
    isScenarioStreamPresetV1(value.preset)
      ? value.preset
      : isScenarioStreamPresetV1(value)
        ? value
        : null;

  return candidate
    ? {
        ...candidate,
        form: normalizeScenarioStreamForm(candidate.form, candidate.runway)
      }
    : null;
}

export function loadSavedScenarioStreamPresetRecords(
  storage: ScenarioStreamPresetStorageLike | null = browserScenarioStreamPresetStorage()
) {
  if (!storage) {
    return [];
  }

  try {
    const rawPresets = storage.getItem(SCENARIO_STREAM_PRESET_STORAGE_KEY);
    const parsedPresets = rawPresets ? JSON.parse(rawPresets) : [];

    return Array.isArray(parsedPresets)
      ? parsedPresets
          .filter(isScenarioStreamPresetV1)
          .map((preset) => ({
            ...preset,
            form: normalizeScenarioStreamForm(preset.form, preset.runway)
          }))
          .slice(0, SCENARIO_STREAM_PRESET_STORAGE_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function persistSavedScenarioStreamPresetRecords(
  presets: ScenarioStreamPresetV1[],
  storage: ScenarioStreamPresetStorageLike | null = browserScenarioStreamPresetStorage()
) {
  if (!storage) {
    return;
  }

  storage.setItem(
    SCENARIO_STREAM_PRESET_STORAGE_KEY,
    JSON.stringify(presets.slice(0, SCENARIO_STREAM_PRESET_STORAGE_LIMIT))
  );
}

export function scenarioStreamPresetCanLoadForRunway(
  preset: ScenarioStreamPresetV1,
  selectedRunway: RunwayMode
) {
  return preset.runway === selectedRunway;
}

export function scenarioStreamPresetLoadError(
  preset: ScenarioStreamPresetV1,
  selectedRunway: RunwayMode
) {
  return scenarioStreamPresetCanLoadForRunway(preset, selectedRunway)
    ? null
    : `RWY${preset.runway} stream preset입니다. 먼저 RWY${preset.runway}로 전환하세요.`;
}
