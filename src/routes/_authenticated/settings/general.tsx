import { createFileRoute } from '@tanstack/react-router'
import { GeneralSettings } from '@/features/settings/components/GeneralSettings'

export const Route = createFileRoute('/_authenticated/settings/general')({
  component: GeneralSettings,
})
