import type { StockAction, Tables } from '@/lib/database.types'

// ฐานข้อมูลจำลองในหน่วยความจำ เก็บลง localStorage ให้รีเฟรชแล้วข้อมูลยังอยู่
// รูปข้อมูลตรงกับตารางจริงใน supabase/migrations

type DB = {
  stores: Tables<'stores'>[]
  stock_items: Tables<'stock_items'>[]
  receipts: Tables<'receipts'>[]
  receipt_lines: Tables<'receipt_lines'>[]
  withdrawals: Tables<'withdrawals'>[]
  withdrawal_lines: Tables<'withdrawal_lines'>[]
  stock_item_logs: Tables<'stock_item_logs'>[]
  lookup_values: Tables<'lookup_values'>[]
  app_settings: Tables<'app_settings'>[]
  sales: Tables<'sales'>[]
  sale_lines: Tables<'sale_lines'>[]
  stock_adjustments: Tables<'stock_adjustments'>[]
  stock_adjustment_lines: Tables<'stock_adjustment_lines'>[]
  transfers: Tables<'transfers'>[]
  transfer_lines: Tables<'transfer_lines'>[]
  bills: Tables<'bills'>[]
  bill_sales: Tables<'bill_sales'>[]
  receipt_attachments: Tables<'receipt_attachments'>[]
  roles: Tables<'roles'>[]
  profiles: Tables<'profiles'>[]
  seq: { receipt: number; withdrawal: number; log: number; sale: number; adjustment: number; transfer: number; bill: number; /** 1 = ข้อมูลตัวอย่างมีคะแนน WS แล้ว */ ws_seed?: number; /** 1 = มีไวน์เดียวกันหลายที่แล้ว */ split_seed?: number; /** 1 = มีไวน์หลายคะแนนแล้ว */ multi_seed?: number; /** 1 = มีประเภท/แคว้นแล้ว */ type_seed?: number; region_parent?: number }
}

const KEY = 'stock-wine:mock-db:v1'

// ─── ผู้ใช้และสิทธิ์ (ตรงกับ migration 20261018) ───
const ALL_PERMS = ['stock.edit', 'withdraw', 'receive', 'transfer', 'sale', 'adjust', 'history.view', 'history.void', 'qr', 'settings.manage', 'users.manage']
function seedRoles(): Tables<'roles'>[] {
  const t = new Date().toISOString()
  const role = (key: string, name: string, description: string, permissions: string[], sort_order: number) => ({
    key, name, description, permissions, is_system: true, sort_order, created_at: t, updated_at: t,
  })
  return [
    role('admin', 'ผู้ดูแลระบบ', 'ทำได้ทุกอย่าง รวมถึงจัดการผู้ใช้และสิทธิ์', ALL_PERMS, 1),
    role('manager', 'ผู้จัดการ', 'ทำรายการทุกอย่าง ยกเลิกเอกสาร และตั้งค่าระบบ (ยกเว้นจัดการผู้ใช้)', ALL_PERMS.filter((p) => p !== 'users.manage'), 2),
    role('staff', 'พนักงาน', 'เบิก รับเข้า โอนย้าย ขาย ดูความเคลื่อนไหว พิมพ์ป้าย', ['withdraw', 'receive', 'transfer', 'sale', 'history.view', 'qr'], 3),
    role('viewer', 'ดูอย่างเดียว', 'ดูสต็อกและความเคลื่อนไหว พิมพ์ป้าย QR', ['history.view', 'qr'], 4),
  ]
}
/** id ผู้ใช้ mock คงที่ตามอีเมล (admin ใช้ id เดิม) */
export function mockUserId(email: string) {
  const e = email.trim().toLowerCase()
  if (e === 'admin@wine.local') return '00000000-0000-4000-8000-000000000001'
  let h = 0
  for (const ch of e) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `00000000-0000-4000-8000-${h.toString(16).padStart(12, '0').slice(-12)}`
}
function seedProfiles(): Tables<'profiles'>[] {
  const t = new Date().toISOString()
  // ผู้ใช้ตัวอย่างแต่ละบทบาท (login รหัส "password")
  return ([
    ['admin@wine.local', 'ผู้ดูแล', 'admin'],
    ['manager@wine.local', 'ผู้จัดการ', 'manager'],
    ['staff@wine.local', 'พนักงานหน้าร้าน', 'staff'],
    ['viewer@wine.local', 'ดูอย่างเดียว', 'viewer'],
  ] as const).map(([email, display_name, role_key]) => ({
    user_id: mockUserId(email), email, display_name, role_key, is_active: true, created_at: t, updated_at: t,
  }))
}
export const MOCK_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@wine.local',
}

