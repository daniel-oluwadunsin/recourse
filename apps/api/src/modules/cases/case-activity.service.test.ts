import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";
import { type Request, type Response } from "express";
import { Types } from "mongoose";

import { CaseActivityService } from "./case-activity.service";

describe("CaseActivityService", () => {
  it("replays persisted events after Last-Event-ID and redacts unsafe payload fields", async () => {
    const caseId = new Types.ObjectId();
    const eventId = new Types.ObjectId();
    const listForCase = vi.fn().mockResolvedValue([
      {
        _id: eventId,
        actorType: "SYSTEM",
        caseId,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        payload: {
          changedFields: ["title"],
          secretCorrection: "must-not-be-streamed",
        },
        sequence: 2,
        type: "CASE_UPDATED",
      },
    ]);
    const unsubscribe = vi.fn();
    const responseWrites: string[] = [];
    const response = Object.assign(new EventEmitter(), {
      flushHeaders: vi.fn(),
      setHeader: vi.fn(),
      statusCode: 0,
      writableEnded: false,
      write: vi.fn((value: string) => {
        responseWrites.push(value);
        return true;
      }),
    }) as unknown as Response;
    const request = Object.assign(new EventEmitter(), {
      get: vi.fn((header: string) =>
        header === "last-event-id" ? "1" : undefined,
      ),
    }) as unknown as Request;
    const query = {
      exec: vi.fn().mockResolvedValue({ _id: caseId }),
      select: vi.fn().mockReturnThis(),
    };
    const service = new CaseActivityService(
      { findOne: vi.fn().mockReturnValue(query) } as never,
      { listForCase } as never,
      {
        withOwnerScope: vi.fn((_ownerId, filter) => filter),
      } as never,
      { on: vi.fn().mockReturnValue(unsubscribe) } as never,
      {
        get: vi.fn((key: string) =>
          key === "SSE_RETRY_MS"
            ? 1234
            : key === "SSE_HEARTBEAT_INTERVAL_MS"
              ? 1000
              : undefined,
        ),
      } as never,
    );

    await service.stream("owner-id", caseId.toString(), request, response);
    const stream = responseWrites.join("");

    expect(listForCase).toHaveBeenCalledWith(caseId.toString(), 1, 100);
    expect(stream).toContain("retry: 1234");
    expect(stream).toContain("id: 2");
    expect(stream).toContain('"changedFields":["title"]');
    expect(stream).not.toContain("must-not-be-streamed");

    request.emit("close");
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
