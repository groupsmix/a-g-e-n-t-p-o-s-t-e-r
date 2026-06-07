/**
 * @posteragent/agent-publisher
 *
 * TASK-700 — Multi-platform publisher. Pluggable adapters, schedule
 * support via JobStore, idempotency keys.
 */

export * from './pipeline/index.js'
export { createPublisherHandler } from './handler.js'
export type {
  PublisherPayload,
  PublisherPayloadShorthand,
  PublisherHandlerOutcome,
} from './handler.js'
export type {
  Platform,
  MediaRef,
  PublishJob,
  PublishResult,
  PublishReport,
  PublishAdapter,
  JobStore,
} from './types.js'
