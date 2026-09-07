import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  MONGODB_URI: z.string().min(1),
  DRISHTI_API_KEY: z.string().min(1),
  DRISHTI_BASE_URL: z.url().default("https://developers.manasija.in"),
  DRISHTI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  API_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3_600).default(60),
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(60),
  INGESTION_LOOKBACK_MINUTES: z.coerce.number().int().min(1).max(1_440).default(15),
  INGESTION_PAGE_SIZE: z.coerce.number().int().min(1).max(100).default(50),
  INGESTION_MAX_PAGES: z.coerce.number().int().min(1).max(1_000).default(100),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(environment);
}
