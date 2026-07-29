-- Nexora Collect v1.3.0
-- Direct collection workflow: representative + customer + amount + commission.
-- Safe to run after 001_nexora_collect.sql on an existing Supabase project.

begin;

-- New direct collections are not linked to a receivable record.
alter table public.collections alter column receivable_id drop not null;

-- Keep legacy receivable-linked rows working, while direct rows skip receivable refresh.
create or replace function public.collections_refresh_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.receivable_id is not null then
    perform public.refresh_receivable(old.receivable_id);
  end if;
  if tg_op in ('INSERT','UPDATE') and new.receivable_id is not null then
    perform public.refresh_receivable(new.receivable_id);
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.create_collection(p_values jsonb)
returns public.collections
language plpgsql
security invoker
as $$
declare
  v_rep public.representatives;
  v_customer public.customers;
  v_existing public.collections;
  v_amount numeric;
  v_pct numeric;
  v_commission numeric;
  v_row public.collections;
begin
  if p_values ? 'operation_token' and nullif(p_values->>'operation_token','') is not null then
    select * into v_existing from public.collections where operation_token = (p_values->>'operation_token')::uuid;
    if found then return v_existing; end if;
  end if;

  select * into v_rep
  from public.representatives
  where id = nullif(p_values->>'representative_id','')::bigint;
  if not found or v_rep.status <> 'active' then
    raise exception 'المندوب غير موجود أو غير فعال.';
  end if;

  select * into v_customer
  from public.customers
  where id = nullif(p_values->>'customer_id','')::bigint;
  if not found or v_customer.status <> 'active' then
    raise exception 'العميل غير موجود أو غير فعال.';
  end if;
  if v_customer.representative_id is not null and v_customer.representative_id <> v_rep.id then
    raise exception 'العميل مرتبط بمندوب آخر. انقل العميل أولاً أو اختر مندوبه الحالي.';
  end if;

  v_amount := nullif(p_values->>'amount','')::numeric;
  if v_amount is null or v_amount <= 0 then
    raise exception 'المبلغ المقبوض يجب أن يكون أكبر من صفر.';
  end if;

  v_pct := coalesce(
    nullif(p_values->>'commission_percentage','')::numeric,
    v_customer.commission_percentage,
    v_rep.default_commission,
    0
  );
  if v_pct < 0 or v_pct > 100 then
    raise exception 'نسبة العمولة يجب أن تكون بين 0 و100.';
  end if;

  v_commission := round(v_amount * v_pct / 100, 4);

  insert into public.collections(
    operation_token, receipt_number, customer_id, receivable_id, representative_id,
    amount, commission_percentage, commission_amount, net_amount,
    collection_date, payment_method, notes, status, created_by
  ) values (
    nullif(p_values->>'operation_token','')::uuid,
    coalesce(p_values->>'receipt_number',''),
    v_customer.id,
    null,
    v_rep.id,
    v_amount,
    v_pct,
    v_commission,
    v_amount - v_commission,
    coalesce(nullif(p_values->>'collection_date','')::date,current_date),
    coalesce(nullif(p_values->>'payment_method',''),'cash'),
    coalesce(p_values->>'notes',''),
    'active',
    public.current_profile_id()
  ) returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.update_collection(p_id bigint, p_values jsonb)
returns public.collections
language plpgsql
security invoker
as $$
declare
  v_old public.collections;
  v_rep public.representatives;
  v_customer public.customers;
  v_rep_id bigint;
  v_customer_id bigint;
  v_amount numeric;
  v_pct numeric;
  v_commission numeric;
  v_row public.collections;
