-- PrintForge · migración 3: Storage privado (bucket + políticas sólo para el propietario).
-- Requiere la migración 2. Si falla al crear las políticas sobre storage.objects, ver docs/supabase-setup.md.

insert into storage.buckets (id, name, public, file_size_limit)
values ('printforge', 'printforge', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Lectura/borrado: cualquier objeto del bucket, sólo propietario.
-- Escritura: sólo rutas files|thumbs|covers/<uuid>.<ext> con extensión permitida.
create policy printforge_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'printforge' and (select public.is_owner()));
create policy printforge_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'printforge' and (select public.is_owner()));
create policy printforge_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'printforge' and (select public.is_owner())
    and name ~* '^(files|thumbs|covers)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(3mf|stl|png|jpe?g|webp)$'
  );
create policy printforge_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'printforge' and (select public.is_owner()))
  with check (bucket_id = 'printforge' and (select public.is_owner()));
