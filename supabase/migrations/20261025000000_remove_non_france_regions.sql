-- ═══════════════════════════════════════════════════════════════════════════
-- ลบแคว้นที่ไม่ได้อยู่ใต้ France
-- * ข้อมูลหลัก: ลบแคว้นที่ประเทศไม่ใช่ France (รวมที่ยังไม่ระบุประเทศ)
-- * ไวน์ในสต็อก: ล้างแคว้นที่ถูกลบ · ไวน์ที่ไม่ใช่ของ France แต่มีแคว้นที่ไม่อยู่ในข้อมูลหลักก็ล้างด้วย
--   (ประวัติเอกสาร เช่น ใบรับเข้า เก็บค่าเดิมไว้ ไม่แก้)
-- ═══════════════════════════════════════════════════════════════════════════

create temporary table _gone_regions on commit drop as
select distinct lower(btrim(value)) as v
from public.lookup_values
where category = 'region' and parent is distinct from 'France';

delete from public.lookup_values
where category = 'region' and parent is distinct from 'France';

update public.stock_items s
set region = null
where s.region is not null
  and (
    lower(btrim(s.region)) in (select v from _gone_regions)
    or (
      s.country is distinct from 'France'
      and lower(btrim(s.region)) not in (select lower(btrim(value)) from public.lookup_values where category = 'region')
    )
  );
