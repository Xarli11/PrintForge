import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { extractThreeMfThumbnail } from '@/lib/threeMf'
import { defaultModelName, formatBytes, MAX_FILE_BYTES, storageKey, validateImageFile, validateModelFile } from './files'

describe('validación de archivos', () => {
  it('acepta .3mf y .stl (sin distinguir mayúsculas)', () => {
    expect(validateModelFile({ name: 'a.3mf', size: 10 })).toBeNull()
    expect(validateModelFile({ name: 'B.STL', size: 10 })).toBeNull()
  })
  it('rechaza otras extensiones y archivos vacíos', () => {
    expect(validateModelFile({ name: 'a.obj', size: 10 })).toMatch(/\.3mf y \.stl/)
    expect(validateModelFile({ name: 'sin-extension', size: 10 })).toMatch(/\.3mf y \.stl/)
    expect(validateModelFile({ name: 'a.stl', size: 0 })).toMatch(/vacío/)
  })
  it('error claro al superar 50 MB', () => {
    expect(validateModelFile({ name: 'grande.3mf', size: MAX_FILE_BYTES })).toBeNull()
    expect(validateModelFile({ name: 'grande.3mf', size: MAX_FILE_BYTES + 1 })).toMatch(/supera el límite de 50,0 MB/)
  })
  it('valida imágenes de portada', () => {
    expect(validateImageFile({ name: 'x.png', size: 100 })).toBeNull()
    expect(validateImageFile({ name: 'x.gif', size: 100 })).toMatch(/PNG, JPG o WebP/)
    expect(validateImageFile({ name: 'x.png', size: 6 * 1024 * 1024 })).toMatch(/máximo/)
  })
  it('utilidades', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5.5 * 1024 * 1024)).toBe('5,5 MB')
    expect(defaultModelName('Figura final v2.3mf')).toBe('Figura final v2')
    expect(storageKey('files', 'abc', '3mf')).toBe('files/abc.3mf')
  })
})

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const zip = (entries: Record<string, Uint8Array>) => new Blob([zipSync(entries) as BlobPart])

describe('miniaturas de 3MF', () => {
  it('extrae Metadata/plate_1.png de un 3MF de Bambu Studio', async () => {
    const t = await extractThreeMfThumbnail(
      zip({ '3D/3dmodel.model': strToU8('<model/>'), 'Metadata/plate_1.png': PNG, 'Metadata/plate_2.png': new Uint8Array([9]) }),
    )
    expect(t?.entry).toBe('Metadata/plate_1.png')
    expect(new Uint8Array(await t!.blob.arrayBuffer())).toEqual(PNG)
    expect(t!.blob.type).toBe('image/png')
  })
  it('usa la miniatura estándar si no hay placa de Bambu', async () => {
    const t = await extractThreeMfThumbnail(zip({ '3D/3dmodel.model': strToU8('<model/>'), 'Thumbnails/thumbnail.png': PNG }))
    expect(t?.entry).toBe('Thumbnails/thumbnail.png')
  })
  it('3MF sin miniatura → null (no se inventa nada)', async () => {
    expect(await extractThreeMfThumbnail(zip({ '3D/3dmodel.model': strToU8('<model/>') }))).toBeNull()
  })
  it('archivo que no es un zip → null sin lanzar', async () => {
    expect(await extractThreeMfThumbnail(new Blob(['solid cube\nendsolid']))).toBeNull()
    expect(await extractThreeMfThumbnail(new Blob([]))).toBeNull()
  })
})
