# SmartLogistics

SmartLogistics is a microservices-based logistics orchestration platform. It models the full operational lifecycle of a parcel network — shipments, dispatch workflows, warehouses, couriers, returns/exceptions, event streaming, analytics, and an AI operations assistant — behind a single API gateway and a modern React operations console.

---

## 1. Project overview

The platform is a `pnpm` + Turborepo monorepo composed of independently deployable Fastify services, a set of shared TypeScript packages, and a Vite/React frontend. Each domain service owns its own database; services communicate over HTTP through the gateway and asynchronously over Kafka, with long-running orchestration handled by Temporal and background jobs by BullMQ/Redis.

Key capabilities:

- **Operations console** — Overview, Shipments, Dispatch monitor, Warehouses, Couriers, Returns/Exceptions, Events & queues, Analytics, and Observability pages.
- **Role-based access control** — Admin, Warehouse Operator, Customer Support, and Courier roles are defined in a normalized `roles` table; page access is data-driven from the backend and API authorization is enforced centrally at the gateway via signed JWTs (see §5).
- **Date-range filtering** — every page defaults to "today" and supports Today / 7d / 30d / 90d presets plus a custom range; servers filter on real timestamps.
- **Live analytics** — business metrics (KPIs, time-series, histograms, SLA, regions, exception zones) are recomputed live from shipment data per selected range.
- **Orchestrated dispatch** — dispatch runs as a Temporal workflow (validate → reserve → label → assign → track → dispatch) executed by an in-process worker, with a graceful inline fallback when Temporal is unavailable.
- **Event-driven fan-out** — on dispatch completion the platform publishes to Kafka and three independent consumer groups react: tracking records a milestone, analytics counts the event, and notification queues a customer update via BullMQ.
- **AI assistant** — a Groq-backed streaming assistant with tool-calling against live operational data, plus live operational recommendations.
- **Metrics & observability** — every service exposes Prometheus metrics at `/metrics` (scraped by Prometheus, visualized in Grafana); Jaeger and Temporal UI are provisioned for traces and workflow inspection.

### Implementation notes

A couple of areas are deliberately scoped so the demo stays runnable end-to-end:

- **Distributed traces** — services emit Prometheus metrics today; OpenTelemetry/Jaeger trace export is provisioned in infra but not yet wired into the service code.
- **Semantic retrieval** — Qdrant is provisioned and an `ai.embedding.trigger` consumer is in place, but the assistant currently answers via **live tool-calling** against the services (9 typed ops tools) rather than vector search. This trades retrieval staleness for always-fresh data and is the intended substitution for Part B retrieval.

### Workspace layout

```
apps/
  frontend/            React + Vite operations console
  services/
    api-gateway/       Edge router, CORS, rate limiting
    user-service/      Auth, users, RBAC source
    shipment-service/  Shipments, returns, exceptions, timeline, audit
    warehouse-service/ Warehouses, lanes, stock
    courier-service/   Courier roster + assignment
    dispatch-service/  Temporal dispatch workflows + KPIs
    tracking-service/  Kafka/Mongo event stream, DLQ
    notification-service/ BullMQ notification delivery log
    analytics-service/ Live business metrics + observability snapshots
    ai-service/        Groq assistant, tools, suggestions
packages/
  shared-config/  shared-errors/  shared-events/  shared-middleware/  shared-types/
infra/
  prometheus/  grafana/  jaeger/  qdrant/
scripts/
  seed.ts        Deterministic data seeding across all stores
```

---

## 2. Architecture diagram

```mermaid
flowchart TB
  FE["Frontend (React + Vite)\n:5173"]

  subgraph Edge
    GW["API Gateway (Fastify)\n:4000\nCORS · rate limit · request-id"]
  end

  FE -->|HTTP /auth /shipments /dispatch /ai ...| GW

  subgraph Services["Domain services (Fastify)"]
    US["user-service :4001"]
    SS["shipment-service :4002"]
    WS["warehouse-service :4003"]
    CS["courier-service :4004"]
    DS["dispatch-service :4005"]
    TS["tracking-service :4006"]
    NS["notification-service :4007"]
    AN["analytics-service :4008"]
    AI["ai-service :4009"]
  end

  GW --> US & SS & WS & CS & DS & TS & NS & AN & AI

  subgraph Data["Datastores"]
    PG[("PostgreSQL\nper-service DBs")]
    TSDB[("TimescaleDB\nanalytics")]
    MG[("MongoDB\nwarehouse + tracking")]
    RD[("Redis\ncache + BullMQ")]
    QD[("Qdrant\nvector store")]
  end

  subgraph Platform["Messaging & orchestration"]
    KAFKA{{"Kafka + Schema Registry"}}
    TEMPORAL{{"Temporal\n:7233"}}
  end

  US --> PG
  SS --> PG
  WS --> PG & MG
  CS --> PG
  DS --> PG & TEMPORAL
  TS --> MG
  NS --> PG & RD
  AN --> TSDB
  AN -.read-only.-> PG
  AI --> PG & QD
  AI -.tool calls.-> GW

  SS & WS & CS & DS & TS & NS --> KAFKA

  subgraph Obs["Observability"]
    PROM["Prometheus :9090"]
    GRAF["Grafana :3000"]
    JAEG["Jaeger :16686"]
    TUI["Temporal UI :8080"]
  end

  Services -.metrics/traces.-> Obs
```

