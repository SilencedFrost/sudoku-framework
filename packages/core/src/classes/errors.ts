const ILLEGAL_STATE_MESSAGES = {
  NO_CANDIDATES: (context?: string | number) => `No candidates exists for ${context ? "Cell of index " + String(context) : "at least one cell"}!`,
  ILLEGAL_NAKED_COUNT: (context?: string | number) => `Naked cells count ${context ? "of " + String(context) : ""}is illegal!`,
  ILLEGAL_HIDDEN_COUNT: (context?: string | number) => `Hidden cells count ${context ? "of " + String(context) : ""}is illegal!`,
} as const;

export type IllegalStateCode = keyof typeof ILLEGAL_STATE_MESSAGES;

export class IllegalStateError extends Error {
  static readonly Code = Object.fromEntries(Object.keys(ILLEGAL_STATE_MESSAGES).map((k) => [k, k])) as { [K in IllegalStateCode]: K };

  constructor(
    public readonly code: IllegalStateCode,
    context?: string | number,
  ) {
    super(ILLEGAL_STATE_MESSAGES[code](context));
    this.name = "IllegalStateError"; // readable in stack traces / logs
  }
}
