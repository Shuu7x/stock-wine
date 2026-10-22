import { useQuery } from '@tanstack/react-query'
import { ArrowDownUp, ChevronDown, ChevronRight, ChevronUp, Globe2, GripVertical, MapPin, Save, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/ui/loading'
import { Switch } from '@/components/ui/switch'
import { stockItemsOptions, type StockItem } from '@/features/stock/api/stock.api'
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
/** ประเทศ + แคว้นของประเทศนั้น (ลำดับในอาร์เรย์ = ลำดับที่ใช้เรียง) */
type Group = { country: Entry; regions: Entry[] }
const NONE = '__none__'
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/** จัดกลุ่มแคว้นใต้ประเทศ: ประเทศของแคว้นจากข้อมูลหลัก (parent) หรือประเทศที่พบมากที่สุดในสต็อก */
function buildTree(lookups: LookupValue[], items: StockItem[]): { groups: Group[]; orphans: Entry[] } {
  const active = (c: 'country' | 'region') => lookups.filter((l) => l.category === c && l.is_active).sort((a, b) => a.sort_order - b.sort_order)
  const count = (pick: (i: StockItem) => string | null) => {
    const m = new Map<string, number>()
    for (const i of items) {
      const k = norm(pick(i))
      if (k) m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }
  const countryN = count((i) => i.country)
  const regionN = count((i) => i.region)

  // ประเทศ: ข้อมูลหลักตามลำดับ แล้วต่อด้วยที่มีในสต็อก
  const countries: Entry[] = active('country').map((l) => ({ value: l.value, id: l.id, count: countryN.get(norm(l.value)) ?? 0 }))
  const seenC = new Set(countries.map((c) => norm(c.value)))
  for (const i of items) {
    const c = i.country?.trim()
    if (c && !seenC.has(norm(c))) {
      seenC.add(norm(c))
      countries.push({ value: c, id: null, count: countryN.get(norm(c)) ?? 0 })
    }
  }

  // ประเทศที่พบมากที่สุดของแต่ละแคว้นในสต็อก
  const regionCountry = new Map<string, Map<string, number>>()
  for (const i of items) {
    const r = norm(i.region)
    if (!r || !i.country) continue
    const m = regionCountry.get(r) ?? new Map<string, number>()
    m.set(i.country.trim(), (m.get(i.country.trim()) ?? 0) + 1)
    regionCountry.set(r, m)
  }
  const topCountry = (r: string) => [...(regionCountry.get(norm(r)) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const groups: Group[] = countries.map((c) => ({ country: c, regions: [] }))
  const orphans: Entry[] = []
  const place = (e: Entry, country: string | null) => {
    const g = country ? groups.find((x) => norm(x.country.value) === norm(country)) : undefined
    ;(g ? g.regions : orphans).push(e)
  }
  const seenR = new Set<string>()
  for (const l of active('region')) {
    seenR.add(norm(l.value))
    place({ value: l.value, id: l.id, count: regionN.get(norm(l.value)) ?? 0 }, l.parent || topCountry(l.value))
  }
  for (const i of items) {
    const r = i.region?.trim()
    if (r && !seenR.has(norm(r))) {
      seenR.add(norm(r))
      place({ value: r, id: null, count: regionN.get(norm(r)) ?? 0 }, topCountry(r))
    }
  }
  return { groups, orphans }
}

type Drag = { kind: 'country'; from: number } | { kind: 'region'; group: string; from: number }
type Drop = { kind: 'country'; at: number } | { kind: 'region'; group: string; at: number }

/** การเรียงลำดับ: ลากเพื่อจัดลำดับประเทศ และแคว้นใต้แต่ละประเทศ */
export function SortingSettings() {
  const lookupsQ = useQuery(lookupValuesOptions())
  const itemsQ = useQuery(stockItemsOptions())
  const settings = useAppSettings()
  const saveSetting = useSaveAppSettings()
  const saveLookups = useSaveLookupValues()
  const lookups = useMemo(() => lookupsQ.data ?? [], [lookupsQ.data])
  const items = useMemo(() => (itemsQ.data ?? []).filter((i) => !i.deleted_at), [itemsQ.data])

  const initial = useMemo(() => buildTree(lookups, items), [lookups, items])
  const [groups, setGroups] = useState<Group[]>([])
  const [orphans, setOrphans] = useState<Entry[]>([])
  const reset = () => (setGroups(initial.groups), setOrphans(initial.orphans))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reset, [initial])
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState<Drag | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)

  const sig = (gs: Group[], os: Entry[]) =>
    JSON.stringify([gs.map((g) => [g.country.value, g.regions.map((r) => r.value)]), os.map((o) => o.value)])
  const dirty =
    sig(groups, orphans) !== sig(initial.groups, initial.orphans) ||
    groups.some((g) => !g.country.id || g.regions.some((r) => !r.id)) ||
    orphans.some((o) => !o.id)

  const regionsOf = (group: string) => (group === NONE ? orphans : (groups.find((g) => g.country.value === group)?.regions ?? []))
  function setRegions(group: string, list: Entry[]) {
    if (group === NONE) setOrphans(list)
    else setGroups((gs) => gs.map((g) => (g.country.value === group ? { ...g, regions: list } : g)))
  }

  function moveCountry(from: number, to: number) {
    if (from === to || from + 1 === to) return
    setGroups((gs) => {
      const next = [...gs]
      const [g] = next.splice(from, 1)
      next.splice(to > from ? to - 1 : to, 0, g)
      return next
    })
  }
  function moveRegion(fromGroup: string, from: number, toGroup: string, to: number) {
    const src = [...regionsOf(fromGroup)]
    const [r] = src.splice(from, 1)
    if (!r) return
    if (fromGroup === toGroup) {
      src.splice(to > from ? to - 1 : to, 0, r)
      setRegions(fromGroup, src)
      return
    }
    // ย้ายแคว้นไปประเทศอื่น = เปลี่ยนประเทศของแคว้นนี้
    const dst = [...regionsOf(toGroup)]
    dst.splice(to, 0, r)
    setRegions(fromGroup, src)
    setRegions(toGroup, dst)
    setOpen((o) => new Set(o).add(toGroup))
  }

  // ── ลากวาง (HTML5 drag & drop · เมาส์) ──
  const overHalf = (e: DragEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return e.clientY > r.top + r.height / 2
  }
  function onDropHere() {
    if (drag && drop) {
      if (drag.kind === 'country' && drop.kind === 'country') moveCountry(drag.from, drop.at)
      if (drag.kind === 'region' && drop.kind === 'region') moveRegion(drag.group, drag.from, drop.group, drop.at)
    }
    setDrag(null)
    setDrop(null)
  }

  async function save() {
    const rows: LookupWrite[] = []
    const keep = (id: string | null) => (id ? lookups.find((l) => l.id === id)?.is_active ?? true : true)
    groups.forEach((g, i) =>
      rows.push({ ...(g.country.id ? { id: g.country.id } : {}), category: 'country', store_id: null, value: g.country.value, sort_order: i + 1, is_active: keep(g.country.id), parent: null }),
    )
    const regionRows = (list: Entry[], parent: string | null) =>
      list.forEach((r, j) =>
        rows.push({ ...(r.id ? { id: r.id } : {}), category: 'region', store_id: null, value: r.value, sort_order: j + 1, is_active: keep(r.id), parent }),
      )
    groups.forEach((g) => regionRows(g.regions, g.country.value))
    regionRows(orphans, null)
    await saveLookups.mutateAsync(rows)
    toast.success('บันทึกลำดับแล้ว', {
      description: settings.stock_sort_by_origin ? 'หน้าสต็อกเรียงตามลำดับใหม่' : 'เปิด "เรียงหน้าสต็อกตามลำดับนี้" เพื่อใช้กับหน้าสต็อก',
    })
  }

  if (lookupsQ.isLoading || itemsQ.isLoading) return <Loading screen />

  const allOpen = open.size >= groups.length
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

      <SettingsCard
        title="ลำดับประเทศ และแคว้นของแต่ละประเทศ"
        icon={Globe2}
        description="ลาก ⠿ เพื่อเลื่อนตำแหน่ง · กดชื่อประเทศเพื่อดูแคว้นของประเทศนั้น · ลากแคว้นไปวางใต้ประเทศอื่นเพื่อย้ายประเทศของแคว้น"
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            <button type="button" className="text-sm font-medium text-brand-700 hover:underline" onClick={() => setOpen(allOpen ? new Set() : new Set([...groups.map((g) => g.country.value), NONE]))}>
              {allOpen ? 'ยุบทั้งหมด' : 'แสดงแคว้นทุกประเทศ'}
            </button>
            {dirty && (
              <>
                <span className="ml-auto text-sm text-ink-2">มีการเปลี่ยนลำดับที่ยังไม่บันทึก</span>
                <Button size="sm" variant="ghost" onClick={reset}>
                  <Undo2 className="size-4" /> ยกเลิก
                </Button>
                <Button size="sm" variant="primary" loading={saveLookups.isPending} onClick={save}>
                  <Save className="size-4" /> บันทึกลำดับ
                </Button>
              </>
            )}
          </div>
        }
      >
        <ol className="border-t border-line" onDragEnd={() => (setDrag(null), setDrop(null))}>
          {groups.map((g, gi) => {
            const isOpen = open.has(g.country.value)
            const dropLine = drop?.kind === 'country' && drag?.kind === 'country' && (drop.at === gi || (drop.at === groups.length && gi === groups.length - 1))
            return (
              <li key={g.country.value} className="border-b border-line last:border-b-0">
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    setDrag({ kind: 'country', from: gi })
                  }}
                  onDragOver={(e) => {
                    if (drag?.kind === 'country') {
                      e.preventDefault()
                      setDrop({ kind: 'country', at: overHalf(e) ? gi + 1 : gi })
                    } else if (drag?.kind === 'region') {
                      // วางแคว้นบนหัวประเทศ = ไปต่อท้ายแคว้นของประเทศนั้น
                      e.preventDefault()
                      setDrop({ kind: 'region', group: g.country.value, at: g.regions.length })
                    }
                  }}
                  onDrop={(e) => (e.preventDefault(), onDropHere())}
                  className={cn(
                    'relative flex cursor-grab items-center gap-2 px-3 py-2 active:cursor-grabbing',
                    drag?.kind === 'country' && drag.from === gi && 'opacity-40',
                    drop?.kind === 'region' && drop.group === g.country.value && drag?.kind === 'region' && 'bg-brand-50 ring-2 ring-brand-300 ring-inset',
                  )}
                >
                  {dropLine && (
                    <span className={cn('pointer-events-none absolute inset-x-2 h-0.5 rounded bg-brand-600', drop.at === gi ? '-top-px' : '-bottom-px')} />
                  )}
                  <GripVertical className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="w-6 shrink-0 text-right text-xs text-muted tabular-nums">{gi + 1}</span>
                  <button
                    type="button"
                    onClick={() => setOpen((o) => (o.has(g.country.value) ? (o.delete(g.country.value), new Set(o)) : new Set(o).add(g.country.value)))}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium hover:text-brand-700"
                  >
                    {isOpen ? <ChevronDown className="size-4 shrink-0 text-brand-700" /> : <ChevronRight className="size-4 shrink-0 text-muted" />}
                    <span className="truncate">{g.country.value}</span>
                    {!g.country.id && <span className="rounded bg-gold-100 px-1.5 text-[11px] font-normal text-gold-700">ใหม่จากสต็อก</span>}
                    <span className="text-xs font-normal text-muted">· {fmtInt(g.regions.length)} แคว้น</span>
                  </button>
                  <span className="hidden shrink-0 text-xs text-muted tabular-nums sm:inline">{fmtInt(g.country.count)} รายการ</span>
                  <Arrows disabledUp={gi === 0} disabledDown={gi === groups.length - 1} label={g.country.value} onUp={() => moveCountry(gi, gi - 1)} onDown={() => moveCountry(gi, gi + 2)} />
                </div>
                {isOpen && (
                  <RegionList
                    group={g.country.value}
                    regions={g.regions}
                    drag={drag}
                    drop={drop}
                    setDrag={setDrag}
                    setDrop={setDrop}
                    onDrop={onDropHere}
                    onMove={(from, to) => moveRegion(g.country.value, from, g.country.value, to)}
                    empty="ยังไม่มีแคว้น — ลากแคว้นมาวางที่ชื่อประเทศนี้ หรือเพิ่มที่ ข้อมูลหลัก › แคว้น"
                  />
                )}
              </li>
            )
          })}
          {/* แคว้นที่ยังไม่รู้ว่าอยู่ประเทศไหน */}
          {orphans.length > 0 && (
            <li className="border-t-2 border-line-strong bg-surface-2/60">
              <button
                type="button"
                onClick={() => setOpen((o) => (o.has(NONE) ? (o.delete(NONE), new Set(o)) : new Set(o).add(NONE)))}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-warning-700"
              >
                {open.has(NONE) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                ยังไม่ระบุประเทศ · {fmtInt(orphans.length)} แคว้น
                <span className="text-xs font-normal text-muted">— ลากไปวางที่ชื่อประเทศเพื่อระบุ</span>
              </button>
              {open.has(NONE) && (
                <RegionList group={NONE} regions={orphans} drag={drag} drop={drop} setDrag={setDrag} setDrop={setDrop} onDrop={onDropHere} onMove={(from, to) => moveRegion(NONE, from, NONE, to)} empty="" />
              )}
            </li>
          )}
        </ol>
      </SettingsCard>
    </div>
  )
}

