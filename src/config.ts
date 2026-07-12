import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(2785),
  PUBLIC_URL: z.string().url().default('http://localhost:2785'),
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
  GROUP_PARTICIPANT_BATCH_MAX: z.coerce.number().int().positive().max(1000).default(100)
});

export const config = schema.parse(process.env);
export type AppConfig = typeof config;
