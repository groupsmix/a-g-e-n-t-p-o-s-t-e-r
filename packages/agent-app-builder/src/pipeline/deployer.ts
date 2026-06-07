/**
 * Stage 5 — deploy.  The default deployer is a dry-run that just echoes
 * a fake URL.  Real Vercel/Cloudflare deploy adapters live under
 * src/adapters/ and conform to the DeployClient interface.
 */

import type { DeployClient, DeployResult, ScaffoldedApp } from '../types.js'

export function dryRunDeployer(): DeployClient {
  return {
    async deploy(app: ScaffoldedApp): Promise<DeployResult> {
      return {
        ok: true,
        url: `https://dry-run.local/${app.spec.name}`,
        provider: 'dry-run',
      }
    },
  }
}

export async function deploy(
  app: ScaffoldedApp,
  client: DeployClient = dryRunDeployer(),
): Promise<DeployResult> {
  try {
    return await client.deploy(app)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      provider: 'dry-run',
    }
  }
}