begin
  select * into v_old from public.collections where id = p_id for update;
  if not found then raise exception 'عملية القبض غير موجودة.'; end if;
  if v_old.status = 'cancelled' then raise exception 'لا يمكن تعديل عملية ملغاة.'; end if;

  v_rep_id := coalesce(nullif(p_values->>'representative_id','')::bigint, v_old.representative_id);
  v_customer_id := coalesce(nullif(p_values->>'customer_id','')::bigint, v_old.customer_id);

  select * into v_rep from public.representatives where id = v_rep_id;
  if not found or v_rep.status <> 'active' then raise exception 'المندوب غير موجود أو غير فعال.'; end if;

  select * into v_customer from public.customers where id = v_customer_id;
  if not found or v_customer.status <> 'active' then raise exception 'العميل غير موجود أو غير فعال.'; end if;
  if v_customer.representative_id is not null and v_customer.representative_id <> v_rep.id then
    raise exception 'العميل مرتبط بمندوب آخر. انقل العميل أولاً أو اختر مندوبه الحالي.';
  end if;

  v_amount := coalesce(nullif(p_values->>'amount','')::numeric, v_old.amount);
  if v_amount <= 0 then raise exception 'المبلغ المقبوض يجب أن يكون أكبر من صفر.'; end if;

  v_pct := coalesce(
    nullif(p_values->>'commission_percentage','')::numeric,
    v_old.commission_percentage,
    v_customer.commission_percentage,
    v_rep.default_commission,
    0
  );
  if v_pct < 0 or v_pct > 100 then raise exception 'نسبة العمولة يجب أن تكون بين 0 و100.'; end if;

  v_commission := round(v_amount * v_pct / 100, 4);

  update public.collections set
    receipt_number = coalesce(nullif(p_values->>'receipt_number',''), receipt_number),
    customer_id = v_customer.id,
    receivable_id = null,
    representative_id = v_rep.id,
    amount = v_amount,
    commission_percentage = v_pct,
    commission_amount = v_commission,
    net_amount = v_amount - v_commission,
    collection_date = coalesce(nullif(p_values->>'collection_date','')::date, collection_date),
    payment_method = coalesce(nullif(p_values->>'payment_method',''), payment_method),
    notes = coalesce(p_values->>'notes', notes),
    updated_at = now()
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

-- Preserve the existing view columns and add direct-flow totals at the end.
create or replace view public.representative_summaries with (security_invoker=true) as
select r.*,
  (select count(*) from public.customers c where c.representative_id=r.id and c.status='active') customer_count,
  (select coalesce(sum(amount),0) from public.collections c where c.representative_id=r.id and c.status='active') collected,
  (select coalesce(sum(commission_amount),0) from public.collections c where c.representative_id=r.id and c.status='active') commissions,
  (select coalesce(sum(net_amount),0) from public.collections c where c.representative_id=r.id and c.status='active') net,
  (select coalesce(sum(amount),0) from public.settlements s where s.representative_id=r.id) settlements,
  (select count(*) from public.collections c where c.representative_id=r.id and c.status='active') collections_count
from public.representatives r;

create or replace view public.customer_summaries with (security_invoker=true) as
select c.*,r.name representative_name,
  0::numeric total_receivable,
  (select coalesce(sum(amount),0) from public.collections cl where cl.customer_id=c.id and cl.status='active') collected,
  0::numeric remaining,
  (select count(*) from public.collections cl where cl.customer_id=c.id and cl.status='active') collections_count,
  (select coalesce(sum(commission_amount),0) from public.collections cl where cl.customer_id=c.id and cl.status='active') commissions,
  (select coalesce(sum(net_amount),0) from public.collections cl where cl.customer_id=c.id and cl.status='active') net
from public.customers c
left join public.representatives r on r.id=c.representative_id;

create or replace view public.collection_details with (security_invoker=true) as
select cl.*,cu.name customer_name,cu.phone customer_phone,r.name representative_name,
       rv.number receivable_number,rv.description receivable_description,p.full_name created_by_name
from public.collections cl
join public.customers cu on cu.id=cl.customer_id
left join public.representatives r on r.id=cl.representative_id
left join public.receivables rv on rv.id=cl.receivable_id
left join public.profiles p on p.id=cl.created_by;

