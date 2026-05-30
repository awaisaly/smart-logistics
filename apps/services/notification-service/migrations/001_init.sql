CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY,
  event_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
