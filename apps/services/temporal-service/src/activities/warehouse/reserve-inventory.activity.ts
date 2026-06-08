import { warehouseDb } from "../../db.js";

export async function reserveInventory(input: {
  shipmentId: string;
  warehouseId: string;
}): Promise<{ stockItemId: string }> {
  const stock = await warehouseDb.warehouseStockItem.findFirst({
    where: { warehouseId: input.warehouseId, onHand: { gt: 0 } },
    orderBy: { onHand: "desc" }
  });
  if (!stock) {
    throw new Error(`No stock available at warehouse ${input.warehouseId} for shipment ${input.shipmentId}`);
  }
  if (stock.reserved >= stock.onHand) {
    throw new Error(`Stock item ${stock.id} fully reserved for shipment ${input.shipmentId}`);
  }
  await warehouseDb.warehouseStockItem.update({
    where: { id: stock.id },
    data: { reserved: { increment: 1 } }
  });
  return { stockItemId: stock.id };
}

export async function releaseInventory(input: { stockItemId: string }): Promise<void> {
  const stock = await warehouseDb.warehouseStockItem.findUnique({
    where: { id: input.stockItemId },
    select: { reserved: true }
  });
  if (!stock || stock.reserved <= 0) {
    return;
  }
  await warehouseDb.warehouseStockItem.update({
    where: { id: input.stockItemId },
    data: { reserved: { decrement: 1 } }
  });
}
