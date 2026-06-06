import { ModuleStub } from '@/components/shared/ModuleStub'

export default function LeadsPage(): JSX.Element {
  return (
    <ModuleStub
      title="Leads"
      description="Lead scraper, CRM, and email campaigns. Find the right people, talk to them, close them."
      status="planned"
      roadmap={[
        { task: 'TASK-1000', label: 'Lead scraper (X bio search + niche subreddits + ProductHunt)' },
        { task: 'TASK-1001', label: 'Fit-score model — 0-100 with explanation' },
        { task: 'TASK-1002', label: 'Lightweight CRM (status pipeline + notes + reminders)' },
        { task: 'TASK-1003', label: 'Email campaign builder + sender (Resend / SES)' },
      ]}
    />
  )
}
