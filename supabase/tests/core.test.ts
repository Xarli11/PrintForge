// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createDb, OWNER, STRANGER } from './harness'

let db: PGlite
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params)
const TABLES = ['settings', 'materials', 'jobs', 'job_components', 'component_colors', 'production_log']
const JOB = 'aaaaaaaa-0000-0000-0000-000000000001'
const COMP = 'bbbbbbbb-0000-0000-0000-000000000001'

beforeAll(async () => {
  db = await createDb()
  await q('insert into auth.users (id, email) values ($1, $2)', [OWNER, 'yo@example.com'])
  await q('insert into private.app_owner (user_id) values ($1)', [OWNER])
  await q(`insert into public.jobs (id, name, quantity, due_date) values ($1, 'Figuras', 33, '2026-12-01')`, [JOB])
  await q(`insert into public.job_components (id, job_id, name, batch_capacity, batch_minutes) values ($1, $2, 'Figura', 1, 120)`, [COMP, JOB])
}, 60_000)
afterAll(() => db.close())

describe('seguridad de acceso (RLS)', () => {
  it.each(TABLES)('anónimo no puede leer ni escribir en %s', async (t) => {
    await as(db, null, async () => {
      await expect(q(`select * from public.${t}`)).rejects.toThrow(/permission denied/)
      await expect(q(`delete from public.${t}`)).rejects.toThrow(/permission denied/)
    })
  })

  it.each(TABLES)('un usuario autenticado que no es el propietario ve 0 filas en %s', async (t) => {
    const rows = await as(db, STRANGER, async () => (await q(`select * from public.${t}`)).rows)
    expect(rows).toHaveLength(0)
  })

  it('un usuario ajeno no puede insertar, modificar ni borrar', async () => {
    await as(db, STRANGER, async () => {
      await expect(q(`insert into public.materials (type, name) values ('PLA', 'x')`)).rejects.toThrow(/row-level security/)
      await expect(q(`insert into public.jobs (name, due_date) values ('x', '2026-12-01')`)).rejects.toThrow(/row-level security/)
      expect((await q(`update public.jobs set name = 'hack'`)).affectedRows).toBe(0)
      expect((await q(`delete from public.jobs`)).affectedRows).toBe(0)
    })
    expect((await q(`select name from public.jobs`)).rows).toEqual([{ name: 'Figuras' }])
  })

  it('el propietario lee y escribe; is_owner distingue usuarios', async () => {
    await as(db, OWNER, async () => {
      expect((await q(`select 1 from public.jobs`)).rows).toHaveLength(1)
      await q(`insert into public.materials (type, name, color_hex) values ('PLA', 'Verde', '#10b981')`)
      expect((await q(`select public.is_owner() as v`)).rows).toEqual([{ v: true }])
    })
    expect(await as(db, STRANGER, async () => (await q(`select public.is_owner() as v`)).rows)).toEqual([{ v: false }])
  })

  it('el esquema private no es accesible para usuarios de la API', async () => {
    await as(db, OWNER, async () => {
      await expect(q(`select * from private.app_owner`)).rejects.toThrow(/permission denied/)
    })
  })

  it('no se puede crear un segundo usuario en auth.users', async () => {
    await expect(q(`insert into auth.users (id, email) values ($1, 'otro@example.com')`, [STRANGER])).rejects.toThrow(/Registro deshabilitado/)
  })

  it('app_owner admite una sola fila', async () => {
    await expect(q(`insert into private.app_owner (user_id) values ($1)`, [STRANGER])).rejects.toThrow()
  })
})

