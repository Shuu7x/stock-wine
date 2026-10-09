import { createFileRoute } from '@tanstack/react-router'
import { LookupsSettings } from '@/features/settings/components/LookupsSettings'

export const Route = createFileRoute('/_authenticated/settings/lookups')({
  component: LookupsSettings,
})
