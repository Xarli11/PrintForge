-- PrintForge · migración 2: biblioteca de modelos y guardado atómico de componentes con colores.
-- (El bucket y las políticas de Storage están en la migración 3 para poder aplicarlas y diagnosticarlas por separado.)

-- ============================================================
-- 1. Biblioteca de modelos (archivos 3MF/STL originales)
-- ============================================================
create table public.model_files (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),            -- nombre visible, editable
  file_name text not null check (char_length(file_name) between 1 and 255),  -- nombre original, para descargar
  format text not null check (format in ('3mf', 'stl')),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),      -- 50 MB: límite de Supabase Free
  storage_path text not null unique,                                         -- files/<uuid>.<ext> (original, intacto)
  thumbnail_path text,                                                       -- thumbs/<uuid>.<ext> (extraída del 3MF o subida)
  thumbnail_source text check (thumbnail_source in ('imported', 'manual')),
  metadata jsonb not null default '{}'::jsonb,                               -- fase 4: datos importados del 3MF
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index model_files_created_idx on public.model_files (created_at desc);
create trigger model_files_updated before update on public.model_files
  for each row execute function private.set_updated_at();

-- Archivos adjuntos a un trabajo (además de los asociados a componentes).
create table public.job_files (
  job_id uuid not null references public.jobs (id) on delete cascade,
  file_id uuid not null references public.model_files (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, file_id)
);
create index job_files_file_idx on public.job_files (file_id);

-- Un componente puede apuntar a un modelo de la biblioteca; si se borra el modelo, el componente se conserva.
alter table public.job_components
  add column file_id uuid references public.model_files (id) on delete set null;
create index job_components_file_idx on public.job_components (file_id);

-- ============================================================
-- 2. Guardado atómico de un componente + sus colores
-- ============================================================
-- p_id null → crea; si no, actualiza. p_colors null → no toca los colores; array → los reemplaza.
create function public.save_component(p_job_id uuid, p_id uuid, p_data jsonb, p_colors jsonb) returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_id is null then
    insert into public.job_components (job_id, name, description, qty_per_unit, batch_capacity, batch_minutes,
                                       last_batch_minutes, waste_grams_per_batch, notes, position, time_source, file_id)
    values (p_job_id, p_data->>'name', coalesce(p_data->>'description', ''), (p_data->>'qty_per_unit')::int,
            (p_data->>'batch_capacity')::int, (p_data->>'batch_minutes')::int, (p_data->>'last_batch_minutes')::int,
            coalesce((p_data->>'waste_grams_per_batch')::numeric, 0), coalesce(p_data->>'notes', ''),
            coalesce((p_data->>'position')::int, 0), coalesce(p_data->>'time_source', 'manual'), (p_data->>'file_id')::uuid)
    returning id into v_id;
  else
    update public.job_components
       set name = p_data->>'name',
           description = coalesce(p_data->>'description', ''),
           qty_per_unit = (p_data->>'qty_per_unit')::int,
           batch_capacity = (p_data->>'batch_capacity')::int,
           batch_minutes = (p_data->>'batch_minutes')::int,
           last_batch_minutes = (p_data->>'last_batch_minutes')::int,
           waste_grams_per_batch = coalesce((p_data->>'waste_grams_per_batch')::numeric, 0),
           notes = coalesce(p_data->>'notes', ''),
           time_source = coalesce(p_data->>'time_source', time_source),
           file_id = (p_data->>'file_id')::uuid
     where id = p_id and job_id = p_job_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Componente no encontrado';
    end if;
  end if;

  if p_colors is not null then
    delete from public.component_colors where component_id = v_id;
    insert into public.component_colors (component_id, material_id, grams_per_batch, source)
    select v_id, c.material_id, coalesce(c.grams_per_batch, 0), coalesce(c.source, 'manual')
      from jsonb_to_recordset(p_colors) as c(material_id uuid, grams_per_batch numeric, source text);
  end if;
  return v_id;
end
$$;
revoke execute on function public.save_component(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_component(uuid, uuid, jsonb, jsonb) to authenticated;

-- duplicate_job conserva ahora el archivo de cada componente y los archivos adjuntos.
create or replace function public.duplicate_job(p_job_id uuid) returns uuid
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
                                       last_batch_minutes, waste_grams_per_batch, notes, position, time_source, file_id)
    values (v_new, r.name, r.description, r.qty_per_unit, r.batch_capacity, r.batch_minutes,
            r.last_batch_minutes, r.waste_grams_per_batch, r.notes, r.position, r.time_source, r.file_id)
    returning id into v_comp;

    insert into public.component_colors (component_id, material_id, grams_per_batch, source)
    select v_comp, material_id, grams_per_batch, source from public.component_colors where component_id = r.id;
  end loop;

  insert into public.job_files (job_id, file_id) select v_new, file_id from public.job_files where job_id = p_job_id;
  return v_new;
end
$$;

-- ============================================================
-- 3. RLS y grants (sólo el propietario)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['model_files', 'job_files']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()))',
      t);
  end loop;
end
$$;

-- Recarga la caché de esquema de la API REST para que vea las tablas y funciones nuevas.
notify pgrst, 'reload schema';
