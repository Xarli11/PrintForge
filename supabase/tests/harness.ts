// Arnés: ejecuta las migraciones reales sobre PGlite (PostgreSQL en WASM) con un stub mínimo de Supabase Auth.
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const OWNER = '11111111-1111-1111-1111-111111111111'
export const STRANGER = '22222222-2222-2222-2222-222222222222'

const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public to anon, authenticated;
-- Caso estricto (proyectos nuevos de Supabase): ningún privilegio automático en public y funciones sin EXECUTE para PUBLIC.
alter default privileges for role postgres revoke execute on functions from public;
-- Réplica de lo que Supabase instala en proyectos nuevos: función SECURITY DEFINER + event trigger que activa RLS en tablas nuevas,
-- con EXECUTE para PUBLIC/anon/authenticated (justo lo que avisa el Security Advisor).
create function public.rls_auto_enable() returns event_trigger language plpgsql security definer set search_path = pg_catalog as $fn$
declare cmd record;
begin
  for cmd in select * from pg_event_trigger_ddl_commands() where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name = 'public' then
      execute format('alter table if exists %s enable row level security', cmd.object_identity);
    end if;
  end loop;
end
$fn$;
grant execute on function public.rls_auto_enable() to public, anon, authenticated;
create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') execute function public.rls_auto_enable();
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects, storage.buckets to anon, authenticated;
`

export async function createDb() {
  const db = new PGlite()
  await db.exec(SUPABASE_STUB)
  const dir = join(import.meta.dirname, '../migrations')
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'))
  return db
}

/** Ejecuta `fn` con el rol/JWT indicado (null = anónimo) y restaura el rol de administrador después. */
export async function as<T>(db: PGlite, user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}
