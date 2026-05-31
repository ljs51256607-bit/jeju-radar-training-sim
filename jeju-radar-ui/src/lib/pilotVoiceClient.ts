import type { PilotResponsePayload } from "./pilotResponseLayer";
import { localApiEndpoint } from "./localApiEndpoint";

export type PilotVoiceMode = "deterministic" | "llm";

export type PilotVoiceSource =
  | "deterministic"
  | "openai"
  | "deterministic_fallback"
  | "silent";

export interface PilotVoiceResult {
  ok: boolean;
  source: PilotVoiceSource;
  text: string;
  fallback_text?: string;
  model?: string;
  detail?: string;
}

export interface PilotVoiceClientOptions {
  endpoint?: string;
  signal?: AbortSignal;
}

export function deterministicPilotVoice(payload: PilotResponsePayload): PilotVoiceResult {
  return {
    ok: true,
    source: payload.response_action === "SILENT_NO_RESPONSE" ? "silent" : "deterministic",
    text: payload.response_action === "SILENT_NO_RESPONSE" ? "" : payload.speakable_text,
    fallback_text: payload.speakable_text,
    detail: "deterministic pilot response"
  };
}

export async function requestPilotVoice(
  payload: PilotResponsePayload,
  options: PilotVoiceClientOptions = {}
): Promise<PilotVoiceResult> {
  if (payload.response_action === "SILENT_NO_RESPONSE") {
    return deterministicPilotVoice(payload);
  }

  const endpoint = options.endpoint ?? localApiEndpoint("/api/pilot-voice");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ payload }),
      signal: options.signal
    });

    if (!response.ok) {
      const detail = await readProxyErrorDetail(response);

      return {
        ok: false,
        source: "deterministic_fallback",
        text: payload.speakable_text,
        fallback_text: payload.speakable_text,
        detail: detail ? `${detail} (HTTP ${response.status})` : `pilot voice proxy returned ${response.status}`
      };
    }

    const body = (await response.json()) as Partial<PilotVoiceResult>;
    const text = typeof body.text === "string" ? body.text : payload.speakable_text;

    return {
      ok: Boolean(body.ok),
      source: normalizePilotVoiceSource(body.source),
      text: text || payload.speakable_text,
      fallback_text: body.fallback_text ?? payload.speakable_text,
      model: body.model,
      detail: body.detail
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    return {
      ok: false,
      source: "deterministic_fallback",
      text: payload.speakable_text,
      fallback_text: payload.speakable_text,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

function normalizePilotVoiceSource(value: unknown): PilotVoiceSource {
  if (
    value === "deterministic" ||
    value === "openai" ||
    value === "deterministic_fallback" ||
    value === "silent"
  ) {
    return value;
  }

  return "deterministic_fallback";
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
