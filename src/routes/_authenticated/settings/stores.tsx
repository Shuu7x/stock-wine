import { createFileRoute } from '@tanstack/react-router'
import { StoresSettings } from '@/features/settings/components/StoresSettings'

export const Route = createFileRoute('/_authenticated/settings/stores')({
  component: StoresSettings,
})
