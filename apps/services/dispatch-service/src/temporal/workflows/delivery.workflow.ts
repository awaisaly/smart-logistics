import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities/delivery.activities.js";

const deliveryActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minute"
});

export async function DeliveryWorkflow(shipmentId: string): Promise<void> {
  await deliveryActivities.recordPickup(shipmentId);
  await deliveryActivities.processStatusUpdate(shipmentId);
  await deliveryActivities.recordDeliveryAttempt(shipmentId);
  await deliveryActivities.confirmDelivery(shipmentId);
  await deliveryActivities.triggerPostDelivery(shipmentId);
}
