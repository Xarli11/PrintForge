# PrintForge

Gestor personal de producción e impresión 3D. React + TypeScript + Vite + Tailwind v4, con Supabase (Auth, PostgreSQL, Storage) y despliegue en GitHub Pages. Uso privado: un único usuario autorizado.

## Estado
**En producción:** https://xarli11.github.io/PrintForge/ (GitHub Pages, despliegue por GitHub Actions). Las pantallas se abren con `#`, p. ej. `…/PrintForge/#/jobs`.

- **Fase 1** (núcleo): auth privada, trabajos, componentes, cálculos, progreso, dashboard, ajustes. Validada contra Supabase real.
- **Fase 2** (archivos y materiales): biblioteca de modelos 3MF/STL en Storage privado, miniaturas de 3MF, catálogo de materiales, colores y consumo por componente, costes por material. Validada contra Supabase real y sobre la web publicada (`node scripts/verify-real-files.mjs [url]`).
- Pendiente: calendario y filtros avanzados (fase 3); metadatos de laminado 3MF, previsualización STL, exportación JSON (fase 4). Ver `TODO.md`.

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
| `node scripts/verify-real.mjs` / `verify-real-files.mjs` | Verificación manual-asistida contra Supabase real (login a mano; crea y borra datos `[e2e]`) |
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

## Archivos y Storage
Bucket privado `printforge` (límite 50 MB, el máximo de Supabase Free). Los originales se guardan íntegros en `files/<uuid>.<ext>`; el nombre original vive en la base de datos y se restaura al descargar. Descarga mediante enlace firmado de 60 s; las miniaturas usan enlaces de 1 h. Políticas: sólo el propietario lee/escribe, y sólo en `files|thumbs|covers/<uuid>.(3mf|stl|png|jpg|webp)`.
Coherencia BD ↔ Storage: al subir se escribe el objeto y luego la fila (si la fila falla se borra el objeto); al borrar se elimina primero la fila y luego el objeto (si Storage falla queda un objeto huérfano sin datos asociados, nunca una fila rota).

## Limitaciones conocidas
- Tiempos y costes son estimaciones (ver «Modelo de cálculo»). El consumo de filamento se introduce a mano hasta la fase 4 (lectura de metadatos 3MF).
- La subida usa la API estándar de Storage: sin barra de progreso por archivo y sin reanudación (máx. 50 MB). Se suben de uno en uno.
- Las miniaturas de 3MF se extraen sólo si el archivo las incluye; un STL no tiene miniatura salvo que subas una imagen.
- Un objeto huérfano en Storage (fallo de red al borrar) no se limpia automáticamente.
- El script `verify-*` de Supabase real necesita al propietario delante (login manual).
