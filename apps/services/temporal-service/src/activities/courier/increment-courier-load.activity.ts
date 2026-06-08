import { courierDb } from "../../db.js";

export async function incrementCourierLoad(input: { courierId: string }): Promise<void> {
  const courier = await courierDb.courierRecord.findUnique({
    where: { id: input.courierId },
    select: { load: true, capacity: true }
  });
  if (!courier) {
    throw new Error(`Courier not found: ${input.courierId}`);
  }
  if (courier.load >= courier.capacity) {
    throw new Error(`Courier ${input.courierId} at capacity (${courier.load}/${courier.capacity})`);
  }
  await courierDb.courierRecord.update({
    where: { id: input.courierId },
    data: { load: { increment: 1 } }
  });
}

export async function decrementCourierLoad(input: { courierId: string }): Promise<void> {
  const courier = await courierDb.courierRecord.findUnique({
    where: { id: input.courierId },
    select: { load: true }
  });
  if (!courier || courier.load <= 0) {
    return;
  }
  await courierDb.courierRecord.update({
    where: { id: input.courierId },
    data: { load: { decrement: 1 } }
  });
}
