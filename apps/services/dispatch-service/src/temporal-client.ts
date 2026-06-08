import { Client, Connection } from "@temporalio/client";

export type DispatchWorkflowInput = {
  workflowId: string;
  shipmentId: string;
  shipmentTracking?: string;
};

/** Starts a dispatch SAGA run on the shared Temporal task queue (worker: temporal-service). */
export async function startDispatchWorkflow(input: DispatchWorkflowInput): Promise<string> {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "temporal:7233"
  });
  const client = new Client({ connection });

  await client.workflow.start("DispatchWorkflow", {
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "smart-logistics",
    workflowId: input.workflowId,
    args: [input]
  });
  return input.workflowId;
}
