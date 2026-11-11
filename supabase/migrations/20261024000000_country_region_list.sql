-- ═══════════════════════════════════════════════════════════════════════════
-- รายชื่อประเทศ (เรียงตามตัวอักษร) + แคว้นของ France ตามที่กำหนด
-- * ประเทศ: ใช้งานเฉพาะในรายการ เรียงตามตัวอักษร · ประเทศอื่นปิดใช้งาน (ไม่ลบ — ไวน์เดิมยังอ้างถึงได้)
-- * แคว้นของ France: เพิ่มตามลำดับที่กำหนด · แคว้นเดิมของ France เรียงต่อท้าย
-- ═══════════════════════════════════════════════════════════════════════════

create temporary table _countries (value text, ord int) on commit drop;
insert into _countries values
  ('Argentina', 1), ('Australia', 2), ('Burgundy', 3), ('Chile', 4), ('France', 5), ('Germany', 6),
  ('Italy', 7), ('Japan', 8), ('South Africa', 9), ('Spain', 10), ('USA', 11);

-- ปิดใช้งานและต่อท้ายรายการ (ไม่ปนกับประเทศที่ใช้งาน)
update public.lookup_values l
set is_active = false, sort_order = 100 + l.sort_order
where l.category = 'country'
  and not exists (select 1 from _countries c where lower(c.value) = lower(btrim(l.value)));

update public.lookup_values l
set value = c.value, sort_order = c.ord, is_active = true
from _countries c
where l.category = 'country' and lower(btrim(l.value)) = lower(c.value);

insert into public.lookup_values (category, value, sort_order)
select 'country', c.value, c.ord
from _countries c
where not exists (
  select 1 from public.lookup_values l where l.category = 'country' and lower(btrim(l.value)) = lower(c.value)
);

create temporary table _fr_regions (value text, ord int) on commit drop;
insert into _fr_regions values
  ('Emilion', 1), ('Estephe', 2), ('Julien', 3), ('Margaux', 4), ('Pauillac', 5), ('Pessac', 6), ('Pomerol', 7);

-- แคว้นเดิมของ France ต่อท้ายรายการใหม่ (ลำดับเดิมคงไว้)
update public.lookup_values l
set sort_order = 100 + l.sort_order
where l.category = 'region' and l.parent = 'France'
  and not exists (select 1 from _fr_regions r where lower(r.value) = lower(btrim(l.value)));

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
