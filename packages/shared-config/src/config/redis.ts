export type RedisConfig = {
  url: string;
};

export function getRedisConfig(env: NodeJS.ProcessEnv): RedisConfig {
  return {
    url: env.REDIS_URL ?? "redis://redis:6379"
  };
}
