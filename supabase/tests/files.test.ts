// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createDb, OWNER, STRANGER } from './harness'

let db: PGlite
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params)
const JOB = 'aaaaaaaa-0000-0000-0000-000000000001'
const FILE = 'cccccccc-0000-0000-0000-000000000001'
const MAT = 'dddddddd-0000-0000-0000-000000000001'
const goodPath = `files/${FILE}.3mf`

beforeAll(async () => {
  db = await createDb()
  await q('insert into auth.users (id, email) values ($1, $2)', [OWNER, 'yo@example.com'])
  await q('insert into private.app_owner (user_id) values ($1)', [OWNER])
  await q(`insert into public.jobs (id, name, quantity, due_date) values ($1, 'Figuras', 10, '2026-12-01')`, [JOB])
  await q(`insert into public.materials (id, type, name, color_hex, price_per_kg) values ($1, 'PLA', 'Verde', '#10b981', 22)`, [MAT])
}, 60_000)
afterAll(() => db.close())

describe('Storage privado', () => {
  it('el bucket es privado y limitado a 50 MB', async () => {
    expect((await q(`select public, file_size_limit::int as l from storage.buckets where id = 'printforge'`)).rows).toEqual([{ public: false, l: 52428800 }])
  })

  it('el propietario sube y lee rutas válidas', async () => {
    await as(db, OWNER, async () => {
      await q(`insert into storage.objects (bucket_id, name, owner) values ('printforge', $1, $2)`, [goodPath, OWNER])
      expect((await q(`select name from storage.objects`)).rows).toEqual([{ name: goodPath }])
    })
  })

  it.each([
    ['extensión no permitida', `files/${FILE}.exe`],
    ['ruta fuera de las carpetas permitidas', `otra/${FILE}.3mf`],
    ['nombre que no es UUID', 'files/mi modelo.3mf'],
    ['salto de directorio', `files/../${FILE}.stl`],
  ])('rechaza subir: %s', async (_n, path) => {
    await as(db, OWNER, async () => {
      await expect(q(`insert into storage.objects (bucket_id, name) values ('printforge', $1)`, [path])).rejects.toThrow(/row-level security/)
    })
  })

  it('un usuario ajeno no ve, sube ni borra objetos', async () => {
    await as(db, STRANGER, async () => {
      expect((await q(`select * from storage.objects`)).rows).toHaveLength(0)
      await expect(q(`insert into storage.objects (bucket_id, name) values ('printforge', $1)`, [`files/${STRANGER}.stl`])).rejects.toThrow(/row-level security/)
      expect((await q(`delete from storage.objects`)).affectedRows).toBe(0)
    })
  })

  it('anónimo no puede listar ni leer objetos', async () => {
    await as(db, null, async () => {
      expect((await q(`select * from storage.objects`)).rows).toHaveLength(0)
      await expect(q(`insert into storage.objects (bucket_id, name) values ('printforge', $1)`, [`files/${STRANGER}.stl`])).rejects.toThrow()
    })
  })
})

describe('biblioteca de modelos', () => {
  it('model_files: propietario sí, ajeno y anónimo no', async () => {
    await as(db, OWNER, async () => {
      await q(`insert into public.model_files (id, name, file_name, format, size_bytes, storage_path) values ($1, 'Figura', 'figura.3mf', '3mf', 1000, $2)`, [FILE, goodPath])
      await q(`insert into public.job_files (job_id, file_id) values ($1, $2)`, [JOB, FILE])
    })
    expect(await as(db, STRANGER, async () => (await q(`select * from public.model_files`)).rows)).toHaveLength(0)
    await as(db, null, async () => {
      await expect(q(`select * from public.model_files`)).rejects.toThrow(/permission denied/)
      await expect(q(`select * from public.job_files`)).rejects.toThrow(/permission denied/)
    })
  })

  it('valida formato y tamaño (50 MB)', async () => {
    await expect(q(`insert into public.model_files (name, file_name, format, size_bytes, storage_path) values ('x','x.obj','obj',10,'files/a')`)).rejects.toThrow()
    await expect(q(`insert into public.model_files (name, file_name, format, size_bytes, storage_path) values ('x','x.stl','stl',52428801,'files/b')`)).rejects.toThrow()
    await expect(q(`insert into public.model_files (name, file_name, format, size_bytes, storage_path) values ('x','x.stl','stl',0,'files/c')`)).rejects.toThrow()
  })

  it('storage_path es único', async () => {
    await expect(q(`insert into public.model_files (name, file_name, format, size_bytes, storage_path) values ('y','y.3mf','3mf',5,$1)`, [goodPath])).rejects.toThrow()
  })

  it('borrar un modelo conserva el componente (file_id → null) y quita el adjunto', async () => {
    const comp = await as(db, OWNER, async () =>
      (await q<{ id: string }>(
        `select public.save_component($1, null, $2::jsonb, null) as id`,
        [JOB, JSON.stringify({ name: 'Figura', qty_per_unit: 1, batch_capacity: 1, batch_minutes: 60, file_id: FILE })],
      )).rows[0]!.id,
    )
    expect((await q(`select file_id from public.job_components where id = $1`, [comp])).rows).toEqual([{ file_id: FILE }])
    await q(`delete from public.model_files where id = $1`, [FILE])
    expect((await q(`select file_id from public.job_components where id = $1`, [comp])).rows).toEqual([{ file_id: null }])
    expect((await q(`select * from public.job_files`)).rows).toHaveLength(0)
  })
})

