/** Workflow input — safe to import from workflow code (no Node APIs). */
export type DispatchWorkflowInput = {
  workflowId: string;
  shipmentId: string;
  shipmentTracking?: string;
};

export type ShipmentSnapshot = {
  shipmentId: string;
  fromWarehouseId: string;
  courierId: string;
  courierCode: string;
  status: string;
};

export const UNASSIGNED_ID = "00000000-0000-0000-0000-000000000000";

export const NON_DISPATCHABLE_STATUSES = new Set(["delivered", "failed", "returned", "cancelled"]);
