อิงโครงจาก react-boilerplate v0.3.0 · กฎใน AGENTS.md (standard @ 7dd4844)

# โครงสร้างโปรเจกต์ Vite + React + Supabase

สร้างโปรเจกต์ใหม่ด้วย Vite ใช้ Supabase เป็น database และให้ React ต่อ Supabase จากเบราว์เซอร์โดยตรง จึงไม่ต้องใช้ Next.js งาน UI ทำกับ mock ให้เสร็จก่อน แล้วจึงต่อ Supabase จริง

## ข้อสรุป

สร้างโปรเจกต์ViteReact 19 + TypeScript แบบ SPA โครงตาม react-boilerplate

DatabaseSupabasePostgres + Auth + Storage schema อยู่ใน repo เดียวกับเว็บ

Next.jsไม่ใช้React ต่อ Supabase ได้ตรงผ่าน `@supabase/supabase-js`

Supabase เปิด API ให้เรียกจากเบราว์เซอร์ด้วย publishable key (anon key) ซึ่งออกแบบมาให้เปิดเผยได้ ความปลอดภัยอยู่ที่ Row Level Security ใน Postgres ไม่ได้อยู่ที่การซ่อน key จึงไม่ต้องมี server ของ Next มาคั่นกลาง ทางนี้ใช้ได้เมื่อถือสามข้อนี้:

1. **เปิด RLS ทุกตาราง** และเขียน policy ครบก่อนมีข้อมูลจริง ตารางที่ไม่มี RLS เปิดให้ทุกคนที่มี publishable key อ่านเขียนได้
2. **ห้ามใส่ `service_role` หรือ secret key ในโค้ดเว็บ** และใน env ที่ขึ้นต้นด้วย `VITE_` เพราะค่าพวกนี้ถูกฝังลง bundle
3. **งานที่ต้องใช้ secret** (เรียก API ภายนอก งาน admin webhook) ทำใน Supabase Edge Functions ไม่ต้องตั้ง backend เพิ่ม

กลับมาพิจารณา Next.js เมื่อมีหน้าที่ต้องการ SSR หรือ SEO จริง ซึ่งเว็บ back-office หลัง login ไม่มี

## สร้างโปรเจกต์

```
# แนะนำ: clone react-boilerplate ซึ่งเป็น Vite อยู่แล้ว ได้กำแพง structure และ ESLint มาครบ
# หรือเริ่มเปล่าแล้ววางโครงตามต้นไม้ด้านล่าง:
bun create vite <name> --template react-ts

bun add @supabase/supabase-js
bun run dev                 # mock เปิดอยู่ ยังไม่ต้องมี Supabase project
```

## ลำดับงาน: UI กับ mock ก่อน Supabase ทีหลัง

ทุก feature เริ่มที่หน้าจอ โดยให้ MSW ตอบแทน Supabase ที่ชั้น network โค้ดของ feature เรียก `supabase` ตามปกติตั้งแต่วันแรก พอ UI ผ่านแล้วจึงสร้างตารางจริงและปิด mock โดยไม่ต้องแก้โค้ด feature

ขั้น 1 · ทำ UI VITE_ENABLE_MOCK=true scaffold feature แล้วปรับหน้าจอ ข้อมูลมาจาก `src/mocks/handlers/` ไม่ต้องมี Supabase project และไม่ต้องมี Docker

ขั้น 2 · สร้างตาราง supabase/migrations/ หลัง UI ได้รับอนุมัติ เขียน migration กับ RLS ตามรูปข้อมูลใน mock แล้วรัน `db:types`

ขั้น 3 · ต่อของจริง VITE_ENABLE_MOCK=false ชี้ `VITE_SUPABASE_URL` ไปที่ project จริง ทดสอบซ้ำทุกหน้า mock ยังเก็บไว้ใช้กับ feature ถัดไป

