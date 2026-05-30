import { cn } from "@/lib/utils";

export function SkeletonBlock({
  h = 14,
  className,
}: {
  h?: number;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={cn("sl-skeleton rounded-md", className)}
      style={{ height: h }}
    />
  );
}
