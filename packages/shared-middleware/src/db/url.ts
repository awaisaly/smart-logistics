// Builds a Postgres connection string from the conventional POSTGRES_* env vars,
// preferring an explicit URL env var when present. Centralizes the per-service
// connection logic that used to be duplicated inline in every service.
export function databaseUrl(params: {
  database: string;
  defaultPort: number;
  urlEnvVar?: string;
  portEnvVar?: string;
}): string {
  const { database, defaultPort, urlEnvVar = "DATABASE_URL", portEnvVar = "POSTGRES_PORT" } = params;
  const explicit = process.env[urlEnvVar];
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  const user = process.env.POSTGRES_USER ?? "smartlogistics";
  const password = process.env.POSTGRES_PASSWORD ?? "smartlogistics";
  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env[portEnvVar] ?? String(defaultPort);
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}
