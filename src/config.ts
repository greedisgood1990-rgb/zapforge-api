import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(9467),
  PUBLIC_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().default('*'),
  API_KEY: z.string().min(8).default('change-this-super-secret-key'),
  REQUIRE_API_KEY: z.coerce.boolean().default(true),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  WEBHOOK_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(240),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  DATA_DIR: z.string().default('./data'),
  SESSION_DIR: z.string().default('./data/sessions'),
  STORE_FILE: z.string().default('./data/store.json'),
  MEDIA_DIR: z.string().default('./data/media'),
  DEFAULT_ENGINE: z.enum(['baileys']).default('baileys'),
  APP_BROWSER_NAME: z.string().default('ZapForge'),
  RESPONSIBLE_MODE: z.coerce.boolean().default(true),
  MAX_MESSAGES_PER_MINUTE_PER_SESSION: z.coerce.number().int().positive().default(60),
  GROUP_MENTION_MAX_PARTICIPANTS: z.coerce.number().int().positive().max(4096).default(1024),
  GROUP_PARTICIPANT_BATCH_MAX: z.coerce.number().int().positive().max(1000).default(100),
  PAIRING_CODE_COOLDOWN_MS: z.coerce.number().int().min(15_000).max(600_000).default(60_000),
  PAIRING_CODE_WINDOW_MS: z.coerce.number().int().min(60_000).max(3_600_000).default(600_000),
  PAIRING_CODE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  PAIRING_CODE_LOCKOUT_MS: z.coerce.number().int().min(60_000).max(3_600_000).default(600_000),
  PAIRING_CODE_STABILIZATION_MS: z.coerce.number().int().min(0).max(30_000).default(3_000),
  PAIRING_CODE_TTL_MS: z.coerce.number().int().min(60_000).max(600_000).default(180_000),
  RECONNECT_BASE_DELAY_MS: z.coerce.number().int().min(1_000).max(60_000).default(5_000),
  RECONNECT_MAX_DELAY_MS: z.coerce.number().int().min(5_000).max(600_000).default(120_000),
  RECONNECT_MAX_ATTEMPTS: z.coerce.number().int().min(0).max(20).default(6),
  RECONNECT_JITTER_MS: z.coerce.number().int().min(0).max(30_000).default(3_000),
  INTERACTIVE_MESSAGE_FALLBACK: z.coerce.boolean().default(true),
  INTERACTIVE_MAX_BUTTONS: z.coerce.number().int().min(1).max(10).default(3)
});

const parsed = schema.parse(process.env);

export const config = {
  ...parsed,
  PUBLIC_URL: parsed.PUBLIC_URL ?? `http://localhost:${parsed.PORT}`
};

export type AppConfig = typeof config;
