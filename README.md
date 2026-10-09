# Wine Cellar · ระบบสต็อกไวน์

Vite + React 19 + TypeScript + Supabase ตามโครงใน `Vite Supabase Project Structure.md`

## เริ่มใช้งาน

```
npm install
cp .env.example .env.local   # VITE_ENABLE_MOCK=true
npm run dev
```

โหมด mock ไม่ต้องมี Supabase project: login ด้วยอีเมลใดก็ได้ รหัสผ่าน `password`
ข้อมูลทดลองเก็บใน localStorage กด "รีเซ็ตข้อมูลทดลอง" ที่แถบซ้ายเพื่อเริ่มใหม่

## หน้าจอ

| หน้า | ทำอะไร |
| --- | --- |
| `/stock` | ดูสต็อกแยกแท็บ All / Showroom Wines 1 / Showroom Wines 2 / Big Room Wines · แก้ข้อมูลไวน์ในตาราง · ลบแบบเก็บประวัติ (กู้คืนได้) · เลือกแถวแล้วกด "เบิก" · ส่งออก CSV |
| `/receive` | ใบรับเข้าหลายรายการ พิมพ์ชื่อเพื่อค้นไวน์เดิม ไม่เจอ = เพิ่มใหม่ · บันทึกแล้วแต่ละแถวเข้าคลังของตัวเอง |
| `/withdraw` | ใบเบิกหลายรายการ เลือกไวน์จากสต็อก กันเบิกเกินคงเหลือ |
| `/history` | เอกสารรับเข้า/เบิกทั้งหมด · ยกเลิกเอกสาร = ปรับยอดกลับ แต่เอกสารยังอยู่ |

### ตารางแบบ Excel (`src/components/data-grid`)

- คลิก/ลากเลือกช่วง · Shift+คลิก · คลิกเลขแถว/หัวคอลัมน์เลือกทั้งแถว/คอลัมน์
- ดับเบิลคลิก, Enter, F2 หรือพิมพ์ทับเพื่อแก้ · แตะซ้ำบนจอสัมผัส
- Ctrl+C / Ctrl+V คัดลอกวางกับ Excel/Google Sheets (วางเกินแถวสุดท้ายจะเพิ่มแถวให้)
- ลากมุม ■ ของช่วงที่เลือกเพื่อคัดลอกค่า (ตัวเลขที่เป็นลำดับจะต่อลำดับให้) · Ctrl+D คัดลอกค่าบนสุดลงมา
- ปุ่มกรองที่หัวคอลัมน์: เรียง, ค้นหา, ติ๊กเลือกค่า · ปุ่ม ▾ ในเซลล์เปิดรายการตัวเลือกที่ใช้บ่อย
- คลิกขวา: แทรก/ลบแถว, ล้างค่า · Ctrl+Z / Ctrl+Y · ลากขอบหัวคอลัมน์เพื่อปรับความกว้าง
- แถบล่างแสดงผลรวมของเซลล์ตัวเลขที่เลือก

## ต่อ Supabase จริง

1. รัน `supabase/migrations/20261009000000_wine_stock.sql` (ตาราง + RLS + function `post_receipt`, `post_withdrawal`, `void_receipt`, `void_withdrawal`)
2. สร้างผู้ใช้ใน Supabase Auth
3. ตั้ง `.env.local`: `VITE_ENABLE_MOCK=false`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable/anon key เท่านั้น)
4. `npm run db:types` เพื่อ generate `src/lib/database.types.ts` ทับไฟล์ที่เขียนมือไว้

## กติกาข้อมูล

- ไม่มีการลบแถวจริง: `stock_items.deleted_at`, เอกสารใช้ `status = 'void'` (ไม่มี RLS policy สำหรับ delete)
- `balance` แก้ได้ผ่าน function เท่านั้น (ไม่ได้ grant update คอลัมน์นี้)
- รับเข้าจับคู่ไวน์เดิมด้วย คลัง + ชื่อ + ปี + rack (unique index `stock_items_identity_uq`)
- บรรทัดเอกสารเก็บ snapshot ข้อมูลไวน์ ณ วันที่ทำรายการ
