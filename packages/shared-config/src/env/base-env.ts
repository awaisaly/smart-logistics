import { z } from "zod";

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  INTERNAL_SERVICE_SECRET: z.string().min(1)
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

export function parseBaseEnv(env: NodeJS.ProcessEnv): BaseEnv {
  return baseEnvSchema.parse(env);
}
