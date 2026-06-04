import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-muted text-muted-foreground border-border",
  primary: "bg-primary/15 text-primary border-primary/30",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  destructive: "bg-destructive/15 text-destructive border-destructive/30",
} as const;

export function StatusBadge({
  status, tone,
}: { status: string; tone?: keyof typeof tones }) {
  const auto: keyof typeof tones =
    /approved|published|completed|active|pass/i.test(status) ? "success" :
    /running|pending|warn/i.test(status) ? "warning" :
    /failed|rejected|graveyard|errored|fail/i.test(status) ? "destructive" :
    /draft|sleeping|waiting|queued/i.test(status) ? "neutral" : "primary";
  const t = tone || auto;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider", tones[t])}>
      <span className={cn("h-1.5 w-1.5 rounded-full",
        t === "success" && "bg-success",
        t === "warning" && "bg-warning animate-pulse",
        t === "destructive" && "bg-destructive",
        t === "neutral" && "bg-muted-foreground",
        t === "primary" && "bg-primary",
      )} />
      {status.replace(/_/g, " ")}
    </span>
  );
}
