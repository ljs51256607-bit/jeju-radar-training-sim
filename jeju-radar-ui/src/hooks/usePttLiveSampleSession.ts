import { useEffect, useState } from "react";
import {
  isPttLiveSampleSession,
  PTT_LIVE_SAMPLE_SESSION_URL,
  type PttLiveSampleSession
} from "../lib/pttLiveSampleSession";

export function usePttLiveSampleSession() {
  const [session, setSession] = useState<PttLiveSampleSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch(PTT_LIVE_SAMPLE_SESSION_URL, { cache: "no-store" });

        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        if (!cancelled && isPttLiveSampleSession(payload)) {
          setSession(payload);
        }
      } catch {
        if (!cancelled) {
          setSession(null);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return session;
}
