import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as dispatchActivities from "./activities/dispatch.activities.js";
import * as deliveryActivities from "./activities/delivery.activities.js";

// Resolve the workflows entrypoint for both built (`.js` in dist) and dev
// (`.ts` under tsx) so the Temporal bundler always finds real source.
function resolveWorkflowsPath(): string {
  const js = fileURLToPath(new URL("./workflows/index.js", import.meta.url));
  if (existsSync(js)) return js;
  return fileURLToPath(new URL("./workflows/index.ts", import.meta.url));
}

/**
 * Runs the Temporal worker that executes dispatch/delivery workflow code and
 * their activities. Started best-effort from the service bootstrap so the HTTP
 * API still comes up if Temporal is unavailable.
 */
export async function startDispatchWorker(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS ?? "temporal:7233";
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "smart-logistics";

  const connection = await NativeConnection.connect({ address });
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    taskQueue,
    workflowsPath: resolveWorkflowsPath(),
    activities: { ...dispatchActivities, ...deliveryActivities }
  });

  await worker.run();
}
