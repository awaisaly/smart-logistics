import { shipmentDb } from "../../db.js";

export async function setShipmentStatus(input: {
  shipmentId: string;
  status: string;
}): Promise<string> {
  const row = await shipmentDb.shipmentRecord.findUnique({
    where: { id: input.shipmentId },
    select: { status: true }
  });
  if (!row) {
    throw new Error(`Shipment not found: ${input.shipmentId}`);
  }
  const previousStatus = row.status;
  if (previousStatus === input.status) {
    return previousStatus;
  }
  await shipmentDb.shipmentRecord.update({
    where: { id: input.shipmentId },
    data: { status: input.status }
  });
  return previousStatus;
}

export async function revertShipmentStatus(input: {
  shipmentId: string;
  status: string;
}): Promise<void> {
  await shipmentDb.shipmentRecord.update({
    where: { id: input.shipmentId },
    data: { status: input.status }
  });
}
