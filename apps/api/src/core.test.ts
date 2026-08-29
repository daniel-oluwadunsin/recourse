import { describe, expect, it } from 'vitest';
import {
  collectGeminiApiKeys,
  validateEnvironment,
  durationToSeconds,
} from './config';
import { canTransition } from './cases.service';
import {
  authorityScore,
  buildResearchQuery,
  researchCacheKey,
} from './research.service';
import { validateFile } from './documents.service';
import {
  classifyGeminiCapacityError,
  GeminiKeyPool,
  mapGeminiError,
  toGeminiJsonSchema,
} from './gemini.service';
import { CaseAnalysisSchema, EvidenceExtractionSchema } from '@recourse/shared';

const baseEnvironment = {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017',
  MONGODB_DB_NAME: 'recourse_test',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('environment', () => {
  it('parses defaults without exposing values in failures', () => {
    const environment = validateEnvironment(baseEnvironment);
    expect(environment.PORT).toBe(4000);
    expect(environment.GEMINI_MODEL).toBe('gemini-3.7-flash');
    expect(() =>
      validateEnvironment({ ...baseEnvironment, JWT_ACCESS_SECRET: 'short' }),
    ).toThrow('Invalid environment variables: JWT_ACCESS_SECRET');
  });

  it('parses token durations', () => {
    expect(durationToSeconds('15m')).toBe(900);
    expect(durationToSeconds('30d')).toBe(2_592_000);
  });

  it('collects numbered Gemini credentials in order and removes duplicates', () => {
    expect(
      collectGeminiApiKeys({
        GEMINI_API_KEY_10: 'third',
        GEMINI_API_KEY_2: 'second',
        GEMINI_API_KEY: 'primary',
        GEMINI_API_KEY_3: 'second',
        GEMINI_API_KEY_4: '',
      }),
    ).toEqual(['primary', 'second', 'third']);
  });
});

describe('Gemini credential failover', () => {
  it('rotates across any number of credentials only for rate limits', async () => {
    const calls: string[] = [];
    const pool = new GeminiKeyPool(['primary', 'second', 'third']);
    const result = await pool.execute(async (client) => {
      calls.push(client);
      if (client !== 'third') {
        throw { status: 429, message: 'RESOURCE_EXHAUSTED' };
      }
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(calls).toEqual(['primary', 'second', 'third']);
  });

  it('does not rotate for non-quota provider errors', async () => {
    const calls: string[] = [];
    const pool = new GeminiKeyPool(['primary', 'second']);

    await expect(
      pool.execute(async (client) => {
        calls.push(client);
        throw { status: 503, message: 'temporarily unavailable' };
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(calls).toEqual(['primary']);
  });

  it('waits once for the earliest credential cooldown and resumes automatically', async () => {
    let currentTime = 1_000;
    const waits: number[] = [];
    let attempts = 0;
    const pool = new GeminiKeyPool(
      ['primary'],
      () => undefined,
      () => currentTime,
      async (milliseconds) => {
        waits.push(milliseconds);
        currentTime += milliseconds;
      },
    );

    const result = await pool.execute(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw { status: 429, message: 'Please retry in 2s' };
      }
      return 'resumed';
    });

    expect(result).toBe('resumed');
    expect(attempts).toBe(2);
    expect(waits).toEqual([2_100]);
  });

  it('never waits more than once during one provider operation', async () => {
    let currentTime = 1_000;
    let waits = 0;
    const pool = new GeminiKeyPool(
      ['primary'],
      () => undefined,
      () => currentTime,
      async (milliseconds) => {
        waits += 1;
        currentTime += milliseconds;
      },
    );

    await expect(
      pool.execute(async () => {
        throw { status: 429, message: 'Please retry in 1s' };
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(waits).toBe(1);
  });

  it('recognizes quota and rate-limit error shapes from the Gemini SDK', () => {
    expect(classifyGeminiCapacityError({ status: 429 })).toMatchObject({
      kind: 'rate_limit',
      status: 429,
    });
    expect(classifyGeminiCapacityError({ statusCode: '429' })).toMatchObject({
      kind: 'rate_limit',
      status: 429,
    });
    expect(
      classifyGeminiCapacityError({
        statusCode: 429,
        error: { code: 'rate_limit_exceeded', message: 'Please retry in 2s' },
      }),
    ).toMatchObject({
      kind: 'rate_limit',
      status: 429,
      code: 'rate_limit_exceeded',
      retryAfterMs: 2_000,
    });
    expect(
      classifyGeminiCapacityError({
        message:
          'Quota exceeded for metric: generate_content_free_tier_requests',
      }),
    ).toMatchObject({ kind: 'quota' });
    expect(
      classifyGeminiCapacityError({
        message: 'The current quota is exhausted.',
      }),
    ).toMatchObject({ kind: 'quota' });
    expect(
      classifyGeminiCapacityError({
        body: JSON.stringify({
          error: { code: 'rate_limit_exceeded', message: 'Try again later' },
        }),
      }),
    ).toMatchObject({ kind: 'rate_limit', code: 'rate_limit_exceeded' });
    expect(
      classifyGeminiCapacityError({ message: 'RESOURCE_EXHAUSTED' }),
    ).toMatchObject({ kind: 'quota' });
  });

  it('falls back when a credential reaches a project quota', async () => {
    const calls: string[] = [];
    const capacityEvents: number[] = [];
    const pool = new GeminiKeyPool(['project-a', 'project-b'], (index) =>
      capacityEvents.push(index),
    );

    const result = await pool.execute(async (client) => {
      calls.push(client);
      if (client === 'project-a') {
        throw {
          message:
            'Quota exceeded for metric: generate_content_free_tier_requests',
        };
      }
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(calls).toEqual(['project-a', 'project-b']);
    expect(capacityEvents).toEqual([0]);
  });

  it('returns the last capacity error after every credential is exhausted', async () => {
    const pool = new GeminiKeyPool(
      ['project-a', 'project-b'],
      () => undefined,
      Date.now,
      async () => undefined,
      0,
    );
    const quotaError = {
      statusCode: 429,
      error: { code: 'rate_limit_exceeded' },
    };

    await expect(
      pool.execute(async () => {
        throw quotaError;
      }),
    ).rejects.toBe(quotaError);
    expect(mapGeminiError(quotaError)).toMatchObject({
      code: 'AI_QUOTA_REACHED',
      status: 429,
      retryable: true,
    });
  });

  it.each([400, 401, 403, 503])(
    'does not fall back for unrelated provider status %s',
    async (status) => {
      const calls: string[] = [];
      const pool = new GeminiKeyPool(['primary', 'secondary']);

      await expect(
        pool.execute(async (client) => {
          calls.push(client);
          throw { status };
        }),
      ).rejects.toMatchObject({ status });
      expect(calls).toEqual(['primary']);
    },
  );

  it('does not wait again for project quota exhaustion', async () => {
    let waits = 0;
    const pool = new GeminiKeyPool(
      ['project-a'],
      () => undefined,
      Date.now,
      async () => {
        waits += 1;
      },
    );

    await expect(
      pool.execute(async () => {
        throw { message: 'You exceeded your current quota.' };
      }),
    ).rejects.toMatchObject({ message: 'You exceeded your current quota.' });
    expect(waits).toBe(0);
  });

  it('bounds retry delays and only waits once for rate limits', async () => {
    expect(
      classifyGeminiCapacityError({
        status: 429,
        message: 'Please retry in 999999999s',
      }),
    ).toMatchObject({ retryAfterMs: 86_400_000 });

    let waits = 0;
    const pool = new GeminiKeyPool(
      ['primary'],
      () => undefined,
      () => 1_000,
      async () => {
        waits += 1;
      },
      0,
    );
    await expect(
      pool.execute(async () => {
        throw { status: 429, message: 'Please retry in 999999999s' };
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(waits).toBe(0);
  });
});

describe('case state transitions', () => {
  it('allows the intended user-controlled lifecycle', () => {
    expect(canTransition('NEW', 'ANALYZING')).toBe(true);
    expect(canTransition('READY', 'AWAITING_SUBMISSION')).toBe(true);
    expect(canTransition('AWAITING_SUBMISSION', 'AWAITING_RESPONSE')).toBe(
      true,
    );
    expect(canTransition('AWAITING_RESPONSE', 'CONTINUING')).toBe(true);
  });

  it('blocks invalid leaps and changes after closure', () => {
    expect(canTransition('NEW', 'AWAITING_RESPONSE')).toBe(false);
    expect(canTransition('CLOSED', 'READY')).toBe(false);
  });
});

describe('generic research planning', () => {
  const understanding = {
    institution: 'Northfield Council',
    decision: 'permit refused',
    statedReason: 'late evidence',
    referenceNumber: null,
    decisionDate: null,
    jurisdiction: 'Westborough',
    amountAffected: null,
    currency: null,
    summary: 'A permit was refused.',
    desiredOutcome: 'review',
    criticalUnknowns: [],
    highStakes: false,
    highStakesReason: null,
  };

  it('builds stable, domain-agnostic queries and cache keys', () => {
    expect(buildResearchQuery(understanding)).toContain(
      'Northfield Council permit refused',
    );
    expect(researchCacheKey(understanding)).toBe(
      researchCacheKey({ ...understanding }),
    );
    expect(
      researchCacheKey({ ...understanding, jurisdiction: 'Elsewhere' }),
    ).not.toBe(researchCacheKey(understanding));
  });

  it('ranks authoritative and institution-specific sources above forums', () => {
    const official = authorityScore(
      'https://northfield.gov/review',
      'Permit review',
      'appeal deadline',
      understanding,
    );
    const forum = authorityScore(
      'https://reddit.com/r/help',
      'Permit thread',
      'appeal deadline',
      understanding,
    );
    expect(official).toBeGreaterThan(forum);
  });
});

describe('document validation', () => {
  it('accepts real plain text and rejects an extension mismatch', async () => {
    const bytes = Buffer.from(
      'Synthetic evidence with no personal information.',
    );
    await expect(
      validateFile(
        {
          originalname: 'evidence.txt',
          mimetype: 'text/plain',
          size: bytes.length,
          buffer: bytes,
        },
        15,
      ),
    ).resolves.toBe('text/plain');
    await expect(
      validateFile(
        {
          originalname: 'evidence.pdf',
          mimetype: 'text/plain',
          size: bytes.length,
          buffer: bytes,
        },
        15,
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' });
  });

  it('enforces the configured size cap', async () => {
    const bytes = Buffer.alloc(2 * 1024 * 1024, 65);
    await expect(
      validateFile(
        {
          originalname: 'large.txt',
          mimetype: 'text/plain',
          size: bytes.length,
          buffer: bytes,
        },
        1,
      ),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });
});

describe('provider schema bounds', () => {
  it('keeps evidence fact extraction within Gemini structured-output limits', () => {
    const facts = Array.from({ length: 21 }, (_, index) => ({
      statement: `Fact ${index + 1}`,
      source: 'VERIFIED_DOCUMENT' as const,
      date: null,
      confidence: 'high' as const,
    }));
    expect(
      EvidenceExtractionSchema.safeParse({
        summary: 'Synthetic evidence',
        language: 'English',
        readable: true,
        unreadableReason: null,
        facts,
      }).success,
    ).toBe(false);
  });

  it('caps every nested Gemini array bound at twenty items', () => {
    const schema = toGeminiJsonSchema(CaseAnalysisSchema);
    const bounds = JSON.stringify(schema)
      .match(/"maxItems":\d+/g)
      ?.map((entry) => Number(entry.split(':')[1]));
    expect(bounds?.length).toBeGreaterThan(0);
    expect(bounds?.every((value) => value <= 20)).toBe(true);
  });
});
