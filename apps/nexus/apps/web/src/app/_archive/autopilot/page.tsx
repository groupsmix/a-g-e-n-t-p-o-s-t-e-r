import { redirect } from 'next/navigation'

// Phase 3: This route has been consolidated into /automation?tab=autopilot
// The full UI lives there; this file is a permanent redirect shim.
export default function Redirect() {
  redirect('/automation?tab=autopilot')
}
