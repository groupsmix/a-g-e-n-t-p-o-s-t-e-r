import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(url, key);
}

export async function GET() {
  const supabase = getSupabase();
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
