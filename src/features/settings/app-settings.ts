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
} as const

type Defs = typeof APP_SETTINGS
export type AppSettingKey = keyof Defs
export type AppSettings = { [K in AppSettingKey]: z.infer<Defs[K]['schema']> }

export const DEFAULT_SETTINGS = Object.fromEntries(
  Object.entries(APP_SETTINGS).map(([k, d]) => [k, d.default]),
) as AppSettings

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
