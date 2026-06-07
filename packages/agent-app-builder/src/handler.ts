/**
 * Orchestrator handler shim.
 *
 * Wraps runAppBuilder() in the AgentHandler contract so the registry
 * can mount it against the 'build-app' task type.
 *
 * Payload shape:
 *   { prompt: string, skipDeploy?: boolean }
 * or
 *   { spec: AppSpec, skipDeploy?: boolean }
 *
 * Outcome carries the full AppBuilderReport, a one-line summary for
 * the journal, and the generated URL as the only memorable artefact
 * (we don't memorise generated source — too noisy).
 */

import type { AppBuilderReport, AppSpec, BuildCheckClient, DeployClient, LLMClient } from './types.js'
import { runAppBuilder } from './pipeline/app-builder.js'

export interface AppBuilderHandlerDeps {
  llm?: LLMClient
  checker?: BuildCheckClient
  deployer?: DeployClient
}

export interface AppBuilderPayload {
  prompt?: string
  spec?: AppSpec
  skipDeploy?: boolean
}

export interface AppBuilderHandlerOutcome {
  data: AppBuilderReport
  summary: string
  memories: Array<{ kind: 'fact'; content: string; meta?: Record<string, unknown> }>
  nextActions: Array<{ type: string; reason: string; payload?: Record<string, unknown> }>
  usage: { inputTokens: number; outputTokens: number }
}

export function createAppBuilderHandler(deps: AppBuilderHandlerDeps) {
  return {
    type: 'build-app' as const,
    name: 'app-builder',
    description: 'Spec → Scaffold → Code → Test → Deploy. TASK-500.',
    async run(ctx: { payload: AppBuilderPayload }): Promise<AppBuilderHandlerOutcome> {
      const report = await runAppBuilder(
        {
          prompt: ctx.payload.prompt,
          spec: ctx.payload.spec,
          skipDeploy: ctx.payload.skipDeploy,
        },
        deps,
      )

      const errorCount = report.build.issues.filter((i) => i.severity === 'error').length
      const warnCount = report.build.issues.filter((i) => i.severity === 'warning').length

      const summary = report.deploy.ok
        ? `Built and deployed ${report.spec.name} (${report.spec.template}) → ${report.deploy.url}`
        : `Built ${report.spec.name} (${report.spec.template}); deploy skipped — ${errorCount} errors, ${warnCount} warnings.`

      const memories: AppBuilderHandlerOutcome['memories'] = report.deploy.ok && report.deploy.url
        ? [
            {
              kind: 'fact',
              content: `App "${report.spec.name}" deployed at ${report.deploy.url}`,
              meta: {
                template: report.spec.template,
                provider: report.deploy.provider,
                features: report.spec.features,
              },
            },
          ]
        : []

      const nextActions: AppBuilderHandlerOutcome['nextActions'] = []
      if (report.deploy.ok && report.spec.features.includes('analytics')) {
        nextActions.push({
          type: 'publish',
          reason: 'announce the new app',
          payload: { url: report.deploy.url, name: report.spec.name },
        })
      }
      if (errorCount > 0) {
        nextActions.push({
          type: 'build-app',
          reason: 'retry codegen after fixing issues',
          payload: { spec: report.spec, skipDeploy: false },
        })
      }

      return {
        data: report,
        summary,
        memories,
        nextActions,
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    },
  }
}
