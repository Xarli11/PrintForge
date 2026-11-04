export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="PrintForge">
      <rect width="64" height="64" rx="14" fill="var(--color-raised)" stroke="var(--color-line-strong)" />
      <g fill="none" stroke="var(--color-accent-fg)" strokeWidth="4" strokeLinejoin="round">
        <path d="M32 12 14 22v20l18 10 18-10V22L32 12Z" />
        <path d="M14 22l18 10 18-10M32 32v20" />
      </g>
    </svg>
  )
}
