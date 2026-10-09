import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
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
import { SettingsCard } from './SettingsLayout'

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

  const stores = storesQ.data ?? []

  return (
    <>
      <SettingsCard
        title="คลังสินค้า"
        description="คลังที่ปิดใช้งานจะไม่แสดงเป็นแท็บและเลือกไม่ได้ในการรับเข้า/เบิก แต่ข้อมูลเดิมยังอยู่ · ปิดคลังที่ยังมีไวน์คงเหลือไม่ได้"
        footer={
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> เพิ่มคลัง
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="px-5 py-2 font-medium">ลำดับ</th>
                <th className="py-2 pr-4 font-medium">รหัส</th>
                <th className="py-2 pr-4 font-medium">ชื่อคลัง</th>
                <th className="py-2 pr-4 text-right font-medium">รายการ / ขวด</th>
                <th className="py-2 pr-4 font-medium">สถานะ</th>
                <th className="py-2 pr-5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {stores.map((s) => {
                const st = stats.get(s.id)
                return (
                  <tr key={s.id} className={cn(!s.is_active && 'text-muted')}>
                    <td className="px-5 py-3 tabular-nums">{s.sort_order}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{s.code}</td>
                    <td className="py-3 pr-4 font-medium">{s.name}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {fmtInt(st?.items ?? 0)} / {fmtInt(st?.bottles ?? 0)}
                    </td>
                    <td className="py-3 pr-4">
                      {s.is_active ? <Badge tone="success">ใช้งาน</Badge> : <Badge>ปิดใช้งาน</Badge>}
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                        <Pencil className="size-4" /> แก้ไข
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SettingsCard>

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
