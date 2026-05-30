CREATE TABLE IF NOT EXISTS couriers (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courier_assignments (
  id UUID PRIMARY KEY,
  shipment_id UUID NOT NULL,
  courier_id UUID NOT NULL,
  status TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
