export type SecurityServiceErrorCode =
  | "timeout"
  | "rate-limit"
  | "invalid-response"
  | "blocked-url"
  | "storage-corruption"
  | "resource-limit"
  | "network";

export class SecurityServiceError extends Error {
  constructor(
    public readonly code: SecurityServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SecurityServiceError";
  }
}
