import { useQuery } from '@tanstack/react-query'
import { ArrowDownUp, ChevronDown, ChevronUp, GripVertical, MapPin, Save, Undo2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
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

/**
 * ความสูงที่พอดีจอ: จากขอบบนขององค์ประกอบถึงขอบล่างของพื้นที่เลื่อน (<main>)
 * ใช้เฉพาะจอกว้าง (lg) — จอเล็กแผงเรียงต่อกันลงมาตามปกติ
 */
function useFitHeight(min = 420) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [height, setHeight] = useState<number>()
  useLayoutEffect(() => {
    if (!el) return
    const main = el.closest('main')
    if (!main) return
    const mq = window.matchMedia('(min-width: 1024px)')
    const fit = () => {
      if (!mq.matches) return setHeight(undefined)
      const top = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop
      // padding ล่างของ main + ของกรอบเนื้อหาตั้งค่า (pb-4)
      let gap = parseFloat(getComputedStyle(main).paddingBottom) + 16
      // แถบ "ยังไม่บันทึก" ใต้แผง — เผื่อที่ให้ด้วย ไม่ให้บังรายการ
      const bar = el.nextElementSibling as HTMLElement | null
      if (bar) gap += bar.offsetHeight + 16
      setHeight(Math.max(min, main.clientHeight - top - gap))
    }
    fit()
    // การ์ดด้านบนสูงขึ้น/ลดลงได้ (ข้อความสรุปตัดบรรทัด) · แถบบันทึกโผล่/หาย → คำนวณใหม่
    const ro = new ResizeObserver(fit)
    if (el.parentElement) ro.observe(el.parentElement)
    ro.observe(main)
    mq.addEventListener('change', fit)
    return () => {
      ro.disconnect()
      mq.removeEventListener('change', fit)
    }
  }, [el, min])
  return [setEl, height] as const
}

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

