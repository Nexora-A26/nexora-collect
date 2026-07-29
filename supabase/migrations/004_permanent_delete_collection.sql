-- Nexora Collect v1.3.2
-- Permanent deletion of collection operations.
-- Run once in Supabase SQL Editor after migrations 001-003.

begin;

create or replace function public.delete_collection(p_id bigint, p_reason text default '')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.collections;
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if not public.has_permission('collections','delete') then
    raise exception 'ليس لديك صلاحية حذف عملية القبض.';
  end if;

  select * into v_row from public.collections where id=p_id for update;
  if not found then raise exception 'عملية القبض غير موجودة أو حُذفت مسبقاً.'; end if;
  if not public.can_access_representative(v_row.representative_id) then
    raise exception 'ليس لديك صلاحية الوصول إلى عملية القبض.';
  end if;

  -- Preserve the optional reason only in the audit trail before deleting the business record.
  if v_reason <> '' then
    update public.collections
       set notes=concat_ws(E'\n',nullif(notes,''),'سبب الحذف النهائي: '||v_reason), updated_at=now()
     where id=p_id;
  end if;

  delete from public.collections where id=p_id;
  if not found then raise exception 'تعذر حذف عملية القبض.'; end if;
  return true;
end;
$$;

-- Older deployed clients call this function. It now performs a permanent delete too.
create or replace function public.cancel_collection(p_id bigint, p_reason text default '')
returns boolean
language plpgsql
security invoker
as $$
begin
  return public.delete_collection(p_id,p_reason);
end;
$$;

grant execute on function public.delete_collection(bigint,text) to authenticated;
grant execute on function public.cancel_collection(bigint,text) to authenticated;

commit;
