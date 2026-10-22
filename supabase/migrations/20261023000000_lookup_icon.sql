-- ═══════════════════════════════════════════════════════════════════════════
-- ธงของประเทศ: lookup_values.icon (อิโมจิ) — ตั้งเองได้ที่ ข้อมูลหลัก › ประเทศ
-- * ว่าง = ใช้ธงอัตโนมัติจากชื่อประเทศ (คำนวณฝั่งหน้าเว็บ)
-- * เติมประเทศของแคว้นที่ยังว่างอีกรอบ (แคว้นที่เพิ่มหลัง migration 20261020 แต่ไม่ได้ระบุประเทศ)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.lookup_values add column icon text;

update public.lookup_values l
set parent = s.country
from (
  select distinct on (lower(btrim(region))) lower(btrim(region)) as region, country
  from public.stock_items
  where deleted_at is null and region is not null and country is not null
  group by lower(btrim(region)), country
  order by lower(btrim(region)), count(*) desc, country
) s
where l.category = 'region' and l.parent is null and lower(btrim(l.value)) = s.region;
