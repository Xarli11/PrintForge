# TODO

## Hecho (Fase 1 · núcleo)
- Arquitectura, sistema visual, auth con comprobación de propietario, migración 1 con RLS (probada en PGlite)
- Trabajos CRUD + duplicar (RPC atómica) + archivar; componentes; cálculos; registro de producción; dashboard básico; ajustes
- Tests: 60 unitarios/BD, 4 e2e (escritorio + iPhone)

## Pendiente
- Fase 2: migración 2 (files + bucket privado + políticas storage), subida/descarga, biblioteca, catálogo de materiales, colores por componente (UI), costes en UI
- Fase 3: calendario, alertas, filtros por material/color/fecha, dashboard completo
- Fase 4: lectura 3MF (Bambu), previsualización STL, exportación JSON, pulido móvil, README despliegue final
- Antes de usar: crear proyecto Supabase, aplicar migraciones, registrar UUID (docs/supabase-setup.md), configurar variables en GitHub

## Próximo paso
Empezar fase 2 con la migración de archivos y Storage.