1. **ข้อมูลใน mock ใช้ชื่อคอลัมน์แบบที่จะเป็นในตารางจริง** (`snake_case`) เพราะรูปข้อมูลนี้คือร่างของ schema ในขั้น 2
2. **Mock อยู่ที่ MSW เท่านั้น** ตามกฎเดิม ห้าม mock ใน component หรือในชั้น `api/` แม้ชั่วคราว
3. **ช่วงที่ยังไม่มี `database.types.ts`** type ของแถวมาจาก zod schema ของ feature พอ generate ได้แล้วจึงใส่ `createClient<Database>`

## ต้นไม้ไฟล์

ป้ายบอกสถานะเทียบกับ react-boilerplate ใช้ `orders` เป็นตัวอย่าง feature ที่ได้จาก `bun run new:feature -- orders`

## ข้อมูลเดินทางอย่างไร

Supabase client ถูกเรียกจากชั้น `api/` ของ feature เท่านั้น ที่เหลือของ feature ยังคุยกับ TanStack Query เหมือนเดิม จึงไม่ต้องแก้ component, form หรือ dialog

Route routes/\_authenticated/orders/index.tsx `validateSearch` แล้ว `useQuery(ordersListOptions(search))`

Feature API features/orders/api/orders.api.ts key factory + `queryOptions` คืน `{ items, total }`

Client ตัวเดียว lib/supabase.ts แนบ publishable key และ JWT ของผู้ใช้ให้เอง

Network MSW หรือ Supabase จริง สลับด้วย `VITE_ENABLE_MOCK` ของจริงมี RLS ตัดสินว่าแถวไหนอ่านเขียนได้

## จุดที่ต่างจาก boilerplate

| เรื่อง | boilerplate เดิม | โปรเจกต์นี้ |
| --- | --- | --- |
| เรียกข้อมูล | `apiGet/apiPost` จาก `@/lib/api-client` ไปที่ Go API | `supabase` จาก `@/lib/supabase` ใน `features/<name>/api/` เท่านั้น |
| Type ของข้อมูล | เขียน zod เองตาม API contract | generate จาก schema เป็น `database.types.ts` ส่วน zod ใช้กับฟอร์ม |
| Schema และ migration | อยู่ repo backend | `supabase/migrations/` ใน repo นี้ |
| สิทธิ์ระดับข้อมูล | backend ตรวจ | RLS policy ใน Postgres |
| Error | `ApiError` จาก envelope | `if (error) throw error` แล้ว global toast ใน `query-client.ts` รับต่อ |
| `lib/api-client.ts` | ใช้ทุก feature | เก็บไว้เฉพาะถ้ายังมี Go API อื่นต้องเรียก ไม่มีก็ลบพร้อม axios |

กฎเดิมที่ยังใช้ทั้งหมด: โครง feature, query key factory, list แบ่งหน้าฝั่ง server กับ state ใน URL, ฟอร์มผ่าน RHF + zod, สีผ่าน token, UI copy ภาษาไทย และ `bun run check` ต้องผ่าน

## ไฟล์ที่ต้องเขียน

### src/lib/supabase.ts

```
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { env } from '@/lib/env'

export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
)
```

client ตัวเดียวของทั้งแอป ไฟล์เดียวที่ import `@supabase/supabase-js` ได้

### src/mocks/handlers/orders.ts

```
// rest('orders') = `${VITE_SUPABASE_URL}/rest/v1/orders` (src/mocks/envelope.ts)
export const ordersHandlers = [
  http.get(rest('orders'), ({ request }) => {
    const q = new URL(request.url).searchParams
    let rows = [...orders]

    const status = q.get('status')?.replace('eq.', '')
    if (status) rows = rows.filter((r) => r.status === status)

    const [col, dir] = (q.get('order') ?? 'created_at.desc').split('.')
    rows.sort((a, b) => String(a[col]).localeCompare(String(b[col])))
    if (dir === 'desc') rows.reverse()

    const offset = Number(q.get('offset') ?? 0)
    const limit = Number(q.get('limit') ?? rows.length)
    return HttpResponse.json(rows.slice(offset, offset + limit), {
      headers: {
        'Content-Range': `${offset}-${offset + limit - 1}/${rows.length}`,
      },
    })
  }),
]
```

