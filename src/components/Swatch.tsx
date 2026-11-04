import type { Material } from '@/domain/types'

export function Swatch({ hex, className = 'size-3.5' }: { hex: string; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full border border-white/15 ${className}`} style={{ backgroundColor: hex }} />
}

export const materialLabel = (m: Pick<Material, 'type' | 'brand' | 'name'>) => [m.type, m.brand, m.name].filter(Boolean).join(' · ')
