-- ═══════════════════════════════════════════════════════════════════════════
-- จัดการผู้ใช้จากหน้าเว็บ (ผู้มีสิทธิ์ users.manage)
-- * เพิ่มผู้ใช้: หน้าเว็บสมัครให้ (auth.signUp ด้วย client แยก ไม่ทับ session ผู้ดูแล)
--   → trigger handle_new_user สร้าง profile แล้วผู้ดูแลตั้งชื่อ/บทบาทต่อ
--   (ต้องเปิด "Allow new users to sign up" ใน Supabase › Authentication)
-- * ลบผู้ใช้: delete_user() ลบจาก auth.users (profile ลบตามด้วย cascade)
--   ห้ามลบตัวเอง · ห้ามลบผู้ดูแลที่ใช้งานได้คนสุดท้าย
-- * ประวัติเอกสารยังอยู่ครบ (เก็บอีเมลผู้บันทึกไว้ในเอกสารแล้ว)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles;
begin
  if not public.has_perm('users.manage') then
    raise exception 'ไม่มีสิทธิ์จัดการผู้ใช้' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'ลบบัญชีของตัวเองไม่ได้';
  end if;
  select * into v_target from public.profiles where user_id = p_user_id;
  if v_target.user_id is null then
    raise exception 'ไม่พบผู้ใช้นี้';
  end if;
  if v_target.role_key = 'admin' and v_target.is_active and not exists (
    select 1 from public.profiles where role_key = 'admin' and is_active and user_id <> p_user_id
  ) then
    raise exception 'ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

revoke execute on function public.delete_user(uuid) from public, anon;
grant  execute on function public.delete_user(uuid) to authenticated;
