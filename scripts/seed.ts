/* eslint-disable no-console */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { MongoClient } from "mongodb";

// ────────────────────────────────────────────────────────────────────────────
// Configuration

const PG_USER = process.env.POSTGRES_USER ?? "smartlogistics";
const PG_PASS = process.env.POSTGRES_PASSWORD ?? "smartlogistics";
const PG_HOST = process.env.POSTGRES_HOST ?? "localhost";

const SERVICE_PORTS = {
  user: 5441,
  shipment: 5433,
  warehouse: 5434,
  courier: 5435,
  dispatch: 5436,
  notification: 5437,
  ai: 5438,
  analytics: 5439,
} as const;

const MONGO_URL =
  process.env.MONGO_URL ??
  `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME ?? "smartlogistics"}:${process.env.MONGO_INITDB_ROOT_PASSWORD ?? "smartlogistics"}@${process.env.MONGO_HOST ?? "localhost"}:${process.env.MONGO_PORT ?? "27018"}`;

const TRACKING_DB = process.env.TRACKING_MONGO_DB ?? "tracking_service";

function pgPoolFor(db: keyof typeof SERVICE_PORTS): Pool {
  const port = SERVICE_PORTS[db];
  return new Pool({
    connectionString: `postgresql://${PG_USER}:${PG_PASS}@${PG_HOST}:${port}/${db}_service`,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Random helpers — no hardcoded entity blobs, only domain vocabularies

const FIRST_NAMES = [
  "Ahmed", "Ali", "Hassan", "Bilal", "Usman", "Imran", "Faisal", "Hamza", "Yasir", "Tariq",
  "Sara", "Ayesha", "Fatima", "Hira", "Nadia", "Maria", "Sana", "Mahnoor", "Zainab", "Iqra",
  "Awais", "Hassaan", "Saad", "Rehan", "Salman", "Nabeel", "Adil", "Kashan", "Asad", "Junaid",
  "Areeba", "Mehwish", "Sadia", "Anum", "Saima", "Komal", "Anza", "Mahum", "Rabia", "Tooba",
];
const LAST_NAMES = [
  "Khan", "Ali", "Hussain", "Ahmed", "Sheikh", "Malik", "Qureshi", "Siddiqui", "Raza", "Iqbal",
  "Chaudhry", "Butt", "Awan", "Mirza", "Ansari", "Hashmi", "Ranjha", "Bhatti", "Lodhi", "Tariq",
];
const CITIES = [
  { code: "KHI", name: "Karachi", region: "Sindh" },
  { code: "LHE", name: "Lahore", region: "Punjab" },
  { code: "ISB", name: "Islamabad", region: "ICT" },
  { code: "RWP", name: "Rawalpindi", region: "Punjab" },
  { code: "FSD", name: "Faisalabad", region: "Punjab" },
  { code: "MUL", name: "Multan", region: "Punjab" },
  { code: "PEW", name: "Peshawar", region: "KP" },
  { code: "HYD", name: "Hyderabad", region: "Sindh" },
  { code: "GUJ", name: "Gujranwala", region: "Punjab" },
  { code: "UET", name: "Quetta", region: "Balochistan" },
];
const SHIPMENT_PRIORITIES = ["standard", "express", "same-day", "freight"] as const;
const SHIPMENT_STATUSES = ["created", "picked", "in_transit", "out_for_delivery", "delivered", "failed", "returned"] as const;
const COURIER_STATUSES = ["available", "active", "on_route", "off", "exception"] as const;
const COURIER_ZONES = ["Saddar", "Gulshan", "Clifton", "DHA", "Gulberg", "F-7", "F-10", "Cantonment", "Johar Town", "Bahria"];
const RETURN_REASONS = [
  "Damaged in transit",
  "Customer refused",
  "Wrong item shipped",
  "Late delivery",
  "Address unreachable",
  "Quality concerns",
  "Duplicate order",
];
const RETURN_STAGES = ["requested", "approved", "in_transit", "received", "refunded", "rejected"] as const;
const EXCEPTION_KINDS = [
  "address_unreachable",
  "stockout",
  "courier_no_show",
  "damaged_in_transit",
  "customs_hold",
  "weather_delay",
  "traffic_jam",
];
const EXCEPTION_SEVERITIES = ["low", "medium", "high"] as const;
const SKUS = [
  { sku: "ELE-PHN", name: "Smartphone — flagship" },
  { sku: "ELE-LAP", name: "Laptop — 14\" pro" },
  { sku: "HOM-FAN", name: "Pedestal fan 22\"" },
  { sku: "HOM-RFG", name: "Refrigerator — 350L" },
  { sku: "GRO-RIC", name: "Basmati rice 5kg" },
  { sku: "GRO-OIL", name: "Cooking oil 5L" },
  { sku: "APP-MEN", name: "Men's kurta — large" },
  { sku: "APP-LDY", name: "Lawn 3-piece — printed" },
  { sku: "BTY-PFM", name: "Perfume 50ml" },
  { sku: "BTY-LIP", name: "Lipstick — matte" },
  { sku: "TOY-LEG", name: "Building blocks set" },
  { sku: "STN-NTB", name: "Notebook A5 200pg" },
  { sku: "AUT-OIL", name: "Engine oil 4L" },
  { sku: "AUT-FLT", name: "Air filter — universal" },
];
const WORKFLOW_TYPES = ["DispatchWorkflow", "DeliveryWorkflow", "ReturnWorkflow", "ReassignWorkflow"] as const;
const WORKFLOW_STATUSES = ["running", "completed", "failing", "compensating", "scheduled"] as const;
const WORKFLOW_STEPS = [
  "assign_courier",
  "pickup_at_warehouse",
  "in_transit",
  "last_mile",
  "deliver",
  "request_signature",
  "close",
  "compensate",
];
const FAILURE_KINDS = [
  "courier_timeout",
  "address_invalid",
  "warehouse_stockout",
  "payment_decline",
  "geo_lookup_fail",
  "courier_capacity",
];
const EVENT_TOPICS = [
  "shipments.created",
  "shipments.dispatched",
  "shipments.delivered",
  "tracking.milestone.updated",
  "courier.assignment.updated",
  "warehouse.inventory.adjusted",
  "returns.requested",
];
const CONSUMER_GROUPS = ["dispatch-consumer", "analytics-consumer", "notification-consumer", "tracking-indexer"];
const CELERY_QUEUES = ["emails", "webhooks", "embeddings", "reports"];
const NOTIFICATION_CHANNELS = ["email", "sms", "push", "webhook"] as const;
const NOTIFICATION_STATUSES = ["queued", "sent", "delivered", "failed", "retrying"] as const;
const AI_SUGGESTION_KINDS = ["anomaly", "delay", "reco"] as const;
const AI_TOOLS = [
  "retrieve_shipments",
  "retrieve_traffic",
  "retrieve_inventory",
  "predict_delay",
  "recommend_courier",
  "summarize_audit",
];
const AI_PROMPTS = [
  "Summarize today's exceptions",
  "Show shipments at risk of SLA breach",
  "Suggest courier rebalance for North zone",
  "Why did the Karachi route fail this morning?",
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals = 2): number {
  const v = Math.random() * (max - min) + min;
  return Number(v.toFixed(decimals));
}

function pickOne<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < Math.min(n, copy.length)) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0] as T);
  }
  return out;
}

