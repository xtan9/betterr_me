/** Encodes and validates opaque concurrency versions for Series projections. */

import type { SeriesVersion } from "./capability-contract";

export function isOpaqueSeriesVersion(value: string): value is SeriesVersion {
  return value.startsWith("rt-series-v1.") && parseEncodedVersion(value) !== undefined;
}

export interface DecodedSeriesVersion {
  seriesId: string;
  revisionToken: number;
}

export function encodeSeriesVersion(
  seriesId: string | undefined,
  revisionToken: number,
): SeriesVersion {
  const payload = JSON.stringify({
    seriesId: seriesId ?? "",
    revisionToken,
  });
  const encoded = encodeBase64Url(payload);
  return `rt-series-v1.${encoded}` as SeriesVersion;
}

export function parseSeriesVersion(
  value: unknown,
  seriesId: unknown,
): DecodedSeriesVersion | undefined {
  return decodeSeriesVersion(value, seriesId);
}

/** Decode an opaque Series version only at the command/lifecycle boundary. */
export function decodeSeriesVersion(
  value: unknown,
  seriesId?: unknown,
): DecodedSeriesVersion | undefined {
  if (typeof value !== "string") return undefined;
  const decoded = parseEncodedVersion(value);
  if (!decoded) return undefined;
  return typeof seriesId !== "string" || decoded.seriesId === seriesId
    ? decoded
    : undefined;
}

function parseEncodedVersion(value: unknown): DecodedSeriesVersion | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("rt-series-v1.")) return undefined;
  try {
    const json = decodeBase64Url(value.slice("rt-series-v1.".length));
    const parsed = JSON.parse(json) as Partial<DecodedSeriesVersion>;
    if (
      typeof parsed.seriesId !== "string"
      || typeof parsed.revisionToken !== "number"
      || !Number.isInteger(parsed.revisionToken)
      || parsed.revisionToken < 1
    ) {
      return undefined;
    }
    return {
      seriesId: parsed.seriesId,
      revisionToken: parsed.revisionToken,
    };
  } catch {
    return undefined;
  }
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}
