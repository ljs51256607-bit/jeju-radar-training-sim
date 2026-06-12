import { useEffect, useState } from "react";
import {
  isPttLiveSampleSession,
  PTT_LIVE_SAMPLE_SESSION_PATH,
  type PttLiveSampleSession
} from "../lib/pttLiveSampleSession";
import { publicAssetUrl } from "../lib/publicAssetUrl";

export function usePttLiveSampleSession() {
  const [session, setSession] = useState<PttLiveSampleSession | null>(null);

  useEffect(() => {
    if (import.meta.env.VITE_ENABLE_PTT_LIVE_SAMPLE_SESSION !== "true") {
      return;
    }

    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch(publicAssetUrl(PTT_LIVE_SAMPLE_SESSION_PATH), { cache: "no-store" });

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
