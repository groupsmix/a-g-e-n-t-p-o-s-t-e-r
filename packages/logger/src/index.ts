/**
 * @posteragent/logger
 * Structured pino logger for the posteragent monorepo.
 *
 * Features:
 * - JSON in production, pretty-printed in development
 * - Structured format: { ts, level, module, taskId, message, meta }
 * - TASK_ID propagation through async chains via AsyncLocalStorage
 * - Wraps Mastra agent calls (start / tool-call / result / error)
 *
 * Runtime support: Node.js (full features) and Cloudflare Workers
 * (transport disabled — workers can't spawn worker threads).
 */

import pino, { type Logger as PinoLogger } from 'pino'
import { AsyncLocalStorage } from 'node:async_hooks'

// ─── Runtime detection ───────────────────────────────────────────────────────

const isWorkers =
  typeof navigator !== 'undefined' &&
  // @ts-expect-error — navigator.userAgent is set to this string in CF Workers
  navigator.userAgent === 'Cloudflare-Workers'

const nodeEnv =
  typeof process !== 'undefined' && process.env ? process.env['NODE_ENV'] : undefined

const isDev = !isWorkers && nodeEnv !== 'production'

// ─── Task ID context ─────────────────────────────────────────────────────────

/** Propagates the current task ID through async call chains. */
export const taskIdStorage = new AsyncLocalStorage<string>()

/** Run a function with a task ID bound in async context. */
export function runWithTaskId<T>(taskId: string, fn: () => T): T {
  return taskIdStorage.run(taskId, fn)
}

/** Get the current task ID from async context (if any). */
export function getCurrentTaskId(): string | undefined {
  return taskIdStorage.getStore()
}

// ─── Log level ───────────────────────────────────────────────────────────────

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

// ─── Logger factory ──────────────────────────────────────────────────────────

/**
 * Pick a pino destination suitable for the current runtime.
 *
 * - Workers: undefined → pino's default stream (writes JSON the runtime
 *   captures). `pino.transport()` spawns worker threads and is unsupported;
 *   `pino.destination(1)` needs a real fd that isn't available either.
 * - Dev (Node only): pino-pretty via pino.transport.
 * - Prod (Node): pino.destination(1).
 */
function chooseDestination(): unknown {
  if (isWorkers) return undefined
  if (isDev && typeof (pino as unknown as { transport?: unknown }).transport === 'function') {
    try {
      return pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      })
    } catch {
      // fall through to destination(1)
    }
  }
  if (typeof pino.destination === 'function') {
    try {
      return pino.destination(1)
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * Create a structured logger scoped to a module.
 *
 * @example
 * ```ts
 * const log = createLogger('research-agent')
 * log.info('Starting research', { query: 'best AI tools' })
 * log.error('Failed', err, { taskId: '123' })
 * ```
 */
export function createLogger(
  module: string,
  opts?: { level?: LogLevel; base?: Record<string, unknown> },
): AppLogger {
  const pinoOpts = {
    level: opts?.level ?? (isDev ? 'debug' : 'info'),
    base: {
      module,
      ...(typeof process !== 'undefined' && process.pid ? { pid: process.pid } : {}),
      ...opts?.base,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      log(obj: Record<string, unknown>) {
        const taskId = getCurrentTaskId()
        return taskId ? { ...obj, taskId } : obj
      },
    },
  }

  const dest = chooseDestination()
  const base = dest ? pino(pinoOpts, dest as never) : pino(pinoOpts)

  return new AppLogger(base, module)
}

// ─── AppLogger class ─────────────────────────────────────────────────────────

export class AppLogger {
  constructor(
    private readonly _pino: PinoLogger,
    public readonly module: string,
  ) {}

  /** Create a child logger with additional bound fields. */
  child(bindings: Record<string, unknown>): AppLogger {
    return new AppLogger(this._pino.child(bindings), this.module)
  }

  /** Return a child logger with a taskId bound. Useful for per-task logging. */
  withTask(taskId: string): AppLogger {
    return this.child({ taskId })
  }

  trace(msg: string, meta?: Record<string, unknown>): void {
    this._pino.trace(meta ?? {}, msg)
  }

  debug(msg: string, meta?: Record<string, unknown>): void {
    this._pino.debug(meta ?? {}, msg)
  }

  info(msg: string, meta?: Record<string, unknown>): void {
    this._pino.info(meta ?? {}, msg)
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    this._pino.warn(meta ?? {}, msg)
  }

  error(msg: string, err?: Error | unknown, meta?: Record<string, unknown>): void {
    if (err instanceof Error) {
      this._pino.error({ ...meta, err: { message: err.message, stack: err.stack } }, msg)
    } else if (err && typeof err === 'object') {
      this._pino.error({ ...meta, err }, msg)
    } else {
      this._pino.error(meta ?? {}, msg)
    }
  }

  fatal(msg: string, err?: Error | unknown, meta?: Record<string, unknown>): void {
    if (err instanceof Error) {
      this._pino.fatal({ ...meta, err: { message: err.message, stack: err.stack } }, msg)
    } else {
      this._pino.fatal(meta ?? {}, msg)
    }
  }

  // ─── Agent wrapping helpers ───────────────────────────────────────────────

  /** Log an agent task start. */
  agentStart(taskId: string, type: string, payload?: unknown): void {
    this.info('agent:start', { taskId, type, payload })
  }

  /** Log an agent tool call. */
  agentToolCall(taskId: string, tool: string, input?: unknown): void {
    this.debug('agent:tool-call', { taskId, tool, input })
  }

  /** Log an agent tool result. */
  agentToolResult(taskId: string, tool: string, durationMs: number, ok: boolean): void {
    this.debug('agent:tool-result', { taskId, tool, durationMs, ok })
  }

  /** Log a successful agent completion. */
  agentDone(taskId: string, type: string, durationMs: number, costUsd?: number): void {
    this.info('agent:done', { taskId, type, durationMs, costUsd })
  }

  /** Log an agent failure. */
  agentError(taskId: string, type: string, err: Error, durationMs: number): void {
    this.error('agent:error', err, { taskId, type, durationMs })
  }
}

// ─── Root logger ─────────────────────────────────────────────────────────────

/** Root logger — use createLogger(module) for scoped instances. */
export const rootLogger = createLogger('root')
