#!/usr/bin/env node

/**
 * Smoke test for deployed nexus-ai worker.
 * Runs against production to ensure models are routing correctly.
 */

const WORKER_URL = process.env.NEXUS_AI_URL || 'https://nexus-ai.workers.dev' // Replace with actual deployed URL
const API_KEY = process.env.NEXUS_AI_SECRET || 'dev_secret' // Adjust if needed

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  const response = await fetch(url, {
    ...options,
    signal: controller.signal
  })
  clearTimeout(id)
  return response
}

async function smokeTest() {
  console.log(`Starting smoke test against ${WORKER_URL}`)
  
  // 1. Health check
  try {
    process.stdout.write('Checking /health... ')
    const start = Date.now()
    const res = await fetchWithTimeout(`${WORKER_URL}/health`)
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const text = await res.text()
    console.log(`✅ OK (${Date.now() - start}ms) - ${text}`)
  } catch (err) {
    console.log(`❌ Failed: ${err.message}`)
    process.exit(1)
  }

  // 2. Registry check
  try {
    process.stdout.write('Checking /registry... ')
    const start = Date.now()
    const res = await fetchWithTimeout(`${WORKER_URL}/registry`)
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const data = await res.json()
    console.log(`✅ OK (${Date.now() - start}ms) - ${Object.keys(data).length} task types registered`)
  } catch (err) {
    console.log(`❌ Failed: ${err.message}`)
    process.exit(1)
  }

  // 3. Cheap task round-trip
  try {
    process.stdout.write('Checking /task (generate_seo_tags)... ')
    const start = Date.now()
    const res = await fetchWithTimeout(`${WORKER_URL}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        taskType: 'generate_seo_tags',
        prompt: 'Return a JSON object with meta_title, meta_description, and tags for a mock product.',
        outputFormat: 'json'
      })
    }, 30000)
    
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Status ${res.status}: ${errText}`)
    }
    
    const data = await res.json()
    const latency = Date.now() - start
    console.log(`✅ OK (${latency}ms)`)
    console.log(`   Model used: ${data.model_used || 'unknown'}`)
    console.log(`   Tokens: ${data.tokens_used || 0}`)
    console.log(`   Cost: $${data.cost_usd || 0}`)
  } catch (err) {
    console.log(`❌ Failed: ${err.message}`)
    process.exit(1)
  }

  console.log('\nSmoke test complete.')
}

smokeTest().catch(console.error)