function uniqueId(prefix: string, n: number): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 2 + n).toUpperCase()}`;
}

function isoMinutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

function ageLabel(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function timeOfDay(): string {
  const d = new Date(Date.now() - randInt(0, 90) * 60_000);
  return d.toLocaleTimeString("en-PK", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Random timestamp distributed across the last `maxDaysAgo` days. Used to spread
// seeded records over time so date-range filtering is meaningful.
function randomCreatedAt(maxDaysAgo = 90): Date {
  return new Date(Date.now() - randInt(0, maxDaysAgo * 24 * 60) * 60_000);
}

function minutesSince(d: Date): number {
  return Math.max(1, Math.floor((Date.now() - d.getTime()) / 60_000));
}

// Human-readable "Nx ago" label derived from an absolute timestamp.
function agoLabelFrom(d: Date): string {
  return ageLabel(minutesSince(d)) + " ago";
}

// A timestamp uniformly between `start` and now (for child rows that must occur
// after their parent record's creation).
function betweenNow(start: Date): Date {
  const lo = start.getTime();
  const hi = Date.now();
  if (hi <= lo) return new Date(lo);
  return new Date(randInt(lo, hi));
}

function minutesSinceLocalMidnight(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return Math.max(1, Math.floor((now.getTime() - midnight.getTime()) / 60_000));
}

// A timestamp somewhere earlier today (since local midnight). Used for "current"
// roster/live entities so they always appear in the default Today view.
function todayCreatedAt(): Date {
  return new Date(Date.now() - randInt(0, minutesSinceLocalMidnight()) * 60_000);
}

// Recent-biased timestamp: with probability `todayPct` it lands within today,
// otherwise it spreads across the last `spreadDays`. Keeps live feeds (events,
// workflows, DLQ) populated for Today while still expanding with wider ranges.
function recentBiasedCreatedAt(todayPct = 0.4, spreadDays = 7): Date {
  if (Math.random() < todayPct) return todayCreatedAt();
  return new Date(Date.now() - randInt(0, spreadDays * 24 * 60) * 60_000);
}

// Layered distribution for shipments so counts grow with the selected range:
// ~12% today, ~18% within the last 7 days, the remainder spread across 90 days.
function shipmentCreatedAt(i: number, count: number): Date {
  const r = i / Math.max(count, 1);
  if (r < 0.12) return todayCreatedAt();
  if (r < 0.30) return new Date(Date.now() - randInt(0, 7 * 24 * 60) * 60_000);
  return randomCreatedAt(90);
}

function fullName(): string {
  return `${pickOne(FIRST_NAMES)} ${pickOne(LAST_NAMES)}`;
}

function emailFromName(name: string, suffix: string | number): string {
  const slug = name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z.]/g, "");
  return `${slug}.${String(suffix).toLowerCase()}@smartlogistics.example`;
}

// ────────────────────────────────────────────────────────────────────────────
// Ensure schemas (mirrors what each service's ensureSchema creates)

async function ensureSchemas(): Promise<void> {
  console.log("→ Ensuring schemas across services");
  const userPool = pgPoolFor("user");
  const shipPool = pgPoolFor("shipment");
  const whPool = pgPoolFor("warehouse");
  const courPool = pgPoolFor("courier");
  const disPool = pgPoolFor("dispatch");
  const notPool = pgPoolFor("notification");
  const aiPool = pgPoolFor("ai");
  const anPool = pgPoolFor("analytics");

  await userPool.query(`
    CREATE TABLE IF NOT EXISTS users_v2 (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await shipPool.query(`
    CREATE TABLE IF NOT EXISTS shipment_records (
      id TEXT PRIMARY KEY,
      "from" TEXT NOT NULL,
      "to" TEXT NOT NULL,
      weight TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      courier TEXT NOT NULL,
      placed TEXT NOT NULL,
      eta TEXT NOT NULL,
      risk DOUBLE PRECISION NOT NULL DEFAULT 0,
      items INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS shipment_returns (
      id TEXT PRIMARY KEY,
      shipment TEXT NOT NULL,
      reason TEXT NOT NULL,
      initiated TEXT NOT NULL,
      stage TEXT NOT NULL,
      customer TEXT NOT NULL,
      refund TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS shipment_exceptions (
      id TEXT PRIMARY KEY,
      shipment TEXT NOT NULL,
      kind TEXT NOT NULL,
      severity TEXT NOT NULL,
      age TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS shipment_timelines (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL,
      t TEXT NOT NULL,
      label TEXT NOT NULL,
      descr TEXT NOT NULL,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS shipment_audits_v2 (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL,
      t TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await whPool.query(`
    CREATE TABLE IF NOT EXISTS warehouse_records (
      id TEXT PRIMARY KEY,
      city TEXT NOT NULL,
      name TEXT NOT NULL,
      util DOUBLE PRECISION NOT NULL DEFAULT 0,
      lanes INTEGER NOT NULL DEFAULT 0,
      inbound INTEGER NOT NULL DEFAULT 0,
      outbound INTEGER NOT NULL DEFAULT 0,
      throughput TEXT NOT NULL DEFAULT '0%',
      stock_low INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS warehouse_lane_occupancy (
      id TEXT PRIMARY KEY,
      warehouse_id TEXT NOT NULL,
      lane_index INTEGER NOT NULL,
      occupancy_pct INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS warehouse_stock_items (
      id TEXT PRIMARY KEY,
      warehouse_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      on_hand INTEGER NOT NULL DEFAULT 0,
      reserved INTEGER NOT NULL DEFAULT 0,
      threshold_value INTEGER NOT NULL DEFAULT 0,
      hot BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await courPool.query(`
    CREATE TABLE IF NOT EXISTS courier_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Karachi',
      zone TEXT NOT NULL DEFAULT 'Unassigned',
      status TEXT NOT NULL DEFAULT 'available',
      load INTEGER NOT NULL DEFAULT 0,
      capacity INTEGER NOT NULL DEFAULT 10,
      rating DOUBLE PRECISION NOT NULL DEFAULT 5,
      since TEXT NOT NULL DEFAULT '2026',
      attempts INTEGER NOT NULL DEFAULT 0,
      delivered INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await disPool.query(`
    CREATE TABLE IF NOT EXISTS dispatch_workflows (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      shipment TEXT NOT NULL,
      started TEXT NOT NULL,
      duration TEXT NOT NULL,
      status TEXT NOT NULL,
      step TEXT NOT NULL,
      retries INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS dispatch_failure_modes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      trend TEXT NOT NULL DEFAULT 'flat',
      samples JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await notPool.query(`
    CREATE TABLE IF NOT EXISTS notification_log_v2 (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await aiPool.query(`
    CREATE TABLE IF NOT EXISTS ai_sessions (
      id UUID PRIMARY KEY,
      user_id UUID,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ai_messages (
      id UUID PRIMARY KEY,
      session_id UUID NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ai_artifacts (
      kind TEXT PRIMARY KEY,
      payload JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await anPool.query(`
    CREATE TABLE IF NOT EXISTS analytics_snapshots (
      kind TEXT PRIMARY KEY,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await Promise.all([
    userPool.end(),
    shipPool.end(),
    whPool.end(),
    courPool.end(),
    disPool.end(),
    notPool.end(),
    aiPool.end(),
    anPool.end(),
  ]);
}

// ────────────────────────────────────────────────────────────────────────────
// Domain generators

interface SeedUser { id: string; email: string; role: string; name: string }

// Stable primary admin baked into the seed so the operations console always opens
// against a known user. Inserted LAST so `created_at DESC` picks him first.
const PRIMARY_ADMIN: SeedUser = {
  id: "00000000-0000-0000-0000-00000000a1a1",
  email: "awais.ali@smartlogistics.example",
  role: "admin",
  name: "Awais Ali"
};

function genUsers(adminCount = 2, supportCount = 3, warehouseCount = 6, courierCount = 18): SeedUser[] {
  const roles: Array<[string, number]> = [
    ["admin", adminCount],
    ["customer_support", supportCount],
    ["warehouse_operator", warehouseCount],
    ["courier", courierCount],
  ];
  const out: SeedUser[] = [];
  let counter = 0;
  for (const [role, n] of roles) {
    for (let i = 0; i < n; i += 1) {
      const name = fullName();
      counter += 1;
      out.push({ id: randomUUID(), email: emailFromName(name, `${role}${counter}`), role, name });
    }
  }
  // append last so PRIMARY_ADMIN's created_at is the most recent → first in /users
  out.push(PRIMARY_ADMIN);
  return out;
}

interface SeedWarehouse { id: string; city: string; region: string; name: string; util: number; lanes: number; inbound: number; outbound: number; throughput: string; stockLow: number; createdAt: Date }
function genWarehouses(): SeedWarehouse[] {
  return CITIES.slice(0, 8).map((city, i) => {
    const util = randFloat(0.55, 0.94);
    const lanes = randInt(12, 36);
    const inbound = randInt(180, 720);
    const outbound = randInt(160, 800);
    const throughputDelta = randInt(-9, 14);
    return {
      id: `${city.code}-W${i + 1}`,
      city: city.name,
      region: city.region,
      name: `${city.name} ${pickOne(["North", "South", "Central", "East", "West"])} Hub`,
      util,
      lanes,
      inbound,
      outbound,
      throughput: `${throughputDelta >= 0 ? "+" : ""}${throughputDelta}%`,
      stockLow: randInt(0, 6),
      // Warehouses are the current facility roster — keep them in the Today view.
      createdAt: todayCreatedAt(),
    };
  });
}

interface SeedCourier { id: string; userId: string; name: string; city: string; zone: string; status: string; load: number; capacity: number; rating: number; since: string; attempts: number; delivered: number; createdAt: Date }
function genCouriers(users: SeedUser[]): SeedCourier[] {
  const courierUsers = users.filter((u) => u.role === "courier");
  return courierUsers.map((u, i) => {
    const capacity = randInt(8, 16);
    const load = randInt(0, capacity);
    const delivered = randInt(40, 480);
    return {
      id: `C-${(4000 + i).toString()}`,
      userId: u.id,
      name: u.name,
      city: pickOne(CITIES).name,
      zone: pickOne(COURIER_ZONES),
      status: pickOne(COURIER_STATUSES),
      load,
      capacity,
      rating: randFloat(3.7, 4.9, 2),
      since: String(randInt(2021, 2025)),
      attempts: randInt(delivered, delivered + 60),
      delivered,
      // Couriers are the current fleet roster — keep them in the Today view.
      createdAt: todayCreatedAt(),
    };
  });
}

interface SeedShipment { id: string; from: string; to: string; weight: string; status: string; priority: string; courier: string; placed: string; eta: string; risk: number; items: number; createdAt: Date; transitMinutes: number }
function genShipments(warehouses: SeedWarehouse[], couriers: SeedCourier[], count: number): SeedShipment[] {
  return Array.from({ length: count }).map((_, i) => {
    const fromW = pickOne(warehouses);
    const toW = pickOne(warehouses.filter((w) => w.id !== fromW.id));
    const status = pickOne(SHIPMENT_STATUSES);
    const createdAt = shipmentCreatedAt(i, count);
    const etaInMin = randInt(30, 60 * 30);
    return {
      id: `SL-${randInt(2_300_000, 2_499_999)}`,
      from: fromW.id,
      to: toW.id,
      weight: `${randFloat(0.5, 24)}kg`,
      status,
      priority: pickOne(SHIPMENT_PRIORITIES),
      courier: pickOne(couriers).id,
      placed: agoLabelFrom(createdAt),
      eta: `in ${ageLabel(etaInMin)}`,
      risk: randFloat(0.02, 0.92),
      items: randInt(1, 6),
      createdAt,
      // Dispatch-to-delivery time (minutes); powers the analytics histogram.
      transitMinutes: randInt(30, 60 * 96),
    };
  });
}

interface SeedReturn { id: string; shipment: string; reason: string; initiated: string; stage: string; customer: string; refund: string; createdAt: Date }
function genReturns(shipments: SeedShipment[]): SeedReturn[] {
  const sample = pickN(shipments, Math.min(28, Math.floor(shipments.length * 0.08)));
  return sample.map((s) => {
    const createdAt = betweenNow(s.createdAt);
    return {
      id: `RMA-${randInt(800, 9999)}`,
      shipment: s.id,
      reason: pickOne(RETURN_REASONS),
      initiated: agoLabelFrom(createdAt),
      stage: pickOne(RETURN_STAGES),
      customer: fullName(),
      refund: `Rs ${randInt(450, 28_000).toLocaleString("en-PK")}`,
      createdAt,
    };
  });
}

interface SeedException { id: string; shipment: string; kind: string; severity: string; age: string; owner: string; createdAt: Date }
function genExceptions(shipments: SeedShipment[]): SeedException[] {
  const sample = pickN(shipments, Math.min(18, Math.floor(shipments.length * 0.05)));
  return sample.map((s) => {
    const createdAt = betweenNow(s.createdAt);
    return {
      id: `EX-${randInt(1000, 9999)}`,
      shipment: s.id,
      kind: pickOne(EXCEPTION_KINDS),
      severity: pickOne(EXCEPTION_SEVERITIES),
      age: ageLabel(minutesSince(createdAt)),
      owner: fullName(),
      createdAt,
    };
  });
}

interface SeedTimelineEntry { id: string; shipmentId: string; t: string; label: string; descr: string; done: boolean; active: boolean; createdAt: Date }
function genShipmentTimelines(shipments: SeedShipment[]): SeedTimelineEntry[] {
  const steps = ["Created", "Picked up", "In transit", "Out for delivery", "Delivered"];
  return shipments.flatMap((s) => {
    const status = String(s.status).toLowerCase();
    const doneIdx =
      status === "delivered" ? steps.length :
      status === "out_for_delivery" ? 4 :
      status === "in_transit" ? 3 :
      status === "picked" ? 2 :
      status === "failed" || status === "returned" ? 3 :
      status === "created" ? 1 :
      randInt(1, steps.length - 1);
    const span = Math.max(0, Date.now() - s.createdAt.getTime());
    return steps.map((label, i) => {
      const done = i < doneIdx;
      const active = !done && i === doneIdx;
      const frac = steps.length > 1 ? i / (steps.length - 1) : 0;
      const tDate = new Date(s.createdAt.getTime() + Math.floor(span * frac));
      return {
        id: randomUUID(),
        shipmentId: s.id,
        t: tDate.toISOString(),
        label,
        descr: `${label} at ${pickOne(CITIES).name}`,
        done,
        active,
        createdAt: tDate,
      };
    });
  });
}

interface SeedAuditRow { id: string; shipmentId: string; t: string; actor: string; action: string; reason: string; createdAt: Date }
function genShipmentAudits(shipments: SeedShipment[]): SeedAuditRow[] {
  return shipments.flatMap((s) =>
    Array.from({ length: randInt(3, 6) }).map(() => {
      const tDate = betweenNow(s.createdAt);
      return {
      id: randomUUID(),
      shipmentId: s.id,
      t: tDate.toISOString(),
      createdAt: tDate,
      actor: pickOne([
        "api:shipment-service",
        "ops:console",
        "system:temporal",
        `courier:${s.courier}`,
        "warehouse:scanner",
      ]),
      action: pickOne([
        "created",
        "status_changed",
        "courier_assigned",
        "exception_raised",
        "exception_resolved",
        "label_printed",
        "scan_inbound",
        "scan_outbound",
      ]),
      reason: pickOne([
        "initial_intake",
        "rule_eval",
        "manual_intervention",
        "auto_compensation",
        "scheduled_pickup",
        "address_corrected",
      ]),
      };
    })
  );
}

interface SeedLanes { id: string; warehouseId: string; laneIndex: number; occupancyPct: number }
function genLanes(warehouses: SeedWarehouse[]): SeedLanes[] {
  return warehouses.flatMap((w) =>
    Array.from({ length: w.lanes }).map((_, idx) => ({
      id: randomUUID(),
      warehouseId: w.id,
      laneIndex: idx,
      occupancyPct: randInt(20, 100),
    }))
  );
}

interface SeedStockItem { id: string; warehouseId: string; sku: string; name: string; on: number; reserved: number; threshold: number; hot: boolean }
function genStockItems(warehouses: SeedWarehouse[]): SeedStockItem[] {
  return warehouses.flatMap((w) =>
    pickN(SKUS, 8).map((s) => {
      const threshold = randInt(20, 80);
      const on = randInt(0, 400);
      return {
        id: randomUUID(),
        warehouseId: w.id,
        sku: s.sku,
        name: s.name,
        on,
        reserved: randInt(0, Math.max(0, Math.floor(on * 0.3))),
        threshold,
        hot: Math.random() < 0.2,
      };
    })
  );
}

interface SeedWorkflow { id: string; type: string; shipment: string; started: string; duration: string; status: string; step: string; retries: number; error: string | null; createdAt: Date }
function genWorkflows(shipments: SeedShipment[]): SeedWorkflow[] {
  return Array.from({ length: 28 }).map(() => {
    const status = pickOne(WORKFLOW_STATUSES);
    const failing = status === "failing" || status === "compensating";
    const ship = pickOne(shipments);
    // Workflows are recent operational runs; bias them toward today.
    const createdAt = recentBiasedCreatedAt(0.4, 7);
    return {
      id: `TPL-${pickOne(WORKFLOW_TYPES).slice(0, 4).toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`,
      type: pickOne(WORKFLOW_TYPES),
      shipment: ship.id,
      started: agoLabelFrom(createdAt),
      duration: `${randInt(8, 380)}s`,
      status,
      step: pickOne(WORKFLOW_STEPS),
      retries: failing ? randInt(1, 4) : 0,
      error: failing ? `${pickOne(FAILURE_KINDS)}: timeout after ${randInt(2, 9)} retries` : null,
      createdAt,
    };
  });
}

interface SeedFailureMode { id: string; kind: string; count: number; trend: string; samples: string[] }
function genFailureModes(workflows: SeedWorkflow[]): SeedFailureMode[] {
  return FAILURE_KINDS.map((k) => {
    const sampleWorkflows = workflows.filter((w) => w.status === "failing" || w.status === "compensating");
    return {
      id: randomUUID(),
      kind: k,
      count: randInt(2, 24),
      trend: pickOne(["up", "down", "flat"]),
      samples: pickN(sampleWorkflows.map((w) => w.id), Math.min(3, sampleWorkflows.length)),
    };
  });
}

interface SeedNotification { id: string; eventId: string; channel: string; recipient: string; status: string; createdAt: Date }
function genNotifications(shipments: SeedShipment[]): SeedNotification[] {
  return Array.from({ length: 80 }).map(() => ({
    id: randomUUID(),
    eventId: pickOne(shipments).id,
    channel: pickOne(NOTIFICATION_CHANNELS),
    recipient: `${pickOne(["+92301", "+92321", "+92345"])}${randInt(1_000_000, 9_999_999)}`,
    status: pickOne(NOTIFICATION_STATUSES),
    createdAt: randomCreatedAt(),
  }));
}

function genTrackingEvents(shipments: SeedShipment[]): Array<{ t: string; topic: string; key: string; payload: string; lag: string; created_at: Date }> {
  return Array.from({ length: 120 }).map(() => {
    const s = pickOne(shipments);
    return {
      t: timeOfDay(),
      topic: pickOne(EVENT_TOPICS),
      key: s.id,
      payload: pickOne([
        `priority=${s.priority}`,
        `from=${s.from}`,
        `to=${s.to}`,
        `status=${s.status}`,
        `weight=${s.weight}`,
      ]),
      lag: `${randInt(1, 280)}ms`,
      created_at: recentBiasedCreatedAt(0.4, 7),
    };
  });
}

function genTopics(): Array<Record<string, unknown>> {
  return EVENT_TOPICS.map((t) => ({
    name: t,
    msg_s: randFloat(1, 38),
    lag: randInt(0, 90),
    partitions: randInt(1, 6),
    schema: `v${randInt(1, 4)}`,
  }));
}

function genConsumers(): Array<Record<string, unknown>> {
  return CONSUMER_GROUPS.map((g) => ({
    group: g,
    pods: randInt(1, 6),
    lag: randInt(0, 200),
    status: pickOne(["healthy", "lagging", "rebalancing"]),
  }));
}

function genQueues(): Array<Record<string, unknown>> {
  return CELERY_QUEUES.map((q) => ({
    name: q,
    pending: randInt(0, 60),
    active: randInt(0, 16),
    failed24h: randInt(0, 8),
    workers: randInt(2, 8),
  }));
}

function genDlqMessages(shipments: SeedShipment[]): Array<Record<string, unknown>> {
  return Array.from({ length: 16 }).map(() => ({
    id: randomUUID(),
    topic: pickOne(EVENT_TOPICS),
    key: pickOne(shipments).id,
    payload: `error=${pickOne(FAILURE_KINDS)}`,
    received: ageLabel(randInt(2, 60 * 18)) + " ago",
    attempts: randInt(2, 9),
    created_at: recentBiasedCreatedAt(0.4, 7),
  }));
}

function genDlqReplays(): Array<Record<string, unknown>> {
  return Array.from({ length: 8 }).map(() => ({
    id: randomUUID(),
    initiator: fullName(),
    range: `${timeOfDay()} → ${timeOfDay()}`,
    items: randInt(2, 64),
    status: pickOne(["queued", "replaying", "completed", "failed"]),
    created_at: recentBiasedCreatedAt(0.4, 7),
  }));
}

// Analytics snapshots --------------------------------------------------------

function genAnalyticsSnapshots(shipments: SeedShipment[], warehouses: SeedWarehouse[]) {
  const dispatched = shipments.length;
  const delivered = shipments.filter((s) => s.status === "delivered").length;
  const failed = shipments.filter((s) => s.status === "failed").length;
  const returnsCount = shipments.filter((s) => s.status === "returned").length;
  const hourly = Array.from({ length: 16 }).map((_, i) => ({
    h: 8 + i,
    dispatched: randInt(40, 220),
    delivered: randInt(30, 200),
    failed: randInt(0, 14),
  }));
  const overview = {
    shipments: dispatched,
    dispatched,
    delivered,
    failed,
    avgDeliveryTime: randInt(30, 95),
    courierUtilization: randInt(60, 92),
    warehouseThroughput: randInt(55, 90),
    returnRate: Number(((returnsCount / Math.max(dispatched, 1)) * 100).toFixed(1)),
    deltas: {
      shipments: `+${randInt(3, 18)}%`,
      delivered: `+${randInt(2, 14)}%`,
      failed: `-${randInt(1, 9)}%`,
      dispatched: `+${randInt(2, 10)}%`,
    },
    trends: {
      shipments: Array.from({ length: 12 }).map(() => randInt(160, 320)),
      dispatched: Array.from({ length: 12 }).map(() => randInt(140, 310)),
      delivered: Array.from({ length: 12 }).map(() => randInt(120, 300)),
      failed: Array.from({ length: 12 }).map(() => randInt(0, 18)),
    },
  };
  return {
    kpis_overview: overview,
    shipments_timeseries: hourly,
    couriers_utilization: Array.from({ length: 14 }).map((_, i) => ({ x: i, value: randInt(45, 95) })),
    warehouses_throughput: warehouses.map((w) => ({ id: w.id, value: randInt(40, 96) })),
    failures_regions: CITIES.map((c) => ({ id: c.code, name: c.name, value: randInt(0, 28) })),
    observability_services: ["api-gateway", "shipment-service", "warehouse-service", "courier-service", "dispatch-service", "tracking-service", "ai-service"].map((svc) => ({
      service: svc,
      p50: randInt(20, 120),
      p95: randInt(110, 880),
      errorRate: randFloat(0.01, 4.6),
    })),
    observability_kpis: {
      p50LatencyMs: randInt(40, 90),
      p95LatencyMs: randInt(180, 720),
      errorRatePct: randFloat(0.3, 2.6),
      activeAlerts: randInt(0, 5),
      trends: {
        p50LatencyMs: Array.from({ length: 12 }).map(() => randInt(40, 120)),
        p95LatencyMs: Array.from({ length: 12 }).map(() => randInt(180, 820)),
        errorRatePct: Array.from({ length: 12 }).map(() => randFloat(0.2, 3.4)),
      },
    },
    observability_traces: Array.from({ length: 18 }).map(() => ({
      id: `trc-${Math.random().toString(36).slice(2, 10)}`,
      service: pickOne(["api-gateway", "shipment-service", "dispatch-service"]),
      latencyMs: randInt(50, 1200),
      status: pickOne(["ok", "err"]),
      span: pickOne(["GET /shipments", "POST /dispatch", "PATCH /shipments/:id", "GET /warehouses", "POST /ai/assistant/stream"]),
      ts: isoMinutesAgo(randInt(1, 60 * 4)),
    })),
    observability_alerts: Array.from({ length: 6 }).map(() => ({
      id: randomUUID(),
      title: `${pickOne(["p95 latency", "error rate", "queue lag", "courier capacity"])} above threshold`,
      severity: pickOne(EXCEPTION_SEVERITIES),
      service: pickOne(["api-gateway", "dispatch-service", "shipment-service"]),
      since: ageLabel(randInt(1, 60 * 8)),
    })),
    observability_error_budgets: ["api-gateway", "shipment-service", "warehouse-service", "courier-service", "dispatch-service"].map((svc) => ({
      service: svc,
      budgetPct: randInt(70, 99),
      burnRate: randFloat(0.1, 2.4),
    })),
    sla_breakdown: Array.from({ length: 6 }).map((_, i) => ({
      bucket: `${i * 4}-${i * 4 + 4}h`,
      onTime: randInt(60, 96),
      late: randInt(2, 28),
    })),
    exceptions_zones: COURIER_ZONES.slice(0, 6).map((z) => ({ zone: z, count: randInt(2, 18) })),
    shipments_histogram: Array.from({ length: 12 }).map((_, i) => ({ bucket: `${i * 2}-${i * 2 + 2}h`, count: randInt(20, 380) })),
    regions_volume: CITIES.map((c) => ({ region: c.region, name: c.name, volume: randInt(120, 980) })),
    shipments_volume_trend: Array.from({ length: 14 }).map((_, i) => ({ d: i, value: randInt(1100, 2200) })),
  };
}

// AI artifacts ---------------------------------------------------------------

function genAiSuggestions(shipments: SeedShipment[], couriers: SeedCourier[]): Array<Record<string, unknown>> {
  return Array.from({ length: 6 }).map(() => {
    const kind = pickOne(AI_SUGGESTION_KINDS);
    const ship = pickOne(shipments);
    const courier = pickOne(couriers);
    const text =
      kind === "anomaly"
        ? `Courier ${courier.id} is at ${courier.load}/${courier.capacity} capacity in ${courier.zone}.`
        : kind === "delay"
        ? `${ship.id} from ${ship.from} → ${ship.to} risks SLA breach (risk ${ship.risk}).`
        : `Rebalance ${pickOne(COURIER_ZONES)} fleet — utilization ${randInt(70, 95)}%.`;
    return {
      id: randomUUID(),
      kind,
      text,
      impact: `${randInt(2, 24)} shipments`,
      action: kind === "anomaly" ? "Reassign" : kind === "delay" ? "Notify customer" : "Rebalance",
    };
  });
}

function genAiTools(): Array<Record<string, unknown>> {
  return AI_TOOLS.map((tool) => ({
    name: tool,
    callsLast24h: randInt(40, 1200),
    p95Ms: randInt(80, 540),
    successPct: randFloat(89, 99.6, 1),
  }));
}

function genAiPrompts(): Array<Record<string, unknown>> {
  return AI_PROMPTS.map((text) => ({
    id: randomUUID(),
    text,
    contextHint: pickOne(["overview", "shipments", "dispatch", "couriers", "warehouse"]),
  }));
}

function genAiMetrics(): Record<string, unknown> {
  return {
    sessions: randInt(80, 220),
    questions: randInt(220, 1400),
    avgResponseMs: randInt(380, 1450),
    recoAcceptancePct: randFloat(38, 74, 1),
    delayPredictionAccPct: randFloat(70, 92, 1),
    retrievalP95Ms: randInt(120, 480),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Writers

async function writeUsers(users: SeedUser[]): Promise<void> {
  const pool = pgPoolFor("user");
  await pool.query(`TRUNCATE users_v2, auth_tokens RESTART IDENTITY`);
  for (const u of users) {
    // PRIMARY_ADMIN (last in the array) keeps the newest created_at so it sorts first.
    const isPrimaryAdmin = u.id === PRIMARY_ADMIN.id;
    await pool.query(
      `INSERT INTO users_v2 (id, email, password_hash, role, created_at) VALUES ($1,$2,$3,$4,$5)`,
      [u.id, u.email, "seed-password-hash", u.role, isPrimaryAdmin ? new Date() : randomCreatedAt()]
    );
  }
  await pool.end();
}

async function writeShipments(
  shipments: SeedShipment[],
  returns: SeedReturn[],
  exceptions: SeedException[],
  timelines: SeedTimelineEntry[],
  audits: SeedAuditRow[]
): Promise<void> {
  const pool = pgPoolFor("shipment");
  // Ensure the transit_minutes column exists even if the shipment-service hasn't
  // run its migration yet (seed can run before services boot).
  await pool.query(`ALTER TABLE shipment_records ADD COLUMN IF NOT EXISTS transit_minutes INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`TRUNCATE shipment_records, shipment_returns, shipment_exceptions, shipment_timelines, shipment_audits_v2 RESTART IDENTITY`);
  for (const s of shipments) {
    await pool.query(
      `INSERT INTO shipment_records (id, "from", "to", weight, status, priority, courier, placed, eta, risk, items, transit_minutes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [s.id, s.from, s.to, s.weight, s.status, s.priority, s.courier, s.placed, s.eta, s.risk, s.items, s.transitMinutes, s.createdAt]
    );
  }
  for (const r of returns) {
    await pool.query(
      `INSERT INTO shipment_returns (id, shipment, reason, initiated, stage, customer, refund, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [r.id, r.shipment, r.reason, r.initiated, r.stage, r.customer, r.refund, r.createdAt]
    );
  }
  for (const e of exceptions) {
    await pool.query(
      `INSERT INTO shipment_exceptions (id, shipment, kind, severity, age, owner_name, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [e.id, e.shipment, e.kind, e.severity, e.age, e.owner, e.createdAt]
    );
  }
  for (const t of timelines) {
    await pool.query(
      `INSERT INTO shipment_timelines (id, shipment_id, t, label, descr, done, active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [t.id, t.shipmentId, t.t, t.label, t.descr, t.done, t.active, t.createdAt]
    );
  }
  for (const a of audits) {
    await pool.query(
      `INSERT INTO shipment_audits_v2 (id, shipment_id, t, actor, action, reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [a.id, a.shipmentId, a.t, a.actor, a.action, a.reason, a.createdAt]
    );
  }
  await pool.end();
}

async function writeWarehouses(warehouses: SeedWarehouse[], lanes: SeedLanes[], items: SeedStockItem[]): Promise<void> {
  const pool = pgPoolFor("warehouse");
  await pool.query(`TRUNCATE warehouse_records, warehouse_lane_occupancy, warehouse_stock_items RESTART IDENTITY`);
  for (const w of warehouses) {
    await pool.query(
      `INSERT INTO warehouse_records (id, city, name, util, lanes, inbound, outbound, throughput, stock_low, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [w.id, w.city, w.name, w.util, w.lanes, w.inbound, w.outbound, w.throughput, w.stockLow, w.createdAt]
    );
  }
  for (const l of lanes) {
    await pool.query(
      `INSERT INTO warehouse_lane_occupancy (id, warehouse_id, lane_index, occupancy_pct)
       VALUES ($1,$2,$3,$4)`,
      [l.id, l.warehouseId, l.laneIndex, l.occupancyPct]
    );
  }
  for (const it of items) {
    await pool.query(
      `INSERT INTO warehouse_stock_items (id, warehouse_id, sku, name, on_hand, reserved, threshold_value, hot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [it.id, it.warehouseId, it.sku, it.name, it.on, it.reserved, it.threshold, it.hot]
    );
  }
  await pool.end();
}

async function writeCouriers(couriers: SeedCourier[]): Promise<void> {
  const pool = pgPoolFor("courier");
  await pool.query(`TRUNCATE courier_records RESTART IDENTITY`);
  for (const c of couriers) {
    await pool.query(
      `INSERT INTO courier_records (id, user_id, name, city, zone, status, load, capacity, rating, since, attempts, delivered, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [c.id, c.userId, c.name, c.city, c.zone, c.status, c.load, c.capacity, c.rating, c.since, c.attempts, c.delivered, c.createdAt]
    );
  }
  await pool.end();
}

async function writeDispatch(workflows: SeedWorkflow[], failures: SeedFailureMode[]): Promise<void> {
  const pool = pgPoolFor("dispatch");
  await pool.query(`TRUNCATE dispatch_workflows, dispatch_failure_modes RESTART IDENTITY`);
  for (const w of workflows) {
    await pool.query(
      `INSERT INTO dispatch_workflows (id, type, shipment, started, duration, status, step, retries, error, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [w.id, w.type, w.shipment, w.started, w.duration, w.status, w.step, w.retries, w.error, w.createdAt]
    );
  }
  for (const f of failures) {
    await pool.query(
      `INSERT INTO dispatch_failure_modes (id, kind, count, trend, samples)
       VALUES ($1,$2,$3,$4,$5)`,
      [f.id, f.kind, f.count, f.trend, JSON.stringify(f.samples)]
    );
  }
  await pool.end();
}

async function writeNotifications(rows: SeedNotification[]): Promise<void> {
  const pool = pgPoolFor("notification");
  await pool.query(`TRUNCATE notification_log_v2 RESTART IDENTITY`);
  for (const n of rows) {
    await pool.query(
      `INSERT INTO notification_log_v2 (id, event_id, channel, recipient, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [n.id, n.eventId, n.channel, n.recipient, n.status, n.createdAt]
    );
  }
  await pool.end();
}

async function writeAnalytics(snapshots: Record<string, unknown>): Promise<void> {
  const pool = pgPoolFor("analytics");
  await pool.query(`TRUNCATE analytics_snapshots RESTART IDENTITY`);
  for (const [kind, payload] of Object.entries(snapshots)) {
    await pool.query(
      `INSERT INTO analytics_snapshots (kind, payload) VALUES ($1,$2)`,
      [kind, JSON.stringify(payload)]
    );
  }
  await pool.end();
}

async function writeAi(
  suggestions: Array<Record<string, unknown>>,
  tools: Array<Record<string, unknown>>,
  prompts: Array<Record<string, unknown>>,
  metrics: Record<string, unknown>,
  sessionUser?: SeedUser
): Promise<void> {
  const pool = pgPoolFor("ai");
  await pool.query(`TRUNCATE ai_sessions, ai_messages, ai_artifacts RESTART IDENTITY`);
  for (const [kind, payload] of [
    ["suggestions", suggestions],
    ["assistant_tools", tools],
    ["assistant_prompts", prompts],
    ["assistant_metrics", metrics],
    ["daily_dispatch_report", "Dispatch stable. 3 zones with elevated exception rate.  Recommend a courier rebalance for North."],
  ] as const) {
    await pool.query(
      `INSERT INTO ai_artifacts (kind, payload) VALUES ($1,$2)`,
      [kind, JSON.stringify(payload)]
    );
  }
  if (sessionUser) {
    const sessionId = "00000000-0000-0000-0000-000000000001";
    await pool.query(`INSERT INTO ai_sessions (id, user_id) VALUES ($1, NULL) ON CONFLICT (id) DO NOTHING`, [sessionId]);
    const seed = [
      { role: "assistant", text: "Welcome — ask anything about today's operations." },
      { role: "user", text: "Summarize today's exceptions" },
      { role: "assistant", text: "Top exception kinds: address_unreachable, stockout, courier_no_show. Karachi has the most activity." },
    ];
    for (const m of seed) {
      await pool.query(
        `INSERT INTO ai_messages (id, session_id, role, content) VALUES ($1,$2,$3,$4)`,
        [randomUUID(), sessionId, m.role, m.text]
      );
    }
  }
  await pool.end();
}

async function writeTracking(events: ReturnType<typeof genTrackingEvents>, topics: Array<Record<string, unknown>>, consumers: Array<Record<string, unknown>>, queues: Array<Record<string, unknown>>, dlq: Array<Record<string, unknown>>, replays: Array<Record<string, unknown>>): Promise<void> {
  const client = new MongoClient(MONGO_URL);
  try {
    await client.connect();
    const db = client.db(TRACKING_DB);
    await Promise.all([
      db.collection("events").deleteMany({}),
      db.collection("topics").deleteMany({}),
      db.collection("consumers").deleteMany({}),
      db.collection("queues").deleteMany({}),
      db.collection("dlq_messages").deleteMany({}),
      db.collection("dlq_replays").deleteMany({}),
    ]);
    if (events.length) await db.collection("events").insertMany(events);
    if (topics.length) await db.collection("topics").insertMany(topics);
    if (consumers.length) await db.collection("consumers").insertMany(consumers);
    if (queues.length) await db.collection("queues").insertMany(queues);
    if (dlq.length) await db.collection("dlq_messages").insertMany(dlq);
    if (replays.length) await db.collection("dlq_replays").insertMany(replays);
  } finally {
    await client.close();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Orchestrator

async function main(): Promise<void> {
  console.log("SmartLogistics seed starting…");
  await ensureSchemas();

  const users = genUsers();
  const warehouses = genWarehouses();
  const couriers = genCouriers(users);
  const shipments = genShipments(warehouses, couriers, 220);
  const returns = genReturns(shipments);
  const exceptions = genExceptions(shipments);
  const timelines = genShipmentTimelines(shipments);
  const audits = genShipmentAudits(shipments);
  const lanes = genLanes(warehouses);
  const stockItems = genStockItems(warehouses);
  const workflows = genWorkflows(shipments);
  const failures = genFailureModes(workflows);
  const notifications = genNotifications(shipments);
  const trackingEvents = genTrackingEvents(shipments);
  const topics = genTopics();
  const consumers = genConsumers();
  const queues = genQueues();
  const dlqMessages = genDlqMessages(shipments);
  const dlqReplays = genDlqReplays();
  const analyticsSnaps = genAnalyticsSnapshots(shipments, warehouses);
  const aiSuggestions = genAiSuggestions(shipments, couriers);
  const aiTools = genAiTools();
  const aiPrompts = genAiPrompts();
  const aiMetrics = genAiMetrics();

  await writeUsers(users);
  console.log(`✓ users: ${users.length}`);
  await writeWarehouses(warehouses, lanes, stockItems);
  console.log(`✓ warehouses: ${warehouses.length} (lanes ${lanes.length}, stock ${stockItems.length})`);
  await writeCouriers(couriers);
  console.log(`✓ couriers: ${couriers.length}`);
  await writeShipments(shipments, returns, exceptions, timelines, audits);
  console.log(`✓ shipments: ${shipments.length} (returns ${returns.length}, exceptions ${exceptions.length})`);
  await writeDispatch(workflows, failures);
  console.log(`✓ dispatch workflows: ${workflows.length} (failure modes ${failures.length})`);
  await writeNotifications(notifications);
  console.log(`✓ notifications: ${notifications.length}`);
  await writeAnalytics(analyticsSnaps);
  console.log(`✓ analytics snapshots: ${Object.keys(analyticsSnaps).length}`);
  await writeAi(
    aiSuggestions,
    aiTools,
    aiPrompts,
    aiMetrics,
    users.find((u) => u.id === PRIMARY_ADMIN.id) ?? users.find((u) => u.role === "admin")
  );
  console.log(`✓ ai artifacts: suggestions ${aiSuggestions.length}, tools ${aiTools.length}`);
  await writeTracking(trackingEvents, topics, consumers, queues, dlqMessages, dlqReplays);
  console.log(`✓ tracking (mongo): events ${trackingEvents.length}, topics ${topics.length}`);

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
