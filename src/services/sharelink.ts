import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type {
  AnalysisReport,
  AnalysisSettings,
  SharedAnalysisPayload,
  SpellTarget,
} from "../domain/types";
import { SECURITY_LIMITS } from "../security/limits";
import { validateSharedAnalysisPayload } from "../security/share";

export type ShareDecodeErrorCode =
  | "empty"
  | "too-large"
  | "decode-failed"
  | "invalid-json"
  | "invalid-payload"
  | "expired";

export class SharePayloadError extends Error {
  constructor(
    public readonly code: ShareDecodeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SharePayloadError";
  }
}

export function createSharedPayload(params: {
  report: AnalysisReport;
  deckName: string;
  rawText: string;
  settings: AnalysisSettings;
  targets: SpellTarget[];
  now?: number;
}): SharedAnalysisPayload {
  const now = params.now ?? Date.now();
  return {
    schemaVersion: 1,
    createdAt: now,
    expiresAt: now + SECURITY_LIMITS.sharePayloadMaxAgeMs,
    report: params.report,
    fallback: {
      deckName: params.deckName,
      rawText: params.rawText,
      settings: params.settings,
      targets: params.targets,
    },
  };
}

export function encodeSharedPayload(payload: SharedAnalysisPayload): string {
  const serialized = JSON.stringify(payload);
  if (serialized.length > SECURITY_LIMITS.sharePayloadDecodedCharacters) {
    throw new SharePayloadError("too-large", "Share payload is too large to encode.");
  }

  const encoded = compressToEncodedURIComponent(serialized);
  if (!encoded || encoded.length < 1) {
    throw new SharePayloadError("decode-failed", "Share payload compression failed.");
  }
  if (encoded.length > SECURITY_LIMITS.sharePayloadEncodedCharacters) {
    throw new SharePayloadError("too-large", "Share payload exceeds supported URL length.");
  }
  return encoded;
}

export function decodeSharedPayload(encoded: string): SharedAnalysisPayload {
  if (!encoded.trim()) {
    throw new SharePayloadError("empty", "Share payload is empty.");
  }
  if (encoded.length > SECURITY_LIMITS.sharePayloadEncodedCharacters) {
    throw new SharePayloadError("too-large", "Share payload exceeds supported URL length.");
  }

  const decompressed = decompressFromEncodedURIComponent(encoded);
  if (!decompressed) {
    throw new SharePayloadError("decode-failed", "Could not decode shared payload.");
  }
  if (decompressed.length > SECURITY_LIMITS.sharePayloadDecodedCharacters) {
    throw new SharePayloadError("too-large", "Decoded share payload exceeds safety limits.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decompressed);
  } catch {
    throw new SharePayloadError("invalid-json", "Shared payload is not valid JSON.");
  }

  const payload = validateSharedAnalysisPayload(parsed);
  if (!payload) {
    throw new SharePayloadError("invalid-payload", "Shared payload failed validation.");
  }
  if (payload.expiresAt < Date.now()) {
    throw new SharePayloadError("expired", "Shared payload has expired.");
  }
  return payload;
}

export function buildSharedAnalysisUrl(
  encodedPayload: string,
  origin = window.location.origin,
): string {
  const url = new URL(`${origin}${window.location.pathname}${window.location.search}`);
  url.hash = `/analysis/shared?share=${encodedPayload}`;
  return url.toString();
}
