import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities/index.js";

function resolveWorkflowsPath(): string {
  const js = fileURLToPath(new URL("./workflows/index.js", import.meta.url));
  if (existsSync(js)) return js;
  return fileURLToPath(new URL("./workflows/index.ts", import.meta.url));
}

export async function startTemporalWorker(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS ?? "temporal:7233";
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "smart-logistics";

  const connection = await NativeConnection.connect({ address });
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    taskQueue,
    workflowsPath: resolveWorkflowsPath(),
    activities
  });

  await worker.run();
}
