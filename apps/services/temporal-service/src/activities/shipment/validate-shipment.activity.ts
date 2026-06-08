import { shipmentDb } from "../../db.js";
import { NON_DISPATCHABLE_STATUSES, type ShipmentSnapshot } from "../../types.js";

export async function validateShipment(shipmentId: string): Promise<ShipmentSnapshot> {
  const row = await shipmentDb.shipmentRecord.findUnique({ where: { id: shipmentId } });
  if (!row) {
    throw new Error(`Shipment not found: ${shipmentId}`);
  }
  if (NON_DISPATCHABLE_STATUSES.has(row.status)) {
    throw new Error(`Shipment ${shipmentId} is not dispatchable (status=${row.status})`);
  }
  return {
    shipmentId: row.id,
    fromWarehouseId: row.fromWarehouseId,
    courierId: row.courierId,
    courierCode: row.courierCode,
    status: row.status
  };
}
