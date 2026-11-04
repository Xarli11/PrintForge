-- PrintForge · migración 1: núcleo (acceso privado, configuración, materiales, trabajos, componentes, producción)
-- Reproducible: ejecuta las migraciones en orden con `supabase db push` o pegándolas en el SQL Editor.

-- ============================================================
-- 1. Acceso de un único usuario
-- ============================================================
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Tabla de una sola fila: guarda el UUID del único usuario autorizado.
-- Se rellena UNA vez con el UUID de tu usuario (ver docs/supabase-setup.md).
create table private.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null
);
revoke all on private.app_owner from public, anon, authenticated;

create function public.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.app_owner where user_id = auth.uid()) $$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- Defensa en profundidad: aunque el registro público siga habilitado por error,
-- Auth no puede crear un segundo usuario.
create function private.block_extra_users() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'Registro deshabilitado: PrintForge es de uso personal';
  end if;
  return new;
end
$$;
create trigger block_extra_users before insert on auth.users
  for each row execute function private.block_extra_users();

-- ============================================================
-- 2. Utilidades
-- ============================================================
create function private.set_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;

-- ============================================================
-- 3. Configuración (fila única)
-- ============================================================
create table public.settings (
  singleton boolean primary key default true check (singleton),
  hours_per_day numeric(4,1) not null default 8 check (hours_per_day > 0 and hours_per_day <= 24),
  printer_watts numeric(7,1) not null default 100 check (printer_watts >= 0),
  kwh_price numeric(8,4) not null default 0.20 check (kwh_price >= 0),
  default_price_per_kg numeric(8,2) not null default 20 check (default_price_per_kg >= 0),
  currency text not null default 'EUR' check (char_length(currency) = 3),
  updated_at timestamptz not null default now()
);
insert into public.settings (singleton) values (true);
create trigger settings_updated before update on public.settings
  for each row execute function private.set_updated_at();

-- ============================================================
-- 4. Materiales
-- ============================================================
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  type text not null check (char_length(type) between 1 and 40),         -- PLA, PETG, ...
  brand text not null default '' check (char_length(brand) <= 80),
  name text not null check (char_length(name) between 1 and 120),
  color_hex text not null default '#888888' check (color_hex ~* '^#[0-9a-f]{6}$'),
  price_per_kg numeric(8,2) not null default 20 check (price_per_kg >= 0),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 5. Trabajos
-- ============================================================
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  kind text not null default 'personal' check (kind in ('personal', 'commission')),
  is_mandatory boolean not null default false,                            -- independiente de la prioridad
  client_name text check (client_name is null or char_length(client_name) <= 120),
  quantity integer not null default 1 check (quantity >= 1 and quantity <= 100000),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'pending'
    check (status in ('pending', 'preparing', 'printing', 'postprocessing', 'done', 'delivered', 'cancelled')),
  due_date date not null,                                                 -- obligatoria
  estimated_finish_date date,
  notes text not null default '' check (char_length(notes) <= 4000),
  sale_price numeric(10,2) check (sale_price is null or sale_price >= 0),
  extra_costs numeric(10,2) not null default 0 check (extra_costs >= 0),
  cover_path text,                                                        -- ruta en Storage (fase 2)
  archived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_due_date_idx on public.jobs (due_date);
create index jobs_status_idx on public.jobs (status);
create index jobs_updated_idx on public.jobs (updated_at desc);

create function private.jobs_before_write() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  -- Fecha de finalización real: se fija al terminar y se limpia al reabrir.
  if new.status in ('done', 'delivered') then
    new.completed_at = coalesce(new.completed_at, now());
  else
    new.completed_at = null;
  end if;
  return new;
end
$$;
create trigger jobs_before_write before insert or update on public.jobs
  for each row execute function private.jobs_before_write();

