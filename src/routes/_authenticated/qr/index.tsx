import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'
import { QrPage } from '@/features/qr/components/QrPage'

export const Route = createFileRoute('/_authenticated/qr/')({
  /** items = stock_item_id คั่นด้วย , (เลือกไว้ให้ จำนวนป้าย = จำนวนขวด) */
  validateSearch: z.object({ items: z.string().optional().catch(undefined) }),
  component: function Page() {
    const { items } = Route.useSearch()
    const ids = useMemo(() => (items ? items.split(',').filter(Boolean) : []), [items])
    return <QrPage prefillIds={ids} />
  },
})
