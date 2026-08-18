import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmbeddingProviderError } from "./embedding.types";
import { VoyageEmbeddingProvider } from "./voyage.provider";

describe("Voyage embedding provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends document/query input types and validates dimensions", async () => {
    const fetchMock = vi.fn((_url: unknown, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { input: string[] };
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: body.input.map((_, index) => ({
              embedding: index === 0 ? [0.1, 0.2] : [0.3, 0.4],
              index,
            })),
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new VoyageEmbeddingProvider(config());

    await expect(provider.embedDocuments(["first", "second"])).resolves.toEqual(
      [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
    );
    const documentRequest = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as { input_type: string; output_dimension: number };
    expect(documentRequest.input_type).toBe("document");
    expect(documentRequest.output_dimension).toBe(2);

    await expect(provider.embedQuery("query")).resolves.toEqual([0.1, 0.2]);
    const queryRequest = JSON.parse(
      (fetchMock.mock.calls[1]?.[1] as RequestInit).body as string,
    ) as { input_type: string };
    expect(queryRequest.input_type).toBe("query");
  });

  it("retries rate limits and rejects malformed provider responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ embedding: [0.1, 0.2], index: 0 }] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ embedding: [0.1], index: 0 }] }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new VoyageEmbeddingProvider(config());

    await expect(provider.embedQuery("retry me")).resolves.toEqual([0.1, 0.2]);
    await expect(provider.embedQuery("bad response")).rejects.toMatchObject({
      code: "INVALID_EMBEDDING_RESPONSE",
    } satisfies Partial<EmbeddingProviderError>);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

function config(): ConfigService {
  return new ConfigService({
    EMBEDDING_API_KEY: "test-key",
    EMBEDDING_BATCH_SIZE: 64,
    EMBEDDING_DIMENSIONS: 2,
    EMBEDDING_MAX_RETRIES: 1,
    EMBEDDING_MODEL: "voyage-4-lite",
    EMBEDDING_RETRY_BASE_DELAY_MS: 1,
    EMBEDDING_REQUEST_TIMEOUT_MS: 5_000,
  });
}