---

## 3. Setup instructions

### Prerequisites

- Node.js >= 20
- pnpm 10 (`corepack enable` or `npm i -g pnpm`)
- Docker + Docker Compose

### First-time setup (clone → running with demo data)

For a teammate cloning the repo for the first time:

```bash
git clone git@github.com:awaisaly/smart-logistics.git
cd smart-logistics

pnpm install
cp .env.example .env          # defaults work out of the box; set GROQ_API_KEY for AI features

pnpm up                       # start infra (databases, Kafka, Temporal, Redis, observability)
# wait ~30–60s for the databases to become healthy, then:
pnpm seed                     # load ~90 days of demo data into all stores

pnpm dev                      # run all services + the frontend (hot reload)
```

Then open <http://localhost:5173> and log in with a seeded account — e.g.
`awais.ali@smartlogistics.example` and the `DEMO_PASSWORD` value from your `.env`.

**How it fits together:** the app services in `docker-compose.yml` are behind a
`services` Compose profile, so `pnpm up` (`docker compose up -d`) starts **only the
infrastructure** in Docker. The application code (9 services + gateway + frontend)
runs **on your host** via Turborepo. The `pnpm seed` script also runs on the host and
connects to the Dockerized databases through their published ports
(`localhost:5433–5441`, Mongo `localhost:27018`) — so the databases must be up before
seeding, but the services do not need to be running.

> Re-running `pnpm seed` is **destructive**: it truncates and repopulates every store.

### Install & configure

```bash
pnpm install
cp .env.example .env   # then fill in secrets (e.g. GROQ_API_KEY)
```

#### Environment variables

`.env.example` documents the full set; copy it to `.env` and adjust as needed. The ones you are most likely to touch:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | — | Required for the AI assistant and live recommendations |
| `DEMO_PASSWORD` | `smartlogistics` | Password accepted for any seeded demo account (ignored when `NODE_ENV=production`) |
| `VITE_DEMO_PASSWORD` | `smartlogistics` | Password the login screen pre-fills / displays for quick demo access (keep in sync with `DEMO_PASSWORD`) |
| `VITE_API_BASE_URL` | `http://localhost:4000` | Base URL the frontend uses to reach the API gateway |
| `FRONTEND_PORT` | `5173` | Port the Vite dev server binds to |

> Note: `VITE_*` variables are read by Vite at build/dev-server start, so restart the frontend after changing them.

### Run everything (infra + all dev servers)

```bash
pnpm dev
```

`pnpm dev` runs `docker compose up -d` (databases, Kafka, Temporal, Redis, Qdrant, observability), then `pnpm db:generate` + `pnpm db:migrate` to generate the Prisma clients and apply migrations to every service database, and finally starts every service and the frontend in parallel via Turborepo.

- Frontend: <http://localhost:5173>
- API gateway: <http://localhost:4000>
- Grafana: <http://localhost:3000> · Jaeger: <http://localhost:16686> · Temporal UI: <http://localhost:8080>

### Seed demo data

With the databases running:

```bash
pnpm seed
```

This truncates and repopulates all stores with ~90 days of timestamp-distributed data so the date-range filters and analytics are meaningful. The primary admin account is `awais.ali@smartlogistics.example` (demo password is set via `DEMO_PASSWORD`).

### Useful scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start infra + all dev servers |
| `pnpm up` / `pnpm down` | Start / stop docker infra only |
| `pnpm db:generate` | Generate the Prisma client for every service |
| `pnpm db:migrate` | Apply committed Prisma migrations to every database |
| `pnpm db:push` | Sync schemas without migrations (prototyping only) |
| `pnpm seed` | Reseed all databases (runs generate + migrate first) |
| `pnpm build` | Build all packages and apps |
| `pnpm typecheck` | Type-check the whole workspace |
| `pnpm test` | Run the unit suite (Vitest) on critical paths |
| `pnpm smoke` | Typecheck + unit tests + docker-compose validation |
| `pnpm lint` | Lint across the workspace |

