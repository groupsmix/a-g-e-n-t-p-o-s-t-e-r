'use server'

import { revalidatePath } from 'next/cache'

const NEXUS_API_URL = process.env.NEXUS_API_URL || 'http://localhost:8787'
const NEXUS_API_KEY = process.env.NEXUS_API_KEY || ''

export async function sendCreativeIntention(formData: FormData) {
  const topic = formData.get('topic') as string
  const tone = formData.get('tone') as string
  const platforms = (formData.get('platforms') as string).split(',').map(p => p.trim())

  try {
    const res = await fetch(`${NEXUS_API_URL}/api/brain-bridge/intention`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NEXUS_API_KEY}`,
      },
      body: JSON.stringify({
        topic,
        tone,
        targetPlatforms: platforms,
        agentIdentity: 'Brain-Cockpit-v1',
      }),
    })

    if (!res.ok) throw new Error(`NEXUS API error: ${res.status}`)

    const data = await res.json()
    console.log(`Intention queued: ${data.runId}`)
    revalidatePath('/journal')
    return { success: true, runId: data.runId }
  } catch (error) {
    console.error('Failed to send intention:', error)
    return { success: false, error: 'Failed to engage autopilot' }
  }
}
