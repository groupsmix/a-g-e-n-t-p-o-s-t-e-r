/**
 * Configuration management system for nexus-api.
 * Loads and validates environment variables with type-safe interfaces.
 */

/**
 * Application configuration interface.
 * Contains all configurable settings loaded from environment variables.
 */
export interface AppConfig {
  /** URL for the Nexus AI service endpoint */
  nexusAiUrl: string
  // Future: add other configurable URLs
}

/**
 * Custom error class for configuration validation failures.
 * Thrown when environment variables are missing or invalid.
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

/**
 * Validates that a string is a valid HTTP(S) URL.
 * 
 * @param url - The URL string to validate
 * @param name - The name of the configuration variable (for error messages)
 * @throws {ConfigurationError} If the URL is invalid or not HTTP(S)
 */
function validateUrl(url: string, name: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new ConfigurationError(
        `${name} must be an HTTP(S) URL, got: ${parsed.protocol}`
      )
    }
  } catch (err) {
    if (err instanceof ConfigurationError) throw err
    throw new ConfigurationError(`${name} is not a valid URL: ${url}`)
  }
}

/**
 * Loads application configuration from environment variables.
 * Validates all configuration values and fails fast on errors.
 * 
 * @param env - Environment variables object (typically from Cloudflare Workers env)
 * @returns Validated application configuration
 * @throws {ConfigurationError} If any configuration value is invalid
 * 
 * @example
 * ```typescript
 * const config = loadConfig(c.env)
 * const response = await fetch(config.nexusAiUrl, { ... })
 * ```
 */
export function loadConfig(env: Record<string, unknown>): AppConfig {
  const nexusAiUrl = (env.NEXUS_AI_URL as string) || 'https://nexus-ai/task'
  
  validateUrl(nexusAiUrl, 'NEXUS_AI_URL')
  
  return {
    nexusAiUrl
  }
}