> Individual services run on ports `4001`–`4009`; PostgreSQL instances are exposed on `5433`–`5441`, TimescaleDB on `5439`, MongoDB on `27017`/`27018`.

---

## 4. API overview

All client traffic goes through the gateway at `http://localhost:4000`, which proxies by path prefix to the owning service. The gateway verifies the access JWT and authorizes by role on every request (see §5), so non-public endpoints require an `Authorization: Bearer <accessToken>` header. Most list/metrics endpoints accept optional `from`/`to` ISO query params and **default to today** when omitted.

| Prefix | Service | Notable endpoints |
| --- | --- | --- |
| `/auth` | user-service | `POST /auth/login` · `/auth/refresh` · `/auth/logout` (public); `GET /auth/demo-accounts` (public, login screen); `GET /auth/me` (current user + profile); `POST /auth/register` (admin) |
| `/roles` | user-service | `GET /roles` — role configs (`pages` + `apiPrefixes`) consumed by the gateway policy cache |
| `/users` | user-service | `GET /users`, `POST /users`, `DELETE /users/:id` — admin-only user management with profile fields + `roleId` |
| `/shipments` | shipment-service | `GET /` (range), `GET /:id`, `/:id/timeline`, `/:id/audit`, `/returns`, `/exceptions`, `/returns/metrics`, `/exceptions/taxonomy`, `POST /:id/escalate`, `POST /:id/actions` |
| `/warehouses` | warehouse-service | `GET /` (range), `GET /:id/lanes`, `GET /:id/stock`, inventory reserve/release/adjust |
| `/couriers` | courier-service | `GET /` (range), `POST /`, `POST /assign`, `PATCH /:id/status` |
| `/dispatch` | dispatch-service | `GET /workflows` (range), `GET /kpis` (range), `GET /failure-modes`, `POST /:workflowId/replay\|skip\|terminate`, `GET /:workflowId/audit` |
| `/tracking` | tracking-service | `GET /events/recent` (range), `/topics`, `/consumers`, `/queues/celery`, `/dlq/messages` (range), `/dlq/replays` (range), `/events/kpis` |
| `/notifications` | notification-service | `GET /:id`, `POST /retry/:id` |
| `/analytics` | analytics-service | `GET /kpis/overview`, `/shipments/timeseries`, `/shipments/histogram`, `/regions/volume`, `/sla/breakdown`, `/exceptions/zones` (all range-aware) + `/observability/*` snapshots |
| `/ai` | ai-service | `POST /assistant/stream` (SSE), `GET /assistant/history`, `DELETE /assistant/history`, `GET /suggestions`, `POST /suggestions/refresh`, `POST /suggestions/:id/feedback`, `GET /info` |

Every service also exposes `GET /health` and `GET /metrics` (Prometheus). Example:

```bash
# Today's shipments (default range)
curl http://localhost:4000/shipments

# Shipments for an explicit range
curl "http://localhost:4000/shipments?from=2026-03-01T00:00:00Z&to=2026-05-30T23:59:59Z"

# Login (returns { accessToken, refreshToken, user })
curl -X POST http://localhost:4000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"awais.ali@smartlogistics.example","password":"<DEMO_PASSWORD>"}'

# Call a protected endpoint with the access token
curl http://localhost:4000/users -H "authorization: Bearer <accessToken>"
```

---

## 5. Data layer, authentication & RBAC

### Data layer (Prisma ORM)

Every Postgres-backed service uses **Prisma ORM** instead of raw SQL. Each service
owns its own database and its own `prisma/schema.prisma` (models are `@map`-ped to the
existing snake_case tables), generating a service-local client into `src/generated/`
(gitignored — produced by `pnpm db:generate`).
The `analytics-service` additionally generates a **read-only** client against the
`shipment_service` database for cross-service analytics. `tracking-service` is the one
data store that stays on the native MongoDB driver (Prisma is Postgres-shaped here).

Schema management is orchestrated by `scripts/prisma.ts`:

| Command | Description |
| --- | --- |
| `pnpm db:generate` | Generate the Prisma client for every service schema |
| `pnpm db:migrate` | Apply committed migrations to every database (`prisma migrate deploy`) |
| `pnpm db:push` | Sync schemas directly **without** migrations — for quick prototyping (`prisma db push`) |
| `pnpm db:migrate:baseline` | One-time: mark `0_init` as applied on a DB previously provisioned via `db push` |

`pnpm dev` and `pnpm seed` run `db:generate` + `db:migrate` automatically, so schemas
stay in sync without a manual step. The read-only analytics→shipment schema is
**generate-only** (never migrated/pushed, since shipment-service owns those tables).