describe('save_component (atómico)', () => {
  const data = { name: 'Peana', qty_per_unit: 1, batch_capacity: 4, batch_minutes: 90, last_batch_minutes: null, waste_grams_per_batch: 2.5, position: 1 }

  it('crea el componente con sus colores y los reemplaza al editar', async () => {
    const id = await as(db, OWNER, async () =>
      (await q<{ id: string }>(`select public.save_component($1, null, $2::jsonb, $3::jsonb) as id`, [
        JOB, JSON.stringify(data), JSON.stringify([{ material_id: MAT, grams_per_batch: 40 }, { material_id: null, grams_per_batch: 5 }]),
      ])).rows[0]!.id,
    )
    expect((await q(`select grams_per_batch::float as g from public.component_colors where component_id = $1 order by grams_per_batch`, [id])).rows).toEqual([{ g: 5 }, { g: 40 }])
    await as(db, OWNER, async () => {
      await q(`select public.save_component($1, $2, $3::jsonb, $4::jsonb)`, [JOB, id, JSON.stringify({ ...data, name: 'Peana v2' }), JSON.stringify([{ material_id: MAT, grams_per_batch: 12 }])])
    })
    expect((await q(`select name from public.job_components where id = $1`, [id])).rows).toEqual([{ name: 'Peana v2' }])
    expect((await q(`select grams_per_batch::float as g from public.component_colors where component_id = $1`, [id])).rows).toEqual([{ g: 12 }])
    // p_colors null no toca los colores
    await as(db, OWNER, async () => {
      await q(`select public.save_component($1, $2, $3::jsonb, null)`, [JOB, id, JSON.stringify(data)])
    })
    expect((await q(`select count(*)::int as n from public.component_colors where component_id = $1`, [id])).rows).toEqual([{ n: 1 }])
  })

  it('si los colores son inválidos no queda nada a medias', async () => {
    const before = (await q<{ n: number }>(`select count(*)::int as n from public.job_components`)).rows[0]!.n
    await as(db, OWNER, async () => {
      await expect(
        q(`select public.save_component($1, null, $2::jsonb, $3::jsonb)`, [JOB, JSON.stringify({ ...data, name: 'Rota' }), JSON.stringify([{ material_id: MAT, grams_per_batch: -5 }])]),
      ).rejects.toThrow()
    })
    expect((await q<{ n: number }>(`select count(*)::int as n from public.job_components`)).rows[0]!.n).toBe(before)
  })

  it('no está permitido para ajenos ni anónimos', async () => {
    await as(db, STRANGER, async () => {
      await expect(q(`select public.save_component($1, null, $2::jsonb, null)`, [JOB, JSON.stringify(data)])).rejects.toThrow()
    })
    await as(db, null, async () => {
      await expect(q(`select public.save_component($1, null, $2::jsonb, null)`, [JOB, JSON.stringify(data)])).rejects.toThrow(/permission denied/)
    })
  })

  it('duplicate_job copia archivo, colores y adjuntos', async () => {
    await q(`insert into public.model_files (id, name, file_name, format, size_bytes, storage_path) values ($1, 'F', 'f.stl', 'stl', 5, 'files/zz')`, [FILE])
    await q(`insert into public.job_files (job_id, file_id) values ($1, $2)`, [JOB, FILE])
    await q(`update public.job_components set file_id = $1 where job_id = $2`, [FILE, JOB])
    const copy = await as(db, OWNER, async () => (await q<{ n: string }>(`select public.duplicate_job($1) as n`, [JOB])).rows[0]!.n)
    expect((await q(`select count(*)::int as n from public.job_files where job_id = $1`, [copy])).rows).toEqual([{ n: 1 }])
    expect((await q(`select count(*)::int as n from public.job_components where job_id = $1 and file_id = $2`, [copy, FILE])).rows[0]).toMatchObject({ n: 2 })
    expect((await q(`select count(*)::int as n from public.component_colors cc join public.job_components c on c.id = cc.component_id where c.job_id = $1`, [copy])).rows[0]).toMatchObject({ n: 1 })
  })
})
