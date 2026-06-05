import { prisma } from "../../db.js";
import { publishDispatchCompleted } from "../../events/publish.js";

const workflowId = (shipmentId: string) => `dispatch-${shipmentId}`;

// Advance the durable workflow row one step at a time. Each step is its own
// Temporal activity, so retries/timeouts/visibility apply per step.
const advance = async (shipmentId: string, step: string): Promise<void> => {
  await prisma.dispatchWorkflow.updateMany({
    where: { id: workflowId(shipmentId) },
    data: { step, status: "running", error: null }
  });
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
  await prisma.dispatchWorkflow.updateMany({
    where: { id: workflowId(shipmentId) },
    data: { step: "close", status: "completed", error: null }
  });
  // Only the durable workflow marks the shipment dispatched, then fans out.
  await publishDispatchCompleted(shipmentId);
}
