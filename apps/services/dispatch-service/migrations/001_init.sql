CREATE TABLE IF NOT EXISTS dispatch_jobs (
  id UUID PRIMARY KEY,
  shipment_id UUID NOT NULL,
  workflow_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
