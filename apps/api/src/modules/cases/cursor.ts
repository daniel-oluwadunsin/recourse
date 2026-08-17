import { Types } from "mongoose";

import { type CasePageCursor, type EventPageCursor } from "./cases.types";

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode(value: string): unknown {
  try {
    return JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;
  } catch {
    return undefined;
  }
}

export function encodeCaseCursor(cursor: CasePageCursor): string {
  return encode(cursor);
}

export function decodeCaseCursor(value: string): CasePageCursor | undefined {
  const decoded = decode(value);
  if (!isRecord(decoded)) {
    return undefined;
  }

  if (
    decoded.version !== 1 ||
    typeof decoded.updatedAt !== "string" ||
    typeof decoded.id !== "string" ||
    !Types.ObjectId.isValid(decoded.id) ||
    Number.isNaN(Date.parse(decoded.updatedAt))
  ) {
    return undefined;
  }

  return {
    id: decoded.id,
    updatedAt: decoded.updatedAt,
    version: 1,
  };
}

export function encodeEventCursor(cursor: EventPageCursor): string {
  return encode(cursor);
}

export function decodeEventCursor(value: string): EventPageCursor | undefined {
  const decoded = decode(value);
  if (!isRecord(decoded)) {
    return undefined;
  }

  if (
    decoded.version !== 1 ||
    typeof decoded.sequence !== "number" ||
    !Number.isSafeInteger(decoded.sequence) ||
    decoded.sequence < 0
  ) {
    return undefined;
  }

  return { sequence: decoded.sequence, version: 1 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
