-- ═══════════════════════════════════════════════════════════════════════════
-- Burgundy เป็นแคว้นของ France (ลำดับ 1) ไม่ใช่ประเทศ · ลบแคว้น Bordeaux / Bourgogne / Champagne
-- * ไวน์ที่ประเทศเป็น Burgundy หรือแคว้น Bourgogne → France / Burgundy
-- * ไวน์ในแคว้น Bordeaux / Champagne → ล้างแคว้น (ประวัติเอกสารเก็บค่าเดิมไว้)
-- ═══════════════════════════════════════════════════════════════════════════

delete from public.lookup_values where category = 'country' and lower(btrim(value)) = 'burgundy';
delete from public.lookup_values where category = 'region' and lower(btrim(value)) in ('bordeaux', 'bourgogne', 'champagne');

create temporary table _fr_regions (value text, ord int) on commit drop;
insert into _fr_regions values
  ('Burgundy', 1), ('Emilion', 2), ('Estephe', 3), ('Julien', 4), ('Margaux', 5), ('Pauillac', 6), ('Pessac', 7), ('Pomerol', 8);

update public.lookup_values l
set value = r.value, parent = 'France', sort_order = r.ord, is_active = true
from _fr_regions r
where l.category = 'region' and lower(btrim(l.value)) = lower(r.value);

insert into public.lookup_values (category, value, sort_order, parent)
select 'region', r.value, r.ord, 'France'
from _fr_regions r
where not exists (
  select 1 from public.lookup_values l where l.category = 'region' and lower(btrim(l.value)) = lower(r.value)
);

update public.stock_items set country = 'France', region = 'Burgundy' where lower(btrim(country)) = 'burgundy';
update public.stock_items set region = 'Burgundy' where lower(btrim(region)) = 'bourgogne';
update public.stock_items set region = null where lower(btrim(region)) in ('bordeaux', 'champagne');

-- ลำดับประเทศที่ใช้งานเรียงต่อกันใหม่ (เอา Burgundy ออกแล้วเหลือช่องว่าง)
update public.lookup_values l
set sort_order = n.rn
from (
  select id, row_number() over (order by sort_order, value) as rn
  from public.lookup_values
  where category = 'country' and is_active
) n
where l.id = n.id;