**Versioned migrations.** Each service keeps committed migrations under
`apps/services/<svc>/prisma/migrations/`. On a fresh database, `prisma migrate deploy`
creates everything from the initial `0_init` migration. To evolve a schema, edit that
service's `schema.prisma` and create a new migration from the service directory:

```bash
cd apps/services/<service>
DATABASE_URL="postgresql://smartlogistics:smartlogistics@localhost:<port>/<db>" \
  pnpm exec prisma migrate dev --name <change_name>
```

Commit the generated migration folder, then `pnpm db:migrate` applies it everywhere.
`pnpm db:push` remains available for throwaway prototyping but does not record history.

### Authentication (JWT + rotating refresh tokens)

`user-service` issues a **short-lived signed JWT access token** (`JWT_ACCESS_SECRET`,
default 15m) plus an **opaque refresh token**. `/auth/refresh`
**rotates** the refresh token (the presented token is revoked and a new pair minted),
and `/auth/logout` deletes it for true server-side revocation. The access JWT carries
`{ sub, email, role, roleId }`.

Credentials at rest are hardened: passwords are hashed with **scrypt**
(`scrypt:<salt>:<hash>`, via Node's built-in `crypto`) and verified in constant time;
refresh tokens are stored only as a **SHA-256 fingerprint**, so a leaked DB row cannot
be replayed as a live session. The shared `DEMO_PASSWORD` bypass (so any seeded account
can sign in to showcase roles) is a convenience that is **disabled when
`NODE_ENV=production`** — there, only the stored scrypt hashes are accepted. The
hashing/token helpers live in `packages/shared-middleware/src/auth/password.ts`.

> **Known tradeoff:** the frontend keeps tokens in `localStorage` (header-based auth,
> no cookies/CSRF surface). Moving the refresh token to an `httpOnly` cookie would
> further harden against XSS and is the recommended next step for a production deployment.

### Authorization (centralized at the gateway)

Roles live in a normalized `roles` table (FK from `users_v2.role_id`); each role
carries `pages` (drives the frontend nav/routes) and `apiPrefixes` (drives gateway
authorization). The canonical definitions live in
`packages/shared-middleware/src/auth/roles.ts` and are seeded on user-service startup.

The **API gateway** enforces authorization centrally:

1. On boot it loads the role → `apiPrefixes` policy from `GET /roles` (falling back to
   the canonical `ROLE_DEFS`, refreshed every `RBAC_POLICY_REFRESH_MS`).
2. An `onRequest` hook allowlists public paths (`/health`, `/metrics`, `/auth/login`,
   `/auth/refresh`, `/auth/logout`, `/auth/demo-accounts`); everything else requires a
   valid Bearer JWT (**401** otherwise) and a path prefix permitted for the caller's
   role (**403** otherwise). `/users` and `/auth/register` are admin-only.
3. It strips any client-supplied identity headers and injects the verified
   `x-user-id` / `x-user-role` into proxied requests, so downstream services can trust
   them for defense-in-depth.

Page access on the frontend is **data-driven**: the login response includes the user's
`pages`, and the console renders nav/routes from that list — no hardcoded role map.

---

## 6. Backend data model (ERD)

SmartLogistics is **database-per-service**: each service owns a private datastore and
no service reaches into another's tables directly (the lone exception is the
analytics-service, which holds a **read-only** connection to the shipment database to
recompute metrics). Because of this, there are **no physical foreign keys across
services** — cross-service links are *logical* and are resolved at the application
layer or propagated asynchronously over Kafka.

### Service → datastore → tables

| Service | Engine | Database | Host port | Tables / collections |
| --- | --- | --- | --- | --- |
| user-service | PostgreSQL 16 | `user_service` | 5441 | `roles`, `users_v2`, `admin_profiles`, `auth_tokens` |
| shipment-service | PostgreSQL 16 | `shipment_service` | 5433 | `shipment_records`, `shipment_returns`, `shipment_exceptions`, `shipment_timelines`, `shipment_audits_v2` |
| warehouse-service | PostgreSQL 16 | `warehouse_service` | 5434 | `warehouse_records`, `warehouse_lane_occupancy`, `warehouse_stock_items` |
| courier-service | PostgreSQL 16 | `courier_service` | 5435 | `courier_records` |
| dispatch-service | PostgreSQL 16 | `dispatch_service` | 5436 | `dispatch_workflows`, `dispatch_failure_modes`, `dispatch_workflow_audit` |
| notification-service | PostgreSQL 16 | `notification_service` | 5437 | `notification_log_v2` |
| ai-service | PostgreSQL 16 | `ai_service` | 5438 | `ai_sessions`, `ai_messages`, `ai_artifacts`, `ai_suggestion_feedback` |
| analytics-service | PostgreSQL 16 | `analytics_service` | 5439 | `analytics_snapshots` (+ read-only on `shipment_service`) |
| tracking-service | MongoDB 7 | `tracking_service` | 27018 | `events`, `topics`, `consumers`, `queues`, `dlq_messages`, `dlq_replays` |