ใช้ตอนทำ UI ตอบในรูปเดียวกับ REST ของ Supabase: `order`, `offset`, `limit` และจำนวนรวมใน `Content-Range`

### features/orders/api/orders.api.ts

```
async function fetchOrders(s: OrdersSearch) {
  const from = (s.page - 1) * s.pageSize
  const { data, count, error } = await supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .order(s.sortBy, { ascending: s.sortDir === 'asc' })
    .range(from, from + s.pageSize - 1)
  if (error) throw error
  return { items: data, total: count ?? 0 }
}

export const ordersListOptions = (s: OrdersSearch) =>
  queryOptions({
    queryKey: ordersKeys.list(s),
    queryFn: () => fetchOrders(s),
    placeholderData: keepPreviousData,
  })
```

แบ่งหน้า เรียง และกรองที่ Postgres ตามกฎเดิม ไม่ดึงทั้งตารางมาทำในเบราว์เซอร์

### supabase/migrations/…\_orders.sql

```
create table orders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'pending',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table orders enable row level security;

create policy "อ่านได้เมื่อ login" on orders
  for select to authenticated using (true);

create policy "แก้ได้เฉพาะของตัวเอง" on orders
  for update to authenticated
  using (created_by = (select auth.uid()));
```

ตารางกับ policy อยู่ migration เดียวกันเสมอ ตัวอย่าง policy ต้องปรับตาม business rule จริง

## กำแพงที่ต้องปรับตาม

| กำแพง | สิ่งที่แก้ |
| --- | --- |
| `eslint.config.js` | ห้าม import `@supabase/supabase-js` นอก `src/lib/supabase.ts` แบบเดียวกับกฎ axios · ห้าม import `@/lib/supabase` นอก `features/*/api/**` |
| `templates/feature/` | `api/{{name}}.api.ts.hbs` เรียก `supabase` แทน `apiGet` · `mock.ts.hbs` ตอบในรูป REST ของ Supabase · เพิ่ม template migration ของตารางพร้อม RLS |
| `scripts/check-structure.mjs` | ไม่ต้องแก้ ไฟล์ใหม่ใน `src/lib/` เป็น `.ts` อยู่แล้ว และ `supabase/` อยู่นอก `src/` |
| `package.json` | เพิ่ม script `db:types` = `supabase gen types typescript --local > src/lib/database.types.ts` และรันใน `check` เพื่อจับ type ที่ไม่ตรง schema |
| `AGENTS.md` (ผ่าน standard) | แถว HTTP ในตาราง Stack · เพิ่มกฎ RLS ทุกตาราง และห้าม secret key ฝั่งเว็บ |

## ยังต้องตัดสินใจ

### Auth ใช้ของใคร

Supabase Auth หรือ login center เดิมของทีม ถ้าใช้ login center ต้องออก JWT ที่ Supabase ยอมรับ ไม่งั้น RLS จะไม่รู้ว่าใครเรียก ข้อนี้กระทบ `auth-slice`, `features/auth` และ policy ทุกตาราง จึงต้องตอบก่อนเขียน feature แรก

### Mock เลียนแบบ Supabase ลึกแค่ไหน

handler ต้องเข้าใจ filter ของ PostgREST เท่าที่หน้าจอใช้ (`eq`, `ilike`, `order`, `offset`, `limit`) ควรรวมเป็น helper ตัวเดียวใน `src/mocks/` ให้ทุก handler ใช้ร่วมกัน ถ้าหน้าจอเริ่มใช้ join หรือ RPC ที่เลียนแบบยาก ให้ feature นั้นข้ามไปขั้น 2 เร็วขึ้นแทนการเขียน mock ซับซ้อน

### เมนูและ role

`menuList` กับ `roles` เดิมมาจาก `/auth/me` ต้องกำหนดว่าจะเก็บในตารางไหนของ Supabase หรือใส่เป็น claim ใน JWT