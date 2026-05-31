import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  PILOT_VOICE_CACHE_LIMIT,
  PILOT_VOICE_LLM_LATENCY_BUDGET_MS,
  atcConsoleResultAfterPilotVoicePlayback,
  pilotVoiceRequestKey,
  type AtcConsoleResult,
  type PilotVoiceUiStatus
} from "../lib/atcConsoleViewModel";
import {
  requestPilotVoice,
  type PilotVoiceMode
} from "../lib/pilotVoiceClient";
import { setLimitedCache } from "../lib/limitedCache";

interface UsePilotVoiceResponseOptions {
  atcConsoleResult: AtcConsoleResult;
  pilotVoiceMode: PilotVoiceMode;
  playPilotSpeech: (text: string, playbackKey: string) => Promise<void>;
  setAtcConsoleResult: Dispatch<SetStateAction<AtcConsoleResult>>;
}

export function usePilotVoiceResponse({
  atcConsoleResult,
  pilotVoiceMode,
  playPilotSpeech,
  setAtcConsoleResult
}: UsePilotVoiceResponseOptions) {
  const [pilotVoiceStatus, setPilotVoiceStatus] = useState<PilotVoiceUiStatus>({
    state: "deterministic",
    detail: "DET"
  });
  const pilotVoiceRequestKeyRef = useRef<string | null>(null);
  const pilotVoiceTextCacheRef = useRef<Map<string, string>>(new Map());
  const playPilotSpeechRef = useRef(playPilotSpeech);

  useEffect(() => {
    playPilotSpeechRef.current = playPilotSpeech;
  }, [playPilotSpeech]);

  useEffect(() => {
    const payload = atcConsoleResult.pilot_response;

    if (!payload) {
      pilotVoiceRequestKeyRef.current = null;
      setPilotVoiceStatus(
        pilotVoiceMode === "llm"
          ? { state: "standby", detail: "LLM READY" }
          : { state: "deterministic", detail: "DET" }
      );
      return;
    }

    const requestKey = pilotVoiceRequestKey(pilotVoiceMode, payload);

    if (pilotVoiceMode !== "llm") {
      pilotVoiceRequestKeyRef.current = requestKey;
      setPilotVoiceStatus(
        payload.response_action === "SILENT_NO_RESPONSE"
          ? { state: "silent", detail: "NO RESPONSE" }
          : { state: "deterministic", detail: "DET" }
      );

      if (payload.response_action !== "SILENT_NO_RESPONSE") {
        void playPilotSpeechRef.current(payload.speakable_text, `deterministic|${requestKey}`);
      }

      setAtcConsoleResult((current) => {
        if (current.pilot_response !== payload) {
          return current;
        }

        return atcConsoleResultAfterPilotVoicePlayback(
          current,
          payload,
          payload.response_action === "SILENT_NO_RESPONSE" ? "silent" : "deterministic"
        );
      });
      return;
    }

    if (pilotVoiceRequestKeyRef.current === requestKey) {
      return;
    }

    pilotVoiceRequestKeyRef.current = requestKey;

    if (payload.response_action === "SILENT_NO_RESPONSE") {
      setPilotVoiceStatus({ state: "silent", detail: "NO RESPONSE" });
      return;
    }

    const cachedVoiceText = pilotVoiceTextCacheRef.current.get(requestKey);
    if (cachedVoiceText) {
      setPilotVoiceStatus({ state: "openai", detail: "LLM CACHE" });
      void playPilotSpeechRef.current(cachedVoiceText, `llm-cache|${requestKey}`);
      setAtcConsoleResult((current) => {
        if (!current.pilot_response || current.pilot_response !== payload) {
          return current;
        }

        return atcConsoleResultAfterPilotVoicePlayback(current, payload, "openai", cachedVoiceText);
      });
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;
    let speechStarted = false;
    let fallbackTimerId: number | null = null;

    setPilotVoiceStatus({ state: "calling", detail: "LLM CALLING" });

    fallbackTimerId = window.setTimeout(() => {
      if (cancelled || speechStarted) {
        return;
      }

      speechStarted = true;
      setPilotVoiceStatus({ state: "fallback", detail: "LLM WAIT" });
      void playPilotSpeechRef.current(payload.speakable_text, `llm-budget-fallback|${requestKey}`);
      setAtcConsoleResult((current) => {
        if (!current.pilot_response || current.pilot_response !== payload) {
          return current;
        }

        return {
          ...atcConsoleResultAfterPilotVoicePlayback(current, payload, "deterministic_fallback"),
          detail: current.detail ?? "LLM voice exceeded latency budget; deterministic readback used"
        };
      });
    }, PILOT_VOICE_LLM_LATENCY_BUDGET_MS);

    requestPilotVoice(payload, { signal: abortController.signal })
      .then((voiceResult) => {
        if (cancelled) {
          return;
        }

        const voiceText = voiceResult.text || payload.speakable_text;
        if (voiceResult.source === "openai" && voiceText) {
          setLimitedCache(pilotVoiceTextCacheRef.current, requestKey, voiceText, PILOT_VOICE_CACHE_LIMIT);
        }

        if (fallbackTimerId !== null) {
          window.clearTimeout(fallbackTimerId);
          fallbackTimerId = null;
        }

        if (speechStarted) {
          setPilotVoiceStatus({
            state: voiceResult.source === "openai" ? "openai" : "fallback",
            detail: voiceResult.source === "openai" ? "LLM LATE" : "FALLBACK",
            model: voiceResult.model
          });
          return;
        }

        speechStarted = true;

        setPilotVoiceStatus({
          state: voiceResult.source === "openai" ? "openai" : "fallback",
          detail: voiceResult.source === "openai" ? "LLM" : "FALLBACK",
          model: voiceResult.model
        });

        void playPilotSpeechRef.current(voiceText, `${voiceResult.source}|${requestKey}`);

        setAtcConsoleResult((current) => {
          if (!current.pilot_response || current.pilot_response !== payload) {
            return current;
          }

          return atcConsoleResultAfterPilotVoicePlayback(current, payload, voiceResult.source, voiceText);
        });
      })
      .catch((error) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }

        if (fallbackTimerId !== null) {
          window.clearTimeout(fallbackTimerId);
          fallbackTimerId = null;
        }

        if (speechStarted) {
          return;
        }

        speechStarted = true;

        setPilotVoiceStatus({ state: "fallback", detail: "FALLBACK" });
        void playPilotSpeechRef.current(payload.speakable_text, `fallback|${requestKey}`);
        setAtcConsoleResult((current) => {
          if (!current.pilot_response || current.pilot_response !== payload) {
            return current;
          }

          return {
            ...atcConsoleResultAfterPilotVoicePlayback(current, payload, "deterministic_fallback"),
            detail: current.detail ?? (error instanceof Error ? error.message : String(error))
          };
        });
      });

    return () => {
      cancelled = true;
      if (fallbackTimerId !== null) {
        window.clearTimeout(fallbackTimerId);
      }
      abortController.abort();
    };
  }, [atcConsoleResult.pilot_response, pilotVoiceMode, setAtcConsoleResult]);

  return { pilotVoiceStatus };
}
