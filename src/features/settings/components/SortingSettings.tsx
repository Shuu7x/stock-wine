import { useQuery } from '@tanstack/react-query'
import { ArrowDownUp, ChevronDown, ChevronUp, Globe2, MapPinned, Save, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/ui/loading'
import { Switch } from '@/components/ui/switch'
import { stockItemsOptions } from '@/features/stock/api/stock.api'
import { cn } from '@/lib/cn'
import { fmtInt } from '@/lib/format'
import {
  lookupValuesOptions,
  useAppSettings,
  useSaveAppSettings,
  useSaveLookupValues,
  type LookupValue,
  type LookupWrite,
} from '../api/settings.api'
import { SettingsCard } from './SettingsLayout'

type Entry = { value: string; id: string | null; count: number }
const norm = (s: string) => s.trim().toLowerCase()

/** รายการตามลำดับจากข้อมูลหลัก + ค่าที่มีในสต็อกแต่ยังไม่อยู่ในข้อมูลหลัก (ต่อท้าย) */
function entriesOf(lookups: LookupValue[], category: 'country' | 'region', values: Array<string | null>): Entry[] {
  const counts = new Map<string, { value: string; n: number }>()
  for (const v of values) {
    if (!v?.trim()) continue
    const k = norm(v)
    const c = counts.get(k)
    if (c) c.n++
    else counts.set(k, { value: v.trim(), n: 1 })
  }
  const configured = lookups.filter((l) => l.category === category && l.is_active).sort((a, b) => a.sort_order - b.sort_order)
  const seen = new Set(configured.map((l) => norm(l.value)))
  return [
    ...configured.map((l) => ({ value: l.value, id: l.id, count: counts.get(norm(l.value))?.n ?? 0 })),
    ...[...counts.values()]
      .filter((c) => !seen.has(norm(c.value)))
      .sort((a, b) => a.value.localeCompare(b.value))
      .map((c) => ({ value: c.value, id: null, count: c.n })),
  ]
}

/** การเรียงลำดับ: ลำดับประเทศ / แคว้น ที่ใช้เรียงสต็อก */
export function SortingSettings() {
  const lookupsQ = useQuery(lookupValuesOptions())
  const itemsQ = useQuery(stockItemsOptions())
  const settings = useAppSettings()
  const saveSetting = useSaveAppSettings()
  const saveLookups = useSaveLookupValues()
  const lookups = useMemo(() => lookupsQ.data ?? [], [lookupsQ.data])
  const items = useMemo(() => (itemsQ.data ?? []).filter((i) => !i.deleted_at), [itemsQ.data])

  const initial = useMemo(() => {
    const countries = entriesOf(lookups, 'country', items.map((i) => i.country))
    const regions = entriesOf(lookups, 'region', items.map((i) => i.region))
    return { countries, regions }
  }, [lookups, items])
  const [countries, setCountries] = useState<Entry[]>([])
  const [regions, setRegions] = useState<Entry[]>([])
  useEffect(() => {
    setCountries(initial.countries)
    setRegions(initial.regions)
  }, [initial])
  const [picked, setPicked] = useState<string | null>(null)

  // แคว้นของประเทศที่เลือก (จากข้อมูลสต็อก) — ไม่เลือก = ทุกแคว้น
  const regionsOfCountry = useMemo(() => {
    if (!picked) return null
    return new Set(items.filter((i) => i.country && norm(i.country) === norm(picked)).map((i) => norm(i.region ?? '')))
  }, [items, picked])
  const shownRegions = regionsOfCountry ? regions.filter((r) => regionsOfCountry.has(norm(r.value))) : regions

  const dirty =
    countries.map((c) => c.value).join('|') !== initial.countries.map((c) => c.value).join('|') ||
    regions.map((r) => r.value).join('|') !== initial.regions.map((r) => r.value).join('|') ||
    countries.some((c) => !c.id) ||
    regions.some((r) => !r.id)

  function move(list: Entry[], set: (l: Entry[]) => void, value: string, dir: -1 | 1, within?: Entry[]) {
    // ย้ายภายในรายการที่แสดงอยู่ (แคว้นของประเทศเดียว) — สลับกับตัวที่อยู่ติดกันในรายการที่เห็น
    const view = within ?? list
    const i = view.findIndex((e) => e.value === value)
    const j = i + dir
    if (i < 0 || j < 0 || j >= view.length) return
    const a = list.findIndex((e) => e.value === view[i].value)
    const b = list.findIndex((e) => e.value === view[j].value)
    const next = [...list]
    ;[next[a], next[b]] = [next[b], next[a]]
    set(next)
  }

  async function save() {
    const rows = (category: 'country' | 'region', list: Entry[]): LookupWrite[] =>
      list.map((e, i) => {
        const orig = e.id ? lookups.find((l) => l.id === e.id) : undefined
        return {
          ...(e.id ? { id: e.id } : {}),
          category,
          store_id: null,
          value: e.value,
          sort_order: i + 1,
          is_active: orig?.is_active ?? true,
        }
      })
    await saveLookups.mutateAsync([...rows('country', countries), ...rows('region', regions)])
    toast.success('บันทึกลำดับแล้ว', { description: settings.stock_sort_by_origin ? 'หน้าสต็อกเรียงตามลำดับใหม่' : 'เปิด "เรียงหน้าสต็อกตามลำดับนี้" เพื่อใช้กับหน้าสต็อก' })
  }

  if (lookupsQ.isLoading || itemsQ.isLoading) return <Loading screen />

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard
        title="เรียงหน้าสต็อกตามประเทศ / แคว้น"
        icon={ArrowDownUp}
        description="เปิดแล้วหน้าสต็อกและไฟล์ Excel เรียงตามลำดับประเทศด้านล่าง ประเทศเดียวกันเรียงตามลำดับแคว้น แล้วตามชื่อไวน์ · กดหัวคอลัมน์เพื่อเรียงแบบอื่นได้เหมือนเดิม"
      >
        <div className="flex items-center gap-3 px-5 pt-3 pb-4">
          <Switch
            checked={settings.stock_sort_by_origin}
            onChange={async (v) => {
              await saveSetting.mutateAsync({ stock_sort_by_origin: v })
              toast.success(v ? 'หน้าสต็อกเรียงตามประเทศ / แคว้นแล้ว' : 'เลิกเรียงตามประเทศ / แคว้น')
            }}
            label="เรียงหน้าสต็อกตามลำดับนี้"
            states={['เปิด', 'ปิด']}
            disabled={saveSetting.isPending}
          />
          <span className="text-sm text-ink-2">เรียงหน้าสต็อกตามลำดับนี้</span>
        </div>
      </SettingsCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <OrderList
          title="ลำดับประเทศ"
          icon={Globe2}
          hint="คลิกชื่อประเทศเพื่อดูเฉพาะแคว้นของประเทศนั้น"
          entries={countries}
          picked={picked}
          onPick={(v) => setPicked((p) => (p === v ? null : v))}
          onMove={(v, d) => move(countries, setCountries, v, d)}
        />
        <OrderList
          title={picked ? `ลำดับแคว้น · ${picked}` : 'ลำดับแคว้น (ทุกประเทศ)'}
          icon={MapPinned}
          hint={picked ? 'เลื่อนเฉพาะแคว้นของประเทศนี้ — ลำดับประเทศอื่นไม่เปลี่ยน' : 'เลือกประเทศทางซ้ายเพื่อเรียงเฉพาะแคว้นของประเทศนั้น'}
          entries={shownRegions}
          onMove={(v, d) => move(regions, setRegions, v, d, shownRegions)}
          empty={picked ? 'ประเทศนี้ยังไม่มีแคว้นในสต็อก' : 'ยังไม่มีแคว้น — เพิ่มในคอลัมน์ Region หน้าสต็อก หรือที่ ข้อมูลหลัก'}
        />
      </div>

      {dirty && (
        <div className="sticky bottom-0 flex items-center justify-end gap-2 rounded-xl border border-line bg-surface/95 px-4 py-3 backdrop-blur">
          <span className="mr-auto text-sm text-ink-2">มีการเปลี่ยนลำดับที่ยังไม่บันทึก</span>
          <Button variant="ghost" onClick={() => (setCountries(initial.countries), setRegions(initial.regions))}>
            <Undo2 className="size-4" /> ยกเลิก
          </Button>
          <Button variant="primary" loading={saveLookups.isPending} onClick={save}>
            <Save className="size-4" /> บันทึกลำดับ
          </Button>
        </div>
      )}
    </div>
  )
}

