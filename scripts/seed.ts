/* eslint-disable no-console */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { databaseUrl } from "@smartlogistics/shared-middleware";
import { ALL_PERMISSIONS, courierCode, exceptionCode, rmaCode, uniqueTrackingNumber, warehouseCode, workflowCode } from "@smartlogistics/shared-types";

// Per-service Prisma clients (each service owns its own database/schema).
import { PrismaClient as UserPrisma } from "../apps/services/user-service/src/generated/prisma/index.js";
import { PrismaClient as ShipmentPrisma } from "../apps/services/shipment-service/src/generated/prisma/index.js";
import { PrismaClient as WarehousePrisma } from "../apps/services/warehouse-service/src/generated/prisma/index.js";
import { PrismaClient as CourierPrisma } from "../apps/services/courier-service/src/generated/prisma/index.js";
import { PrismaClient as DispatchPrisma } from "../apps/services/dispatch-service/src/generated/prisma/index.js";
import { PrismaClient as NotificationPrisma } from "../apps/services/notification-service/src/generated/prisma/index.js";
import { PrismaClient as AiPrisma } from "../apps/services/ai-service/src/generated/prisma/index.js";
import { PrismaClient as AnalyticsPrisma } from "../apps/services/analytics-service/src/generated/analytics/index.js";

// ────────────────────────────────────────────────────────────────────────────
// Configuration

const MONGO_URL =
  process.env.MONGO_URL ??
  `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME ?? "smartlogistics"}:${process.env.MONGO_INITDB_ROOT_PASSWORD ?? "smartlogistics"}@${process.env.MONGO_HOST ?? "localhost"}:${process.env.MONGO_PORT ?? "27018"}`;

const TRACKING_DB = process.env.TRACKING_MONGO_DB ?? "tracking_service";

const userDb = new UserPrisma({ datasources: { db: { url: databaseUrl({ database: "user_service", defaultPort: 5441 }) } } });
const shipmentDb = new ShipmentPrisma({ datasources: { db: { url: databaseUrl({ database: "shipment_service", defaultPort: 5433 }) } } });
const warehouseDb = new WarehousePrisma({ datasources: { db: { url: databaseUrl({ database: "warehouse_service", defaultPort: 5434 }) } } });
const courierDb = new CourierPrisma({ datasources: { db: { url: databaseUrl({ database: "courier_service", defaultPort: 5435 }) } } });
const dispatchDb = new DispatchPrisma({ datasources: { db: { url: databaseUrl({ database: "dispatch_service", defaultPort: 5436 }) } } });
const notificationDb = new NotificationPrisma({ datasources: { db: { url: databaseUrl({ database: "notification_service", defaultPort: 5437 }) } } });
const aiDb = new AiPrisma({ datasources: { db: { url: databaseUrl({ database: "ai_service", defaultPort: 5438 }) } } });
const analyticsDb = new AnalyticsPrisma({ datasources: { db: { url: databaseUrl({ database: "analytics_service", defaultPort: 5439 }) } } });

