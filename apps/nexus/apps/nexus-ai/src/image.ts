// ============================================================
// Real image generation
// ============================================================
// Turns an image prompt into actual pixels using a configured provider, and
// returns the bytes (base64) so the caller can persist them (e.g. to R2).
// Providers are tried in order of cost/availability; returns null when no
// image provider is configured.

interface WorkersAI {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>
}

interface ImageEnv {
  SECRETS?: { get(key: string): Promise<string | null> }
  CONFIG?: { get(key: string): Promise<string | null> }
  AI?: WorkersAI
  [key: string]: unknown
}

export interface GeneratedImage {
  base64: string
  contentType: string
  provider: string
}

async function getSecret(env: ImageEnv, key: string): Promise<string | null> {
  if (env.SECRETS) {
    try {
      const v = await env.SECRETS.get(key)
      if (v) return v
    } catch {
      /* fall through */
    }
  }
  const plain = (env as Record<string, unknown>)[key]
  if (typeof plain === 'string' && plain.length > 0) return plain
  if (env.CONFIG) {
    try {
      const v = await env.CONFIG.get(`secret:${key}`)
      if (v) return v
    } catch {
      /* fall through */
    }
  }
  return null
}

async function urlToBase64(url: string): Promise<{ base64: string; contentType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch image ${res.status}`)
  const contentType = res.headers.get('content-type') || 'image/png'
  const buf = new Uint8Array(await res.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
  return { base64: btoa(binary), contentType }
}

export async function generateImage(prompt: string, env: ImageEnv): Promise<GeneratedImage | null> {
  // 0. Cloudflare Workers AI (FLUX schnell) — free-tier, no external key needed.
  if (env.AI) {
    try {
      // env.AI.run has no AbortSignal; race it so a slow/hung image gen can't
      // block the workflow from finalizing.
      const out = (await Promise.race([
        env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt, steps: 4 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('flux timed out')), 45000)),
      ])) as { image?: string }
      if (out?.image) {
        // Workers AI returns a base64-encoded JPEG.
        return { base64: out.image, contentType: 'image/jpeg', provider: 'cloudflare-workers-ai-flux' }
      }
    } catch {
      /* try next */
    }
  }

  // 1. fal.ai FLUX — fast and cheap.
  const falKey = (await getSecret(env, 'FAL_KEY')) || (await getSecret(env, 'FAL_API_KEY'))
  if (falKey) {
    try {
      const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Key ${falKey}` },
        body: JSON.stringify({ prompt, image_size: 'square_hd' }),
      })
      if (res.ok) {
        const data = (await res.json()) as { images?: { url?: string }[] }
        const url = data.images?.[0]?.url
        if (url) {
          const { base64, contentType } = await urlToBase64(url)
          return { base64, contentType, provider: 'fal-flux' }
        }
      }
    } catch {
      /* try next */
    }
  }

  // 2. OpenAI images (gpt-image-1) — returns base64 directly.
  const openaiKey = await getSecret(env, 'OPENAI_API_KEY')
  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1024', n: 1 }),
      })
      if (res.ok) {
        const data = (await res.json()) as { data?: { b64_json?: string }[] }
        const b64 = data.data?.[0]?.b64_json
        if (b64) return { base64: b64, contentType: 'image/png', provider: 'openai-gpt-image-1' }
      }
    } catch {
      /* try next */
    }
  }

  // 3. Ideogram — best for text-on-design (e.g. t-shirts, posters).
  const ideogramKey = await getSecret(env, 'IDEOGRAM_API_KEY')
  if (ideogramKey) {
    try {
      const res = await fetch('https://api.ideogram.ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Api-Key': ideogramKey },
        body: JSON.stringify({ image_request: { prompt, aspect_ratio: 'ASPECT_1_1', model: 'V_2' } }),
      })
      if (res.ok) {
        const data = (await res.json()) as { data?: { url?: string }[] }
        const url = data.data?.[0]?.url
        if (url) {
          const { base64, contentType } = await urlToBase64(url)
          return { base64, contentType, provider: 'ideogram' }
        }
      }
    } catch {
      /* try next */
    }
  }

  // No image provider configured.
  return null
}