function OrderList({
  title,
  icon,
  hint,
  entries,
  picked,
  onPick,
  onMove,
  empty = 'ยังไม่มีรายการ',
}: {
  title: string
  icon: typeof Globe2
  hint: string
  entries: Entry[]
  picked?: string | null
  onPick?: (v: string) => void
  onMove: (value: string, dir: -1 | 1) => void
  empty?: string
}) {
  return (
    <SettingsCard title={title} icon={icon} description={hint}>
      {entries.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">{empty}</p>
      ) : (
        <ol className="flex max-h-[460px] flex-col overflow-auto border-t border-line">
          {entries.map((e, i) => (
            <li
              key={e.value}
              className={cn('flex items-center gap-2 border-b border-line px-4 py-1.5 last:border-b-0', picked === e.value && 'bg-brand-50')}
            >
              <span className="w-6 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}</span>
              <button
                type="button"
                disabled={!onPick}
                onClick={() => onPick?.(e.value)}
                className={cn('min-w-0 flex-1 truncate text-left text-sm', onPick && 'hover:text-brand-700', picked === e.value && 'font-semibold text-brand-800')}
              >
                {e.value}
                {!e.id && <span className="ml-2 rounded bg-gold-100 px-1.5 text-[11px] text-gold-700">ใหม่จากสต็อก</span>}
              </button>
              <span className="shrink-0 text-xs text-muted tabular-nums">{fmtInt(e.count)} รายการ</span>
              <span className="flex shrink-0">
                <button
                  type="button"
                  aria-label={`เลื่อน ${e.value} ขึ้น`}
                  disabled={i === 0}
                  onClick={() => onMove(e.value, -1)}
                  className="rounded p-1 text-ink-2 hover:bg-surface-2 disabled:opacity-30"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`เลื่อน ${e.value} ลง`}
                  disabled={i === entries.length - 1}
                  onClick={() => onMove(e.value, 1)}
                  className="rounded p-1 text-ink-2 hover:bg-surface-2 disabled:opacity-30"
                >
                  <ChevronDown className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </SettingsCard>
  )
}
