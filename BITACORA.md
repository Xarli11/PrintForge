# Bitácora

## 2026-11-04 · Fase 1
- Objetivo: núcleo funcional (auth, BD, trabajos, componentes, cálculos, progreso).
- Stack: Vite 8, React 19, TS 7, Tailwind 4, TanStack Query, zod, Supabase JS. HashRouter.
- Decisiones:
  - Un propietario: `private.app_owner` + `is_owner()`; RLS en todas las tablas; trigger bloquea segundo usuario en `auth.users`.
  - Contadores de producción solo modificables vía `production_log` (trigger SECURITY DEFINER + guarda con `pg_trigger_depth`).
  - Consumo de filamento solo en `component_colors` (por tanda) → sin duplicar; purga fija por tanda en el componente.
  - Planes calculados en cliente (volumen personal); caché invalidado entero tras cada mutación.
  - Tipos con snake_case de BD, sin capa de mapeo.
- Verificación: migraciones y RLS contra PGlite; e2e con Supabase simulado. Bug móvil real hallado y corregido (Badge nowrap desbordaba la tarjeta).
- No verificado aún contra un proyecto Supabase real (sin credenciales).
