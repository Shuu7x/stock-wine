import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Warehouse } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { stockItemsOptions, storesOptions, type Store } from '@/features/stock/api/stock.api'
import { cn } from '@/lib/cn'
import { fmtInt } from '@/lib/format'
import { useSaveStore } from '../api/settings.api'

const schema = z.object({
  name: z.string().trim().min(1, 'ระบุชื่อคลัง').max(60),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{1,12}$/, 'ใช้ A-Z 0-9 _ - ไม่เกิน 12 ตัว'),
  sort_order: z.number({ error: 'ระบุตัวเลข' }).int().min(0),
  is_active: z.boolean(),
})
type Values = z.infer<typeof schema>

export function StoresSettings() {
  const storesQ = useQuery(storesOptions())
  const itemsQ = useQuery(stockItemsOptions())
  const [editing, setEditing] = useState<Store | 'new' | null>(null)

  const stats = useMemo(() => {
    const m = new Map<number, { items: number; bottles: number }>()
    for (const i of itemsQ.data ?? []) {
      if (i.balance <= 0) continue
      const s = m.get(i.store_id) ?? { items: 0, bottles: 0 }
      s.items++
      s.bottles += i.balance
      m.set(i.store_id, s)
    }
    return m
  }, [itemsQ.data])

  const stores = [...(storesQ.data ?? [])].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <>
      <p className="mb-3 text-sm text-muted">
        คลังที่ปิดใช้งานจะไม่แสดงเป็นแท็บและเลือกไม่ได้ตอนทำรายการ แต่ข้อมูลเดิมยังอยู่ · ปิดคลังที่ยังมีไวน์คงเหลือไม่ได้
      </p>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {stores.map((s) => {
          const st = stats.get(s.id)
          return (
            <article
              key={s.id}
              className={cn('flex flex-col rounded-xl border border-line bg-surface p-4', !s.is_active && 'bg-surface-2')}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-xl',
                    s.is_active ? 'bg-brand-50 text-brand-700' : 'bg-surface-3 text-muted',
                  )}
                >
                  <Warehouse className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate font-semibold', !s.is_active && 'text-muted')}>{s.name}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono">{s.code}</span>
                    ลำดับ {s.sort_order}
                  </div>
                </div>
                {s.is_active ? <Badge tone="success">ใช้งาน</Badge> : <Badge>ปิดใช้งาน</Badge>}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-surface-2 py-2">
                  <div className="text-lg font-semibold tabular-nums">{fmtInt(st?.items ?? 0)}</div>
                  <div className="text-xs text-muted">รายการที่มีของ</div>
                </div>
                <div className="rounded-lg bg-surface-2 py-2">
                  <div className="text-lg font-semibold tabular-nums">{fmtInt(st?.bottles ?? 0)}</div>
                  <div className="text-xs text-muted">ขวด</div>
                </div>
              </div>
              <Button size="sm" className="mt-3 self-end" onClick={() => setEditing(s)} aria-label={`แก้ไข ${s.name}`}>
                <Pencil className="size-4" /> แก้ไข
              </Button>
            </article>
          )
        })}
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong text-sm font-medium text-ink-2 transition hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-800"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-surface-3">
            <Plus className="size-5" />
          </span>
          เพิ่มคลัง
        </button>
      </div>

      <StoreDialog
        store={editing}
        stores={stores}
        hasStock={editing && editing !== 'new' ? (stats.get(editing.id)?.bottles ?? 0) > 0 : false}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

function StoreDialog({
  store,
  stores,
  hasStock,
  onClose,
}: {
  store: Store | 'new' | null
  stores: Store[]
  hasStock: boolean
  onClose: () => void
}) {
  const save = useSaveStore()
  const isNew = store === 'new'
  const form = useForm<Values>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!store) return
    form.reset(
      store === 'new'
        ? { name: '', code: '', sort_order: Math.max(0, ...stores.map((s) => s.sort_order)) + 1, is_active: true }
        : { name: store.name, code: store.code, sort_order: store.sort_order, is_active: store.is_active },
    )
  }, [store, stores, form])

  const submit = form.handleSubmit(async (v) => {
    const dup = stores.find((s) => s.code === v.code && (isNew || s.id !== (store as Store).id))
    if (dup) return form.setError('code', { message: `รหัสนี้ใช้กับ ${dup.name} แล้ว` })
    await save.mutateAsync({ id: isNew ? undefined : (store as Store).id, values: v })
    toast.success(isNew ? `เพิ่มคลัง ${v.name} แล้ว` : `บันทึก ${v.name} แล้ว`)
    onClose()
  })

  const e = form.formState.errors
  return (
    <Dialog
      open={!!store}
      onClose={onClose}
      title={isNew ? 'เพิ่มคลัง' : 'แก้ไขคลัง'}
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            บันทึก
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_140px]">
        <Field label="ชื่อคลัง" error={e.name?.message}>
          <Input autoFocus placeholder="เช่น Cellar Room" {...form.register('name')} />
        </Field>
        <Field label="รหัส (ใช้ใน URL)" error={e.code?.message}>
          <Input className="font-mono uppercase" placeholder="CEL" {...form.register('code')} />
        </Field>
        <Field label="ลำดับการแสดง" error={e.sort_order?.message}>
          <Input type="number" min={0} {...form.register('sort_order', { valueAsNumber: true })} />
        </Field>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-2">เปิดใช้งาน</span>
          <Controller
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <div className="flex h-10 items-center">
                <Switch
                  checked={field.value}
                  onChange={field.onChange}
                  label="เปิดใช้งาน"
                  disabled={!isNew && hasStock && field.value}
                />
              </div>
            )}
          />
        </div>
        {!isNew && hasStock && (
          <p className="text-xs text-muted sm:col-span-2">คลังนี้ยังมีไวน์คงเหลือ จึงปิดใช้งานไม่ได้ (เบิกหรือย้ายออกให้หมดก่อน)</p>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
