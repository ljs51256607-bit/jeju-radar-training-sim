import { useRef, useState } from "react";
import { requestPilotSpeech } from "../lib/atcSpeechClient";
import {
  callsignTelephonyText,
  digitsToTelephonyWords
} from "../lib/callsignTelephony";
import { setLimitedCache } from "../lib/limitedCache";

const FAST_PILOT_SPEECH_RATE = 1.3;
const FAST_PILOT_SPEECH_PITCH = 0.94;
const PILOT_SPEECH_AUDIO_CACHE_LIMIT = 24;
const RADIO_JAM_DURATION_SECONDS = 0.72;
const RADIO_JAM_PEAK_GAIN = 0.18;

export type PilotSpeechPlaybackKind = "voice" | "radio_jam" | "silent";

export interface PilotSpeechUiStatus {
  state: "ready" | "speaking" | "error" | "muted";
  detail: string;
  model?: string | null;
  voice?: string | null;
}

export function pilotSpeechShouldUseOpenAi(fastMode: boolean, localPlaybackStarted: boolean) {
  return !fastMode && !localPlaybackStarted;
}

export function pilotSpeechPlaybackKind(value: string): PilotSpeechPlaybackKind {
  const speechText = value.trim();

  if (!speechText || speechText === "NO RESPONSE") {
    return "silent";
  }

  if (/\bblocked\s+transmission\b/i.test(speechText) || /^Z{3,}/i.test(speechText)) {
    return "radio_jam";
  }

  return "voice";
}

export function pilotSpeechShouldUseOpenAiForPlayback(
  playbackKind: PilotSpeechPlaybackKind,
  fastMode: boolean,
  localPlaybackStarted: boolean
) {
  return playbackKind === "voice" && pilotSpeechShouldUseOpenAi(fastMode, localPlaybackStarted);
}

export function pilotSpeechFastFailureStatus(detail: "FAST TTS UNAVAILABLE" | "FAST TTS ERROR"): PilotSpeechUiStatus {
  return {
    state: "error",
    detail,
    voice: "BROWSER"
  };
}

interface CachedPilotSpeechAudio {
  audio: Blob;
  model?: string | null;
  voice?: string | null;
}

function pilotSpeechTextForBrowserTts(value: string) {
  const telephonyText = value.replace(/\b([A-Z]{2,3})(\d{2,4})\b/g, (match, icao: string, flightNumber: string) => {
    return callsignTelephonyText(`${icao}${flightNumber}`) || match;
  });

  return pilotSpeechNumbersForBrowserTts(telephonyText);
}

function pilotSpeechNumbersForBrowserTts(value: string) {
  let text = value;

  text = text.replace(/\bPC(\d{2,4})\b/g, (_match, digits) => {
    return `papa charlie ${digitsToTelephonyWords(digits)}`;
  });

  text = text.replace(/\b(flight level)\s+(\d{2,3})\b/gi, (_match, label, level) => {
    return `${label} ${digitsToTelephonyWords(level)}`;
  });

  text = text.replace(/\b(Speed|speed)\s+(\d{2,3})\b/g, (_match, label, speed) => {
    return `${label} ${digitsToTelephonyWords(speed)}`;
  });

  text = text.replace(/\b(Heading|heading)\s+(\d{2,3})\b/g, (_match, label, heading) => {
    return `${label} ${digitsToTelephonyWords(heading.padStart(3, "0"))}`;
  });

  text = text.replace(/\b(Runway|runway)\s+(\d{1,2})\b/g, (_match, label, runway) => {
    return `${label} ${digitsToTelephonyWords(runway.padStart(2, "0"))}`;
  });

  text = text.replace(/\b(to|descend|climb|passing)\s+(\d{4,5})(?:\s+feet)?\b/gi, (_match, label, altitude) => {
    const spokenAltitude = pilotAltitudeToSpeechWords(altitude);
    const suffix = /^(descend|climb)$/i.test(label) || spokenAltitude.startsWith("flight level") ? "" : " feet";
    return `${label} ${spokenAltitude}${suffix}`;
  });

  text = text.replace(/\b(Vertical speed|vertical speed)\s+(-?\d{3,4})\b/g, (_match, label, verticalSpeed) => {
    return `${label} ${pilotVerticalSpeedToSpeechWords(verticalSpeed)}`;
  });

  text = text.replace(/\b([1-9])([A-Z])\b/g, (_match, number, suffix) => {
    return `${digitsToTelephonyWords(number)} ${pilotProcedureSuffixToSpeechWord(suffix)}`;
  });

  return text;
}

