import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PillTone = "neutral" | "ok" | "warn" | "err" | "info" | "accent";

const toneClasses: Record<PillTone, string> = {
  neutral: "bg-neutral-soft text-neutral",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  err: "bg-err-soft text-err",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent-ink",
};

export function PrototypePill({
  tone = "neutral",
  children,
  size = "md",
  className,
}: {
  tone?: PillTone;
  children: ReactNode;
  size?: "sm" | "md";
  className?: string;
}): JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-0.5 text-[11px]",
        toneClasses[tone] ?? toneClasses.neutral,
        className,
      )}
    >
      {children}
    </span>
  );
}
