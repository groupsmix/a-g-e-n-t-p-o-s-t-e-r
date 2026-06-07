/**
 * @posteragent/agent-app-builder
 *
 * TASK-500 — App Builder Agent.
 *
 *   import { runAppBuilder, createAppBuilderHandler } from '@posteragent/agent-app-builder'
 *   import { createVercelDeployer, createAnthropicLLM } from '@posteragent/agent-app-builder/adapters'
 *
 *   const handler = createAppBuilderHandler({
 *     llm: createAnthropicLLM({ apiKey }),
 *     deployer: createVercelDeployer({ token }),
 *   })
 *   registry.register('build-app', handler)
 */

export * from './pipeline/index.js'
export { createAppBuilderHandler } from './handler.js'
export type {
  AppBuilderHandlerDeps,
  AppBuilderPayload,
  AppBuilderHandlerOutcome,
} from './handler.js'
export type {
  AppSpec,
  AppTemplate,
  AppFeature,
  ScaffoldedFile,
  ScaffoldedApp,
  BuildIssue,
  BuildResult,
  DeployResult,
  AppBuilderReport,
  LLMClient,
  DeployClient,
  BuildCheckClient,
} from './types.js'