describe('integridad y registro de producción', () => {
  it('production_log actualiza los contadores del componente', async () => {
    await as(db, OWNER, async () => {
      await q(`insert into public.production_log (component_id, completed_delta) values ($1, 18)`, [COMP])
      await q(`insert into public.production_log (component_id, completed_delta, failed_delta) values ($1, 2, 1)`, [COMP])
    })
    expect((await q(`select completed_qty, failed_qty from public.job_components where id = $1`, [COMP])).rows).toEqual([
      { completed_qty: 20, failed_qty: 1 },
    ])
  })

  it('no permite modificar los contadores directamente', async () => {
    await as(db, OWNER, async () => {
      await expect(q(`update public.job_components set completed_qty = 99 where id = $1`, [COMP])).rejects.toThrow(/registro de producción/)
    })
  })

  it('no permite cantidades completadas negativas', async () => {
    await as(db, OWNER, async () => {
      await expect(q(`insert into public.production_log (component_id, completed_delta) values ($1, -500)`, [COMP])).rejects.toThrow()
    })
    expect((await q(`select completed_qty from public.job_components where id = $1`, [COMP])).rows).toEqual([{ completed_qty: 20 }])
  })

  it('rechaza registros vacíos y valores inválidos', async () => {
    await as(db, OWNER, async () => {
      await expect(q(`insert into public.production_log (component_id) values ($1)`, [COMP])).rejects.toThrow()
      await expect(q(`insert into public.job_components (job_id, name, batch_capacity) values ($1, 'x', 0)`, [JOB])).rejects.toThrow()
      await expect(q(`insert into public.jobs (name, due_date) values ('sin fecha', null)`)).rejects.toThrow()
      await expect(q(`insert into public.materials (type, name, color_hex) values ('PLA', 'x', 'verde')`)).rejects.toThrow()
    })
  })

  it('completed_at se fija al terminar y se limpia al reabrir', async () => {
    const isSet = async () => (await q<{ c: boolean }>(`select completed_at is not null as c from public.jobs where id = $1`, [JOB])).rows[0]?.c
    await as(db, OWNER, async () => {
      await q(`update public.jobs set status = 'done' where id = $1`, [JOB])
      expect(await isSet()).toBe(true)
      await q(`update public.jobs set status = 'printing' where id = $1`, [JOB])
      expect(await isSet()).toBe(false)
    })
  })

  it('duplicate_job copia componentes y colores sin progreso', async () => {
    const newId = await as(db, OWNER, async () => {
      const mat = (await q<{ id: string }>(`select id from public.materials limit 1`)).rows[0]!.id
      await q(`insert into public.component_colors (component_id, material_id, grams_per_batch) values ($1, $2, 42.5)`, [COMP, mat])
      return (await q<{ n: string }>(`select public.duplicate_job($1) as n`, [JOB])).rows[0]!.n
    })
    expect((await q(`select name, status, quantity from public.jobs where id = $1`, [newId])).rows).toEqual([
      { name: 'Figuras (copia)', status: 'pending', quantity: 33 },
    ])
    const comps = (await q<{ id: string; completed_qty: number; failed_qty: number; batch_minutes: number }>(
      `select id, completed_qty, failed_qty, batch_minutes from public.job_components where job_id = $1`, [newId])).rows
    expect(comps).toHaveLength(1)
    expect(comps[0]).toMatchObject({ completed_qty: 0, failed_qty: 0, batch_minutes: 120 })
    expect((await q(`select grams_per_batch::float as g from public.component_colors where component_id = $1`, [comps[0]!.id])).rows).toEqual([{ g: 42.5 }])
  })

  it('duplicate_job no funciona para usuarios ajenos', async () => {
    await as(db, STRANGER, async () => {
      await expect(q(`select public.duplicate_job($1)`, [JOB])).rejects.toThrow()
    })
  })

  it('borrar un material no borra el componente (set null)', async () => {
    await q(`delete from public.materials`)
    const rows = (await q(`select material_id from public.component_colors`)).rows
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.material_id === null)).toBe(true)
  })

  it('borrar un trabajo elimina en cascada componentes, colores y registros (sin huérfanos)', async () => {
    await q(`delete from public.jobs`)
    for (const t of ['job_components', 'component_colors', 'production_log'])
      expect((await q(`select count(*)::int as n from public.${t}`)).rows).toEqual([{ n: 0 }])
  })
})
