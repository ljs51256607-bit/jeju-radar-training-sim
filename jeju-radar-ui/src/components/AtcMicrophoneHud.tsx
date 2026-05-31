import type { AtcSpeechStatus } from "../lib/atcSpeechClient";

interface AtcMicrophoneHudProps {
  barCount: number;
  isLow: boolean;
  primary: string;
  secondary: string;
  state: AtcSpeechStatus;
}

export default function AtcMicrophoneHud({
  barCount,
  isLow,
  primary,
  secondary,
  state
}: AtcMicrophoneHudProps) {
  return (
    <div
      aria-label={`Microphone ${primary} ${secondary}`}
      aria-live="polite"
      className={`atc-mic-hud ${state}${isLow ? " low" : ""}`}
    >
      <span className="atc-mic-dot" />
      <div className="atc-mic-copy">
        <strong>MIC {primary}</strong>
        <span>{secondary}</span>
      </div>
      <div className="atc-mic-bars" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, index) => (
          <span
            className={index < barCount ? "active" : ""}
            key={index}
            style={{ height: `${4 + index * 1.35}px` }}
          />
        ))}
      </div>
    </div>
  );
}
