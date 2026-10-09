import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'
import { AdjustPage } from '@/features/operations/components/AdjustPage'

export const Route = createFileRoute('/_authenticated/adjust/')({
  /** items = stock_item_id คั่นด้วย , (มาจากหน้าสต็อก/หน้าไวน์) */
  validateSearch: z.object({ items: z.string().optional().catch(undefined) }),
  component: function Page() {
    const { items } = Route.useSearch()
    const ids = useMemo(() => (items ? items.split(',').filter(Boolean) : []), [items])
    return <AdjustPage prefillIds={ids} />
  },
})
