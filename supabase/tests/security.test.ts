// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createDb, OWNER, STRANGER } from './harness'

let db: PGlite
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params)
const canExec = async (role: string, fn: string) =>
  (await q<{ ok: boolean }>(`select has_function_privilege($1, $2::regprocedure, 'execute') as ok`, [role, fn])).rows[0]!.ok
/** ¿Tiene EXECUTE pseudo-rol PUBLIC (grantee 0)? */
const publicCanExec = async (fn: string) =>
  (
    await q<{ ok: boolean }>(
      `select coalesce(bool_or(a.grantee = 0), false) as ok
         from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = $1::regprocedure and a.privilege_type = 'EXECUTE'`,
      [fn],
    )
  ).rows[0]!.ok

beforeAll(async () => {
  db = await createDb()
  await q('insert into auth.users (id, email) values ($1, $2)', [OWNER, 'yo@example.com'])
  await q('insert into private.app_owner (user_id) values ($1)', [OWNER])
}, 60_000)
afterAll(() => db.close())

describe('rls_auto_enable() (event trigger de Supabase)', () => {
  const FN = 'public.rls_auto_enable()'

  it('PUBLIC, anon y authenticated ya no pueden ejecutarla', async () => {
    expect(await publicCanExec(FN)).toBe(false)
    expect(await canExec('anon', FN)).toBe(false)
    expect(await canExec('authenticated', FN)).toBe(false)
  })

  it('no es invocable por la API aunque seas el propietario', async () => {
    await as(db, OWNER, async () => {
      await expect(q(`select public.rls_auto_enable()`)).rejects.toThrow(/permission denied/)
    })
    await as(db, null, async () => {
      await expect(q(`select public.rls_auto_enable()`)).rejects.toThrow(/permission denied/)
    })
  })

  it('el automatismo se conserva: una tabla nueva creada por un rol sin privilegios especiales queda con RLS', async () => {
    await q(`create role migrator nologin`)
    await q(`grant create, usage on schema public to migrator`)
    await q(`set role migrator`)
    await q(`create table public.zz_nueva (id int)`)
    await q(`reset role`)
    expect((await q(`select relrowsecurity from pg_class where oid = 'public.zz_nueva'::regclass`)).rows).toEqual([{ relrowsecurity: true }])
    await q(`create table public.zz_nueva2 (id int)`)
    expect((await q(`select relrowsecurity from pg_class where oid = 'public.zz_nueva2'::regclass`)).rows).toEqual([{ relrowsecurity: true }])
  })

  it('el event trigger sigue existiendo y activo', async () => {
    expect((await q(`select evtname, evtenabled from pg_event_trigger where evtname = 'ensure_rls'`)).rows).toEqual([{ evtname: 'ensure_rls', evtenabled: 'O' }])
  })
})

describe('is_owner()', () => {
  const FN = 'public.is_owner()'

  it('diseño seguro: sin argumentos, SECURITY DEFINER con search_path fijado y vacío', async () => {
    const r = (
      await q<{ nargs: number; secdef: boolean; cfg: string[] }>(
        `select pronargs::int as nargs, prosecdef as secdef, proconfig as cfg from pg_proc where oid = $1::regprocedure`,
        [FN],
      )
    ).rows[0]!
    expect(r.nargs).toBe(0)
    expect(r.secdef).toBe(true)
    expect(r.cfg).toContain('search_path=""')
  })

  it('PUBLIC y anon no pueden ejecutarla; authenticated sí (necesario para RLS y para la app)', async () => {
    expect(await publicCanExec(FN)).toBe(false)
    expect(await canExec('anon', FN)).toBe(false)
    expect(await canExec('authenticated', FN)).toBe(true)
  })

  it('sólo responde sobre el propio llamante: ajeno → false, propietario → true, anónimo → denegado', async () => {
    expect(await as(db, OWNER, async () => (await q(`select public.is_owner() as v`)).rows)).toEqual([{ v: true }])
    expect(await as(db, STRANGER, async () => (await q(`select public.is_owner() as v`)).rows)).toEqual([{ v: false }])
    await as(db, null, async () => {
      await expect(q(`select public.is_owner()`)).rejects.toThrow(/permission denied/)
    })
  })

  it('no ofrece forma de consultar a otro usuario (no admite argumentos)', async () => {
    await as(db, STRANGER, async () => {
      await expect(q(`select public.is_owner($1::uuid)`, [OWNER])).rejects.toThrow(/does not exist/)
    })
  })

  it('un usuario ajeno sigue sin ver datos pese a poder ejecutar la función', async () => {
    await q(`insert into public.jobs (name, due_date) values ('privado', '2026-12-01')`)
    expect(await as(db, STRANGER, async () => (await q(`select * from public.jobs`)).rows)).toHaveLength(0)
  })
})

describe('inventario de funciones en public (regresión)', () => {
  it('las únicas SECURITY DEFINER expuestas son is_owner (aceptada) y rls_auto_enable (bloqueada)', async () => {
    const rows = (await q<{ proname: string }>(`select proname from pg_proc where pronamespace = 'public'::regnamespace and prosecdef order by 1`)).rows
    expect(rows.map((r) => r.proname)).toEqual(['is_owner', 'rls_auto_enable'])
  })

  it('anon y PUBLIC no pueden ejecutar ninguna función de public', async () => {
    const fns = (await q<{ sig: string }>(`select p.oid::regprocedure::text as sig from pg_proc p where p.pronamespace = 'public'::regnamespace`)).rows
    expect(fns.length).toBeGreaterThanOrEqual(4)
    for (const { sig } of fns) {
      expect(await canExec('anon', sig), `anon puede ejecutar ${sig}`).toBe(false)
      expect(await publicCanExec(sig), `PUBLIC puede ejecutar ${sig}`).toBe(false)
    }
  })

  it('las RPC de la app (duplicate_job, save_component) son SECURITY INVOKER: aplican el RLS del llamante', async () => {
    const rows = (
      await q<{ proname: string; secdef: boolean }>(
        `select proname, prosecdef as secdef from pg_proc where pronamespace = 'public'::regnamespace and proname in ('duplicate_job', 'save_component')`,
      )
    ).rows
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => !r.secdef)).toBe(true)
  })

  it('ninguna tabla de public queda sin RLS', async () => {
    const rows = (await q(`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`)).rows
    expect(rows).toEqual([])
  })
})