-- ============================================================
-- 6. Componentes de un trabajo
-- ============================================================
create table public.job_components (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  qty_per_unit integer not null default 1 check (qty_per_unit >= 1 and qty_per_unit <= 1000),
  batch_capacity integer not null default 1 check (batch_capacity >= 1 and batch_capacity <= 1000),
  batch_minutes integer not null default 0 check (batch_minutes >= 0),    -- minutos por TANDA; 0 = sin introducir
  last_batch_minutes integer check (last_batch_minutes is null or last_batch_minutes >= 0),
  waste_grams_per_batch numeric(8,2) not null default 0 check (waste_grams_per_batch >= 0), -- purga fija por tanda
  completed_qty integer not null default 0 check (completed_qty >= 0),
  failed_qty integer not null default 0 check (failed_qty >= 0),
  status text not null default 'pending' check (status in ('pending', 'printing', 'done')),
  notes text not null default '' check (char_length(notes) <= 2000),
  position integer not null default 0,
  time_source text not null default 'manual' check (time_source in ('manual', 'imported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_components_job_idx on public.job_components (job_id, position);

-- Los contadores sólo cambian a través de production_log (historial siempre coherente).
create function private.components_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  if tg_op = 'INSERT' then
    new.completed_qty = 0;
    new.failed_qty = 0;
  elsif (new.completed_qty is distinct from old.completed_qty or new.failed_qty is distinct from old.failed_qty)
        and pg_trigger_depth() < 2 then
    raise exception 'Usa el registro de producción para cambiar las cantidades completadas o fallidas';
  end if;
  return new;
end
$$;
create trigger components_guard before insert or update on public.job_components
  for each row execute function private.components_guard();

-- Consumo de filamento por color/material y por tanda (el total del componente es la suma de sus filas).
create table public.component_colors (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.job_components (id) on delete cascade,
  material_id uuid references public.materials (id) on delete set null,
  grams_per_batch numeric(8,2) not null default 0 check (grams_per_batch >= 0),
  source text not null default 'manual' check (source in ('manual', 'imported')),
  created_at timestamptz not null default now()
);
create index component_colors_component_idx on public.component_colors (component_id);
create index component_colors_material_idx on public.component_colors (material_id);

-- ============================================================
-- 7. Registro de producción (fuente del historial de cantidades)
-- ============================================================
create table public.production_log (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.job_components (id) on delete cascade,
  completed_delta integer not null default 0,
  failed_delta integer not null default 0,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  check (completed_delta <> 0 or failed_delta <> 0)
);
create index production_log_component_idx on public.production_log (component_id, created_at desc);

create function private.apply_production_log() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.job_components
     set completed_qty = completed_qty + new.completed_delta,
         failed_qty = failed_qty + new.failed_delta
   where id = new.component_id;
  return new;
end
$$;
create trigger production_log_apply after insert on public.production_log
  for each row execute function private.apply_production_log();

-- ============================================================
-- 8. Duplicar un trabajo (atómico): componentes y colores, sin progreso ni archivos
-- ============================================================
create function public.duplicate_job(p_job_id uuid) returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_new uuid;
  v_comp uuid;
  r public.job_components;
begin
  insert into public.jobs (name, description, kind, is_mandatory, client_name, quantity, priority, status,
                           due_date, notes, sale_price, extra_costs, cover_path)
  select left(name, 150) || ' (copia)', description, kind, is_mandatory, client_name, quantity, priority, 'pending',
         greatest(due_date, current_date), notes, sale_price, extra_costs, cover_path
    from public.jobs where id = p_job_id
  returning id into v_new;
  if v_new is null then
    raise exception 'Trabajo no encontrado';
  end if;

  for r in select * from public.job_components where job_id = p_job_id order by position loop
    insert into public.job_components (job_id, name, description, qty_per_unit, batch_capacity, batch_minutes,
                                       last_batch_minutes, waste_grams_per_batch, notes, position, time_source)
    values (v_new, r.name, r.description, r.qty_per_unit, r.batch_capacity, r.batch_minutes,
            r.last_batch_minutes, r.waste_grams_per_batch, r.notes, r.position, r.time_source)
    returning id into v_comp;

    insert into public.component_colors (component_id, material_id, grams_per_batch, source)
    select v_comp, material_id, grams_per_batch, source from public.component_colors where component_id = r.id;
  end loop;

  return v_new;
end
$$;
grant execute on function public.duplicate_job(uuid) to authenticated;
revoke execute on function public.duplicate_job(uuid) from public, anon;

-- ============================================================
-- 9. Row Level Security: sólo el propietario, en todas las tablas expuestas
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['settings', 'materials', 'jobs', 'job_components', 'component_colors', 'production_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()))',
      t);
  end loop;
end
$$;
