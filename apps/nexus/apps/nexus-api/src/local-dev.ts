// Shared local-dev detection.
//
// `wrangler dev` serves the worker on a loopback hostname; a deployed worker
// never does. Fail-closed gates (CORS wildcard fallback, first-run password
// bootstrap) use this as their only escape hatch, so local development keeps
// working with zero configuration while anything reachable from the internet
// fails closed.
export function isLocalDevRequest(requestUrl: string): boolean {
  try {
    const host = new URL(requestUrl).hostname
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.localhost')
    )
  } catch {
    return false
  }
}
