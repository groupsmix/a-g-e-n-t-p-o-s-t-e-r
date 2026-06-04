/**
 * Queue statistics type definitions
 * 
 * These types define the structure of queue statistics returned by the
 * /api/queue/stats endpoint and used throughout the queue management UI.
 */

/**
 * Queue statistics aggregated by job status
 * 
 * @property pending - Number of jobs waiting to be executed
 * @property running - Number of jobs currently being executed
 * @property done - Number of successfully completed jobs
 * @property failed - Number of jobs that failed but may be retried
 * @property dead - Number of jobs in the dead letter queue (max retries exceeded)
 */
export interface QueueStats {
  pending: number
  running: number
  done: number
  failed: number
  dead: number
}