> The dispatch-service also relies on Temporal's own `temporal` Postgres database for
> workflow execution state — that is infrastructure managed by Temporal, not an
> application-modeled schema.

### Service relationship map

How the services relate to each other (the service-level view of the cross-references
in the ERD below). **Legend** — `──>` synchronous HTTP (proxied by the gateway);
`══>` asynchronous Kafka domain event (edge label = topic); `╌╌>` logical data
reference / read-only access resolved at the application layer (never a DB foreign key).

```mermaid
flowchart TB
  GW["api-gateway<br/>JWT · RBAC · proxy"]
  US["user-service"]
  SS["shipment-service"]
  WS["warehouse-service"]
  CS["courier-service"]
  DS["dispatch-service"]
  TS["tracking-service"]
  NS["notification-service"]
  AN["analytics-service"]
  AI["ai-service"]

  %% synchronous HTTP — every client call is proxied and identity-injected
  GW -->|HTTP · x-user-id/role| US & SS & WS & CS & DS & TS & NS & AN & AI
  AI -->|live tool-calls| GW

  %% asynchronous Kafka events — dispatch-completion fan-out
  DS ==>|shipment.dispatched| TS
  DS ==>|analytics.event| AN
  DS ==>|notification.trigger| NS

  %% logical data references (read-time, no FK)
  CS -.->|user_id| US
  AI -.->|session.user_id| US
  DS -.->|workflow.shipment| SS
  TS -.->|event.key| SS
  NS -.->|event_id| TS
  AN -.->|read-only SQL| SS
```

Beyond the above, the **dispatch-service** runs its workflows on **Temporal**, the
**notification-service** delivers via **BullMQ/Redis**, and the **ai-service** also
subscribes to `ai.embedding.trigger` (provisioned for future vector indexing). The
**warehouse-service** is self-contained — it owns no cross-service references.

### Combined ERD

