import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { StockPage } from '@/features/stock/components/StockPage'

export const Route = createFileRoute('/_authenticated/stock/')({
  validateSearch: z.object({
    // store = 'all' หรือรหัสคลัง (คลังเพิ่มได้ในหน้าตั้งค่า)
    store: z.string().max(12).default('all').catch('all'),
    /** มาจากสแกน QR: แสดงเฉพาะไวน์รายการนี้ */
    focus: z.string().uuid().optional().catch(undefined),
  }),
  component: StockRoute,
})

function StockRoute() {
  const { store, focus } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <StockPage
      tab={store}
      focusId={focus}
      onTabChange={(t) => navigate({ search: { store: t } })}
      onClearFocus={() => navigate({ search: (s) => ({ ...s, focus: undefined }), replace: true })}
    />
  )
}
