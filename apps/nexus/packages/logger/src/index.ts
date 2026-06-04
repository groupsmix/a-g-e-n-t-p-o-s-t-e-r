/**
 * Structured logging package for consistent, machine-parsable log output.
 * 
 * @example
 * ```typescript
 * const logger = createLogger({ service: 'api' })
 * logger.info('Request received', { path: '/api/products' })
 * ```
 */

export interface LogContext {
  [key: string]: unknown
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  timestamp: string
  context?: LogContext
}

/**
 * Structured logger that outputs logs in JSON format with consistent metadata.
 * Supports contextual logging and multiple log levels.
 */
export class StructuredLogger {
  private context: LogContext

  constructor(baseContext: LogContext = {}) {
    this.context = baseContext
  }

  /**
   * Log a debug message with optional context.
   * @param message - The log message
   * @param context - Additional context to include in the log entry
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context)
  }

  /**
   * Log an info message with optional context.
   * @param message - The log message
   * @param context - Additional context to include in the log entry
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context)
  }

  /**
   * Log a warning message with optional context.
   * @param message - The log message
   * @param context - Additional context to include in the log entry
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context)
  }

  /**
   * Log an error message with optional error object and context.
   * Automatically extracts error message and stack trace.
   * @param message - The log message
   * @param error - Optional Error object to include
   * @param context - Additional context to include in the log entry
   */
  error(message: string, error?: Error, context?: LogContext): void {
    const errorContext = error ? {
      error_message: error.message,
      error_stack: error.stack,
      ...context
    } : context
    this.log('error', message, errorContext)
  }

  /**
   * Create a new logger with additional context merged with the current context.
   * Useful for adding request-specific context like request_id.
   * @param additionalContext - Context to merge with existing context
   * @returns A new StructuredLogger instance with merged context
   */
  withContext(additionalContext: LogContext): StructuredLogger {
    return new StructuredLogger({ ...this.context, ...additionalContext })
  }

  /**
   * Internal method to format and output log entries.
   * @param level - Log level
   * @param message - Log message
   * @param context - Optional context
   */
  private log(level: LogEntry['level'], message: string, context?: LogContext): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: { ...this.context, ...context }
    }
    console.log(JSON.stringify(entry))
  }
}

/**
 * Factory function for creating a new StructuredLogger instance.
 * @param context - Optional base context to include in all log entries
 * @returns A new StructuredLogger instance
 * 
 * @example
 * ```typescript
 * const logger = createLogger({ service: 'nexus-api', version: '1.0.0' })
 * logger.info('Application started')
 * ```
 */
export function createLogger(context?: LogContext): StructuredLogger {
  return new StructuredLogger(context)
}
