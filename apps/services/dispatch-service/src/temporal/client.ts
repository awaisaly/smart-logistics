import { Connection, Client } from "@temporalio/client";

export async function startDispatchWorkflow(shipmentId: string): Promise<string> {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "temporal:7233"
  });
  const client = new Client({ connection });

  const workflowId = `dispatch-${shipmentId}`;
  await client.workflow.start("DispatchWorkflow", {
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "smart-logistics",
    workflowId,
    args: [shipmentId]
  });
  return workflowId;
}
