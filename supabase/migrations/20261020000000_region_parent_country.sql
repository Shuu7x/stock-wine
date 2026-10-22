-- ═══════════════════════════════════════════════════════════════════════════
-- แคว้นผูกกับประเทศ: lookup_values.parent
-- * หมวด region เก็บชื่อประเทศของแคว้นนั้นใน parent (เช่น Bordeaux → France)
--   ให้หน้าตั้งค่า "การเรียงลำดับ" จัดแคว้นใต้ประเทศ และตัวเลือกแคว้นในตารางขึ้นตามประเทศของแถว
-- * แคว้นที่มีอยู่แล้ว: เติมประเทศจากข้อมูลสต็อก (ประเทศที่พบมากที่สุดของแคว้นนั้น)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.lookup_values add column parent text;

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