function pilotAltitudeToSpeechWords(value: string) {
  const altitude = Number(value);

  if (!Number.isFinite(altitude) || altitude <= 0) {
    return digitsToTelephonyWords(value);
  }

  if (altitude >= 18000 && altitude % 100 === 0) {
    return `flight level ${digitsToTelephonyWords(String(altitude / 100))}`;
  }

  if (altitude >= 1000 && altitude % 1000 === 0) {
    return `${digitsToTelephonyWords(String(altitude / 1000))} thousand`;
  }

  if (altitude >= 1000 && altitude % 100 === 0) {
    const thousands = Math.floor(altitude / 1000);
    const hundreds = (altitude % 1000) / 100;
    return `${digitsToTelephonyWords(String(thousands))} thousand ${digitsToTelephonyWords(String(hundreds))} hundred`;
  }

  return digitsToTelephonyWords(value);
}

function pilotVerticalSpeedToSpeechWords(value: string) {
  const prefix = value.startsWith("-") ? "minus " : "";
  const numericText = value.replace("-", "");
  const numericValue = Number(numericText);

  if (Number.isFinite(numericValue) && numericValue % 100 === 0) {
    return `${prefix}${digitsToTelephonyWords(String(numericValue / 100))} hundred`;
  }

  return `${prefix}${digitsToTelephonyWords(numericText)}`;
}

function pilotProcedureSuffixToSpeechWord(value: string) {
  const map: Record<string, string> = {
    P: "papa",
    M: "mike",
    E: "echo",
    W: "whiskey",
    N: "november",
    K: "kilo",
    L: "lima",
    Y: "yankee",
    Z: "zulu"
  };

  return map[value] ?? value;
}

