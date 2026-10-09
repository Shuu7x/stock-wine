import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'
import { SalePage } from '@/features/operations/components/SalePage'

export const Route = createFileRoute('/_authenticated/sale/')({
  /** items = stock_item_id คั่นด้วย , (มาจากหน้าสต็อก/หน้าไวน์) */
  validateSearch: z.object({ items: z.string().optional().catch(undefined) }),
  component: function Page() {
    const { items } = Route.useSearch()
    const ids = useMemo(() => (items ? items.split(',').filter(Boolean) : []), [items])
    return <SalePage prefillIds={ids} />
  },
})
