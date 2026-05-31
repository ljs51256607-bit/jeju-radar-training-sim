import { localApiEndpoint } from "./localApiEndpoint";

export type AtcSpeechStatus =
  | "idle"
  | "recording"
  | "transcribing"
  | "applied"
  | "error"
  | "unsupported";

export interface AtcTranscriptionResult {
  ok: boolean;
  source: string;
  text: string;
  model?: string;
  detail?: string;
}

export interface PilotSpeechResult {
  ok: boolean;
  source: string;
  audio?: Blob;
  model?: string | null;
  voice?: string | null;
  detail?: string;
}

export async function transcribeAtcAudio(
  audio: Blob,
  options: { endpoint?: string; signal?: AbortSignal; contextPrompt?: string } = {}
): Promise<AtcTranscriptionResult> {
  if (!audio || audio.size === 0) {
    return {
      ok: false,
      source: "no_audio",
      text: "",
      detail: "audio payload is empty"
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": audio.type || "audio/webm"
  };
  const contextPrompt = options.contextPrompt?.trim();

  if (contextPrompt) {
    headers["X-ATC-STT-Context"] = contextPrompt.replace(/[\r\n]+/g, " ").slice(0, 1600);
  }

  const response = await fetch(options.endpoint ?? localApiEndpoint("/api/atc-transcribe"), {
    method: "POST",
    headers,
    body: audio,
    signal: options.signal
  });

  if (!response.ok) {
    const detail = await readProxyErrorDetail(response);

    return {
      ok: false,
      source: "proxy_error",
      text: "",
      detail: detail ? `${detail} (HTTP ${response.status})` : `ATC transcription proxy returned ${response.status}`
    };
  }

  const body = (await response.json()) as Partial<AtcTranscriptionResult>;

  return {
    ok: Boolean(body.ok),
    source: typeof body.source === "string" ? body.source : "unknown",
    text: typeof body.text === "string" ? body.text : "",
    model: body.model,
    detail: body.detail
  };
}

export async function requestPilotSpeech(
  text: string,
  options: { endpoint?: string; signal?: AbortSignal } = {}
): Promise<PilotSpeechResult> {
  const speechText = text.trim();

  if (!speechText) {
    return {
      ok: false,
      source: "no_text",
      detail: "speech text is empty"
    };
  }

  const response = await fetch(options.endpoint ?? localApiEndpoint("/api/pilot-speech"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text: speechText }),
    signal: options.signal
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    const detail = await readProxyErrorDetail(response);

    return {
      ok: false,
      source: "proxy_error",
      detail: detail ? `${detail} (HTTP ${response.status})` : `pilot speech proxy returned ${response.status}`,
      model: response.headers.get("X-Pilot-Speech-Model"),
      voice: response.headers.get("X-Pilot-Speech-Voice")
    };
  }

  if (contentType.includes("application/json")) {
    const body = (await response.json()) as Partial<PilotSpeechResult>;
    return {
      ok: Boolean(body.ok),
      source: typeof body.source === "string" ? body.source : "unknown",
      detail: body.detail,
      model: body.model,
      voice: body.voice
    };
  }

  return {
    ok: true,
    source: response.headers.get("X-Pilot-Speech-Source") ?? "openai",
    audio: await response.blob(),
    model: response.headers.get("X-Pilot-Speech-Model"),
    voice: response.headers.get("X-Pilot-Speech-Voice"),
    detail: "pilot speech audio"
  };
}

async function readProxyErrorDetail(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return "";
  }

  try {
    const body = await response.clone().json() as { detail?: unknown; error?: unknown };
    return typeof body.detail === "string"
      ? body.detail
      : typeof body.error === "string"
        ? body.error
        : "";
  } catch {
    return "";
  }
}
