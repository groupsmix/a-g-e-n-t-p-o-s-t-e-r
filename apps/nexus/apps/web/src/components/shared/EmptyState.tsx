import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon, title, description, action, className = "",
}: {
  icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-border p-12 text-center bg-card/30", className)}>
      {icon && <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
