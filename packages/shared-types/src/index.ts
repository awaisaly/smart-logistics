import { z } from "zod";

export const roleSchema = z.enum(["admin", "warehouse_operator", "courier", "customer_support"]);
export type Role = z.infer<typeof roleSchema>;

export const shipmentStatusSchema = z.enum([
  "CREATED",
  "PENDING",
  "APPROVED",
  "DISPATCHED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RETURNED",
  "CANCELLED"
]);
export type ShipmentStatus = z.infer<typeof shipmentStatusSchema>;

export const shipmentSchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: shipmentStatusSchema,
  priority: z.string(),
  createdAt: z.string()
});
export type Shipment = z.infer<typeof shipmentSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20)
});
export type Pagination = z.infer<typeof paginationSchema>;

export const trackingEventSchema = z.object({
  eventId: z.string(),
  shipmentId: z.string(),
  milestone: z.string(),
  occurredAt: z.string()
});
export type TrackingEvent = z.infer<typeof trackingEventSchema>;

export const aiPromptSchema = z.object({
  prompt: z.string().min(1),
  sessionId: z.string().optional()
});
export type AiPrompt = z.infer<typeof aiPromptSchema>;

export * from "./permissions.js";
export * from "./codes.js";