const now = () => new Date().toISOString()
const audit = () => ({
  created_at: now(),
  created_by: MOCK_USER.id,
  updated_at: now(),
  updated_by: MOCK_USER.id,
})

const SEED: Array<
  [store: number, rack: string, country: string, name: string, vintage: number | null, bal: number,
   rp: number | null, ws: number | null, mat: [number, number] | null, price: number, supplier: string, date: string]
> = [
  [1, 'A1', 'France', 'Château Margaux', 2015, 6, 100, 99, [2030, 2070], 38500, 'Wine Connection', '2024-03-12'],
  [1, 'A1', 'France', 'Château Lafite Rothschild', 2016, 3, 100, 98, [2032, 2075], 42000, 'Wine Connection', '2024-03-12'],
  [1, 'A2', 'France', 'Château Mouton Rothschild', 2010, 2, 100, 97, [2025, 2060], 45000, 'Italasia', '2023-11-02'],
  [1, 'A2', 'France', 'Château Pichon Baron', 2018, 12, 98, 96, [2028, 2050], 6900, 'Italasia', '2024-06-20'],
  [1, 'B1', 'France', 'Domaine Leflaive Puligny-Montrachet', 2019, 6, 93, 94, [2024, 2034], 5200, 'Bacchus', '2024-01-15'],
  [1, 'B1', 'France', 'Louis Roederer Cristal', 2014, 4, 97, 96, [2022, 2040], 11500, 'Bacchus', '2023-12-01'],
  [1, 'B2', 'Italy', 'Sassicaia', 2017, 6, 96, 95, [2025, 2045], 9800, 'Italasia', '2024-02-28'],
  [1, 'B2', 'Italy', 'Tignanello', 2019, 9, 95, 94, [2024, 2040], 4600, 'Italasia', '2024-02-28'],
  [2, 'C1', 'USA', 'Opus One', 2018, 6, 97, 96, [2025, 2050], 16500, 'Siam Winery', '2024-05-10'],
  [2, 'C1', 'USA', 'Caymus Cabernet Sauvignon', 2020, 12, 92, 93, [2023, 2035], 3900, 'Siam Winery', '2024-05-10'],
  [2, 'C2', 'Australia', 'Penfolds Grange', 2016, 3, 99, 98, [2028, 2060], 28000, 'Wine Garage', '2023-09-18'],
  [2, 'C2', 'Australia', 'Penfolds Bin 389', 2019, 12, 94, 93, [2024, 2040], 2500, 'Wine Garage', '2024-07-01'],
  [2, 'C3', 'Spain', 'Vega Sicilia Único', 2011, 2, 98, 97, [2023, 2055], 21000, 'Bacchus', '2023-08-05'],
  [2, 'C3', 'Chile', 'Almaviva', 2018, 6, 96, 95, [2025, 2045], 6200, 'Wine Connection', '2024-04-04'],
  [3, 'R01', 'France', 'Dom Pérignon', 2013, 12, 96, 96, [2023, 2040], 8900, 'Bacchus', '2024-01-08'],
  [3, 'R01', 'France', 'Moët & Chandon Brut Impérial', null, 24, 89, 88, null, 1650, 'Bacchus', '2024-08-15'],
  [3, 'R02', 'France', 'Château Lynch-Bages', 2016, 12, 97, 95, [2026, 2055], 5600, 'Italasia', '2023-10-22'],
  [3, 'R02', 'France', 'Château Palmer', 2015, 6, 98, 97, [2028, 2060], 14500, 'Italasia', '2023-10-22'],
  [3, 'R03', 'Italy', 'Gaja Barbaresco', 2017, 4, 96, 95, [2025, 2050], 12800, 'Italasia', '2024-03-30'],
  [3, 'R03', 'Italy', 'Antinori Solaia', 2016, 3, 100, 97, [2026, 2055], 17500, 'Italasia', '2024-03-30'],
  [3, 'R04', 'New Zealand', 'Cloudy Bay Sauvignon Blanc', 2023, 18, 90, 90, [2024, 2027], 1450, 'Wine Garage', '2024-09-02'],
  [3, 'R04', 'Germany', 'Egon Müller Scharzhofberger Riesling Kabinett', 2020, 6, 95, 94, [2025, 2045], 7800, 'Wine Garage', '2024-05-21'],
  [3, 'R05', 'France', 'Château d’Yquem', 2009, 2, 100, 98, [2020, 2080], 24000, 'Wine Connection', '2023-07-12'],
  [3, 'R05', 'Portugal', "Taylor's Vintage Port", 2017, 6, 98, 97, [2035, 2070], 4200, 'Bacchus', '2024-02-14'],
]