/** การเรียงลำดับ: 2 แผง — ซ้ายจัดลำดับประเทศ · ขวาจัดลำดับแคว้นของประเทศที่เลือก */
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
  const [picked, setPicked] = useState<string | null>(null)
  const reset = () => (setGroups(initial.groups), setOrphans(initial.orphans))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reset, [initial])
  // เปิดหน้ามา: เลือกประเทศแรกไว้ให้
  useEffect(() => {
    if (!picked && initial.groups[0]) setPicked(initial.groups[0].country.value)
  }, [initial, picked])

  const sig = (gs: Group[], os: Entry[]) =>
    JSON.stringify([gs.map((g) => [g.country.value, g.regions.map((r) => r.value)]), os.map((o) => o.value)])
  const dirty =
    sig(groups, orphans) !== sig(initial.groups, initial.orphans) ||
    groups.some((g) => !g.country.id || g.regions.some((r) => !r.id)) ||
    orphans.some((o) => !o.id)

  const current = picked === NONE ? null : groups.find((g) => g.country.value === picked)
  const regions = picked === NONE ? orphans : (current?.regions ?? [])
  const setRegionsOf = (group: string, list: Entry[]) =>
    group === NONE ? setOrphans(list) : setGroups((gs) => gs.map((g) => (g.country.value === group ? { ...g, regions: list } : g)))

  /** ย้ายแคว้นไปประเทศอื่น (ต่อท้ายแคว้นของประเทศนั้น) */
  function moveRegionTo(value: string, toGroup: string) {
    if (!picked || toGroup === picked) return
    const r = regions.find((x) => x.value === value)
    if (!r) return
    setRegionsOf(picked, regions.filter((x) => x.value !== value))
    const dst = toGroup === NONE ? orphans : (groups.find((g) => g.country.value === toGroup)?.regions ?? [])
    setRegionsOf(toGroup, [...dst, r])
    toast.success(`ย้าย ${value} ไป ${toGroup === NONE ? 'ยังไม่ระบุประเทศ' : toGroup} แล้ว`, { description: 'กดบันทึกลำดับเพื่อใช้งาน' })
  }

  async function save() {
    const rows: LookupWrite[] = []
    const keep = (id: string | null) => (id ? (lookups.find((l) => l.id === id)?.is_active ?? true) : true)
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

  const [fitRef, fitHeight] = useFitHeight()

  if (lookupsQ.isLoading || itemsQ.isLoading) return <Loading screen />

  const sortCountries = (by: 'count' | 'name') =>
    setGroups((gs) =>
      [...gs].sort((a, b) => (by === 'count' ? b.country.count - a.country.count || a.country.value.localeCompare(b.country.value) : a.country.value.localeCompare(b.country.value))),
    )

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard
        title="เรียงหน้าสต็อกตามประเทศ / แคว้น"
        icon={ArrowDownUp}
        description="เปิดแล้วหน้าสต็อกและไฟล์ Excel เรียง ประเทศ → แคว้น → ชื่อไวน์ ตามลำดับด้านล่าง · กดหัวคอลัมน์เพื่อเรียงแบบอื่นได้เหมือนเดิม"
      >
        <div className="flex flex-col gap-3 px-5 pt-3 pb-4">
          <div className="flex items-center gap-3">
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
          {/* ตัวอย่างลำดับที่จะเห็นในหน้าสต็อก */}
          <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
            <span className="font-medium text-ink">ลำดับในหน้าสต็อก: </span>
            {groups.slice(0, 4).map((g, i) => (
              <span key={g.country.value}>
                {i > 0 && <span className="text-muted"> · </span>}
                <b className="text-brand-800">{g.country.value}</b>
                {g.regions.length > 0 && <span className="text-muted"> ({g.regions.slice(0, 3).map((r) => r.value).join(' › ')}{g.regions.length > 3 ? ' …' : ''})</span>}
              </span>
            ))}
            {groups.length > 4 && <span className="text-muted"> · และอีก {groups.length - 4} ประเทศ</span>}
          </div>
        </div>
      </SettingsCard>

      <div ref={fitRef} style={{ height: fitHeight }} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* ── ซ้าย: ประเทศ ── */}
        <section className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
          <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <span className="flex size-7 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">1</span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">ลำดับประเทศ</h2>
              <p className="text-xs text-muted">ลากเพื่อเลื่อน · คลิกเพื่อดูแคว้นทางขวา</p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => sortCountries('count')} title="ประเทศที่มีไวน์มากที่สุดขึ้นก่อน">
                ไวน์มากก่อน
              </Button>
              <Button size="sm" variant="ghost" onClick={() => sortCountries('name')} title="เรียงตามตัวอักษร">
                ก → ฮ
              </Button>
            </div>
          </header>
          <SortableList
            items={groups.map((g) => g.country)}
            onReorder={(from, to) => setGroups((gs) => move(gs, from, to))}
            selected={picked}
            onSelect={setPicked}
            meta={(e) => {
              const g = groups.find((x) => x.country.value === e.value)!
              return `${fmtInt(g.regions.length)} แคว้น · ${fmtInt(e.count)} รายการ`
            }}
          />
          {orphans.length > 0 && (
            <button
              type="button"
              onClick={() => setPicked(NONE)}
              className={cn(
                'flex items-center gap-2 border-t border-line px-4 py-2.5 text-left text-sm',
                picked === NONE ? 'bg-warning-100 font-semibold text-warning-700' : 'text-warning-700 hover:bg-warning-100/50',
              )}
            >
              <MapPin className="size-4" /> ยังไม่ระบุประเทศ
              <span className="ml-auto text-xs">{fmtInt(orphans.length)} แคว้น</span>
            </button>
          )}
        </section>

        {/* ── ขวา: แคว้นของประเทศที่เลือก ── */}
        <section className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
          <header className="flex items-center gap-2 border-b border-line px-4 py-3">
            <span className="flex size-7 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">2</span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold">
                {picked === NONE ? 'แคว้นที่ยังไม่ระบุประเทศ' : current ? `แคว้นของ ${current.country.value}` : 'เลือกประเทศทางซ้าย'}
              </h2>
              <p className="text-xs text-muted">ลากเพื่อเลื่อน · เปลี่ยนประเทศของแคว้นได้ที่ช่อง "ย้ายไป"</p>
            </div>
          </header>
          {picked && regions.length > 0 ? (
            <SortableList
              items={regions}
              onReorder={(from, to) => setRegionsOf(picked, move(regions, from, to))}
              icon={MapPin}
              meta={(e) => `${fmtInt(e.count)} รายการ`}
              trailing={(e) => (
                <select
                  aria-label={`ย้าย ${e.value} ไปประเทศอื่น`}
                  value={picked}
                  onChange={(ev) => moveRegionTo(e.value, ev.target.value)}
                  onClick={(ev) => ev.stopPropagation()}
                  className="h-8 max-w-36 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink-2 outline-none focus:border-brand-600"
                >
                  {picked === NONE && <option value={NONE}>ย้ายไป…</option>}
                  {groups.map((g) => (
                    <option key={g.country.value} value={g.country.value}>
                      {g.country.value === picked ? `ย้ายไป… (${g.country.value})` : g.country.value}
                    </option>
                  ))}
                  {picked !== NONE && <option value={NONE}>ยังไม่ระบุประเทศ</option>}
                </select>
              )}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted">
              <MapPin className="size-8 text-line-strong" />
              {picked ? 'ประเทศนี้ยังไม่มีแคว้น — ใส่แคว้นในคอลัมน์ Region หน้าสต็อก หรือเพิ่มที่ ข้อมูลหลัก › แคว้น' : 'คลิกประเทศทางซ้ายเพื่อดูแคว้น'}
            </div>
          )}
        </section>
      </div>

      {dirty && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-brand-200 bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
          <span className="mr-auto text-sm text-ink-2">มีการเปลี่ยนลำดับที่ยังไม่บันทึก</span>
          <Button variant="ghost" onClick={reset}>
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

/** ย้ายสมาชิกตำแหน่ง from ไปแทรกก่อนตำแหน่ง to (to = ความยาว = ท้ายสุด) */
function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from + 1 === to) return list
  const next = [...list]
  const [x] = next.splice(from, 1)
  next.splice(to > from ? to - 1 : to, 0, x)
  return next
}

