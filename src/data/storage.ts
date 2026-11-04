import { supabase } from '@/lib/supabase'
import { extractThreeMfThumbnail } from '@/lib/threeMf'
import { defaultModelName, extensionOf, storageKey, validateImageFile, validateModelFile, type ModelFile, type ModelFormat } from '@/domain/files'

const BUCKET = 'printforge'
const MIME: Record<string, string> = { '3mf': 'model/3mf', stl: 'model/stl', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }

function storageMessage(e: { message: string }): string {
  if (/exceeded the maximum allowed size|too large|413/i.test(e.message)) return 'El archivo supera el tamaño máximo permitido por Supabase (50 MB)'
  if (/row-level security|unauthorized|403/i.test(e.message)) return 'No tienes permiso para escribir en el almacenamiento'
  if (/already exists|duplicate/i.test(e.message)) return 'Ya existe un archivo con esa ruta; vuelve a intentarlo'
  if (/bucket not found/i.test(e.message)) return 'No existe el bucket «printforge»: aplica la migración de archivos'
  return e.message
}

async function put(path: string, blob: Blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: MIME[extensionOf(path)], upsert: false })
  if (error) throw new Error(storageMessage(error))
}

/** Borrado de objetos «lo mejor posible»: devuelve las rutas que no se pudieron borrar (quedan huérfanas, sin datos asociados). */
async function removeObjects(paths: (string | null | undefined)[]): Promise<string[]> {
  const list = paths.filter((p): p is string => !!p)
  if (list.length === 0) return []
  const { error } = await supabase.storage.from(BUCKET).remove(list)
  return error ? list : []
}

async function dbError<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data as T
}

async function thumbFrom(file: Blob, format: ModelFormat) {
  if (format !== '3mf') return null
  return extractThreeMfThumbnail(file)
}

export interface UploadResult {
  model: ModelFile
  /** Mensajes no críticos (p. ej. la miniatura no se pudo subir). */
  warnings: string[]
}

/**
 * Sube un modelo íntegro (sin modificar) y crea su fila en la biblioteca.
 * Orden: objeto → fila. Si la fila falla, se borran los objetos subidos (compensación).
 */
export async function uploadModel(file: File): Promise<UploadResult> {
  const invalid = validateModelFile(file)
  if (invalid) throw new Error(invalid)
  const format = extensionOf(file.name) as ModelFormat
  const id = crypto.randomUUID()
  const path = storageKey('files', id, format)
  const warnings: string[] = []

  await put(path, file)
  let thumbPath: string | null = null
  try {
    const thumb = await thumbFrom(file, format)
    if (thumb) {
      thumbPath = storageKey('thumbs', id, 'png')
      await put(thumbPath, thumb.blob)
    }
  } catch {
    thumbPath = null
    warnings.push('No se pudo guardar la miniatura del 3MF; puedes añadir una imagen manualmente.')
  }

  try {
    const model = await dbError<ModelFile>(
      supabase
        .from('model_files')
        .insert({
          id, name: defaultModelName(file.name), file_name: file.name, format, size_bytes: file.size, storage_path: path,
          thumbnail_path: thumbPath, thumbnail_source: thumbPath ? 'imported' : null,
        })
        .select()
        .single(),
    )
    return { model, warnings }
  } catch (e) {
    await removeObjects([path, thumbPath])
    throw e
  }
}

/** Sustituye el archivo original de un modelo conservando su identidad (usos en trabajos y componentes). */
export async function replaceModelFile(model: ModelFile, file: File): Promise<{ model: ModelFile; orphans: string[] }> {
  const invalid = validateModelFile(file)
  if (invalid) throw new Error(invalid)
  const format = extensionOf(file.name) as ModelFormat
  const newId = crypto.randomUUID()
  const path = storageKey('files', newId, format)
  await put(path, file)

  let newThumb: string | null = null
  const keepManual = model.thumbnail_source === 'manual'
  if (!keepManual) {
    try {
      const t = await thumbFrom(file, format)
      if (t) {
        newThumb = storageKey('thumbs', newId, 'png')
        await put(newThumb, t.blob)
      }
    } catch {
      newThumb = null
    }
  }
  const patch: Record<string, unknown> = { file_name: file.name, format, size_bytes: file.size, storage_path: path }
  if (!keepManual) {
    patch.thumbnail_path = newThumb
    patch.thumbnail_source = newThumb ? 'imported' : null
  }
  try {
    const updated = await dbError<ModelFile>(supabase.from('model_files').update(patch).eq('id', model.id).select().single())
    const orphans = await removeObjects([model.storage_path, keepManual ? null : model.thumbnail_path])
    return { model: updated, orphans }
  } catch (e) {
    await removeObjects([path, newThumb])
    throw e
  }
}

export async function setModelThumbnail(model: ModelFile, image: File): Promise<ModelFile> {
  const invalid = validateImageFile(image)
  if (invalid) throw new Error(invalid)
  const ext = extensionOf(image.name) === 'jpeg' ? 'jpg' : extensionOf(image.name)
  const path = storageKey('thumbs', crypto.randomUUID(), ext)
  await put(path, image)
  try {
    const updated = await dbError<ModelFile>(
      supabase.from('model_files').update({ thumbnail_path: path, thumbnail_source: 'manual' }).eq('id', model.id).select().single(),
    )
    await removeObjects([model.thumbnail_path])
    return updated
  } catch (e) {
    await removeObjects([path])
    throw e
  }
}

export const renameModel = (id: string, name: string) =>
  dbError<ModelFile>(supabase.from('model_files').update({ name: name.trim() }).eq('id', id).select().single())

/** Borra primero la fila (si falla, no se pierde nada) y luego los objetos. Devuelve los objetos huérfanos si Storage falla. */
export async function deleteModel(model: ModelFile): Promise<string[]> {
  await dbError(supabase.from('model_files').delete().eq('id', model.id))
  return removeObjects([model.storage_path, model.thumbnail_path])
}

/** Sube una imagen de portada de trabajo y devuelve su ruta (el llamador la guarda en jobs.cover_path). */
export async function uploadCover(image: File): Promise<string> {
  const invalid = validateImageFile(image)
  if (invalid) throw new Error(invalid)
  const ext = extensionOf(image.name) === 'jpeg' ? 'jpg' : extensionOf(image.name)
  const path = storageKey('covers', crypto.randomUUID(), ext)
  await put(path, image)
  return path
}
export const removeCover = (path: string | null) => removeObjects([path])

/** URLs firmadas temporales (el bucket es privado). */
export async function signedUrls(paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresIn)
  if (error) throw new Error(storageMessage(error))
  const out: Record<string, string> = {}
  for (const item of data) if (item.path && item.signedUrl) out[item.path] = item.signedUrl
  return out
}

/**
 * Descarga el original con su nombre exacto. Se baja autenticado (sin enlace público) y se guarda desde un Blob:
 * el parámetro `download` de Supabase no decodifica el nombre (`[a] b.3mf` llegaría como `%5Ba%5D b.3mf`).
 */
export async function downloadModel(model: ModelFile): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).download(model.storage_path)
  if (error || !data) throw new Error(error ? storageMessage(error) : 'No se pudo descargar el archivo')
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = model.file_name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export { defaultModelName }