function RegionList({
  group,
  regions,
  drag,
  drop,
  setDrag,
  setDrop,
  onDrop,
  onMove,
  empty,
}: {
  group: string
  regions: Entry[]
  drag: Drag | null
  drop: Drop | null
  setDrag: (d: Drag | null) => void
  setDrop: (d: Drop | null) => void
  onDrop: () => void
  onMove: (from: number, to: number) => void
  empty: string
}) {
  if (!regions.length) return <p className="px-12 pb-3 text-xs text-muted">{empty}</p>
  return (
    <ol className="pb-2">
      {regions.map((r, ri) => {
        const line = drag?.kind === 'region' && drop?.kind === 'region' && drop.group === group && (drop.at === ri || (drop.at === regions.length && ri === regions.length - 1))
        return (
          <li
            key={r.value}
            draggable
            onDragStart={(e) => {
              e.stopPropagation()
              e.dataTransfer.effectAllowed = 'move'
              setDrag({ kind: 'region', group, from: ri })
            }}
            onDragOver={(e) => {
              if (drag?.kind !== 'region') return
              e.preventDefault()
              e.stopPropagation()
              const r2 = e.currentTarget.getBoundingClientRect()
              setDrop({ kind: 'region', group, at: e.clientY > r2.top + r2.height / 2 ? ri + 1 : ri })
            }}
            onDrop={(e) => (e.preventDefault(), e.stopPropagation(), onDrop())}
            className={cn(
              'relative ml-10 mr-3 flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2 active:cursor-grabbing',
              drag?.kind === 'region' && drag.group === group && drag.from === ri && 'opacity-40',
            )}
          >
            {line && <span className={cn('pointer-events-none absolute inset-x-1 h-0.5 rounded bg-brand-600', drop!.at === ri ? '-top-px' : '-bottom-px')} />}
            <GripVertical className="size-3.5 shrink-0 text-muted" aria-hidden />
            <MapPin className="size-3.5 shrink-0 text-brand-600" aria-hidden />
            <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">{ri + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {r.value}
              {!r.id && <span className="ml-2 rounded bg-gold-100 px-1.5 text-[11px] text-gold-700">ใหม่จากสต็อก</span>}
            </span>
            <span className="hidden shrink-0 text-xs text-muted tabular-nums sm:inline">{fmtInt(r.count)} รายการ</span>
            <Arrows disabledUp={ri === 0} disabledDown={ri === regions.length - 1} label={r.value} onUp={() => onMove(ri, ri - 1)} onDown={() => onMove(ri, ri + 2)} />
          </li>
        )
      })}
    </ol>
  )
}

/** ปุ่มขึ้น/ลง (ใช้แทนการลากบนมือถือ / คีย์บอร์ด) */
function Arrows({ disabledUp, disabledDown, label, onUp, onDown }: { disabledUp: boolean; disabledDown: boolean; label: string; onUp: () => void; onDown: () => void }) {
  return (
    <span className="flex shrink-0">
      <button type="button" aria-label={`เลื่อน ${label} ขึ้น`} disabled={disabledUp} onClick={onUp} className="rounded p-1 text-ink-2 hover:bg-surface-2 disabled:opacity-30">
        <ChevronUp className="size-4" />
      </button>
      <button type="button" aria-label={`เลื่อน ${label} ลง`} disabled={disabledDown} onClick={onDown} className="rounded p-1 text-ink-2 hover:bg-surface-2 disabled:opacity-30">
        <ChevronDown className="size-4" />
      </button>
    </span>
  )
}
