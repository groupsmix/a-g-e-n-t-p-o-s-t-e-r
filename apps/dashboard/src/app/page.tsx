"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface StatsPayload {
  configured?: boolean;
  error?: string;
  queuePending: number;
  queue: Array<{
    id: string;
    topic: string;
    niche: string;
    type: string;
    status: string;
    scheduled_at: string | null;
  }>;
  recentPosts: Array<{
    id: string;
    platform: string;
    views: number | null;
    likes: number | null;
    published_at: string | null;
    platform_url: string | null;
  }>;
  sites: Array<{
    id: string;
    niche: string;
    domain: string | null;
    monthly_views: number | null;
    monthly_revenue_cents: number | null;
  }>;
  revenueToday: number;
  revenueChart: Array<{
    date: string;
    amountDollars: number;
  }>;
  postsPublishedToday: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error(`Stats failed (${res.status})`);
      setStats(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function triggerDailyRun() {
    setTriggering(true);
    try {
      const res = await fetch("/api/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow: "daily-run", params: {} }),
      });
      const data = await res.json();
      if (!data.triggered) {
        alert("Failed to trigger workflow. Check GITHUB_TOKEN on the server.");
      } else {
        alert("Daily run workflow triggered on GitHub Actions.");
      }
    } finally {
      setTriggering(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl p-8">
        <p className="text-slate-400">Loading dashboard…</p>
      </main>
    );
  }

  if (error || !stats) {
    return (
      <main className="mx-auto max-w-6xl p-8">
        <p className="text-red-400">{error ?? "No data"}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded bg-slate-700 px-4 py-2 text-sm"
        >
          Retry
        </button>
      </main>
    );
  }

  if (stats.configured === false) {
    return (
      <main className="mx-auto max-w-3xl space-y-6 p-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Posteragent</h1>
          <p className="text-slate-400">Setup required</p>
        </header>
        <div className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-5 text-sm">
          <p className="font-medium text-amber-200">
            Supabase is not configured.
          </p>
          <p className="mt-2 text-amber-200/80">
            {stats.error ??
              "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in this environment."}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-300 space-y-3">
          <p className="font-medium text-slate-100">Local setup</p>
          <pre className="overflow-x-auto rounded bg-slate-950/80 p-3 text-xs text-slate-200">
{`cp apps/dashboard/.env.local.example apps/dashboard/.env.local
# then fill in:
#   SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY
#   GITHUB_TOKEN
#   GITHUB_REPO=groupsmix/a-g-e-n-t-p-o-s-t-e-r
pnpm --filter @repo/dashboard dev`}
          </pre>
          <p className="font-medium text-slate-100 mt-4">Vercel setup</p>
          <p>
            Add the same four variables in your Vercel project settings, then
            redeploy.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded bg-slate-700 px-4 py-2 text-sm"
        >
          Recheck
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-10 p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Posteragent
          </h1>
          <p className="text-slate-400">Money machine control panel</p>
        </div>
        <button
          type="button"
          disabled={triggering}
          onClick={() => void triggerDailyRun()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {triggering ? "Triggering…" : "Generate now (daily run)"}
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Published today"
          value={String(stats.postsPublishedToday)}
        />
        <StatCard label="Queue pending" value={String(stats.queuePending)} />
        <StatCard
          label="Revenue today"
          value={`$${(stats.revenueToday / 100).toFixed(2)}`}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Revenue (30 days)</h2>
        <div className="h-64 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.revenueChart}>
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                }}
              />
              <Line
                type="monotone"
                dataKey="amountDollars"
                stroke="#34d399"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Content queue</h2>
        <DataTable
          headers={["Topic", "Niche", "Type", "Status", "Scheduled"]}
          rows={stats.queue.map((row) => [
            row.topic,
            row.niche,
            row.type,
            row.status,
            row.scheduled_at
              ? new Date(row.scheduled_at).toLocaleString()
              : "—",
          ])}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Published posts</h2>
        <DataTable
          headers={["Platform", "Views", "Likes", "Published"]}
          rows={stats.recentPosts.map((row) => [
            row.platform,
            String(row.views ?? 0),
            String(row.likes ?? 0),
            row.published_at
              ? new Date(row.published_at).toLocaleString()
              : "—",
          ])}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Live sites</h2>
        <DataTable
          headers={["Niche", "Domain", "Monthly views", "Monthly revenue"]}
          rows={stats.sites.map((row) => [
            row.niche,
            row.domain ?? "—",
            String(row.monthly_views ?? 0),
            `$${((row.monthly_revenue_cents ?? 0) / 100).toFixed(2)}`,
          ])}
        />
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No rows yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-900/80 text-slate-400">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-800/80">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-slate-200">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
