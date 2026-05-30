import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities/dispatch.activities.js";

const dispatchActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minute"
});

export async function DispatchWorkflow(shipmentId: string): Promise<void> {
  await dispatchActivities.validateShipment(shipmentId);
  await dispatchActivities.reserveInventory(shipmentId);
  await dispatchActivities.generateShippingLabel(shipmentId);
  await dispatchActivities.assignCourier(shipmentId);
  await dispatchActivities.initializeTracking(shipmentId);
  await dispatchActivities.markDispatched(shipmentId);
}
