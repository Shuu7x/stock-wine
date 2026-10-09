import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'
import { WithdrawPage } from '@/features/withdrawals/components/WithdrawPage'

export const Route = createFileRoute('/_authenticated/withdraw/')({
  /** items = stock_item_id คั่นด้วย , (มาจากปุ่ม "เบิก" ในหน้าสต็อก) */
  validateSearch: z.object({ items: z.string().optional().catch(undefined) }),
  component: WithdrawRoute,
})

function WithdrawRoute() {
  const { items } = Route.useSearch()
  const ids = useMemo(() => (items ? items.split(',').filter(Boolean) : []), [items])
  return <WithdrawPage prefillIds={ids} />
}
