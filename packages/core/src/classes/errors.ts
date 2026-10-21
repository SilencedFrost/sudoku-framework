const ILLEGAL_STATE_MESSAGES = {
  NO_CANDIDATES: "No candidates exists for at least one cell!",
} as const;

export type IllegalStateCode = keyof typeof ILLEGAL_STATE_MESSAGES;

export class IllegalStateError extends Error {
  static readonly Code = Object.fromEntries(Object.keys(ILLEGAL_STATE_MESSAGES).map((k) => [k, k])) as { [K in IllegalStateCode]: K };

  constructor(public readonly code: IllegalStateCode) {
    super(ILLEGAL_STATE_MESSAGES[code]);
    this.name = "IllegalStateError"; // readable in stack traces / logs
  }
}
