import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { RotateCcw, Save } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/field'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { VAT_MODE_LABEL } from '@/lib/vat'
import { storesOptions } from '@/features/stock/api/stock.api'
import { APP_SETTINGS, DEFAULT_SETTINGS, type AppSettings } from '../app-settings'
import { appSettingsOptions, useSaveAppSettings } from '../api/settings.api'
import { SettingRow, SettingsCard } from './SettingsLayout'

const schema = z.object({
  default_receive_store_id: APP_SETTINGS.default_receive_store_id.schema,
  low_stock_threshold: z.number({ error: 'ระบุตัวเลข' }).int('จำนวนเต็มเท่านั้น').min(0, 'ต้องไม่ติดลบ').max(9999),
  require_withdraw_note: APP_SETTINGS.require_withdraw_note.schema,
  vat_rate: z.number({ error: 'ระบุตัวเลข' }).min(0, 'ต้องไม่ติดลบ').max(30, 'ไม่เกิน 30%'),
  default_vat_mode: APP_SETTINGS.default_vat_mode.schema,
}) satisfies z.ZodType<AppSettings>

export function GeneralSettings() {
  const settingsQ = useQuery(appSettingsOptions())
  const storesQ = useQuery(storesOptions())
  const save = useSaveAppSettings()
  const form = useForm<AppSettings>({ resolver: zodResolver(schema), defaultValues: DEFAULT_SETTINGS })

  useEffect(() => {
    if (settingsQ.data) form.reset(settingsQ.data)
  }, [settingsQ.data, form])

  const submit = form.handleSubmit(async (values) => {
    await save.mutateAsync(values)
    form.reset(values)
    toast.success('บันทึกการตั้งค่าแล้ว')
  })

  const storeOptions = [
    { value: 0, label: 'ไม่กำหนด (ใช้คลังแรก)' },
    ...(storesQ.data ?? []).filter((s) => s.is_active).map((s) => ({ value: s.id, label: s.name, hint: s.code })),
  ]
  const { isDirty } = form.formState

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <SettingsCard title="รับเข้า">
        <SettingRow label="คลังตั้งต้นของแถวใหม่" description="คลังที่เลือกไว้ให้อัตโนมัติเมื่อเปิดหน้ารับเข้า (เปลี่ยนได้ทุกครั้งในหน้ารับเข้า)">
          <Controller
            control={form.control}
            name="default_receive_store_id"
            render={({ field }) => (
              <Combobox value={field.value ?? 0} options={storeOptions} onChange={(v) => field.onChange(v || null)} />
            )}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="สต็อก">
        <SettingRow
          htmlFor="low_stock_threshold"
          label="แจ้งเตือนไวน์ใกล้หมด"
          description="แสดงป้าย “ใกล้หมด” เมื่อคงเหลือไม่เกินจำนวนนี้ (0 = ปิดการแจ้งเตือน)"
        >
          <div className="flex items-center gap-2">
            <Input
              id="low_stock_threshold"
              type="number"
              min={0}
              inputMode="numeric"
              className="w-28 text-right tabular-nums"
              {...form.register('low_stock_threshold', { valueAsNumber: true })}
            />
            <span className="text-sm text-ink-2">ขวด</span>
          </div>
          {form.formState.errors.low_stock_threshold && (
            <p className="mt-1 text-xs text-danger-600">{form.formState.errors.low_stock_threshold.message}</p>
          )}
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="เบิก">
        <SettingRow label="ต้องกรอกหมายเหตุ / ผู้เบิก" description="บันทึกการเบิกไม่ได้ถ้าช่องหมายเหตุว่าง ช่วยให้ตามได้ว่าใครเบิกไปใช้ทำอะไร">
          <Controller
            control={form.control}
            name="require_withdraw_note"
            render={({ field }) => (
              <Switch checked={field.value} onChange={field.onChange} label="ต้องกรอกหมายเหตุ / ผู้เบิก" />
            )}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="การขาย">
        <SettingRow htmlFor="vat_rate" label="อัตรา VAT" description="ใช้คำนวณใบขายใหม่ (ใบขายเดิมเก็บอัตราของตัวเองไว้แล้ว)">
          <div className="flex items-center gap-2">
            <Input
              id="vat_rate"
              type="number"
              step="0.01"
              min={0}
              inputMode="decimal"
              className="w-28 text-right tabular-nums"
              {...form.register('vat_rate', { valueAsNumber: true })}
            />
            <span className="text-sm text-ink-2">%</span>
          </div>
          {form.formState.errors.vat_rate && (
            <p className="mt-1 text-xs text-danger-600">{form.formState.errors.vat_rate.message}</p>
          )}
        </SettingRow>
        <SettingRow label="ราคาขายตั้งต้น" description="ใบขายใหม่เริ่มด้วยแบบนี้ เปลี่ยนได้ทุกใบในหน้าขาย">
          <Controller
            control={form.control}
            name="default_vat_mode"
            render={({ field }) => (
              <Segmented
                className="!mx-0 !px-0"
                value={field.value}
                onChange={field.onChange}
                items={[
                  { value: 'included', label: VAT_MODE_LABEL.included },
                  { value: 'excluded', label: VAT_MODE_LABEL.excluded },
                ]}
              />
            )}
          />
        </SettingRow>
      </SettingsCard>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-canvas/90 px-4 py-3 backdrop-blur lg:mx-0 lg:rounded-xl lg:border">
        <Button variant="ghost" disabled={!isDirty} onClick={() => form.reset(settingsQ.data ?? DEFAULT_SETTINGS)}>
          <RotateCcw className="size-4" /> ยกเลิก
        </Button>
        <Button type="submit" variant="primary" disabled={!isDirty} loading={save.isPending}>
          <Save className="size-4" /> บันทึกการตั้งค่า
        </Button>
      </div>
    </form>
  )
}
