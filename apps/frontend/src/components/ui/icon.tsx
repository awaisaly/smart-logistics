import type { ReactNode } from "react";

export type IconName =
  | "home"
  | "package"
  | "workflow"
  | "warehouse"
  | "courier"
  | "events"
  | "chart"
  | "rotate"
  | "pulse"
  | "ai"
  | "search"
  | "truck"
  | "close"
  | "send"
  | "sparkle"
  | "chevronL"
  | "chevronR";

const paths: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 9.5V21h14V9.5" />
    </>
  ),
  package: (
    <>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </>
  ),
  workflow: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 6H15.5M6 8.5v7M18 8.5v7M8.5 18h7" />
    </>
  ),
  warehouse: (
    <>
      <path d="M3 21V9l9-5 9 5v12" />
      <path d="M3 21h18" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  courier: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 21c0-3.5 3-6 7-6s7 2.5 7 6" />
    </>
  ),
  events: (
    <>
      <path d="M4 6h16M4 12h10M4 18h16" />
      <circle cx="19" cy="12" r="1.6" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16l3-4 3 2 5-7" />
    </>
  ),
  rotate: (
    <>
      <path d="M21 12a9 9 0 11-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  ai: (
    <>
      <path d="M12 3l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" />
      <path d="M19 14l1 2 2 1-2 1-1 2-1 2-2-1 2-1z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  truck: (
    <>
      <path d="M3 7h11v9H3z" />
      <path d="M14 10h4l3 3v3h-7" />
      <circle cx="7" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  send: (
    <>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
      <path d="M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M5.6 18.4l4.2-4.2M14.2 9.8l4.2-4.2" />
    </>
  ),
  chevronL: <path d="M15 6l-6 6 6 6" />,
  chevronR: <path d="M9 6l6 6-6 6" />,
};

export function Icon({
  name,
  size = 16,
  stroke = 1.6,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
