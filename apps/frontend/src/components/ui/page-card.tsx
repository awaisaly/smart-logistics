import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageCardProps = {
  title?: string;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
  padding?: number;
  bodyClassName?: string;
  className?: string;
  bodyStyle?: CSSProperties;
  style?: CSSProperties;
};

export function PageCard({
  title,
  sub,
  action,
  children,
  padding,
  bodyClassName,
  className,
  bodyStyle,
  style,
}: PageCardProps): JSX.Element {
  const bodyPad = padding ?? 14;
  const hasHeader = Boolean(title || action || sub);

  return (
    <div
      className={cn(
        "bg-surface border border-line/80 rounded-lg shadow-sm flex flex-col min-w-0",
        className,
      )}
      style={style}
    >
      {hasHeader && (
        <div className="flex items-start justify-between px-3.5 pt-3 pb-1.5 gap-3">
          <div className="min-w-0">
            {title && (
              <div className="text-[13px] text-ink font-medium">{title}</div>
            )}
            {sub && (
              <div className="text-[10.5px] text-mute mt-0.5">{sub}</div>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div
        className={cn("min-w-0", bodyClassName)}
        style={{
          padding: bodyPad,
          paddingTop: hasHeader ? 8 : bodyPad,
          ...bodyStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
