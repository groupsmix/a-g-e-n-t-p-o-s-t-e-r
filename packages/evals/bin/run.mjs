#!/usr/bin/env node
/**
 * Eval CLI entrypoint. Loads a suites module from --suites (defaults
 * to <cwd>/evals.config.ts), runs everything, prints a report, and
 * exits non-zero on failures so CI fails too.
 *
 *   posteragent-evals                       # default suites
 *   posteragent-evals --suites ./evals.ts   # custom suites
 *   posteragent-evals --agents writer,voice # filter
 *   posteragent-evals --tags regression
 */

import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

async function loadModule(path) {
  const url = pathToFileURL(resolve(path)).href
  try {
    return await import(url)
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ERR_MODULE_NOT_FOUND') {
      console.error(`evals: no suites module at ${path}`)
      return null
    }
    throw err
  }
}

function parseArgv(argv) {
  const out = { suites: 'evals.config.mjs', agents: undefined, tags: undefined }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--suites') out.suites = argv[++i]
    else if (a === '--agents') out.agents = argv[++i].split(',')
    else if (a === '--tags') out.tags = argv[++i].split(',')
  }
  return out
}

async function main() {
  const opts = parseArgv(process.argv)
  const mod = await loadModule(opts.suites)
  if (!mod) process.exit(2)
  const suites = mod.default ?? mod.suites
  if (!Array.isArray(suites) || suites.length === 0) {
    console.error('evals: suites export must be a non-empty array')
    process.exit(2)
  }
  const { runSuites, formatReport, reportExitCode } = await import('@posteragent/evals')
  const report = await runSuites(suites, { agents: opts.agents, tags: opts.tags })
  console.log(formatReport(report))
  process.exit(reportExitCode(report))
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
