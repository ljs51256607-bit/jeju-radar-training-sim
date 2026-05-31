import {
  useEffect,
  useRef
} from "react";
import { keyboardDeleteShouldBeIgnored } from "../lib/keyboardInteraction";

interface UseSelectedAircraftDeleteHotkeyOptions {
  onDeleteSelectedAircraft: () => void;
  selectedAircraftId: string | null;
}

export function useSelectedAircraftDeleteHotkey({
  onDeleteSelectedAircraft,
  selectedAircraftId
}: UseSelectedAircraftDeleteHotkeyOptions) {
  const onDeleteSelectedAircraftRef = useRef(onDeleteSelectedAircraft);

  useEffect(() => {
    onDeleteSelectedAircraftRef.current = onDeleteSelectedAircraft;
  }, [onDeleteSelectedAircraft]);

  useEffect(() => {
    function handleDeleteKey(event: KeyboardEvent) {
      if (event.key !== "Delete" || !selectedAircraftId) {
        return;
      }

      if (keyboardDeleteShouldBeIgnored(event.target)) {
        return;
      }

      event.preventDefault();
      onDeleteSelectedAircraftRef.current();
    }

    window.addEventListener("keydown", handleDeleteKey);

    return () => {
      window.removeEventListener("keydown", handleDeleteKey);
    };
  }, [selectedAircraftId]);
}
