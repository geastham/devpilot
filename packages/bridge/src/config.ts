import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('8080'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().optional(),
  GCP_PROJECT_ID: z.string().optional(),
  PUBSUB_TOPIC_DISPATCH: z.string().default('devpilot-task-dispatch'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadConfig(): EnvConfig {
  return envSchema.parse(process.env);
}
