import { shipmentDb } from "../../db.js";
import { UNASSIGNED_ID } from "../../types.js";

export async function assignShipmentCourier(input: {
  shipmentId: string;
  courierId: string;
  courierCode: string;
}): Promise<void> {
  await shipmentDb.shipmentRecord.update({
    where: { id: input.shipmentId },
    data: { courierId: input.courierId, courierCode: input.courierCode }
  });
}

export async function clearShipmentCourier(input: { shipmentId: string }): Promise<void> {
  await shipmentDb.shipmentRecord.update({
    where: { id: input.shipmentId },
    data: { courierId: UNASSIGNED_ID, courierCode: "—" }
  });
}
