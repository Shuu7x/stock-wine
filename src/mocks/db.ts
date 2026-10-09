import type { Tables } from '@/lib/database.types'

// ฐานข้อมูลจำลองในหน่วยความจำ เก็บลง localStorage ให้รีเฟรชแล้วข้อมูลยังอยู่
// รูปข้อมูลตรงกับตารางจริงใน supabase/migrations

type DB = {
  stores: Tables<'stores'>[]
  stock_items: Tables<'stock_items'>[]
  receipts: Tables<'receipts'>[]
  receipt_lines: Tables<'receipt_lines'>[]
  withdrawals: Tables<'withdrawals'>[]
  withdrawal_lines: Tables<'withdrawal_lines'>[]
  seq: { receipt: number; withdrawal: number }
}

const KEY = 'stock-wine:mock-db:v1'
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

function seed(): DB {
  const stock_items: Tables<'stock_items'>[] = SEED.map((s) => ({
    id: crypto.randomUUID(),
    store_id: s[0],
    rack: s[1],
    country: s[2],
    wine_name: s[3],
    vintage: s[4],
    balance: s[5],
    rating_rp: s[6],
    rating_ws: s[7],
    maturity_from: s[8]?.[0] ?? null,
    maturity_to: s[8]?.[1] ?? null,
    price_per_bottle: s[9],
    supplier: s[10],
    purchase_date: s[11],
    remark: null,
    deleted_at: null,
    deleted_by: null,
    ...audit(),
  }))
  return {
    stores: [
      { id: 1, code: 'SW1', name: 'Showroom Wines 1', sort_order: 1, ...audit() },
      { id: 2, code: 'SW2', name: 'Showroom Wines 2', sort_order: 2, ...audit() },
      { id: 3, code: 'BIG', name: 'Big Room Wines', sort_order: 3, ...audit() },
    ],
    stock_items,
    receipts: [],
    receipt_lines: [],
    withdrawals: [],
    withdrawal_lines: [],
    seq: { receipt: 0, withdrawal: 0 },
  }
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as DB
  } catch {
    /* ใช้ seed */
  }
  return seed()
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

export function docNo(prefix: 'RC' | 'WD', n: number) {
  const d = new Date()
  const yymm = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`
  return `${prefix}${yymm}-${String(n).padStart(4, '0')}`
}
