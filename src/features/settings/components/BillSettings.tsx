import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Receipt, Store } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Input } from '@/components/ui/field'
import { Segmented } from '@/components/ui/segmented'
import { Bill, type BillDoc } from '@/features/billing/components/Bill'
import { todayIso } from '@/lib/format'
import { APP_SETTINGS, DEFAULT_SETTINGS, pickSettings, type AppSettings } from '../app-settings'
import { appSettingsOptions, useSaveAppSettings } from '../api/settings.api'
import { SaveBar, SettingRow, SettingsCard } from './SettingsLayout'

const KEYS = ['shop_name', 'shop_address', 'shop_phone', 'shop_tax_id', 'bill_title', 'bill_title_en', 'bill_footer', 'bill_paper'] as const
type Values = Pick<AppSettings, (typeof KEYS)[number]>

const schema = z.object({
  shop_name: z.string().trim().min(1, 'ระบุชื่อร้าน').max(120),
  shop_address: APP_SETTINGS.shop_address.schema,
  shop_phone: APP_SETTINGS.shop_phone.schema,
  shop_tax_id: z
    .string()
    .trim()
    .regex(/^(\d{13})?$/, 'เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก (หรือเว้นว่าง)'),
  bill_title: z.string().trim().min(1, 'ระบุหัวบิล').max(60),
  bill_title_en: APP_SETTINGS.bill_title_en.schema,
  bill_footer: APP_SETTINGS.bill_footer.schema,
  bill_paper: APP_SETTINGS.bill_paper.schema,
}) satisfies z.ZodType<Values>

/** บิลตัวอย่างสำหรับดูหน้าตาขณะตั้งค่า */
const SAMPLE: BillDoc = {
  doc_no: 'SO2610-0001',
  sold_at: todayIso(),
  customer: 'คุณตัวอย่าง',
  note: 'ส่งของ 30/09/69',
  created_by_email: 'admin@wine.local',
  status: 'posted',
  vat_mode: 'included',
  vat_rate: 7,
  subtotal: 31214.95,
  vat_amount: 2185.05,
  total: 33400,
  lines: [
    { wine_name: 'Opus One', vintage: 2018, store_code: 'SW2', qty: 1, unit_price: 21400, has_vat: true, line_total: 21400 },
    { wine_name: 'Sassicaia', vintage: 2017, store_code: 'SW1', qty: 1, unit_price: 12000, has_vat: true, line_total: 12000 },
  ],
}

const MM = 96 / 25.4

export function BillSettings() {
  const settingsQ = useQuery(appSettingsOptions())
  const save = useSaveAppSettings()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: pickSettings(DEFAULT_SETTINGS, KEYS) })
  const live = useWatch({ control: form.control }) as Values

  useEffect(() => {
    // ไม่ทับสิ่งที่ผู้ใช้กำลังแก้ (ค่าโหลดเสร็จช้ากว่าการพิมพ์)
    if (settingsQ.data && !form.formState.isDirty) form.reset(pickSettings(settingsQ.data, KEYS))
  }, [settingsQ.data, form])

  const submit = form.handleSubmit(async (values) => {
    await save.mutateAsync(values)
    form.reset(values)
    toast.success('บันทึกการตั้งค่าบิลแล้ว')
  })

  // ตัวอย่างบิลย่อให้พอดีกล่อง
  const boxRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(0.5)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => setZoom(Math.min(1, (el.clientWidth - 24) / ((live.bill_paper === '80mm' ? 80 : 210) * MM)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [live.bill_paper])

  const e = form.formState.errors
  const err = (m?: string) => m && <p className="mt-1 text-xs text-danger-600">{m}</p>

  return (
    <form onSubmit={submit} className="grid gap-4 2xl:grid-cols-[1fr_minmax(0,460px)]">
      <div className="flex min-w-0 flex-col gap-4">
        <SettingsCard title="ข้อมูลร้าน" icon={Store} description="แสดงที่หัวบิล">
          <SettingRow htmlFor="shop_name" label="ชื่อร้าน / บริษัท">
            <Input id="shop_name" {...form.register('shop_name')} />
            {err(e.shop_name?.message)}
          </SettingRow>
          <SettingRow htmlFor="shop_address" label="ที่อยู่" description="ขึ้นบรรทัดใหม่ได้">
            <textarea
              id="shop_address"
              rows={3}
              className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
              {...form.register('shop_address')}
            />
          </SettingRow>
          <SettingRow htmlFor="shop_phone" label="เบอร์โทร">
            <Input id="shop_phone" inputMode="tel" {...form.register('shop_phone')} />
          </SettingRow>
          <SettingRow htmlFor="shop_tax_id" label="เลขประจำตัวผู้เสียภาษี" description="13 หลัก · เว้นว่างถ้าไม่ต้องการแสดง">
            <Input id="shop_tax_id" inputMode="numeric" maxLength={13} {...form.register('shop_tax_id')} />
            {err(e.shop_tax_id?.message)}
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="รูปแบบบิล" icon={Receipt}>
          <SettingRow htmlFor="bill_title" label="หัวบิล" description="เช่น ใบส่งสินค้า / ใบเสร็จรับเงิน / บิลเงินสด">
            <Input id="bill_title" {...form.register('bill_title')} />
            {err(e.bill_title?.message)}
          </SettingRow>
          <SettingRow htmlFor="bill_title_en" label="หัวบิลภาษาอังกฤษ" description="บรรทัดใต้หัวบิล เช่น SALE ORDER · เว้นว่างถ้าไม่ใช้">
            <Input id="bill_title_en" {...form.register('bill_title_en')} />
          </SettingRow>
          <SettingRow htmlFor="bill_footer" label="ข้อความท้ายบิล">
            <Input id="bill_footer" {...form.register('bill_footer')} />
          </SettingRow>
          <SettingRow label="กระดาษตั้งต้น" description="เปลี่ยนได้ทุกครั้งตอนพิมพ์">
            <Controller
              control={form.control}
              name="bill_paper"
              render={({ field }) => (
                <Segmented
                  className="!mx-0 !px-0"
                  value={field.value}
                  onChange={field.onChange}
                  items={[
                    { value: 'a4', label: 'A4' },
                    { value: '80mm', label: 'ใบเสร็จม้วน 80 มม.' },
                  ]}
                />
              )}
            />
          </SettingRow>
        </SettingsCard>

        <SaveBar
          dirty={form.formState.isDirty}
          saving={save.isPending}
          onReset={() => form.reset(pickSettings(settingsQ.data ?? DEFAULT_SETTINGS, KEYS))}
        />
      </div>

      <section className="flex min-w-0 flex-col gap-2 2xl:sticky 2xl:top-0 2xl:self-start">
        <h2 className="text-sm font-semibold text-ink-2">ตัวอย่างบิล</h2>
        <div ref={boxRef} className="flex justify-center rounded-xl border border-line bg-surface-3 p-3">
          <div className="shadow-lg" style={{ zoom }}>
            <Bill doc={SAMPLE} shop={{ ...DEFAULT_SETTINGS, ...live }} paper={live.bill_paper ?? 'a4'} />
          </div>
        </div>
      </section>
    </form>
  )
}
