import { dispatchDb } from "../../db.js";

export async function setWorkflowStep(input: {
  workflowId: string;
  shipmentId: string;
  step: string;
  status?: string;
}): Promise<void> {
  await dispatchDb.dispatchWorkflow.updateMany({
    where: { id: input.workflowId, shipmentId: input.shipmentId },
    data: {
      step: input.step,
      ...(input.status ? { status: input.status } : {})
    }
  });
}

export async function completeWorkflow(input: {
  workflowId: string;
  shipmentId: string;
}): Promise<void> {
  await dispatchDb.dispatchWorkflow.updateMany({
    where: { id: input.workflowId, shipmentId: input.shipmentId },
    data: { status: "completed", step: "close", error: null }
  });
}

export async function failWorkflow(input: {
  workflowId: string;
  shipmentId: string;
  error: string;
}): Promise<void> {
  await dispatchDb.dispatchWorkflow.updateMany({
    where: { id: input.workflowId, shipmentId: input.shipmentId },
    data: { status: "failing", step: "compensate", error: input.error.slice(0, 500) }
  });
}
