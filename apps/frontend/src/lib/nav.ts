import type { IconName } from "@/components/ui/icon";

export type NavItem = {
  to: string;
  id: string;
  label: string;
  icon: IconName;
  badge?: "returns" | "dispatch" | "eventsPulse";
};

export const NAV: NavItem[] = [
  { id: "overview", to: "/overview", label: "Overview", icon: "home" },
  { id: "shipments", to: "/shipments", label: "Shipments", icon: "package" },
  { id: "dispatch", to: "/dispatch", label: "Dispatch monitor", icon: "workflow", badge: "dispatch" },
  { id: "warehouse", to: "/warehouses", label: "Warehouses", icon: "warehouse" },
  { id: "couriers", to: "/couriers", label: "Couriers", icon: "courier" },
  { id: "events", to: "/events", label: "Events & queues", icon: "events", badge: "eventsPulse" },
  { id: "analytics", to: "/analytics", label: "Analytics", icon: "chart" },
  { id: "returns", to: "/returns", label: "Returns & RMA", icon: "rotate", badge: "returns" },
  { id: "observability", to: "/observability", label: "Observability", icon: "pulse" },
  { id: "ai", to: "/ai", label: "Assistant", icon: "ai" },
];
