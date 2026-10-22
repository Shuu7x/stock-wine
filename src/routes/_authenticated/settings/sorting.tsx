import { createFileRoute } from '@tanstack/react-router'
import { SortingSettings } from '@/features/settings/components/SortingSettings'

export const Route = createFileRoute('/_authenticated/settings/sorting')({
  component: SortingSettings,
})
