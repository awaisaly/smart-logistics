import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TableColumn<R> = {
  key: string;
  label: string;
  align?: "left" | "right";
  mono?: boolean;
  render?: (row: R) => ReactNode;
  width?: number | string;
};

export function Table<R extends Record<string, unknown>>({
  columns,
  rows,
  idKey = "id",
  selectedId,
  onRowClick,
  dense,
  emptyText = "No rows available.",
  fixedLayout,
}: {
  columns: Array<TableColumn<R>>;
  rows: R[];
  idKey?: string;
  selectedId?: string;
  onRowClick?: (row: R) => void;
  dense?: boolean;
  emptyText?: string;
  fixedLayout?: boolean;
}): JSX.Element {
  if (!rows || rows.length === 0) {
    return (
      <div className="px-4 py-3.5 text-[11.5px] text-mute">{emptyText}</div>
    );
  }

  const cellPad = dense ? "px-2.5 py-1.5" : "px-3 py-2";

  return (
    <div className="overflow-auto min-w-0">
      <table
        className={cn(
          "w-full border-collapse",
          dense ? "text-[11.5px]" : "text-[12.5px]",
          fixedLayout && "table-fixed",
        )}
      >
        <thead>
          <tr className="bg-bg-warm text-mute">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  cellPad,
                  "font-medium border-b border-line/80 text-[10.5px] uppercase tracking-wide whitespace-nowrap",
                  c.align === "right" ? "text-right" : "text-left",
                )}
                style={{ width: c.width }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ridx) => {
            const id = String(row[idKey] ?? ridx);
            const active =
              selectedId !== undefined && String(selectedId) === id;

            return (
              <tr
                key={id}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  onRowClick && "cursor-pointer",
                  active ? "bg-info-soft" : "bg-transparent",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      cellPad,
                      "border-b border-line/80 text-ink-2 align-top",
                      c.align === "right" ? "text-right" : "text-left",
                      c.mono && "font-mono",
                    )}
                  >
                    {c.render ? c.render(row) : String(row[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
