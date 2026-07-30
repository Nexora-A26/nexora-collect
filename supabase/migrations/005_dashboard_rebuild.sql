begin;

create or replace function public.dashboard_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.has_permission('dashboard','view') then
    raise exception 'ليس لديك صلاحية عرض لوحة التحكم.';
  end if;

  select jsonb_build_object(
    'totals', jsonb_build_object(
      'representatives', (select count(*) from public.representatives r where r.status='active' and public.can_access_representative(r.id)),
      'customers', (select count(*) from public.customers c where c.status='active' and public.can_access_representative(c.representative_id)),
      'operations', (select count(*) from public.collections cl where cl.status='active' and public.can_access_representative(cl.representative_id)),
      'collected', (select coalesce(sum(cl.amount),0) from public.collections cl where cl.status='active' and public.can_access_representative(cl.representative_id)),
      'commissions', (select coalesce(sum(cl.commission_amount),0) from public.collections cl where cl.status='active' and public.can_access_representative(cl.representative_id)),
      'net', (select coalesce(sum(cl.net_amount),0) from public.collections cl where cl.status='active' and public.can_access_representative(cl.representative_id)),
      'delivered', (select coalesce(sum(s.amount),0) from public.settlements s where public.can_access_representative(s.representative_id)),
      'outstanding', (
        (select coalesce(sum(cl.net_amount),0) from public.collections cl where cl.status='active' and public.can_access_representative(cl.representative_id))
        -
        (select coalesce(sum(s.amount),0) from public.settlements s where public.can_access_representative(s.representative_id))
      ),
      'today', (select coalesce(sum(cl.amount),0) from public.collections cl where cl.status='active' and cl.collection_date=current_date and public.can_access_representative(cl.representative_id)),
      'month', (select coalesce(sum(cl.amount),0) from public.collections cl where cl.status='active' and date_trunc('month',cl.collection_date::timestamp)=date_trunc('month',current_date::timestamp) and public.can_access_representative(cl.representative_id))
    ),
    'recent', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.collection_date desc,x.id desc)
      from (
        select cl.id,cl.receipt_number,cl.amount,cl.commission_amount,cl.net_amount,
               cl.collection_date,cl.payment_method,cu.name customer_name,
               coalesce(r.name,'غير محدد') representative_name
        from public.collections cl
        join public.customers cu on cu.id=cl.customer_id
        left join public.representatives r on r.id=cl.representative_id
        where cl.status='active' and public.can_access_representative(cl.representative_id)
        order by cl.collection_date desc,cl.id desc
        limit 10
      ) x
    ),'[]'::jsonb),
    'trend', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.date)
      from (
        select cl.collection_date::text date,coalesce(sum(cl.amount),0) amount
        from public.collections cl
        where cl.status='active'
          and cl.collection_date>=current_date-29
          and public.can_access_representative(cl.representative_id)
        group by cl.collection_date
      ) x
    ),'[]'::jsonb),
    'topReps', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.amount desc,x.name)
      from (
        select r.name,coalesce(sum(cl.amount),0) amount
        from public.representatives r
        left join public.collections cl on cl.representative_id=r.id and cl.status='active'
        where r.status='active' and public.can_access_representative(r.id)
        group by r.id,r.name
        having coalesce(sum(cl.amount),0)>0
        order by amount desc,r.name
        limit 5
      ) x
    ),'[]'::jsonb),
    'topCustomers', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.amount desc,x.name)
      from (
        select c.name,coalesce(sum(cl.amount),0) amount
        from public.customers c
        left join public.collections cl on cl.customer_id=c.id and cl.status='active'
        where c.status='active' and public.can_access_representative(c.representative_id)
        group by c.id,c.name
        having coalesce(sum(cl.amount),0)>0
        order by amount desc,c.name
        limit 5
      ) x
    ),'[]'::jsonb),
    'generatedAt', now()
  ) into v_result;

  return coalesce(v_result, jsonb_build_object(
    'totals', jsonb_build_object(
      'representatives',0,'customers',0,'operations',0,'collected',0,
      'commissions',0,'net',0,'delivered',0,'outstanding',0,'today',0,'month',0
    ),
    'recent','[]'::jsonb,
    'trend','[]'::jsonb,
    'topReps','[]'::jsonb,
    'topCustomers','[]'::jsonb,
    'generatedAt',now()
  ));
end;
$$;

revoke all on function public.dashboard_data() from public;
grant execute on function public.dashboard_data() to authenticated;

commit;