/** ไวน์เดียวกันเก็บหลายที่ (ต่างคลัง / คลังเดียวกันแต่ต่างชั้น) — ข้อมูลไวน์เหมือนแถวหลักใน SEED */
const SEED_SPLIT: Array<[name: string, vintage: number | null, store: number, rack: string, bal: number]> = [
  ['Château Margaux', 2015, 3, 'R02', 4], // SW1 A1 + Big Room R02
  ['Opus One', 2018, 1, 'B2', 3], // SW2 C1 + SW1 B2
  ['Dom Pérignon', 2013, 2, 'C2', 6], // Big Room R01 + SW2 C2
  ['Penfolds Bin 389', 2019, 2, 'C1', 4], // SW2 C2 + SW2 C1 (คลังเดียวกัน ต่างชั้น)
  ['Sassicaia', 2017, 1, 'A2', 2], // SW1 B2 + SW1 A2 (คลังเดียวกัน ต่างชั้น)
]
const seedSplitRows = () =>
  SEED_SPLIT.map(([name, vintage, store, rack, bal]) => {
    const base = SEED.find((r) => r[3] === name && r[4] === vintage)!
    const row = [...base] as (typeof SEED)[number]
    row[0] = store
    row[1] = rack
    row[5] = bal
    return row
  })

/** ไวน์ที่ใช้คะแนน WS (ที่เหลือใช้ RP) — ให้ข้อมูลตัวอย่างมีทั้งสองแบบ */
const WS_RATED = new Set([
  'Château Lafite Rothschild', 'Château Pichon Baron', 'Louis Roederer Cristal', 'Tignanello',
  'Caymus Cabernet Sauvignon', 'Penfolds Bin 389', 'Almaviva', 'Moët & Chandon Brut Impérial',
  'Château Palmer', 'Antinori Solaia', 'Cloudy Bay Sauvignon Blanc', "Taylor's Vintage Port",
])
/** ไวน์ที่มีคะแนนหลายค่า (RP + WS) */
const MULTI_RATED = new Set(['Château Margaux', 'Opus One', 'Penfolds Grange', 'Château d’Yquem'])
const seedRating = (name: string, rp: number | null, ws: number | null) =>
  MULTI_RATED.has(name) && rp != null && ws != null
    ? `${rp}RP, ${ws}WS`
    : WS_RATED.has(name) && ws != null
      ? `${ws}WS`
      : ratingText(rp, ws)

