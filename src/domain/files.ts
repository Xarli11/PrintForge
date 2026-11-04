export const MAX_FILE_BYTES = 50 * 1024 * 1024 // límite por archivo de Supabase Free
export const MODEL_EXTENSIONS = ['3mf', 'stl'] as const
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export type ModelFormat = (typeof MODEL_EXTENSIONS)[number]

export interface ModelFile {
  id: string
  name: string
  file_name: string
  format: ModelFormat
  size_bytes: number
  storage_path: string
  thumbnail_path: string | null
  thumbnail_source: 'imported' | 'manual' | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export const extensionOf = (fileName: string) => fileName.split('.').pop()?.toLowerCase() ?? ''

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

/** Valida un modelo antes de subirlo. Devuelve un mensaje en español o null si es válido. */
export function validateModelFile(file: { name: string; size: number }): string | null {
  const ext = extensionOf(file.name)
  if (!(MODEL_EXTENSIONS as readonly string[]).includes(ext)) return `«${file.name}»: sólo se admiten archivos .3mf y .stl`
  if (file.size === 0) return `«${file.name}» está vacío`
  if (file.size > MAX_FILE_BYTES)
    return `«${file.name}» pesa ${formatBytes(file.size)} y supera el límite de ${formatBytes(MAX_FILE_BYTES)} de Supabase Free`
  return null
}

export function validateImageFile(file: { name: string; size: number }): string | null {
  if (!(IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) return 'La imagen debe ser PNG, JPG o WebP'
  if (file.size > MAX_IMAGE_BYTES) return `La imagen pesa ${formatBytes(file.size)}; el máximo es ${formatBytes(MAX_IMAGE_BYTES)}`
  return null
}

/** Nombre visible por defecto: el nombre del archivo sin extensión. */
export const defaultModelName = (fileName: string) => fileName.replace(/\.[^.]+$/, '').slice(0, 160) || fileName.slice(0, 160)

/** Claves de Storage: UUID + extensión (el nombre original vive en la base de datos). */
export const storageKey = (folder: 'files' | 'thumbs' | 'covers', id: string, ext: string) => `${folder}/${id}.${ext}`
