import { Badge } from "@/components/ui/badge";

export function CycleStatusBadge({ status }: { status: string | null }) {
  const open = status === "open";
  return (
    <Badge
      variant="outline"
      className={open ? "border-success/40 bg-success/10 text-success" : "border-border bg-secondary text-secondary-foreground"}
    >
      <span className={open ? "me-1.5 size-1.5 rounded-full bg-success" : "me-1.5 size-1.5 rounded-full bg-muted-foreground"} />
      {open ? "دورة مفتوحة" : "دورة منتهية"}
    </Badge>
  );
}
