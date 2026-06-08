import { publishDispatchCompleted } from "../../events/publish.js";

export async function publishDispatched(input: { shipmentId: string }): Promise<void> {
  await publishDispatchCompleted(input.shipmentId);
}
