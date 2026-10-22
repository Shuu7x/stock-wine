import { z } from 'zod'

/**
 * ค่าตั้งค่าระบบทั้งหมด (ตาราง app_settings แบบ key/value)
 * เพิ่มค่าใหม่: ใส่ key ที่นี่ (schema + default) แล้วเพิ่มช่องในหน้า "ทั่วไป" — ไม่ต้องแก้ DB
 * ค่าใน DB ที่ไม่ผ่าน schema จะถูกแทนด้วย default เสมอ หน้าเว็บจึงไม่พังเพราะข้อมูลเสีย
 */
export const APP_SETTINGS = {
  /** คลังตั้งต้นของแถวใหม่ในหน้ารับเข้า (null = คลังแรกที่เปิดใช้งาน) */
  default_receive_store_id: { schema: z.number().int().nullable(), default: null },
  /** แจ้งเตือนไวน์ใกล้หมดเมื่อคงเหลือไม่เกินจำนวนนี้ (0 = ปิด) */
  low_stock_threshold: { schema: z.number().int().min(0).max(9999), default: 2 },
  /** ต้องกรอกหมายเหตุ/ผู้เบิกทุกครั้งที่บันทึกเบิก */
  require_withdraw_note: { schema: z.boolean(), default: false },
  /** อัตรา VAT (%) ที่ใช้คำนวณใบขาย */
  vat_rate: { schema: z.number().min(0).max(30), default: 7 },
  /** ใบขายใหม่: ราคาที่กรอกรวม VAT แล้ว (included) หรือยังไม่รวม (excluded) */
  default_vat_mode: { schema: z.enum(['included', 'excluded']), default: 'included' as const },
  /** หน้าสต็อกเรียงตามลำดับประเทศ → แคว้น (ตั้งลำดับที่ ตั้งค่า › การเรียงลำดับ) */
  stock_sort_by_origin: { schema: z.boolean(), default: false },

  // ─── บิล / ใบเสร็จ ───
  shop_name: { schema: z.string().max(120), default: 'Wine Cellar' },
  shop_address: { schema: z.string().max(400), default: '' },
  shop_phone: { schema: z.string().max(60), default: '' },
  /** เลขประจำตัวผู้เสียภาษี (ว่าง = ไม่แสดง) */
  shop_tax_id: { schema: z.string().max(20), default: '' },
  bill_title: { schema: z.string().max(60), default: 'ใบส่งสินค้า' },
  /** หัวบิลภาษาอังกฤษใต้หัวไทย (ว่าง = ไม่แสดง) */
  bill_title_en: { schema: z.string().max(60), default: 'SALE ORDER' },
  bill_footer: { schema: z.string().max(200), default: '' },
  /** กระดาษตั้งต้นตอนพิมพ์บิล */
  bill_paper: { schema: z.enum(['a4', '80mm']), default: 'a4' as const },
} as const

type Defs = typeof APP_SETTINGS
export type AppSettingKey = keyof Defs
export type AppSettings = { [K in AppSettingKey]: z.infer<Defs[K]['schema']> }

export const DEFAULT_SETTINGS = Object.fromEntries(
  Object.entries(APP_SETTINGS).map(([k, d]) => [k, d.default]),
) as AppSettings

/** เลือกเฉพาะบาง key (แต่ละหน้าตั้งค่าบันทึกเฉพาะส่วนของตัวเอง) */
export function pickSettings<K extends AppSettingKey>(s: AppSettings, keys: readonly K[]): Pick<AppSettings, K> {
  return Object.fromEntries(keys.map((k) => [k, s[k]])) as Pick<AppSettings, K>
}

export function parseSettings(rows: Array<{ key: string; value: unknown }>): AppSettings {
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>
  for (const row of rows) {
    const def = APP_SETTINGS[row.key as AppSettingKey]
    if (!def) continue
    const r = def.schema.safeParse(row.value)
    if (r.success) out[row.key] = r.data
  }
  return out as AppSettings
}
