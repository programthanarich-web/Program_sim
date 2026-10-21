-- =====================================================================
-- Test harness: helper สำหรับทดสอบสิทธิ์ของแต่ละบทบาท
-- ทุกอย่างอยู่ใน schema tests และจะถูก ROLLBACK เมื่อจบการทดสอบ
-- =====================================================================
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create table tests.results (
  id serial primary key,
  name text not null,
  passed boolean not null,
  detail text
);

-- คู่มือ id ที่สร้างระหว่างทดสอบ (เก็บโดย superuser เท่านั้น แต่ให้อ่านได้เพื่อใช้ในสตริงทดสอบ)
create table tests.ids (
  k text primary key,
  id uuid not null
);
grant select on tests.ids to anon, authenticated, service_role;

create or replace function tests.id(p_key text)
returns uuid
language sql
stable
as $$
  select id from tests.ids where k = p_key
$$;

-- เปลี่ยนเป็นผู้ใช้ที่ล็อกอินแล้ว (role + JWT claims) เหมือนที่ PostgREST ทำ
create or replace function tests.as_user(p_uid uuid, p_role text default 'authenticated')
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text,
    false
  );
  execute format('set role %I', p_role);
end;
$$;

-- เปลี่ยนเป็นผู้ใช้ที่ไม่ได้ล็อกอิน (anon)
create or replace function tests.as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'set role anon';
end;
$$;

-- กลับเป็น superuser (ใช้ตั้งค่าเริ่มต้นและตรวจผลลัพธ์)
create or replace function tests.as_superuser()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'reset role';
end;
$$;

-- SECURITY DEFINER เฉพาะตัวบันทึกผล เพื่อให้เขียน tests.results ได้ขณะสวมบทบาทอื่น
-- (ฟังก์ชันที่รันคำสั่งทดสอบจริงต้องเป็น invoker เพื่อให้ RLS ทำงานตามจริง)
create or replace function tests.record(p_name text, p_passed boolean, p_detail text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into tests.results (name, passed, detail) values (p_name, p_passed, p_detail);
end;
$$;

-- คำสั่งต้องสำเร็จ
create or replace function tests.ok(p_name text, p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
    perform tests.record(p_name, true);
  exception when others then
    perform tests.record(p_name, false, 'ควรสำเร็จ แต่ได้ error: ' || sqlerrm);
  end;
end;
$$;

-- คำสั่งต้องถูกปฏิเสธ (error) และไม่มีผลข้างเคียง
create or replace function tests.denied(p_name text, p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
    perform tests.record(p_name, false, 'ควรถูกปฏิเสธ แต่คำสั่งสำเร็จ');
  exception when others then
    perform tests.record(p_name, true, sqlerrm);
  end;
end;
$$;

-- ข้อมูลต้องไม่ถูกเปิดเผย: ถูกปฏิเสธ (permission denied) หรือเห็น 0 แถว
create or replace function tests.hidden(p_name text, p_table_sql text)
returns void
language plpgsql
as $$
declare
  v_count bigint;
begin
  begin
    execute 'select count(*) from (' || p_table_sql || ') t' into v_count;
    if v_count = 0 then
      perform tests.record(p_name, true, 'เห็น 0 แถว');
    else
      perform tests.record(p_name, false, 'เห็นข้อมูล ' || v_count || ' แถว');
    end if;
  exception when others then
    perform tests.record(p_name, true, 'ถูกปฏิเสธ: ' || sqlerrm);
  end;
end;
$$;

-- จำนวนแถวที่เห็นต้องตรงกับที่คาดไว้
create or replace function tests.expect_count(p_name text, p_table_sql text, p_expected bigint)
returns void
language plpgsql
as $$
declare
  v_count bigint;
begin
  begin
    execute 'select count(*) from (' || p_table_sql || ') t' into v_count;
    perform tests.record(
      p_name,
      v_count = p_expected,
      'คาดหวัง ' || p_expected || ' ได้ ' || v_count
    );
  exception when others then
    perform tests.record(p_name, false, 'error: ' || sqlerrm);
  end;
end;
$$;

-- ค่า scalar ต้องตรงกับที่คาดไว้
create or replace function tests.expect_value(p_name text, p_sql text, p_expected text)
returns void
language plpgsql
as $$
declare
  v_value text;
begin
  begin
    execute p_sql into v_value;
    perform tests.record(
      p_name,
      v_value is not distinct from p_expected,
      'คาดหวัง ' || coalesce(p_expected, 'NULL') || ' ได้ ' || coalesce(v_value, 'NULL')
    );
  exception when others then
    perform tests.record(p_name, false, 'error: ' || sqlerrm);
  end;
end;
$$;

-- บันทึก id ของแถวที่สร้างไว้ (เรียกโดย superuser)
create or replace function tests.save(p_key text, p_id uuid)
returns void
language plpgsql
as $$
begin
  insert into tests.ids (k, id) values (p_key, p_id)
  on conflict (k) do update set id = excluded.id;
end;
$$;
