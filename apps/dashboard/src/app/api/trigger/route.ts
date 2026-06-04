import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    workflow?: string;
    params?: Record<string, string | boolean>;
  };

  const workflow = body.workflow ?? "daily-run";
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO ?? "groupsmix/posteragent";

  if (!token) {
    return NextResponse.json(
      { triggered: false, error: "GITHUB_TOKEN not configured" },
      { status: 500 },
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: body.params ?? {},
      }),
    },
  );

  return NextResponse.json({
    triggered: response.ok,
    status: response.status,
  });
}
