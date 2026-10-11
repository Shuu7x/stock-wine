import { createFileRoute } from '@tanstack/react-router'
import { DisplaySettings } from '@/features/settings/components/DisplaySettings'

export const Route = createFileRoute('/_authenticated/settings/display')({
  component: DisplaySettings,
})
