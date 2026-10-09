import { createFileRoute } from '@tanstack/react-router'
import { ReceivePage } from '@/features/receipts/components/ReceivePage'

export const Route = createFileRoute('/_authenticated/receive/')({
  component: ReceivePage,
})
