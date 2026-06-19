import { redirect } from 'next/navigation'

// Phase 3: This route has been consolidated into /engineering?tab=multi-agent
// The full UI lives there; this file is a permanent redirect shim.
export default function Redirect() {
  redirect('/engineering?tab=multi-agent')
}