const COUNTRIES = [
  'France', 'Italy', 'Spain', 'Portugal', 'Germany', 'Austria', 'USA', 'Australia',
  'New Zealand', 'Chile', 'Argentina', 'South Africa', 'Japan', 'Thailand',
]

const WINE_TYPES = ['Red', 'White', 'Champagne', 'Burgundy', 'Whisky']

function seedLookups(): Tables<'lookup_values'>[] {
  const row = (category: Tables<'lookup_values'>['category'], value: string, i: number): Tables<'lookup_values'> => ({
    id: crypto.randomUUID(),
    category,
    store_id: null,
    value,
    sort_order: i + 1,
    is_active: true,
    parent: null,
    icon: null,
    ...audit(),
  })
  return [
    ...COUNTRIES.map((v, i) => row('country', v, i)),
    ...WINE_TYPES.map((v, i) => row('wine_type', v, i)),
    ...['Normal', 'Mg.'].map((v, i) => row('bottle_size', v, i)),
  ]
}

/** ประเภท + แคว้นของไวน์ตัวอย่าง */
const TYPE_REGION: Record<string, [type: string | null, region: string]> = {
  'Château Margaux': ['Red', 'Bordeaux'],
  'Château Lafite Rothschild': ['Red', 'Bordeaux'],
  'Château Mouton Rothschild': ['Red', 'Bordeaux'],
  'Château Pichon Baron': ['Red', 'Bordeaux'],
  'Château Lynch-Bages': ['Red', 'Bordeaux'],
  'Château Palmer': ['Red', 'Bordeaux'],
  'Château d’Yquem': ['White', 'Bordeaux'],
  'Domaine Leflaive Puligny-Montrachet': ['Burgundy', 'Bourgogne'],
  'Louis Roederer Cristal': ['Champagne', 'Champagne'],
  'Dom Pérignon': ['Champagne', 'Champagne'],
  'Moët & Chandon Brut Impérial': ['Champagne', 'Champagne'],
  Sassicaia: ['Red', 'Toscana'],
  Tignanello: ['Red', 'Toscana'],
  'Antinori Solaia': ['Red', 'Toscana'],
  'Gaja Barbaresco': ['Red', 'Piemonte'],
  'Opus One': ['Red', 'Napa Valley'],
  'Caymus Cabernet Sauvignon': ['Red', 'Napa Valley'],
  'Penfolds Grange': ['Red', 'South Australia'],
  'Penfolds Bin 389': ['Red', 'South Australia'],
  'Vega Sicilia Único': ['Red', 'Ribera del Duero'],
  Almaviva: ['Red', 'Maipo Valley'],
  'Cloudy Bay Sauvignon Blanc': ['White', 'Marlborough'],
  'Egon Müller Scharzhofberger Riesling Kabinett': ['White', 'Mosel'],
  "Taylor's Vintage Port": [null, 'Douro'],
}

function seedSettings(): Tables<'app_settings'>[] {
  return [
    { key: 'default_receive_store_id', value: null, ...audit() },
    { key: 'low_stock_threshold', value: 2, ...audit() },
    { key: 'require_withdraw_note', value: false, ...audit() },
    { key: 'vat_rate', value: 7, ...audit() },
    { key: 'default_vat_mode', value: 'included', ...audit() },
  ]
}

function emptyOps() {
  return {
    sales: [] as Tables<'sales'>[],
    sale_lines: [] as Tables<'sale_lines'>[],
    stock_adjustments: [] as Tables<'stock_adjustments'>[],
    stock_adjustment_lines: [] as Tables<'stock_adjustment_lines'>[],
    transfers: [] as Tables<'transfers'>[],
    transfer_lines: [] as Tables<'transfer_lines'>[],
    bills: [] as Tables<'bills'>[],
    bill_sales: [] as Tables<'bill_sales'>[],
    receipt_attachments: [] as Tables<'receipt_attachments'>[],
  }
}

