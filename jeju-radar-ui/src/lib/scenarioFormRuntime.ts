import type {
  DepartureWaveForm,
  ScenarioStreamForm
} from "./scenarioStorage";
import type { DepartureRunway } from "./types";

export function scenarioStreamFormAfterFieldChange<K extends keyof ScenarioStreamForm>(
  currentForm: ScenarioStreamForm,
  field: K,
  value: ScenarioStreamForm[K]
): ScenarioStreamForm {
  return {
    ...currentForm,
    [field]: value
  };
}

export function scenarioStreamFormAfterDepartureWaveFieldChange(
  currentForm: ScenarioStreamForm,
  departureRunway: DepartureRunway,
  field: keyof DepartureWaveForm,
  value: string
): ScenarioStreamForm {
  const formKey = `departure${departureRunway}` as const;

  return {
    ...currentForm,
    [formKey]: {
      ...currentForm[formKey],
      [field]: value
    }
  };
}