async function disconnectAll(): Promise<void> {
  await Promise.all([
    userDb.$disconnect(),
    shipmentDb.$disconnect(),
    warehouseDb.$disconnect(),
    courierDb.$disconnect(),
    dispatchDb.$disconnect(),
    notificationDb.$disconnect(),
    aiDb.$disconnect(),
    analyticsDb.$disconnect(),
  ]);
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

function minutesSinceLocalMidnight(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return Math.max(1, Math.floor((now.getTime() - midnight.getTime()) / 60_000));
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addLocalDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/** How many calendar days ahead of today to pre-seed (inclusive of today = day 0). */
const SEED_HORIZON_DAYS = 10;

// Random timestamp on a local calendar day: 0 = today, 1 = tomorrow, … up to horizon.
function dayOffsetCreatedAt(dayOffset: number): Date {
  const dayStart = addLocalDays(startOfLocalDay(new Date()), dayOffset);
  const dayEnd = endOfLocalDay(dayStart);
  return new Date(randInt(dayStart.getTime(), dayEnd.getTime()));
}

// A timestamp uniformly between `start` and `end` (for child rows tied to a parent).
function betweenDates(start: Date, end: Date): Date {
  const lo = start.getTime();
  const hi = end.getTime();
  if (hi <= lo) return new Date(lo);
  return new Date(randInt(lo, hi));
}

// Child timestamps fall after the parent, capped at the end of the parent's local day.
function afterParent(parent: Date): Date {
  return betweenDates(parent, endOfLocalDay(parent));
}

// A timestamp somewhere earlier today (since local midnight). Used for "current"
// roster/live entities so they always appear in the default Today view.
function todayCreatedAt(): Date {
  return new Date(Date.now() - randInt(0, minutesSinceLocalMidnight()) * 60_000);
}

// Recent-biased timestamp spread across today + the forward horizon, with a tail
// in the last `pastSpreadDays`. Keeps live feeds populated day-by-day for ~10 days.
function recentBiasedCreatedAt(pastSpreadDays = 7): Date {
  const r = Math.random();
  if (r < 0.45) return dayOffsetCreatedAt(randInt(0, SEED_HORIZON_DAYS));
  if (r < 0.65) return todayCreatedAt();
  return new Date(Date.now() - randInt(0, pastSpreadDays * 24 * 60) * 60_000);
}

// Layered distribution for shipments: ~35% across today+next 10 days, ~15% last week,
// remainder across 90 days of history so every preset (Today / 7d / 30d / 90d) has data.
function shipmentCreatedAt(i: number, count: number): Date {
  const r = i / Math.max(count, 1);
  if (r < 0.35) return dayOffsetCreatedAt(randInt(0, SEED_HORIZON_DAYS));
  if (r < 0.50) return new Date(Date.now() - randInt(1, 7 * 24 * 60) * 60_000);
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
// Domain generators

interface SeedUser { id: string; email: string; role: string; name: string; phone: string; employeeId: string; region: string }

// ─────────────────────────────────────────────────────────────────────────────
// Role catalog — seeds the `roles` table. At runtime the table is authoritative.
//
//   • `pages`       drive frontend nav/route access.
//   • `permissions` drive granular portal/API actions (gateway + UI).
//   • `apiPrefixes` kept for documentation / legacy coarse routing hints.
interface RoleSeed {
  id: string;
  key: string;
  label: string;
  description: string;
  pages: string[];
  apiPrefixes: string[];
  permissions: string[];
  isSystem?: boolean;
}

const COMMON_READ = ["/analytics", "/shipments", "/tracking", "/dispatch", "/warehouses", "/couriers", "/ai"];

const ROLE_SEED: RoleSeed[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    key: "admin",
    label: "Administrator",
    description: "Full access to every console page and management API.",
    pages: ["overview", "shipments", "dispatch", "warehouse", "couriers", "events", "analytics", "returns", "observability", "ai"],
    apiPrefixes: ["/shipments", "/warehouses", "/couriers", "/dispatch", "/tracking", "/notifications", "/analytics", "/ai", "/users"],
    permissions: [...ALL_PERMISSIONS],
    isSystem: true
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    key: "warehouse_operator",
    label: "Warehouse Operator",
    description: "Inbound/outbound flows and the dispatch workflows moving them.",
    pages: ["overview", "shipments", "dispatch", "warehouse", "events", "ai"],
    apiPrefixes: COMMON_READ,
    permissions: [
      "shipments:read", "shipments:write",
      "dispatch:read", "dispatch:write",
      "warehouse:read", "warehouse:write",
      "tracking:read", "analytics:read", "ai:use"
    ]
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    key: "customer_support",
    label: "Customer Support",
    description: "Cases, returns, SLAs and the analytics behind them.",
    pages: ["overview", "shipments", "returns", "analytics", "ai"],
    apiPrefixes: COMMON_READ,
    permissions: ["shipments:read", "returns:read", "returns:write", "analytics:read", "tracking:read", "ai:use"]
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    key: "courier",
    label: "Courier",
    description: "Routes, deliveries and the shipments being carried.",
    pages: ["overview", "couriers", "shipments", "ai"],
    apiPrefixes: COMMON_READ,
    permissions: ["shipments:read", "couriers:read", "couriers:write", "tracking:read", "ai:use"]
  }
];

const ROLE_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(ROLE_SEED.map((r) => [r.key, r.label]));

// Stable primary admin baked into the seed so the operations console always opens
// against a known user. Inserted LAST so `created_at DESC` picks him first.
const PRIMARY_ADMIN: SeedUser = {
  id: "00000000-0000-0000-0000-00000000a1a1",
  email: "awais.ali@smartlogistics.example",
  role: "admin",
  name: "Awais Ali",
  phone: "+923001234567",
  employeeId: "EMP-0001",
  region: "Global"
};

function randomPhone(): string {
  return `${pickOne(["+92301", "+92321", "+92345", "+92333"])}${randInt(1_000_000, 9_999_999)}`;
}

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
      const prefix = role === "courier" ? "CR" : role === "warehouse_operator" ? "WH" : role === "customer_support" ? "CS" : "AD";
      out.push({
        id: randomUUID(),
        email: emailFromName(name, `${role}${counter}`),
        role,
        name,
        phone: randomPhone(),
        employeeId: `EMP-${prefix}-${String(1000 + counter)}`,
        region: pickOne(CITIES).region
      });
    }
  }
  // append last so PRIMARY_ADMIN's created_at is the most recent → first in /users
  out.push(PRIMARY_ADMIN);
  return out;
}

