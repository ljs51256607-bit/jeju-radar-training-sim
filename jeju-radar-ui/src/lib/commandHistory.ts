export interface CommandHistoryStepOptions {
  currentValue: string;
  cursor: number | null;
  direction: "next" | "previous";
  draft: string;
  history: string[];
}

export interface CommandHistoryStepResult {
  cursor: number | null;
  draft: string;
  value: string;
}

export const COMMAND_HISTORY_STORAGE_KEY = "jeju-radar-ui:atc-command-history:v1";
export const DEFAULT_COMMAND_HISTORY_LIMIT = 20;
const COMMAND_HISTORY_MAX_ENTRY_LENGTH = 200;

type CommandHistoryReadableStorage = Pick<Storage, "getItem">;
type CommandHistoryWritableStorage = Pick<Storage, "setItem">;

export function commandHistoryAfterSubmit(
  history: string[],
  command: string,
  limit = DEFAULT_COMMAND_HISTORY_LIMIT
) {
  const normalizedCommand = command.trim();

  if (!normalizedCommand) {
    return history;
  }

  return [
    normalizedCommand,
    ...history.filter((entry) => entry !== normalizedCommand)
  ].slice(0, Math.max(1, limit));
}

export function commandHistoryFromStorage(
  storage: CommandHistoryReadableStorage | null | undefined = commandHistoryStorage(),
  limit = DEFAULT_COMMAND_HISTORY_LIMIT
) {
  if (!storage) {
    return [];
  }

  try {
    const rawValue = storage.getItem(COMMAND_HISTORY_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];

    return normalizeCommandHistoryList(parsedValue, limit);
  } catch {
    return [];
  }
}

export function saveCommandHistoryToStorage(
  storage: CommandHistoryWritableStorage | null | undefined = commandHistoryStorage(),
  history: string[],
  limit = DEFAULT_COMMAND_HISTORY_LIMIT
) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      COMMAND_HISTORY_STORAGE_KEY,
      JSON.stringify(normalizeCommandHistoryList(history, limit))
    );
  } catch {
    // Persistence failure should not interrupt ATC input handling.
  }
}

export function commandHistoryStep({
  currentValue,
  cursor,
  direction,
  draft,
  history
}: CommandHistoryStepOptions): CommandHistoryStepResult {
  if (history.length === 0) {
    return {
      cursor,
      draft,
      value: currentValue
    };
  }

  if (direction === "previous") {
    const nextCursor = cursor === null ? 0 : Math.min(history.length - 1, cursor + 1);

    return {
      cursor: nextCursor,
      draft: cursor === null ? currentValue : draft,
      value: history[nextCursor]
    };
  }

  if (cursor === null) {
    return {
      cursor,
      draft,
      value: currentValue
    };
  }

  if (cursor === 0) {
    return {
      cursor: null,
      draft: "",
      value: draft
    };
  }

  const nextCursor = cursor - 1;

  return {
    cursor: nextCursor,
    draft,
    value: history[nextCursor]
  };
}

function commandHistoryStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
    ? window.localStorage
    : undefined;
}

function normalizeCommandHistoryList(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedHistory: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const normalizedEntry = entry.trim();

    if (
      !normalizedEntry ||
      normalizedEntry.length > COMMAND_HISTORY_MAX_ENTRY_LENGTH ||
      normalizedHistory.includes(normalizedEntry)
    ) {
      continue;
    }

    normalizedHistory.push(normalizedEntry);

    if (normalizedHistory.length >= Math.max(1, limit)) {
      break;
    }
  }

  return normalizedHistory;
}
