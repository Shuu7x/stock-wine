/**
 * ธงชาติจากชื่อประเทศ (อังกฤษ/ไทย) → อิโมจิธง
 * ใช้รายชื่อประเทศของเบราว์เซอร์ (Intl.DisplayNames) จึงครอบคลุมทุกประเทศ ไม่ต้องดูแลตารางเอง
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

let byName: Map<string, string> | null = null

function table() {
  if (byName) return byName
  byName = new Map(Object.entries(ALIASES))
  const A = 'A'.charCodeAt(0)
  const names = (['en', 'th'] as const).map((l) => {
    try {
      return new Intl.DisplayNames([l], { type: 'region', fallback: 'none' })
    } catch {
      return null
    }
  })
  for (let i = 0; i < 26; i++)
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(A + i, A + j)
      for (const dn of names) {
        const n = dn?.of(code)
        if (n && !byName.has(n.toLowerCase())) byName.set(n.toLowerCase(), code)
      }
    }
  return byName
}

const cache = new Map<string, string>()

/** อิโมจิธงของประเทศ · ไม่รู้จัก = '' */
export function flagOf(country: string | null | undefined) {
  const key = country?.trim().toLowerCase()
  if (!key) return ''
  let f = cache.get(key)
  if (f === undefined) {
    const code = table().get(key)
    f = code ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : ''
    cache.set(key, f)
  }
  return f
}
