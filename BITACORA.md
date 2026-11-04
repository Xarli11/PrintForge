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

## 2026-11-04 · Fase 1 validada y Fase 2 (código)
- Fase 1 verificada contra Supabase real: login, CRUD, duplicar (RPC), archivar, cálculos, producción, persistencia; anónimo bloqueado (401 `42501`, signup 422).
- Push a `origin/master`; CI: tests y build OK, `deploy` 404 (Pages no habilitado, sin variables).
- Fase 2: migración 2 (model_files, job_files, `save_component` atómico, bucket privado + políticas por ruta/extensión). Probada en PGlite con privilegios por defecto desactivados.
- Decisiones: claves de Storage = UUID (el nombre original en BD); borrar = fila primero, objeto después; subir = objeto primero, fila después con compensación; miniatura 3MF vía fflate sólo si existe (`Metadata/plate_1.png`…); enlaces firmados (60 s descarga / 1 h miniaturas); materiales dentro de Ajustes.
- Bugs hallados por e2e móvil: la cabecera con 5 botones ensanchaba el layout (iOS hace zoom-out y el botón de guardar quedaba fuera de pantalla) y el contenido del diálogo no hacía scroll (`min-h-0`). Ambos corregidos y vigilados con `expectNoHorizontalOverflow`.
- e2e ahora contra el bundle de producción (`vite preview`) para evitar recargas por optimización de dependencias.
