import { STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "approved"
      ? "bg-success/15 text-success border-success/30"
      : status === "rejected"
        ? "bg-destructive/10 text-destructive border-destructive/25"
        : "bg-warning/20 text-warning-foreground border-warning/40";

  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        styles,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
