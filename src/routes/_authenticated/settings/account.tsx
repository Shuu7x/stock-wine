import { createFileRoute } from '@tanstack/react-router'
import { AccountSettings } from '@/features/settings/components/AccountSettings'

export const Route = createFileRoute('/_authenticated/settings/account')({
  component: AccountSettings,
})