/** คะแนนเดิม RP / WS → ข้อความค่าเดียว "100RP" (มี RP ใช้ RP ก่อน) */
function ratingText(rp: number | null | undefined, ws: number | null | undefined) {
  return rp != null ? `${rp}RP` : ws != null ? `${ws}WS` : null
}

function seedItem(s: (typeof SEED)[number]): Tables<'stock_items'> {
  return {
    id: crypto.randomUUID(),
    store_id: s[0],
    rack: s[1],
    country: s[2],
    wine_name: s[3],
    vintage: s[4],
    balance: s[5],
    rating: seedRating(s[3], s[6], s[7]),
    wine_type: TYPE_REGION[s[3]]?.[0] ?? null,
    bottle_size: 'Normal',
    region: TYPE_REGION[s[3]]?.[1] ?? null,
    maturity_from: s[8]?.[0] ?? null,
    maturity_to: s[8]?.[1] ?? null,
    price_per_bottle: s[9],
    supplier: s[10],
    purchase_date: s[11],
    remark: null,
    deleted_at: null,
    deleted_by: null,
    ...audit(),
  }
}

function seed(): DB {
  const stock_items = [...SEED, ...seedSplitRows()].map(seedItem)
  return {
    stores: [
      { id: 1, code: 'SW1', name: 'Showroom Wines 1', sort_order: 1, is_active: true, ...audit() },
      { id: 2, code: 'SW2', name: 'Showroom Wines 2', sort_order: 2, is_active: true, ...audit() },
      { id: 3, code: 'BIG', name: 'Big Room Wines', sort_order: 3, is_active: true, ...audit() },
    ],
    stock_items,
    receipts: [],
    receipt_lines: [],
    withdrawals: [],
    withdrawal_lines: [],
    stock_item_logs: [],
    lookup_values: seedLookups(),
    roles: seedRoles(),
    profiles: seedProfiles(),
    app_settings: seedSettings(),
    ...emptyOps(),
    seq: { receipt: 0, withdrawal: 0, log: 0, sale: 0, adjustment: 0, transfer: 0, bill: 0, ws_seed: 1, split_seed: 1, multi_seed: 1, type_seed: 1 },
  }
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as DB
      // ข้อมูลที่บันทึกไว้ก่อนมีตาราง log
      saved.stock_item_logs ??= []
      // ข้อมูลที่บันทึกไว้ก่อนมีหน้าตั้งค่า
      saved.lookup_values ??= seedLookups()
      saved.roles ??= seedRoles()
      saved.profiles ??= seedProfiles()
      saved.app_settings ??= seedSettings()
      for (const st of saved.stores) st.is_active ??= true
      // ข้อมูลที่บันทึกไว้ก่อนมีขาย/ปรับยอด/โอนย้าย
      Object.assign(saved, { ...emptyOps(), ...saved })
      saved.seq.sale ??= 0
      saved.seq.adjustment ??= 0
      saved.seq.transfer ??= 0
      saved.seq.bill ??= 0
      for (const s of saved.sales) s.bill_id ??= null
      for (const r of saved.receipts) {
        r.supplier ??= null
        r.purchase_date ??= null
      }
      for (const st of seedSettings()) {
        if (!saved.app_settings.some((x) => x.key === st.key)) saved.app_settings.push(st)
      }
      saved.seq.log ??= 0
      // ข้อมูลที่บันทึกไว้ก่อนรวม RP/WS เป็น rating
      for (const x of [...saved.stock_items, ...saved.receipt_lines] as Array<Record<string, unknown>>) {
        if (!('rating' in x)) {
          x.rating = ratingText(x.rating_rp as number | null, x.rating_ws as number | null)
          delete x.rating_rp
          delete x.rating_ws
        }
      }
      // ข้อมูลตัวอย่างเดิมเป็น RP ทั้งหมด → เปลี่ยนบางไวน์เป็น WS (เฉพาะที่ยังเป็นค่าตั้งต้น ไม่ทับที่ผู้ใช้แก้)
      if (!saved.seq.ws_seed) {
        for (const x of saved.stock_items) {
          const sd = SEED.find((r) => r[3] === x.wine_name && r[4] === x.vintage)
          if (sd && x.rating === ratingText(sd[6], sd[7])) x.rating = seedRating(sd[3], sd[6], sd[7])
        }
        saved.seq.ws_seed = 1
      }
      // เพิ่มประเภท/แคว้น (ข้อมูลเดิมยังไม่มีคอลัมน์นี้) · ประเภทไวน์ตั้งต้นในข้อมูลหลัก
      if (!saved.seq.type_seed) {
        for (const x of [...saved.stock_items, ...saved.receipt_lines] as Array<Record<string, unknown>>) {
          const tr = TYPE_REGION[x.wine_name as string]
          x.wine_type ??= tr?.[0] ?? null
          x.region ??= tr?.[1] ?? null
        }
        WINE_TYPES.forEach((value, i) => {
          if (!saved.lookup_values.some((l) => l.category === 'wine_type' && l.value === value))
            saved.lookup_values.push({ id: crypto.randomUUID(), category: 'wine_type', store_id: null, value, sort_order: i + 1, is_active: true, parent: null, icon: null, ...audit() })
        })
        saved.seq.type_seed = 1
      }
      // ขนาดขวด: ข้อมูลเดิมเป็น Normal · ตัวเลือกตั้งต้นในข้อมูลหลัก
      for (const x of [...saved.stock_items, ...saved.receipt_lines] as Array<Record<string, unknown>>) x.bottle_size ??= 'Normal'
      ;['Normal', 'Mg.'].forEach((value, i) => {
        if (!saved.lookup_values.some((l) => l.category === 'bottle_size' && l.value === value))
          saved.lookup_values.push({ id: crypto.randomUUID(), category: 'bottle_size', store_id: null, value, sort_order: i + 1, is_active: true, parent: null, icon: null, ...audit() })
      })
      // ธงประเทศ (คอลัมน์ใหม่) · แคว้นที่บันทึกไว้ก่อนมีประเทศของแคว้น → เติมจากประเทศที่พบมากที่สุดในสต็อก (ครั้งเดียว)
      for (const l of saved.lookup_values) l.icon ??= null
      if (!saved.seq.region_parent) {
        for (const l of saved.lookup_values) {
          if (l.category !== 'region' || l.parent) continue
          const count = new Map<string, number>()
          for (const x of saved.stock_items)
            if (!x.deleted_at && x.country && x.region?.trim().toLowerCase() === l.value.trim().toLowerCase())
              count.set(x.country, (count.get(x.country) ?? 0) + 1)
          l.parent = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
        }
        saved.seq.region_parent = 1
      }
      // ตัวอย่างไวน์ที่มีหลายคะแนน (เฉพาะที่ยังเป็นค่าตั้งต้น)
      if (!saved.seq.multi_seed) {
        for (const x of saved.stock_items) {
          const sd = SEED.find((r) => r[3] === x.wine_name && r[4] === x.vintage)
          if (sd && MULTI_RATED.has(sd[3]) && x.rating === ratingText(sd[6], sd[7])) x.rating = seedRating(sd[3], sd[6], sd[7])
        }
        saved.seq.multi_seed = 1
      }
      // เพิ่มตัวอย่างไวน์เดียวกันที่เก็บหลายที่ (ถ้ายังไม่มีแถวที่ตำแหน่งนั้น)
      if (!saved.seq.split_seed) {
        for (const r of seedSplitRows()) {
          const exists = saved.stock_items.some((x) => x.wine_name === r[3] && x.vintage === r[4] && x.store_id === r[0] && x.rack === r[1])
          if (!exists && saved.stores.some((st) => st.id === r[0])) saved.stock_items.push(seedItem(r))
        }
        saved.seq.split_seed = 1
        try {
          localStorage.setItem(KEY, JSON.stringify(saved)) // id ไวน์ใหม่ต้องคงที่ข้ามการรีเฟรช
        } catch {
          /* ไม่เป็นไร */
        }
      }
      return saved
    }
  } catch {
    /* ใช้ seed */
  }
  // บันทึก seed ทันที: id ไวน์ต้องคงที่ข้ามการรีเฟรช (QR ที่พิมพ์ไว้อ้าง id นี้)
  const fresh = seed()
  try {
    localStorage.setItem(KEY, JSON.stringify(fresh))
  } catch {
    /* โหมด private — ข้อมูลอยู่แค่ในหน่วยความจำ */
  }
  return fresh
}

