import { beforeEach, describe, expect, it, vi } from "vitest";

const shipmentDb = vi.hoisted(() => ({
  shipmentRecord: {
    findUnique: vi.fn(),
    update: vi.fn()
  }
}));

const warehouseDb = vi.hoisted(() => ({
  warehouseStockItem: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  }
}));

const courierDb = vi.hoisted(() => ({
  courierRecord: {
    findUnique: vi.fn(),
    update: vi.fn()
  }
}));

const dispatchDb = vi.hoisted(() => ({
  dispatchWorkflow: {
    updateMany: vi.fn()
  }
}));

vi.mock("../../apps/services/temporal-service/src/db.js", () => ({
  shipmentDb,
  warehouseDb,
  courierDb,
  dispatchDb
}));

vi.mock("../../apps/services/temporal-service/src/events/publish.js", () => ({
  publishDispatchCompleted: vi.fn(async () => true)
}));

import { validateShipment } from "../../apps/services/temporal-service/src/activities/shipment/validate-shipment.activity.js";
import { setShipmentStatus, revertShipmentStatus } from "../../apps/services/temporal-service/src/activities/shipment/set-shipment-status.activity.js";
import { reserveInventory, releaseInventory } from "../../apps/services/temporal-service/src/activities/warehouse/reserve-inventory.activity.js";
import { incrementCourierLoad, decrementCourierLoad } from "../../apps/services/temporal-service/src/activities/courier/increment-courier-load.activity.js";
import { setWorkflowStep, completeWorkflow, failWorkflow } from "../../apps/services/temporal-service/src/activities/dispatch/set-workflow-step.activity.js";
import { publishDispatched } from "../../apps/services/temporal-service/src/activities/events/publish-dispatched.activity.js";
import { publishDispatchCompleted } from "../../apps/services/temporal-service/src/events/publish.js";

describe("temporal-service dispatch activities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateShipment", () => {
    it("returns a snapshot for dispatchable shipments", async () => {
      shipmentDb.shipmentRecord.findUnique.mockResolvedValue({
        id: "ship-1",
        fromWarehouseId: "wh-1",
        courierId: "c-1",
        courierCode: "C-0001",
        status: "pending"
      });

      const snapshot = await validateShipment("ship-1");
      expect(snapshot).toEqual({
        shipmentId: "ship-1",
        fromWarehouseId: "wh-1",
        courierId: "c-1",
        courierCode: "C-0001",
        status: "pending"
      });
    });

    it("throws when shipment is missing", async () => {
      shipmentDb.shipmentRecord.findUnique.mockResolvedValue(null);
      await expect(validateShipment("missing")).rejects.toThrow("Shipment not found");
    });

    it("throws when shipment is not dispatchable", async () => {
      shipmentDb.shipmentRecord.findUnique.mockResolvedValue({
        id: "ship-1",
        status: "delivered"
      });
      await expect(validateShipment("ship-1")).rejects.toThrow("not dispatchable");
    });
  });

  describe("setShipmentStatus", () => {
    it("updates status and returns the previous value", async () => {
      shipmentDb.shipmentRecord.findUnique.mockResolvedValue({ status: "pending" });
      shipmentDb.shipmentRecord.update.mockResolvedValue({});

      const prev = await setShipmentStatus({ shipmentId: "ship-1", status: "dispatched" });
      expect(prev).toBe("pending");
      expect(shipmentDb.shipmentRecord.update).toHaveBeenCalledWith({
        where: { id: "ship-1" },
        data: { status: "dispatched" }
      });
    });

    it("reverts status during compensation", async () => {
      await revertShipmentStatus({ shipmentId: "ship-1", status: "pending" });
      expect(shipmentDb.shipmentRecord.update).toHaveBeenCalledWith({
        where: { id: "ship-1" },
        data: { status: "pending" }
      });
    });
  });

  describe("reserveInventory / releaseInventory", () => {
    it("increments reserved on the first available stock row", async () => {
      warehouseDb.warehouseStockItem.findFirst.mockResolvedValue({
        id: "stock-1",
        onHand: 10,
        reserved: 2
      });
      warehouseDb.warehouseStockItem.update.mockResolvedValue({});

      const result = await reserveInventory({ shipmentId: "ship-1", warehouseId: "wh-1" });
      expect(result).toEqual({ stockItemId: "stock-1" });
      expect(warehouseDb.warehouseStockItem.update).toHaveBeenCalledWith({
        where: { id: "stock-1" },
        data: { reserved: { increment: 1 } }
      });
    });

    it("releases reserved inventory idempotently", async () => {
      warehouseDb.warehouseStockItem.findUnique.mockResolvedValue({ reserved: 0 });
      await releaseInventory({ stockItemId: "stock-1" });
      expect(warehouseDb.warehouseStockItem.update).not.toHaveBeenCalled();
    });
  });

  describe("incrementCourierLoad / decrementCourierLoad", () => {
    it("increments load when under capacity", async () => {
      courierDb.courierRecord.findUnique.mockResolvedValue({ load: 2, capacity: 10 });
      await incrementCourierLoad({ courierId: "c-1" });
      expect(courierDb.courierRecord.update).toHaveBeenCalledWith({
        where: { id: "c-1" },
        data: { load: { increment: 1 } }
      });
    });

    it("skips decrement when load is already zero", async () => {
      courierDb.courierRecord.findUnique.mockResolvedValue({ load: 0 });
      await decrementCourierLoad({ courierId: "c-1" });
      expect(courierDb.courierRecord.update).not.toHaveBeenCalled();
    });
  });

  describe("dispatch workflow row updates", () => {
    it("sets workflow step", async () => {
      await setWorkflowStep({
        workflowId: "wf-1",
        shipmentId: "ship-1",
        step: "in_transit"
      });
      expect(dispatchDb.dispatchWorkflow.updateMany).toHaveBeenCalledWith({
        where: { id: "wf-1", shipmentId: "ship-1" },
        data: { step: "in_transit" }
      });
    });

    it("marks workflow completed", async () => {
      await completeWorkflow({ workflowId: "wf-1", shipmentId: "ship-1" });
      expect(dispatchDb.dispatchWorkflow.updateMany).toHaveBeenCalledWith({
        where: { id: "wf-1", shipmentId: "ship-1" },
        data: { status: "completed", step: "close", error: null }
      });
    });

    it("marks workflow failing on saga error", async () => {
      await failWorkflow({ workflowId: "wf-1", shipmentId: "ship-1", error: "boom" });
      expect(dispatchDb.dispatchWorkflow.updateMany).toHaveBeenCalledWith({
        where: { id: "wf-1", shipmentId: "ship-1" },
        data: { status: "failing", step: "compensate", error: "boom" }
      });
    });
  });

  describe("publishDispatched", () => {
    it("delegates to Kafka publisher", async () => {
      await publishDispatched({ shipmentId: "ship-1" });
      expect(publishDispatchCompleted).toHaveBeenCalledWith("ship-1");
    });
  });
});
