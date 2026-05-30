export const DISPATCH_STEPS = [
  "assign_courier",
  "pickup_at_warehouse",
  "in_transit",
  "last_mile",
  "deliver",
  "request_signature",
  "close",
  "compensate",
] as const;

export const MAP_CITIES: Record<string, { x: number; y: number; label: string }> = {
  Karachi: { x: 27, y: 78, label: "Karachi" },
  Lahore: { x: 62, y: 42, label: "Lahore" },
  Islamabad: { x: 52, y: 26, label: "Islamabad" },
  Multan: { x: 48, y: 54, label: "Multan" },
  Faisalabad: { x: 56, y: 46, label: "Faisalabad" },
  Peshawar: { x: 34, y: 16, label: "Peshawar" },
  Rawalpindi: { x: 50, y: 30, label: "Rawalpindi" },
  Hyderabad: { x: 30, y: 70, label: "Hyderabad" },
  Quetta: { x: 22, y: 48, label: "Quetta" },
  Gujranwala: { x: 58, y: 38, label: "Gujranwala" },
};

export type ShipmentRow = {
  id?: string;
  from?: string;
  to?: string;
  status?: string;
  priority?: string;
  courier?: string;
  warehouse?: string;
  eta?: string;
  sla?: string;
  customer?: string;
  weight?: string;
  value?: string;
  placed?: string;
  risk?: number;
  items?: number;
};

export type ShipmentTimelineRow = { t?: string; label?: string; desc?: string; done?: boolean; active?: boolean };
export type ShipmentAuditRow = { t?: string; actor?: string; action?: string; reason?: string };

export type WarehouseRow = {
  id?: string;
  name?: string;
  city?: string;
  lanes?: number;
  occupancy?: number;
  inbound?: number;
  outbound?: number;
  stock?: number;
  throughput?: number;
};

export type CourierRow = {
  id?: string;
  name?: string;
  city?: string;
  zone?: string;
  status?: string;
  load?: number;
  capacity?: number;
  rating?: number;
  shipments?: number;
};

export type WorkflowRow = {
  id?: string;
  shipment?: string;
  type?: string;
  status?: string;
  step?: string;
  started?: string;
  duration?: string;
  retries?: number;
  error?: string;
};

export type FailureModeRow = { kind?: string; count?: number; trend?: string; samples?: string[] };
export type DispatchKpis = { running?: number; failing?: number; completed?: number; avgDurationSeconds?: number };

export type ExceptionRow = { id?: string; shipment?: string; kind?: string; severity?: string; age?: string; owner?: string };
export type ReturnRow = { id?: string; shipment?: string; reason?: string; initiated?: string; stage?: string; customer?: string; refund?: string };
export type TaxonomyRow = { kind?: string; n?: number; pct?: number; tone?: string };

export type AiChatMsg = { role: "user" | "assistant"; text: string; grounded?: string[]; tools?: string[]; latency?: string; streamed?: boolean };
