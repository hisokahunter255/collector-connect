import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
  onClick,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  tone?: "default" | "accent" | "warning" | "success";
  onClick?: () => void;
}) {
  const toneClass = {
    default: "bg-secondary text-secondary-foreground",
    accent: "bg-accent/25 text-accent-foreground",
    warning: "bg-warning/25 text-warning-foreground",
    success: "bg-success/20 text-success",
  }[tone];

  return (
    <div
      onClick={onClick}
      className={cn(
        "card-elevated flex items-start gap-3 p-4",
        onClick && "cursor-pointer transition-shadow hover:shadow-lg",
      )}
    >
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", toneClass)}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-bold leading-tight text-foreground">{value}</p>
        {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
