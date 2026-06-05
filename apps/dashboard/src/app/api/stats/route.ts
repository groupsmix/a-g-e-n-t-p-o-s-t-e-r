import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const EMPTY_PAYLOAD = {
  configured: false,
  queuePending: 0,
  queue: [],
  recentPosts: [],
  sites: [],
  revenueToday: 0,
  revenueChart: [],
  postsPublishedToday: 0,
} as const;

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    // Return a 200 with `configured: false` so the dashboard renders a setup
    // screen instead of an opaque 500. Operators see a clear path forward.
    return NextResponse.json({
      ...EMPTY_PAYLOAD,
      error:
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not configured. Copy apps/dashboard/.env.local.example to apps/dashboard/.env.local and fill in your Supabase project values, or set them in Vercel.",
    });
  }
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const [
    queuePending,
    queueAll,
    recentPosts,
    sites,
    revenueToday,
    revenueChart,
    publishedToday,
  ] = await Promise.all([
    supabase.from("content_queue").select("id").eq("status", "pending"),
    supabase
      .from("content_queue")
      .select("id, topic, niche, type, status, scheduled_at")
      .in("status", ["pending", "generating", "ready"])
      .order("scheduled_at", { ascending: true })
      .limit(50),
    supabase
      .from("published_posts")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(20),
    supabase.from("sites").select("*").eq("status", "live"),
    supabase.from("revenue_events").select("amount_cents").eq("event_date", today),
    supabase
      .from("revenue_events")
      .select("event_date, amount_cents")
      .gte("event_date", thirtyDaysAgo)
      .order("event_date"),
    supabase
      .from("published_posts")
      .select("id", { count: "exact", head: true })
      .gte("published_at", `${today}T00:00:00`),
  ]);

  const revenueTodayCents =
    revenueToday.data?.reduce((s, r) => s + (r.amount_cents ?? 0), 0) ?? 0;

  const chartByDate = new Map<string, number>();
  for (const row of revenueChart.data ?? []) {
    const date = row.event_date as string;
    chartByDate.set(
      date,
      (chartByDate.get(date) ?? 0) + (row.amount_cents ?? 0),
    );
  }

  const revenueChartSeries = [...chartByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amountCents]) => ({
      date,
      amountCents,
      amountDollars: amountCents / 100,
    }));

  return NextResponse.json({
    queuePending: queuePending.data?.length ?? 0,
    queue: queueAll.data ?? [],
    recentPosts: recentPosts.data ?? [],
    sites: sites.data ?? [],
    revenueToday: revenueTodayCents,
    revenueChart: revenueChartSeries,
    postsPublishedToday: publishedToday.count ?? 0,
  });
}
