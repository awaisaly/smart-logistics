import { Pool } from "pg";
import { publishDispatchCompleted } from "../../events/publish.js";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    `postgresql://${process.env.POSTGRES_USER ?? "smartlogistics"}:${process.env.POSTGRES_PASSWORD ?? "smartlogistics"}@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? "5436"}/dispatch_service`
});

const workflowId = (shipmentId: string) => `dispatch-${shipmentId}`;

// Advance the durable workflow row one step at a time. Each step is its own
// Temporal activity, so retries/timeouts/visibility apply per step.
const advance = async (shipmentId: string, step: string): Promise<void> => {
  await pool.query(
    `UPDATE dispatch_workflows
     SET step = $2, status = 'running', error = NULL
     WHERE id = $1`,
    [workflowId(shipmentId), step]
  );
};

export async function validateShipment(shipmentId: string): Promise<void> {
  await advance(shipmentId, "assign_courier");
}

export async function reserveInventory(shipmentId: string): Promise<void> {
  await advance(shipmentId, "pickup_at_warehouse");
}

export async function generateShippingLabel(shipmentId: string): Promise<void> {
  await advance(shipmentId, "in_transit");
}

export async function assignCourier(shipmentId: string): Promise<void> {
  await advance(shipmentId, "last_mile");
}

export async function initializeTracking(shipmentId: string): Promise<void> {
  await advance(shipmentId, "deliver");
}

export async function markDispatched(shipmentId: string): Promise<void> {
  await pool.query(
    `UPDATE dispatch_workflows
     SET step = 'close', status = 'completed', error = NULL
     WHERE id = $1`,
    [workflowId(shipmentId)]
  );
  // Only the durable workflow marks the shipment dispatched, then fans out.
  await publishDispatchCompleted(shipmentId);
}