/** รายการที่ลากเรียงได้ (เมาส์) + ปุ่มขึ้น/ลง (มือถือ/คีย์บอร์ด) */
function SortableList({
  items,
  onReorder,
  selected,
  onSelect,
  meta,
  icon: Icon,
  trailing,
}: {
  items: Entry[]
  onReorder: (from: number, to: number) => void
  selected?: string | null
  onSelect?: (value: string) => void
  meta: (e: Entry) => string
  icon?: typeof MapPin
  trailing?: (e: Entry) => ReactNode
}) {
  const [from, setFrom] = useState<number | null>(null)
  const [at, setAt] = useState<number | null>(null)
  const end = () => (setFrom(null), setAt(null))
  return (
    <ol className="min-h-0 flex-1 overflow-auto p-2 max-lg:max-h-[60dvh]" onDragEnd={end}>
      {items.map((e, i) => {
        const on = selected === e.value
        return (
          <li
            key={e.value}
            draggable
            onDragStart={(ev) => {
              ev.dataTransfer.effectAllowed = 'move'
              setFrom(i)
            }}
            onDragOver={(ev) => {
              if (from == null) return
              ev.preventDefault()
              const r = ev.currentTarget.getBoundingClientRect()
              setAt(ev.clientY > r.top + r.height / 2 ? i + 1 : i)
            }}
            onDrop={(ev) => {
              ev.preventDefault()
              if (from != null && at != null) onReorder(from, at)
              end()
            }}
            onClick={() => onSelect?.(e.value)}
            className={cn(
              'group relative mb-1 flex cursor-grab items-center gap-2.5 rounded-lg border px-2.5 py-2 transition active:cursor-grabbing',
              on ? 'border-brand-300 bg-brand-50 shadow-sm' : 'border-line bg-surface hover:border-brand-200 hover:bg-surface-2',
              from === i && 'opacity-40',
            )}
          >
            {at === i && from != null && <span className="pointer-events-none absolute inset-x-1 -top-[3px] h-0.5 rounded bg-brand-600" />}
            {at === i + 1 && i === items.length - 1 && from != null && <span className="pointer-events-none absolute inset-x-1 -bottom-[3px] h-0.5 rounded bg-brand-600" />}
            <GripVertical className="size-4 shrink-0 text-muted group-hover:text-brand-700" aria-hidden />
            <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums', on ? 'bg-brand-700 text-white' : 'bg-surface-3 text-ink-2')}>
              {i + 1}
            </span>
            {Icon && <Icon className="size-3.5 shrink-0 text-brand-600" aria-hidden />}
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate text-sm', on && 'font-semibold text-brand-900')}>
                {e.value}
                {!e.id && <span className="ml-2 rounded bg-gold-100 px-1.5 text-[11px] font-normal text-gold-700">ใหม่จากสต็อก</span>}
              </span>
              <span className="block text-[11px] text-muted">{meta(e)}</span>
            </span>
            {trailing?.(e)}
            <span className="flex shrink-0" onClick={(ev) => ev.stopPropagation()}>
              <button type="button" aria-label={`เลื่อน ${e.value} ขึ้น`} disabled={i === 0} onClick={() => onReorder(i, i - 1)} className="rounded p-1 text-ink-2 hover:bg-surface-3 disabled:opacity-25">
                <ChevronUp className="size-4" />
              </button>
              <button type="button" aria-label={`เลื่อน ${e.value} ลง`} disabled={i === items.length - 1} onClick={() => onReorder(i, i + 2)} className="rounded p-1 text-ink-2 hover:bg-surface-3 disabled:opacity-25">
                <ChevronDown className="size-4" />
              </button>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
