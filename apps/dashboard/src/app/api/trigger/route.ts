import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    workflow?: string;
    params?: Record<string, string | boolean>;
  };

  const workflow = body.workflow ?? "daily-run";
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO ?? "groupsmix/a-g-e-n-t-p-o-s-t-e-r";
  const ref = process.env.GITHUB_REF ?? "main";

  if (!token) {
    return NextResponse.json(
      {
        triggered: false,
        error:
          "GITHUB_TOKEN not configured. Add it to apps/dashboard/.env.local (local) or Vercel project env vars (prod).",
      },
      { status: 503 },
    );
  }

  const dispatchUrl = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}.yml/dispatches`;

  const response = await fetch(dispatchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "posteragent-dashboard",
    },
    body: JSON.stringify({
      ref,
      inputs: body.params ?? {},
    }),
  });

  // GitHub returns 204 No Content on success; surface useful diagnostics on failure.
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    return NextResponse.json(
      {
        triggered: false,
        status: response.status,
        repo,
        workflow,
        ref,
        error:
          response.status === 404
            ? `Workflow not found. Verify ${workflow}.yml exists in ${repo} on branch ${ref}.`
            : response.status === 401 || response.status === 403
              ? "GitHub rejected the token. Confirm it has `repo` + `workflow` scopes and access to this repo."
              : `GitHub API error ${response.status}`,
        githubMessage: errBody.slice(0, 500) || undefined,
      },
      { status: response.status },
    );
  }

  return NextResponse.json({
    triggered: true,
    status: response.status,
    repo,
    workflow,
    ref,
  });
}