export function usePilotSpeechPlayback() {
  const [pilotSpeechEnabled, setPilotSpeechEnabled] = useState(true);
  const [pilotSpeechFastMode, setPilotSpeechFastMode] = useState(true);
  const [pilotSpeechStatus, setPilotSpeechStatus] = useState<PilotSpeechUiStatus>({
    state: "ready",
    detail: "FAST READY"
  });
  const pilotSpeechPlaybackKeyRef = useRef<string | null>(null);
  const pilotSpeechAudioCacheRef = useRef<Map<string, CachedPilotSpeechAudio>>(new Map());
  const pilotSpeechAbortControllerRef = useRef<AbortController | null>(null);
  const activePilotAudioRef = useRef<HTMLAudioElement | null>(null);
  const activePilotSpeechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activeRadioJamAudioContextRef = useRef<AudioContext | null>(null);

  async function playPilotSpeech(text: string, playbackKey: string) {
    const speechText = text.trim();
    const playbackKind = pilotSpeechPlaybackKind(speechText);

    if (!pilotSpeechEnabled || playbackKind === "silent") {
      return;
    }

    if (pilotSpeechPlaybackKeyRef.current === playbackKey) {
      return;
    }

    pilotSpeechPlaybackKeyRef.current = playbackKey;
    pilotSpeechAbortControllerRef.current?.abort();
    activePilotAudioRef.current?.pause();
    void activeRadioJamAudioContextRef.current?.close().catch(() => undefined);
    activeRadioJamAudioContextRef.current = null;
    window.speechSynthesis?.cancel();
    activePilotSpeechUtteranceRef.current = null;

    if (playbackKind === "radio_jam") {
      const localJamStarted = playRadioJamLocally();

      if (!localJamStarted) {
        setPilotSpeechStatus({
          state: "error",
          detail: "FAST JAM UNAVAILABLE",
          voice: "BROWSER"
        });
      }
      return;
    }

    const localPlaybackStarted = pilotSpeechFastMode ? playPilotSpeechLocally(speechText) : false;

    if (localPlaybackStarted) {
      return;
    }

    if (!pilotSpeechShouldUseOpenAiForPlayback(playbackKind, pilotSpeechFastMode, localPlaybackStarted)) {
      setPilotSpeechStatus(pilotSpeechFastFailureStatus("FAST TTS UNAVAILABLE"));
      return;
    }

    await playPilotSpeechWithOpenAi(speechText);
  }

  async function playPilotSpeechWithOpenAi(speechText: string) {
    const cachedSpeech = pilotSpeechAudioCacheRef.current.get(speechText);
    if (cachedSpeech) {
      await playPilotSpeechAudioBlob(cachedSpeech.audio, {
        detail: "CACHE PLAY",
        model: cachedSpeech.model,
        voice: cachedSpeech.voice
      });
      return;
    }

    const abortController = new AbortController();
    pilotSpeechAbortControllerRef.current = abortController;
    setPilotSpeechStatus({ state: "speaking", detail: "CALLING" });

    try {
      const speech = await requestPilotSpeech(speechText, { signal: abortController.signal });

      if (!speech.ok || !speech.audio) {
        setPilotSpeechStatus({
          state: "error",
          detail: speech.detail ?? "TTS ERROR",
          model: speech.model,
          voice: speech.voice
        });
        return;
      }

      setLimitedCache(
        pilotSpeechAudioCacheRef.current,
        speechText,
        {
          audio: speech.audio,
          model: speech.model,
          voice: speech.voice
        },
        PILOT_SPEECH_AUDIO_CACHE_LIMIT
      );

      await playPilotSpeechAudioBlob(speech.audio, {
        detail: "PLAY",
        model: speech.model,
        voice: speech.voice
      });
    } catch (speechError) {
      if (speechError instanceof DOMException && speechError.name === "AbortError") {
        return;
      }

      setPilotSpeechStatus({
        state: "error",
        detail: speechError instanceof Error ? speechError.message : "TTS ERROR"
      });
    }
  }

  async function playPilotSpeechAudioBlob(
    audioBlob: Blob,
    meta: { detail: string; model?: string | null; voice?: string | null }
  ) {
    const objectUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(objectUrl);
    activePilotAudioRef.current = audio;
    setPilotSpeechStatus({
      state: "speaking",
      detail: meta.detail,
      model: meta.model,
      voice: meta.voice
    });

    audio.onended = () => {
      URL.revokeObjectURL(objectUrl);
      if (activePilotAudioRef.current === audio) {
        activePilotAudioRef.current = null;
      }
      setPilotSpeechStatus({
        state: pilotSpeechEnabled ? "ready" : "muted",
        detail: pilotSpeechEnabled ? (pilotSpeechFastMode ? "FAST READY" : "OPENAI READY") : "MUTED",
        model: meta.model,
        voice: meta.voice
      });
    };

    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setPilotSpeechStatus({
        state: "error",
        detail: "AUDIO PLAY ERROR",
        model: meta.model,
        voice: meta.voice
      });
    };

    await audio.play();
  }

  function playPilotSpeechLocally(speechText: string) {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      return false;
    }

    const utterance = new SpeechSynthesisUtterance(pilotSpeechTextForBrowserTts(speechText));

    utterance.lang = "en-US";
    utterance.rate = FAST_PILOT_SPEECH_RATE;
    utterance.pitch = FAST_PILOT_SPEECH_PITCH;
    utterance.volume = 1;

    activePilotSpeechUtteranceRef.current = utterance;
    setPilotSpeechStatus({
      state: "speaking",
      detail: "FAST PLAY",
      voice: "BROWSER"
    });

    utterance.onend = () => {
      if (activePilotSpeechUtteranceRef.current === utterance) {
        activePilotSpeechUtteranceRef.current = null;
      }

      setPilotSpeechStatus({
        state: pilotSpeechEnabled ? "ready" : "muted",
        detail: pilotSpeechEnabled ? "FAST READY" : "MUTED",
        voice: "BROWSER"
      });
    };

    utterance.onerror = () => {
      if (activePilotSpeechUtteranceRef.current === utterance) {
        activePilotSpeechUtteranceRef.current = null;
      }

      setPilotSpeechStatus(pilotSpeechFastFailureStatus("FAST TTS ERROR"));
    };

    window.speechSynthesis.speak(utterance);
    return true;
  }

  function playRadioJamLocally() {
    if (typeof window === "undefined") {
      return false;
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) {
      return false;
    }

    try {
      const audioContext = new AudioContextConstructor();
      const frameCount = Math.max(
        1,
        Math.floor(audioContext.sampleRate * RADIO_JAM_DURATION_SECONDS)
      );
      const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
      const samples = buffer.getChannelData(0);

      for (let index = 0; index < frameCount; index += 1) {
        const progress = index / frameCount;
        const envelope = Math.sin(Math.PI * progress);
        const chopping = Math.sin(progress * Math.PI * 52) > -0.2 ? 1 : 0.25;
        samples[index] = (Math.random() * 2 - 1) * envelope * chopping;
      }

      const source = audioContext.createBufferSource();
      const bandpass = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();
      const startedAt = audioContext.currentTime;

      source.buffer = buffer;
      bandpass.type = "bandpass";
      bandpass.frequency.value = 1750;
      bandpass.Q.value = 0.9;
      gain.gain.setValueAtTime(0.0001, startedAt);
      gain.gain.exponentialRampToValueAtTime(RADIO_JAM_PEAK_GAIN, startedAt + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + RADIO_JAM_DURATION_SECONDS);

      source.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(audioContext.destination);

      activeRadioJamAudioContextRef.current = audioContext;
      setPilotSpeechStatus({
        state: "speaking",
        detail: "JAM PLAY",
        voice: "BROWSER"
      });

      source.onended = () => {
        if (activeRadioJamAudioContextRef.current === audioContext) {
          activeRadioJamAudioContextRef.current = null;
        }

        void audioContext.close().catch(() => undefined);
        setPilotSpeechStatus({
          state: pilotSpeechEnabled ? "ready" : "muted",
          detail: pilotSpeechEnabled ? (pilotSpeechFastMode ? "FAST READY" : "OPENAI READY") : "MUTED",
          voice: "BROWSER"
        });
      };

      source.start();

      if (audioContext.state === "suspended") {
        void audioContext.resume().catch(() => {
          if (activeRadioJamAudioContextRef.current === audioContext) {
            activeRadioJamAudioContextRef.current = null;
          }

          void audioContext.close().catch(() => undefined);
          setPilotSpeechStatus({
            state: "error",
            detail: "FAST JAM ERROR",
            voice: "BROWSER"
          });
        });
      }

      return true;
    } catch {
      return false;
    }
  }

  function cyclePilotSpeechMode() {
    activePilotAudioRef.current?.pause();
    activePilotAudioRef.current = null;
    void activeRadioJamAudioContextRef.current?.close().catch(() => undefined);
    activeRadioJamAudioContextRef.current = null;
    window.speechSynthesis?.cancel();
    activePilotSpeechUtteranceRef.current = null;

    if (!pilotSpeechEnabled) {
      setPilotSpeechEnabled(true);
      setPilotSpeechFastMode(true);
      setPilotSpeechStatus({ state: "ready", detail: "FAST READY" });
      return;
    }

    if (pilotSpeechFastMode) {
      setPilotSpeechFastMode(false);
      setPilotSpeechStatus({ state: "ready", detail: "OPENAI READY" });
      return;
    }

    setPilotSpeechEnabled(false);
    setPilotSpeechFastMode(false);
    setPilotSpeechStatus({ state: "muted", detail: "MUTED" });
  }

  return {
    cyclePilotSpeechMode,
    pilotSpeechEnabled,
    pilotSpeechFastMode,
    pilotSpeechStatus,
    playPilotSpeech
  };
}
