import { useState } from "react";

function formatAltitudePreset(altitudeFt: number) {
  const hundreds = String(Math.round(altitudeFt / 100)).padStart(3, "0");
  return altitudeFt < 14000 ? `A${hundreds}` : `F${hundreds}`;
}

export const altitudePresetOptions = Array.from({ length: 32 }, (_, index) => {
  const altitudeFt = (index + 1) * 1000;

  return {
    value: altitudeFt < 14000 ? String(altitudeFt) : formatAltitudePreset(altitudeFt)
  };
});

export const altitudePresetDatalistId = "altitude-preset-options";

interface AltitudePresetInputProps {
  disabled?: boolean;
  onChange: (value: string) => void;
  value: string;
}

export default function AltitudePresetInput({
  disabled = false,
  onChange,
  value
}: AltitudePresetInputProps) {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const displayValue = editingValue ?? value;

  function openPresetPicker(input: HTMLInputElement) {
    try {
      (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      // Native datalist still remains available through the browser dropdown arrow.
    }
  }

  return (
    <input
      autoComplete="off"
      disabled={disabled}
      list={altitudePresetDatalistId}
      placeholder={editingValue !== null ? value : undefined}
      value={displayValue}
      onBlur={() => {
        setEditingValue(null);
      }}
      onChange={(event) => {
        const nextValue = event.target.value.toUpperCase();
        setEditingValue(nextValue);
        onChange(nextValue);
      }}
      onClick={(event) => {
        const input = event.currentTarget;

        if (editingValue === null) {
          input.value = "";
          setEditingValue("");
        }

        window.requestAnimationFrame(() => openPresetPicker(input));
      }}
      onFocus={(event) => {
        const input = event.currentTarget;

        input.value = "";
        setEditingValue("");
        window.requestAnimationFrame(() => openPresetPicker(input));
      }}
    />
  );
}
