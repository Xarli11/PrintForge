import { Box } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Miniatura de un modelo o portada; sin imagen muestra un marcador neutro (nunca se inventa una vista). */
export function Thumb({ url, label, className }: { url?: string | null; label: string; className?: string }) {
  return (
    <div className={cn('grid shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-raised text-faint', className)}>
      {url ? <img src={url} alt={label} loading="lazy" className="size-full object-cover" /> : <Box className="size-1/2" aria-hidden />}
    </div>
  )
}
