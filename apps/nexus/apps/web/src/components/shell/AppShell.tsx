import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { AuthGate } from "./AuthGate";
import { ApiMisconfigBanner } from "@/components/shared/ApiMisconfigBanner";
import AnnouncementBanner from "./AnnouncementBanner";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 min-w-0 pt-14 md:pt-0">
          <AnnouncementBanner />
          <ApiMisconfigBanner />
          {children}
        </main>
      </div>
    </AuthGate>
  );
}

export function PageHeader({
  title, subtitle, actions,
}: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="border-b border-border bg-card/40">
      <div className="px-6 md:px-8 py-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

export function PageBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-6 md:px-8 py-6 ${className}`}>{children}</div>;
}
