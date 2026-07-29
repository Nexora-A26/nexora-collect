-- Nexora Collect v1.3.1
-- Fix: PostgreSQL trigger error: record "new" has no field "code"
-- Run once in Supabase SQL Editor after migrations 001 and 002.

begin;

-- Remove the old shared trigger function from all tables.
drop trigger if exists trg_representatives_code on public.representatives;
drop trigger if exists trg_customers_code on public.customers;
drop trigger if exists trg_receivables_code on public.receivables;
drop trigger if exists trg_collections_code on public.collections;
drop trigger if exists trg_settlements_code on public.settlements;

-- Each table now has its own trigger function, so PostgreSQL never tries
-- to read a column that does not exist on the current NEW record.
create or replace function public.assign_representative_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.code,'') = '' then
    new.code := 'REP-' || lpad(nextval('public.representative_code_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create or replace function public.assign_customer_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.code,'') = '' then
    new.code := 'CUS-' || lpad(nextval('public.customer_code_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create or replace function public.assign_receivable_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.number,'') = '' then
    new.number := 'INV-' || lpad(nextval('public.receivable_number_seq')::text, 7, '0');
  end if;
  return new;
end;
$$;

create or replace function public.assign_collection_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
begin
  if coalesce(new.receipt_number,'') = '' then
    select receipt_prefix into v_prefix from public.settings where id = 1;
    new.receipt_number := coalesce(nullif(v_prefix,''),'REC') || '-' || lpad(nextval('public.collection_receipt_seq')::text, 7, '0');
  end if;
  return new;
end;
$$;

create or replace function public.assign_settlement_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
begin
  if coalesce(new.number,'') = '' then
    select settlement_prefix into v_prefix from public.settings where id = 1;
    new.number := coalesce(nullif(v_prefix,''),'SET') || '-' || lpad(nextval('public.settlement_number_seq')::text, 7, '0');
  end if;
  return new;
end;
$$;

create trigger trg_representatives_code
before insert on public.representatives
for each row execute function public.assign_representative_code();

create trigger trg_customers_code
before insert on public.customers
for each row execute function public.assign_customer_code();

create trigger trg_receivables_code
before insert on public.receivables
for each row execute function public.assign_receivable_number();

create trigger trg_collections_code
before insert on public.collections
for each row execute function public.assign_collection_receipt();

create trigger trg_settlements_code
before insert on public.settlements
for each row execute function public.assign_settlement_number();

-- The old generic function is no longer needed.
drop function if exists public.assign_codes();

commit;
