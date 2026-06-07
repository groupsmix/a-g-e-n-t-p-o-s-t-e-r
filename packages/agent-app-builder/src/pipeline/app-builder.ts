/**
 * Top-level pipeline orchestrator.  Composes the five stages.
 *
 *   parseSpec → scaffold → codegen → buildAndCheck → deploy
 *
 * Returns an AppBuilderReport summarising the whole run.  Deploy is
 * skipped automatically if the build stage reports any error-level
 * issues — the report still surfaces what was generated for the user
 * to inspect.
 */

import type {
  AppBuilderReport,
  AppSpec,
  BuildCheckClient,
  DeployClient,
  LLMClient,
} from '../types.js'
import { parseSpec } from './parser.js'
import { scaffold } from './scaffolder.js'
import { codegen } from './codegen.js'
import { buildAndCheck } from './builder.js'
import { deploy } from './deployer.js'

export interface RunAppBuilderInput {
  /** Either a free-form prompt OR a pre-built AppSpec. */
  prompt?: string
  spec?: AppSpec
  /** Skip deploy stage even if build is clean. */
  skipDeploy?: boolean
}

export interface AppBuilderDeps {
  llm?: LLMClient
  checker?: BuildCheckClient
  deployer?: DeployClient
}

export async function runAppBuilder(
  input: RunAppBuilderInput,
  deps: AppBuilderDeps = {},
): Promise<AppBuilderReport> {
  const spec: AppSpec =
    input.spec ?? (await parseSpec(input.prompt ?? 'a simple landing page', deps.llm))
  const scaffolded = scaffold(spec)
  const { app: coded } = await codegen(scaffolded, deps.llm)
  const build = await buildAndCheck(coded, deps.checker)
  const deployResult = input.skipDeploy || !build.ok
    ? { ok: false, provider: 'dry-run' as const, error: build.ok ? 'skipped' : 'build failed' }
    : await deploy(coded, deps.deployer)

  return {
    spec,
    build,
    deploy: deployResult,
    totalFiles: coded.files.length,
  }
}
