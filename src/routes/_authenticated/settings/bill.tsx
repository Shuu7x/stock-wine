import { createFileRoute } from '@tanstack/react-router'
import { BillSettings } from '@/features/settings/components/BillSettings'

export const Route = createFileRoute('/_authenticated/settings/bill')({
  component: BillSettings,
})
