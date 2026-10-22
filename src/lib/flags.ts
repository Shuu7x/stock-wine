/**
 * ธงชาติจากชื่อประเทศ (อังกฤษ/ไทย) → อิโมจิธง
 * ใช้รายชื่อประเทศของเบราว์เซอร์ (Intl.DisplayNames) จึงครอบคลุมทุกประเทศ ไม่ต้องดูแลตารางเอง
 * ตั้งธงเองได้ที่ ข้อมูลหลัก › ประเทศ (คอลัมน์ "ธง") — ค่าที่ตั้งไว้มาก่อนธงอัตโนมัติ
 * Windows ไม่มีฟอนต์ธง → โหลด polyfill (ฟอนต์ธงในโปรเจกต์) ที่ main.tsx
 */
const ALIASES: Record<string, string> = {
  usa: 'US',
  'u.s.a.': 'US',
  us: 'US',
  america: 'US',
  uk: 'GB',
  england: 'GB',
  scotland: 'GB',
  'great britain': 'GB',
  'south korea': 'KR',
  korea: 'KR',
  czechia: 'CZ',
  'czech republic': 'CZ',
  holland: 'NL',
}

export type CountryFlag = { code: string; name: string; th: string; flag: string }

/** อิโมจิธงจากรหัส 2 ตัวอักษร (ISO 3166-1) เช่น DE → 🇩🇪 */
export function flagFromCode(code: string) {
  const c = code.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : ''
}

/** รหัสที่ไม่ใช่ประเทศ (สำรองใช้ภายใน · ไม่ทราบ) */
const NOT_COUNTRY = /^(AA|Q[M-Z]|X[A-JL-Z]|ZZ)$/

let list: CountryFlag[] | null = null
let byName: Map<string, string> | null = null

/** ทุกประเทศที่เบราว์เซอร์รู้จัก (เรียงตามชื่ออังกฤษ) */
export function allCountryFlags(): CountryFlag[] {
  if (list) return list
  const dn = (l: string) => {
    try {
      return new Intl.DisplayNames([l], { type: 'region', fallback: 'none' })
    } catch {
      return null
    }
  }
  const en = dn('en')
  const th = dn('th')
  const out: CountryFlag[] = []
  for (let i = 0; i < 26; i++)
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(65 + i, 65 + j)
      if (NOT_COUNTRY.test(code)) continue
      // รหัสเก่าที่เลิกใช้ (เช่น DD = เยอรมนีตะวันออก → DE) ข้าม ไม่ให้แย่งชื่อประเทศปัจจุบัน
      try {
        if (new Intl.Locale(`und-${code}`).region !== code) continue
      } catch {
        continue
      }
      const name = en?.of(code)
      if (!name) continue
      out.push({ code, name, th: th?.of(code) ?? '', flag: flagFromCode(code) })
    }
  list = out.sort((a, b) => a.name.localeCompare(b.name))
  return list
}

function table() {
  if (byName) return byName
  byName = new Map(Object.entries(ALIASES))
  for (const c of allCountryFlags()) {
    // ชื่อเต็ม · ชื่อไม่มีวงเล็บ (Myanmar (Burma) → Myanmar) · ชื่อไทย · รหัส
    const bare = (n: string) => n.replace(/\s*\(.*\)$/, '')
    const names = [c.name, bare(c.name), c.th, bare(c.th), c.code]
    for (const n of names) if (n && !byName.has(n.toLowerCase())) byName.set(n.toLowerCase(), c.code)
  }
  return byName
}

const cache = new Map<string, string>()

/** อิโมจิธงอัตโนมัติจากชื่อประเทศ · ไม่รู้จัก = '' */
export function flagOf(country: string | null | undefined) {
  const key = country?.trim().toLowerCase()
  if (!key) return ''
  let f = cache.get(key)
  if (f === undefined) {
    const code = table().get(key)
    f = code ? flagFromCode(code) : ''
    cache.set(key, f)
  }
  return f
}

/**
 * ค่าที่พิมพ์ในช่อง "ธง" → อิโมจิ
 * รหัส 2 ตัว (DE) · ชื่อประเทศ (Germany / เยอรมนี) · หรือวางอิโมจิมาเลย · ว่าง = ใช้ธงอัตโนมัติ
 */
export function parseFlag(text: string): string | null | undefined {
  const t = text.trim()
  if (!t) return null
  if (/^[a-z]{2}$/i.test(t)) return allCountryFlags().some((c) => c.code === t.toUpperCase()) ? flagFromCode(t) : undefined
  const byCountry = flagOf(t)
  if (byCountry) return byCountry
  // ไม่ใช่ตัวอักษร/ตัวเลขธรรมดา = อิโมจิที่วางมา (ธงพิเศษ เช่น 🏴 ก็ได้)
  return /[\p{L}\p{N}]/u.test(t.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')) ? undefined : t
}
