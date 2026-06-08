import { proxyActivities } from "@temporalio/workflow";
import type { DispatchWorkflowInput } from "../types.js";
import type * as activities from "../activities/index.js";

const act = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minute",
  retry: { maximumAttempts: 3 }
});

/** Compensating SAGA: one forward activity per step; undo reversible steps on failure. */
export async function DispatchWorkflow(input: DispatchWorkflowInput): Promise<void> {
  const compensations: Array<() => Promise<void>> = [];

  try {
    const shipment = await act.validateShipment(input.shipmentId);

    await act.setWorkflowStep({
      workflowId: input.workflowId,
      shipmentId: input.shipmentId,
      step: "assign_courier"
    });

    const stock = await act.reserveInventory({
      shipmentId: input.shipmentId,
      warehouseId: shipment.fromWarehouseId
    });
    compensations.push(() => act.releaseInventory({ stockItemId: stock.stockItemId }));

    const previousStatus = await act.setShipmentStatus({
      shipmentId: input.shipmentId,
      status: "dispatched"
    });
    compensations.push(() =>
      act.revertShipmentStatus({ shipmentId: input.shipmentId, status: previousStatus })
    );

    await act.assignShipmentCourier({
      shipmentId: input.shipmentId,
      courierId: shipment.courierId,
      courierCode: shipment.courierCode
    });
    compensations.push(() => act.clearShipmentCourier({ shipmentId: input.shipmentId }));

    await act.incrementCourierLoad({ courierId: shipment.courierId });
    compensations.push(() => act.decrementCourierLoad({ courierId: shipment.courierId }));

    await act.setWorkflowStep({
      workflowId: input.workflowId,
      shipmentId: input.shipmentId,
      step: "in_transit"
    });

    await act.publishDispatched({ shipmentId: input.shipmentId });

    await act.completeWorkflow({
      workflowId: input.workflowId,
      shipmentId: input.shipmentId
    });
  } catch (err) {
    for (let i = compensations.length - 1; i >= 0; i -= 1) {
      try {
        await compensations[i]!();
      } catch {
        // Compensation failures are logged inside activities; continue undoing.
      }
    }
    await act.failWorkflow({
      workflowId: input.workflowId,
      shipmentId: input.shipmentId,
      error: err instanceof Error ? err.message : String(err)
    });
    throw err;
  }
}
