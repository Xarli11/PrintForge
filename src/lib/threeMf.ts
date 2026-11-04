import { unzipSync } from 'fflate'

export interface ExtractedThumbnail {
  /** Nombre de la entrada dentro del 3MF, para trazabilidad. */
  entry: string
  blob: Blob
}

// Orden de preferencia: Bambu Studio guarda la placa renderizada en Metadata/plate_N.png;
// el estándar 3MF usa Metadata/thumbnail.png o Thumbnails/thumbnail.png.
const PREFERRED = [/^Metadata\/plate_1\.png$/i, /^Metadata\/top_1\.png$/i, /^Metadata\/thumbnail\.png$/i, /^Thumbnails\/thumbnail\.png$/i, /^Metadata\/plate_\d+\.png$/i]

/**
 * Extrae la miniatura de un 3MF si existe. Sólo descomprime la entrada elegida (no el modelo entero).
 * Devuelve null si el archivo no es un zip válido o no contiene miniatura: nunca se inventa una imagen.
 */
export async function extractThreeMfThumbnail(file: Blob): Promise<ExtractedThumbnail | null> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let chosen: string | null = null
    // 1.ª pasada: sólo directorio central (filter sin aceptar nada) para listar nombres.
    const names: string[] = []
    unzipSync(bytes, { filter: (f) => (names.push(f.name), false) })
    for (const re of PREFERRED) {
      chosen = names.find((n) => re.test(n)) ?? null
      if (chosen) break
    }
    if (!chosen) return null
    const files = unzipSync(bytes, { filter: (f) => f.name === chosen })
    const data = files[chosen]
    if (!data || data.length === 0) return null
    return { entry: chosen, blob: new Blob([data as BlobPart], { type: 'image/png' }) }
  } catch {
    return null
  }
}
