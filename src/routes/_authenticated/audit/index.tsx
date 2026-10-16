import { createFileRoute } from '@tanstack/react-router'
import { AuditPage } from '@/features/audit/components/AuditPage'

export const Route = createFileRoute('/_authenticated/audit/')({
  component: AuditPage,
})