interface SeedWarehouse { id: string; code: string; city: string; region: string; name: string; util: number; lanes: number; inbound: number; outbound: number; throughput: string; stockLow: number; createdAt: Date }
function genWarehouses(): SeedWarehouse[] {
  return CITIES.slice(0, 8).map((city, i) => {
    const util = randFloat(0.55, 0.94);
    const lanes = randInt(12, 36);
    const inbound = randInt(180, 720);
    const outbound = randInt(160, 800);
    const throughputDelta = randInt(-9, 14);
    return {
      id: randomUUID(),
      code: warehouseCode(city.code, i),
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

interface SeedCourier { id: string; code: string; userId: string; name: string; city: string; zone: string; status: string; load: number; capacity: number; rating: number; since: string; attempts: number; delivered: number; createdAt: Date }
function genCouriers(users: SeedUser[]): SeedCourier[] {
  const courierUsers = users.filter((u) => u.role === "courier");
  return courierUsers.map((u, i) => {
    const capacity = randInt(8, 16);
    const load = randInt(0, capacity);
    const delivered = randInt(40, 480);
    return {
      id: randomUUID(),
      code: courierCode(i),
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

interface SeedShipment {
  id: string;
  trackingNumber: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  fromCode: string;
  toCode: string;
  courierId: string;
  courierCode: string;
  weight: string;
  status: string;
  priority: string;
  placed: string;
  eta: string;
  risk: number;
  items: number;
  createdAt: Date;
  transitMinutes: number;
}
function genShipments(warehouses: SeedWarehouse[], couriers: SeedCourier[], count: number): SeedShipment[] {
  const usedTracking = new Set<string>();
  return Array.from({ length: count }).map((_, i) => {
    const fromW = pickOne(warehouses);
    const toW = pickOne(warehouses.filter((w) => w.id !== fromW.id));
    const courier = pickOne(couriers);
    const status = pickOne(SHIPMENT_STATUSES);
    const createdAt = shipmentCreatedAt(i, count);
    const etaInMin = randInt(30, 60 * 30);
    return {
      id: randomUUID(),
      trackingNumber: uniqueTrackingNumber(usedTracking),
      fromWarehouseId: fromW.id,
      toWarehouseId: toW.id,
      fromCode: fromW.code,
      toCode: toW.code,
      courierId: courier.id,
      courierCode: courier.code,
      weight: `${randFloat(0.5, 24)}kg`,
      status,
      priority: pickOne(SHIPMENT_PRIORITIES),
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

interface SeedReturn { id: string; code: string; shipmentId: string; shipmentTracking: string; reason: string; initiated: string; stage: string; customer: string; refund: string; createdAt: Date }
function genReturns(shipments: SeedShipment[]): SeedReturn[] {
  const sample = pickN(shipments, Math.min(28, Math.floor(shipments.length * 0.08)));
  return sample.map((s) => {
    const createdAt = afterParent(s.createdAt);
    return {
      id: randomUUID(),
      code: rmaCode(),
      shipmentId: s.id,
      shipmentTracking: s.trackingNumber,
      reason: pickOne(RETURN_REASONS),
      initiated: agoLabelFrom(createdAt),
      stage: pickOne(RETURN_STAGES),
      customer: fullName(),
      refund: `Rs ${randInt(450, 28_000).toLocaleString("en-PK")}`,
      createdAt,
    };
  });
}

interface SeedException { id: string; code: string; shipmentId: string; shipmentTracking: string; kind: string; severity: string; age: string; owner: string; createdAt: Date }
function genExceptions(shipments: SeedShipment[]): SeedException[] {
  const sample = pickN(shipments, Math.min(18, Math.floor(shipments.length * 0.05)));
  return sample.map((s, i) => {
    // Keep a handful of exceptions on today so the AI assistant and Returns page stay populated.
    const createdAt = i < 5 ? dayOffsetCreatedAt(0) : afterParent(s.createdAt);
    return {
      id: randomUUID(),
      code: exceptionCode(),
      shipmentId: s.id,
      shipmentTracking: s.trackingNumber,
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
      const tDate = afterParent(s.createdAt);
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

interface SeedWorkflow { id: string; code: string; type: string; shipmentId: string; shipmentTracking: string; started: string; duration: string; status: string; step: string; retries: number; error: string | null; createdAt: Date }
function genWorkflows(shipments: SeedShipment[]): SeedWorkflow[] {
  return Array.from({ length: 28 }).map(() => {
    const status = pickOne(WORKFLOW_STATUSES);
    const failing = status === "failing" || status === "compensating";
    const ship = pickOne(shipments);
    const type = pickOne(WORKFLOW_TYPES);
    // Workflows are recent operational runs; bias them toward today.
    const createdAt = recentBiasedCreatedAt();
    return {
      id: randomUUID(),
      code: workflowCode(type),
      type,
      shipmentId: ship.id,
      shipmentTracking: ship.trackingNumber,
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
    eventId: randomUUID(),
    channel: pickOne(NOTIFICATION_CHANNELS),
    recipient: `${pickOne(["+92301", "+92321", "+92345"])}${randInt(1_000_000, 9_999_999)}`,
    status: pickOne(NOTIFICATION_STATUSES),
    createdAt: recentBiasedCreatedAt(),
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
      created_at: recentBiasedCreatedAt(),
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
    created_at: recentBiasedCreatedAt(),
  }));
}

function genDlqReplays(): Array<Record<string, unknown>> {
  return Array.from({ length: 8 }).map(() => ({
    id: randomUUID(),
    initiator: fullName(),
    range: `${timeOfDay()} → ${timeOfDay()}`,
    items: randInt(2, 64),
    status: pickOne(["queued", "replaying", "completed", "failed"]),
    created_at: recentBiasedCreatedAt(),
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

// Idempotently seeds the normalized roles table (matching user-service startup)
// and returns a role key → id (UUID) map used to set each user's role_id FK.
async function seedRoles(): Promise<Map<string, string>> {
  const byKey = new Map<string, string>();
  for (const def of ROLE_SEED) {
    const row = await userDb.role.upsert({
      where: { id: def.id },
      create: {
        id: def.id,
        label: def.label,
        description: def.description,
        pages: def.pages,
        apiPrefixes: def.apiPrefixes,
        permissions: def.permissions,
        isSystem: def.isSystem ?? false
      },
      update: {
        label: def.label,
        description: def.description,
        pages: def.pages,
        apiPrefixes: def.apiPrefixes,
        permissions: def.permissions,
        isSystem: def.isSystem ?? false
      }
    });
    byKey.set(def.key, row.id);
  }
  return byKey;
}

async function writeUsers(users: SeedUser[], roleIdByKey: Map<string, string>): Promise<void> {
  // Clear in FK-safe order (auth_tokens reference users); keep roles.
  await userDb.authToken.deleteMany({});
  await userDb.user.deleteMany({});
  for (const u of users) {
    // PRIMARY_ADMIN (last in the array) keeps the newest created_at so it sorts first.
    const isPrimaryAdmin = u.id === PRIMARY_ADMIN.id;
    await userDb.user.create({
      data: {
        id: u.id,
        email: u.email,
        passwordHash: "seed-password-hash",
        // User.role is the denormalized display label; authorization uses role_id.
        role: ROLE_LABEL_BY_KEY[u.role] ?? u.role,
        roleId: roleIdByKey.get(u.role) ?? null,
        fullName: u.name,
        phone: u.phone,
        employeeId: u.employeeId,
        region: u.region,
        status: "active",
        createdAt: isPrimaryAdmin ? new Date() : randomCreatedAt()
      }
    });
  }
}

async function writeShipments(
  shipments: SeedShipment[],
  returns: SeedReturn[],
  exceptions: SeedException[],
  timelines: SeedTimelineEntry[],
  audits: SeedAuditRow[]
): Promise<void> {
  await shipmentDb.shipmentAudit.deleteMany({});
  await shipmentDb.shipmentTimeline.deleteMany({});
  await shipmentDb.shipmentException.deleteMany({});
  await shipmentDb.shipmentReturn.deleteMany({});
  await shipmentDb.shipmentRecord.deleteMany({});
  await shipmentDb.shipmentRecord.createMany({
    data: shipments.map((s) => ({
      id: s.id,
      trackingNumber: s.trackingNumber,
      fromWarehouseId: s.fromWarehouseId,
      toWarehouseId: s.toWarehouseId,
      fromCode: s.fromCode,
      toCode: s.toCode,
      courierId: s.courierId,
      courierCode: s.courierCode,
      weight: s.weight,
      status: s.status,
      priority: s.priority,
      placed: s.placed,
      eta: s.eta,
      risk: s.risk,
      items: s.items,
      transitMinutes: s.transitMinutes,
      createdAt: s.createdAt
    }))
  });
  await shipmentDb.shipmentReturn.createMany({
    data: returns.map((r) => ({
      id: r.id,
      code: r.code,
      shipmentId: r.shipmentId,
      shipmentTracking: r.shipmentTracking,
      reason: r.reason,
      initiated: r.initiated,
      stage: r.stage,
      customer: r.customer,
      refund: r.refund,
      createdAt: r.createdAt
    }))
  });
  await shipmentDb.shipmentException.createMany({
    data: exceptions.map((e) => ({
      id: e.id,
      code: e.code,
      shipmentId: e.shipmentId,
      shipmentTracking: e.shipmentTracking,
      kind: e.kind,
      severity: e.severity,
      age: e.age,
      ownerName: e.owner,
      createdAt: e.createdAt
    }))
  });
  await shipmentDb.shipmentTimeline.createMany({
    data: timelines.map((t) => ({ id: t.id, shipmentId: t.shipmentId, t: t.t, label: t.label, descr: t.descr, done: t.done, active: t.active, createdAt: t.createdAt }))
  });
  await shipmentDb.shipmentAudit.createMany({
    data: audits.map((a) => ({ id: a.id, shipmentId: a.shipmentId, t: a.t, actor: a.actor, action: a.action, reason: a.reason, createdAt: a.createdAt }))
  });
}

async function writeWarehouses(warehouses: SeedWarehouse[], lanes: SeedLanes[], items: SeedStockItem[]): Promise<void> {
  await warehouseDb.warehouseStockItem.deleteMany({});
  await warehouseDb.warehouseLaneOccupancy.deleteMany({});
  await warehouseDb.warehouseRecord.deleteMany({});
  await warehouseDb.warehouseRecord.createMany({
    data: warehouses.map((w) => ({ id: w.id, code: w.code, city: w.city, name: w.name, util: w.util, lanes: w.lanes, inbound: w.inbound, outbound: w.outbound, throughput: w.throughput, stockLow: w.stockLow, createdAt: w.createdAt }))
  });
  await warehouseDb.warehouseLaneOccupancy.createMany({
    data: lanes.map((l) => ({ id: l.id, warehouseId: l.warehouseId, laneIndex: l.laneIndex, occupancyPct: l.occupancyPct }))
  });
  await warehouseDb.warehouseStockItem.createMany({
    data: items.map((it) => ({ id: it.id, warehouseId: it.warehouseId, sku: it.sku, name: it.name, onHand: it.on, reserved: it.reserved, thresholdValue: it.threshold, hot: it.hot }))
  });
}

async function writeCouriers(couriers: SeedCourier[]): Promise<void> {
  await courierDb.courierRecord.deleteMany({});
  await courierDb.courierRecord.createMany({
    data: couriers.map((c) => ({ id: c.id, code: c.code, userId: c.userId, name: c.name, city: c.city, zone: c.zone, status: c.status, load: c.load, capacity: c.capacity, rating: c.rating, since: c.since, attempts: c.attempts, delivered: c.delivered, createdAt: c.createdAt }))
  });
}

async function writeDispatch(workflows: SeedWorkflow[], failures: SeedFailureMode[]): Promise<void> {
  await dispatchDb.dispatchWorkflowAudit.deleteMany({});
  await dispatchDb.dispatchWorkflow.deleteMany({});
  await dispatchDb.dispatchFailureMode.deleteMany({});
  await dispatchDb.dispatchWorkflow.createMany({
    data: workflows.map((w) => ({
      id: w.id,
      code: w.code,
      type: w.type,
      shipmentId: w.shipmentId,
      shipmentTracking: w.shipmentTracking,
      started: w.started,
      duration: w.duration,
      status: w.status,
      step: w.step,
      retries: w.retries,
      error: w.error,
      createdAt: w.createdAt
    }))
  });
  await dispatchDb.dispatchFailureMode.createMany({
    data: failures.map((f) => ({ id: f.id, kind: f.kind, count: f.count, trend: f.trend, samples: f.samples }))
  });
}

async function writeNotifications(rows: SeedNotification[]): Promise<void> {
  await notificationDb.notificationLog.deleteMany({});
  await notificationDb.notificationLog.createMany({
    data: rows.map((n) => ({ id: n.id, eventId: n.eventId, channel: n.channel, recipient: n.recipient, status: n.status, createdAt: n.createdAt }))
  });
}

async function writeAnalytics(snapshots: Record<string, unknown>): Promise<void> {
  await analyticsDb.analyticsSnapshot.deleteMany({});
  await analyticsDb.analyticsSnapshot.createMany({
    data: Object.entries(snapshots).map(([kind, payload]) => ({ kind, payload: payload as object }))
  });
}

async function writeAi(
  suggestions: Array<Record<string, unknown>>,
  tools: Array<Record<string, unknown>>,
  prompts: Array<Record<string, unknown>>,
  metrics: Record<string, unknown>,
  sessionUser?: SeedUser
): Promise<void> {
  await aiDb.aiMessage.deleteMany({});
  await aiDb.aiSession.deleteMany({});
  await aiDb.aiArtifact.deleteMany({});
  const artifacts: Array<[string, unknown]> = [
    ["suggestions", suggestions],
    ["assistant_tools", tools],
    ["assistant_prompts", prompts],
    ["assistant_metrics", metrics],
    ["daily_dispatch_report", "Dispatch stable. 3 zones with elevated exception rate.  Recommend a courier rebalance for North."],
  ];
  await aiDb.aiArtifact.createMany({
    data: artifacts.map(([kind, payload]) => ({ kind, payload: payload as object }))
  });
  if (sessionUser) {
    const sessionId = "00000000-0000-0000-0000-000000000001";
    await aiDb.aiSession.upsert({ where: { id: sessionId }, create: { id: sessionId }, update: {} });
    const seed = [
      { role: "assistant", text: "Welcome — ask anything about today's operations." },
      { role: "user", text: "Summarize today's exceptions" },
      { role: "assistant", text: "Top exception kinds: address_unreachable, stockout, courier_no_show. Karachi has the most activity." },
    ];
    await aiDb.aiMessage.createMany({
      data: seed.map((m) => ({ id: randomUUID(), sessionId, role: m.role, content: m.text }))
    });
  }
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
  console.log(`SmartLogistics seed starting… (today + ${SEED_HORIZON_DAYS} days forward)`);
  const roleIdByKey = await seedRoles();
  console.log(`✓ roles: ${roleIdByKey.size}`);

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

  await writeUsers(users, roleIdByKey);
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

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAll().catch(() => undefined);
  });