create or replace function public.dashboard_data()
returns jsonb
language sql
security definer
set search_path = ''
as $$
select case when public.has_permission('dashboard','view') then jsonb_build_object(
  'totals', jsonb_build_object(
    'representatives',(select count(*) from public.representatives r where r.status='active' and public.can_access_representative(r.id)),
    'customers',(select count(*) from public.customers c where c.status='active' and public.can_access_representative(c.representative_id)),
    'operations',(select count(*) from public.collections cl where cl.status='active' and public.can_access_representative(cl.representative_id)),
    'collected',(select coalesce(sum(cl.amount),0) from public.collections cl where cl.status='active' and public.can_access_representative(cl.representative_id)),
    'commissions',(select coalesce(sum(cl.commission_amount),0) from public.collections cl where cl.status='active' and public.can_access_representative(cl.representative_id)),
    'net',(select coalesce(sum(cl.net_amount),0) from public.collections cl where cl.status='active' and public.can_access_representative(cl.representative_id)),
    'outstanding',(
      (select coalesce(sum(cl.net_amount),0) from public.collections cl where cl.status='active' and public.can_access_representative(cl.representative_id)) -
      (select coalesce(sum(s.amount),0) from public.settlements s where public.can_access_representative(s.representative_id))
    ),
    'today',(select coalesce(sum(cl.amount),0) from public.collections cl where cl.status='active' and cl.collection_date=current_date and public.can_access_representative(cl.representative_id)),
    'month',(select coalesce(sum(cl.amount),0) from public.collections cl where cl.status='active' and date_trunc('month',cl.collection_date)=date_trunc('month',current_date) and public.can_access_representative(cl.representative_id))
  ),
  'recent',coalesce((select jsonb_agg(x order by x.collection_date desc,x.id desc) from (
    select cl.id,cl.receipt_number,cl.amount,cl.commission_amount,cl.net_amount,cl.collection_date,cl.payment_method,cu.name customer_name,r.name representative_name
    from public.collections cl
    join public.customers cu on cu.id=cl.customer_id
    left join public.representatives r on r.id=cl.representative_id
    where cl.status='active' and public.can_access_representative(cl.representative_id)
    order by cl.collection_date desc,cl.id desc limit 10
  ) x),'[]'::jsonb),
  'trend',coalesce((select jsonb_agg(x order by x.date) from (
    select cl.collection_date date,sum(cl.amount) amount
    from public.collections cl
    where cl.status='active' and cl.collection_date>=current_date-29 and public.can_access_representative(cl.representative_id)
    group by cl.collection_date
  ) x),'[]'::jsonb),
  'topReps',coalesce((select jsonb_agg(x order by x.amount desc) from (
    select r.name,coalesce(sum(c.amount),0) amount
    from public.representatives r
    left join public.collections c on c.representative_id=r.id and c.status='active'
    where public.can_access_representative(r.id)
    group by r.id,r.name order by amount desc limit 5
  ) x),'[]'::jsonb),
  'topCustomers',coalesce((select jsonb_agg(x order by x.amount desc) from (
    select c.name,coalesce(sum(cl.amount),0) amount
    from public.customers c
    left join public.collections cl on cl.customer_id=c.id and cl.status='active'
    where public.can_access_representative(c.representative_id)
    group by c.id,c.name order by amount desc limit 5
  ) x),'[]'::jsonb),
  'topDebtors','[]'::jsonb
) else null end
$$;

-- A collections user must be able to read active representatives/customers for the direct form.
drop policy if exists reps_select on public.representatives;
create policy reps_select on public.representatives for select to authenticated using (
  (public.has_permission('representatives','view') or public.has_permission('customers','view') or public.has_permission('collections','view') or public.has_permission('collections','create') or public.has_permission('collections','edit') or public.has_permission('settlements','view') or public.has_permission('settlements','create') or public.has_permission('reports','view') or public.has_permission('balances','view'))
  and public.can_access_representative(id)
);

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select to authenticated using (
  (public.has_permission('customers','view') or public.has_permission('collections','view') or public.has_permission('collections','create') or public.has_permission('collections','edit') or public.has_permission('reports','view') or public.has_permission('balances','view'))
  and public.can_access_representative(representative_id)
);

grant execute on function public.create_collection(jsonb) to authenticated;
grant execute on function public.update_collection(bigint,jsonb) to authenticated;
grant execute on function public.dashboard_data() to authenticated;

commit;
