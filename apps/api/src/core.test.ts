import { describe, expect, it } from 'vitest';
import { validateEnvironment, durationToSeconds } from './config';
import { canTransition } from './cases.service';
import {
  authorityScore,
  buildResearchQuery,
  researchCacheKey,
} from './research.service';
import { validateFile } from './documents.service';

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
