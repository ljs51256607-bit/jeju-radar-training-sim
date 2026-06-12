export const PTT_LIVE_SAMPLE_SESSION_PATH = "ptt-live-sample-session/ptt-live-sample-session.json";

export interface PttLiveSample {
  index: number;
  id: string;
  source: string;
  source_case_id: string;
  category: string;
  phrase: string;
  expected_intents: string[];
  focus: string[];
}

export interface PttLiveSampleSession {
  metadata: {
    id: "ptt_live_sample_session_v1";
    generated_at: string;
    target_sample_count: number;
    actual_sample_count: number;
  };
  samples: PttLiveSample[];
}

export interface PttLiveSamplePrompt {
  current: PttLiveSample | null;
  next: PttLiveSample | null;
  progressText: string;
  focusText: string;
}

export function pttLiveSamplePromptForTraceCount(
  session: PttLiveSampleSession | null,
  traceCount: number
): PttLiveSamplePrompt | null {
  if (!session || session.samples.length === 0) {
    return null;
  }

  const clampedIndex = Math.min(Math.max(traceCount, 0), session.samples.length - 1);
  const current = session.samples[clampedIndex] ?? null;
  const next = session.samples[clampedIndex + 1] ?? null;

  return {
    current,
    next,
    progressText: `SAMPLE ${Math.min(traceCount + 1, session.samples.length)}/${session.samples.length}`,
    focusText: current ? `${current.category.toUpperCase()} ${current.focus.slice(0, 2).join(" ").toUpperCase()}`.trim() : ""
  };
}

export function isPttLiveSampleSession(value: unknown): value is PttLiveSampleSession {
  const candidate = value as Partial<PttLiveSampleSession> | null;

  return (
    Boolean(candidate) &&
    candidate?.metadata?.id === "ptt_live_sample_session_v1" &&
    Array.isArray(candidate.samples) &&
    candidate.samples.every(isPttLiveSample)
  );
}

function isPttLiveSample(value: unknown): value is PttLiveSample {
  const candidate = value as Partial<PttLiveSample> | null;

  return (
    Boolean(candidate) &&
    typeof candidate?.index === "number" &&
    typeof candidate.id === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.source_case_id === "string" &&
    typeof candidate.category === "string" &&
    typeof candidate.phrase === "string" &&
    Array.isArray(candidate.expected_intents) &&
    Array.isArray(candidate.focus)
  );
}
