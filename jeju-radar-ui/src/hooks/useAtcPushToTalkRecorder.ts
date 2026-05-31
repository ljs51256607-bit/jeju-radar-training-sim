import { useEffect, useRef, useState } from "react";
import type { AtcSpeechStatus } from "../lib/atcSpeechClient";

export interface AtcSpeechUiStatus {
  state: AtcSpeechStatus;
  detail: string;
  text?: string;
  model?: string;
}

interface UseAtcPushToTalkRecorderArgs {
  onAudioBlob: (audioBlob: Blob) => void;
}

function isPushToTalkControlKey(event: KeyboardEvent) {
  return event.key === "Control" || event.code === "ControlLeft" || event.code === "ControlRight";
}

function preferredAtcAudioMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

export function useAtcPushToTalkRecorder({ onAudioBlob }: UseAtcPushToTalkRecorderArgs) {
  const [atcSpeechStatus, setAtcSpeechStatus] = useState<AtcSpeechUiStatus>({
    state: "idle",
    detail: "CTRL PTT"
  });
  const [atcMicLevel, setAtcMicLevel] = useState(0);
  const onAudioBlobRef = useRef(onAudioBlob);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const atcAudioContextRef = useRef<AudioContext | null>(null);
  const atcAudioAnalyserRef = useRef<AnalyserNode | null>(null);
  const atcAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const atcAudioLevelDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const atcAudioLevelAnimationFrameRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const pushToTalkIntentActiveRef = useRef(false);

  useEffect(() => {
    onAudioBlobRef.current = onAudioBlob;
  }, [onAudioBlob]);

  useEffect(() => {
    function handlePushToTalkKeyDown(event: KeyboardEvent) {
      if (!isPushToTalkControlKey(event) || event.repeat) {
        return;
      }

      pushToTalkIntentActiveRef.current = true;
      void startPushToTalkRecording();
    }

    function handlePushToTalkKeyUp(event: KeyboardEvent) {
      if (!isPushToTalkControlKey(event)) {
        return;
      }

      stopPushToTalkRecording();
    }

    function stopForFocusLoss() {
      stopPushToTalkRecording();
    }

    function stopForVisibilityChange() {
      if (document.visibilityState === "hidden") {
        stopPushToTalkRecording();
      }
    }

    window.addEventListener("keydown", handlePushToTalkKeyDown);
    window.addEventListener("keyup", handlePushToTalkKeyUp);
    window.addEventListener("blur", stopForFocusLoss);
    document.addEventListener("visibilitychange", stopForVisibilityChange);

    return () => {
      window.removeEventListener("keydown", handlePushToTalkKeyDown);
      window.removeEventListener("keyup", handlePushToTalkKeyUp);
      window.removeEventListener("blur", stopForFocusLoss);
      document.removeEventListener("visibilitychange", stopForVisibilityChange);
      stopPushToTalkRecording();
      cleanupAtcMediaStream();
    };
  }, []);

  async function startPushToTalkRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      setAtcSpeechStatus({
        state: "unsupported",
        detail: "MIC UNSUPPORTED"
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const mimeType = preferredAtcAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      startAtcAudioLevelMeter(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        cleanupAtcMediaStream();

        if (chunks.length === 0) {
          setAtcSpeechStatus({ state: "idle", detail: "CTRL PTT" });
          return;
        }

        const audioBlob = new Blob(chunks, {
          type: recorder.mimeType || mimeType || "audio/webm"
        });

        onAudioBlobRef.current(audioBlob);
      };

      recorder.start();
      setAtcSpeechStatus({ state: "recording", detail: "REC" });

      if (!pushToTalkIntentActiveRef.current) {
        stopPushToTalkRecording();
      }
    } catch (recordingError) {
      cleanupAtcMediaStream();
      mediaRecorderRef.current = null;
      setAtcSpeechStatus({
        state: "error",
        detail: recordingError instanceof Error ? recordingError.message : "MIC ERROR"
      });
    }
  }

  function stopPushToTalkRecording() {
    pushToTalkIntentActiveRef.current = false;

    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      return;
    }

    if (recorder.state === "recording") {
      stopAtcAudioLevelMeter();
      setAtcSpeechStatus({ state: "transcribing", detail: "STT" });
      recorder.stop();
    }
  }

  function togglePushToTalkRecording() {
    const recorder = mediaRecorderRef.current;

    if (pushToTalkIntentActiveRef.current || recorder?.state === "recording") {
      stopPushToTalkRecording();
      return;
    }

    pushToTalkIntentActiveRef.current = true;
    void startPushToTalkRecording();
  }

  function cleanupAtcMediaStream() {
    stopAtcAudioLevelMeter();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  function startAtcAudioLevelMeter(stream: MediaStream) {
    stopAtcAudioLevelMeter();

    if (typeof window === "undefined" || typeof window.AudioContext === "undefined") {
      return;
    }

    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      const data = new Uint8Array(analyser.fftSize);
      source.connect(analyser);

      atcAudioContextRef.current = audioContext;
      atcAudioAnalyserRef.current = analyser;
      atcAudioSourceRef.current = source;
      atcAudioLevelDataRef.current = data;

      void audioContext.resume().catch(() => undefined);

      const updateLevel = () => {
        const currentAnalyser = atcAudioAnalyserRef.current;
        const currentData = atcAudioLevelDataRef.current;

        if (!currentAnalyser || !currentData) {
          return;
        }

        currentAnalyser.getByteTimeDomainData(currentData);

        let sum = 0;
        for (let index = 0; index < currentData.length; index += 1) {
          const centered = (currentData[index] - 128) / 128;
          sum += centered * centered;
        }

        const rms = Math.sqrt(sum / currentData.length);
        const nextLevel = Math.min(1, Math.max(0, (rms - 0.01) * 8));

        setAtcMicLevel((currentLevel) =>
          Math.abs(currentLevel - nextLevel) > 0.015 ? nextLevel : currentLevel
        );

        atcAudioLevelAnimationFrameRef.current = window.requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch {
      setAtcMicLevel(0);
    }
  }

  function stopAtcAudioLevelMeter() {
    if (atcAudioLevelAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(atcAudioLevelAnimationFrameRef.current);
      atcAudioLevelAnimationFrameRef.current = null;
    }

    atcAudioSourceRef.current?.disconnect();
    atcAudioAnalyserRef.current?.disconnect();
    atcAudioSourceRef.current = null;
    atcAudioAnalyserRef.current = null;
    atcAudioLevelDataRef.current = null;

    const audioContext = atcAudioContextRef.current;
    atcAudioContextRef.current = null;

    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }

    setAtcMicLevel(0);
  }

  return {
    atcMicLevel,
    atcSpeechStatus,
    setAtcSpeechStatus,
    togglePushToTalkRecording
  };
}
