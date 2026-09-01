import 'dotenv/config';
import { z } from 'zod';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  magmaBaseUrl: string;
  magmaToken: string;
  magmaTimeoutMs: number;
  corsAllowedOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMax: number;
  logDir: string;
  realProviderRequestsEnabled: boolean;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MAGMA_API_BASE_URL: z.url().default('https://magmadatahub.com/api.php'),
  MAGMA_API_TOKEN: z.string().min(1),
  MAGMA_API_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  CORS_ALLOWED_ORIGINS: z.string().min(1),
  PIX_VERIFY_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  PIX_VERIFY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  LOG_DIR: z.string().min(1).default('./logs'),
  MAGMA_REAL_REQUESTS_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
});

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(environment);
  const origins = parsed.CORS_ALLOWED_ORIGINS
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.includes('*')) {
    throw new Error('CORS_ALLOWED_ORIGINS não aceita wildcard.');
  }

  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Origin inválida em CORS_ALLOWED_ORIGINS: ${origin}`);
    }
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    magmaBaseUrl: parsed.MAGMA_API_BASE_URL,
    magmaToken: parsed.MAGMA_API_TOKEN,
    magmaTimeoutMs: parsed.MAGMA_API_TIMEOUT_MS,
    corsAllowedOrigins: origins,
    rateLimitWindowMs: parsed.PIX_VERIFY_RATE_LIMIT_WINDOW_MS,
    rateLimitMax: parsed.PIX_VERIFY_RATE_LIMIT_MAX,
    logDir: parsed.LOG_DIR,
    realProviderRequestsEnabled: parsed.MAGMA_REAL_REQUESTS_ENABLED,
  };
}
