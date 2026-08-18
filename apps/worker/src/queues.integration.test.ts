import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Queue, UnrecoverableError, Worker, type Job } from "bullmq";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";

interface TestJob {
  mode: "duplicate" | "transient" | "invalid";
}

describe("BullMQ durable queue integration", () => {
  const queueName = `phase5-integration-${randomUUID()}`;
  const prefix = `recourse:phase5-test:${randomUUID()}:`;
  const connection = {
    url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    connectTimeout: 1_000,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  };
  const workerConnection = {
    ...connection,
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
  };

  let queue: Queue<TestJob>;
  let worker: Worker<TestJob>;
  const attempts = new Map<string, number>();

  beforeAll(async () => {
    const probe = new Redis({ ...connection, lazyConnect: true });
    await probe.connect();
    await probe.ping();
    await probe.quit();

    queue = new Queue<TestJob>(queueName, {
      connection,
      prefix,
      defaultJobOptions: { removeOnComplete: false, removeOnFail: false },
    });
    queue.on("error", () => undefined);

    worker = new Worker<TestJob>(
      queueName,
      async (job: Job<TestJob>) => {
        const count = (attempts.get(job.id ?? "") ?? 0) + 1;
        attempts.set(job.id ?? "", count);

        if (job.data.mode === "transient" && count === 1) {
          throw new Error("temporary provider timeout");
        }
        if (job.data.mode === "invalid") {
          throw new UnrecoverableError("invalid job input");
        }
        return { attempt: count };
      },
      { connection: workerConnection, prefix, concurrency: 2 },
    );
    worker.on("error", () => undefined);
  });

  afterAll(async () => {
    await worker?.close();
    await queue?.obliterate({ force: true });
    await queue?.close();
  });

  it("suppresses deterministic duplicate jobs", async () => {
    const jobId = `duplicate-${randomUUID()}`;
    const first = await queue.add(
      "case-event",
      { mode: "duplicate" },
      { jobId },
    );
    const duplicate = await queue.add(
      "case-event",
      { mode: "duplicate" },
      { jobId },
    );

    expect(duplicate.id).toBe(first.id);
    await waitFor(
      async () => (await queue.getJob(jobId))?.isCompleted() ?? false,
    );
    expect(attempts.get(jobId)).toBe(1);
  });

  it("retries transient failures with bounded attempts", async () => {
    const jobId = `transient-${randomUUID()}`;
    await queue.add(
      "case-event",
      { mode: "transient" },
      { jobId, attempts: 2, backoff: { type: "fixed", delay: 25 } },
    );

    await waitFor(
      async () => (await queue.getJob(jobId))?.isCompleted() ?? false,
    );
    expect(attempts.get(jobId)).toBe(2);
  });

  it("does not retry unrecoverable input", async () => {
    const jobId = `invalid-${randomUUID()}`;
    await queue.add(
      "case-event",
      { mode: "invalid" },
      { jobId, attempts: 5, backoff: { type: "fixed", delay: 25 } },
    );

    await waitFor(async () => (await queue.getJob(jobId))?.isFailed() ?? false);
    expect(attempts.get(jobId)).toBe(1);
    expect((await queue.getJob(jobId))?.failedReason).toContain(
      "invalid job input",
    );
  });
});

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for BullMQ job state.");
}
