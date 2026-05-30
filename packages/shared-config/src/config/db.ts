export type PgConfig = {
  connectionString: string;
};

export type MongoConfig = {
  uri: string;
};

export function getPgConfig(connectionString?: string): PgConfig {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  return { connectionString };
}

export function getMongoConfig(uri?: string): MongoConfig {
  if (!uri) {
    throw new Error("MONGO_URL is required");
  }
  return { uri };
}
