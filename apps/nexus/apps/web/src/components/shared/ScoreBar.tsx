import { cn } from "@/lib/utils";

export function ScoreBar({ value, max = 10, label, className = "" }: { value: number | null | undefined; max?: number; label?: string; className?: string }) {
  const safe = typeof value === "number" ? value : 0;
  const pct = Math.max(0, Math.min(100, (safe / max) * 100));
  const tone = safe >= 8 ? "bg-success" : safe >= 6 ? "bg-warning" : "bg-destructive";
  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground capitalize">{label.replace(/_/g, " ")}</span>
          <span className="font-mono tabular-nums font-medium">{typeof value === "number" ? value.toFixed(1) : "—"}</span>
        </div>
      )}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
