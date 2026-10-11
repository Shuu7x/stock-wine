-- บิล (เอกสารเรียกเก็บเงิน) แยกจากใบขาย
-- * บิลหนึ่งใบรวมได้หลายใบขาย (แยกบิลละใบขาย หรือรวมต่อลูกค้า เลือกตอนออกบิล)
-- * sales.bill_id = บิลที่ใช้อยู่ตอนนี้ (null = ยังไม่ออกบิล)
-- * bill_sales = ใบขายในบิลแต่ละใบ (เก็บถาวร แม้บิลถูกยกเลิก)
-- * ยกเลิกบิล = ใบขายกลับไปรอออกบิล · ยกเลิกใบขายที่ออกบิลแล้วไม่ได้ ต้องยกเลิกบิลก่อน

create sequence public.bill_no_seq;

create table public.bills (
  id               uuid primary key default gen_random_uuid(),
  bill_no          text not null unique
                   default 'BL' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.bill_no_seq')::text, 4, '0'),
  issued_at        date not null default current_date,
  customer         text,
  note             text,
  subtotal         numeric(14, 2) not null default 0,
  vat_amount       numeric(14, 2) not null default 0,
  total            numeric(14, 2) not null default 0,
  status           text not null default 'posted' check (status in ('posted', 'void')),
  void_reason      text,
  voided_at        timestamptz,
  voided_by        uuid,
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid()
);
create trigger bills_audit before update on public.bills for each row execute function public.set_updated_audit();

create table public.bill_sales (
  bill_id    uuid not null references public.bills (id),
  sale_id    uuid not null references public.sales (id),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (bill_id, sale_id)
);
create index bill_sales_sale_idx on public.bill_sales (sale_id);

alter table public.sales add column bill_id uuid references public.bills (id);
create index sales_unbilled_idx on public.sales (sold_at) where bill_id is null and status = 'posted';

alter table public.bills      enable row level security;
alter table public.bill_sales enable row level security;
create policy "อ่านได้เมื่อ login" on public.bills      for select to authenticated using (true);
create policy "อ่านได้เมื่อ login" on public.bill_sales for select to authenticated using (true);
revoke insert, update, delete on public.bills, public.bill_sales from anon, authenticated;

-- ─── issue_bills ────────────────────────────────────────────────────────────
-- p_groups: [{ sale_ids: [uuid, ...], customer?: text, note?: text }] · หนึ่งกลุ่ม = หนึ่งบิล
create or replace function public.issue_bills(p_issued_at date, p_groups jsonb)
returns setof public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group jsonb;
  v_ids   uuid[];
  v_bill  public.bills;
  v_n     int;
  v_no    int := 0;
begin
  if auth.uid() is null then raise exception 'ต้อง login ก่อน' using errcode = '42501'; end if;
  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then raise exception 'ไม่มีใบขายที่จะออกบิล'; end if;

  for v_group in select * from jsonb_array_elements(p_groups) loop
    v_no := v_no + 1;
    select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(v_group -> 'sale_ids') x;
    if v_ids is null or cardinality(v_ids) = 0 then raise exception 'บิลที่ %: ไม่มีใบขาย', v_no; end if;

    -- ล็อกใบขาย และตรวจว่ายังออกบิลได้
    perform 1 from public.sales where id = any (v_ids) for update;
    select count(*) into v_n from public.sales where id = any (v_ids) and status = 'posted' and bill_id is null;
    if v_n <> cardinality(v_ids) then
      raise exception 'บิลที่ %: มีใบขายที่ถูกยกเลิกหรือออกบิลไปแล้ว', v_no;
    end if;

    insert into public.bills (issued_at, customer, note, subtotal, vat_amount, total)
    select coalesce(p_issued_at, current_date),
           coalesce(nullif(btrim(v_group ->> 'customer'), ''), min(customer)),
           nullif(btrim(v_group ->> 'note'), ''),
           sum(subtotal), sum(vat_amount), sum(total)
    from public.sales where id = any (v_ids)
    returning * into v_bill;

    insert into public.bill_sales (bill_id, sale_id) select v_bill.id, unnest(v_ids);
    update public.sales set bill_id = v_bill.id where id = any (v_ids);
    return next v_bill;
  end loop;
end;
$$;

-- ─── void_bill: ใบขายกลับไปรอออกบิล ─────────────────────────────────────────
create or replace function public.void_bill(p_id uuid, p_reason text)
returns public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare v_bill public.bills;
begin
  if auth.uid() is null then raise exception 'ต้อง login ก่อน' using errcode = '42501'; end if;
  select * into v_bill from public.bills where id = p_id for update;
  if v_bill.id is null then raise exception 'ไม่พบบิล'; end if;
  if v_bill.status = 'void' then raise exception 'บิลนี้ถูกยกเลิกแล้ว'; end if;

  update public.sales set bill_id = null where bill_id = p_id;
  update public.bills
  set status = 'void', void_reason = nullif(btrim(p_reason), ''), voided_at = now(), voided_by = auth.uid()
  where id = p_id returning * into v_bill;
  return v_bill;
end;
$$;

-- ─── void_sale: ห้ามยกเลิกใบขายที่ออกบิลแล้ว ──────────────────────────────────
create or replace function public.void_sale(p_id uuid, p_reason text)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc  public.sales;
  v_bill text;
begin
  if auth.uid() is null then raise exception 'ต้อง login ก่อน' using errcode = '42501'; end if;
  select * into v_doc from public.sales where id = p_id for update;
  if v_doc.id is null then raise exception 'ไม่พบเอกสาร'; end if;
  if v_doc.status = 'void' then raise exception 'เอกสารนี้ถูกยกเลิกแล้ว'; end if;
  if v_doc.bill_id is not null then
    select bill_no into v_bill from public.bills where id = v_doc.bill_id;
    raise exception 'ใบขายนี้ออกบิล % แล้ว ต้องยกเลิกบิลก่อน', v_bill;
  end if;

  perform set_config('app.stock_action', 'void_sale', true);
  perform set_config('app.ref_doc', v_doc.doc_no, true);

  update public.stock_items s set balance = s.balance + l.qty
  from (select stock_item_id, sum(qty) as qty from public.sale_lines where sale_id = p_id group by stock_item_id) l
  where s.id = l.stock_item_id;

  update public.sales set status = 'void', void_reason = nullif(btrim(p_reason), ''), voided_at = now(), voided_by = auth.uid()
  where id = p_id returning * into v_doc;
  return v_doc;
end;
$$;

revoke execute on function public.issue_bills(date, jsonb) from public, anon;
revoke execute on function public.void_bill(uuid, text)    from public, anon;
grant  execute on function public.issue_bills(date, jsonb) to authenticated;
grant  execute on function public.void_bill(uuid, text)    to authenticated;