export const db: DB = load()

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* โหมด private ฯลฯ — ข้อมูลอยู่แค่ในหน่วยความจำ */
  }
}

export function resetDb() {
  Object.assign(db, seed())
  persist()
}

export class PgError extends Error {
  constructor(
    message: string,
    public code = 'P0001',
  ) {
    super(message)
  }
}

export const auditNow = audit

export function docNo(prefix: 'RC' | 'WD' | 'SO' | 'AJ' | 'TF' | 'BL', n: number) {
  const d = new Date()
  const yymm = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`
  return `${prefix}${yymm}-${String(n).padStart(4, '0')}`
}

// ─── เลียนแบบ trigger public.log_stock_item_change ───────────────────────────
type StockItem = Tables<'stock_items'>
const TRACKED = [
  'store_id', 'rack', 'country', 'wine_name', 'vintage', 'wine_type', 'bottle_size', 'region', 'rating', 'maturity_from',
  'maturity_to', 'price_per_bottle', 'supplier', 'purchase_date', 'remark', 'balance', 'deleted_at',
] as const

export function logStockChange(
  before: StockItem | null,
  after: StockItem,
  email: string,
  action: StockAction | null = null,
  refDoc: string | null = null,
) {
  const changes: Tables<'stock_item_logs'>['changes'] = {}
  for (const k of TRACKED) {
    const o = before ? before[k] : null
    const n = after[k]
    if (o === n || (!before && n == null)) continue
    changes[k] = { old: o, new: n }
  }
  if (before && !Object.keys(changes).length) return
  const derived: StockAction = !before
    ? 'create'
    : !before.deleted_at && after.deleted_at
      ? 'delete'
      : before.deleted_at && !after.deleted_at
        ? 'restore'
        : 'update'
  db.seq.log += 1
  db.stock_item_logs.push({
    id: db.seq.log,
    stock_item_id: after.id,
    action: action ?? derived,
    ref_doc: refDoc,
    changes,
    store_id: after.store_id,
    wine_name: after.wine_name,
    vintage: after.vintage,
    created_by_email: email,
    ...audit(),
  })
}

/** เลียนแบบ public.my_access() · ผู้ใช้ใหม่ได้บทบาท viewer (เหมือน trigger handle_new_user) */
export function accessOf(email: string) {
  let p = db.profiles.find((x) => x.email?.toLowerCase() === email.toLowerCase())
  if (!p) {
    const t = new Date().toISOString()
    p = { user_id: mockUserId(email), email, display_name: null, role_key: 'viewer', is_active: true, created_at: t, updated_at: t }
    db.profiles.push(p)
    persist()
  }
  const r = db.roles.find((x) => x.key === p.role_key)
  return {
    role: r?.key ?? null,
    role_name: r?.name ?? null,
    is_active: p.is_active,
    permissions: p.is_active ? (r?.permissions ?? []) : [],
  }
}
export const mockCan = (email: string, perm: string) => accessOf(email).permissions.includes(perm)