**Legend** — solid lines (`──`) are DB-enforced foreign keys (only the user-service
declares relations in Prisma); dashed lines (`╌╌`) are logical references by
convention (a column that holds another row's id but has no FK constraint). Links
labelled **« cross-DB »** / **« cross-store »** span service boundaries and are never
enforced by the database.

```mermaid
erDiagram
  %% ───────────── user-service (user_service) ─────────────
  roles {
    int id PK
    string key UK
    string label
    string description
    json pages
    json api_prefixes
    datetime created_at
  }
  users_v2 {
    string id PK
    string email UK
    string password_hash
    string role
    int role_id FK
    string full_name
    string phone
    string employee_id
    string region
    string status
    datetime last_login_at
    datetime created_at
  }
  admin_profiles {
    string user_id PK "FK → users_v2"
    string access_level
    json managed_regions
    boolean can_manage_users
    string notes
    datetime created_at
  }
  auth_tokens {
    string id PK
    string user_id FK
    string kind
    string token
    datetime created_at
  }

  %% ───────────── shipment-service (shipment_service) ─────────────
  shipment_records {
    string id PK
    string from
    string to
    string weight
    string status
    string priority
    string courier
    string placed
    string eta
    float risk
    int items
    int transit_minutes
    datetime created_at
  }
  shipment_returns {
    string id PK
    string shipment FK
    string reason
    string stage
    string customer
    string refund
    datetime created_at
  }
  shipment_exceptions {
    string id PK
    string shipment FK
    string kind
    string severity
    string age
    string owner_name
    datetime created_at
  }
  shipment_timelines {
    string id PK
    string shipment_id FK
    string label
    string descr
    boolean done
    boolean active
    datetime created_at
  }
  shipment_audits_v2 {
    string id PK
    string shipment_id FK
    string actor
    string action
    string reason
    datetime created_at
  }

  %% ───────────── warehouse-service (warehouse_service) ─────────────
  warehouse_records {
    string id PK
    string city
    string name
    float util
    int lanes
    int inbound
    int outbound
    string throughput
    int stock_low
    datetime created_at
  }
  warehouse_lane_occupancy {
    string id PK
    string warehouse_id FK
    int lane_index
    int occupancy_pct
    datetime created_at
  }
  warehouse_stock_items {
    string id PK
    string warehouse_id FK
    string sku
    string name
    int on_hand
    int reserved
    int threshold_value
    boolean hot
    datetime created_at
  }

  %% ───────────── courier-service (courier_service) ─────────────
  courier_records {
    string id PK
    string user_id FK
    string name
    string city
    string zone
    string status
    int load
    int capacity
    float rating
    int attempts
    int delivered
    datetime created_at
  }

  %% ───────────── dispatch-service (dispatch_service) ─────────────
  dispatch_workflows {
    string id PK
    string type
    string shipment FK
    string status
    string step
    int retries
    string error
    datetime created_at
  }
  dispatch_failure_modes {
    string id PK
    string kind
    int count
    string trend
    json samples
    datetime created_at
  }
  dispatch_workflow_audit {
    int id PK
    string workflow_id FK
    string actor
    string action
    string reason
    string from_step
    string to_step
    string from_status
    string to_status
    string idempotency_key UK
    datetime created_at
  }

  %% ───────────── notification-service (notification_service) ─────────────
  notification_log_v2 {
    string id PK
    string event_id FK
    string channel
    string recipient
    string status
    datetime created_at
  }

  %% ───────────── ai-service (ai_service) ─────────────
  ai_sessions {
    uuid id PK
    uuid user_id FK
    datetime started_at
  }
  ai_messages {
    uuid id PK
    uuid session_id FK
    string role
    string content
    json tools
    json grounded
    int latency_ms
    datetime created_at
  }
  ai_artifacts {
    string kind PK
    json payload
    datetime updated_at
  }
  ai_suggestion_feedback {
    string suggestion_id PK
    string status
    string actor
    string note
    datetime created_at
  }

  %% ───────────── analytics-service (analytics_service) ─────────────
  analytics_snapshots {
    string kind PK
    json payload
    datetime updated_at
  }

  %% ───────────── tracking-service (MongoDB: tracking_service) ─────────────
  events {
    string key FK
    string topic
    string payload
    string lag
    datetime created_at
  }
  topics {
    string name PK
    float msg_s
    int lag
    int partitions
    string schema
  }
  consumers {
    string group PK
    int pods
    int lag
    string status
  }
  queues {
    string name PK
    int pending
    int active
    int failed24h
    int workers
  }
  dlq_messages {
    string id PK
    string topic
    string key
    string payload
    int attempts
    datetime created_at
  }
  dlq_replays {
    string id PK
    string initiator
    int items
    string status
    datetime created_at
  }

  %% ── DB-enforced foreign keys (user-service) ──
  roles ||--o{ users_v2 : "role_id"
  users_v2 ||--o| admin_profiles : "user_id (1:1)"

  %% ── intra-service logical references (no FK constraint) ──
  users_v2 ||..o{ auth_tokens : "user_id"
  shipment_records ||..o{ shipment_returns : "shipment"
  shipment_records ||..o{ shipment_exceptions : "shipment"
  shipment_records ||..o{ shipment_timelines : "shipment_id"
  shipment_records ||..o{ shipment_audits_v2 : "shipment_id"
  warehouse_records ||..o{ warehouse_lane_occupancy : "warehouse_id"
  warehouse_records ||..o{ warehouse_stock_items : "warehouse_id"
  dispatch_workflows ||..o{ dispatch_workflow_audit : "workflow_id"
  ai_sessions ||..o{ ai_messages : "session_id"

  %% ── cross-service / cross-store logical references ──
  users_v2 ||..o{ courier_records : "user_id « cross-DB »"
  users_v2 ||..o{ ai_sessions : "user_id « cross-DB »"
  shipment_records ||..o{ dispatch_workflows : "shipment « cross-DB »"
  shipment_records ||..o{ events : "key « cross-store »"
  events ||..o{ notification_log_v2 : "event_id « cross-store, via Kafka »"
```

### Cross-service references (logical, not FK-enforced)

| From | Column | → Target | Resolved by |
| --- | --- | --- | --- |
| `courier_records` (courier) | `user_id` | `users_v2.id` (user) | App layer at read time |
| `ai_sessions` (ai) | `user_id` | `users_v2.id` (user) | App layer (auth context) |
| `dispatch_workflows` (dispatch) | `shipment` | `shipment_records.id` (shipment) | App layer / workflow input |
| `events` (tracking) | `key` | `shipment_records.id` (shipment) | Kafka message key |
| `notification_log_v2` (notification) | `event_id` | tracking `events` (Mongo) | Kafka event → BullMQ job |
| `analytics_snapshots` (analytics) | — | aggregates over `shipment_records`, `shipment_exceptions` | Read-only cross-DB query |

---

## 7. Service sequence diagrams

The flows below trace the real route handlers. Every request first crosses the
**api-gateway**, which verifies the access JWT, authorizes the caller's role for the
path prefix, and injects `x-user-id` / `x-user-role` before proxying to the owning
service. Each service talks to its own Postgres database through Prisma.

### End-to-end journey (all services in one flow)

A single operational story — sign in, load the console, create and dispatch a
shipment, watch the event fan-out, then ask the assistant — exercising every service.
The dispatch activities advance the workflow row in the dispatch DB; warehouse and
courier data is read while loading the console (their write endpoints are stubs in
this prototype).

```mermaid
sequenceDiagram
  autonumber
  actor C as Operator console
  participant GW as api-gateway
  participant US as user-service
  participant AN as analytics-service
  participant SS as shipment-service
  participant WS as warehouse-service
  participant CS as courier-service
  participant DS as dispatch-service
  participant TW as Temporal worker
  participant K as Kafka
  participant TS as tracking-service
  participant NS as notification-service
  participant RD as Redis · BullMQ
  participant AI as ai-service

  Note over C,US: 1 · Sign in & RBAC policy
  C->>GW: POST /auth/login {email, password} (public)
  GW->>US: proxy
  US->>US: verify password · sign JWT + rotating refresh
  US-->>C: { accessToken, refreshToken, user{role, pages} }
  GW->>US: GET /roles (policy cache refresh)
  US-->>GW: role → {pages, apiPrefixes}

  Note over C,TS: 2 · Load the operations console (Bearer JWT on every call)
  C->>GW: GET /analytics/kpis/overview
  GW->>AN: verify JWT · authorize · proxy
  AN-->>C: live KPIs (read-only aggregate over shipment_service)
  C->>GW: GET /shipments · /warehouses · /couriers · /tracking/events/recent
  GW->>SS: proxy
  GW->>WS: proxy
  GW->>CS: proxy
  GW->>TS: proxy
  SS-->>C: shipments
  WS-->>C: warehouses + lanes/stock
  CS-->>C: courier roster
  TS-->>C: recent events (Mongo)

  Note over C,SS: 3 · Create a shipment
  C->>GW: POST /shipments {reference, priority}
  GW->>SS: proxy
  SS->>SS: INSERT shipment_records + shipment_audits_v2
  SS-->>C: created shipment

  Note over C,K: 4 · Dispatch (Temporal-orchestrated, async)
  C->>GW: POST /dispatch/{shipmentId}/trigger
  GW->>DS: proxy
  DS->>DS: UPSERT dispatch_workflows (running)
  DS->>TW: workflow.start(DispatchWorkflow)
  DS-->>C: { ok, workflowId, orchestrator }
  TW->>TW: activities: validate→reserve→label→assign→init-tracking→markDispatched
  TW->>K: publishDispatchCompleted(shipmentId)

  Note over K,RD: 5 · Event fan-out to three independent consumer groups
  K-->>TS: shipment.dispatched → record milestone (Mongo)
  K-->>AN: analytics.event → increment counters
  K-->>NS: notification.trigger
  NS->>RD: enqueue BullMQ job
  RD-->>NS: worker drains job
  NS->>NS: INSERT notification_log_v2 (delivered)

  Note over C,AI: 6 · Ask the AI assistant (live tool-calling)
  C->>GW: POST /ai/assistant/stream (SSE) {question}
  GW->>AI: proxy
  AI->>GW: ops tool-calls over HTTP (INTERNAL_API_GATEWAY_URL)
  GW->>SS: e.g. GET /shipments
  GW->>DS: e.g. GET /dispatch/kpis
  SS-->>AI: data
  DS-->>AI: data
  AI-->>C: streamed answer (SSE tokens)
```

### Shipment — apply an action / escalate (`POST /shipments/{id}/actions`)

```mermaid
sequenceDiagram
  autonumber
  actor C as Operator console
  participant GW as api-gateway
  participant SS as shipment-service
  participant DB as Postgres · shipment_service

  C->>GW: POST /shipments/{id}/actions<br/>{action, actor, reason} · Bearer JWT
  GW->>GW: verify JWT · authorize role for /shipments
  GW->>SS: proxy + x-user-id / x-user-role
  SS->>SS: zod-validate body (action enum)
  SS->>DB: SELECT shipment_records WHERE id
  alt shipment not found
    SS-->>C: { ok:false, error:"Shipment not found" }
  else found
    SS->>DB: UPDATE shipment_records (status per action)
    SS->>DB: INSERT shipment_audits_v2 (audit trail)
    SS->>DB: ensure + UPDATE shipment_timelines (sync timeline to status)
    SS->>DB: SELECT recent shipment_audits_v2 (last 20)
    SS-->>GW: { ok:true, shipment, audit }
    GW-->>C: 200 OK
  end
```

### Warehouse — load and drill into a facility (`GET /warehouses`, `/:id/lanes`, `/:id/stock`)

```mermaid
sequenceDiagram
  autonumber
  actor C as Operator console
  participant GW as api-gateway
  participant WS as warehouse-service
  participant DB as Postgres · warehouse_service

  C->>GW: GET /warehouses?from&to · Bearer JWT
  GW->>WS: verify JWT · authorize · proxy
  WS->>DB: SELECT warehouse_records (range, take 200)
  WS-->>C: { items: [...] }
  Note over C,WS: operator opens one facility
  C->>GW: GET /warehouses/{id}/lanes
  GW->>WS: proxy
  WS->>DB: SELECT warehouse_lane_occupancy WHERE warehouse_id ORDER BY lane_index
  WS-->>C: { items: [occupancyPct, ...] }
  C->>GW: GET /warehouses/{id}/stock
  GW->>WS: proxy
  WS->>DB: SELECT warehouse_stock_items WHERE warehouse_id
  WS-->>C: { items: [{sku, on, reserved, threshold, hot}, ...] }
```

### Courier — onboard a rider and list the roster (`POST /couriers`, `GET /couriers`)

```mermaid
sequenceDiagram
  autonumber
  actor C as Operator console
  participant GW as api-gateway
  participant CS as courier-service
  participant DB as Postgres · courier_service

  Note over CS,DB: courier_records.user_id is a logical ref to<br/>user-service users_v2 (resolved at the app layer, no FK)
  C->>GW: POST /couriers { userId, name } · Bearer JWT
  GW->>CS: verify JWT · authorize · proxy
  CS->>CS: zod-validate { userId, name }
  CS->>DB: INSERT courier_records (id C-####, defaults)
  CS-->>C: 200 created courier
  C->>GW: GET /couriers?from&to
  GW->>CS: proxy
  CS->>DB: SELECT courier_records (range, take 300)
  CS-->>C: { items: [...] }
```

### Dispatch — orchestrated dispatch with Temporal + inline fallback (`POST /dispatch/{shipmentId}/trigger`)

```mermaid
sequenceDiagram
  autonumber
  actor C as Operator / system
  participant GW as api-gateway
  participant DS as dispatch-service
  participant DB as Postgres · dispatch_service
  participant TW as Temporal worker
  participant K as Kafka
  participant DN as tracking / analytics / notification

  C->>GW: POST /dispatch/{shipmentId}/trigger · Bearer JWT
  GW->>DS: verify JWT · authorize · proxy
  DS->>DB: UPSERT dispatch_workflows (status=running, step=assign_courier)
  alt Temporal reachable (preferred · async)
    DS->>TW: workflow.start(DispatchWorkflow) — returns handle
    DS-->>C: { ok:true, workflowId, orchestrator:"temporal" }
    Note over TW,DB: later, on the worker (one activity per step)
    TW->>DB: advance step: validate → reserve → label → assign → init-tracking
    TW->>DB: markDispatched → UPDATE (step=close, status=completed)
    TW->>K: publishDispatchCompleted(shipmentId)
  else Temporal unavailable (inline fallback · sync)
    DS->>DB: runDispatchInline → same activity sequence
    DS->>DB: markDispatched → UPDATE (step=close, status=completed)
    DS->>K: publishDispatchCompleted(shipmentId)
    DS-->>C: { ok:true, workflowId, orchestrator:"inline" }
  end
  K-->>DN: shipment.dispatched · analytics.event · notification.trigger
```

---

## 8. Technology stack

**Monorepo & tooling**
- pnpm workspaces, Turborepo, TypeScript, tsx, ESM

**Frontend** (`apps/frontend`)
- React 18, Vite 5, TanStack Router (+ TanStack Query client)
- Tailwind CSS with `clsx` + `tailwind-merge`; hand-rolled inline SVG icons & charts (no UI/chart libs)
- `fetch`-based API layer with Bearer-token auth headers (see `src/lib/api.ts`)

**Backend services** (`apps/services/*`)
- Fastify (with `@fastify/http-proxy`, `@fastify/cors`, `@fastify/rate-limit`)
- Zod for validation, shared middleware (Pino logging, request IDs)
- Temporal (dispatch workflows), BullMQ (notification jobs)
- Vercel AI SDK (`ai`) + `@ai-sdk/groq` for the AI assistant and recommendations

**Data & messaging**
- PostgreSQL 16 (per-service databases) via **Prisma ORM**, TimescaleDB (analytics)
- MongoDB 7 (warehouse + tracking, native driver), Redis 7 (cache + BullMQ)
- Apache Kafka + Confluent Schema Registry, Qdrant (vector store)
- Auth: signed JWT access tokens + rotating opaque refresh tokens (`jsonwebtoken`); scrypt password hashing + SHA-256 refresh-token fingerprints at rest

**Observability**
- Prometheus, Grafana, Jaeger (OpenTelemetry OTLP), Temporal UI

**Infrastructure**
- Docker Compose for all infra and (optionally) containerized services
