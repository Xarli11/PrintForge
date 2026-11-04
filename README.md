# PrintForge

Gestor personal de producción e impresión 3D. React + TypeScript + Vite + Tailwind v4, con Supabase (Auth, PostgreSQL, Storage) y despliegue en GitHub Pages. Uso privado: un único usuario autorizado.

## Estado
Fase 1 (núcleo) completa: autenticación privada, trabajos, componentes, cálculos de tandas/tiempo, seguimiento de progreso, dashboard básico y ajustes. Pendiente: archivos y materiales (fase 2), calendario y filtros avanzados (fase 3), metadatos 3MF y previsualización (fase 4). Ver `TODO.md`.

## Desarrollo
```bash
npm install
cp .env.example .env.local   # rellena URL y clave anon de Supabase
npm run dev
```
| Comando | Qué hace |
|---|---|
| `npm test` | Vitest: cálculos, validaciones y migraciones/RLS sobre PostgreSQL real (PGlite) |
| `npm run test:e2e` | Playwright (escritorio + iPhone) con Supabase simulado en red |
| `npm run build` | Typecheck + build de producción |

## Arquitectura
- `src/domain`: lógica pura (cálculo de tandas, tiempos, costes, fechas, validación zod). Sin React ni red.
- `src/data`: acceso a Supabase (`api.ts`) y hooks TanStack Query (`hooks.ts`); los planes se calculan en cliente.
- `src/features/*`: pantallas por dominio. `src/components/ui`: primitivas del sistema visual (tokens en `src/index.css`).
- `supabase/migrations`: esquema, RLS y funciones. `supabase/tests`: pruebas de las migraciones.
- Enrutado con `HashRouter`: recargar cualquier pantalla funciona en GitHub Pages sin reglas de servidor.

## Seguridad
RLS en todas las tablas, política única `is_owner()` (UUID en `private.app_owner`), `anon` sin permisos, trigger que impide un segundo usuario, sin `service_role` en el frontend. Guía: [`docs/supabase-setup.md`](docs/supabase-setup.md).

## Despliegue (GitHub Pages)
1. Repo → *Settings → Pages → Source: GitHub Actions*.
2. Define las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Actions → Variables).
3. Push a `main`: el workflow ejecuta typecheck, tests unitarios y e2e, y solo entonces construye y publica.
`base` de Vite = `/PrintForge/` en producción (cambia `VITE_BASE` si el repo se llama distinto).

## Modelo de cálculo
`piezas = productos × piezas_por_producto` · `impresiones = ceil(piezas / capacidad_por_tanda)`. El tiempo es por **tanda**. Una última tanda parcial usa el tiempo de tanda completa (estimación conservadora, señalada) salvo que indiques el tiempo de la última. El material de pieza escala con las piezas; la purga es fija por tanda. Las fechas orientativas = minutos restantes / horas útiles por día; no son planificación exacta. Las piezas fallidas siguen contando como pendientes.

## Limitaciones conocidas
Ver `TODO.md`. Las cifras de tiempo/coste son estimaciones; el consumo de filamento y los archivos llegan en la fase 2.
