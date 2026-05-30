CREATE TABLE IF NOT EXISTS logistics_events (
  time TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  shipment_id TEXT,
  payload_json JSONB
);
