import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const EnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    WEB_URL: z.string().url().default('http://localhost:3000'),
    NEXT_PUBLIC_API_URL: z
      .string()
      .url()
      .default('http://localhost:4000/api/v1'),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB_NAME: z.string().min(1).default('recourse'),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z
      .string()
      .regex(/^\d+[smhd]$/)
      .default('15m'),
    JWT_REFRESH_TTL: z
      .string()
      .regex(/^\d+[smhd]$/)
      .default('30d'),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default('gemini-3.7-flash'),
    TAVILY_API_KEY: z.string().optional(),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).default(15),
    LIVE_PROVIDER_TESTS: booleanString,
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'test') return;
    for (const name of [
      'GEMINI_API_KEY',
      'TAVILY_API_KEY',
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ] as const) {
      if (!value[name]) {
        context.addIssue({
          code: 'custom',
          message: `${name} is required outside tests`,
          path: [name],
        });
      }
    }
  });

export type EnvironmentValues = z.infer<typeof EnvironmentSchema>;

export class Environment implements EnvironmentValues {
  NODE_ENV!: EnvironmentValues['NODE_ENV'];
  PORT!: number;
  WEB_URL!: string;
  NEXT_PUBLIC_API_URL!: string;
  MONGODB_URI!: string;
  MONGODB_DB_NAME!: string;
  JWT_ACCESS_SECRET!: string;
  JWT_REFRESH_SECRET!: string;
  JWT_ACCESS_TTL!: string;
  JWT_REFRESH_TTL!: string;
  GEMINI_API_KEY?: string;
  GEMINI_API_KEYS!: string[];
  GEMINI_MODEL!: string;
  TAVILY_API_KEY?: string;
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  MAX_UPLOAD_MB!: number;
  LIVE_PROVIDER_TESTS!: boolean;

  constructor(input: Record<string, unknown> = process.env) {
    Object.assign(this, validateEnvironment(input));
    this.GEMINI_API_KEYS = collectGeminiApiKeys(input);
  }
}

export function collectGeminiApiKeys(input: Record<string, unknown>): string[] {
  const candidates: Array<{ order: number; value: string }> = [];

  for (const [name, rawValue] of Object.entries(input)) {
    const match = /^GEMINI_API_KEY(?:_(\d+))?$/.exec(name);
    if (!match || typeof rawValue !== 'string') continue;
    const value = rawValue.trim();
    if (!value) continue;

    const order = match[1] ? Number.parseInt(match[1], 10) : 1;
    if (!Number.isSafeInteger(order) || order < 1) continue;
    candidates.push({ order, value });
  }

  candidates.sort((left, right) => left.order - right.order);
  return [...new Set(candidates.map(({ value }) => value))];
}

export function validateEnvironment(
  input: Record<string, unknown>,
): EnvironmentValues {
  const result = EnvironmentSchema.safeParse(input);
  if (result.success) return result.data;
  const names = [
    ...new Set(
      result.error.issues.map((issue) =>
        String(issue.path[0] ?? 'environment'),
      ),
    ),
  ];
  throw new Error(`Invalid environment variables: ${names.join(', ')}`);
}

export function durationToSeconds(value: string): number {
  const amount = Number.parseInt(value.slice(0, -1), 10);
  const unit = value.at(-1);
  const multiplier =
    unit === 'd' ? 86_400 : unit === 'h' ? 3_600 : unit === 'm' ? 60 : 1;
  return amount * multiplier;
}
